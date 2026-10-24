import { describe, expect, it, vi } from "vitest";

// `where.ts` takes the hidden-exercise guard from beside database readers; none is called here.
vi.mock("@/lib/db", () => ({ db: {} }));

import { departmentUnits, insightsHref, mayReadBudget, parseInsightsQuery, type InsightsChoices } from "./query";
import { insightsWhere } from "./where";

const choices: InsightsChoices = { years: [2025, 2026], defaultYear: 2026, units: ["WS", "FIN"], routes: ["GOV"], methods: ["OPEN"], budget: true };

describe("the Dashboard's address", () => {
  it("lands on Overview in the default year with no filter", () => {
    expect(parseInsightsQuery({}, choices)).toEqual({ tab: "overview", year: 2026, unit: null, route: null, method: null });
  });
  it("keeps a known tab, year, unit, route and method", () => {
    expect(parseInsightsQuery({ tab: "requisitions", year: "2025", unit: "WS", route: "GOV" }, choices)).toEqual({ tab: "requisitions", year: 2025, unit: "WS", route: "GOV", method: null });
    expect(parseInsightsQuery({ tab: "tenders", method: "OPEN" }, choices).method).toBe("OPEN");
  });
  it("drops an unknown tab, year, unit, route or method and shows the defaults, never an error", () => {
    expect(parseInsightsQuery({ tab: "suppliers", year: "1999", unit: "NOPE", route: "X", method: "Y" }, choices)).toEqual({ tab: "overview", year: 2026, unit: null, route: null, method: null });
    expect(parseInsightsQuery({ tab: "requisitions", year: "2026abc", route: "X" }, choices)).toMatchObject({ year: 2026, route: null });
  });
  it("drops a filter the tab does not take, so it cannot narrow a figure unseen", () => {
    expect(parseInsightsQuery({ tab: "overview", route: "GOV", method: "OPEN" }, choices)).toMatchObject({ route: null, method: null });
    expect(parseInsightsQuery({ tab: "tenders", route: "GOV" }, choices).route).toBeNull();
    expect(parseInsightsQuery({ tab: "requisitions", method: "OPEN" }, choices).method).toBeNull();
  });
  it("reads a repeated parameter as its first value", () => {
    expect(parseInsightsQuery({ unit: ["FIN", "WS"] }, choices).unit).toBe("FIN");
  });
  it("falls back from the Budget tab to Overview for a reader without the Budget predicate", () => {
    expect(parseInsightsQuery({ tab: "budget" }, choices).tab).toBe("budget");
    expect(parseInsightsQuery({ tab: "budget" }, { ...choices, budget: false }).tab).toBe("overview");
  });
  it("has no year while the organisation has no budget periods", () => {
    expect(parseInsightsQuery({ year: "2026" }, { ...choices, years: [], defaultYear: null }).year).toBeNull();
  });
  it("builds the address back, leaving empty filters out", () => {
    expect(insightsHref({ tab: "requisitions", year: 2026, unit: "WS", route: null })).toBe("/dashboard?tab=requisitions&year=2026&unit=WS");
    expect(insightsHref({ tab: "overview" })).toBe("/dashboard?tab=overview");
  });
});

describe("the Department filter (DB-10)", () => {
  const units = [
    { code: "WS", kind: "DEPARTMENT" },
    { code: "WS-NET", kind: "SECTION" },
    { code: "OPS", kind: "DIVISION" },
    { code: "FIN", kind: "DEPARTMENT" },
  ];
  it("offers the Department units only, flat", () => {
    expect(departmentUnits(units).map((u) => u.code)).toEqual(["WS", "FIN"]);
  });
  it("budget codes and requisitions draw from the same unit list", () => {
    const list = departmentUnits(units).map((u) => u.code);
    const c = { ...choices, units: list };
    const fy = { from: "2026-01-01", to: "2027-01-01" };
    for (const code of ["WS", "FIN", "WS-NET", "OPS"]) {
      const onBudget = parseInsightsQuery({ tab: "budget", unit: code }, c).unit;
      const onRequisitions = parseInsightsQuery({ tab: "requisitions", unit: code }, c).unit;
      expect(onBudget, code).toBe(onRequisitions);
      expect(insightsWhere.budgetCodes("org", onBudget).owningUnitCode, code).toBe(insightsWhere.requisitionsRaised("org", { unit: onRequisitions }, fy).requestingUnitCode);
    }
    // The known gap (note 0007 §4): a code owned by a section is reached by no Department filter.
    expect(parseInsightsQuery({ tab: "budget", unit: "WS-NET" }, c).unit).toBeNull();
  });
});

describe("who may read budget figures (DB-3)", () => {
  const who = (isAdministrator: boolean, ...p: string[]) => ({ isAdministrator, permissions: new Set(p) });
  it("whoever may see Settings", () => {
    expect(mayReadBudget(who(true))).toBe(true);
    for (const p of ["configuration.draft", "configuration.issue", "audit.read"]) expect(mayReadBudget(who(false, p)), p).toBe(true);
  });
  it("or a holder of sulit.read.organisation", () => {
    expect(mayReadBudget(who(false, "sulit.read.organisation"))).toBe(true);
  });
  it("and no one else", () => {
    expect(mayReadBudget(who(false))).toBe(false);
    expect(mayReadBudget(who(false, "requisition.raise"))).toBe(false);
  });
});
