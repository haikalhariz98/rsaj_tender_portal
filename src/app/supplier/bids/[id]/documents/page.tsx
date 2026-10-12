import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { TenderDocumentArticle } from "@/components/tender-document";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { releasedPackOf } from "@/lib/portal/bids/download-store";
import { openForInspection } from "@/lib/portal/bids/inspection-store";
import { issueFormToken } from "@/lib/auth/form-secret";
import { DownloadIcon } from "@/components/icons";

import { requireSupplier } from "../../../../_auth/supplier";
import { CrossSiteRefusal } from "../cross-site-refusal";

export const dynamic = "force-dynamic";

/**
 * The tender documents released to a supplier online (Phase 4d, FR-VND-012). Shown only when the organisation has set that documents are released online, a sale to this supplier stands, an officer has recorded
 * its payment receipt, and the window is between publication and the closing; only in the approved, frozen form. Opening it is logged before it is shown. Otherwise the reason is said in words.
 */
export default async function ReleasedDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireSupplier();
  const { id } = await params;
  const back = `/supplier/bids/${id}?tab=documents`;
  // What started this request, as the browser says it (a page elsewhere cannot set it): another site's request is refused before anything is logged.
  const r = await openForInspection(actor, { exerciseId: id, kind: "PACK", secFetchSite: (await headers()).get("sec-fetch-site") });
  if (!r.open && !r.ctx) {
    if (r.crossSite) return <CrossSiteRefusal headline={r.headline} detail={r.detail} />;
    notFound();
  }
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
  // SR-10 (ruling 17): the issued parts of the frozen pack as files to keep: its uploaded files and its merged texts. Each download is logged against the company.
  const pack = await releasedPackOf(actor.organisationId, r.ctx.ex.id);
  const token = issueFormToken("bids");
  const link = (q: string) => `/supplier/bids/${id}/download?${q}${token ? `&t=${encodeURIComponent(token)}` : ""}`;
  return (
    <>
      <RecordCrumb label={r.ctx.ex.reference} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back}>Back to the documents</Link>
      </div>
      {pack && (pack.files.length > 0 || pack.texts.length > 0) && (
        <Card className="mb-6 print:hidden">
          <CardHeader icon={<DownloadIcon size={17} />} title="Download your documents" subtitle={`The issued parts of version ${pack.packVersion}, as frozen when they were approved for tendering. Each download is logged against your company.`} />
          <CardBody>
            {!token && <p className="mb-3 text-[13px] text-ink-2">Downloads are closed: the person who runs the portal has not set its form key.</p>}
            <ul className="flex flex-col divide-y divide-line/70">
              {pack.files.map((f) => (
                <li key={f.versionId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="min-w-0 text-[14px] text-ink"><span className="font-semibold">{f.title}</span><span className="block text-[12.5px] text-ink-3">{f.partLabel} · file, version {f.versionNo}</span></span>
                  {token && <a href={link(`file=${encodeURIComponent(f.versionId)}`)} className={buttonClass("secondary", "sm")} download>Download</a>}
                </li>
              ))}
              {pack.texts.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="min-w-0 text-[14px] text-ink"><span className="font-semibold">{t.title}</span><span className="block text-[12.5px] text-ink-3">{t.partLabel} · text</span></span>
                  {token && <a href={link(`text=${encodeURIComponent(t.id)}`)} className={buttonClass("secondary", "sm")} download>Download</a>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      <TenderDocumentArticle
        v={r.view}
        table={false}
        notes={<div className="mb-6 flex flex-col gap-1 text-[13.5px] font-semibold text-ink-2">{r.since.map((l) => <p key={l}>{l}</p>)}</div>}
        footer="The text frozen when the documents were approved for tendering. Addenda issued since are under Addenda. Files are bound in separately."
      />
    </>
  );
}
