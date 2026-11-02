import { describe, expect, it } from "vitest";
import { matchParams, splitName, workEmailOf } from "./apollo";

describe("splitName", () => {
  it("takes the first and last words", () => {
    expect(splitName("Mary Anne Hood")).toEqual({ first: "Mary", last: "Hood" });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: "" });
  });
});

describe("matchParams", () => {
  it("prefers the domain and never asks for personal emails", () => {
    const p = matchParams({ name: "Mary Hood", domain: "www.hood.co.uk", organisation: "Hood Ltd" });
    expect(p.get("domain")).toBe("hood.co.uk");
    expect(p.has("organization_name")).toBe(false);
    expect(p.get("reveal_personal_emails")).toBe("false");
  });

  it("falls back to the company name without a domain", () => {
    const p = matchParams({ name: "Mary Hood", domain: null, organisation: "Hood Ltd" });
    expect(p.get("organization_name")).toBe("Hood Ltd");
  });
});

describe("workEmailOf", () => {
  it("returns a found work email", () => {
    expect(workEmailOf({ person: { email: "Mary@Hood.co.uk", email_status: "verified" } })).toBe("mary@hood.co.uk");
  });

  it("ignores locked, unavailable and missing emails", () => {
    expect(workEmailOf({ person: { email: "email_not_unlocked@hood.co.uk" } })).toBeNull();
    expect(workEmailOf({ person: { email: "mary@hood.co.uk", email_status: "unavailable" } })).toBeNull();
    expect(workEmailOf({ person: null })).toBeNull();
    expect(workEmailOf({})).toBeNull();
  });
});
