import { describe, expect, it } from "vitest";
import { clip, toLookalikes, toReview, toTradingCheck, type ReviewDraft } from "./schemas";

const draft = (over: Partial<ReviewDraft> = {}): ReviewDraft => ({
  score_workings: "60-79: 64, +8 funding = 72",
  score: 72.4,
  summary: "Agency like Brightside, no CFO",
  what_they_do: "Brand and product design studio for early-stage startups.",
  why_fit: "Agency billing startups on retainers.",
  why_now: "First accounts due 14 May 2027.",
  website: null,
  suggested_reply: null,
  possible_company_name: null,
  sources: [],
  ...over,
});

const seen = new Set(["https://northwind.io/about", "https://find-and-update.company-information.service.gov.uk/company/1"]);

describe("toReview", () => {
  it("keeps only URLs the review was given or found", () => {
    const r = toReview(draft({ sources: ["https://northwind.io/about", "https://invented.example/press", "not a url"] }), seen);
    expect(r.sources).toEqual(["https://northwind.io/about"]);
  });

  it("keeps a website only when research found that site", () => {
    expect(toReview(draft({ website: "https://www.northwind.io" }), seen).website).toBe("https://www.northwind.io");
    expect(toReview(draft({ website: "https://made-up.io" }), seen).website).toBeNull();
  });

  it("rounds the score and clips long text to the schema's limits", () => {
    const r = toReview(draft({ summary: "word ".repeat(60) }), seen);
    expect(r.score).toBe(72);
    expect(r.summary.length).toBeLessThanOrEqual(140);
    expect(r.summary.endsWith("…")).toBe(true);
  });

  it("turns empty optional text into null", () => {
    expect(toReview(draft({ why_now: "  " }), seen).why_now).toBeNull();
  });
});

describe("clip", () => {
  it("leaves short text alone and cuts long text at a word", () => {
    expect(clip("First accounts due May", 140)).toBe("First accounts due May");
    expect(clip("one two three four five", 12)).toBe("one two…");
  });
});

describe("toLookalikes", () => {
  it("keeps up to 5 named suggestions, each once", () => {
    const companies = [
      { name: " Northwind  Labs Ltd ", reason: "Invoicing software, a year old" },
      { name: "northwind labs ltd", reason: "Duplicate" },
      { name: "", reason: "No name" },
      ...["A", "B", "C", "D", "E"].map((n) => ({ name: `${n}${n} Ltd`, reason: "Similar" })),
    ];
    const out = toLookalikes({ companies });
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ name: "Northwind Labs Ltd", reason: "Invoicing software, a year old" });
    expect(out.map((x) => x.name)).not.toContain("northwind labs ltd");
  });
});

describe("toTradingCheck", () => {
  const allowed = new Set(["https://deskmats.co.uk/shop", "https://www.example.com/listing"]);

  it("keeps a website and sources the search found", () => {
    const check = toTradingCheck(
      { website: "https://deskmats.co.uk", trading: "yes", evidence: "Online shop selling desk mats, prices listed", sources: ["https://deskmats.co.uk/shop", "https://made.up/page"] },
      allowed,
    );
    expect(check).toEqual({ website: "https://deskmats.co.uk", trading: "yes", evidence: "Online shop selling desk mats, prices listed", sources: ["https://deskmats.co.uk/shop"] });
  });

  it("turns a claim with nothing behind it into unclear", () => {
    const check = toTradingCheck({ website: "https://invented.io", trading: "yes", evidence: "Sells things", sources: ["https://invented.io"] }, allowed);
    expect(check).toMatchObject({ website: null, trading: "unclear", sources: [] });
  });
});
