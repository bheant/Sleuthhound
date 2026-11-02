import { describe, expect, it } from "vitest";
import type { ScopeFieldSpec } from "@/lib/connectors/types";
import { describeChange } from "./changes";

const fields: ScopeFieldSpec[] = [
  { key: "keywords", label: "Keywords and phrases", input: "chips" },
  { key: "includeComments", label: "Include comments", input: "toggle" },
  {
    key: "lookBack",
    label: "Look back",
    input: "segmented",
    options: [
      { value: "7d", label: "7 days" },
      { value: "30d", label: "30 days" },
    ],
  },
];

const base = { scope: { keywords: ["accountant"], includeComments: true, lookBack: "7d" }, schedule: "hourly", max_items: 50, spend_cap_gbp: 10, weight: "normal" };

describe("describeChange", () => {
  it("says a new source was added", () => {
    expect(describeChange(null, base, fields)).toBe("Source added");
  });
  it("names an added keyword", () => {
    const next = { ...base, scope: { ...base.scope, keywords: ["accountant", "first finance hire"] } };
    expect(describeChange(base, next, fields)).toBe("Added “first finance hire” to keywords and phrases");
  });
  it("describes a schedule change and a choice by its label", () => {
    const next = { ...base, schedule: "daily", scope: { ...base.scope, lookBack: "30d" } };
    expect(describeChange(base, next, fields)).toBe("Look back changed from 7 days to 30 days; Schedule changed from hourly to daily");
  });
  it("counts the rest when there are many changes", () => {
    const next = { ...base, schedule: "daily", weight: "high", scope: { ...base.scope, includeComments: false, lookBack: "30d" } };
    expect(describeChange(base, next, fields)).toBe("Turned include comments off; Look back changed from 7 days to 30 days, and 2 more changes");
  });
});
