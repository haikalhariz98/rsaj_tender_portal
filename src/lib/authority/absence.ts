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

/// Whether anyone can act in an office: a holder or a delegate who is active and available.
export function someoneCanAct(
  h: { holderIds: readonly string[]; delegates: readonly { personId: string }[] },
  available: (personId: string) => boolean,
): boolean {
  return h.holderIds.some(available) || h.delegates.some((d) => available(d.personId));
}
