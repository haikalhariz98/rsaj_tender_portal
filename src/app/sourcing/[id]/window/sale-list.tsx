"use client";

import Link from "next/link";

import { DataList, type Row } from "@/components/data-list";
import { Button, buttonClass } from "@/components/ui/button";

import { SIMULATED_LABEL } from "@/lib/integration/payment-labels";
import { voidRefusalNote } from "@/lib/window/sale";

import { RecordReceiptDrawer, VoidSaleDrawer } from "./editors";

/// A sale as the register's read model gives it (`saleRegister`, src/lib/window/read.ts), trimmed to what the list shows.
export interface SaleRow {
  id: string;
  purchaser: string;
  registrationNo: string;
  receipt: string;
  /// SR-10: paid on the payment simulator: not a finance receipt, and not waiting for one.
  simulated: boolean;
  amount: string;
  soldOn: string;
  paymentMethod: string;
  checks: { text: string; warn: boolean }[];
  addendaAcknowledged: string;
  issuedBy: string;
  voided: string | null;
  void: { allowed: true } | { allowed: false; reason: string; registerWide: boolean } | null;
}

/**
 * The sale register on the shared DataList: each sale with its receipt, amount, day and the
 * checks as attested, the registration and suspension reading "not checked" until the supplier
 * register exists. A row's acts open drawers, so the list is a client component (its actions
 * are functions of the row). A void sale stays on the register, marked, and keeps its reason. A
 * disabled Void states why under its sale, or once beside the register's acts where the reason is
 * the window's (65-C2).
 */
export function SaleList({ exerciseId, sales }: { exerciseId: string; sales: SaleRow[] }) {
  const byId = new Map(sales.map((s) => [s.id, s]));
  const rows: Row[] = sales.map((s) => ({
    id: s.id,
    views: [...(s.voided ? ["void"] : ["live"]), ...(!s.voided && !s.simulated && s.receipt === "Not recorded" ? ["noreceipt"] : [])],
    search: `${s.purchaser} ${s.registrationNo} ${s.receipt}`,
    sortKeys: { soldOn: s.soldOn, purchaser: s.purchaser },
    note: s.voided ?? (s.void && !s.void.allowed && !s.void.registerWide ? voidRefusalNote(s.void.reason) : undefined),
    cells: {
      purchaser: { kind: "stack", title: s.purchaser, sub: s.registrationNo },
      receipt: { kind: "stack", title: s.receipt, sub: `${s.amount} · ${s.paymentMethod || "payment not recorded"}` },
      soldOn: { kind: "text", text: s.soldOn },
      checks: {
        kind: "chips",
        items: [
          ...(s.voided ? [{ text: "Void", tone: "err" as const }] : []),
          ...(s.simulated ? [{ text: SIMULATED_LABEL, tone: "warn" as const }] : []),
          ...s.checks.map((c) => ({ text: c.text, tone: c.warn ? ("warn" as const) : ("ok" as const) })),
        ],
      },
      addenda: { kind: "text", text: s.addendaAcknowledged },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      exportName="sale-register"
      searchPlaceholder="Search by contractor or receipt"
      emptyTitle="Nothing sold yet"
      views={[
        { id: "live", label: "Live sales" },
        { id: "noreceipt", label: "Receipt to collect" },
        { id: "void", label: "Void" },
      ]}
      actionsWidth={132}
      stackBelow="xl"
      columns={[
        { key: "purchaser", label: "Purchaser", sortable: true, mobile: "primary" },
        { key: "receipt", label: "Receipt and amount", width: "156px", mobile: "meta" },
        { key: "soldOn", label: "Sold on", width: "124px", sortable: true, mobile: "meta" },
        { key: "checks", label: "Checks", width: "244px", mobile: "meta" },
        { key: "addenda", label: "Addenda acknowledged", width: "118px", mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const s = byId.get(id)!;
        return (
          <span className="flex flex-wrap items-center justify-end gap-1">
            <Link href={`/sourcing/${exerciseId}/label/${s.id}`} className={buttonClass("ghost", "sm")} aria-label={`Print the label for ${s.purchaser}`}>
              Label
            </Link>
            {!s.voided && !s.simulated && s.receipt === "Not recorded" && <RecordReceiptDrawer exerciseId={exerciseId} saleId={s.id} name={s.purchaser} />}
            {!s.voided && s.void && (s.void.allowed ? <VoidSaleDrawer exerciseId={exerciseId} saleId={s.id} name={s.purchaser} /> : <Button size="sm" variant="ghost" disabled title={s.void.reason}>Void</Button>)}
          </span>
        );
      }}
    />
  );
}
