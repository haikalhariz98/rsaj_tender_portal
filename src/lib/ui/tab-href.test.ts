import { describe, expect, it } from "vitest";

import { tabHref } from "./tab-href";

describe("tabHref", () => {
  it("without keep, writes exactly what the strip always wrote", () => {
    expect(tabHref("/x/1", "baseline")).toBe("/x/1?tab=baseline");
    expect(tabHref("/x/1", "site", "start")).toBe("/x/1?tab=site&section=start");
    expect(tabHref("/x/1", "a b", "c&d")).toBe("/x/1?tab=a%20b&section=c%26d");
  });
  it("keeps the named parameters first, so the case page's stage survives a tab or section hop (C-2)", () => {
    expect(tabHref("/projects/1", "overview", undefined, { stage: "award" })).toBe("/projects/1?stage=award&tab=overview");
    expect(tabHref("/projects/1", "payments", "valuations", { stage: "project" })).toBe("/projects/1?stage=project&tab=payments&section=valuations");
  });
  it("never lets keep override the tab or the section", () => {
    expect(tabHref("/p", "a", "b", { tab: "z", section: "y", stage: "s" })).toBe("/p?stage=s&tab=a&section=b");
  });
});
