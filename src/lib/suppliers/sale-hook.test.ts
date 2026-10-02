import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// 6.15a (flagged against accepted 6.5, new test): the sale reads the register for a linked party, the
// supplier row locked last, after the exercise side (plan §4 lock order).
describe("6.5's recordSale reads the supplier register (FR-ADV-010, OD-5)", () => {
  const src = readFileSync("src/app/sourcing/[id]/window/register-actions.ts", "utf8");
  const body = src.slice(src.indexOf("export async function recordSale("), src.indexOf("export async function voidSale("));
  const hook = readFileSync("src/lib/suppliers/sale-hook.ts", "utf8");

  it("the exercise side is locked first (inWindow, then the sale rows), the supplier row last", () => {
    const order = ["inWindow(", "lockSaleRows(", "registerAtSale("].map((s) => body.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(hook).toMatch(/await lockSupplierRow\(tx, vendorId\);\n\s+const e = await eligibilityOf\(/);
  });

  it("a barring finding refuses before anything is written, and a linked party's checks come from the register", () => {
    expect(body.indexOf("registerBlocks.length")).toBeLessThan(body.indexOf("tx.documentSale.create"));
    expect(body).toMatch(/const regCheck = register\.linked \? register\.check\.registrationCheck : registrationCheck;/);
    expect(body).toMatch(/registrationCheck: regCheck,\n\s+suspensionCheck: suspCheck,/);
  });

  it("the eligibility is frozen on the sale only for a linked party, never backfilled", () => {
    expect(body).toMatch(/\.\.\.\(register\.snapshot \? \{ eligibilitySnapshot:/);
    expect(src.match(/eligibilitySnapshot/g)?.length).toBe(1);
  });
});
