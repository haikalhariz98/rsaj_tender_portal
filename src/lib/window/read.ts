/**
 * What 6.5's screens read (plan §5): the Invitation tab's four sections — Window, Sale register,
 * Briefing, Addenda — and Configuration › Invitation controls. Reads only; every decision comes
 * from the same rules the actions run (`judge.ts` and friends) on the same mapping (`repo.ts`), so
 * a disabled action and a refused one give the same words. Values are words: money formatted,
 * days as the screens write them, every enum by its label, never a code (AGENTS.md rule 5). Each
 * rule shown carries its value, where it comes from and its source, or "Not set".
 */

import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDateTime, formatOrgDay } from "@/lib/format";
import { uncollectedReceipts } from "@/lib/integration/fee-receipt";
import { EXERCISE_STATUS_LABEL, REGIME_LABEL } from "@/lib/method/labels";
import { loadExercise } from "@/lib/method/repo";
import { nameRouteLabel, nameRoutesOf, windowChangeRoutesOf } from "@/lib/method/approval";
import type { Regime } from "@/lib/method/types";
import { formatMoney, parseSen } from "@/lib/money";
import { leadTimeText } from "@/lib/scope/labels";
import { loadScopePolicy } from "@/lib/scope/repo";
import { scopeReadiness } from "@/lib/tender-docs/repo";
import { estimateLeadWarning } from "@/lib/tender-docs/tendering";

import { addendumWindowFault, issueFaults, nextAddendumNumber, notified, recipientsFor } from "./addendum";
import { closingChangeFaults, cancelFaults, closingMayMove } from "./change";
import { advertisementDay, requiredChannels } from "./dates";
import { windowEditFault } from "./edit";
import { attendanceCsv, isMandatory, mandatoryPermittedFor } from "./events";
import { inviteeEditFault, inviteeListFault, regKey } from "./invitees";
import { closingDay, judgePublish, nameRoutesWithLists, pathOf, phaseOf, proposedInvitees, renderAddendum } from "./judge";
import { ADDENDUM_STATUS_LABEL, CLOSING_CHANGE_KIND_LABEL, DAY_RULE_LABEL, DELIVERY_METHOD_LABEL, FEE_COST_KIND_LABEL, NOTIFIED_LABEL, PARTY_SOURCE_LABEL, PATH_LABEL, PHASE_LABEL, RULE_LABEL, advertisedOnlyNote, bidNouns, PHASE_TONE, SITE_EVENT_KIND_LABEL, tableAvailabilityText, windowFindingText } from "./labels";
import { closingHistory, sinceApprovedLines, standingEntry, tableDocumentAvailability, tablePrintRefusal, type TableAvailability, type WindowPhase } from "./phase";
import { basisTotalOf, eventFactsOf, loadCalendar, loadChannels, loadFloors, loadWindowPolicy, windowData, type WindowData } from "./repo";
import { foldUnpreparedWindow } from "./publish";
import { annotationLines, isAnnotation, voidSaleFault } from "./sale";
import { saleChecks } from "./sale-checks";
import type { Finding, Provenance, WindowPath } from "./types";

const NOT_SET = "Not set";
const PROVENANCE_LABEL: Record<Provenance, string> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };
const provenance = (p: Provenance | null) => (p ? PROVENANCE_LABEL[p] : NOT_SET);
const money = (v: { toString(): string } | null | undefined) => (v == null ? NOT_SET : formatMoney(parseSen(v.toString())));
const day = (d: Date | null | undefined) => (d ? formatDate(storedDay(d)) : NOT_SET);
const allowed = (f: Finding | null | undefined) => (f ? { allowed: false as const, reason: windowFindingText(f) } : { allowed: true as const });
const firstBlock = (fs: readonly Finding[]) => fs.find((f) => f.level === "block") ?? null;
const words = (fs: readonly Finding[]) => fs.map((f) => ({ level: f.level, text: windowFindingText(f) }));
const delivery = (d: { method: keyof typeof DELIVERY_METHOD_LABEL | null; consignmentRef: string; despatchedOn: Date | null; acknowledgedOn: Date | null }) => ({
  sentBy: d.method ? DELIVERY_METHOD_LABEL[d.method] : "Not recorded",
  consignment: d.consignmentRef || null,
  sentOn: d.despatchedOn ? day(d.despatchedOn) : "Not recorded",
  acknowledgedOn: d.acknowledgedOn ? day(d.acknowledgedOn) : "Not recorded",
  /// As stored, for the form that records it: sending the form again must not erase what was recorded.
  raw: { method: d.method ?? "", consignmentRef: d.consignmentRef, despatchedOn: d.despatchedOn ? storedDay(d.despatchedOn) : "", acknowledgedOn: d.acknowledgedOn ? storedDay(d.acknowledgedOn) : "" },
});

/// The exercise, its organisation and the window's data, read for display (no lock).
async function load(exerciseId: string) {
  const l = await loadExercise(exerciseId);
  if (!l) return null;
  const d = await windowData(l.org.id, l.ex);
  return { ...l, d, now: new Date() };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

const WEEKDAY_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/// The window's rules, each with its value, where it comes from and its source (or "Not set").
function rulesShown(d: WindowData, path: WindowPath | null = null) {
  // On the invited path no advertisement is made, so the rules about one are marked, not hidden: they are
  // still the organisation's settings, and the window is judged by none of them.
  return ruleRows(d).map((r) => ({ ...r, note: advertisedOnlyNote(r.label, path) }));
}

function ruleRows(d: WindowData) {
  const p = d.policy;
  const source = p.dateRuleSource.trim() || null;
  const days = (n: number | null) => (n == null ? NOT_SET : `${n} day${n === 1 ? "" : "s"}`);
  return [
    { label: "Minimum days from advertisement to closing", value: days(p.minAdvertisementDays), from: provenance(p.dateRulesProvenance), source },
    { label: "Target days from advertisement to closing", value: days(p.targetAdvertisementDays), from: provenance(p.dateRulesProvenance), source },
    { label: "Margin for a late newspaper", value: days(p.newspaperWarnDays), from: provenance(p.dateRulesProvenance), source },
    { label: RULE_LABEL.purchaseCutoff, value: days(p.purchaseCutoffDays), from: provenance(p.dateRulesProvenance), source },
    { label: "Default closing time", value: p.defaultClosingTime ?? NOT_SET, from: provenance(p.closingTimeProvenance), source },
    { label: "Advertisement day", value: p.advertisementDayRule ? `${DAY_RULE_LABEL[p.advertisementDayRule]}${p.advertisementDayRule === "NAMED_CHANNEL" ? ` (${d.channels.find((c) => c.id === p.advertisementChannelId)?.nameEn ?? "a channel no longer configured"})` : ""}` : NOT_SET, from: provenance(p.dayRuleProvenance), source: null },
    { label: "Holiday calendar", value: d.calendar ? d.calendar.name : NOT_SET, from: d.calendar ? provenance(d.calendar.provenance ?? null) : NOT_SET, source: null },
    { label: "Weekend", value: d.calendar?.weekendDays.length ? d.calendar.weekendDays.map((n) => WEEKDAY_NAME[n - 1]).join(", ") : NOT_SET, from: d.calendar ? provenance(d.calendar.weekendProvenance ?? null) : NOT_SET, source: null },
    { label: RULE_LABEL.mandatoryAttendance, value: p.mandatoryAttendancePermitted == null ? "Not set: no event is mandatory" : p.mandatoryAttendancePermitted ? "May be made mandatory" : "Not permitted", from: provenance(p.attendanceProvenance), source: null },
  ];
}

/**
 * The Invitation › Window section: the window card (dates, rules, phase, the estimate's lead), the
 * notice's items and fee with its basis, the channels and publications (advertised) or the
 * invitee list against the approved list, with the letters (invited), the closing's history and
 * the changes asked for, and every act's state. Null where the exercise does not exist.
 */
export async function windowTab(exerciseId: string) {
  const x = await load(exerciseId);
  if (!x) return null;
  const { org, ex, d, now } = x;
  const tz = org.timeZone;
  const w = d.window;
  const { path, method: methodPath } = pathOf(d);
  const phase = phaseOf(ex, w, now, tz);
  const j = judgePublish(d, ex, org);
  const editFault = windowEditFault(ex.status, ex.packKindSnapshot);
  // 6.2's estimate lead, re-read against the closing as it stands: shown, never a refusal here.
  const scopePolicy = await loadScopePolicy(org.id);
  const scope = await scopeReadiness(org.id, ex);
  const lead = estimateLeadWarning(scope.lastEstimateVersionOn, ex.closingAt, scopePolicy, tz);
  const changeRoutes = windowChangeRoutesOf(ex.approvalInstances);
  const pending = changeRoutes.find((r) => r.status === "PENDING") ?? null;
  const cancelledOn = formatCancelledOn(w?.cancellations ?? [], tz);
  // A cancelled exercise and the one that replaces it link each other (FR-ADV-016).
  const related = await db.sourcingExercise.findMany({ where: { OR: [...(ex.replacesExerciseId ? [{ id: ex.replacesExerciseId }] : []), { replacesExerciseId: ex.id }] }, select: { id: true, reference: true, replacesExerciseId: true }, orderBy: { reference: "asc" } });
  const history = closingHistory(d.approved?.approvedClosingAt ? { closingAt: d.approved.approvedClosingAt, approvedAt: d.approved.approvedAt } : null, w?.closingChanges ?? []);
  const proposed = proposedInvitees(d.parties);
  const nameRoutes = nameRoutesWithLists(ex, d.invitees);
  const latestName = nameRoutes[0] ?? null;
  const approvedList = latestName && (latestName.status === "APPROVED" || latestName.status === "PENDING") ? latestName.invitees : null;
  const listFault = latestName ? inviteeListFault(latestName.invitees, proposed) : null;
  const tabActs = await closingActions(x);
  return {
    exercise: { id: ex.id, reference: ex.reference, title: ex.title, status: EXERCISE_STATUS_LABEL[ex.status], regime: ex.regime ? REGIME_LABEL[ex.regime as Regime] : NOT_SET, restricted: ex.restrictedTender == null ? "Not answered" : ex.restrictedTender ? d.tender.restrictionLabel ?? "Restricted" : "Not restricted" },
    bid: bidNouns(ex.packKindSnapshot),
    hasWindow: !!w,
    path: path ? PATH_LABEL[path] : "Not set: the method says both or neither",
    pathKey: path,
    pathChanged: !!(w && methodPath && w.path !== methodPath),
    phase: { key: phase.phase, label: PHASE_LABEL[phase.phase], tone: PHASE_TONE[phase.phase], submissionOpen: phase.submissionOpen },
    tableDocument: tableAvailabilityText(tableDocumentAvailability(phase.phase), cancelledOn),
    dates: {
      start: day(ex.tenderingStartOn),
      closing: ex.closingAt ? formatOrgDateTime(ex.closingAt, tz) : NOT_SET,
      advertisedOn: w?.advertisementDay ? day(w.advertisementDay) : j.result.advertisementDay ? `${formatDate(j.result.advertisementDay)} (if published now)` : "Not known yet",
      firstDayOfSale: day(w?.purchaseFromDay),
      lastDayOfSale: day(w?.purchaseCloseDay),
      publishedAt: w?.publishedAt ? formatOrgDateTime(w.publishedAt, tz) : null,
    },
    lead: { text: leadTimeText(lead), warn: lead.warn },
    rules: rulesShown(d, path),
    frozenRules: w?.policySnapshot ? "The rules this window was published under are kept with it." : null,
    items: w
      ? { inspectionPlace: w.inspectionPlace, purchasePlace: w.purchasePlace, inspectionHours: w.inspectionHours, purchaseFromDay: w.purchaseFromDay ? storedDay(w.purchaseFromDay) : "", purchaseCloseDay: w.purchaseCloseDay ? storedDay(w.purchaseCloseDay) : "", feeAmount: w.feeAmount?.toString() ?? "", feePaymentMethods: w.feePaymentMethods, submissionPlace: w.submissionPlace, closingTimeReason: w.closingTimeReason }
      : null,
    registrations: d.tender.requirements.map((r) => `${r.bodyLabel}${r.qualifiers.trim() ? ` (${r.qualifiers.trim()})` : ""}`),
    fee: {
      amount: money(w?.feeAmount),
      floor: (() => {
        const f = d.floors.find((x) => x.regime === ex.regime);
        return f ? { amount: formatMoney(f.minimum), from: provenance(f.provenance), source: f.governingSource || null } : null;
      })(),
      basis: (w?.feeLines ?? []).map((l) => ({ id: l.id, cost: FEE_COST_KIND_LABEL[l.kind], description: l.description, quantity: l.quantity?.toString() ?? null, unitCost: l.unitCost ? money(l.unitCost) : null, amount: money(l.amount), raw: { kind: l.kind, description: l.description, quantity: l.quantity?.toString() ?? "", unitCost: l.unitCost?.toString() ?? "", amount: l.quantity ? "" : l.amount.toString() } })),
      basisTotal: w ? formatMoney(basisTotalOf(w)) : formatMoney(0n),
    },
    channels: path === "ADVERTISED"
      ? d.channels.filter((c) => c.retiredOn == null || w?.publications.some((p) => p.channelId === c.id)).map((c) => {
          const p = w?.publications.find((x) => x.channelId === c.id) ?? null;
          return { id: c.id, name: c.nameEn, required: c.requiredWhenAdvertised == null ? NOT_SET : c.requiredWhenAdvertised ? "Required" : "Not required", publication: p ? { id: p.id, on: day(p.publishedOn), reference: p.reference, recordedBy: `${p.recordedBy.name} (recorded on their behalf, not signed)` } : null };
        })
      : [],
    advertisementDay: path === "ADVERTISED" ? (() => {
      const a = advertisementDay((w?.publications ?? []).map((p) => ({ channelId: p.channelId, publishedOn: storedDay(p.publishedOn) })), d.channels, d.policy, org.today ?? "9999-12-31");
      return { day: a.day ? formatDate(a.day) : "Not known yet", missing: a.missing.map((c) => c.nameEn), required: requiredChannels(d.channels, org.today ?? "9999-12-31").map((c) => c.nameEn) };
    })() : null,
    invitees: path === "INVITED"
      ? {
          proposed: proposed.map((p) => {
            const letter = w?.letters.find((x) => x.partyId === p.id) ?? null;
            return { id: p.id, name: p.name, registrationNo: p.registrationNo, address: p.address, onApprovedList: approvedList ? approvedList.some((a) => regKey(a.registrationNo) === regKey(p.registrationNo)) : null, letter: letter ? { id: letter.id, frozenOn: formatOrgDateTime(letter.frozenAt, tz), ...delivery(letter) } : null };
          }),
          approved: approvedList ? approvedList.map((a) => ({ name: a.name, registrationNo: a.registrationNo, stillProposed: proposed.some((p) => regKey(p.registrationNo) === regKey(a.registrationNo)) })) : null,
          nameRoute: latestName ? { label: nameRouteLabel(latestName.status, nameRoutesOf(ex.approvalInstances).find((r) => r.id === latestName.id)?.warnings), listState: listFault ? windowFindingText(listFault) : "The approved list is the proposed list." } : null,
          edit: allowed(inviteeEditFault(ex.status)),
        }
      : null,
    findings: words(foldUnpreparedWindow(j.result.findings, !!w)),
    notice: w?.noticeText ? { text: w.noticeText, template: w.noticeTemplateCode ? `${d.templates.notice?.nameEn ?? "A template"}, text version ${w.noticeTemplateBodyVersion}` : null } : j.notice?.text ? { text: j.notice.text, template: null, preview: true } : null,
    history: history.map((h, i) => ({ stands: standingEntry(history.length, phase.phase) === i, what: h.source === "APPROVED" ? "Approved for tendering" : CLOSING_CHANGE_KIND_LABEL[h.source], closing: formatOrgDateTime(h.closingAt, tz), lastDayOfSale: h.purchaseCloseDay ? day(h.purchaseCloseDay) : null, on: h.at ? formatOrgDateTime(h.at, tz) : NOT_SET, reason: h.reason || null })),
    changes: (w?.closingChanges ?? []).map((c) => {
      const route = changeRoutes.find((r) => r.id === c.approvalInstanceId) ?? null;
      return {
        id: c.id,
        kind: CLOSING_CHANGE_KIND_LABEL[c.kind],
        from: formatOrgDateTime(c.fromClosingAt, tz),
        to: formatOrgDateTime(c.toClosingAt, tz),
        lastDayOfSale: c.toPurchaseCloseDay ? day(c.toPurchaseCloseDay) : null,
        reason: c.reason,
        state: c.appliedAt ? `Applied ${formatOrgDateTime(c.appliedAt, tz)}` : c.refusedAt ? `Not made: ${c.refusedReason}` : "With approval",
        routeId: route?.id ?? null,
        notices: c.notices.map((n) => ({ id: n.id, recipient: n.party.name, ...delivery(n) })),
      };
    }),
    cancellations: (w?.cancellations ?? []).map((c) => ({ id: c.id, reason: c.reason, feesRefunded: c.feeRefund ? "Yes" : "No", state: c.appliedAt ? `Applied ${formatOrgDateTime(c.appliedAt, tz)}` : c.refusedAt ? `Not made: ${c.refusedReason}` : "With approval", notices: c.notices.map((n) => ({ id: n.id, recipient: n.party.name, ...delivery(n) })) })),
    pendingChangeRouteId: pending?.id ?? null,
    replaces: related.filter((r) => r.id === ex.replacesExerciseId).map((r) => ({ id: r.id, reference: r.reference }))[0] ?? null,
    replacedBy: related.filter((r) => r.replacesExerciseId === ex.id).map((r) => ({ id: r.id, reference: r.reference })),
    cancelledOn,
    actions: {
      save: allowed(editFault),
      publish: firstBlock(j.result.findings) ? { allowed: false as const, reason: windowFindingText(firstBlock(j.result.findings)!) } : { allowed: true as const },
      publishLabel: path === "INVITED" ? "Issue the letters of invitation" : "Publish the advertisement",
      ...tabActs,
    },
  };
}

/**
 * The acts the Invitation TAB offers whichever section is open (correct the closing before
 * publication, extend it and cancel after): one judgement, so the header reads the same on every
 * section (UX U6). Each is allowed or carries its reason.
 */
async function closingActions(x: Loaded) {
  const { org, ex, d, now } = x;
  const tz = org.timeZone;
  const w = d.window;
  const phase = phaseOf(ex, w, now, tz);
  const pending = windowChangeRoutesOf(ex.approvalInstances).find((r) => r.status === "PENDING") ?? null;
  const extend = w && ex.closingAt ? closingChangeFaults({ kind: "EXTENSION", status: ex.status, now, currentClosingAt: ex.closingAt, toClosingAt: new Date(ex.closingAt.getTime() + 7 * 86_400_000), currentPurchaseCloseDay: w.purchaseCloseDay ? storedDay(w.purchaseCloseDay) : null, toPurchaseCloseDay: null, reason: "-", changePending: !!pending, rules: { advertisementDay: null, closingTimeReason: "", timeZone: tz, policy: d.policy, calendar: d.calendar } }) : [];
  const live = await db.award.findMany({ where: { exerciseId: ex.id }, select: { reference: true, status: true } });
  const awardLive = live.find((a) => a.status !== "CANCELLED") ?? null;
  const cancelBlock = firstBlock(cancelFaults({ status: ex.status, reason: "-", feeRefund: true, changePending: !!pending, awardStands: awardLive?.reference ?? null, today: org.today }));
  const extendBlock = ["NOT_PUBLISHED", "CLOSING_PASSED", "CHANGE_PENDING", "TIME_ZONE_UNSET"].map((c) => extend.find((f) => f.code === c)).find(Boolean) ?? null;
  return {
    closing: ex.closingAt ? formatOrgDateTime(ex.closingAt, tz) : NOT_SET,
    lastDayOfSale: w?.purchaseCloseDay ? day(w.purchaseCloseDay) : null,
    correct: allowed(ex.status === "APPROVED_FOR_TENDERING" ? (pending ? { code: "CHANGE_PENDING", level: "block" } : null) : { code: ex.status === "ADVERTISED" || ex.status === "INVITED" ? "ALREADY_PUBLISHED" : "NOT_APPROVED_FOR_TENDERING", level: "block" }),
    extend: closingMayMove(phase.phase) ? allowed(extendBlock) : allowed(extendBlock ?? { code: ex.status === "ADVERTISED" || ex.status === "INVITED" ? "CLOSING_PASSED" : "NOT_PUBLISHED", level: "block" }),
    cancel: allowed(cancelBlock && cancelBlock.code !== "REASON_REQUIRED" ? cancelBlock : null),
  };
}

/// The tab's acts alone, for the sections that do not otherwise read the window (the sale register, briefing, addenda).
export async function invitationActs(exerciseId: string) {
  const x = await load(exerciseId);
  return x ? closingActions(x) : null;
}

export type WindowTab = NonNullable<Awaited<ReturnType<typeof windowTab>>>;

/**
 * The Sale register (FR-ADV-009–012): every sale with its receipt, amount, day, the checks as
 * attested (register checks "not checked" until 6.15), the addenda acknowledged, and the printable
 * annotation; the reconciliation exceptions (no receipt); and what a new sale needs.
 */
export async function saleRegister(exerciseId: string) {
  const x = await load(exerciseId);
  if (!x) return null;
  const { org, ex, d, now } = x;
  const w = d.window;
  const phase = phaseOf(ex, w, now, org.timeZone).phase;
  const sales = w?.sales ?? [];
  const addenda = (w?.addenda ?? []).filter((a) => a.status === "ISSUED");
  return {
    pathKey: pathOf(d).path,
    status: ex.status,
    phase: PHASE_LABEL[phase],
    open: phase === "OPEN_FOR_PURCHASE" ? { allowed: true as const } : { allowed: false as const, reason: windowFindingText({ code: "SALE_CLOSED", level: "block", data: { phase } }) },
    restricted: ex.restrictedTender === true ? { label: d.tender.restrictionLabel ?? "Restricted", asks: "The original or a certified copy of the purchaser's status certificate, and the day it is valid until." } : null,
    fee: money(w?.feeAmount),
    rows: sales.map((s) => {
      const acked = addenda.filter((a) => a.recipients.some((c) => c.partyId === s.partyId && c.acknowledgedOn)).length;
      return {
        id: s.id,
        purchaser: s.party.name,
        registrationNo: s.party.registrationNo,
        receipt: s.financeReceiptNo ?? "Not recorded",
        amount: money(s.amount),
        soldOn: day(s.soldOn),
        paymentMethod: s.paymentMethod,
        checks: saleChecks({ authoritySighted: s.authoritySighted, certSighted: s.restrictionCertSighted, certValidUntil: s.restrictionCertValidUntil ? storedDay(s.restrictionCertValidUntil) : null, registrationCheck: s.registrationCheck, suspensionCheck: s.suspensionCheck }, closingDay(ex.closingAt, org.timeZone)),
        addendaAcknowledged: `${acked} of ${addenda.length}`,
        issuedBy: `${s.issuedBy.name} (recorded on their behalf, not signed)`,
        voided: s.voidedAt ? `Voided: ${s.voidReason}` : null,
        void: s.voidedAt ? null : allowed(voidSaleFault(s, phase, "-")),
        label: isAnnotation(s.annotation) ? annotationLines(s.annotation) : [],
      };
    }),
    reconciliation: uncollectedReceipts(sales).map((s) => ({ id: s.id, purchaser: s.party.name, soldOn: day(s.soldOn), amount: money(s.amount) })),
    parties: d.parties.map((p) => ({ id: p.id, name: p.name, registrationNo: p.registrationNo, cameAs: PARTY_SOURCE_LABEL[p.source], invited: p.source === "PROPOSED_INVITEE" })),
  };
}

/**
 * The Briefing section (FR-ADV-013): each event with its day, place, whether attendance is
 * mandatory in words (OD-8: "Not mandatory: mandatory attendance not set" where the policy is not
 * set), whether it was held, and its attendance register.
 */
export async function briefingTab(exerciseId: string) {
  const x = await load(exerciseId);
  if (!x) return null;
  const { org, ex, d } = x;
  const attendance = mandatoryPermittedFor(d.window, d.policy.mandatoryAttendancePermitted);
  const permitted = attendance.permitted;
  const events = d.window?.events ?? [];
  const facts = d.window ? eventFactsOf(d.window) : [];
  return {
    pathKey: pathOf(d).path,
    status: ex.status,
    parties: d.parties.map((p) => ({ id: p.id, name: p.name, registrationNo: p.registrationNo, invited: p.source === "PROPOSED_INVITEE" })),
    schedule: allowed(windowEditFault(ex.status, ex.packKindSnapshot)),
    mandatoryOffered: permitted === true,
    events: events.map((e, i) => ({
      id: e.id,
      kind: SITE_EVENT_KIND_LABEL[e.kind],
      starts: formatOrgDateTime(e.startsAt, org.timeZone),
      place: e.place,
      attendance: permitted !== true ? `Not mandatory: mandatory attendance ${!attendance.recorded ? "not recorded with the published window" : permitted == null ? "not set" : "is not permitted"}${attendance.frozen && attendance.recorded ? " when the window was published" : ""}` : e.mandatory == null ? "Not answered" : isMandatory(facts[i], permitted) ? "Mandatory: the documents are sold only to those who attended" : "Not mandatory",
      held: e.heldOn ? day(e.heldOn) : null,
      cancelled: e.cancelledAt ? `Cancelled: ${e.cancelReason}` : null,
      register: e.attendance.map((a) => ({ contractor: a.party.name, registrationNo: a.party.registrationNo, representative: a.representative, recordedBy: `${a.recordedBy.name} (recorded on their behalf, not signed)`, recordedOn: formatOrgDateTime(a.recordedAt, org.timeZone) })),
    })),
  };
}

/// The attendance register of one event as CSV (Lampiran E). Null where the event is not this exercise's.
export async function attendanceRegisterCsv(exerciseId: string, eventId: string): Promise<{ filename: string; csv: string } | null> {
  const x = await load(exerciseId);
  if (!x) return null;
  const { org, ex, d } = x;
  const e = d.window?.events.find((v) => v.id === eventId);
  if (!e) return null;
  const permitted = mandatoryPermittedFor(d.window, d.policy.mandatoryAttendancePermitted).permitted;
  const csv = attendanceCsv(
    { exerciseReference: ex.reference, kindLabel: SITE_EVENT_KIND_LABEL[e.kind], startsText: formatOrgDateTime(e.startsAt, org.timeZone), place: e.place, heldText: e.heldOn ? day(e.heldOn) : "Not held", mandatoryText: permitted === true && e.mandatory === true ? "Mandatory" : "Not mandatory" },
    e.attendance.map((a) => ({ name: a.party.name, registrationNo: a.party.registrationNo, representative: a.representative, recordedBy: a.recordedBy.name, recordedText: formatOrgDateTime(a.recordedAt, org.timeZone) })),
  );
  return { filename: `${ex.reference.replace(/[^A-Za-z0-9-]+/g, "-")}-${e.kind === "BRIEFING" ? "briefing" : "site-visit"}-attendance.csv`, csv };
}

/**
 * The Addenda section (FR-ADV-014): the register with each addendum's number, what it changes,
 * its recipients with delivery and acknowledgement, "n of m notified", and whether a draft may
 * issue now (and if not, why).
 */
export async function addendaTab(exerciseId: string) {
  const x = await load(exerciseId);
  if (!x) return null;
  const { org, ex, d, now } = x;
  const w = d.window;
  const phase = phaseOf(ex, w, now, org.timeZone).phase;
  const recipients = w ? recipientsFor(w.sales, w.letters.map((l) => ({ partyId: l.partyId }))) : [];
  return {
    status: ex.status,
    /// Applied closing changes an addendum may announce (the choice offered on a draft).
    closingChanges: (w?.closingChanges ?? []).filter((c) => c.appliedAt).map((c) => ({ value: c.id, label: `${CLOSING_CHANGE_KIND_LABEL[c.kind]} to ${formatOrgDateTime(c.toClosingAt, org.timeZone)}` })),
    /// How many a draft issued now would go to: the register as it stands (FR-ADV-012).
    willGoTo: recipients.length,
    draft: allowed(addendumWindowFault(phase)),
    windowClosed: addendumWindowFault(phase)?.code === "AFTER_CLOSING",
    addenda: (w?.addenda ?? []).map((a) => {
      const signedCopies = a.attachments.filter((x) => !x.detachedAt && !x.version.withdrawnAt).length;
      const rendered = a.status === "DRAFT" ? renderAddendum(d, ex, org.timeZone, { number: nextAddendumNumber(w!.addenda), title: a.title, whatChanged: a.whatChanged, issuedOn: org.today }) : null;
      const issue = rendered ? issueFaults({ status: a.status, phase, title: a.title, whatChanged: a.whatChanged, signedCopies, template: { state: rendered.state === "NO_LANGUAGE" ? "NO_TEXT" : rendered.state, missing: rendered.missing, unknown: rendered.unknown, stampMissing: rendered.stampMissing }, recipients: recipients.length, today: org.today }) : [];
      const n = notified(a.recipients);
      return {
        id: a.id,
        number: a.number != null ? `Addendum ${a.number}` : "Draft",
        title: a.title,
        whatChanged: a.whatChanged,
        status: ADDENDUM_STATUS_LABEL[a.status],
        issuedOn: a.issuedOn ? day(a.issuedOn) : null,
        closingChange: a.closingChange ? `${CLOSING_CHANGE_KIND_LABEL[a.closingChange.kind]} to ${formatOrgDateTime(a.closingChange.toClosingAt, org.timeZone)}` : null,
        signedCopy: signedCopies > 0 ? "Attached" : "Not attached",
        attach: a.status === "DRAFT" ? { ownerKind: "addendum" as const, ownerId: a.id, purpose: "ADDENDUM_SIGNED" as const } : null,
        text: a.renderedText,
        notified: a.status === "ISSUED" ? (n.state === "NO_RECIPIENTS" ? NOTIFIED_LABEL.NO_RECIPIENTS : `${n.done} of ${n.of} notified`) : null,
        recipients: a.recipients.map((c) => ({ id: c.id, recipient: c.party.name, given: c.withDocuments ? "With the documents" : null, ...delivery(c) })),
        issue: a.status === "DRAFT" ? (firstBlock(issue) ? { allowed: false as const, reason: words(issue.filter((f) => f.level === "block")).map((f) => f.text).join(" ") } : { allowed: true as const }) : null,
        voidReason: a.status === "VOID" ? a.voidReason : null,
      };
    }),
  };
}

/**
 * Configuration › Invitation controls: the policy (each value, where it comes from, or "Not set"),
 * the channels, the fee floors, the holiday calendars with their years and holidays, and the
 * templates that may be chosen. A header count of what is not set (settings whose absence holds
 * a publication back).
 */
export async function invitationConfig() {
  const org = await db.organisation.findFirst({ select: { id: true, timeZone: true } });
  if (!org) return null;
  const policy = await loadWindowPolicy(org.id);
  const channels = await loadChannels(org.id);
  const floors = await loadFloors(org.id);
  const calendars = await db.holidayCalendar.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { years: { orderBy: { year: "asc" } }, holidays: { orderBy: { day: "asc" } } } });
  const templates = await db.documentTemplate.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, bodyEn: true, bodyMs: true } });
  const calendar = await loadCalendar(policy.calendarId);
  const notSet = [
    policy.minAdvertisementDays == null,
    policy.targetAdvertisementDays == null,
    policy.newspaperWarnDays == null,
    policy.purchaseCutoffDays == null,
    policy.defaultClosingTime == null,
    policy.advertisementDayRule == null,
    policy.calendarId == null,
    policy.noticeTemplateId == null,
    policy.invitationTemplateId == null,
    policy.addendumTemplateId == null,
    channels.filter((c) => c.retiredOn == null).length === 0,
    floors.length === 0,
  ].filter(Boolean).length;
  return {
    notSet,
    policy: {
      values: policy,
      rules: rulesShown({ policy, channels, calendar } as unknown as WindowData),
      templates: { notice: templates.find((t) => t.id === policy.noticeTemplateId)?.nameEn ?? NOT_SET, invitation: templates.find((t) => t.id === policy.invitationTemplateId)?.nameEn ?? NOT_SET, addendum: templates.find((t) => t.id === policy.addendumTemplateId)?.nameEn ?? NOT_SET },
    },
    channels: channels.map((c) => ({ ...c, required: c.requiredWhenAdvertised == null ? NOT_SET : c.requiredWhenAdvertised ? "Required" : "Not required", from: PROVENANCE_LABEL[c.provenance], retired: c.retiredOn ? `Retired ${formatDate(c.retiredOn)}` : null })),
    floors: floors.map((f) => ({ id: f.id, band: REGIME_LABEL[f.regime as Regime] ?? f.regime, regime: f.regime, minimum: formatMoney(f.minimum), from: PROVENANCE_LABEL[f.provenance], source: f.governingSource || null })),
    calendars: calendars.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      weekend: c.weekendDays.length ? c.weekendDays.map((n) => ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][n]).join(", ") : NOT_SET,
      weekendDays: c.weekendDays,
      from: PROVENANCE_LABEL[c.provenance as Provenance],
      retired: c.retiredOn ? `Retired ${day(c.retiredOn)}` : null,
      years: c.years.map((y) => ({ id: y.id, year: y.year, complete: y.complete ? "Maintained in full" : "Not complete: a closing in this year is refused", source: y.source || null, from: PROVENANCE_LABEL[y.provenance as Provenance] })),
      holidays: c.holidays.map((h) => ({ id: h.id, day: day(h.day), name: h.nameEn, nameMs: h.nameMs, gazette: h.gazetteRef || null, from: PROVENANCE_LABEL[h.provenance as Provenance] })),
    })),
    templates: templates.map((t) => ({ id: t.id, name: t.nameEn, hasText: !!(t.bodyEn?.trim() || t.bodyMs?.trim()) })),
  };
}

/// The organisation's reconciliation exceptions (FR-ADV-009 partial): live sales with no finance receipt, oldest first.
export async function receiptExceptions() {
  const org = await db.organisation.findFirst({ select: { id: true } });
  if (!org) return [];
  const sales = await db.documentSale.findMany({ where: { organisationId: org.id, voidedAt: null, financeReceiptNo: null }, include: { party: { select: { name: true } }, window: { select: { exercise: { select: { id: true, reference: true } } } } }, orderBy: { soldOn: "asc" } });
  return sales.map((s) => ({ id: s.id, exerciseId: s.window.exercise.id, exercise: s.window.exercise.reference, purchaser: s.party.name, soldOn: day(s.soldOn), amount: money(s.amount) }));
}

/**
 * The sourcing list's closing and phase columns (plan §5), for the exercises shown: the closing
 * in the organisation's zone and the phase in words, derived now (ADR 0014).
 */
export async function windowColumns(exerciseIds: readonly string[]) {
  if (exerciseIds.length === 0) return new Map<string, { closing: string; phase: string; phaseCode: WindowPhase; closingDay: string | null }>();
  const org = await db.organisation.findFirst({ select: { timeZone: true } });
  const tz = org?.timeZone ?? null;
  const rows = await db.sourcingExercise.findMany({ where: { id: { in: [...exerciseIds] } }, select: { id: true, status: true, closingAt: true, window: { select: { purchaseFromDay: true, purchaseCloseDay: true } } } });
  const now = new Date();
  return new Map(
    rows.map((r) => {
      const phase = phaseOf(r, r.window, now, tz).phase;
      return [r.id, { closing: r.closingAt ? formatOrgDateTime(r.closingAt, tz) : "—", phase: PHASE_LABEL[phase], phaseCode: phase, closingDay: closingDay(r.closingAt, tz) }];
    }),
  );
}

export type { Loaded };

/// FR-DOC-010: whether the Tender Table Document is available now, in words, from the window's phase (ADR 0014).
export async function tableDocumentNote(exerciseId: string): Promise<{ availability: TableAvailability; text: string; refusal: string | null; sinceApproved: string[] } | null> {
  const l = await loadExercise(exerciseId);
  if (!l) return null;
  const tz = l.org.timeZone;
  const w = await db.exerciseWindow.findUnique({
    where: { exerciseId },
    select: {
      purchaseFromDay: true,
      purchaseCloseDay: true,
      cancellations: { select: { appliedAt: true } },
      closingChanges: { select: { kind: true, toClosingAt: true, toPurchaseCloseDay: true, appliedAt: true } },
      addenda: { select: { status: true } },
    },
  });
  const phase = phaseOf(l.ex, w, new Date(), tz).phase;
  const availability = tableDocumentAvailability(phase);
  const history = closingHistory(null, (w?.closingChanges ?? []).map((c) => ({ ...c, reason: "" })));
  return {
    availability,
    text: tableAvailabilityText(availability, formatCancelledOn(w?.cancellations ?? [], tz)),
    refusal: tablePrintRefusal(availability),
    sinceApproved: sinceApprovedLines({ closing: l.ex.closingAt ? formatOrgDateTime(l.ex.closingAt, tz) : null, closingChanges: history.length, addendaIssued: (w?.addenda ?? []).filter((a) => a.status === "ISSUED").length }),
  };
}

/// The day an applied cancellation took effect, as the organisation reads it; null where none was applied.
const formatCancelledOn = (cancellations: readonly { appliedAt: Date | null }[], tz: string | null) => {
  const c = cancellations.find((x) => x.appliedAt);
  return c?.appliedAt ? formatOrgDay(c.appliedAt, tz) : null;
};

/**
 * The name approval's invitee list (ADR 0015): the list as it stands beside the list the latest
 * name route was asked and approved for, whether they agree, and whether the list is frozen (the
 * exercise is invited). Null where the exercise does not exist.
 */
export async function nameListTab(exerciseId: string) {
  const x = await load(exerciseId);
  if (!x) return null;
  const { ex, d } = x;
  const proposed = proposedInvitees(d.parties);
  const latest = nameRoutesWithLists(ex, d.invitees)[0] ?? null;
  const fault = latest ? inviteeListFault(latest.invitees, proposed) : null;
  const route = latest ? nameRoutesOf(ex.approvalInstances).find((r) => r.id === latest.id) : null;
  return {
    invited: pathOf(d).path === "INVITED",
    frozen: ex.status === "INVITED",
    proposed: proposed.map((p) => ({ name: p.name, registrationNo: p.registrationNo, onRoute: latest ? latest.invitees.some((a) => regKey(a.registrationNo) === regKey(p.registrationNo)) : null })),
    route: latest ? { label: nameRouteLabel(latest.status, route?.warnings), state: fault ? windowFindingText(fault) : "The list as approved is the list as proposed." } : null,
    asked: latest ? latest.invitees.map((a) => ({ name: a.name, registrationNo: a.registrationNo, stillProposed: proposed.some((p) => regKey(p.registrationNo) === regKey(a.registrationNo)) })) : [],
  };
}
