import { describe, expect, it } from "vitest";
import { noteBody } from "./hubspot";

describe("noteBody", () => {
  const note = {
    score: 82,
    summary: "Two-year-old B2B SaaS <script>, first accounts due",
    whyFit: "Founder-run, no finance team.",
    whyNow: null,
    reviewedBy: "Claude",
    link: "http://127.0.0.1:3000/companies?c=abc&tab=kept",
  };

  it("carries the score, summary, why it fits and the link, escaped", () => {
    const html = noteBody(note);
    expect(html).toContain("score 82");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Founder-run, no finance team.");
    expect(html).toContain('href="http://127.0.0.1:3000/companies?c=abc&amp;tab=kept"');
  });

  it("leaves out why now when there isn't one", () => {
    expect(noteBody(note)).not.toContain("Why now");
  });
});
