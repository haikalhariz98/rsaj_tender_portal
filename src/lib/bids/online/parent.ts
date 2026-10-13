/**
 * The unseal's parent check (ADR 0036 D7, M2 with ruling 20h; build plan §1.3, written verbatim). Pure.
 */

// src/lib/bids/online/parent.ts (D7, M2 with 20h): the unseal's parent check
export declare function parentReachable(sealedParent: string | null, currentParent: string | null, replacedBy: (id: string) => string | null, withdrawnClearedLink: boolean): boolean;
