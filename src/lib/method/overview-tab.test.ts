import { describe, expect, it } from "vitest";

import { activeTabOf } from "./overview-tab";

const available = ["overview", "scope", "documents", "award", "history"];

describe("which tab an exercise address names (founder, 2026-10-05)", () => {
  it("the old Classification and Contract type addresses open the Overview", () => {
    expect(activeTabOf("classification", available)).toBe("overview");
    expect(activeTabOf("contract", available)).toBe("overview");
  });
  it("no tab, or the Overview itself, is the Overview", () => {
    expect(activeTabOf(undefined, available)).toBe("overview");
    expect(activeTabOf("", available)).toBe("overview");
    expect(activeTabOf("overview", available)).toBe("overview");
  });
  it("a tab the exercise has is that tab", () => {
    expect(activeTabOf("documents", available)).toBe("documents");
    expect(activeTabOf("history", available)).toBe("history");
  });
  it("a tab it does not have (a Proposal tab on a method that asks for none) is the Overview, as the strip opens it", () => {
    expect(activeTabOf("proposal", available)).toBe("overview");
    expect(activeTabOf("nonsense", available)).toBe("overview");
  });
});
