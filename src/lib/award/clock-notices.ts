/**
 * The staff notices of an award's two clocks (FR-AWD-006 indent expiry, FR-AWD-009 late commencement; design note 0004 C13, AC-42). Written when the case is read, once per recipient and
 * expiry or due day: the notice's key (recipient, kind, award, day) makes a second reading write nothing. The drafts and the plan are pure (`inbox/notices.ts`, `inbox/clock-plan.ts`).
 *
 * Recipients (AC-42): the holders, and acting holders, on the organisation's day, of the offices the organisation's notification rule for the event names (looked up for the requesting
 * unit, nearest holder first, as the approval worklist does); and the requisition's requester. No rule, a rule that is off, or an office nobody holds tells no office: nothing is guessed.
 */

import { deciderIdsOfStep } from "@/lib/approvals/recall-store";
import { db, type Tx } from "@/lib/db";
import { CLOCK_EVENT_KEY, clockPlan, type ClockKind, type ClockPlan } from "@/lib/inbox/clock-plan";
import { caseClockNotices } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";

/// Who the clock's notice is to be told to today, from the organisation's notification rule for the event. `today` is the organisation's day, or null where its time zone is not set.
export async function loadClockPlan(i: { organisationId: string; organisationCode: string; requestingUnitCode: string; requesterId: string | null; today: string | null; kind: ClockKind }): Promise<ClockPlan> {
  return loadEventPlan(db, { ...i, eventKey: CLOCK_EVENT_KEY[i.kind], namedPartyId: i.requesterId });
}

/**
 * Who an event's notice is told to (AC-42; ADR 0045 D4, WV-8): the holders and acting holders, on the organisation's day, of the offices the organisation's notification rule for
 * `eventKey` names, looked up for the requesting unit; and the one party the caller names, while active: the requisition's requester for the clocks, the exercise's person in
 * charge for an award return lodged online and a contractor's question. No rule, a rule that is off, or an office nobody holds tells no office: nothing is guessed. No rule and
 * no named party: nobody is told. Read on the caller's client, so an act reads it in its own transaction.
 */
export async function loadEventPlan(client: Tx, i: { organisationId: string; organisationCode: string; requestingUnitCode: string; namedPartyId: string | null; today: string | null; eventKey: string }): Promise<ClockPlan> {
  // A rule that is off is read as well as one that is on: off is the organisation's decision, absent is an oversight.
  const rule = await client.notificationRule.findFirst({ where: { organisationId: i.organisationId, eventKey: i.eventKey }, select: { nameEn: true, isActive: true, recipientRoleCodes: true } });
  const holders = new Map<string, string[]>();
  if (rule?.isActive && i.today) {
    for (const code of new Set(rule.recipientRoleCodes)) {
      holders.set(code, await deciderIdsOfStep(client, { organisationCode: i.organisationCode, organisationId: i.organisationId }, { unitCode: i.requestingUnitCode, today: i.today, roleCode: code, actingRoleCode: null }));
    }
  }
  // An offboarded party cannot sign in, so is not told (the office holders are already only the active).
  const namedActive = i.namedPartyId ? ((await client.person.findFirst({ where: { id: i.namedPartyId, organisationId: i.organisationId }, select: { isActive: true } }))?.isActive ?? false) : true;
  return clockPlan({ requesterId: i.namedPartyId, requesterActive: namedActive, rule, holdersOf: (code) => holders.get(code) ?? [], dayKnown: i.today != null });
}

export interface CaseClockInput {
  organisationId: string;
  awardId: string;
  awardLabel: string;
  exerciseId: string;
  href: string;
  /// The clocks that are running late today, each with its day and who is to be told (`loadClockPlan`).
  clocks: readonly { kind: ClockKind; day: string; dayWords: string; recipientIds: readonly string[] }[];
}

/// Returns how many notices were newly written.
export async function raiseCaseClockNotices(i: CaseClockInput): Promise<number> {
  if (i.clocks.length === 0) return 0;
  return db.$transaction(async (tx) => {
    let written = 0;
    for (const c of i.clocks) {
      written += await writeNotices(tx, i.organisationId, null, caseClockNotices({ kind: c.kind, awardId: i.awardId, awardLabel: i.awardLabel, day: c.day, dayWords: c.dayWords, exerciseId: i.exerciseId, href: i.href, recipients: c.recipientIds }));
    }
    return written;
  });
}
