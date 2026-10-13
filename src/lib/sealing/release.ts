/**
 * Who a non-last authorisation of the unseal forwards its shares to (ADR 0036 D10; build plan §1.3, written verbatim). Pure.
 */

// src/lib/sealing/release.ts (D10): the unseal and supplementary openings only; finalising needs no release (H3 a)
export declare function releasePlan(i: { namedOfficerRowIds: string[]; authorisedRowIds: string[]; actorRowId: string }): { last: boolean; forwardTo: string[] };
