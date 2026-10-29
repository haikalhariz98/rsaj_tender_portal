import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { FIXTURE_ITEMS, FIXTURE_READER, FIXTURE_TODAY } from "./items.fixture";
import type { WorkView } from "./types";
import { compareItems, inView, parseWorkFilters, parseWorkView, searchRef, WORK_ORDER_BY, WORK_VIEWS, workWhere, type WorkFilters, type WorkRow, type WorkWhere } from "./views";

/** The views (W-12): `inView` and `workWhere` are one rule, so they agree on every view and filter; Late needs a today (WS-19); the order is total. */

const reader = { personId: FIXTURE_READER };

/// The where object read as Postgres would read it, for the operators `workWhere` uses: AND, OR, equals, in, lt, contains (insensitive).
function matches(where: WorkWhere, row: WorkRow): boolean {
  const col: Record<string, unknown> = { ...row, assigneePersonId: row.assignee, dueOn: row.dueOn ? dayToDate(row.dueOn) : null };
  return Object.entries(where).every(([k, cond]) => {
    if (k === "AND") return (cond as WorkWhere[]).every((w) => matches(w, row));
    if (k === "OR") return (cond as WorkWhere[]).some((w) => matches(w, row));
    const v = col[k];
    if (cond === null || typeof cond !== "object") return v === cond;
    const c = cond as { in?: unknown[]; lt?: Date; contains?: string; mode?: string };
    if (c.in) return c.in.includes(v);
    if (c.lt) return v instanceof Date && v.getTime() < c.lt.getTime();
    if (c.contains !== undefined) return c.mode === "insensitive" && typeof v === "string" && v.toLowerCase().includes(c.contains.toLowerCase());
    throw new Error(`operator not read: ${JSON.stringify(cond)}`);
  });
}

const FILTERS: WorkFilters[] = [{}, { type: "INSPECTION" }, { assignee: "hafiz" }, { priority: "URGENT" }, { q: "slab" }, { q: "rfi 1" }, { q: "Insp-2" }, { type: "RFI", priority: "HIGH", q: "Rebar" }];
const CASES = WORK_VIEWS.flatMap((v) => [FIXTURE_TODAY, null].map((t) => [v, t] as [WorkView, string | null]));

describe("inView and workWhere agree", () => {
  it.each(CASES)("view %s, today %s, on every filter", (view, today) => {
    for (const f of FILTERS) {
      const where = workWhere(view, f, reader, today);
      const a = FIXTURE_ITEMS.filter((i) => inView(i, view, reader, today, f)).map((i) => i.id);
      const b = FIXTURE_ITEMS.filter((i) => matches(where, i)).map((i) => i.id);
      expect(b, JSON.stringify(f)).toEqual(a);
    }
  });

  it("the fixture is not trivial: every view holds something with a today, and each filter narrows", () => {
    for (const v of WORK_VIEWS) expect(FIXTURE_ITEMS.some((i) => inView(i, v, reader, FIXTURE_TODAY)), v).toBe(true);
    const open = FIXTURE_ITEMS.filter((i) => inView(i, "open", reader, FIXTURE_TODAY)).length;
    for (const f of FILTERS.slice(1)) {
      const n = FIXTURE_ITEMS.filter((i) => inView(i, "open", reader, FIXTURE_TODAY, f)).length;
      expect(n, JSON.stringify(f)).toBeLessThan(open);
    }
  });
});

describe("what each view holds", () => {
  const ids = (v: WorkView, today: string | null = FIXTURE_TODAY, f: WorkFilters = {}) => FIXTURE_ITEMS.filter((i) => inView(i, v, reader, today, f));

  it("Open is the three open statuses; Done is Done and Cancelled, and only there", () => {
    expect(new Set(ids("open").map((i) => i.status))).toEqual(new Set(["TO_DO", "IN_PROGRESS", "IN_REVIEW"]));
    expect(new Set(ids("done").map((i) => i.status))).toEqual(new Set(["DONE", "CANCELLED"]));
    for (const v of ["open", "mine", "late", "unassigned", "ncr"] as const) for (const i of ids(v)) expect(["DONE", "CANCELLED"]).not.toContain(i.status);
  });
  it("Mine is open and assigned to the reader; Unassigned is open with nobody", () => {
    for (const i of ids("mine")) expect(i.assignee).toBe(FIXTURE_READER);
    for (const i of ids("unassigned")) expect(i.assignee).toBeNull();
  });
  it("Late is open and due before today, never today; with no time zone it matches nothing (WS-19)", () => {
    expect(ids("late").every((i) => i.dueOn !== null && i.dueOn < FIXTURE_TODAY)).toBe(true);
    expect(FIXTURE_ITEMS.some((i) => i.dueOn === FIXTURE_TODAY && i.status === "TO_DO" && !inView(i, "late", reader, FIXTURE_TODAY))).toBe(true);
    expect(ids("late", null)).toEqual([]);
    expect(workWhere("late", {}, reader, null)).toEqual({ AND: [{ id: { in: [] } }] });
  });
  it("Non-conformances are open inspections with the result Failed", () => {
    expect(ids("ncr").length).toBeGreaterThan(0);
    for (const i of ids("ncr")) expect([i.type, i.inspectionResult]).toEqual(["INSPECTION", "FAILED"]);
  });
  it("search finds a title without case, or a reference however it is typed", () => {
    expect(ids("open", FIXTURE_TODAY, { q: "SLAB" }).every((i) => i.title.toLowerCase().includes("slab"))).toBe(true);
    expect(searchRef("RFI 12")).toEqual({ type: "RFI", number: 12 });
    expect(searchRef("rfi-12")).toEqual({ type: "RFI", number: 12 });
    expect(searchRef("si3")).toEqual({ type: "SITE_INSTRUCTION", number: 3 });
    expect(searchRef("Slab 2")).toBeNull();
    expect(searchRef("RFI")).toBeNull();
  });
});

describe("parsing the address", () => {
  it("a view no chip offers is Open", () => {
    expect(parseWorkView("late")).toBe("late");
    expect(parseWorkView("LATE")).toBe("open");
    expect(parseWorkView(undefined)).toBe("open");
    expect(parseWorkView("constructor")).toBe("open");
  });
  it("a filter value no dropdown offers is dropped", () => {
    expect(parseWorkFilters({ type: "RFI", assignee: " hafiz ", priority: "URGENT", q: " slab " })).toEqual({ type: "RFI", assignee: "hafiz", priority: "URGENT", q: "slab" });
    expect(parseWorkFilters({ type: "NCR", assignee: "", priority: "BLOCKER" })).toEqual({ type: null, assignee: null, priority: null, q: "" });
  });
});

describe("compareItems", () => {
  const open = FIXTURE_ITEMS.filter((i) => inView(i, "open", reader, FIXTURE_TODAY));
  const late = (i: WorkRow) => inView(i, "late", reader, FIXTURE_TODAY);

  it("late first, then by due day (none last)", () => {
    const sorted = [...open].sort(compareItems);
    const firstNotLate = sorted.findIndex((i) => !late(i));
    expect(firstNotLate).toBeGreaterThan(0);
    expect(sorted.slice(firstNotLate).some(late)).toBe(false);
    for (let k = 1; k < sorted.length; k++) {
      const [a, b] = [sorted[k - 1], sorted[k]];
      if (a.dueOn === null) expect(b.dueOn).toBeNull();
      else if (b.dueOn !== null) expect(a.dueOn <= b.dueOn).toBe(true);
    }
  });

  it("late first is due ascending for open items, so the database's order is the same order", () => {
    const lateFirst = [...open].sort((a, b) => Number(late(b)) - Number(late(a)) || compareItems(a, b));
    expect(lateFirst.map((i) => i.id)).toEqual([...open].sort(compareItems).map((i) => i.id));
    expect(WORK_ORDER_BY).toEqual([{ dueOn: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { type: "asc" }, { number: "asc" }, { id: "asc" }]);
  });

  it("priority breaks a tie on the due day (Urgent first), then type and number: the order is total", () => {
    const a: WorkRow = { ...open[0], id: "a", dueOn: "2026-11-10", priority: "LOW", type: "TASK", number: 1 };
    expect(compareItems(a, { ...a, id: "b", priority: "URGENT" })).toBeGreaterThan(0);
    expect(compareItems(a, { ...a, id: "b", type: "RFI" })).toBeGreaterThan(0);
    expect(compareItems(a, { ...a, id: "b", number: 2 })).toBeLessThan(0);
    expect(compareItems(a, { ...a, id: "b" })).toBeLessThan(0);
    expect(compareItems(a, a)).toBe(0);
    for (const x of FIXTURE_ITEMS) for (const y of FIXTURE_ITEMS) if (x.id !== y.id) expect(Math.sign(compareItems(x, y))).toBe(-Math.sign(compareItems(y, x)));
  });
});
