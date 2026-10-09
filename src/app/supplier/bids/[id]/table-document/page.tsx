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
 * The Tender Table Document for inspection (Phase 4d, FR-DOC-010). Opened by a signed-in supplier while it is available (from publication to the closing), only in its approved, frozen form. The opening is written
 * to the inspection log before any of it is shown; where it cannot be written, nothing is shown. Where it is closed, the reason is said in words.
 */
export default async function TableDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireSupplier();
  const { id } = await params;
  const back = `/supplier/bids/${id}?tab=documents`;
  const r = await openForInspection(actor, { exerciseId: id, kind: "TABLE_DOCUMENT" });
  if (!r.open && !r.ctx) notFound();
  if (!r.open) {
    return (
      <>
        <RecordCrumb label={r.ctx!.ex.reference} />
        <PageHeader eyebrow={<Link href={back}>Back to the documents</Link>} title="The Tender Table Document" subtitle={`${r.ctx!.ex.reference} · ${r.ctx!.ex.title}`} />
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
        table
        notes={<p className="mb-6 text-[13.5px] text-ink-2">Only the parts of the documents the notice puts on the tender table. Your opening of this page is logged against your company. Files bound into the documents are inspected at the counter.</p>}
        footer="The text frozen when the documents were approved for tendering. Files are bound in separately."
      />
    </>
  );
}
