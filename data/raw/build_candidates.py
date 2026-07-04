import csv
import json
import os
import re

RAW_DIR = os.path.dirname(os.path.abspath(__file__))

SECTOR_FILES = {
    "Fintech": "Startup Failure (Finance and Insurance).csv",
    "Foodtech": "Startup Failure (Food and services).csv",
    "Healthtech": "Startup Failure (Health Care).csv",
    "Consumer Hardware": "Startup Failure (Manufactures).csv",
    "E-commerce/Retail": "Startup Failure (Retail Trade).csv",
    "_Information": "Startup Failures (Information Sector).csv",
}

TARGET_SECTORS = [
    "SaaS/Enterprise Software",
    "Fintech",
    "Healthtech",
    "Consumer Hardware",
    "E-commerce/Retail",
    "AI/ML",
    "Mobility/Transportation",
    "Foodtech",
    "Edtech",
    "Real Estate/Proptech",
]

# Manual cross-sector overrides: a handful of companies are genuinely
# transportation/real-estate businesses but were filed under a different
# sector's CSV (e.g. "Elio Motors" under Manufactures). Verified by reading
# their actual "What They Did" text before overriding.
CROSS_SECTOR_OVERRIDES = {
    "Elio Motors": "Mobility/Transportation",
    "Pearl Automation": "Mobility/Transportation",
    "Beepi": "Mobility/Transportation",
    "Carwoo": "Mobility/Transportation",
    "Money360": "Real Estate/Proptech",
}

# Keyword rules to split the broad "Information" sector CSV into
# SaaS/Enterprise Software, AI/ML, Mobility/Transportation, Edtech, Real Estate/Proptech
# NOTE: all keywords are matched with \b word boundaries, so short tokens like
# "ai" or "car" will NOT falsely match inside "chair" or "sharing".
INFO_KEYWORDS = {
    "AI/ML": [
        r"\bai\b", "artificial intelligence", "machine learning", "deep learning",
        "neural network", "algorithm", "computer vision", r"\bnlp\b", "chatbot",
        "predictive analytics", "predictive", "recommendation engine", "ai-powered", "ai productivity",
    ],
    "Edtech": [
        "education", "educational", "learning platform", "adaptive learning", "e-learning",
        r"\bstudent", "classroom", "coding lesson", "coding school", "online course",
        "kids' reading", "kids reading", "kids' storytelling", "tutor", r"\bedtech\b",
    ],
    "Mobility/Transportation": [
        "ride-hailing", "ride hailing", r"\bride\b", r"\bcar\b", "carpool", "transportation",
        "delivery app", "food delivery", "logistics", "scooter", "mobility",
        r"\bdriver", "fleet management", "shipping", "parking", "navigation app", "commute",
    ],
    "Real Estate/Proptech": [
        "real estate", "property listing", "rental listing", r"\bhousing\b", "apartment listing",
        "home buying", "mortgage", "landlord", r"\bproptech\b",
    ],
    "SaaS/Enterprise Software": [
        "saas", "enterprise software", r"\bb2b\b", r"\bcrm\b", "cloud software",
        "business intelligence", "workflow", "productivity tool", "collaboration platform",
        "project management", "developer toolkit", "api service", "hr software", "hiring software",
        "customer messaging", "analytics dashboard", "cloud collaboration", "identity tools",
    ],
}


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def richness(row):
    what = (row.get("What They Did") or "").strip()
    why = (row.get("Why They Failed") or "").strip()
    return len(what) + len(why)


def categorize_info_row(row):
    text = f"{row.get('What They Did','')} {row.get('Why They Failed','')}".lower()
    scores = {}
    for sector, kws in INFO_KEYWORDS.items():
        score = 0
        for kw in kws:
            pattern = kw if kw.startswith(r"\b") or "\\b" in kw else re.escape(kw)
            if re.search(pattern, text):
                score += 1
        if score > 0:
            scores[sector] = score
    if not scores:
        return None
    return max(scores, key=scores.get)


def load_big_startup_index():
    path = os.path.join(RAW_DIR, "big_startup_secsees_dataset.csv")
    idx = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("name") or "").strip().lower()
            if name and name not in idx:
                idx[name] = row
    return idx


def main():
    big_idx = load_big_startup_index()

    candidates_by_sector = {s: [] for s in TARGET_SECTORS}

    # Direct-mapped sector CSVs
    for sector, fname in SECTOR_FILES.items():
        if sector.startswith("_"):
            continue
        path = os.path.join(RAW_DIR, fname)
        rows = read_csv(path)
        for row in rows:
            what = (row.get("What They Did") or "").strip()
            why = (row.get("Why They Failed") or "").strip()
            if len(what) < 8 or len(why) < 8:
                continue  # too thin to ground a causal record
            name = row.get("Name", "").strip()
            target = CROSS_SECTOR_OVERRIDES.get(name, sector)
            row["_target_sector"] = target
            row["_source_file"] = fname
            candidates_by_sector[target].append(row)

    # Information sector -> split into 5 remaining target sectors
    info_path = os.path.join(RAW_DIR, SECTOR_FILES["_Information"])
    info_rows = read_csv(info_path)
    for row in info_rows:
        what = (row.get("What They Did") or "").strip()
        why = (row.get("Why They Failed") or "").strip()
        if len(what) < 8 or len(why) < 8:
            continue
        name = row.get("Name", "").strip()
        target = CROSS_SECTOR_OVERRIDES.get(name) or categorize_info_row(row)
        if target is None:
            continue
        row["_target_sector"] = target
        row["_source_file"] = SECTOR_FILES["_Information"]
        candidates_by_sector[target].append(row)

    # Rank by narrative richness, select top 10 per sector (or all if <10)
    selected = {}
    coverage_report = {}
    for sector in TARGET_SECTORS:
        rows = candidates_by_sector[sector]
        rows.sort(key=richness, reverse=True)
        top = rows[:10]
        selected[sector] = top
        coverage_report[sector] = {"available": len(rows), "selected": len(top)}

    # Cross-reference big_startup dataset for status/funding metadata where name matches
    output = []
    for sector, rows in selected.items():
        for row in rows:
            name = row.get("Name", "").strip()
            cross = big_idx.get(name.lower())
            entry = {
                "name": name,
                "target_sector": sector,
                "source_sector_label": row.get("Sector", ""),
                "years_of_operation": row.get("Years of Operation", ""),
                "what_they_did": row.get("What They Did", "").strip(),
                "how_much_raised": row.get("How Much They Raised", "").strip(),
                "why_they_failed": row.get("Why They Failed", "").strip(),
                "takeaway": row.get("Takeaway", "").strip(),
                "source_file": row.get("_source_file", ""),
                "crunchbase_cross_ref": None,
            }
            if cross:
                entry["crunchbase_cross_ref"] = {
                    "status": cross.get("status"),
                    "funding_total_usd": cross.get("funding_total_usd"),
                    "category_list": cross.get("category_list"),
                    "founded_at": cross.get("founded_at"),
                    "country_code": cross.get("country_code"),
                }
            output.append(entry)

    out_path = os.path.join(RAW_DIR, "..", "candidates.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    report_path = os.path.join(RAW_DIR, "..", "coverage_report.json")
    with open(report_path, "w") as f:
        json.dump(coverage_report, f, indent=2)

    print(f"Total candidates selected: {len(output)}")
    print(json.dumps(coverage_report, indent=2))


if __name__ == "__main__":
    main()
