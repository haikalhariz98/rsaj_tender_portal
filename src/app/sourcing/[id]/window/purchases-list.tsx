"use client";

import { DataList, type Row } from "@/components/data-list";
import { SIMULATED_LABEL } from "@/lib/integration/payment-labels";

import { RecordPurchaseReceiptDrawer } from "./editors";

/// An online purchase awaiting payment, as the sale register's read model gives it (`saleRegister`), trimmed to what the list shows.
export interface AwaitingPurchase {
  id: string;
  supplier: string;
  reference: string;
  buyer: string;
  amount: string;
  startedOn: string;
  failedTries: number;
}

/**
 * The online purchases that wait for payment (SR-10, ruling 17), on the shared DataList: each with who bought, the fee and the day it was started. Where online payment is not switched on, or the buyer paid at the
 * finance counter all the same, the officer records the finance receipt here and the documents are released. A try that failed on the payment simulator is said as such: it is a simulated failure, never a finance
 * matter. The list is client-side because a row's act opens a drawer.
 */
export function PurchasesList({ exerciseId, purchases }: { exerciseId: string; purchases: AwaitingPurchase[] }) {
  const byId = new Map(purchases.map((p) => [p.id, p]));
  const rows: Row[] = purchases.map((p) => ({
    id: p.id,
    search: `${p.supplier} ${p.reference} ${p.buyer}`,
    sortKeys: { startedOn: p.startedOn, supplier: p.supplier },
    note: p.failedTries > 0 ? `${p.failedTries} ${p.failedTries === 1 ? "try" : "tries"} on the payment simulator did not pay (${SIMULATED_LABEL}).` : undefined,
    cells: {
      supplier: { kind: "stack", title: p.supplier, sub: `Bought by ${p.buyer} · ${p.reference}` },
      amount: { kind: "text", text: p.amount },
      startedOn: { kind: "text", text: p.startedOn },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      exportName="online-purchases-awaiting-payment"
      searchPlaceholder="Search by supplier or buyer"
      emptyTitle="No online purchase is waiting for payment"
      stackBelow="xl"
      actionsWidth={160}
      columns={[
        { key: "supplier", label: "Supplier", sortable: true, mobile: "primary" },
        { key: "amount", label: "Fee", width: "120px", mobile: "meta" },
        { key: "startedOn", label: "Started", width: "190px", sortable: true, nowrap: true, mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const p = byId.get(id)!;
        return <RecordPurchaseReceiptDrawer exerciseId={exerciseId} purchaseId={p.id} name={p.supplier} />;
      }}
    />
  );
}
