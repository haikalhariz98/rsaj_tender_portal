/**
 * Whether an officer may download a sealed file (ADR 0036 D10, rulings 20n, 20t; build plan §1.3, written verbatim). Pure.
 */

import type { GrantUse, OnlineBidStatus } from "@/lib/bids/online/types";

// src/lib/sealing/grants.ts (D10)
export declare function downloadFaults(i: { actorIsNamedOfficer: boolean; actorIsAdministrator: boolean; unsealed: boolean; finalised: boolean; use: GrantUse; bidStatus: OnlineBidStatus }): ("NOT_NAMED_OFFICER" | "ADMINISTRATOR" | "NOT_UNSEALED" | "FINALISED_USE_DOCUMENTS" | "NOT_OPENING_CHECK_PART" | "NOT_OPENED")[];
