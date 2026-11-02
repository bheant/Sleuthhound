import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

describe("sha256Hex", () => {
  it("matches Node's SHA-256", () => {
    for (const text of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "Name=Northwind\u0000Postcode=E8 1AB", "€ and 🙂".repeat(40)]) {
      expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
    }
  });
});
