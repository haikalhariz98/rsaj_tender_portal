/**
 * A registered supplier's documents, as the supplier sees them and changes them (Phase 4c: FR-VND-007 per-document resubmission online, FR-VND-008 expiry bands and reminders in the
 * portal). Pure.
 *
 * What a document IS on a day is the register's own rule (`documentState`, `documentInForce`): the newest verified one that has started; a renewal waits for an officer's check and takes
 * effect only then. This adds what the supplier is told of it, and the rules for lodging its replacement. The bands come from `SupplierPolicy` and the reminder days from the document-expiry
 * rule: none is written here, and where one is not set the page says so instead of showing a safe-looking nothing. A reminder is SHOWN, never sent (INT-09).
 */

import { isDay } from "@/lib/dates";
import { readRequest, type RequestReading } from "@/lib/portal/request-reading";
import { parseRate } from "@/lib/portal/registration/documents";
import type { DocumentTypeConfig, RegistrationValueConfig } from "@/lib/portal/registration/types";
import { documentState, type DocumentState } from "@/lib/suppliers/documents";
import { expiryBand, reminderDue, startsOn, type BandPolicy, type ExpiryReading, type Reminder } from "@/lib/suppliers/expiry";
import { lapseState, type LapseState } from "@/lib/suppliers/review";
import type { SupplierStatus } from "@/lib/suppliers/types";

import type { CompanyDocument, CompanyFinding, OpenRequestFacts, RequestItemFacts } from "./types";

// ------------------------------------------------------------------ the office's request

export type ItemState =
  /// Nothing has been sent for it.
  | "WAITING_FOR_YOU"
  /// Sent, and the office has not checked it yet.
  | "SENT"
  /// Sent and accepted.
  | "ACCEPTED"
  /// Sent and found not in order: it may be sent again.
  | "NOT_ACCEPTED";

export interface ItemView extends RequestItemFacts {
  state: ItemState;
  /// Whether the supplier may send an answer now: the request is open, and no answer of its own is still waiting for the office.
  canAnswer: boolean;
  /// The documents sent for it, newest first.
  answers: CompanyDocument[];
}

export interface RequestView {
  applicationId: string;
  remarks: string;
  resubmitBy: string | null;
  decidedOn: string;
  lapse: LapseState;
  /// Whether answers are taken: the deadline has not passed.
  open: boolean;
  /// Where the request stands for the supplier, read from the items' answers and not from whether it can still answer: a request nobody answered is not "answered" once its date has passed.
  reading: RequestReading;
  items: ItemView[];
}

/// The office's request, with each item's answer read from the documents sent in answer to it (derived, never stored). An item is answered by a document lodged against it, newest first.
export function requestView(request: OpenRequestFacts, docs: readonly CompanyDocument[], today: string): RequestView {
  const lapse = lapseState({ status: "RESUBMISSION_REQUESTED", resubmitBy: request.resubmitBy }, today);
  const open = lapse !== "LAPSED";
  const items = request.items.map((item): ItemView => {
    const answers = docs.filter((d) => d.answersItemId === item.id).sort((a, b) => b.lodgedOn.localeCompare(a.lodgedOn) || b.id.localeCompare(a.id));
    const latest = answers[0];
    const state: ItemState = !latest ? "WAITING_FOR_YOU" : latest.verification === "VERIFIED" ? "ACCEPTED" : latest.verification === "NOT_IN_ORDER" ? "NOT_ACCEPTED" : "SENT";
    return { ...item, state, answers, canAnswer: open && (state === "WAITING_FOR_YOU" || state === "NOT_ACCEPTED") };
  });
  const reading = readRequest(items.map((i) => ({ id: i.id, answers: i.answers })), request.resubmitBy, today);
  return { applicationId: request.applicationId, remarks: request.remarks, resubmitBy: request.resubmitBy, decidedOn: request.decidedOn, lapse, open, reading, items };
}

export const ITEM_STATE_WORDS: Readonly<Record<ItemState, { text: string; tone: "ok" | "warn" | "info" | "neutral" }>> = {
  WAITING_FOR_YOU: { text: "Waiting for you", tone: "warn" },
  SENT: { text: "Sent, waiting for the office to check it", tone: "info" },
  ACCEPTED: { text: "Accepted", tone: "ok" },
  NOT_ACCEPTED: { text: "Not accepted: send it again", tone: "warn" },
};

// ------------------------------------------------------------------ the documents, by type

export const DOCUMENT_STATE_WORDS: Readonly<Record<DocumentState, { text: string; tone: "ok" | "warn" | "err" | "info" | "neutral" }>> = {
  VALID: { text: "In force", tone: "ok" },
  NOT_APPLICABLE: { text: "Does not apply to you", tone: "neutral" },
  NOT_YET_VALID: { text: "Not valid yet", tone: "info" },
  EXPIRED: { text: "Expired", tone: "err" },
  NOT_CHECKED: { text: "Waiting for the office to check it", tone: "info" },
  NOT_IN_ORDER: { text: "Not accepted", tone: "warn" },
  MISSING: { text: "Not given", tone: "warn" },
};

export interface ExpiryPolicy extends BandPolicy {
  /// The days before expiry a reminder falls due, from the document-expiry rule; empty where the rule is absent or off.
  reminderOffsets: readonly number[];
}

/// Whether the bands are all set (the page says so once when they are not, instead of showing a quiet nothing).
export const bandsSet = (p: BandPolicy) => p.criticalDays != null && p.warningDays != null && p.upcomingDays != null;

export interface DocumentRow {
  typeId: string;
  name: string;
  hint: string | null;
  mandatory: boolean | null;
  state: DocumentState;
  /// The document the state is read from, and a renewal waiting for its check, and one verified that starts later.
  effective: CompanyDocument | null;
  pending: CompanyDocument | null;
  upcoming: CompanyDocument | null;
  /// The newest document of the chain, whatever its state.
  head: CompanyDocument | null;
  /// How near the expiry is (of the document in force); null where nothing is in force.
  band: ExpiryReading | null;
  /// The reminder due today, shown and never sent.
  reminder: Reminder | null;
  /// The office's request items that are about this document or this type.
  requested: ItemView[];
  /// Whether the supplier may lodge a replacement here, and why not.
  replace: { allowed: boolean; reason: string | null };
}

export interface RowInput {
  types: readonly DocumentTypeConfig[];
  docs: readonly CompanyDocument[];
  today: string;
  policy: ExpiryPolicy;
  supplierStatus: SupplierStatus;
  request: RequestView | null;
  /// Why uploads are closed (an unset setting), or null.
  uploadClosed: string | null;
}

/**
 * One row per document type the supplier holds, or that is required of it or asked for in an open request: the state of the chain on the day, how near its expiry is, the reminder due,
 * and whether and why a replacement can be lodged. A repeatable type ("Other") has a row per title.
 */
export function documentRows(i: RowInput): DocumentRow[] {
  const rows: DocumentRow[] = [];
  const items = i.request?.items ?? [];
  for (const t of i.types) {
    const ofType = i.docs.filter((d) => d.typeId === t.id);
    const repeatable = t.repeatable === true;
    // An item the supplier already answered with a document is shown on the row of that document. One that is about a document is shown on that document's row. One that asks for a kind of
    // document is shown on the kind's row, and for a kind that may be lodged several times on a row of its own for a new title: it asks for one more, not for a renewal of any one title.
    const answeredHere = (it: ItemView) => ofType.some((d) => d.answersItemId === it.id);
    const typeLevel = (it: ItemView) => !it.documentId && it.typeId === t.id;
    const requestedFor = (chain: readonly CompanyDocument[]) =>
      items.filter((it) => (it.documentId != null && chain.some((d) => d.id === it.documentId)) || chain.some((d) => d.answersItemId === it.id) || (typeLevel(it) && !repeatable));
    // A type that may be lodged several times is read a title at a time.
    const groups: { title: string; chain: CompanyDocument[]; requested: ItemView[] }[] = repeatable
      ? groupByTitle(ofType).map((g) => ({ ...g, requested: requestedFor(g.chain) }))
      : [{ title: "", chain: ofType, requested: requestedFor(ofType) }];
    if (repeatable) {
      const asking = items.filter((it) => typeLevel(it) && !answeredHere(it));
      if (asking.length > 0) groups.push({ title: "", chain: [], requested: asking });
    }
    const needed = t.mandatoryAtRegistration === true && !t.retired;
    for (const g of groups) {
      if (g.chain.length === 0 && !needed && g.requested.length === 0) continue;
      if (t.retired && g.chain.length === 0) continue;
      const st = documentState(g.chain, i.today);
      // documentState hands back the register's facts; the screen wants the whole document it was read from.
      const full = (d: { id: string } | null) => (d ? (g.chain.find((x) => x.id === d.id) ?? null) : null);
      const head = [...g.chain].sort((a, b) => b.lodgedOn.localeCompare(a.lodgedOn) || b.id.localeCompare(a.id)).find((d) => !g.chain.some((x) => x.supersedesId === d.id)) ?? null;
      const inForce = st.state === "VALID" || st.state === "EXPIRED" ? full(st.effective) : null;
      const band = inForce ? expiryBand(inForce.expiresOn, i.today, i.policy) : null;
      const reminder = inForce && inForce.expiresOn && st.state === "VALID" ? reminderDue({ startsOn: startsOn(inForce), expiresOn: inForce.expiresOn }, i.policy.reminderOffsets, i.today) : null;
      rows.push({
        typeId: t.id,
        name: g.title ? `${t.nameEn} · ${g.title}` : t.nameEn,
        hint: t.hintEn,
        mandatory: t.mandatoryAtRegistration,
        state: st.state,
        effective: full(st.effective),
        pending: full(st.pending),
        upcoming: full(st.upcoming),
        head,
        band,
        reminder,
        requested: g.requested,
        replace: replaceAllowed(t, head, g.requested, i),
      });
    }
  }
  // Mandatory first, then what is asked for in a request, then by name.
  return rows.sort((a, b) => Number(b.requested.length > 0) - Number(a.requested.length > 0) || Number(b.mandatory === true) - Number(a.mandatory === true) || a.name.localeCompare(b.name));
}

function groupByTitle(docs: readonly CompanyDocument[]): { title: string; chain: CompanyDocument[] }[] {
  const out = new Map<string, CompanyDocument[]>();
  // A renewal carries its predecessor's title, so each chain falls in one group.
  for (const d of docs) {
    const key = d.title.trim().toLowerCase();
    out.set(key, [...(out.get(key) ?? []), d]);
  }
  return [...out.values()].map((chain) => ({ title: chain[0]!.title, chain }));
}

/// Whether a replacement may be lodged for this row, and why not in words. A supplier on the register renews its own documents; one that is not yet registered answers the office's open request, and nothing else here.
/// A document waiting for the office's check is not renewed again (the chain would hold two unchecked links), except where the office's own request is about that very document.
function replaceAllowed(t: DocumentTypeConfig, head: CompanyDocument | null, requested: readonly ItemView[], i: RowInput): { allowed: boolean; reason: string | null } {
  if (t.retired) return { allowed: false, reason: "The procurement office no longer asks for this document." };
  if (i.supplierStatus === "REJECTED") return { allowed: false, reason: "Your registration was not accepted, so documents cannot be sent here." };
  if (i.uploadClosed) return { allowed: false, reason: i.uploadClosed };
  if (i.request && !i.request.open && requested.length > 0 && i.supplierStatus !== "REGISTERED") return { allowed: false, reason: "The date to answer the office has passed." };
  const asked = requested.some((it) => it.canAnswer);
  if (i.supplierStatus !== "REGISTERED" && !asked) return { allowed: false, reason: "Your registration is with the procurement office. You can send a document when the office asks for one." };
  if (head && head.verification === "NOT_CHECKED" && !requested.some((it) => it.canAnswer && it.documentId === head.id)) return { allowed: false, reason: "A document you sent is waiting for the office to check it. You can send another when it has been checked." };
  return { allowed: true, reason: null };
}

/// The worst band over the rows in force, so the overview can say "N need attention" without restating the rule.
export function attentionCount(rows: readonly DocumentRow[]): { expired: number; critical: number; waitingForYou: number } {
  return {
    expired: rows.filter((r) => r.band?.band === "EXPIRED" || r.state === "EXPIRED").length,
    critical: rows.filter((r) => r.band?.band === "CRITICAL" || r.band?.band === "WARNING").length,
    waitingForYou: rows.reduce((n, r) => n + r.requested.filter((it) => it.canAnswer).length, 0),
  };
}

// ------------------------------------------------------------------ lodging a replacement

export interface ReplacementInput {
  reference: string;
  issuingAuthority: string;
  /// The expiry day as typed (YYYY-MM-DD), or blank.
  expiresOn: string;
  /// The rate as typed, or blank.
  ratePercent: string;
  /// For a type the supplier may lodge several of.
  title: string;
  /// The registration codes chosen for it.
  valueIds: readonly string[];
}

export interface ReplacementContext {
  today: string | null;
  supplierStatus: SupplierStatus;
  /// Null: the type is not configured.
  type: DocumentTypeConfig | null;
  /// The documents of the chain being renewed (for a type that may be lodged several times, those of the one title), or of the type for a first one.
  chain: readonly CompanyDocument[];
  /// The document being renewed, where one is: it must be the newest of its chain.
  renews: CompanyDocument | null;
  /// The titles already held, for a type that may be lodged several times.
  heldTitles: readonly string[];
  /// Set when the replacement answers an item of the office's open request.
  /// `renewsIsAsked`: the document being renewed is the very one the item is about, so it may be renewed even while it waits for its first check (the office asked about it).
  answering: { open: boolean; itemFound: boolean; itemWaiting: boolean; renewsIsAsked?: boolean } | null;
  /// The codes chosen, loaded: the values of the supplier's organisation, with the body they belong to.
  values: readonly RegistrationValueConfig[];
  /// How many files came with the request.
  files: number;
}

const blank = (s: string | null | undefined) => !s || s.trim() === "";

/**
 * The rules for lodging a replacement or a first document online. Who may: a supplier on the register renews its own; one not yet registered answers an item of the office's open request
 * and nothing else. What: the type must be configured and live, a reference and an issuer are given, an expiry where the type has one (a real day after today, later than what it renews
 * once that was checked), the rate where the type records one, a title where it may be lodged several times, and codes of the type's body. The newest document of a chain is the only one
 * that can be renewed. A file comes with it. Pure; the store judges it again on the rows it has locked.
 */
export function replacementFaults(i: ReplacementInput, c: ReplacementContext): CompanyFinding[] {
  if (c.today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: CompanyFinding[] = [];
  const add = (f: CompanyFinding) => out.push(f);
  if (c.supplierStatus === "REJECTED") add({ code: "SUPPLIER_CLOSED", level: "block" });
  if (c.answering) {
    if (!c.answering.itemFound) add({ code: "ITEM_NOT_FOUND", level: "block" });
    else if (!c.answering.open) add({ code: "REQUEST_LAPSED", level: "block" });
    else if (c.answering.itemWaiting) add({ code: "ITEM_WAITING", level: "block" });
  } else if (c.supplierStatus !== "REGISTERED" && c.supplierStatus !== "REJECTED") add({ code: "NOT_ON_REGISTER", level: "block" });
  const t = c.type;
  if (!t) return [...out, { code: "DOCUMENT_TYPE_UNKNOWN", level: "block" }];
  const name = t.nameEn;
  if (t.retired) add({ code: "TYPE_RETIRED", level: "block", data: { type: name } });
  if (c.renews) {
    if (c.chain.some((d) => d.supersedesId === c.renews!.id)) add({ code: "RENEWS_SUPERSEDED", level: "block", data: { type: name } });
    // A document nobody has checked is not renewed over: two unchecked links in a chain leave the officer nothing to check against (615-C7). The office's own request about that document is the exception.
    else if (c.renews.verification === "NOT_CHECKED" && c.answering?.renewsIsAsked !== true) add({ code: "RENEWS_WAITING", level: "block", data: { type: name } });
    // A kind that may be lodged several times takes another under a new title: what stops a repeat is the title (below), not the kind.
  } else if (c.chain.length > 0 && t.repeatable !== true) add({ code: "ALREADY_LODGED", level: "block", data: { type: name } });
  if (c.files < 1) add({ code: "FILE_REQUIRED", level: "block", field: "file", data: { type: name } });

  if (blank(i.reference)) add({ code: "REFERENCE_REQUIRED", level: "block", field: "reference", data: { type: name } });
  if (blank(i.issuingAuthority)) add({ code: "AUTHORITY_REQUIRED", level: "block", field: "issuingAuthority", data: { type: name } });

  if (t.repeatable === true && !c.renews) {
    if (blank(i.title)) add({ code: "TITLE_REQUIRED", level: "block", field: "title", data: { type: name } });
    else if (c.heldTitles.some((h) => h.trim().toLowerCase() === i.title.trim().toLowerCase())) add({ code: "TITLE_DUPLICATE", level: "block", field: "title", data: { type: name, title: i.title.trim() } });
  }

  if (t.expires === false) {
    if (!blank(i.expiresOn)) add({ code: "EXPIRY_NOT_TAKEN", level: "block", field: "expiresOn", data: { type: name } });
  } else if (blank(i.expiresOn)) {
    if (t.expires === true) add({ code: "EXPIRY_REQUIRED", level: "block", field: "expiresOn", data: { type: name } });
    else add({ code: "EXPIRES_NOT_SET", level: "warn", field: "expiresOn", data: { type: name } });
  } else if (!isDay(i.expiresOn)) add({ code: "EXPIRY_NOT_A_DAY", level: "block", field: "expiresOn", data: { type: name } });
  else if (i.expiresOn <= c.today) add({ code: "ALREADY_EXPIRED", level: "block", field: "expiresOn", data: { type: name, expiresOn: i.expiresOn } });
  else {
    // Later than what is in force: the document being renewed once it was checked, and the one the chain has in force (a correction of a link found not in order is judged against the link before it).
    const inForce = documentState(c.chain, c.today).effective;
    const held = [c.renews && c.renews.verification === "VERIFIED" ? c.renews.expiresOn : null, inForce?.expiresOn ?? null].filter((x): x is string => !!x).sort().pop();
    if (c.renews && held && i.expiresOn <= held) add({ code: "RENEWAL_NOT_LATER", level: "block", field: "expiresOn", data: { type: name, expiresOn: held } });
  }

  if (t.recordsRate === true && parseRate(i.ratePercent) == null) add({ code: "RATE_INVALID", level: "block", field: "ratePercent", data: { type: name } });

  let grades = 0;
  for (const id of i.valueIds) {
    const v = c.values.find((x) => x.id === id);
    if (!v) {
      add({ code: "VALUE_UNKNOWN", level: "block", field: "valueIds" });
      continue;
    }
    const label = `${v.code} — ${v.nameEn}`;
    if (v.retired) add({ code: "VALUE_RETIRED", level: "block", field: "valueIds", data: { value: label } });
    else if (!t.bodyId || v.bodyId !== t.bodyId || !t.valueKinds.includes(v.kind)) add({ code: "VALUE_NOT_FOR_DOCUMENT", level: "block", field: "valueIds", data: { value: label, type: name } });
    else if (v.kind === "GRADE") grades += 1;
  }
  if (grades > 1) add({ code: "ONE_GRADE_ONLY", level: "block", field: "valueIds", data: { type: name } });
  return [...new Map(out.map((f) => [`${f.code}|${f.field ?? ""}`, f])).values()];
}
