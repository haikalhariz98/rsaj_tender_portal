import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Sen } from "@/lib/money";
import type { SupplyClaimRow } from "@/lib/project-docs/supply-read";

vi.mock("./supply-editors", () => ({ RecordSupplyPaymentDrawer: ({ invoiceNo }: { invoiceNo: string }) => h("button", null, `Record payment ${invoiceNo}`) }));
vi.mock("./supply-actions", () => ({}));

import { SupplyInvoices } from "./supply-panel";

const claim = (o: Partial<SupplyClaimRow>): SupplyClaimRow => ({ documentId: "d1", invoiceNo: "INV-1", sentOn: "2026-10-01", sentText: "1 Oct 2026", state: "WITH_ORGANISATION", stateLabel: "With Jabatan", payment: null, payable: false, ...o });
const view = (rows: SupplyClaimRow[]) => renderToStaticMarkup(h(SupplyInvoices, { contractId: "c1", status: "ACTIVE", rows, people: [], today: "2026-10-24", zoneBlocker: null }));

describe("Supply invoices section", () => {
  it("counts what is waiting, hides zeros, and offers Record payment only on a verified unpaid claim", () => {
    const paid = claim({ documentId: "d3", invoiceNo: "INV-3", state: "PAID", stateLabel: "Paid RM 10.00 on 2 Oct 2026, batch B1", payment: { paidOn: "2026-10-02", paidText: "2 Oct 2026", batchNo: "B1", amount: 1000n as Sen, amountText: "RM 10.00", note: "" } });
    const html = view([claim({}), claim({ documentId: "d2", invoiceNo: "INV-2", state: "VERIFIED", stateLabel: "Verified", payable: true }), paid]);
    expect(html).toContain("To verify");
    expect(html).toContain("To record payment");
    expect(html).toContain("Record payment INV-2");
    expect(html).not.toContain("Record payment INV-1");
    expect(html).not.toContain("Record payment INV-3");
    expect(html).toContain("/projects/c1/documents/d2");
  });
  it("says so when none are sent, with no zero chips", () => {
    const html = view([]);
    expect(html).toContain("None sent yet");
    expect(html).not.toContain("To verify");
  });
});

describe("screen sources", () => {
  const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
  it("shows the section only on the delivery order route, read live for the Payments tab", () => {
    expect(src("page.tsx")).toMatch(/projectTab === "payments" && \(await paymentRouteOf\(db, lc\)\) === "DELIVERY_ORDER_INVOICE"/);
    expect(src("payment-panels.tsx")).toContain("...(supply ?");
  });
  it("the drawer posts what the action reads", () => {
    const d = src("supply-editors.tsx");
    for (const n of ["id", "documentId", "paidOn", "batchNo", "amount", "note", "personId"]) expect(d).toContain(`"${n}"`);
    expect(d).toContain('SupplyInvoicePayment.person');
  });
  it("the contract-type editor offers How it is paid as a dropdown with Not set", () => {
    const e = readFileSync(join(__dirname, "../../configuration/reference-data/editors.tsx"), "utf8");
    expect(e).toMatch(/kind: "select", name: "paymentRoute", label: "How it is paid", placeholder: "Not set"/);
    expect(e).toContain("PAYMENT_ROUTE_LABEL[k]");
  });
});
