import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * DB-3 (product owner, 2026-10-24): one predicate, `mayReadBudget`, governs every Budget surface. The Budget page lists each commitment
 * with its requisition's reference and the estimate committed, so a reader who fails the predicate never reaches it: the page refuses
 * before anything is loaded, and the requisition page draws no link to it. Who passes is `query.test.ts`'s.
 */

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", "app", ...p), "utf8");

describe("the Budget page is refused to a reader who fails mayReadBudget (DB-3)", () => {
  const page = read("configuration", "budget", "page.tsx");
  it("asks the predicate right after the sign-in check, and sends a refused reader to the no-access page", () => {
    expect(page).toMatch(/const actor = await requireStaff\(\);\n(\s*\/\/[^\n]*\n)*\s*if \(!mayReadBudget\(actor\)\) redirect\("\/configuration\/no-access"\);/);
    expect(page).toContain('import { mayReadBudget } from "@/lib/insights/query";');
  });
  it("before any figure is read", () => {
    const gate = page.indexOf("if (!mayReadBudget(actor))");
    for (const load of ["loadBudgetCodes(", "loadBudgetPeriods(", "loadFinance(", "db.requisition.findMany("]) expect(page.indexOf(load), load).toBeGreaterThan(gate);
  });
});

describe("the requisition page links to Budget only for a reader who may open it", () => {
  const page = read("requisitions", "[id]", "page.tsx");
  it("passes the predicate to the budget panel and draws no Configure link to Budget without it", () => {
    expect(page).toContain("budgetReadable={mayReadBudget(actor)}");
    expect(page).toMatch(/controls\.budgetCheckSource && !budgetReadable \? undefined : \(\s*<ButtonLink href=\{controls\.budgetCheckSource \? BUDGET_HREF : CONTROLS_HREF\}/);
    // BUDGET_HREF is used nowhere else, so no other link leads to the page.
    expect(page.match(/BUDGET_HREF/g)?.length).toBe(2);
  });
});
