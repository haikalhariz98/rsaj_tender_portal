import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { supplierFaultText } from "./labels";
import { saleStandingCheck, saleSupplier } from "./sale";

/**
 * 6.15a fix M-2 (against accepted 6.5): with registerRequiredForSale set, an advertised exercise could never
 * make a first sale: no party exists before the sale, so none could be linked. The sale form now names the
 * register's supplier, and the new (or unlinked) party is linked to it inside the sale's transaction,
 * audited (OD-9: an explicit act). The refusal names that exit.
 */

describe("a sale names the register's supplier (fix M-2)", () => {
  it("an unlinked or new contractor with a supplier named: linked at the sale, and the register reads that supplier", () => {
    expect(saleSupplier(null, "vnd1")).toEqual({ kind: "LINK_AT_SALE", vendorId: "vnd1" });
  });

  it("nothing named: nothing linked, the policy alone judges (required refuses, naming the exit)", () => {
    expect(saleSupplier(null, null)).toEqual({ kind: "NONE", vendorId: null });
    const check = saleStandingCheck(null, { registerRequiredForSale: true });
    expect(check.findings.map((f) => f.code)).toEqual(["NOT_LINKED_REGISTER_REQUIRED"]);
    expect(supplierFaultText(check.findings[0])).toBe("Not sold: the documents are sold only to a purchaser on the supplier register, and no supplier is named for this contractor. Choose its supplier under “Supplier on the register” on this form: the contractor is linked to it as the sale is recorded. A company not yet on the register is recorded there first (Suppliers › Record a paper application).");
  });

  it("a contractor already linked keeps its link: the same supplier is fine, another is refused (a link is not moved)", () => {
    expect(saleSupplier("vnd1", null)).toEqual({ kind: "LINKED", vendorId: "vnd1" });
    expect(saleSupplier("vnd1", "vnd1")).toEqual({ kind: "LINKED", vendorId: "vnd1" });
    const r = saleSupplier("vnd1", "vnd2");
    expect(r.kind).toBe("REFUSED");
    expect(r.kind === "REFUSED" && supplierFaultText(r.fault)).toMatch(/^Not sold: this contractor is already linked to another supplier on the register\. A link is not moved/);
  });

  it("recordSale links inside its transaction, judged and audited as the link act, before the register reads it (source)", () => {
    const text = readFileSync("src/app/sourcing/[id]/window/register-actions.ts", "utf8");
    const body = text.slice(text.indexOf("export async function recordSale"), text.indexOf("export async function voidSale"));
    const order = ["saleSupplier(known?.vendorId ?? null, chosenSupplierId)", "lockSupplierRow(tx, choice.vendorId)", "linkPartyFaults(", "registerAtSale(tx,", "partyFor(tx, l, d, party, \"PURCHASER\")", "tx.exerciseParty.update({ where: { id: buyer.id }, data: { vendorId: linkAtSale.supplier.id } })", "SUPPLIER_ENTITY.party", "tx.documentSale.create("];
    let at = -1;
    for (const o of order) {
      const i = body.indexOf(o);
      expect(i, o).toBeGreaterThan(at);
      at = i;
    }
    expect(body).toMatch(/linkedBy: `\$\{person\.name\}, named on the sale`/);
  });

  it("the sale form offers the register's registered suppliers", () => {
    expect(readFileSync("src/app/sourcing/[id]/window/editors.tsx", "utf8")).toMatch(/name: "supplierId", label: "Supplier on the register"/);
    expect(readFileSync("src/lib/window/read.ts", "utf8")).toMatch(/db\.supplier\.findMany\(\{ where: \{ organisationId: org\.id, status: "REGISTERED" \}/);
  });
});
