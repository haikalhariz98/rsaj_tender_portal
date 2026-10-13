/**
 * Who the staff audit and History views may see acting on an online bid (ADR 0036 D9, ruling 20c; build plan §1.3, written verbatim). Pure.
 */

// src/lib/bids/online/audit-mask.ts (D9)
export declare function sealedAuditMask(i: { entity: string; viewer: "NAMED_OFFICER" | "OTHER"; unsealed: boolean; finalised: boolean }): { hideActor: boolean; hideSupplier: boolean };
