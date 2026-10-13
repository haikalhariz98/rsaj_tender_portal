/**
 * Who a non-last authorisation of the unseal forwards its shares to (ADR 0036 D10, M1, ruling 20k; build plan §1.3). Pure.
 *
 * Every named officer authorises (n-of-n). An officer who is not the last seals the shares they hold to each named officer still to act (`ShareRelease`); the last one
 * reconstructs the key. Finalising needs no release (H3 a).
 */

// src/lib/sealing/release.ts (D10): the unseal and supplementary openings only; finalising needs no release (H3 a)
export function releasePlan(i: { namedOfficerRowIds: string[]; authorisedRowIds: string[]; actorRowId: string }): { last: boolean; forwardTo: string[] } {
  const named = [...new Set(i.namedOfficerRowIds)];
  const done = new Set([...i.authorisedRowIds, i.actorRowId].filter((r) => named.includes(r)));
  const forwardTo = named.filter((r) => !done.has(r));
  return { last: named.length > 0 && forwardTo.length === 0, forwardTo };
}
