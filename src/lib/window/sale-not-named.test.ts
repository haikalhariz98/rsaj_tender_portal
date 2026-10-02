import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { saleFields } from "./audit-view";
import { CHECK_STATE_LABEL, NOT_CHECKED_NOT_NAMED, saleCheckWords, windowFindingText } from "./labels";
import { saleChecks } from "./sale-checks";

/**
 * Residual 2 (re-review of M-4, against accepted 6.5): "sold before the supplier register checked it" was
 * false for a sale made today, under the register, with no supplier named. The two are told apart by what
 * the sale holds (DocumentSale.noSupplierNamed, written at the sale): a sale before the register read sales
 * keeps "sold before the supplier register checked it"; one under the register with no supplier named says
 * "no supplier is named for the contractor at this sale", as the sale-time warning already did.
 */

const base = { authoritySighted: true, certSighted: null, certValidUntil: null, registrationCheck: "NOT_CHECKED" as const, suspensionCheck: "NOT_CHECKED" as const, registerReadOn: null };

describe("a check not made, by what the sale holds (residual 2)", () => {
  it("the register row: before the register, or no supplier named at this sale", () => {
    expect(saleChecks({ ...base, noSupplierNamed: false }, null).slice(1).map((c) => c.text)).toEqual(["Registration: not checked: sold before the supplier register checked it", "Suspension: not checked: sold before the supplier register checked it"]);
    expect(saleChecks({ ...base, noSupplierNamed: true }, null).slice(1).map((c) => c.text)).toEqual(["Registration: not checked: no supplier is named for the contractor at this sale", "Suspension: not checked: no supplier is named for the contractor at this sale"]);
  });

  it("the trail written at the sale says the same", () => {
    const row = { partyName: "X", soldOn: new Date("2026-10-03T00:00:00Z"), collectedBy: "Y", authoritySighted: true, restrictionCertSighted: null, restrictionCertValidUntil: null, registrationCheck: "NOT_CHECKED" as const, suspensionCheck: "NOT_CHECKED" as const, amount: "60" as never, paymentMethod: "Cash", financeReceiptNo: null, issuedBy: "Z" };
    expect(saleFields({ ...row, noSupplierNamed: true })).toMatchObject({ registration: "Not checked: no supplier is named for the contractor at this sale", suspension: "Not checked: no supplier is named for the contractor at this sale" });
    expect(saleFields({ ...row, noSupplierNamed: false })).toMatchObject({ registration: "Not checked: sold before the supplier register checked it" });
    expect(NOT_CHECKED_NOT_NAMED).toBe("Not checked: no supplier is named for the contractor at this sale");
  });

  it("a check made or failed is worded alike either way; the sale-time warning agrees", () => {
    expect(saleCheckWords("CLEAR", true)).toBe(CHECK_STATE_LABEL.CLEAR);
    expect(saleCheckWords("FAILED", true)).toBe(CHECK_STATE_LABEL.FAILED);
    expect(windowFindingText({ code: "REGISTRATION_NOT_CHECKED", level: "warn" })).toContain("no supplier is named for the contractor at this sale");
  });

  it("recordSale writes noSupplierNamed from the register's link; the row reads it (source)", () => {
    expect(readFileSync("src/app/sourcing/[id]/window/register-actions.ts", "utf8")).toMatch(/noSupplierNamed: !register\.linked,/);
    expect(readFileSync("src/lib/window/read.ts", "utf8")).toMatch(/noSupplierNamed: s\.noSupplierNamed/);
  });
});
