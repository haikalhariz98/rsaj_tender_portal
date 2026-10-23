
import { ActGate } from "@/components/act-gate";
import { FileIcon, UsersIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { formatBytes, SCAN_LABEL } from "@/lib/documents/labels";
import { formatDate } from "@/lib/format";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";
import type { DocumentPage, Gate } from "@/lib/project-docs/page-store";

import { AddApproverDrawer, ApproveDrawer, AskDrawer, MarkDrawer, RejectDrawer, RemoveApproverDrawer, UploadVersionDrawer } from "../../document-editors";
import { gateNote, STATE_TONE } from "../../document-words";

const HEADER_NOTE = "document-actions-note";
const APPROVERS_NOTE = "document-approvers-note";
const NOBODY_TO_ADD: Gate = { allowed: false, reasons: ["Nobody else holds authority to approve today."] };

const ANSWER_TONE = { APPROVED: "ok", REJECTED: "err", PENDING: "neutral" } as const;
const OUTCOME_TONE = { APPROVED: "ok", REJECTED: "err", TAKEN_UP: "ok", RETURNED: "warn" } as const;

/**
 * One Project workspace document (ADR 0042, plan step 4 §5.3): its versions, newest first, each with its files and the decisions on it; its approvers; and the four acts (upload a
 * new version, ask for it, approve, reject). Every act is the loader's gate: allowed, the drawer; not, a disabled button and the reason, said once under the header, never hidden.
 * No figure and no count anywhere. A reader with no authority reads the whole document.
 */
export function DocumentPageView({ page }: { page: DocumentPage }) {
  const latest = page.versions.at(-1) ?? null;
  const { actions } = page;
  const decideId = actions.decideVersionId;
  const common = { contractId: page.contractId, documentId: page.id, title: page.title };
  // A document of one of the six kinds (plan step 6) is taken up or returned, never approved: no approve, reject or approver is offered or explained (PW-24), and the marks are
  // the answer. An ordinary document keeps its four acts.
  const marks = page.markWords;
  // Once a kind's version is marked and final, the two marks are over: neither is shown as a disabled button.
  const showMarks = !!marks && !(page.final && !actions.markTakenUp.allowed && !actions.markReturned.allowed);
  const markGates = marks && showMarks ? [{ label: marks.takenUp, gate: actions.markTakenUp }, { label: marks.returned, gate: actions.markReturned }] : [];
  // One primary: the answer when it is the reader's to give, else the next version.
  const primary = marks ? (actions.markTakenUp.allowed && decideId ? "takenUp" : null) : actions.approve.allowed && decideId ? "approve" : actions.upload.allowed ? "upload" : null;
  const headerNote = gateNote(
    marks
      ? markGates
      : [
          { label: "Upload a new version", gate: actions.upload },
          { label: "Ask for it", gate: actions.request },
          { label: "Approve", gate: actions.approve },
          { label: "Reject", gate: actions.reject },
        ],
  );
  const blocked = (label: string, gate: Gate) => <Blocked label={label} reason={gate.reasons.join(" ")} noteId={HEADER_NOTE} />;

  const facts = [page.side === "CONTRACTOR" ? "The contractor's document" : `${page.sideLabel}'s document`, page.kindLabel, page.waitsOnLabel];

  const addGate = actions.addApprover.allowed && page.picker.length === 0 ? NOBODY_TO_ADD : actions.addApprover;
  const live = page.approvers.filter((a) => a.live);
  const gone = page.approvers.filter((a) => !a.live);
  const approversNote = gateNote([{ label: "Add approver", gate: addGate }, ...live.map((a) => ({ label: a.name, gate: a.remove }))]);

  return (
    // The Project workspace's row of the act x status table, in its own words, to every drawer and blocked button below (the loader folded it into each gate already; this says it once for the scan that every act is gated).
    <ActGate blocker={page.workspaceShut}>
      <PageHeader
        title={page.title}
        badge={<Badge tone={STATE_TONE[page.state]} dot>{page.stateLabel}</Badge>}
        subtitle={page.note || undefined}
        meta={facts}
        actionsNote={headerNote ?? undefined}
        actionsNoteId={HEADER_NOTE}
        actions={
          marks ? (
            <>
              {/* The contractor's document: the organisation marks it, and may ask for it again or send its own version only where the loader allows (no blocked copy of an act that never applies). */}
              {actions.upload.allowed && <UploadVersionDrawer {...common} tone="secondary" />}
              {actions.request.allowed && <AskDrawer {...common} />}
              {/* "Recorded under …": said only once it is taken up, and only with its link (PW-24). */}
              {page.takenUpLink && page.state === "TAKEN_UP" && <ButtonLink href={page.takenUpLink.href} size="sm" variant="secondary">{page.takenUpLink.words}</ButtonLink>}
              {showMarks && (
                <>
                  {actions.markReturned.allowed && decideId ? <MarkDrawer {...common} versionId={decideId} outcome="RETURNED" label={marks.returned} /> : blocked(marks.returned, actions.markReturned)}
                  {actions.markTakenUp.allowed && decideId ? <MarkDrawer {...common} versionId={decideId} outcome="TAKEN_UP" label={marks.takenUp} tone={primary === "takenUp" ? "primary" : "secondary"} /> : blocked(marks.takenUp, actions.markTakenUp)}
                </>
              )}
            </>
          ) : (
            <>
              {actions.upload.allowed ? <UploadVersionDrawer {...common} tone={primary === "upload" ? "primary" : "secondary"} /> : blocked("Upload a new version", actions.upload)}
              {actions.request.allowed ? <AskDrawer {...common} /> : blocked("Ask for it", actions.request)}
              {actions.approve.allowed && decideId && latest ? <ApproveDrawer {...common} versionId={decideId} versionLabel={latest.label} tone={primary === "approve" ? "primary" : "secondary"} /> : blocked("Approve", actions.approve)}
              {actions.reject.allowed && decideId && latest ? <RejectDrawer {...common} versionId={decideId} versionLabel={latest.label} /> : blocked("Reject", actions.reject)}
            </>
          )
        }
      />
      <div className="flex flex-col gap-6">
        {page.openRequest && (
          <Card>
            <CardHeader icon={<FileIcon size={17} />} title={`Asked of ${page.openRequest.toSide === "CONTRACTOR" ? "the contractor" : page.openRequest.toLabel}`} subtitle={[formatDate(page.openRequest.requestedOn), page.openRequest.note || null].filter(Boolean).join(" · ")} divided={false} />
          </Card>
        )}

        {page.versions.length === 0 && !page.openRequest && (
          <Card>
            <EmptyState size="sm" title="No versions yet" />
          </Card>
        )}

        {[...page.versions].reverse().map((v) => (
          <Card key={v.id} className="overflow-hidden">
            <CardHeader
              icon={<FileIcon size={17} />}
              title={v.label}
              subtitle={`${v.uploadedAtText} · ${v.uploadedByName}`}
              actions={v.answersRequest || v.signed ? <span className="inline-flex flex-wrap items-center gap-1.5">{v.signed && <Chip tone="ok">Signed with a password</Chip>}{v.answersRequest && <Chip>Answers the request</Chip>}</span> : undefined}
              divided={v.files.length > 0 || v.decisions.length > 0 || !!v.note}
            />
            {v.note && <CardBody pad="tight" className="text-[13.5px] break-words text-ink-2">{v.note}</CardBody>}
            {v.files.length > 0 && (
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {v.files.map((f) => (
                  <li key={f.versionId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6">
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block text-[13.5px] font-semibold break-words text-ink">{f.name}</span>
                      <span className="block text-[12.5px] text-ink-3">{formatBytes(f.bytes)}</span>
                    </span>
                    <Chip title={f.scanLabel}>{f.scanLabel === SCAN_LABEL.NOT_SCANNED ? NOT_SCANNED_LABEL : f.scanLabel}</Chip>
                    <a href={`/api/documents/versions/${f.versionId}`} download className={buttonClass("secondary", "sm")} aria-label={`Download ${f.name}`}>
                      Download
                    </a>
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
                      <span className="font-semibold text-ink">{d.approverName ?? d.decidedByName}</span>
                      <span className="text-[12.5px] text-ink-3">{formatDate(d.decidedOn)}</span>
                    </span>
                    {d.remarks && <p className="text-[13.5px] break-words text-ink-2">{d.remarks}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}

        {!marks && (
        <Card className="overflow-hidden">
          <CardHeader
            icon={<UsersIcon size={17} />}
            title="Approvers"
            divided={page.approvers.length > 0}
            actions={addGate.allowed ? <AddApproverDrawer contractId={page.contractId} documentId={page.id} picker={page.picker} /> : <Blocked label="Add approver" reason={addGate.reasons.join(" ")} noteId={APPROVERS_NOTE} />}
          />
          {(approversNote || page.ownVersionApproverNames.length > 0) && (
            <div id={APPROVERS_NOTE} className="flex flex-col gap-1 border-b border-line/70 px-5 py-3 text-[12.5px] text-ink-3 sm:px-6">
              {approversNote && <p>{approversNote}</p>}
              {page.ownVersionApproverNames.length > 0 && <p>{`${page.ownVersionApproverNames.join(", ")} uploaded the latest version, so another approver decides it.`}</p>}
            </div>
          )}
          {page.approvers.length === 0 ? (
            <EmptyState size="sm" title="No approvers" />
          ) : (
            <ul className="divide-y divide-line/70">
              {live.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6">
                  <span className="min-w-0 flex-1 basis-48 text-[13.5px] font-semibold break-words text-ink">{a.name}</span>
                  {a.answerLabel && <Chip tone={ANSWER_TONE[a.answer!]}>{a.answerLabel}</Chip>}
                  {a.remove.allowed ? <RemoveApproverDrawer contractId={page.contractId} documentId={page.id} approverId={a.id} name={a.name} /> : <Blocked label="Remove" ariaLabel={`Remove ${a.name} as an approver`} reason={a.remove.reasons.join(" ")} noteId={APPROVERS_NOTE} />}
                </li>
              ))}
              {gone.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 px-5 py-3 text-ink-3 sm:px-6">
                  <span className="text-[13.5px] break-words">{a.name}</span>
                  <span className="text-[12.5px] break-words">{`Removed ${a.removedOn ? formatDate(a.removedOn) : ""}${a.removeReason ? `: ${a.removeReason}` : ""}`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        )}
      </div>
    </ActGate>
  );
}
