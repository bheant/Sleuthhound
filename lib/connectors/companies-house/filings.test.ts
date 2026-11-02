import { describe, expect, it } from "vitest";
import { filingSignals, fundingRounds, skipReason } from "./filings";
import type { FilingHistoryItem } from "./types";

// Shapes copied from real filing history responses (20 October 2026).
const sh01 = (id: string, date: string, figure = "200"): FilingHistoryItem => ({
  transaction_id: id,
  type: "SH01",
  date,
  category: "capital",
  description: "capital-allotment-shares",
  description_values: { date, capital: [{ currency: "GBP", figure }] },
  action_date: date,
});
const resolutions = (id: string, date: string, entries: FilingHistoryItem["resolutions"]): FilingHistoryItem => ({
  transaction_id: id,
  type: "RESOLUTIONS",
  date,
  category: "resolution",
  resolutions: entries,
  description: "resolution",
});
const adopt = { category: "incorporation", description: "resolution-adopt-articles", type: "RES01" };
const vary = { category: "capital", description: "resolution-varying-share-rights", type: "RES12" };

const types = (items: FilingHistoryItem[], incorporatedOn = "2025-01-10") => filingSignals(items, "16591404", incorporatedOn).map((s) => s.type);

describe("filingSignals", () => {
  it("turns an allotment into a high-weight signal with the capital in its title and a filing link", () => {
    const [s] = filingSignals([sh01("MzQ3", "2025-07-18")], "16591127", "2025-01-10");
    expect(s).toMatchObject({ type: "share_allotment", weight: "high", title: "Shares allotted on 18 Jul 2025, capital now £200", externalId: "ch:filing:MzQ3" });
    expect(s.url).toBe("https://find-and-update.company-information.service.gov.uk/company/16591127/filing-history/MzQ3/document?format=pdf&download=0");
    expect(s.attributes).toEqual({ capital: [{ currency: "GBP", figure: "200" }] });
  });

  it("reads new articles and share changes from one resolutions filing as two signals", () => {
    const out = filingSignals([resolutions("WUVX", "2026-03-04", [vary, adopt])], "16591404", "2025-07-01");
    expect(out.map((s) => [s.type, s.externalId])).toEqual([
      ["new_articles", "ch:filing:WUVX:articles"],
      ["share_restructure", "ch:filing:WUVX:shares"],
    ]);
  });

  it("ignores articles adopted while the company was being set up", () => {
    expect(types([resolutions("A", "2025-01-15", [adopt])], "2025-01-10")).toEqual([]);
    expect(types([{ transaction_id: "M", type: "MA", date: "2026-03-04", category: "incorporation", description: "memorandum-articles" }])).toEqual(["new_articles"]);
  });

  it("tells a parent company from an investor by when it was notified", () => {
    const psc = (date: string): FilingHistoryItem => ({
      transaction_id: `P${date}`,
      type: "PSC02",
      date,
      category: "persons-with-significant-control",
      description: "notification-of-a-person-with-significant-control",
      description_values: { psc_name: "Spring4 Holdings Limited", notification_date: date },
    });
    const parent = filingSignals([psc("2024-10-25")], "16030712", "2024-10-24")[0];
    expect(parent).toMatchObject({ type: "parent_company", weight: "low" });
    const investor = filingSignals([psc("2026-02-01")], "16030712", "2024-10-24")[0];
    expect(investor).toMatchObject({ type: "corporate_shareholder", title: "Spring4 Holdings Limited became a shareholder with significant control" });
  });

  it("drops a strike-off notice that a later filing stopped", () => {
    const gaz = { transaction_id: "G", type: "GAZ1", date: "2026-05-05", category: "gazette", description: "gazette-notice-compulsory" };
    const diss = { transaction_id: "D", type: "DISS40", date: "2026-05-07", category: "gazette", description: "gazette-filings-brought-up-to-date" };
    expect(types([gaz])).toEqual(["strike_off_notice"]);
    expect(types([gaz, diss])).toEqual([]);
  });

  it("skips an office move that kept the same postcode", () => {
    const ad01 = (oldAddress: string): FilingHistoryItem => ({
      transaction_id: "AD",
      type: "AD01",
      date: "2025-01-06",
      category: "address",
      description: "change-registered-office-address-company-with-date-old-address-new-address",
      description_values: { change_date: "2025-01-06", old_address: oldAddress, new_address: "10 Lower Thames Street London EC3R 6AF" },
    });
    expect(types([ad01("10 Lower Thames Street London EC3R 6AF England")])).toEqual([]);
    const moved = filingSignals([ad01("71-75 Shelton Street London WC2H 9JQ United Kingdom")], "1", null)[0];
    expect(moved.attributes).toMatchObject({ old_postcode: "WC2H 9JQ", from_formation_agent: true });
  });
});

describe("fundingRounds", () => {
  const allot = { type: "share_allotment", occurredAt: "2026-09-03", title: "Shares allotted on 3 Sep 2026", url: "u1", externalId: "ch:filing:A" };

  it("infers a round when articles, share changes, a corporate shareholder or a new director come within 90 days", () => {
    const [round] = fundingRounds([allot, { type: "new_articles", occurredAt: "2026-08-20", title: "New articles adopted on 20 Aug 2026", url: "u2" }]);
    expect(round).toMatchObject({ type: "funding_round", weight: "high", occurredAt: "2026-09-03", externalId: "ch:funding:ch:filing:A" });
    expect(round.title).toBe("Likely funding round, Sep 2026 (inferred): shares allotted, new articles adopted");
    expect(round.attributes?.basis).toEqual([
      { title: "Shares allotted on 3 Sep 2026", url: "u1" },
      { title: "New articles adopted on 20 Aug 2026", url: "u2" },
    ]);
  });

  it("needs support close in time, and makes one round per allotment date", () => {
    expect(fundingRounds([allot, { type: "new_director", occurredAt: "2026-01-01", title: "New director" }])).toEqual([]);
    const twin = { ...allot, externalId: "ch:filing:B" };
    expect(fundingRounds([allot, twin, { type: "new_director", occurredAt: "2026-09-10", title: "New director: Ann Lee" }])).toHaveLength(1);
  });
});

describe("skipReason", () => {
  it("skips companies that aren't active, are being struck off or filed dormant accounts last", () => {
    expect(skipReason("dissolved", [], [])).toMatchObject({ reason: "not_active" });
    expect(skipReason("active", [{ type: "strike_off_notice", occurredAt: "2026-10-04", title: "Proposed for strike-off on 4 Oct 2026" }], [])).toEqual({
      reason: "strike_off",
      text: "proposed for strike-off on 4 Oct 2026",
    });
    const aa = (date: string, description: string): FilingHistoryItem => ({
      transaction_id: date,
      type: "AA",
      date,
      category: "accounts",
      description,
      description_values: { made_up_date: "2025-10-31" },
    });
    expect(skipReason("active", [], [aa("2026-07-31", "accounts-with-accounts-type-dormant")])?.reason).toBe("dormant");
    expect(skipReason("active", [], [aa("2025-07-31", "accounts-with-accounts-type-dormant"), aa("2026-07-31", "accounts-with-accounts-type-micro-entity")])).toBeNull();
  });
});

describe("founder shares", () => {
  const articles = (date: string) => resolutions(`R${date}`, date, [adopt]);

  it("reads an allotment within 60 days of incorporation as founder shares, never funding", () => {
    const out = filingSignals([sh01("F", "2025-02-20"), articles("2025-02-25")], "16591404", "2025-01-10");
    expect(out.map((x) => x.type)).toEqual(["founder_shares", "new_articles"]);
    expect(out[0]).toMatchObject({ weight: "low", title: "Founder shares allotted on 20 Feb 2025, capital now £200", externalId: "ch:filing:F" });
  });

  it("counts an allotment from day 61 as a share allotment that can make a funding round", () => {
    const out = filingSignals([sh01("A", "2025-03-12"), articles("2025-03-20")], "16591404", "2025-01-10");
    expect(out.map((x) => x.type)).toEqual(["share_allotment", "new_articles", "funding_round"]);
  });
});

describe("vehicles", () => {
  it("get no share allotments or funding rounds, but keep their other filing signals", () => {
    const items = [sh01("A", "2025-03-12"), resolutions("R", "2025-03-20", [adopt])];
    const out = filingSignals(items, "16029440", "2025-01-10", [], { vehicle: true });
    expect(out.map((x) => x.type)).toEqual(["new_articles"]);
  });
});
