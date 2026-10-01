/**
 * What the document screens render, as plain strings: the panel's rows and slots, the
 * upload form's choices and the drawer. Pure — it takes what `read.ts` decided and
 * writes it as words, dates and sizes, so a component draws and never decides, and no
 * code (a purpose, a classification, a scan state, a media type) reaches a screen.
 */

import { fieldLabel } from "@/lib/audit/diff";
import { formatDate, formatOrgDateTime, formatOrgDay } from "@/lib/format";

import { trailEntry } from "./audit-view";
import { documentClassificationChoices } from "./classification";
import { attachableVersion } from "./targets";

import {
  ACCESS_KIND_LABEL,
  ACCESS_STATEMENT,
  classificationChoiceText,
  classChoiceText,
  classificationBadge,
  DISPOSAL_METHOD_LABEL,
  documentFaultText,
  formatBytes,
  FINGERPRINT_STATEMENT,
  mediaLabel,
  PURPOSE_LABEL,
  RECORDED_ON_BEHALF,
  RETENTION_TRIGGER_LABEL,
  retentionPeriodText,
  SCAN_LABEL,
  shortFingerprint,
  STATUS_LABEL,
} from "./labels";
import type { documentDrawer, ownerPanel, uploadContext } from "./read";
import type { AttachmentPurpose, ScanState, SecurityClass } from "./types";

type Tone = "ok" | "warn" | "err" | "info" | "neutral";

/// A document's classification as a badge: unset is a warning, never a blank.
export function classificationTone(c: SecurityClass | null): Tone {
  return c === "PUBLIC" ? "ok" : c === "INTERNAL" ? "info" : c === "SULIT" ? "err" : "warn";
}

export const scanTone = (s: ScanState): Tone => (s === "CLEAN" ? "ok" : s === "THREAT" ? "err" : "warn");

export type Allowance = { allowed: true } | { allowed: false; reason: string };
export type DownloadView = { allowed: true; href: string } | { allowed: false; reason: string };

export interface AttachmentItemView {
  attachmentId: string;
  /// Which slot it sits in (a key for grouping, never shown).
  purpose: AttachmentPurpose;
  purposeLabel: string;
  live: boolean;
  documentId: string;
  title: string;
  className: string;
  classification: string;
  classificationTone: Tone;
  versionId: string;
  versionNo: number;
  /// Set when the document has a newer version than the one pinned here.
  newerVersionNo: number | null;
  receivedOn: string | null;
  /// Who recorded it, with the words that say it is not a signature.
  recordedBy: string;
  size: string;
  fingerprint: string;
  fingerprintShort: string;
  typeLabel: string;
  fileName: string;
  scan: { text: string; tone: Tone };
  withdrawn: { on: string; reason: string } | null;
  hold: string | null;
  attachedOn: string;
  takenOff: { on: string; reason: string } | null;
  download: DownloadView;
  detach: Allowance | null;
  newVersion: Allowance | null;
}

/// The purposes that hold one document at a time: a signed copy, a signed scan, the one recommendation. Corrected by a new version, not added to. Dossier evidence and the scope document are several documents.
export const HOLDS_ONE_DOCUMENT: ReadonlySet<AttachmentPurpose> = new Set<AttachmentPurpose>(["SIGNED_MINUTES", "HOLDER_RECOMMENDATION", "SIGNED_LETTER", "DECLARATION", "AUTHORISATION", "ACCEPTANCE_PAGE"]);

/// What a slot offers: upload while it is empty, then a new version where it holds one document, or another where it holds several.
export type SlotAct = "UPLOAD" | "NEW_VERSION" | "ADD_ANOTHER";
export function slotAct(purpose: AttachmentPurpose, live: number): SlotAct {
  return live === 0 ? "UPLOAD" : HOLDS_ONE_DOCUMENT.has(purpose) ? "NEW_VERSION" : "ADD_ANOTHER";
}

export interface SlotView {
  purpose: AttachmentPurpose;
  label: string;
  required: boolean;
  state: "OPEN" | "NOT_READY" | "FROZEN";
  /// Why it is not open, in words. Null while open.
  reason: string | null;
  live: number;
  /// What the slot's button does, from what it holds (`slotAct`).
  act: SlotAct;
  /// Where the slot stands, as a badge: attached, outstanding, not yet, closed.
  status: { text: string; tone: Tone };
  findings: { tone: "warn" | "info" | "err"; text: string }[];
  /// Where a purpose is attached by its owner's own act (a bill's imported file), the words
  /// that say where; the slot then offers no upload of its own. Null otherwise.
  attachedBy: string | null;
}

/// A slot's badge from what the read decided (its state) and what the caller says (required).
export function slotStatus(s: { state: "OPEN" | "NOT_READY" | "FROZEN"; live: number; required: boolean }, whileEmpty?: { text: string; tone: Tone }): { text: string; tone: Tone } {
  if (s.live === 0 && s.state === "OPEN" && whileEmpty) return whileEmpty;
  if (s.live > 0) return { text: s.live === 1 ? "Attached" : `${s.live} attached`, tone: "ok" };
  if (s.state === "NOT_READY") return { text: "Not yet", tone: "neutral" };
  if (s.state === "FROZEN") return { text: "Closed", tone: "neutral" };
  return s.required ? { text: "Outstanding", tone: "warn" } : { text: "Nothing attached", tone: "neutral" };
}

export interface UploadView {
  classes: { value: string; label: string }[];
  people: { value: string; label: string }[];
  /// Why uploads are refused, in words, naming what to set and where. Empty: open.
  refusals: string[];
  accept: string;
  allowedTypes: string[];
  /// "Up to 20 MB each", from the cap in force; null while it is not set.
  capText: string | null;
  /// Said beside the received-day input where the organisation has no time zone.
  receivedHint: string;
}

export interface PanelView {
  owner: { kind: string; id: string; label: string };
  slots: SlotView[];
  /// Every slot is closed for one reason (a cancelled sitting): that reason, said once.
  frozen: { reason: string } | null;
  items: AttachmentItemView[];
  past: AttachmentItemView[];
  upload: UploadView;
  statement: string;
}

type Panel = NonNullable<Awaited<ReturnType<typeof ownerPanel>>>;
type Upload = NonNullable<Awaited<ReturnType<typeof uploadContext>>>;

export function uploadView(u: Upload): UploadView {
  return {
    classes: u.classes.map((c) => ({ value: c.id, label: classChoiceText(c.nameEn, c.classification) })),
    people: u.people.map((p) => ({ value: p.id, label: p.name })),
    refusals: u.refusals,
    accept: u.allowedMediaTypes.join(","),
    allowedTypes: u.allowedMediaTypes.map(mediaLabel),
    capText: u.cap ? `Up to ${formatBytes(u.cap.bytes)} each` : null,
    receivedHint: u.timeZoneSet ? "The day on the paper, not today. Leave it blank if it is not known." : documentFaultText({ code: "TIME_ZONE_UNSET", level: "block" }),
  };
}

export interface PanelOptions {
  /// Which purposes this screen shows, in order. Absent: every one that suits the owner.
  only?: readonly AttachmentPurpose[];
  /// Which are required on this record (the caller's own rule, from its own facts).
  required?: Partial<Record<AttachmentPurpose, boolean>>;
  /// What a slot is called on this screen, where the screen's own words differ from the store's (a record's items are called what its card above calls them).
  labels?: Partial<Record<AttachmentPurpose, string>>;
  /// A slot's badge while nothing is attached, where the owner knows better than "Outstanding" (the paper has not come back).
  statuses?: Partial<Record<AttachmentPurpose, { text: string; tone: Tone }>>;
  /// Extra lines under a slot (the caller's own findings, already in words).
  findings?: Partial<Record<AttachmentPurpose, { tone: "warn" | "info" | "err"; text: string }[]>>;
  /// Purposes the owner's own act attaches (OWNER_ACT_PURPOSES), with the words naming that act.
  attachedBy?: Partial<Record<AttachmentPurpose, string>>;
}

export function panelView(p: Panel, u: Upload, timeZone: string | null, opts: PanelOptions = {}): PanelView {
  const shown = (purpose: AttachmentPurpose) => !opts.only || opts.only.includes(purpose);
  const slots: SlotView[] = p.purposes
    .filter((s) => shown(s.purpose))
    .sort((a, b) => (opts.only ? opts.only.indexOf(a.purpose) - opts.only.indexOf(b.purpose) : 0))
    .map((s) => {
      const required = opts.required?.[s.purpose] ?? false;
      return { purpose: s.purpose, label: opts.labels?.[s.purpose] ?? PURPOSE_LABEL[s.purpose], required, state: s.state, reason: s.reason, live: s.live, act: slotAct(s.purpose, s.live), status: slotStatus({ state: s.state, live: s.live, required }, opts.statuses?.[s.purpose]), findings: opts.findings?.[s.purpose] ?? [], attachedBy: opts.attachedBy?.[s.purpose] ?? null };
    });
  const all = p.items.filter((i) => shown(i.purpose)).map((i) => itemView(i, timeZone));
  const frozenAll = slots.length > 0 && slots.every((s) => s.state === "FROZEN") && new Set(slots.map((s) => s.reason)).size === 1;
  return {
    owner: { kind: p.owner.kind, id: p.owner.id, label: p.owner.label },
    slots,
    frozen: frozenAll ? { reason: slots[0].reason! } : null,
    items: all.filter((i) => i.live),
    past: all.filter((i) => !i.live),
    upload: uploadView(u),
    statement: p.statement,
  };
}

type Item = Panel["items"][number];

export function itemView(i: Item, timeZone: string | null): AttachmentItemView {
  const v = i.version;
  return {
    attachmentId: i.attachmentId,
    purpose: i.purpose,
    purposeLabel: PURPOSE_LABEL[i.purpose],
    // "Live" here is the screen's: on the record and not withdrawn. A withdrawn pin shows in the list with its withdrawal.
    live: i.detachedAt == null,
    documentId: i.document.id,
    title: i.document.title,
    className: i.document.className,
    classification: classificationBadge(i.document.classification),
    classificationTone: classificationTone(i.document.classification),
    versionId: v.id,
    versionNo: v.versionNo,
    newerVersionNo: i.newerVersion?.versionNo ?? null,
    receivedOn: v.receivedOn ? formatDate(v.receivedOn) : null,
    recordedBy: `${v.recordedBy.name} · ${RECORDED_ON_BEHALF}`,
    size: formatBytes(v.byteSize),
    fingerprint: v.sha256,
    fingerprintShort: shortFingerprint(v.sha256),
    typeLabel: mediaLabel(v.mediaType),
    fileName: v.originalFilename,
    scan: { text: SCAN_LABEL[v.scanState], tone: scanTone(v.scanState) },
    withdrawn: v.withdrawnAt ? { on: formatOrgDay(v.withdrawnAt, timeZone), reason: v.withdrawnReason ?? "" } : null,
    hold: i.document.standingHold?.reason ?? null,
    attachedOn: formatOrgDay(i.attachedAt, timeZone),
    takenOff: i.detachedAt ? { on: formatOrgDay(i.detachedAt, timeZone), reason: i.detachReason ?? "" } : null,
    download: i.download,
    detach: i.detach,
    newVersion: i.newVersion,
  };
}

// ----------------------------------------------------------------------- drawer

export interface DrawerVersionView {
  id: string;
  versionNo: number;
  fileName: string;
  typeLabel: string;
  size: string;
  fingerprint: string;
  receivedOn: string | null;
  storedOn: string;
  recordedBy: string;
  note: string | null;
  scan: { text: string; tone: Tone };
  withdrawn: { on: string; reason: string } | null;
  download: DownloadView;
  attachments: { id: string; label: string; owner: string; href: string; attachedOn: string; takenOff: { on: string; reason: string } | null }[];
  accessEvents: { id: string; kind: string; at: string; reason: string | null }[];
}

export interface DrawerView {
  id: string;
  title: string;
  className: string;
  classification: string;
  classificationTone: Tone;
  /// Whether a classification can still be set by hand (it is unset).
  classificationUnset: boolean;
  /// What the classification form offers, judged by the same check the save runs: the
  /// allowed changes, and the rest disabled with the reason (BD-DS-11 as ruled, C-4).
  classificationChoices: { value: string; label: string; disabled: boolean }[];
  /// Where no change can be made at all, why, in words; null where one can.
  classificationLocked: string | null;
  status: string;
  /// Received and not attached to any record yet.
  staged: boolean;
  /// The version an attachment would pin, for a received-not-filed document; null once filed, or where every version is withdrawn.
  attachVersionId: string | null;
  createdOn: string;
  filedOn: string | null;
  retention: { period: string; starts: string; disposal: string; authority: string };
  versions: DrawerVersionView[];
  holds: { id: string; reason: string; placedBy: string; placedOn: string; standing: boolean; released: { by: string; on: string; reason: string } | null }[];
  /// Newest first. `label` says what happened in a sentence; `reason` is the one reason, once.
  history: { id: string; label: string; tone: Tone; at: string; reason: string | null; changes: { field: string; before: string | null; after: string | null }[] }[];
  people: { value: string; label: string }[];
  statements: { access: string; fingerprint: string };
}

type Drawer = NonNullable<Awaited<ReturnType<typeof documentDrawer>>>;

/// The document's classification form: the choices, and why none can be made where so.
export function classificationForm(current: SecurityClass | null, classClassification: SecurityClass | null): Pick<DrawerView, "classificationChoices" | "classificationLocked"> {
  const choices = documentClassificationChoices(current, classClassification).filter((c) => c.value != null);
  const classificationChoices = choices.map((c) => ({ value: c.value!, label: classificationChoiceText(c), disabled: !c.allowed }));
  if (choices.some((c) => c.allowed)) return { classificationChoices, classificationLocked: null };
  // Nothing is higher than where it stands, and lowering is refused: say so, with the way out.
  const lower = choices.find((c) => c.refusal && c.refusal.code !== "UNCHANGED");
  const why = lower?.refusal ? { ...lower.refusal, data: { ...lower.refusal.data, to: null } } : null;
  return { classificationChoices, classificationLocked: why ? documentFaultText(why) : null };
}

const NOT_SET = "Not set";

export function drawerView(d: Drawer, timeZone: string | null): DrawerView {
  const r = d.retention;
  return {
    id: d.id,
    title: d.title,
    className: d.documentClass.nameEn,
    classification: classificationBadge(d.classification),
    classificationTone: classificationTone(d.classification),
    classificationUnset: d.classification == null,
    ...classificationForm(d.classification, d.documentClass.classification),
    status: STATUS_LABEL[d.status],
    staged: d.status === "STAGED",
    attachVersionId: d.status === "STAGED" ? attachableVersion(d.versions) : null,
    createdOn: formatOrgDay(d.createdAt, timeZone),
    filedOn: d.filedAt ? formatOrgDay(d.filedAt, timeZone) : null,
    retention: {
      period: retentionPeriodText(r?.retentionMonths),
      starts: r?.retentionTrigger ? RETENTION_TRIGGER_LABEL[r.retentionTrigger] : NOT_SET,
      disposal: r?.disposalMethod ? DISPOSAL_METHOD_LABEL[r.disposalMethod] : NOT_SET,
      authority: d.disposalAuthority ?? NOT_SET,
    },
    versions: d.versions.map((v) => ({
      id: v.id,
      versionNo: v.versionNo,
      fileName: v.originalFilename,
      typeLabel: mediaLabel(v.mediaType),
      size: formatBytes(v.byteSize),
      fingerprint: v.sha256,
      receivedOn: v.receivedOn ? formatDate(v.receivedOn) : null,
      storedOn: formatOrgDateTime(v.storedAt, timeZone),
      recordedBy: `${v.recordedBy.name} · ${RECORDED_ON_BEHALF}`,
      note: v.note || null,
      scan: { text: SCAN_LABEL[v.scanState], tone: scanTone(v.scanState) },
      withdrawn: v.withdrawnAt ? { on: formatOrgDay(v.withdrawnAt, timeZone), reason: v.withdrawnReason ?? "" } : null,
      download: v.download,
      attachments: v.attachments.map((a) => ({
        id: a.id,
        label: PURPOSE_LABEL[a.purpose as AttachmentPurpose],
        owner: a.owner,
        href: a.href,
        attachedOn: formatOrgDay(a.attachedAt, timeZone),
        takenOff: a.detachedAt ? { on: formatOrgDay(a.detachedAt, timeZone), reason: a.detachReason ?? "" } : null,
      })),
      accessEvents: v.accessEvents.map((e) => ({ id: e.id, kind: ACCESS_KIND_LABEL[e.kind], at: formatOrgDateTime(e.at, timeZone), reason: e.reason })),
    })),
    holds: d.holds.map((h) => ({
      id: h.id,
      reason: h.reason,
      placedBy: `${h.placedBy.name} · ${RECORDED_ON_BEHALF}`,
      placedOn: formatOrgDay(h.placedAt, timeZone),
      standing: h.releasedAt == null,
      released: h.releasedAt ? { by: h.releasedBy ? `${h.releasedBy.name} · ${RECORDED_ON_BEHALF}` : "Not recorded", on: formatOrgDay(h.releasedAt, timeZone), reason: h.releaseReason ?? "" } : null,
    })),
    history: d.history.map((e) => {
      const t = trailEntry({ entity: e.entity, entityLabel: e.entityLabel, action: e.action, reason: e.reason, changes: e.changes }, formatDate);
      return {
        id: e.id,
        label: t.label,
        tone: e.action === "CREATE" ? "ok" : e.action === "DELETE" ? "err" : "info",
        at: formatOrgDateTime(e.at, timeZone),
        reason: t.reason,
        changes: t.changes.map((c) => ({ field: fieldLabel(c.field), before: c.before, after: c.after })),
      };
    }),
    people: d.people.map((p) => ({ value: p.id, label: p.name })),
    statements: d.statements,
  };
}

export { ACCESS_STATEMENT, FINGERPRINT_STATEMENT };
