import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The sale form's supplier choice is searched on the server (dropdown sweep 2, founder 2026-10-24): it replaced the first-200 list and the
 * "register reference" text box (residual 6). The posted id is still read back with the organisation by the action.
 */

const read = readFileSync("src/lib/window/read.ts", "utf8");
const editors = readFileSync("src/app/sourcing/[id]/window/editors.tsx", "utf8");
const act = readFileSync("src/app/sourcing/[id]/window/register-actions.ts", "utf8");

describe("the sale form's supplier choice is searched, not preloaded", () => {
  it("no supplier list is read for the page, and no reference box remains", () => {
    expect(read).not.toMatch(/db\.supplier\.findMany/);
    expect(editors).not.toMatch(/supplierReference/);
    expect(act).not.toMatch(/optionalText("supplierReference")/);
  });

  it("the field searches the staff lookup route", () => {
    expect(editors).toMatch(/name: "supplierId", label: "Supplier on the register"[^\n]*search: \{ url: "\/api\/lookup\?kind=supplier" \}/);
  });

  it("the action still reads the chosen supplier back within the organisation", () => {
    expect(act).toMatch(/tx\.supplier\.findFirst\(\{ where: \{ id: choice\.vendorId, organisationId: l\.org\.id \}/);
  });
});
