/**
 * Loop-back (FR-CTE-009, E-8): a committee's decision NOT_CARRIED on an exercise's appointment, with a
 * LOOP outcome whose `returnsToStage` is one of the product's keys, opens a new evaluation version from
 * that point; the issued report is superseded, never edited. TERMINAL never reopens (cancellation is
 * the window-change route's, E-10). An unknown key opens nothing and is warned of on Configuration (a
 * free-text key from before this module is a legacy warning). Pure.
 */

import type { Finding } from "./types";

export const LOOP_STAGE_KEYS = ["evaluation.recall", "evaluation.clarification", "evaluation.negotiation"] as const;
export type LoopStageKey = (typeof LOOP_STAGE_KEYS)[number];

/// Where each key re-enters: the first stage (every stage re-submitted, scores carried and labelled), or the meetings.
export type LoopTarget = { reEntry: "FIRST_STAGE" } | { reEntry: "MEETINGS"; meeting: "CLARIFICATION" | "NEGOTIATION" };

export const LOOP_KEY_LABEL: Readonly<Record<LoopStageKey, string>> = {
  "evaluation.recall": "Back to evaluation, from its first stage",
  "evaluation.clarification": "Back to evaluation, for clarification",
  "evaluation.negotiation": "Back to evaluation, for negotiation",
};

export const isLoopKey = (k: string | null | undefined): k is LoopStageKey => (LOOP_STAGE_KEYS as readonly string[]).includes(k ?? "");

export function loopTarget(key: string | null | undefined): LoopTarget | null {
  if (!isLoopKey(key)) return null;
  if (key === "evaluation.recall") return { reEntry: "FIRST_STAGE" };
  return { reEntry: "MEETINGS", meeting: key === "evaluation.clarification" ? "CLARIFICATION" : "NEGOTIATION" };
}

export type LoopFault = "LOOP_TARGET_UNKNOWN" | "TERMINAL_NEVER_REOPENS";

/// Whether a decided outcome opens a new version: only a LOOP with a product key.
export function loopFault(o: { kind: "LOOP" | "TERMINAL" | null; key: string | null }): Finding<LoopFault> | null {
  if (o.kind !== "LOOP") return { code: "TERMINAL_NEVER_REOPENS", level: "info" };
  return isLoopKey(o.key) ? null : { code: "LOOP_TARGET_UNKNOWN", level: "warn" };
}

/// A configured outcome's key read for Configuration: a product key, none, or a legacy free text (warned).
export function loopKeyState(kind: "LOOP" | "TERMINAL", key: string | null): "KEY" | "NONE" | "LEGACY" {
  if (!key) return "NONE";
  return kind === "LOOP" && isLoopKey(key) ? "KEY" : "LEGACY";
}

/// E-7: which bidders of the version before are unchanged (the same opened bid), so their records carry.
export function carryPlan<P extends { id: string; openedBidId: string }>(previous: readonly P[], set: readonly { openedBidId: string }[]): { carried: { from: P; openedBidId: string }[]; fresh: string[] } {
  const carried: { from: P; openedBidId: string }[] = [];
  const fresh: string[] = [];
  for (const s of set) {
    const p = previous.find((x) => x.openedBidId === s.openedBidId);
    if (p) carried.push({ from: p, openedBidId: s.openedBidId });
    else fresh.push(s.openedBidId);
  }
  return { carried, fresh };
}

/**
 * 6.8 fix R-7: superseding a version withdraws its negotiation routes still with approval, as the
 * window's cancellation does: a negotiation asked for on a superseded version is never held on it, and
 * one wanted on the next version is asked for there. These are the routes to withdraw, and the note
 * each carries (the code the routes' status words read).
 */
export const pendingRoutes = <N extends { approvalInstance: { status: string } }>(negotiations: readonly N[]): N[] => negotiations.filter((n) => n.approvalInstance.status === "PENDING");
export const supersededRouteNote = (code: string, from: number, to: number) => ({ code, level: "info" as const, messageEn: `Withdrawn: evaluation version ${from} was superseded by version ${to}, so the negotiation is not held on it. Ask for it again on version ${to} if it is still wanted.` });
