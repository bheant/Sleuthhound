import { describe, expect, it } from "vitest";
import { aClientOf, cleanBusinessName, clientLabel, clientsOf, firmIntro, firmsPossessive, possessive, salesOf } from "./name";

describe("business name", () => {
  it("makes possessives, with only an apostrophe after a final s", () => {
    expect(possessive("Acme")).toBe("Acme’s");
    expect(possessive("Jones")).toBe("Jones’");
    expect(possessive("ACME BROS")).toBe("ACME BROS’");
    expect(possessive("Fox & Box")).toBe("Fox & Box’s");
    expect(possessive("Jones", "'")).toBe("Jones'");
  });

  it("falls back to neutral copy without a name", () => {
    expect(clientsOf("Acme")).toBe("Acme’s clients");
    expect(clientsOf(null)).toBe("your clients");
    expect(salesOf("Jones")).toBe("Jones’ sales");
    expect(salesOf(null)).toBe("your sales");
    expect(clientLabel(null)).toBe("Your client");
    expect(aClientOf("Acme")).toBe("a client of Acme");
    expect(aClientOf(null)).toBe("one of your clients");
    expect(firmIntro(null)).toBe("a UK accounting firm");
    expect(firmsPossessive("Jones")).toBe("Jones'");
    expect(firmsPossessive(null)).toBe("the firm's");
  });

  it("cleans what's typed", () => {
    expect(cleanBusinessName("  Acme   Accounting ")).toBe("Acme Accounting");
    expect(cleanBusinessName("   ")).toBeNull();
    expect(cleanBusinessName(null)).toBeNull();
    expect(cleanBusinessName("x".repeat(200))).toHaveLength(80);
  });
});
