export interface GraveyardEntry {
  id: number;
  name: string;
  yearRange: string;
  description: string;
  category: string;
  tags: string[];
  failureReason: string;
  keyMetrics?: string;
  sector: string;
}

export const GRAVEYARD: GraveyardEntry[] = [
  {
    id: 1,
    name: "Google Glass",
    yearRange: "2012–2015",
    description: "Pioneered consumer AR wearables but failed on privacy, no killer use case, and a $1,500 price tag that alienated early adopters before the product was ready.",
    category: "technology",
    sector: "Consumer Hardware",
    tags: ["Hardware", "AR", "Google", "Wearables"],
    failureReason: "No compelling use case + privacy backlash + wrong price point",
    keyMetrics: "~$1,500 retail price · <10k units sold to Explorers",
  },
  {
    id: 2,
    name: "Vine",
    yearRange: "2012–2017",
    description: "Invented short-form video but Twitter refused to pay creators. Musical.ly/TikTok offered monetization, Vine didn't — 200M users walked out the door.",
    category: "technology",
    sector: "Social",
    tags: ["Social Media", "Video", "Twitter"],
    failureReason: "Failed to monetize creators while competitors stepped in",
    keyMetrics: "200M users lost · $0 creator monetization",
  },
  {
    id: 3,
    name: "WeWork",
    yearRange: "2010–2019",
    description: "A real estate company wearing a tech company's clothes. $47B valuation collapsed after IPO filing exposed $900M losses, 20-year leases, and governance that would make Enron blush.",
    category: "finance",
    sector: "Real Estate / Tech",
    tags: ["Real Estate", "Coworking", "SoftBank", "Fraud"],
    failureReason: "Unsustainable unit economics + fraudulent governance exposed at IPO",
    keyMetrics: "$47B → $2.9B valuation in 90 days · $900M net loss 2018",
  },
  {
    id: 4,
    name: "Theranos",
    yearRange: "2003–2018",
    description: "Elizabeth Holmes raised $700M claiming a single drop of blood could run 240 tests. The core technology never worked. The company ran tests on standard Siemens machines while lying to investors, patients, and regulators.",
    category: "health",
    sector: "Healthtech",
    tags: ["Health", "Fraud", "Silicon Valley", "Biotech"],
    failureReason: "Fundamental technology fraud — core product was a lie from inception",
    keyMetrics: "$9B peak valuation · $700M raised · Holmes sentenced to 11.25 years",
  },
  {
    id: 5,
    name: "Quibi",
    yearRange: "2020",
    description: "Jeffrey Katzenberg and Meg Whitman raised $1.75B to stream premium shows in 10-minute increments, mobile-only, during a pandemic. No casting to TV, no sharing, no social layer. Shut down in 6 months.",
    category: "technology",
    sector: "Streaming / Media",
    tags: ["Streaming", "Mobile", "Video", "Media"],
    failureReason: "Product-market mismatch + COVID timing + mobile-only killed sharing",
    keyMetrics: "$1.75B raised · 500k subscribers · 6 months to shutdown",
  },
  {
    id: 6,
    name: "MoviePass",
    yearRange: "2011–2020",
    description: "Offered unlimited movie tickets for $9.95/month when average ticket cost $12. Acquired 3M subscribers fast. Lost $40 per subscriber per month, ran out of cash, and debit cards started declining mid-movie.",
    category: "markets",
    sector: "Subscription / Consumer",
    tags: ["Subscription", "Entertainment", "Burn Rate"],
    failureReason: "Unit economics were mathematically impossible from the first pricing decision",
    keyMetrics: "3M subscribers · $40/mo loss per user · $1.5B raised and burned",
  },
  {
    id: 7,
    name: "Webvan",
    yearRange: "1999–2001",
    description: "Grocery delivery before anyone had smartphones, DSL, or habits. Raised $375M, built $1B in warehouse infrastructure for markets that didn't exist yet. Filed the largest dot-com bankruptcy.",
    category: "markets",
    sector: "Dot-com / Grocery Delivery",
    tags: ["Dot-com", "Logistics", "Grocery", "E-commerce"],
    failureReason: "10 years too early — infrastructure built for demand that didn't exist yet",
    keyMetrics: "$375M raised · $830M warehouse buildout · $830M in losses",
  },
  {
    id: 8,
    name: "Pets.com",
    yearRange: "1998–2000",
    description: "Spent $11.8M on Super Bowl ads before it had unit economics. Sold $45 dog food for $35 and charged $12 to ship it. The mascot was famous; the business was insolvent.",
    category: "markets",
    sector: "Dot-com / E-commerce",
    tags: ["E-commerce", "Dot-com", "Pets", "Marketing"],
    failureReason: "Negative gross margins + growth-at-all-costs with no path to profitability",
    keyMetrics: "$290M IPO · 9 months to bankruptcy · $147M in losses",
  },
  {
    id: 9,
    name: "FTX",
    yearRange: "2019–2022",
    description: "Sam Bankman-Fried's $32B empire collapsed in 72 hours when CoinDesk revealed Alameda Research's balance sheet was 40% FTT tokens — FTX's own currency. Customer deposits had been quietly lent to Alameda to trade.",
    category: "finance",
    sector: "Crypto",
    tags: ["Crypto", "SBF", "Fraud", "Exchanges"],
    failureReason: "Customer deposits commingled with trading arm — $8B in misappropriated funds",
    keyMetrics: "$32B peak valuation · $8B customer funds missing · SBF sentenced to 25 years",
  },
  {
    id: 10,
    name: "Juicero",
    yearRange: "2013–2017",
    description: "A $400 Wi-Fi-connected juice press that required proprietary $8 packets. Bloomberg reporters revealed the packets could be squeezed by hand. The machine was solving a problem that didn't exist.",
    category: "technology",
    sector: "Consumer Hardware",
    tags: ["Hardware", "D2C", "Silicon Valley", "Food"],
    failureReason: "Solution looking for a problem — product eliminated by a human hand",
    keyMetrics: "$120M raised · $400 device price · shutdown within weeks of Bloomberg exposé",
  },
];
