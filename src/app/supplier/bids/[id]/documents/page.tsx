import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { TenderDocumentArticle } from "@/components/tender-document";
import { ButtonLink } from "@/components/ui/button";
import { DataList, type Cell, type Row } from "@/components/data-list";
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
          <EmptyState title={r.headline} action={<div className="flex flex-col items-center gap-3"><p className="text-[13.5px] text-ink-2">{r.detail}</p><ButtonLink href={back} variant="secondary" size="sm">Back to the documents</ButtonLink></div>} />
        </Card>
      </>
    );
  }
  // SR-10 (ruling 17): the issued parts of the frozen pack as files to keep: its uploaded files and its merged texts. Each download is logged against the company.
  const pack = await releasedPackOf(actor.organisationId, r.ctx.ex.id);
  const token = issueFormToken("bids");
  const link = (q: string) => `/supplier/bids/${id}/download?${q}${token ? `&t=${encodeURIComponent(token)}` : ""}`;
  // Without the form key the link would be refused, so the cell says so instead of offering it.
  const get = (title: string, q: string): Cell => (token ? { kind: "download", text: "Download", label: `Download ${title}`, href: link(q) } : { kind: "text", text: "Closed", dim: true });
  const rows: Row[] = [
    ...(pack?.files ?? []).map((f): Row => ({ id: `f${f.versionId}`, search: `${f.title} ${f.partLabel}`, cells: { item: { kind: "stack", title: f.title, sub: f.partLabel }, kind: { kind: "text", text: `File, version ${f.versionNo}` }, get: get(f.title, `file=${encodeURIComponent(f.versionId)}`) } })),
    ...(pack?.texts ?? []).map((t): Row => ({ id: `t${t.id}`, search: `${t.title} ${t.partLabel}`, cells: { item: { kind: "stack", title: t.title, sub: t.partLabel }, kind: { kind: "text", text: "Text" }, get: get(t.title, `text=${encodeURIComponent(t.id)}`) } })),
  ];
  return (
    <>
      <RecordCrumb label={r.ctx.ex.reference} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back}>Back to the documents</Link>
      </div>
      {pack && (pack.files.length > 0 || pack.texts.length > 0) && (
        <Card className="mb-6 print:hidden">
          <CardHeader icon={<DownloadIcon size={17} />} title="Download your documents" subtitle={`Version ${pack.packVersion}. Each download is logged.`} />
          <CardBody>
            {!token && <p className="mb-3 text-[13px] text-ink-2">Downloads closed. Tell the portal operator.</p>}
            <DataList
              flat
              selectable={false}
              searchable={false}
              toolbar={false}
              exportName="released-documents"
              emptyTitle="Nothing to download"
              columns={[
                { key: "item", label: "Document", mobile: "primary" },
                { key: "kind", label: "Kind", width: "170px", mobile: "meta" },
                { key: "get", label: "Download", width: "140px", mobile: "meta" },
              ]}
              rows={rows}
            />
          </CardBody>
        </Card>
      )}
      <TenderDocumentArticle
        v={r.view}
        table={false}
        notes={<div className="mb-6 flex flex-col gap-1 text-[13.5px] font-semibold text-ink-2">{r.since.map((l) => <p key={l}>{l}</p>)}</div>}
        footer="Frozen when approved for tendering."
      />
    </>
  );
}
