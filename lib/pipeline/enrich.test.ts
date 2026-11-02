import { describe, expect, it } from "vitest";
import type { CompanyProfile, Officer } from "@/lib/connectors/companies-house/types";
import { deadlineSignals, officerDrafts } from "./enrich";

const ALL = ["first_accounts_due", "overdue_filings", "share_allotments", "new_directors"] as const;

const profile = (accounts: CompanyProfile["accounts"], cs?: CompanyProfile["confirmation_statement"]): CompanyProfile => ({
  company_number: "16028763",
  company_name: "JVIBES LTD",
  accounts,
  confirmation_statement: cs,
});

describe("deadlineSignals", () => {
  it("gives a company with no accounts filed a first accounts deadline", () => {
    const [s] = deadlineSignals(profile({ next_due: "2027-07-31", next_made_up_to: "2026-10-31", overdue: false }), [...ALL]);
    expect(s).toMatchObject({ type: "first_accounts_due", title: "First accounts due", dueAt: "2027-07-31" });
  });

  it("gives one overdue signal, not a due one as well", () => {
    const out = deadlineSignals(profile({ next_due: "2026-07-19", next_made_up_to: "2025-10-31", overdue: true }), [...ALL]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "accounts_overdue", title: "First accounts overdue", weight: "high" });
  });

  it("adds an overdue confirmation statement", () => {
    const out = deadlineSignals(
      profile({ next_due: "2027-07-31", overdue: false, last_accounts: { made_up_to: "2025-10-31" } }, { next_due: "2026-09-26", overdue: true }),
      [...ALL],
    );
    expect(out.map((s) => s.type)).toEqual(["accounts_due", "confirmation_overdue"]);
  });

  it("respects the signals the source watches", () => {
    expect(deadlineSignals(profile({ next_due: "2026-07-19", overdue: true }), ["first_accounts_due"])[0].type).toBe(
      "first_accounts_due",
    );
    expect(deadlineSignals(profile({ next_due: "2027-07-31", overdue: false }), [])).toEqual([]);
  });
});

describe("officerDrafts", () => {
  const officer: Officer & Record<string, unknown> = {
    name: "ROHAN, Stephan Louis Yannick",
    officer_role: "director",
    appointed_on: "2025-03-01",
    date_of_birth: { month: 6, year: 1979 },
    nationality: "Mauritian",
    address: { address_line_1: "Northchurch Road" },
    links: { officer: { appointments: "/officers/mdZl24sqswbQweUzyUBj9IA4cmo/appointments" } },
  };

  it("keeps name, role, appointed date and officer ID only", () => {
    const d = officerDrafts([officer], "16039263", "2024-10-24", true);
    expect(d.people[0]).toEqual({
      ref: "officer-0",
      name: "Stephan Rohan",
      externalId: "mdZl24sqswbQweUzyUBj9IA4cmo",
      attributes: { role: "director", appointed_on: "2025-03-01" },
    });
    expect(JSON.stringify(d)).not.toMatch(/1979|Mauritian|Northchurch/);
    expect(d.links[0]).toMatchObject({ fromRef: "officer-0", toRef: "company", kind: "directs" });
  });

  it("notes a director who joined well after incorporation, and skips resigned officers", () => {
    const d = officerDrafts([officer, { name: "GONE, Ann", resigned_on: "2025-01-01" }], "16039263", "2024-10-24", true);
    expect(d.people).toHaveLength(1);
    expect(d.signals[0]).toMatchObject({ type: "new_director", title: "New director: Stephan Rohan" });
  });
});
