import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CHECK_STATE_LABEL } from "./labels";
import { registerReadOn, saleChecks } from "./sale-checks";

/**
 * 6.15a fix M-4 (against accepted 6.5): a sale made before the register checked it read "the contractor is
 * not linked" even once its party was linked. The words now follow what the sale holds: the register's
 * reading frozen on it (eligibilitySnapshot), or none.
 */

const sale = { authoritySighted: true, certSighted: null, certValidUntil: null };
const snapshot = { judgedOn: "2026-09-20", supplierId: "s", supplierReference: "VND-0001", standing: "ACTIVE", verdict: "ELIGIBLE", rows: [] };

describe("the sale register's words follow what the sale holds (fix M-4)", () => {
  it("no register reading frozen on it: 'sold before the supplier register checked it', whatever the party's link now", () => {
    const cs = saleChecks({ ...sale, registrationCheck: "NOT_CHECKED", suspensionCheck: "NOT_CHECKED", registerReadOn: registerReadOn(null) }, null);
    expect(cs.slice(1).map((c) => c.text)).toEqual(["Registration: not checked: sold before the supplier register checked it", "Suspension: not checked: sold before the supplier register checked it"]);
    expect(cs.slice(1).every((c) => c.warn)).toBe(true);
  });

  it("a register reading frozen on it: the register's result and the day it was read", () => {
    const cs = saleChecks({ ...sale, registrationCheck: "CLEAR", suspensionCheck: "CLEAR", registerReadOn: registerReadOn(snapshot) }, null);
    expect(cs.slice(1).map((c) => c.text)).toEqual(["Registration: clear on the supplier register, read 20 Sep 2026", "Suspension: clear on the supplier register, read 20 Sep 2026"]);
    expect(cs.slice(1).some((c) => c.warn)).toBe(false);
  });

  it("the trail's words for a check not made say when, not a link", () => {
    expect(CHECK_STATE_LABEL.NOT_CHECKED).toBe("Not checked: sold before the supplier register checked it");
    for (const v of Object.values(CHECK_STATE_LABEL)) expect(v).not.toMatch(/not linked/);
  });

  it("the register row passes the sale's own snapshot, not the party's link (source)", () => {
    const read = readFileSync("src/lib/window/read.ts", "utf8");
    expect(read).toMatch(/registerReadOn: registerReadOn\(s\.eligibilitySnapshot\)/);
    expect(read).not.toMatch(/registerReadOn: [^,]*vendorId/);
  });
});
