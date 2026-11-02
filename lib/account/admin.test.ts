import { describe, expect, it } from "vitest";
import { usersCsv, type AdminUser } from "./admin";

const user = (over: Partial<AdminUser>): AdminUser => ({
  id: "1",
  name: "Sam",
  email: "sam@example.com",
  company: "Northwind",
  role: "user",
  disabled: false,
  createdAt: "2026-10-01T09:00:00.000Z",
  lastSeenAt: null,
  loginCount: 3,
  country: "GB",
  resetPending: false,
  ...over,
});

describe("usersCsv", () => {
  it("quotes cells, escapes quotes and defuses formulas", () => {
    const csv = usersCsv([user({ name: 'Sam "the" Fox', company: "=HYPERLINK(\"x\")" })]);
    const [head, row] = csv.trim().split("\r\n");
    expect(head).toBe('"Name","Email","Company","Role","Disabled","Signed up","Last seen","Logins","Country"');
    expect(row).toContain('"Sam ""the"" Fox"');
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain('"3","GB"');
  });
});
