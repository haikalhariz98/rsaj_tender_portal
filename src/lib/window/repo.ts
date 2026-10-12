/**
 * The invitation window and its configuration, loaded and mapped to the facts the pure rules
 * read. Reads only; every rule is beside this file. The actions read through these inside their
 * transaction, after locking requisition → exercise → window (`lock.ts`), so the rule they re-run
 * and the write it guards see the same rows; the screens read through the same mappings, so a
 * disabled action and a refused one give the same reason.
 */

import type { Tx } from "@/lib/audit/record";
import { dayIn, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseSen } from "@/lib/money";
import type { Provenance } from "@/lib/reference/types";
import { nameRoutesOf } from "@/lib/method/approval";
import { loadRequirements, loadTenderPolicy } from "@/lib/tender-docs/repo";

import { feeBasisTotal } from "./fee";
import { windowGate, type WindowGate } from "./gate";
import type { TemplateFacts } from "./fields";
import type { CalendarFacts, ChannelFacts, EventFacts, FeeFloorFacts, WindowPolicyFacts } from "./types";
import { UNSET_WINDOW_POLICY } from "./types";

/// The organisation's window rules. No row: every rule not set (shipped empty).
export async function loadWindowPolicy(organisationId: string, client: Tx = db): Promise<WindowPolicyFacts> {
  const p = await client.windowPolicy.findUnique({ where: { organisationId } });
  if (!p) return UNSET_WINDOW_POLICY;
  return {
    minAdvertisementDays: p.minAdvertisementDays,
    targetAdvertisementDays: p.targetAdvertisementDays,
    newspaperWarnDays: p.newspaperWarnDays,
    purchaseCutoffDays: p.purchaseCutoffDays,
    dateRulesProvenance: (p.dateRulesProvenance as Provenance | null) ?? null,
    defaultClosingTime: p.defaultClosingTime,
    closingTimeProvenance: (p.closingTimeProvenance as Provenance | null) ?? null,
    advertisementDayRule: p.advertisementDayRule,
    advertisementChannelId: p.advertisementChannelId,
    dayRuleProvenance: (p.dayRuleProvenance as Provenance | null) ?? null,
    calendarId: p.calendarId,
    mandatoryAttendancePermitted: p.mandatoryAttendancePermitted,
    attendanceProvenance: (p.attendanceProvenance as Provenance | null) ?? null,
    noticeTemplateId: p.noticeTemplateId,
    invitationTemplateId: p.invitationTemplateId,
    addendumTemplateId: p.addendumTemplateId,
    dateRuleSource: p.dateRuleSource,
  };
}

/// A calendar with its years and holidays, as the date rules read it. Null where none is named or it is gone.
export async function loadCalendar(calendarId: string | null, client: Tx = db): Promise<CalendarFacts | null> {
  if (!calendarId) return null;
  const c = await client.holidayCalendar.findUnique({ where: { id: calendarId }, include: { years: { orderBy: { year: "asc" } }, holidays: { orderBy: { day: "asc" } } } });
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    weekendDays: c.weekendDays,
    weekendProvenance: c.weekendProvenance as Provenance | null,
    provenance: c.provenance as Provenance | null,
    years: c.years.map((y) => ({ year: y.year, complete: y.complete })),
    holidays: c.holidays.map((h) => ({ day: storedDay(h.day), nameEn: h.nameEn })),
  };
}

export async function loadChannels(organisationId: string, client: Tx = db): Promise<(ChannelFacts & { code: string; provenance: Provenance; governingSource: string; sortOrder: number })[]> {
  const rows = await client.publicationChannel.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] });
  return rows.map((c) => ({ id: c.id, code: c.code, nameEn: c.nameEn, requiredWhenAdvertised: c.requiredWhenAdvertised, retiredOn: c.retiredOn ? storedDay(c.retiredOn) : null, provenance: c.provenance as Provenance, governingSource: c.governingSource, sortOrder: c.sortOrder }));
}

export async function loadFloors(organisationId: string, client: Tx = db): Promise<(FeeFloorFacts & { id: string; provenance: Provenance; governingSource: string })[]> {
  const rows = await client.documentFeeFloor.findMany({ where: { organisationId }, orderBy: { regime: "asc" } });
  return rows.map((f) => ({ id: f.id, regime: f.regime, minimum: parseSen(f.minimum.toString()), provenance: f.provenance as Provenance, governingSource: f.governingSource }));
}

export async function loadTemplate(templateId: string | null, client: Tx = db): Promise<TemplateFacts | null> {
  if (!templateId) return null;
  const t = await client.documentTemplate.findUnique({ where: { id: templateId }, select: { id: true, code: true, nameEn: true, bodyEn: true, bodyMs: true, primaryLanguage: true, bodyVersion: true } });
  return t ? { ...t, primaryLanguage: t.primaryLanguage as "MS" | "EN" | null } : null;
}

const WINDOW_INCLUDE = {
  feeLines: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
  publications: { include: { recordedBy: { select: { id: true, name: true } } }, orderBy: [{ publishedOn: "asc" as const }, { id: "asc" as const }] },
  letters: { include: { party: true }, orderBy: [{ frozenAt: "asc" as const }, { id: "asc" as const }] },
  sales: { include: { party: true, issuedBy: { select: { id: true, name: true } } }, orderBy: [{ soldOn: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }] },
  events: {
    include: { attendance: { include: { party: true, recordedBy: { select: { id: true, name: true } } }, orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }] } },
    orderBy: [{ startsAt: "asc" as const }, { id: "asc" as const }],
  },
  addenda: {
    include: {
      recipients: { include: { party: true }, orderBy: { id: "asc" as const } },
      closingChange: { select: { id: true, kind: true, toClosingAt: true } },
      attachments: { where: { purpose: "ADDENDUM_SIGNED" as const }, select: { id: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
    },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  closingChanges: { include: { notices: { include: { party: true }, orderBy: { id: "asc" as const } }, approvalInstance: { select: { id: true, status: true } } }, orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  cancellations: { include: { notices: { include: { party: true }, orderBy: { id: "asc" as const } }, approvalInstance: { select: { id: true, status: true } } }, orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
};

/// The exercise's window with everything under it. Null where none was written yet.
export async function loadWindow(exerciseId: string, client: Tx = db) {
  return client.exerciseWindow.findUnique({ where: { exerciseId }, include: WINDOW_INCLUDE });
}

export type WindowRow = NonNullable<Awaited<ReturnType<typeof loadWindow>>>;

/// The exercise's parties, in the order they came.
export async function loadParties(exerciseId: string, client: Tx = db) {
  return client.exerciseParty.findMany({ where: { exerciseId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

export type PartyRow = Awaited<ReturnType<typeof loadParties>>[number];

/// The approved pack's frozen dates (X-2): the closing's first history entry.
export async function approvedPackDates(exerciseId: string, client: Tx = db) {
  return client.tenderPack.findFirst({ where: { exerciseId, status: "APPROVED" }, orderBy: { versionNo: "desc" }, select: { approvedStartOn: true, approvedClosingAt: true, approvedAt: true } });
}

/// A window's events as the rules read them.
export function eventFactsOf(w: Pick<WindowRow, "events">): EventFacts[] {
  return w.events.map((e) => ({
    id: e.id,
    kind: e.kind,
    startsAt: e.startsAt,
    place: e.place,
    mandatory: e.mandatory,
    heldOn: e.heldOn ? storedDay(e.heldOn) : null,
    cancelled: e.cancelledAt != null,
    attendeePartyIds: e.attendance.map((a) => a.partyId),
  }));
}

/// The basis's total, from the stored lines.
export const basisTotalOf = (w: Pick<WindowRow, "feeLines">) => feeBasisTotal(w.feeLines.map((l) => ({ amount: parseSen(l.amount.toString()) })));

/// The stored day, as YYYY-MM-DD, or null.
export const dayOrNull = (d: Date | null | undefined) => (d ? storedDay(d) : null);

/// The closing day in the organisation's zone, or null.
export const closingDayOf = (closingAt: Date | null, timeZone: string | null) => (closingAt && timeZone ? dayIn(closingAt, timeZone) : null);

/// What the window's instruments need from 6.4: the registrations as entered, and the restriction's stamp.
export async function tenderFacts(organisationId: string, exerciseId: string, client: Tx = db) {
  const requirements = await loadRequirements(exerciseId, client);
  const policy = await loadTenderPolicy(organisationId, client);
  return { requirements, stamp: { EN: policy.restrictionStampTextEn, MS: policy.restrictionStampTextMs }, restrictionLabel: policy.restrictionLabelEn };
}

/// Whether a window_change route is pending on the exercise (one change at a time).
export const changePendingOf = (routes: readonly { status: string }[]) => routes.some((r) => r.status === "PENDING");

/// What the window's rules read of the exercise (a row from the method module's loader).
export interface ExerciseForWindow {
  id: string;
  organisationId: string;
  reference: string;
  title: string;
  status: import("@/lib/method/types").ExerciseStatus;
  packKindSnapshot: import("@/lib/method/types").PackKind | null;
  restrictedTender: boolean | null;
  closingAt: Date | null;
  tenderingStartOn: Date | null;
  regime: string | null;
  sourcingMethodCode: string;
  /// Pinned when the exercise was made: it was submitted under the notice gate (SR-06) and the opening roster (SR-07). Absent: not.
  openingRosterRequired?: boolean;
  estimatedValue: { toString(): string };
  approvalInstances: readonly { id: string; domain: string; awardId: string | null; status: string; openedAt: Date; createdAt: Date; cond: string | null }[];
  /// 6.8 (E-2): the evaluation model chosen, its pinned snapshot, and the contract basis its route is read from. Absent: none.
  evaluationModelId?: string | null;
  evaluationModelPinnedAt?: Date | null;
  contractBasisCode?: string | null;
}

/**
 * Everything the window's rules read for one exercise, on locked rows inside an action or
 * unlocked for a screen: the policy and what it names, the window and its registers, the parties,
 * 6.4's registrations and stamp, the approved pack's dates, the method's flags, the name routes
 * with the lists they froze, and the instruments' templates.
 */
export async function windowData(organisationId: string, ex: ExerciseForWindow, client: Tx = db) {
  const policy = await loadWindowPolicy(organisationId, client);
  // One query at a time: inside an action this is the transaction's one connection.
  const calendar = await loadCalendar(policy.calendarId, client);
  const channels = await loadChannels(organisationId, client);
  const floors = await loadFloors(organisationId, client);
  const window = await loadWindow(ex.id, client);
  const parties = await loadParties(ex.id, client);
  const tender = await tenderFacts(organisationId, ex.id, client);
  const approved = await approvedPackDates(ex.id, client);
  const method = ex.sourcingMethodCode ? await client.sourcingMethod.findFirst({ where: { organisationId, code: ex.sourcingMethodCode }, select: { nameEn: true, requiresAdvertisement: true, invitesNamedSuppliers: true, requiresNameApproval: true } }) : null;
  const org = await client.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true } });
  const notice = await loadTemplate(policy.noticeTemplateId, client);
  const invitation = await loadTemplate(policy.invitationTemplateId, client);
  const addendum = await loadTemplate(policy.addendumTemplateId, client);
  const nameRouteIds = nameRoutesOf(ex.approvalInstances).map((r) => r.id);
  const invitees = nameRouteIds.length ? await client.nameRouteInvitee.findMany({ where: { approvalInstanceId: { in: nameRouteIds } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }) : [];
  // 6.8 (E-2): the evaluation model chosen and the basis's route, read to pin at publication (never to evaluate: FR-EVL-007).
  const evaluationModel = ex.evaluationModelId ? await client.evaluationModel.findFirst({ where: { id: ex.evaluationModelId, organisationId }, select: { id: true, code: true, version: true, nameEn: true, status: true, route: true, contentSnapshot: true } }) : null;
  const basis = ex.contractBasisCode ? await client.contractBasis.findFirst({ where: { organisationId, code: ex.contractBasisCode }, select: { nameEn: true, evaluationRoute: true } }) : null;
  const models = await client.evaluationModel.findMany({ where: { organisationId, status: "ISSUED" }, orderBy: [{ nameEn: "asc" }, { version: "desc" }], select: { id: true, code: true, version: true, nameEn: true, route: true } });
  const suggested = ex.sourcingMethodCode ? ((await client.sourcingMethod.findFirst({ where: { organisationId, code: ex.sourcingMethodCode }, select: { defaultEvaluationModelCode: true } }))?.defaultEvaluationModelCode ?? null) : null;
  return { policy, calendar, channels, floors, window, parties, tender, approved, method, organisationName: org.name, templates: { notice, invitation, addendum }, invitees, evaluation: { model: evaluationModel, basis, models, suggested } };
}

export type WindowData = Awaited<ReturnType<typeof windowData>>;

/**
 * The award gate's facts for one exercise, read now (X-9): for a screen, or inside an action on
 * the exercise it has locked (every window write locks the exercise first, so the days read are
 * the locked ones).
 */
export async function readWindowGate(
  ex: { id: string; status: import("@/lib/method/types").ExerciseStatus; closingAt: Date | null; approvalInstances: readonly { domain: string; awardId?: string | null; status: string }[] },
  timeZone: string | null,
  client: Tx = db,
): Promise<WindowGate> {
  const w = await client.exerciseWindow.findUnique({ where: { exerciseId: ex.id }, select: { purchaseFromDay: true, purchaseCloseDay: true } });
  return windowGate(ex, w, new Date(), timeZone);
}
