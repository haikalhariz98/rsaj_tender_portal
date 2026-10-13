/**
 * Substituting a named officer on an online exercise (ADR 0036 D11, ruling 11; build plan §1.3, written verbatim). Pure.
 */

import type { RosterChange } from "@/lib/opening/roster";

// src/lib/sealing/substitution.ts (D11)
export declare function substitutionFaults(i: { change: RosterChange; incomingHasKey: boolean; departingIsActor: boolean; keyLive: boolean }): ("NOT_CONTROLLED" | "INCOMING_KEY_NOT_SET" | "DEPARTING_MUST_RELEASE" | "AFTER_CLOSING_RETENDER")[];
