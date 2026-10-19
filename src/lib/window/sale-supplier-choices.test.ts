import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Residual 6 (against accepted 6.5): the sale form loaded every registered supplier into one dropdown. It
 * now lists at most SALE_SUPPLIER_CHOICES by name in the shared Select (which searches them as typed), says
 * when there are more, and takes any other by its register reference, looked up by the action.
 */

const read = readFileSync("src/lib/window/read.ts", "utf8");
const editors = readFileSync("src/app/sourcing/[id]/window/editors.tsx", "utf8");
const act = readFileSync("src/app/sourcing/[id]/window/register-actions.ts", "utf8");
const cap = Number(/export const SALE_SUPPLIER_CHOICES = (\d+);/.exec(read)?.[1]);

describe("the sale form's supplier choice is bounded (residual 6)", () => {
  it("a sensible cap, taken in the query, with the total counted", () => {
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThanOrEqual(200);
    expect(read).toMatch(/take: SALE_SUPPLIER_CHOICES/);
    expect(read).toMatch(/db\.supplier\.count\(\{ where \}\)/);
    // No other read of the register's suppliers in the window's read model is unbounded.
    for (const m of read.matchAll(/db\.supplier\.findMany\(\{[^\n]*/g)) expect(m[0]).toMatch(/take:/);
  });

  it("the shared Select (it searches past seven options), and a reference field once the list is cut", () => {
    expect(editors).toMatch(/kind: "select", name: "supplierId", label: "Supplier on the register"[^\n]*type to search/i); // 0005, founder 2026-10-19: hint opens with a capital
    expect(editors).toMatch(/suppliersTotal > suppliers\.length \? \[\{ kind: "text", name: "supplierReference"/);
  });

  it("the action looks a reference up, refuses one that names nobody or another supplier than the one chosen", () => {
    expect(act).toMatch(/tx\.supplier\.findFirst\(\{ where: \{ organisationId: l\.org\.id, reference: supplierReference \}/);
    expect(act).toMatch(/No supplier on the register has that reference\./);
    expect(act).toMatch(/That reference is not the supplier chosen above: name one\./);
  });
});
