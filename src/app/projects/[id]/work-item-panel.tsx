import Link from "next/link";

import { SelectCell } from "@/components/data-list";
import { BuildingIcon, SwapIcon } from "@/components/icons";
import { Activity, type ActivityEntry } from "@/components/ui/activity";
import { Badge, Chip } from "@/components/ui/badge";
import { Composer, type ComposerAudience } from "@/components/ui/composer";
import { Note } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import type { LoadedContract } from "@/lib/contract/repo";
import { clockTimeIn, dayOf, dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { documentFaultText } from "@/lib/documents/labels";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { TEXT_MAX } from "@/lib/work/bounds";
import { cardMoves } from "@/lib/work/board";
import { removeFileFaults } from "@/lib/work/audience";
import { CONTRACTOR_ASSIGNEE, typeHasField } from "@/lib/work/fields";
import { commentAudience } from "@/lib/work/audience";
import { answerIsDraft } from "@/lib/work/portal";
import { shareFaults } from "@/lib/work/sharing";
import { SCAN_LABEL } from "@/lib/documents/labels";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";
import { ACTION_WORDS, itemRefText, LATE_NOT_JUDGED_WORDS, latenessWords, NCR_WORD, removeFileWords, STATUS_WORDS, TYPE_WORDS, whoCanWords } from "@/lib/work/labels";
import { lateness } from "@/lib/work/late";
import { contractorNameOf, loadActivity, loadItem, namesOf, whoNamesOf, type WorkContext } from "@/lib/work/load";
import { isOpen, primaryActions, TARGET } from "@/lib/work/move";
import { personIdOf } from "@/lib/work/party";
import type { WorkAction, WorkActor } from "@/lib/work/types";

import { commentOnWorkItem, editWorkField, moveWorkItem } from "./work-actions";
import { AttachFiles, FieldEdit, LinkPicker, RemoveFile, UnlinkButton, WorkPanelShell } from "./work-controls";
import { ItemActions } from "./work-editors";
import { editWhy, IMPACT_OPTIONS, PRIORITY_OPTIONS, RESULT_OPTIONS, SEVERITY_OPTIONS, shareConfirmWords, STATUS_OPTIONS } from "./work-shared";

/// The composer's two audiences on a shared item (B-2): Reply is the default (WB-9).
const AUDIENCES: readonly ComposerAudience[] = [
  { value: "REPLY", label: "Reply", send: "Send reply", placeholder: "Write a reply…" },
  { value: "INTERNAL", label: "Internal note", send: "Add note", internal: true, placeholder: "Write an internal note…" },
];
const section = "text-[13px] font-semibold tracking-wide text-ink-3 uppercase";
type Option = { value: string; label: string };
export type PanelHrefs = { close: string; item: (ref: string) => string };

/**
 * The side panel of one item (`&item=RFI-12`; plan §4; 0008 §5.4): its status and one primary action, its fields (a type's own after the common ones), links, files, then Activity
 * with the comment box. Whatever the reader may not do is drawn read only with who can in a popover; the same pure rules the acts use decide it here (`primaryActions`, `cardMoves`,
 * `mayEdit`). An address that names no item on this contract says so.
 */
export async function WorkItemPanel({ l, ctx, hrefs, project, personId, address, people, linkOpts, noAccount }: { l: LoadedContract; ctx: WorkContext; /** Where closing the panel goes, and where a linked item opens: the Work tab's address, or My work's. */ hrefs: PanelHrefs; /** My work names the project in the header, with a link into its Work tab. */ project?: { label: string; href: string }; personId: string; address: string; people: Option[]; linkOpts: { items: Option[]; documents: Option[] }; /** The contractor has no active portal account (read once by the tab). */ noAccount: boolean }) {
  const org = l.org.id;
  const contractId = l.contract.id;
  const closeHref = hrefs.close;
  const detail = await loadItem({ organisationId: org, contractId, ref: address, timeZone: ctx.timeZone });
  if (!detail) {
    return (
      <WorkPanelShell label="Work item" closeHref={closeHref} title="Item not found">
        <Note>That item isn&apos;t on this contract.</Note>
      </WorkPanelShell>
    );
  }
  const c = detail.card;
  const actor: WorkActor = { side: "STAFF", personId, leadIds: ctx.lead.ids, mayReadContract: true };
  // The pickers come from the tab (it loaded them for the list); the item itself is not offered to link to.
  const links = { ...linkOpts, items: linkOpts.items.filter((o) => o.value !== c.id) };
  const contractor = contractorNameOf(l);
  const shared = c.sharedAt !== null;
  const [who, activity, attachers] = await Promise.all([
    whoNamesOf(db, org, { raisedByPersonId: personIdOf(c.raisedBy), assigneePersonId: personIdOf(c.assignee), assignedToContractor: c.assignee?.kind === "CONTRACTOR" }, ctx.lead),
    loadActivity({ organisationId: org, contractId, contractNumber: ctx.contractNumber, item: { id: c.id, type: c.type, number: c.number }, timeZone: ctx.timeZone }),
    namesOf(db, org, detail.files.flatMap((f) => (f.attachedByPersonId ? [f.attachedByPersonId] : []))),
  ]);
  const itemLabel = itemRefText(c.type, c.number);
  const why = editWhy(ctx, c, actor, who);
  const editable = why === undefined;
  const base = { contractId, itemId: c.id };
  const lateText = latenessWords(lateness(c.dueOn, c.status, ctx.today));

  // The status select: where this reader may take it now, and where it stands. Cancel and Send back collect words, so they are the menu's, never a select's.
  const moves = cardMoves(c, actor, { contractOpen: ctx.open, who });
  const reachable: string[] = [c.status, ...moves.moves];
  // Share (WB-2) is in the menu while the reader may do it; the confirm is the client's.
  const mayShare = ctx.open && !shared && shareFaults(c, actor, true, who).length === 0;
  const pa = primaryActions(c, actor, { contractOpen: ctx.open, who });
  const wordsOf = (a: WorkAction) => ACTION_WORDS[a].en;
  const menu = pa.menu.map((a) => ({ kind: (a === "CANCEL" ? "cancel" : a === "SEND_BACK" ? "sendBack" : "move") as "move" | "cancel" | "sendBack", label: wordsOf(a), to: TARGET[a] }));

  const select = (field: string, label: string, value: string, options: Option[]) => (
    <div className="min-w-0">
      <div className="mb-1 text-[12.5px] font-semibold text-ink-3">{label}</div>
      <SelectCell cell={{ kind: "select", name: "value", value, options, label, action: editWorkField, fields: { ...base, field }, disabledWhy: why }} />
    </div>
  );
  // "Me" first (W-6), then everyone else by name; unassigned is a valid state.
  const peopleOptions: Option[] = [
    { value: "", label: "Unassigned" },
    ...people.filter((p) => p.value === personId).map((p) => ({ ...p, label: `${p.label} (me)` })),
    ...people.filter((p) => p.value !== personId),
  ];
  // The wall-clock value needs the organisation's time zone; without one the field is read only and says so.
  const wall = detail.happenedAt && ctx.timeZone ? `${dayOf(detail.happenedAt, ctx.timeZone)}T${clockTimeIn(detail.happenedAt, ctx.timeZone)}` : "";
  const happenedWhy = why ?? (ctx.timeZone ? undefined : LATE_NOT_JUDGED_WORDS.en);
  const feed: ActivityEntry[] = activity.map((a) => ({ id: a.id, kind: a.kind === "COMMENT" ? "comment" : "event", who: a.who, at: formatOrgDateTime(a.at, ctx.timeZone), iso: a.at.toISOString(), text: a.kind === "COMMENT" ? a.body : a.text, internal: shared && a.kind === "COMMENT" && a.internal }));

  return (
    <WorkPanelShell
      key={address}
      label={`Work item ${itemLabel}`}
      closeHref={closeHref}
      title={`${itemLabel} · ${c.title}`}
      subtitle={
        project ? (
          <>
            {TYPE_WORDS[c.type].en} ·{" "}
            <Link href={project.href} className="font-semibold">
              {project.label}
            </Link>
          </>
        ) : (
          TYPE_WORDS[c.type].en
        )
      }
      badge={
        <>
          {shared ? (
            <Badge tone="info">
              <SwapIcon size={12} /> Shared
            </Badge>
          ) : (
            <Badge outline>Not shared</Badge>
          )}
          {lateText && <Badge tone="err">{lateText}</Badge>}
          {c.type === "INSPECTION" && c.inspectionResult === "FAILED" && isOpen(c.status) && <Badge tone="err">{NCR_WORD.en}</Badge>}
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {!ctx.open && <Note>{why}</Note>}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-44">
            <div className="mb-1 text-[12.5px] font-semibold text-ink-3">Status</div>
            <SelectCell
              cell={{
                kind: "select",
                name: "to",
                value: c.status,
                label: "Status",
                options: STATUS_OPTIONS.filter((o) => reachable.includes(o.value)),
                action: moveWorkItem,
                fields: { ...base, from: c.status },
                disabledWhy: moves.moves.length === 0 ? (moves.stuckWhy ?? (ctx.open ? whoCanWords("MARK_DONE", who).en : why)) : undefined,
              }}
            />
          </div>
          <ItemActions
            {...base}
            from={c.status}
            itemLabel={itemLabel}
            primary={pa.primary ? { label: wordsOf(pa.primary), to: TARGET[pa.primary] } : null}
            disabled={pa.disabled ? { label: wordsOf(pa.disabled.action), whoCan: pa.disabled.whoCan.en } : null}
            menu={menu}
            share={mayShare ? { contractor, noAccount } : null}
            sendBackSeenBy={commentAudience(c, "STAFF", null, "SEND_BACK") === "REPLY" ? contractor : null}
          />
        </div>

        {c.status === "CANCELLED" && detail.cancelReason && (
          <p className="text-[13.5px] text-ink-2">
            <span className="font-semibold text-ink">Cancelled:</span> {detail.cancelReason}
          </p>
        )}

        <FieldEdit label="Title" field="title" value={c.title} {...base} disabledWhy={why} />
        <FieldEdit label="Description" field="description" kind="textarea" value={detail.description} {...base} disabledWhy={why} />
        {typeHasField(c.type, "answer") && (
          <FieldEdit label="Answer" field="answer" kind="textarea" value={c.answer} {...base} disabledWhy={why} badge={answerIsDraft(c) ? { text: "Draft", why: `${contractor} has not yet sent it for checking.` } : undefined} />
        )}

        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
              Assignee {c.assignee?.kind === "CONTRACTOR" && <BuildingIcon size={13} />}
            </div>
            <SelectCell
              cell={{
                kind: "select",
                name: "value",
                value: c.assignee?.kind === "CONTRACTOR" ? CONTRACTOR_ASSIGNEE : (personIdOf(c.assignee) ?? ""),
                options: peopleOptions,
                label: "Assignee",
                action: editWorkField,
                fields: { ...base, field: "assigneePersonId" },
                disabledWhy: why,
                flag: noAccount ? { value: CONTRACTOR_ASSIGNEE, text: "No active portal account" } : undefined,
                confirm: { when: CONTRACTOR_ASSIGNEE, ...shareConfirmWords(contractor, noAccount), confirmLabel: "Share", cancelLabel: "Keep it internal" },
              }}
            />
          </div>
          {select("priority", "Priority", c.priority, PRIORITY_OPTIONS)}
          <FieldEdit label="Due" field="dueOn" kind="date" value={c.dueOn ?? ""} display={c.dueOn ? formatDate(dayToDate(c.dueOn)) : ""} {...base} disabledWhy={why} />
          <FieldEdit label="Location" field="location" value={c.location} {...base} disabledWhy={why} />
          {typeHasField(c.type, "impact") && select("impact", "Impact", detail.impact ?? "", [{ value: "", label: "Not set" }, ...IMPACT_OPTIONS])}
          {typeHasField(c.type, "inspectionResult") && select("inspectionResult", "Result", c.inspectionResult ?? "NOT_YET", RESULT_OPTIONS)}
          {typeHasField(c.type, "severity") && select("severity", "Severity", detail.severity ?? "", SEVERITY_OPTIONS)}
          {typeHasField(c.type, "happenedAt") && <FieldEdit label="Happened" field="happenedAt" kind="datetime-local" value={wall} display={detail.happenedAt ? formatOrgDateTime(detail.happenedAt, ctx.timeZone) : ""} {...base} disabledWhy={happenedWhy} />}
          {typeHasField(c.type, "fromDocumentId") && select("fromDocumentId", "From", detail.fromDocument?.id ?? "", [{ value: "", label: "None" }, ...links.documents])}
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-ink-3">Raised by</div>
            <div className="text-[14px] text-ink">{c.raisedByName}</div>
          </div>
        </div>
        {c.dueOn && lateText && <p className="-mt-3 text-[12.5px] font-medium text-rose-700">Due {formatDate(dayToDate(c.dueOn))}: {lateText}.</p>}

        <section aria-label="Links" className="flex flex-col gap-2">
          <h3 className={section}>Links</h3>
          {detail.links.length === 0 && <p className="text-[13.5px] text-ink-3">Nothing linked.</p>}
          <ul className="flex flex-col gap-1.5">
            {detail.links.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                {k.target.kind === "ITEM" ? (
                  <>
                    <Link href={hrefs.item(k.target.ref)} scroll={false} className="font-semibold">
                      {k.target.label} · {k.target.title}
                    </Link>
                    <Badge>{STATUS_WORDS[k.target.status].en}</Badge>
                  </>
                ) : (
                  <Link href={`/projects/${encodeURIComponent(contractId)}/documents/${encodeURIComponent(k.target.id)}`} className="font-semibold">
                    {k.target.title}
                  </Link>
                )}
                {editable && <UnlinkButton {...base} linkId={k.id} what={k.target.kind === "ITEM" ? k.target.label : k.target.title} />}
              </li>
            ))}
          </ul>
          {editable && (
            <div className="flex flex-wrap items-start gap-2">
              <LinkPicker label="Link an item" name="toItemId" options={links.items} {...base} />
              <LinkPicker label="Link a document" name="documentId" options={links.documents} {...base} />
            </div>
          )}
        </section>

        <section aria-label="Files" className="flex flex-col gap-2">
          <h3 className={section}>Files</h3>
          {detail.files.length === 0 && <p className="text-[13.5px] text-ink-3">No files.</p>}
          <ul className="flex flex-col gap-1">
            {detail.files.map((f) => (
              <li key={f.attachmentId} className="flex flex-wrap items-center gap-x-2 text-[13.5px] break-all">
                {f.withdrawnAt ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-3 line-through">{f.filename}</span>
                    <Badge tone="warn">Withdrawn</Badge>
                  </span>
                ) : (
                  <a href={`/api/documents/versions/${encodeURIComponent(f.versionId)}`} className="font-semibold">
                    {f.filename}
                  </a>
                )}
                {shared && !f.withdrawnAt && <Badge tone={f.seenByContractor ? "info" : "neutral"}>{f.seenByContractor ? `Visible to ${contractor}` : "Staff only"}</Badge>}
                {!f.withdrawnAt && <Chip tone={f.scanLabel === SCAN_LABEL.THREAT ? "err" : "neutral"} title={f.scanLabel}>{f.scanLabel === SCAN_LABEL.NOT_SCANNED ? NOT_SCANNED_LABEL : f.scanLabel}</Chip>}
                {ctx.open && !shared && !f.withdrawnAt && (
                  removeFileFaults(c, actor, f.attachedByPersonId, "x", removeFileWords(null, null)).length === 0 ? (
                    <RemoveFile {...base} attachmentId={f.attachmentId} filename={f.filename} />
                  ) : isOpen(c.status) ? (
                    <MoreText text={removeFileWords(f.attachedByPersonId ? (attachers.get(f.attachedByPersonId) ?? null) : null, who.lead).en} label={`Who can remove ${f.filename}`} />
                  ) : null
                )}
              </li>
            ))}
          </ul>
          {ctx.open && (ctx.filesAllowed ? <AttachFiles {...base} shared={shared} /> : <Note>{documentFaultText({ code: "PROJECT_CLASS_NOT_SET", level: "block" })}</Note>)}
        </section>

        <section aria-label="Activity" className="flex flex-col gap-3">
          <h3 className={section}>Activity</h3>
          <Activity entries={feed} label={`Activity on ${itemLabel}`} />
          {ctx.open && <Composer action={commentOnWorkItem} fields={{ ...base, expectedShared: shared ? "yes" : "no" }} label={`Comment on ${itemLabel}`} placeholder="Write a comment" max={TEXT_MAX} audiences={shared ? AUDIENCES : undefined} />}
        </section>
      </div>
    </WorkPanelShell>
  );
}
