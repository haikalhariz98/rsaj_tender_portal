/**
 * The window's rules put together on loaded data (`windowData`): the phase, the field values,
 * the instruments rendered, and the publication judged. Deterministic: no clock (`now` is given),
 * no I/O. The actions call it on rows read under their locks; the screens on the same mapping.
 */

import { dayIn, storedDay } from "@/lib/dates";
import { latestFirst, nameRoutesOf, windowChangeRoutesOf } from "@/lib/method/approval";
import { parseSen } from "@/lib/money";

import { addendumFieldValues, inviteeFieldValues, renderInstrument, windowFieldValues, type WindowFieldContext } from "./fields";
import { regKey } from "./invitees";
import { mandatoryPermittedFor } from "./events";
import { windowPhase } from "./phase";
import { evaluationPin, publishFaults, windowPathOf, type PublishInput } from "./publish";
import { basisTotalOf, eventFactsOf, type ExerciseForWindow, type PartyRow, type WindowData } from "./repo";
import type { WindowPath } from "./types";
import type { SaleMode } from "./sale-mode";

/// The exercise's status and its closing instant, as the phase and the instruments read them.
type ExerciseDates = { status: ExerciseForWindow["status"]; closingAt: Date | null; saleMode?: SaleMode | null };

export const proposedInvitees = (parties: readonly PartyRow[]) => parties.filter((p) => p.source === "PROPOSED_INVITEE");

/// The exercise's name routes with the lists they froze, for `invitedListFaults`.
export function nameRoutesWithLists(ex: Pick<ExerciseForWindow, "approvalInstances">, invitees: WindowData["invitees"]) {
  return nameRoutesOf(ex.approvalInstances).map((r) => ({ id: r.id, status: r.status as "PENDING" | "APPROVED" | "REJECTED" | "RECALLED", openedAt: r.openedAt, createdAt: r.createdAt, invitees: invitees.filter((i) => i.approvalInstanceId === r.id) }));
}

/// The exercise's window_change routes, newest first.
export const changeRoutesOf = (ex: Pick<ExerciseForWindow, "approvalInstances">) => latestFirst(windowChangeRoutesOf(ex.approvalInstances));

/// The phase now, from the stored instants (ADR 0014).
export function phaseOf(ex: ExerciseDates, w: { purchaseFromDay: Date | null; purchaseCloseDay: Date | null } | null, now: Date, timeZone: string | null) {
  return windowPhase({ status: ex.status, purchaseFromDay: w?.purchaseFromDay ?? null, purchaseCloseDay: w?.purchaseCloseDay ?? null, closingAt: ex.closingAt }, now, timeZone);
}

/// The window's path: as first written on the window, else the method's now.
export function pathOf(d: WindowData): { method: WindowPath | null; window: WindowPath | null; path: WindowPath | null } {
  const method = windowPathOf(d.method);
  const window = (d.window?.path as WindowPath | undefined) ?? null;
  return { method, window, path: window ?? method };
}

export function fieldContext(d: WindowData, ex: ExerciseDates & { reference: string; title: string }, timeZone: string | null, advertisementDay: string | null): WindowFieldContext {
  const w = d.window;
  return {
    organisationName: d.organisationName,
    exerciseReference: ex.reference,
    exerciseTitle: ex.title,
    requirements: d.tender.requirements,
    advertisementDay,
    closingAt: ex.closingAt,
    timeZone,
    inspectionPlace: w?.inspectionPlace ?? "",
    purchasePlace: w?.purchasePlace ?? "",
    inspectionHours: w?.inspectionHours ?? "",
    purchaseFromDay: w?.purchaseFromDay ? storedDay(w.purchaseFromDay) : null,
    purchaseCloseDay: w?.purchaseCloseDay ? storedDay(w.purchaseCloseDay) : null,
    fee: w?.feeAmount != null ? parseSen(w.feeAmount.toString()) : null,
    feePaymentMethods: w?.feePaymentMethods ?? "",
    submissionPlace: w?.submissionPlace ?? "",
    events: (w?.events ?? []).map((e) => ({ kind: e.kind, startsAt: e.startsAt, place: e.place, mandatory: e.mandatory, cancelled: e.cancelledAt != null })),
    mandatoryPermitted: mandatoryPermittedFor(w, d.policy.mandatoryAttendancePermitted).permitted,
    saleMode: ex.saleMode ?? null,
    onlinePayment: d.sale.online,
  };
}

const stampOf = (ex: Pick<ExerciseForWindow, "restrictedTender">, d: WindowData) => (ex.restrictedTender === true ? d.tender.stamp : null);

/// The notice, rendered for this window on its advertisement day (advertised path).
export function renderNotice(d: WindowData, ex: ExerciseForWindow, timeZone: string | null, advertisementDay: string | null) {
  const ctx = fieldContext(d, ex, timeZone, advertisementDay);
  return renderInstrument("NOTICE", d.templates.notice, (lang) => windowFieldValues(ctx, lang), stampOf(ex, d), ex.saleMode);
}

/// One letter per proposed invitee, rendered for the invitation day (invited path).
export function renderLetters(d: WindowData, ex: ExerciseForWindow, timeZone: string | null, invitationDay: string | null) {
  const ctx = fieldContext(d, ex, timeZone, invitationDay);
  return proposedInvitees(d.parties).map((p) => ({ party: p, rendered: renderInstrument("INVITATION", d.templates.invitation, (lang) => ({ ...windowFieldValues(ctx, lang), ...inviteeFieldValues(p) }), stampOf(ex, d), ex.saleMode) }));
}

/// An addendum rendered as it would issue now, with the number it would take.
export function renderAddendum(d: WindowData, ex: ExerciseForWindow, timeZone: string | null, a: { number: number | null; title: string; whatChanged: string; issuedOn: string | null }) {
  const ctx = fieldContext(d, ex, timeZone, d.window?.advertisementDay ? storedDay(d.window.advertisementDay) : null);
  return renderInstrument("ADDENDUM", d.templates.addendum, (lang) => ({ ...windowFieldValues(ctx, lang), ...addendumFieldValues(a, lang) }), stampOf(ex, d), ex.saleMode);
}

/// The template's state for the publication's judgement: for letters, the worst of them (every letter must render).
function templateJudgement(rs: readonly ReturnType<typeof renderInstrument>[], fallback: ReturnType<typeof renderInstrument>) {
  if (rs.length === 0) return { state: fallback.state, missing: fallback.missing, unknown: fallback.unknown, stampMissing: fallback.stampMissing };
  const notOk = rs.find((r) => r.state !== "OK");
  if (notOk) return { state: notOk.state, missing: [], unknown: [], stampMissing: false };
  const uniq = (xs: string[]) => [...new Set(xs)];
  return { state: "OK" as const, missing: uniq(rs.flatMap((r) => r.missing)), unknown: uniq(rs.flatMap((r) => r.unknown)), stampMissing: rs.some((r) => r.stampMissing) };
}

/**
 * The publication judged now: every finding, the advertisement day it would be recorded with, and
 * the texts it would freeze (the notice, or each letter). `today` null: the zone is not set.
 */
export function judgePublish(d: WindowData, ex: ExerciseForWindow, org: { timeZone: string | null; today: string | null }) {
  const { method, window, path } = pathOf(d);
  const w = d.window;
  const records = (w?.publications ?? []).map((p) => ({ channelId: p.channelId, publishedOn: storedDay(p.publishedOn) }));
  const proposed = proposedInvitees(d.parties);
  // A first pass for the advertisement day, so the instrument is rendered with it.
  const base: Omit<PublishInput, "template"> = {
    status: ex.status,
    packKind: ex.packKindSnapshot,
    methodPath: method,
    windowPath: window,
    restricted: ex.restrictedTender,
    saleMode: ex.saleMode,
    requirements: d.tender.requirements.length,
    window: {
      inspectionPlace: w?.inspectionPlace ?? "",
      purchasePlace: w?.purchasePlace ?? "",
      inspectionHours: w?.inspectionHours ?? "",
      purchaseFromDay: w?.purchaseFromDay ? storedDay(w.purchaseFromDay) : null,
      purchaseCloseDay: w?.purchaseCloseDay ? storedDay(w.purchaseCloseDay) : null,
      fee: w?.feeAmount != null ? parseSen(w.feeAmount.toString()) : null,
      feePaymentMethods: w?.feePaymentMethods ?? "",
      submissionPlace: w?.submissionPlace ?? "",
      closingTimeReason: w?.closingTimeReason ?? "",
    },
    // SR-06 (ruling 9): the validity is asked at publication only for an exercise submitted under the notice gate.
    bidValidity: { required: ex.openingRosterRequired, days: w?.bidValidityDays ?? null },
    events: w ? eventFactsOf(w) : [],
    policy: d.policy,
    calendar: d.calendar,
    channels: d.channels,
    records,
    closingAt: ex.closingAt,
    tenderingStartOn: ex.tenderingStartOn ? storedDay(ex.tenderingStartOn) : null,
    timeZone: org.timeZone,
    today: org.today,
    regime: ex.regime,
    floors: d.floors,
    basisTotal: w ? basisTotalOf(w) : 0n,
    changePending: changeRoutesOf(ex).some((r) => r.status === "PENDING"),
    invited: path === "INVITED" ? { method: { requiresNameApproval: d.method?.requiresNameApproval ?? false }, nameRoutes: nameRoutesWithLists(ex, d.invitees), proposed } : null,
    // 6.8 (E-2): the model chosen, judged against the basis's route; pinned by the publication.
    evaluationModel: evaluationPin(d, ex),
  };
  const ok = { state: "OK" as const, missing: [], unknown: [], stampMissing: false };
  const first = publishFaults({ ...base, template: ok });
  const day = first.advertisementDay;
  const notice = path === "ADVERTISED" ? renderNotice(d, ex, org.timeZone, day) : null;
  const letters = path === "INVITED" ? renderLetters(d, ex, org.timeZone, day) : [];
  const fallback = path === "INVITED" ? renderInstrument("INVITATION", d.templates.invitation, () => ({}), null) : (notice ?? renderInstrument("NOTICE", d.templates.notice, () => ({}), null));
  const template = path === "INVITED" ? templateJudgement(letters.map((l) => l.rendered), fallback) : templateJudgement(notice ? [notice] : [], fallback);
  const result = publishFaults({ ...base, template });
  return { path, result, notice, letters, input: { ...base, template } };
}

/// The closing day as the organisation reads it.
export const closingDay = (closingAt: Date | null, timeZone: string | null) => (closingAt && timeZone ? dayIn(closingAt, timeZone) : null);

/// Whether two registration numbers are the same contractor's.
export const sameRegistration = (a: string, b: string) => regKey(a) === regKey(b);
