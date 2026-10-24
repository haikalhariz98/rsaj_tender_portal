import Link from "next/link";

import { FilesIcon } from "@/components/icons";
import { Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { SupplyClaimRow } from "@/lib/project-docs/supply-read";

import { invoiceChip } from "./document-words";
import { portalDocumentsHref } from "./portal-documents-card";

/// The contractor's delivery orders with invoices: the invoice number, the day sent and where it stands. Sent from Documents, like every claim.
export function InvoicesCard({ contractId, rows }: { contractId: string; rows: (SupplyClaimRow & { href: string })[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<FilesIcon size={17} />} title="Invoices" actions={<ButtonLink href={portalDocumentsHref(contractId)} size="sm" variant="secondary">Send in Documents</ButtonLink>} divided={rows.length > 0} />
      {rows.length === 0 ? (
        <EmptyState title="No invoice sent" size="sm" />
      ) : (
        <ul className="divide-y divide-line/70">
          {rows.map((r) => {
            const chip = invoiceChip(r);
            return (
              <li key={r.documentId} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <Link href={r.href} className="block text-[14px] font-semibold text-ink hover:underline">{r.invoiceNo}</Link>
                  <span className="block text-[12.5px] text-ink-3">{`Sent ${r.sentText}`}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Chip tone={chip.tone}>{chip.text}</Chip>
                  {r.payment && <Chip>{r.payment.amountText}</Chip>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
