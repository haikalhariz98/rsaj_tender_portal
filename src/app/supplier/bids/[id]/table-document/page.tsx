import { headers } from "next/headers";
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
import { CrossSiteRefusal } from "../cross-site-refusal";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tender Table Document" };

/**
 * The Tender Table Document for inspection (Phase 4d, FR-DOC-010). Opened by a signed-in supplier while it is available (from publication to the closing), only in its approved, frozen form. The opening is written
 * to the inspection log before any of it is shown; where it cannot be written, nothing is shown. Where it is closed, the reason is said in words.
 */
export default async function TableDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireSupplier();
  const { id } = await params;
  const back = `/supplier/bids/${id}?tab=documents`;
  // What started this request, as the browser says it (a page elsewhere cannot set it): another site's request is refused before anything is logged.
  const r = await openForInspection(actor, { exerciseId: id, kind: "TABLE_DOCUMENT", secFetchSite: (await headers()).get("sec-fetch-site") });
  if (!r.open && !r.ctx) {
    if (r.crossSite) return <CrossSiteRefusal headline={r.headline} detail={r.detail} />;
    notFound();
  }
  if (!r.open) {
    return (
      <>
        <RecordCrumb label={r.ctx!.ex.reference} />
        <PageHeader title="The Tender Table Document" subtitle={`${r.ctx!.ex.reference} · ${r.ctx!.ex.title}`} />
        <Card>
          <EmptyState title={r.headline} action={<span className="flex flex-col items-center gap-3"><span className="text-[13.5px] text-ink-2">{r.detail}</span><ButtonLink href={back} variant="secondary" size="sm">Back to the documents</ButtonLink></span>} />
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
        notes={
          <div className="mb-6 flex flex-col gap-1 text-[13.5px] text-ink-2">
            <p>Each opening is logged.</p>
            {r.since.map((l) => <p key={l} className="font-semibold">{l}</p>)}
          </div>
        }
        footer="Frozen when approved for tendering."
      />
    </>
  );
}
