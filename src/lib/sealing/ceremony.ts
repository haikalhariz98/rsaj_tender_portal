/**
 * The key ceremony: the key's state, re-keying, publication's sealing faults and the passphrase (ADR 0036 D3, D4, D11, rulings 20g, 20h; build plan §1.3, written
 * verbatim). Pure.
 */

import type { BidPartRule, SubmissionChannel } from "@/lib/bids/online/types";
import type { Finding } from "@/lib/window/types";

import type { onlineSubmissionAllowed } from "./switch";

// src/lib/sealing/ceremony.ts (D3, D11, 20g, 20h)
export type KeyState = "AWAITING_OFFICERS" | "LIVE";
export declare function keyState(i: { liveOfficerRowIds: string[]; officersWithKey: string[]; liveKey: { shareHolderRowIds: string[] } | null }): { state: KeyState; missing: string[]; stale: boolean };
export declare function rekeyFaults(i: { submissions: number; now: Date; closing: Date | null }): ("SUBMISSIONS_EXIST" | "AFTER_CLOSING" | "CLOSING_NOT_SET")[];
export declare function publishSealingFaults(i: { channel: SubmissionChannel | null; online: ReturnType<typeof onlineSubmissionAllowed>; key: ReturnType<typeof keyState>; rules: BidPartRule[] | null; alternativesPermitted: boolean | null; pepperRequired: boolean; pepperConfigured: boolean }): Finding[];
export declare function passphraseFaults(p: string, repeat: string, minLength: number | null, equalsSignInPassword: boolean): ("MIN_LENGTH_NOT_SET" | "TOO_SHORT" | "NOT_REPEATED" | "SAME_AS_SIGN_IN")[];
