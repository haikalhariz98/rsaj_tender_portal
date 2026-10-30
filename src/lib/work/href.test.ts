import { describe, expect, it } from "vitest";

import { parseWorkQuery, reset, workHref, workServerMode } from "./href";

const SORTS = ["item", "due"];

describe("the Work address", () => {
  it("an empty address is the Open view as a List, and writes back as just the tab", () => {
    const q = parseWorkQuery({}, SORTS);
    expect(q).toMatchObject({ view: "open", mode: "list", page: 0, size: 25, sort: null, item: null });
    expect(workHref("c1", q)).toBe("/projects/c1?tab=work");
  });
  it("reads what the controls offer and drops the rest", () => {
    const q = parseWorkQuery({ view: "late", type: "RFI", priority: "BOGUS", mode: "board", sort: "nope", item: "RFI-12", page: "2", size: "50" }, SORTS);
    expect(q).toMatchObject({ view: "late", type: "RFI", priority: null, mode: "board", sort: null, item: "RFI-12", page: 2, size: 50 });
    expect(parseWorkQuery({ item: "rfi-12" }, SORTS).item).toBeNull();
    expect(parseWorkQuery({ item: "RFI-0" }, SORTS).item).toBeNull();
  });
  it("round-trips, and a narrowing change goes back to the first page and closes the panel", () => {
    const q = parseWorkQuery({ view: "mine", type: "TASK", q: "pump", page: "3", item: "Task-4", stage: "project" }, SORTS);
    expect(parseWorkQuery(Object.fromEntries(new URL(`http://x${workHref("c1", q)}`).searchParams), SORTS)).toEqual(q);
    expect(workHref("c1", q, { view: "open", ...reset })).not.toMatch(/page=|item=/);
  });
  it("a linked card's panel is the act address; an item wins, a bad one is dropped, and reset closes it", () => {
    const q = parseWorkQuery({ act: "VARIATION:abc", mode: "board" }, SORTS);
    expect(q).toMatchObject({ act: "VARIATION:abc", item: null });
    expect(parseWorkQuery(Object.fromEntries(new URL(`http://x${workHref("c1", q)}`).searchParams), SORTS)).toEqual(q);
    expect(parseWorkQuery({ act: "VARIATION:abc", item: "RFI-1" }, SORTS)).toMatchObject({ act: null, item: "RFI-1" });
    expect(parseWorkQuery({ act: "BOGUS:abc" }, SORTS).act).toBeNull();
    expect(workHref("c1", q, { view: "late", ...reset })).not.toContain("act=");
  });
  it("the server mode sorts ascending, then descending, then not at all", () => {
    const cols = { due: "due" };
    const at = (sp: Record<string, string>) => workServerMode("c1", parseWorkQuery(sp, SORTS), { total: 1, page: 0, columns: cols }).sortHrefs.due;
    expect(at({})).toContain("sort=due&dir=asc");
    expect(at({ sort: "due", dir: "asc" })).toMatch(/sort=due$/);
    expect(at({ sort: "due" })).not.toContain("sort=");
  });
  it("the search form keeps the tab and the view", () => {
    const s = workServerMode("c1", parseWorkQuery({ view: "late", q: "x" }, SORTS), { total: 0, page: 0, columns: {} });
    expect(s.keep).toEqual({ tab: "work", view: "late" });
    expect(s.clearHref).toBe("/projects/c1?tab=work");
  });
});
