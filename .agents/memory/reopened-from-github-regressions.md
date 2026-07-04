---
name: Reopened-from-GitHub regressions
description: Common failure patterns when a Replit project is reopened from a GitHub-synced repo — DB state loss and CSS var placeholder reverts.
---

When a project is reopened from GitHub (or restored from a git snapshot that predates the working DB state), two classes of "regression" tend to appear that are not code bugs:

1. **Database tables come back empty.** Features that read from the DB (feeds, chat that needs an entity to exist, dashboards) will look broken — "module missing", "chat won't start", 404s on entity lookups — but the actual code path is fine. Diagnose by curling the relevant API endpoints directly and checking for `[]` / empty results before touching frontend or route code. Fix by seeding from any static/reference data still present in the repo (e.g. a hardcoded array that the UI used before it was wired to the DB).

2. **CSS theme variables can revert to literal placeholder values** (e.g. a var literally set to `red` instead of a real color) if a `.env`-like config or generated CSS file wasn't tracked by git the same way as source. Check both `:root` and any theme-override blocks (like `.dark`) — a component tree that always applies one class (e.g. always dark mode) will only visibly break from whichever block is actually active, so both must be checked even if only one appears broken in a screenshot.

**Why:** In one case, "Line module missing from UI" and "chatbot not functioning as real chat" were both fully explained by empty `events`/`companies` tables, not by any component or route code being wrong. Wasted early time was on assuming the bug was in route/frontend logic instead of checking the API response body first.

**How to apply:** When debugging "worked before, broken after reopening from GitHub", check in this order: (a) does the API return real data for the affected feature, (b) do CSS root/theme override blocks have real values instead of placeholders, before diving into component logic.
