import { describe, expect, it } from "vitest";
import { ageText, bodyOf, mentions, plainText, titleOf } from "./text";

describe("plainText", () => {
  it("turns Hacker News HTML into plain text", () => {
    expect(plainText("I don&#x27;t know<p>Second &amp; last <a href=\"x\">link</a>")).toBe("I don't know\n\nSecond & last link");
  });
  it("copes with nothing", () => {
    expect(plainText(null)).toBe("");
  });
});

describe("mentions", () => {
  it("matches whole words only", () => {
    expect(mentions("Looking for an accountant in London", "accountant")).toBe(true);
    expect(mentions("we hold people accountable", "accountant")).toBe(false);
  });
  it("matches phrases across extra spaces and case", () => {
    expect(mentions("Running a UK  Limited Company is hard", "UK limited company")).toBe(true);
  });
});

describe("titleOf", () => {
  const base = { objectID: "1", created_at: "2026-10-19T10:00:00Z", created_at_i: 0, author: "a" };
  it("uses a story's title", () => {
    expect(titleOf({ ...base, title: "Ask HN: Accountant for a UK Ltd?", _tags: ["story"] })).toBe("Ask HN: Accountant for a UK Ltd?");
  });
  it("cuts a long comment at a word near 80 characters", () => {
    const comment = "We switched accountants last year because our old one never answered email and missed the VAT deadline twice";
    const title = titleOf({ ...base, comment_text: comment, _tags: ["comment"] });
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("…")).toBe(true);
  });
  it("reads a comment's body", () => {
    expect(bodyOf({ ...base, comment_text: "Hi<p>there", _tags: ["comment"] })).toBe("Hi\n\nthere");
  });
});

describe("ageText", () => {
  it("says hours and days", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(ageText("2026-10-19T10:00:00Z", now)).toBe("2 h ago");
    expect(ageText("2026-10-17T12:00:00Z", now)).toBe("2 days ago");
  });
});
