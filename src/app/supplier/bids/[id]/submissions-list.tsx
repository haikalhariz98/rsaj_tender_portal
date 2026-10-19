"use client";

import { DataList, type Row } from "@/components/data-list";
import { Bi } from "@/components/ui/bilingual";
import { Callout } from "@/components/ui/feedback";
import type { SubmissionView } from "@/lib/bids/online/my-bids";
import { BID_KIND_WORDS, BID_STATUS_WORDS, SCREEN_WORDS } from "@/lib/bids/online/screen-words";

import { ReceiptCard, type ReceiptData } from "./receipt-card";
import { WithdrawControl } from "./withdraw-control";

/**
 * The supplier's own submissions on one exercise (SR-13, ADR 0036 D7, rulings 20s, 20an; build plan step 11): each with its own number, the stamp, the status and the receipt digest in full.
 * Under a row: what stands at the opening from its start (`myBidOpenedWords`, in its states), the receipt, and Withdraw. A client component because a row's act opens a dialog. Nothing is
 * computed here: every figure, state and sentence arrives from `submissionViews`.
 */
export function SubmissionsList({ reference, title, supplierName, demonstration, token, views }: { reference: string; title: string; supplierName: string; demonstration: boolean; token: string | null; views: SubmissionView[] }) {
  const byId = new Map(views.map((v) => [v.id, v]));
  const rows: Row[] = views.map((v) => ({
    id: v.id,
    sortKeys: { number: v.number },
    search: `${v.number} ${BID_KIND_WORDS[v.kind].en} ${BID_STATUS_WORDS[v.status].en}`,
    cells: {
      number: { kind: "text", text: String(v.number) },
      kind: { kind: "stack", title: BID_KIND_WORDS[v.kind].en, },
      stamp: { kind: "stack", title: v.stampText, sub: (v.late ? SCREEN_WORDS.late : SCREEN_WORDS.inTime).en },
      status: { kind: "stack", title: BID_STATUS_WORDS[v.status].en },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      exportName="my-online-bids"
      emptyTitle={SCREEN_WORDS.listEmptyTitle.en}
      emptyBody={SCREEN_WORDS.listEmptyBody.en}
      actionsPlacement="below"
      stackBelow="xl"
      columns={[
        { key: "number", label: SCREEN_WORDS.colNumber.en, width: "70px", sortable: true, mobile: "primary" },
        { key: "kind", label: SCREEN_WORDS.colKind.en, width: "190px", mobile: "meta" },
        { key: "stamp", label: SCREEN_WORDS.colStamp.en, width: "260px", mobile: "meta" },
        { key: "status", label: SCREEN_WORDS.colStatus.en, mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const v = byId.get(id)!;
        const data: ReceiptData = {
          reference, title, supplierName, number: v.number, kind: v.kind, stampText: v.stampText, late: v.late, fingerprint: v.keyFingerprint, digest: v.receiptDigest,
          demonstration, notConsidered: v.notConsidered,
        };
        return (
          <div className="flex w-full flex-col gap-3 text-left">
            <p className="text-[12.5px] text-ink-2">
              <Bi words={SCREEN_WORDS.colDigest} inline />: <span className="font-mono break-all">{v.receiptDigest}</span>
            </p>
            {v.parentNumber !== null && (
              <p className="text-[12.5px] text-ink-3"><Bi words={SCREEN_WORDS.tiedTo} inline /> {v.parentNumber}</p>
            )}
            {v.opening && (
              <Callout tone={v.status === "OPENED" ? "ok" : v.opening.digest === null ? "warn" : "info"} title={<Bi words={v.opening.headline} />}>
                <Bi words={v.opening.detail} />
              </Callout>
            )}
            {v.openingListMissing && <Callout tone="info"><Bi words={SCREEN_WORDS.rollMissing} /></Callout>}
            <details className="rounded-xl border border-line bg-surface px-4 py-3 print:border-0 print:p-0">
              <summary className="cursor-pointer text-[13.5px] font-semibold text-ink print:hidden"><Bi words={SCREEN_WORDS.showReceipt} inline /></summary>
              <div className="mt-3"><ReceiptCard data={data} /></div>
            </details>
            {v.status === "SUBMITTED" && (
              <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
                <WithdrawControl onlineBidId={v.id} token={token} linked={v.linked} allowed={v.withdraw} />
              </div>
            )}
          </div>
        );
      }}
    />
  );
}

