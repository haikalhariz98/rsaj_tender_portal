/**
 * The envelope register and what it is judged with, loaded and mapped to the facts the pure rules
 * read. Reads only; every rule is beside this file. The actions read through these inside their
 * transaction, after locking requisition → exercise → window → envelopes (`lock.ts`); the screens
 * and the 6.10/6.11 hooks read through the same mappings, so a disabled action and a refused one
 * give the same reason.
 */

import type { Tx } from "@/lib/audit/record";
import { closingDayOf } from "@/lib/window/repo";
import { dayIn, storedDay, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import type { Provenance } from "@/lib/reference/types";
import { isLive } from "@/lib/documents/evidence";

import type { BoxEventFacts } from "./box";
import { lateAdmissionFault, type LateMatter } from "./late";
import { bidRuleFor, type BidMethodRule, type BidRuleReading } from "./rule-snapshot";
import { awardValidityFault, validityState, VALIDITY_ALERT_EVENT, type ValidityState } from "./validity";
import type { EnvelopeFacts, ExerciseForBids, ExerciseStatus } from "./types";

const ENVELOPE_INCLUDE = {
  receivedBy: { select: { id: true, name: true } },
  withdrawal: { select: { id: true, receivedAt: true } },
} as const;

export type { BidMethodRule } from "./rule-snapshot";

/**
 * The method's three rules as they stand today. Only publication (to freeze them) and an
 * unpublished exercise read this; a published one reads `loadBidRule` (CR-2).
 */
export async function loadBidMethodRule(organisationId: string, methodCode: string | null, client: Tx = db): Promise<BidMethodRule | null> {
  if (!methodCode) return null;
  const m = await client.sourcingMethod.findFirst({
    where: { organisationId, code: methodCode },
    select: { nameEn: true, lateAdmissionCommitteeCode: true, lateAdmissionProvenance: true, minimumBids: true, minimumBidsProvenance: true, completenessEliminates: true, completenessProvenance: true },
  });
  return m ? { ...m, lateAdmissionProvenance: m.lateAdmissionProvenance as Provenance | null, minimumBidsProvenance: m.minimumBidsProvenance as Provenance | null, completenessProvenance: m.completenessProvenance as Provenance | null } : null;
}

/**
 * The rules THIS exercise is judged by: today's method before publication, the window's frozen
 * `bidRules` after it (never today's method; one not recorded reads as not set). Every reader on
 * the bids tab, its actions and the 6.10/6.11 hooks goes through this (CR-2).
 */
export async function loadBidRule(window: { publishedAt: Date | null; policySnapshot: unknown } | null, organisationId: string, methodCode: string | null, client: Tx = db): Promise<BidRuleReading> {
  return bidRuleFor(window, await loadBidMethodRule(organisationId, methodCode, client));
}

/// Every LATE_TENDER matter naming one of the exercise's envelopes, as `late.ts` reads them.
export async function loadLateMatters(exerciseId: string, client: Tx = db): Promise<LateMatter[]> {
  const rows = await client.committeeDecision.findMany({
    where: { matterKind: "LATE_TENDER", bidEnvelope: { exerciseId } },
    orderBy: [{ tabledAt: "asc" }, { id: "asc" }],
    select: { id: true, bidEnvelopeId: true, withdrawnAt: true, tabledAt: true, outcome: true, decisionDate: true, meeting: { select: { reference: true, status: true, committee: { select: { nameEn: true } } } } },
  });
  return rows.map((d) => ({
    id: d.id,
    bidEnvelopeId: d.bidEnvelopeId,
    withdrawn: d.withdrawnAt != null,
    sittingCancelled: d.meeting.status === "CANCELLED",
    tabledAt: d.tabledAt,
    outcome: d.outcome === "PENDING" ? null : d.outcome,
    decisionDate: d.decisionDate,
    sittingReference: d.meeting.reference,
    committeeName: d.meeting.committee.nameEn,
  }));
}

/// The exercise's envelopes in receipt order.
export async function loadEnvelopes(exerciseId: string, client: Tx = db) {
  return client.bidEnvelope.findMany({ where: { exerciseId }, orderBy: { sequence: "asc" }, include: ENVELOPE_INCLUDE });
}
export type EnvelopeRow = Awaited<ReturnType<typeof loadEnvelopes>>[number];

export const envelopeFactsOf = (e: EnvelopeRow | Omit<EnvelopeRow, "receivedBy" | "withdrawal">): EnvelopeFacts => ({
  id: e.id,
  sequence: e.sequence,
  kind: e.kind,
  channel: e.channel,
  receivedAt: e.receivedAt,
  receivedSource: e.receivedSource,
  statedReceivedAt: e.statedReceivedAt,
  late: e.late,
  closingAtJudged: e.closingAtJudged,
  recordedAfterClosing: e.recordedAfterClosing,
  status: e.status,
  parentEnvelopeId: e.parentEnvelopeId,
  returnedUnopenedOn: e.returnedUnopenedOn,
});

/// The box's custody acts, oldest first.
export async function loadBoxEvents(exerciseId: string, client: Tx = db): Promise<(BoxEventFacts & { id: string; note: string; recordedAt: Date })[]> {
  const rows = await client.boxEvent.findMany({ where: { exerciseId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], include: { person: { select: { name: true } } } });
  return rows.map((b) => ({ id: b.id, kind: b.kind, occurredAt: b.occurredAt, recordedAt: b.recordedAt, personName: b.person.name, note: b.note }));
}

export async function loadWithdrawals(exerciseId: string, client: Tx = db) {
  return client.bidWithdrawal.findMany({
    where: { exerciseId },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    include: {
      receivedBy: { select: { name: true } },
      envelope: { select: { id: true, sequence: true, status: true, returnedUnopenedOn: true, channel: true } },
      attachments: { where: { purpose: "WITHDRAWAL_LETTER" }, select: { id: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
    },
  });
}

export async function loadExtensions(exerciseId: string, client: Tx = db) {
  return client.validityExtension.findMany({
    where: { exerciseId },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    include: {
      consentParty: { select: { id: true, name: true } },
      recordedBy: { select: { name: true } },
      attachments: { where: { purpose: "VALIDITY_CONSENT" }, select: { id: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
    },
  });
}
export type ExtensionRow = Awaited<ReturnType<typeof loadExtensions>>[number];

/// Live consents on an extension.
export const liveConsents = (x: Pick<ExtensionRow, "attachments">) => x.attachments.filter(isLive).length;

/// The alert rule's offsets (days before expiry), where the organisation has an active one; empty otherwise.
export async function loadValidityOffsets(organisationId: string, client: Tx = db): Promise<{ offsets: number[]; ruleSet: boolean }> {
  const r = await client.notificationRule.findFirst({ where: { organisationId, eventKey: VALIDITY_ALERT_EVENT, isActive: true }, select: { reminderOffsetDays: true } });
  return { offsets: r?.reminderOffsetDays ?? [], ruleSet: r != null };
}

/// The window's bid answers and its publication.
export async function loadBidWindow(exerciseId: string, client: Tx = db) {
  return client.exerciseWindow.findUnique({ where: { exerciseId }, select: { id: true, publishedAt: true, policySnapshot: true, bidValidityDays: true, bidValidityProvenance: true, alternativesPermitted: true } });
}

/// The exercise as the register's rules read it.
export function exerciseForBids(ex: { status: ExerciseStatus; closingAt: Date | null }, window: { publishedAt: Date | null } | null, timeZone: string | null, events: readonly BoxEventFacts[]): ExerciseForBids {
  return { status: ex.status, closing: ex.closingAt, publishedAt: window?.publishedAt ?? null, timeZone, openingStarted: events.some((e) => e.kind === "UNLOCKED_FOR_OPENING") };
}

/// The validity state now, from the window, the closing, the applied extensions and the alert rule.
export function validityOf(i: { closing: Date | null; timeZone: string | null; days: number | null; extensions: readonly { toExpiry: Date; appliedAt: Date | null }[]; offsets: readonly number[]; now: Date }): ValidityState {
  // A closing with no zone has no day to count from: said as the zone not set, never as no closing.
  if (i.days != null && i.closing && !i.timeZone) return { state: "TIME_ZONE_UNSET", baseExpiry: null, expiry: null, daysLeft: null, alertOffset: null, extended: false };
  return validityState({
    closingDay: closingDayOf(i.closing, i.timeZone),
    days: i.days,
    extensions: i.extensions.filter((x) => x.appliedAt != null).map((x) => ({ toExpiry: storedDay(x.toExpiry), appliedAt: x.appliedAt! })),
    today: todayIn(i.now, i.timeZone),
    offsets: i.offsets,
  });
}

/**
 * What 6.10's tabling, 6.11's citation and the award gate read of the register (flagged hooks): the
 * late-admission gate and the validity check, only for an exercise published through 6.5 (6.6
 * conditions, X-9). Read inside the caller's transaction when there is one; the caller has locked
 * the exercise, so the envelopes read are the locked ones.
 */
export async function bidGate(exerciseId: string, client: Tx = db, now = new Date()) {
  const window = await loadBidWindow(exerciseId, client);
  const published = window?.publishedAt != null;
  if (!published) return { published: false as const, lateFault: null, validityFault: null };
  const ex = await client.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { organisationId: true, sourcingMethodCode: true, closingAt: true, organisation: { select: { timeZone: true } } } });
  const envelopes = await client.bidEnvelope.findMany({ where: { exerciseId }, select: { id: true, kind: true, late: true, status: true } });
  const matters = await loadLateMatters(exerciseId, client);
  const { rule, committee } = await loadBidRule(window, ex.organisationId, ex.sourcingMethodCode, client);
  const extensions = await client.validityExtension.findMany({ where: { exerciseId }, select: { toExpiry: true, appliedAt: true } });
  const { offsets } = await loadValidityOffsets(ex.organisationId, client);
  const validity = validityOf({ closing: ex.closingAt, timeZone: ex.organisation.timeZone, days: window!.bidValidityDays, extensions, offsets, now });
  return {
    published: true as const,
    lateFault: lateAdmissionFault(envelopes, matters, !!rule?.lateAdmissionCommitteeCode, committee),
    validityFault: awardValidityFault(true, validity),
  };
}

/// The day an instant falls on for the organisation, or null with no zone.
export const orgDay = (at: Date | null, timeZone: string | null) => (at && timeZone ? dayIn(at, timeZone) : null);
