/**
 * Publishing the window: advertised (FR-ADV-001, 003–008) or invited (FR-ADV-002, FR-MTD-008),
 * from approval for tendering (FR-DOC-012), judged as one family of findings so the screen says
 * every reason at once and the act re-runs it under its locks. Pure.
 *
 * The path is the method's (`requiresAdvertisement` / `invitesNamedSuppliers`); both or neither
 * is not a path, and blocks naming the method setting — no method code is named here.
 *
 * Advertised: every required channel carries a publication, recorded on or before today, and the
 * advertisement day is derived from them under the policy's rule (OD-3). Invited: no public
 * channel is recorded, and the letters go to exactly the approved list — the name's approval
 * (`invitationFault`) and its frozen invitees (`inviteeListFault`, OD-4) — on the day they issue,
 * which is the window's advertisement day for the date rules (BD-65-3).
 *
 * The notice's items (FR-ADV-003): (a) the registrations, read from 6.4's requirements as entered
 * (OD-13); (b) where inspected and bought; (c) the days and hours of inspection and purchase;
 * (d) the fee and how it is paid; (g) where submitted (the closing is 6.4's approved date, moved
 * only by an applied closing change). (e) and (f) are the site events, optional, each with its
 * day, time and place. Then the fee against its floor (OD-6), every date rule (OD-7), the events'
 * mandatory answers (OD-8) and the instrument's configured template.
 */

import type { ChannelFacts, EventFacts, Finding, PublicationFacts, WindowPath, WindowPolicyFacts, CalendarFacts, FeeFloorFacts } from "./types";
import { advertisementDay, closingFaults } from "./dates";
import { eventFaults } from "./events";
import { itemFaults, UNPREPARED_ITEM_CODES } from "./items";
import { onlineSaleFaults, saleModeFault, type OnlineSaleFault, type SaleMode } from "./sale-mode";
import { feeFaults } from "./fee";
import { fieldsInWords, type TemplateState } from "./fields";
import { invitedListFaults } from "./invitees";
import type { Sen } from "@/lib/money";
import { pinFaults, type PinInput } from "@/lib/evaluation/pin";
import type { EvaluationRoute, ModelStatus } from "@/lib/evaluation/types";
import type { ExerciseStatus, PackKind } from "@/lib/method/types";

/// The window's path from the method's flags. Both or neither: not set, and nothing is published.
export function windowPathOf(m: { requiresAdvertisement: boolean; invitesNamedSuppliers: boolean } | null): WindowPath | null {
  if (!m) return null;
  if (m.requiresAdvertisement === m.invitesNamedSuppliers) return null;
  return m.requiresAdvertisement ? "ADVERTISED" : "INVITED";
}

export type PublishFault =
  | "NOT_APPROVED_FOR_TENDERING"
  | "NO_TENDER_DOCUMENTS"
  | "PATH_NOT_SET"
  | "PATH_CHANGED"
  | "RESTRICTION_NOT_ANSWERED"
  | "STAMP_NOT_SET"
  | "ELIGIBILITY_MISSING"
  | "INSPECTION_PLACE_MISSING"
  | "PURCHASE_PLACE_MISSING"
  | "INSPECTION_HOURS_MISSING"
  | "PURCHASE_FROM_NOT_SET"
  | "PURCHASE_DAYS_OUT_OF_ORDER"
  | "PURCHASE_FROM_BEFORE_ADVERTISEMENT"
  | "PAYMENT_METHODS_MISSING"
  | "SUBMISSION_PLACE_MISSING"
  | "CLOSING_NOT_SET"
  | "BEFORE_TENDERING_START"
  | "PUBLICATION_IN_FUTURE"
  | "PUBLIC_CHANNEL_ON_INVITED"
  | "TEMPLATE_NOT_SET"
  | "TEMPLATE_TEXT_NOT_SET"
  | "TEMPLATE_LANGUAGE_NOT_SET"
  | "TEMPLATE_INCOMPLETE"
  | "TEMPLATE_UNKNOWN_FIELD"
  | "CHANGE_PENDING"
  | "BID_VALIDITY_NOT_SET"
  | "SALE_MODE_NOT_SET"
  | OnlineSaleFault
  | "TIME_ZONE_UNSET";

export interface PublishInput {
  status: ExerciseStatus;
  packKind: PackKind | null;
  /// The method's path now, and the window's as first written.
  methodPath: WindowPath | null;
  windowPath: WindowPath | null;
  restricted: boolean | null;
  /// SR-10 (G1): how the documents are sold on this exercise, as pinned. Null: not set, and publication refuses saying so.
  saleMode: SaleMode | null;
  /// S3: whether the organisation releases documents online (`electronicDocumentRelease`), as it stands now. Null: not set.
  releaseOnline: boolean | null;
  requirements: number;
  window: {
    inspectionPlace: string;
    purchasePlace: string;
    inspectionHours: string;
    /// YYYY-MM-DD.
    purchaseFromDay: string | null;
    purchaseCloseDay: string | null;
    fee: Sen | null;
    feePaymentMethods: string;
    submissionPlace: string;
    closingTimeReason: string;
  };
  /// SR-06 (ruling 9): the days the bids stay valid. `required` only for an exercise submitted under the notice gate (`openingRosterRequired`),
  /// so exercises approved before it are not held back at publication.
  bidValidity: { required: boolean; days: number | null };
  events: readonly EventFacts[];
  policy: WindowPolicyFacts;
  calendar: CalendarFacts | null;
  channels: readonly ChannelFacts[];
  records: readonly PublicationFacts[];
  closingAt: Date | null;
  /// 6.4's DATE START, YYYY-MM-DD.
  tenderingStartOn: string | null;
  timeZone: string | null;
  today: string | null;
  regime: string | null;
  floors: readonly FeeFloorFacts[];
  basisTotal: Sen;
  /// The instrument's template as rendered for this window: the notice (advertised) or a letter (invited).
  template: { state: TemplateState; missing: readonly string[]; unknown: readonly string[]; stampMissing: boolean };
  /// A window_change route is pending: the closing may yet move, so nothing is published on it.
  changePending?: boolean;
  /// 6.8 (FR-EVL-005, 006; E-2): the evaluation model chosen and the contract basis's route; publication pins it.
  evaluationModel: PinInput;
  /// SR-13: the sealing refusals for an online exercise (`publishSealingFaults`), judged by the caller from the key, the rules and the switch. A paper exercise has none; one whose channel is not set has CHANNEL_NOT_SET.
  sealing: readonly Finding[];
  /// The invited path's list and name routes.
  invited: {
    method: { requiresNameApproval: boolean };
    nameRoutes: Parameters<typeof invitedListFaults>[1];
    proposed: readonly { registrationNo: string }[];
  } | null;
}

export interface PublishResult {
  findings: Finding[];
  /// The advertisement day the publication would be judged and recorded with; null while not known.
  advertisementDay: string | null;
}

export function publishFaults(i: PublishInput): PublishResult {
  const out: Finding[] = [];
  const f = (code: PublishFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (!i.today || !i.timeZone) f("TIME_ZONE_UNSET");
  if (i.status !== "APPROVED_FOR_TENDERING") f("NOT_APPROVED_FOR_TENDERING", { status: i.status });
  if (i.changePending) f("CHANGE_PENDING");
  if (i.packKind !== "TENDER" && i.packKind !== "QUOTATION") f("NO_TENDER_DOCUMENTS");
  const path = i.windowPath ?? i.methodPath;
  if (!i.methodPath) f("PATH_NOT_SET");
  else if (i.windowPath && i.windowPath !== i.methodPath) f("PATH_CHANGED", { was: i.windowPath, now: i.methodPath });

  // FR-DOC-009 / 6.4: the restriction answered, and stamped where it is restricted.
  if (i.restricted == null) f("RESTRICTION_NOT_ANSWERED");
  if (i.template.stampMissing) f("STAMP_NOT_SET");

  // FR-ADV-003: the notice's items.
  if (i.requirements === 0) f("ELIGIBILITY_MISSING");
  const w = i.window;
  // SR-06 (ruling 9): the same seven checks the submit gate runs (`itemFaults`), kept here as the backstop.
  out.push(...itemFaults(w, i.saleMode));
  const sm = saleModeFault(i.saleMode);
  if (sm) out.push(sm);
  // S3: an online sale needs the documents released online. A restricted tender is no longer refused online (ruling 17a).
  out.push(...onlineSaleFaults({ saleMode: i.saleMode, releaseOnline: i.releaseOnline }));
  out.push(...i.sealing);
  if (i.bidValidity.required && i.bidValidity.days == null) f("BID_VALIDITY_NOT_SET");
  if (!i.closingAt) f("CLOSING_NOT_SET");
  for (const e of i.events) out.push(...eventFaults(e, i.policy.mandatoryAttendancePermitted, i.closingAt));

  // FR-ADV-008: the fee against its floor.
  out.push(...feeFaults({ fee: w.fee, regime: i.regime, floors: i.floors, basisTotal: i.basisTotal }));

  // The channels (advertised) or the list (invited), and the advertisement day.
  let adDay: string | null = null;
  if (path === "ADVERTISED") {
    const today = i.today ?? "9999-12-31";
    const d = advertisementDay(i.records, i.channels, i.policy, today);
    out.push(...d.faults);
    for (const r of i.records.filter((x) => i.today && x.publishedOn > i.today)) f("PUBLICATION_IN_FUTURE", { channel: i.channels.find((c) => c.id === r.channelId)?.nameEn ?? null, day: r.publishedOn });
    adDay = d.day;
  } else if (path === "INVITED") {
    if (i.records.length > 0) f("PUBLIC_CHANNEL_ON_INVITED", { count: i.records.length });
    if (i.invited) out.push(...invitedListFaults(i.invited.method, i.invited.nameRoutes, i.invited.proposed));
    adDay = i.today;
  }
  if (adDay && i.tenderingStartOn && adDay < i.tenderingStartOn) f("BEFORE_TENDERING_START", { day: adDay, start: i.tenderingStartOn });
  if (adDay && w.purchaseFromDay && w.purchaseFromDay < adDay) f("PURCHASE_FROM_BEFORE_ADVERTISEMENT", { day: w.purchaseFromDay, advertisedOn: adDay });

  // FR-ADV-004–007: every date rule, from the advertisement day.
  if (i.closingAt) out.push(...closingFaults({ advertisementDay: adDay, closingAt: i.closingAt, purchaseCloseDay: w.purchaseCloseDay, closingTimeReason: w.closingTimeReason, timeZone: i.timeZone, policy: i.policy, calendar: i.calendar, today: i.today }));

  // 6.8 (E-2): the evaluation model is chosen, issued, of the basis's route, and pinned by this act.
  out.push(...pinFaults(i.evaluationModel));

  // The instrument's configured text (ADR 0008).
  const t = i.template;
  if (t.state === "NOT_SET") f("TEMPLATE_NOT_SET", { instrument: path === "INVITED" ? "INVITATION" : "NOTICE" });
  else if (t.state === "NO_TEXT") f("TEMPLATE_TEXT_NOT_SET", { instrument: path === "INVITED" ? "INVITATION" : "NOTICE" });
  else if (t.state === "NO_LANGUAGE") f("TEMPLATE_LANGUAGE_NOT_SET", { instrument: path === "INVITED" ? "INVITATION" : "NOTICE" });
  else {
    if (t.unknown.length) f("TEMPLATE_UNKNOWN_FIELD", { fields: fieldsInWords(path === "INVITED" ? "INVITATION" : "NOTICE", t.unknown) });
    if (t.missing.length) f("TEMPLATE_INCOMPLETE", { fields: fieldsInWords(path === "INVITED" ? "INVITATION" : "NOTICE", t.missing) });
  }
  return { findings: out, advertisementDay: adDay };
}

/// What an unprepared window leaves empty: each of these is the same fact, that the window's items
/// are not written yet.
const ITEM_FAULTS = UNPREPARED_ITEM_CODES;

/**
 * Before the window is prepared every one of its items is missing, and listing each says the same
 * thing six times. They fold under one first finding, "Prepare the window" (UX U5); the others
 * (the closing, the channels, the template) stand on their own. A prepared window is returned as is.
 */
export function foldUnpreparedWindow(findings: readonly Finding[], hasWindow: boolean, saleMode: SaleMode | null = "COUNTER"): Finding[] {
  if (hasWindow) return [...findings];
  const folded = findings.filter((f) => ITEM_FAULTS.has(f.code));
  if (folded.length === 0) return [...findings];
  const first: Finding = { code: "WINDOW_ITEMS_NOT_PREPARED", level: "block", data: { count: folded.length, ...(saleMode === "ONLINE" ? { online: 1 } : {}) } };
  return [first, ...findings.filter((f) => !ITEM_FAULTS.has(f.code))];
}

/// The evaluation model as publication judges it (6.8 E-2): chosen, issued, of the basis's route, not yet pinned.
export function evaluationPin(
  d: { evaluation: { model: { status: ModelStatus; route: EvaluationRoute; nameEn: string; version: number } | null; basis: { nameEn: string; evaluationRoute: EvaluationRoute | null } | null } },
  ex: { evaluationModelPinnedAt?: Date | null; contractBasisCode?: string | null },
): PinInput {
  const m = d.evaluation.model;
  return {
    model: m ? { status: m.status, route: m.route, name: `${m.nameEn}, version ${m.version}` } : null,
    basis: ex.contractBasisCode ? { name: d.evaluation.basis?.nameEn ?? "A basis no longer configured", route: d.evaluation.basis?.evaluationRoute ?? null } : null,
    pinned: ex.evaluationModelPinnedAt != null,
  };
}
