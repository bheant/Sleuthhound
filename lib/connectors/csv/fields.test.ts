import { describe, expect, it } from "vitest";
import { cleanCompanyNumber, cleanRow, parseLooseDate } from "./fields";

describe("cleanCompanyNumber", () => {
  it("pads short numbers and keeps prefixed ones", () => {
    expect(cleanCompanyNumber("123456")).toBe("00123456");
    expect(cleanCompanyNumber("sc 123456")).toBe("SC123456");
    expect(cleanCompanyNumber("14820117")).toBe("14820117");
  });
  it("refuses what can't be a company number", () => {
    expect(cleanCompanyNumber("1234567890")).toBeNull();
    expect(cleanCompanyNumber("ABC")).toBeNull();
    expect(cleanCompanyNumber("")).toBeNull();
  });
});

describe("parseLooseDate", () => {
  it("reads the usual UK spreadsheet dates", () => {
    expect(parseLooseDate("2026-10-02")).toBe("2026-10-02");
    expect(parseLooseDate("02/10/2026")).toBe("2026-10-02");
    expect(parseLooseDate("2 Oct 2026")).toBe("2026-10-02");
    expect(parseLooseDate("Jan 2026")).toBe("2026-01-01");
    expect(parseLooseDate("03/2026")).toBe("2026-03-01");
  });
  it("refuses impossible dates", () => {
    expect(parseLooseDate("31/02/2026")).toBeNull();
    expect(parseLooseDate("soon")).toBeNull();
  });
});

describe("cleanRow", () => {
  const mapping = { Company: "Target name", "Co. number": "Company number", Website: "Website" } as const;
  it("cleans a good row", () => {
    const { row, problem } = cleanRow({ Company: "Tidewater Studio Ltd", "Co. number": "14820117", Website: "tidewater.studio" }, mapping);
    expect(problem).toBeNull();
    expect(row.domain).toBe("tidewater.studio");
    expect(row.website).toBe("https://tidewater.studio");
  });
  it("flags rows with no name or a bad number", () => {
    expect(cleanRow({ Company: "", "Co. number": "1", Website: "" }, mapping).problem).toBe("No name");
    expect(cleanRow({ Company: "X Ltd", "Co. number": "nope", Website: "" }, mapping).problem).toBe("Company number isn’t valid");
  });
});
