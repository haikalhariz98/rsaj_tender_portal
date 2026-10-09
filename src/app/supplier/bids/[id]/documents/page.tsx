import Link from "next/link";
import { notFound } from "next/navigation";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { TenderDocumentArticle } from "@/components/tender-document";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { openForInspection } from "@/lib/portal/bids/inspection-store";

import { requireSupplier } from "../../../../_auth/supplier";

export const dynamic = "force-dynamic";

/**
 * The tender documents released to a supplier online (Phase 4d, FR-VND-012). Shown only when the organisation has set that documents are released online, a sale to this supplier stands, an officer has recorded
 * its payment receipt, and the window is between publication and the closing; only in the approved, frozen form. Opening it is logged before it is shown. Otherwise the reason is said in words.
 */
export default async function ReleasedDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireSupplier();
  const { id } = await params;
  const back = `/supplier/bids/${id}?tab=documents`;
  const r = await openForInspection(actor, { exerciseId: id, kind: "PACK" });
  if (!r.open && !r.ctx) notFound();
  if (!r.open) {
    return (
      <>
        <RecordCrumb label={r.ctx!.ex.reference} />
        <PageHeader eyebrow={<Link href={back}>Back to the documents</Link>} title="Your copy of the documents" subtitle={`${r.ctx!.ex.reference} · ${r.ctx!.ex.title}`} />
        <Card>
          <EmptyState title={r.headline} action={<ButtonLink href={back} variant="secondary" size="sm">Back to the documents</ButtonLink>}>{r.detail}</EmptyState>
        </Card>
      </>
    );
  }
  return (
    <>
      <RecordCrumb label={r.ctx.ex.reference} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back}>Back to the documents</Link>
      </div>
      <TenderDocumentArticle
        v={r.view}
        table={false}
        notes={<div className="mb-6 flex flex-col gap-1 text-[13.5px] font-semibold text-ink-2">{r.since.map((l) => <p key={l}>{l}</p>)}</div>}
        footer="The text frozen when the documents were approved for tendering. Addenda issued since are under Addenda. Files are bound in separately."
      />
    </>
  );
}
