import { parseSen } from "@/lib/money";

/**
 * Which offices have nobody able to act (FR-APR-010, FR-APR-012; 6.11 BD-2).
 *
 * An office is absent when every holder for the unit is away or has left and nobody
 * holds a delegation of it who can act. Authority then reverts upward — the engine
 * does it at routing, and the route records it. A vacant office (no holder at all) is
 * not absent: the route names it, and a pending step there moves by escalation.
 *
 * Pure. Lifted from the award's appointment route so a requisition applies it too.
 */
export function absentOffices(
  codes: readonly string[],
  holdersOf: (code: string) => { holderIds: readonly string[]; delegates: readonly { personId: string }[] },
  available: (personId: string) => boolean,
): string[] {
  return codes.filter((c) => {
    const h = holdersOf(c);
    if (h.holderIds.length === 0) return false; // vacant is not absent: the route says who, and deciding waits for a holder
    return !h.holderIds.some(available) && !h.delegates.some((d) => available(d.personId));
  });
}

/**
 * The delegates of an office who could decide a step, which is fewer than the delegates of the office: a step that only the holder may decide (`nonDelegable`) has none, and a
 * delegation capped below the route's value cannot decide it either (the very checks `deciderFaults` makes, DELEGATION_NOT_PERMITTED and OVER_CEILING). A null ceiling limits
 * nothing; an unknown value (`null`) is judged against no ceiling. Lives here so that "able to act" is read once, by `someoneCanAct`, and My steps (`approvals/queue.ts`) re-exports it.
 */
export function decidingDelegates<T extends { personId: string; delegation: { valueCeiling: string | null } }>(
  delegates: readonly T[],
  step: { nonDelegable?: boolean },
  value: bigint | null | undefined,
): T[] {
  if (step.nonDelegable) return [];
  return delegates.filter((d) => d.delegation.valueCeiling == null || value == null || value <= parseSen(d.delegation.valueCeiling));
}

/**
 * Whether anyone can act on THIS STEP of its office: a holder who is active and available, or a delegate who is, whom the decision rule would not refuse (product owner, 2026-10-08,
 * ruling on log line 1790). The worklist's "nobody able to act", My steps and the sweep that follows an absence share this one reading: a step shown as decidable when nobody can decide it
 * is a gap shown as finished. A delegate counts only where the step may be delegated and the delegation's ceiling reaches the route's value (`decidingDelegates`), exactly as
 * `deciderFaults` refuses by.
 */
export function someoneCanAct(
  h: { holderIds: readonly string[]; delegates: readonly { personId: string; delegation: { valueCeiling: string | null } }[] },
  available: (personId: string) => boolean,
  step: { nonDelegable?: boolean },
  value: bigint | null | undefined,
): boolean {
  return h.holderIds.some(available) || decidingDelegates(h.delegates, step, value).some((d) => available(d.personId));
}
