import { describe, expect, it } from "vitest";
import { officerDisplayName, titleCaseCompanyName } from "@/lib/connectors/companies-house/names";
import { domainOf, formatPostcode, normaliseName, postcodeDistrict } from "./names";

describe("normaliseName", () => {
  it("lowercases and strips punctuation", () => {
    expect(normaliseName("Quill & Co. Studio")).toBe("quill and co studio");
  });

  it("reads & as and, as the register spells it", () => {
    expect(normaliseName("Bloom & Wild Ltd")).toBe(normaliseName("BLOOM AND WILD LIMITED"));
  });

  it("strips trailing suffixes, including several in a row", () => {
    expect(normaliseName("Northwind Labs Ltd")).toBe("northwind labs");
    expect(normaliseName("NORTHWIND LABS LIMITED")).toBe("northwind labs");
    expect(normaliseName("Harbour Metrics UK Ltd.")).toBe("harbour metrics");
    expect(normaliseName("Cobalt Freight LLP")).toBe("cobalt freight");
    expect(normaliseName("Orbital Print PLC")).toBe("orbital print");
  });

  it("keeps suffix words that aren't at the end", () => {
    expect(normaliseName("UK Power Networks Limited")).toBe("uk power networks");
    expect(normaliseName("Limited Edition Prints Ltd")).toBe("limited edition prints");
  });

  it("never strips a name down to nothing", () => {
    expect(normaliseName("UK Ltd")).toBe("uk");
  });

  it("folds accents and collapses spaces", () => {
    expect(normaliseName("  Café   Ñandú  Ltd ")).toBe("cafe nandu");
  });

  it("matches the same company written two ways", () => {
    expect(normaliseName("E&A CAFE LTD")).toBe(normaliseName("E & A Cafe Limited"));
  });
});

describe("postcodeDistrict", () => {
  it("returns the outward code", () => {
    expect(postcodeDistrict("N1 3NY")).toBe("N1");
    expect(postcodeDistrict("sw1a1aa")).toBe("SW1A");
    expect(postcodeDistrict("EC2A 4NE")).toBe("EC2A");
  });

  it("returns null for anything that isn't a postcode", () => {
    expect(postcodeDistrict("London")).toBeNull();
    expect(postcodeDistrict("")).toBeNull();
    expect(postcodeDistrict(undefined)).toBeNull();
  });

  it("formats a postcode with one space", () => {
    expect(formatPostcode("w60nb")).toBe("W6 0NB");
  });
});

describe("domainOf", () => {
  it("drops www and paths", () => {
    expect(domainOf("https://www.northwind.io/about")).toBe("northwind.io");
    expect(domainOf("northwind.io")).toBe("northwind.io");
    expect(domainOf("not a url")).toBeNull();
  });
});

describe("titleCaseCompanyName", () => {
  it("title cases capitals and keeps suffixes readable", () => {
    expect(titleCaseCompanyName("STENAP LTD")).toBe("Stenap Ltd");
    expect(titleCaseCompanyName("BENYON REAL ESTATE LIMITED")).toBe("Benyon Real Estate Limited");
    expect(titleCaseCompanyName("COBALT FREIGHT LLP")).toBe("Cobalt Freight LLP");
  });

  it("keeps &, short forms and words with digits", () => {
    expect(titleCaseCompanyName("E&A CAFE LTD")).toBe("E&A Cafe Ltd");
    expect(titleCaseCompanyName("QUILL & CO STUDIO LTD")).toBe("Quill & Co Studio Ltd");
    expect(titleCaseCompanyName("SMA807 LTD")).toBe("SMA807 Ltd");
    expect(titleCaseCompanyName("ACME AI (UK) LTD")).toBe("Acme AI (UK) Ltd");
  });

  it("lowercases small joining words after the first", () => {
    expect(titleCaseCompanyName("THE HOUSE OF TEA LTD")).toBe("The House of Tea Ltd");
  });

  it("handles hyphens and O' names", () => {
    expect(titleCaseCompanyName("O'BRIEN SMITH-JONES LTD")).toBe("O'Brien Smith-Jones Ltd");
  });

  it("leaves mixed-case names alone", () => {
    expect(titleCaseCompanyName("Northwind Labs Ltd")).toBe("Northwind Labs Ltd");
  });

  it("shows officer names as first name and surname", () => {
    expect(officerDisplayName("ROHAN, Stephan Louis Yannick")).toBe("Stephan Rohan");
    expect(officerDisplayName("MENSAH, DAVID")).toBe("David Mensah");
  });
});
