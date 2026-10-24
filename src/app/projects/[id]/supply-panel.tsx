import Link from "next/link";

import { ActGate } from "@/components/act-gate";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { StatusCounts } from "@/components/ui/status-counts";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import {
  supplyClaimCounts,
  type SupplyClaimRow,
} from "@/lib/project-docs/supply-read";

import { RecordSupplyPaymentDrawer } from "./supply-editors";

type Option = { value: string; label: string };
const TONE = {
  WITH_ORGANISATION: "info",
  RETURNED: "warn",
  VERIFIED: "ok",
  PAID: "ok",
} as const;

/// The Payments tab's "Supply invoices": shown only where the contract's route is delivery order and invoice (the caller decides). Every word and figure is the library's.
export function SupplyInvoices({
  contractId,
  status,
  rows,
  people,
  today,
  zoneBlocker,
}: {
  contractId: string;
  status: ContractStatus;
  rows: SupplyClaimRow[];
  people: Option[];
  today: string | null;
  zoneBlocker: string | null;
}) {
  // The table's PROJECT_WORKSPACE row first, then the time zone; the one drawer is gated by it.
  const shut = actStatusBlocker("PROJECT_WORKSPACE", status);
  const blocker = shut ?? zoneBlocker;
  const n = supplyClaimCounts(rows);
  const here = `/projects/${contractId}?tab=payments&section=supply`;
  return (
    <ActGate blocker={shut}>
      <div className="flex flex-col gap-3">
        <StatusCounts
          label="Supply invoices"
          items={[
            { label: "To verify", count: n.toVerify, href: here, tone: "info" },
            {
              label: "To record payment",
              count: n.toRecordPayment,
              href: here,
              tone: "ok",
            },
          ]}
        />
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState size="sm" title="None sent yet" />
          ) : (
            <ul className="divide-y divide-line/70">
              {rows.map((r) => (
                <li
                  key={r.documentId}
                  className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold break-words text-ink">
                      <Link
                        href={`/projects/${contractId}/documents/${r.documentId}`}
                      >
                        {r.invoiceNo}
                      </Link>
                      <Badge tone={TONE[r.state]}>{r.stateLabel}</Badge>
                    </span>
                    <span className="block text-[12.5px] break-words text-ink-3">{`Sent ${r.sentText}`}</span>
                    {r.payment?.note ? (
                      <span className="block text-[12.5px] break-words text-ink-3">
                        {r.payment.note}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {r.payable ? (
                      <RecordSupplyPaymentDrawer
                        id={contractId}
                        documentId={r.documentId}
                        invoiceNo={r.invoiceNo}
                        people={people}
                        today={today}
                        blocker={blocker}
                      />
                    ) : null}
                    <ButtonLink
                      href={`/projects/${contractId}/documents/${r.documentId}`}
                      size="sm"
                      variant="ghost"
                    >
                      Open
                    </ButtonLink>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </ActGate>
  );
}
