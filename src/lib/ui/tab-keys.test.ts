import { describe, expect, it } from "vitest";

import { navigatesOnSelect, sectionToOpen, tabKeyMove } from "./tab-keys";

// The exercise page's shape: plain tabs around one with sections (Scope and estimate).
const tabs = [{ id: "classification" }, { id: "contract" }, { id: "scope", sections: [{ id: "scope" }, { id: "bq" }, { id: "estimate" }] }, { id: "award" }, { id: "history" }];

describe("the tab strip's keys", () => {
  it("arrows move focus to the next and previous tab, wrapping at either end", () => {
    expect(tabKeyMove(tabs, "classification", "ArrowRight")?.focus).toBe("contract");
    expect(tabKeyMove(tabs, "history", "ArrowRight")?.focus).toBe("classification");
    expect(tabKeyMove(tabs, "classification", "ArrowLeft")?.focus).toBe("history");
    expect(tabKeyMove(tabs, "award", "Home")?.focus).toBe("classification");
    expect(tabKeyMove(tabs, "contract", "End")?.focus).toBe("history");
  });

  it("a plain tab is selected as focus arrives; a tab with sections only takes focus (no navigation per key)", () => {
    expect(tabKeyMove(tabs, "classification", "ArrowRight")).toEqual({ focus: "contract", select: true });
    expect(tabKeyMove(tabs, "contract", "ArrowRight")).toEqual({ focus: "scope", select: false });
    expect(tabKeyMove(tabs, "award", "ArrowLeft")).toEqual({ focus: "scope", select: false });
  });

  it("moves from the focused tab, not the selected one, so focus-only moves keep going", () => {
    // Selected is still "contract"; focus rests on "scope" after the last move.
    expect(tabKeyMove(tabs, "scope", "ArrowRight")).toEqual({ focus: "award", select: true });
    // Several tabs with sections in a row: each arrow moves focus on, none selects.
    const all = [{ id: "a", sections: [1] }, { id: "b", sections: [1] }, { id: "c", sections: [1] }];
    expect(tabKeyMove(all, "a", "ArrowRight")).toEqual({ focus: "b", select: false });
    expect(tabKeyMove(all, "b", "ArrowRight")).toEqual({ focus: "c", select: false });
  });

  it("other keys are not the strip's (Enter and Space are the button's own click); an unknown focus starts at the first", () => {
    expect(tabKeyMove(tabs, "contract", "Enter")).toBeNull();
    expect(tabKeyMove(tabs, "contract", " ")).toBeNull();
    expect(tabKeyMove(tabs, "contract", "ArrowDown")).toBeNull();
    expect(tabKeyMove([], "x", "ArrowRight")).toBeNull();
    expect(tabKeyMove(tabs, undefined, "ArrowRight")?.focus).toBe("contract");
  });

  it("a tab navigates on select only where it has sections", () => {
    expect(navigatesOnSelect({ id: "x" })).toBe(false);
    expect(navigatesOnSelect({ id: "x", sections: [] })).toBe(false);
    expect(navigatesOnSelect({ id: "x", sections: [{}] })).toBe(true);
  });
});

describe("sectionToOpen: coming back to a tab with sections", () => {
  const sections = [{ id: "scope" }, { id: "bq" }, { id: "estimate" }];
  it("lands on the section the address last named, if it is one of the tab's", () => {
    expect(sectionToOpen(sections, "estimate")).toBe("estimate");
    expect(sectionToOpen(sections, "bq")).toBe("bq");
  });
  it("falls back to the first for none, or for a section of some other tab", () => {
    expect(sectionToOpen(sections, null)).toBe("scope");
    expect(sectionToOpen(sections, "window")).toBe("scope");
    expect(sectionToOpen([], "bq")).toBeNull();
  });
});
