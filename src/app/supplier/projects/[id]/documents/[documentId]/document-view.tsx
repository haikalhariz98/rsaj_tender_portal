import Link from "next/link";

import { gateNote } from "@/app/projects/[id]/document-words";
import { FileIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { formatBytes, SCAN_LABEL } from "@/lib/documents/labels";
import { formatDate } from "@/lib/format";
import type { Gate } from "@/lib/project-docs/page-store";
import { FROM_YOU } from "@/lib/project-docs/contractor-view";
import { kindChoices } from "@/lib/project-docs/labels";
import type { PortalDocumentPage } from "@/lib/project-docs/portal-read";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";

import { AskDrawer, UploadVersionDrawer } from "../../document-drawers";
import { OUTCOME_TONE, portalTone, SENDING_CLOSED } from "../../document-words";
import { portalDocumentsHref } from "../../portal-documents-card";

const HEADER_NOTE = "portal-document-actions-note";

/// The file's link: a plain anchor (never a prefetched link: opening it writes the access log), carrying the page's own form key as `t`. Without a key, the name only.
const fileHref = (href: string, token: string) => `${href}?t=${encodeURIComponent(token)}`;

/**
 * One document as the contractor reads it (the simple Project workspace, plan step 5): its versions, newest first, each with its files and, on the contractor's own documents, the
 * remarks sent back with them, by the organisation and never by an officer; and the two acts it may take (send a new version, ask for it), each shown blocked with its reason when it
 * may not be taken. No access log, no figure and no count. A document the organisation is still preparing for the contractor shows the request, not a list of versions.
 */
export function PortalDocumentView({ page, contractNumber, token }: { page: PortalDocumentPage; contractNumber: string; token: string | null }) {
  const mine = page.fromLabel === FROM_YOU;
  const closedKey: Gate = { allowed: false, reasons: [SENDING_CLOSED] };
  const upload = token ? page.actions.upload : closedKey;
  const request = token ? page.actions.request : closedKey;
  const common = { contractId: page.contractId, documentId: page.id, title: page.title, token };
  const headerNote = gateNote([
    { label: "Upload a new version", gate: upload },
    { label: "Ask for it", gate: request },
  ]);
  const blocked = (label: string, gate: Gate) => <Blocked label={label} reason={gate.reasons.join(" ")} noteId={HEADER_NOTE} />;
  const open = page.requests.filter((r) => r.answeredByVersion === null);
  const tone = portalTone(page);

  return (
    <>
      <PageHeader
        title={page.title}
        badge={<Badge tone={tone} dot>{page.stateLabel}</Badge>}
        subtitle={page.note || undefined}
        meta={[mine ? "Your document" : `${page.fromLabel}'s document`, page.kindLabel, page.waitsOnLabel, <Link key="contract" href={portalDocumentsHref(page.contractId)}>{`Contract ${contractNumber}`}</Link>]}
        actionsNote={headerNote ?? undefined}
        actionsNoteId={HEADER_NOTE}
        actions={
          <>
            {upload.allowed ? <UploadVersionDrawer {...common} tone="primary" asksPassword={page.asksPassword} mayPickKind={page.mayPickKind} takesFiles={page.takesPurposes} kinds={kindChoices(page.paymentRoute)} /> : blocked("Upload a new version", upload)}
            {request.allowed ? <AskDrawer {...common} organisationName={page.organisationName} /> : blocked("Ask for it", request)}
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {open.map((r) => (
          <Card key={r.id}>
            <CardHeader icon={<FileIcon size={17} />} title={`Asked of ${r.toLabel === "You" ? "you" : r.toLabel}`} subtitle={[formatDate(r.requestedOn), r.note || null].filter(Boolean).join(" · ")} divided={false} />
          </Card>
        ))}

        {page.versions.length === 0 && open.length === 0 && (
          <Card>
            <EmptyState size="sm" title="No versions yet" />
          </Card>
        )}

        {[...page.versions].reverse().map((v) => (
          <Card key={v.id} className="overflow-hidden">
            <CardHeader
              icon={<FileIcon size={17} />}
              title={v.label}
              subtitle={`${formatDate(v.uploadedOn)} · ${v.uploadedByName}`}
              actions={v.answersRequest || v.signed ? <span className="inline-flex flex-wrap items-center gap-1.5">{v.signed && <Chip tone="ok">Signed with a password</Chip>}{v.answersRequest && <Chip>Answers the request</Chip>}</span> : undefined}
              divided={v.files.length > 0 || v.decisions.length > 0 || !!v.note}
            />
            {v.note && <CardBody pad="tight" className="text-[13.5px] break-words text-ink-2">{v.note}</CardBody>}
            {v.files.length > 0 && (
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {v.files.map((f) => (
                  <li key={f.attachmentId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6">
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block text-[13.5px] font-semibold break-words text-ink">{f.name}</span>
                      <span className="block text-[12.5px] text-ink-3">{[f.typeLabel, formatBytes(f.bytes)].join(" · ")}</span>
                    </span>
                    <Chip title={f.scanLabel}>{f.scanLabel === SCAN_LABEL.NOT_SCANNED ? NOT_SCANNED_LABEL : f.scanLabel}</Chip>
                    {token ? (
                      <a href={fileHref(f.href, token)} download className={buttonClass("secondary", "sm")} aria-label={`Download ${f.name}`}>
                        Download
                      </a>
                    ) : (
                      <Button variant="secondary" size="sm" disabled aria-label={`Download ${f.name}`}>
                        Download
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {v.decisions.length > 0 && (
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {v.decisions.map((d, i) => (
                  <li key={i} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                    <span className="flex flex-wrap items-center gap-2 text-[13.5px]">
                      <Badge tone={OUTCOME_TONE[d.outcome]}>{d.outcomeLabel}</Badge>
                      <span className="font-semibold text-ink">{d.byName}</span>
                      <span className="text-[12.5px] text-ink-3">{formatDate(d.decidedOn)}</span>
                    </span>
                    {d.remarks && <p className="text-[13.5px] break-words whitespace-pre-line text-ink-2">{d.remarks}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
