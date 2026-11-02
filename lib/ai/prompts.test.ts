import { describe, expect, it } from "vitest";
import { knownFormationAgent } from "@/lib/ontology/formation-agents";
import { reviewPrompt, type ReviewSubject } from "./prompts";

const subject = (facts: ReviewSubject["facts"]): ReviewSubject => ({
  kind: "company",
  name: "Banderis Consulting Ltd",
  companyNumber: "16030000",
  companyType: "ltd",
  status: "active",
  incorporatedOn: "2025-03-01",
  industries: ["62020 Information technology consultancy activities"],
  address: "71-75 Shelton Street, Covent Garden, London, WC2H 9JQ",
  borough: "Camden",
  sourceUrl: null,
  body: null,
  officers: [{ name: "Ann Lee", role: "director", appointedOn: "2025-03-01", otherCompanies: ["Lee Labs Ltd"] }],
  signals: [],
  trading: null,
  facts,
});

const prompt = (facts: ReviewSubject["facts"]) =>
  reviewPrompt({ today: "2026-10-19", idealClient: "x", subject: subject(facts), similarClients: [], discarded: [], kept: [], research: null });

describe("register facts", () => {
  it("knows formation agent postcodes however they're written", () => {
    expect(knownFormationAgent("wc2h9jq")).toBe("71-75 Shelton Street, Covent Garden");
    expect(knownFormationAgent("E6 1EW")).toBeNull();
  });

  it("lists the facts that move a score", () => {
    const text = prompt({ formationAgent: "71-75 Shelton Street, Covent Garden", companiesAtAddress: 4, directors: 1, lastAccountsType: "dormant" });
    expect(text).toContain("known formation agent or virtual office address");
    expect(text).toContain("shared by 5 companies in all");
    expect(text).toContain("Sole director");
    expect(text).toContain("Last accounts filed: dormant");
    expect(text).toContain("also directs Lee Labs Ltd (active)");
  });

  it("says no accounts are filed only when the profile shows it", () => {
    expect(prompt({ formationAgent: null, companiesAtAddress: 0, directors: 2, lastAccountsType: "none" })).toContain("No accounts filed yet");
    expect(prompt({ formationAgent: null, companiesAtAddress: 0, directors: 2, lastAccountsType: null })).not.toContain("accounts filed");
  });
});

describe("what the GTM person decided", () => {
  it("passes the user's reasons and keeps, and says not to name them", () => {
    const text = reviewPrompt({
      today: "2026-10-19",
      idealClient: "x",
      subject: subject(null),
      similarClients: [],
      discarded: [{ name: "Shell Co Ltd", reason: "not trading" }, { name: "Quiet Ltd", reason: "no reason given" }],
      kept: [{ name: "Funded Labs Ltd", summary: "Raised a seed round in September" }],
      research: null,
    });
    expect(text).toContain("- Shell Co Ltd: not trading");
    expect(text).toContain("- Quiet Ltd: no reason given");
    expect(text).toContain("Leads the GTM person kept:\n- Funded Labs Ltd: Raised a seed round in September");
    expect(text).toContain("Never name any company from these lists");
  });
});
