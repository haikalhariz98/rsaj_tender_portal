import { caseVisibility } from "@/lib/contract/case-visibility";
import { resolveCase } from "@/lib/contract/case-load";
import { awardTabToCase } from "@/lib/contract/case-tabs";
import { caseHref } from "@/lib/contract/links";
import type { StaffActor } from "@/lib/auth/types";

import { exerciseIsHidden } from "./sulit";

/**
 * Where an id on the case address leads, for the reader (Award and Contract Requirements v2, C-1, C-6; ADR 0037 F0-3, F0-7).
 * `resolveCase` reads the database; `exerciseIsHidden` decides whether the exercise is a restricted one the reader may not see,
 * and writes the refusal to the access log, as the award page does today; `caseVisibility` (the pure rule, AC-18) turns the two
 * facts into one answer.
 *
 * - A contract id: CONTRACT, visible whole, or with its contract stages only when the exercise is restricted to others.
 * - An award id with no contract: AWARD_ONLY, or NOT_FOUND when the exercise is hidden from the reader.
 * - An award id whose contract exists: REDIRECT to the contract when the case is whole to the reader; otherwise NOT_FOUND, logged,
 *   never redirected (F0-3: today's award page refuses before and after issue).
 * - Anything else, or another organisation's id: NOT_FOUND.
 */
export type LoadedCase =
  | { kind: "CONTRACT"; contractId: string; awardId: string; visibility: "WHOLE" | "CONTRACT_STAGES_ONLY" }
  | { kind: "AWARD_ONLY"; awardId: string; visibility: "WHOLE" }
  | { kind: "REDIRECT"; contractId: string }
  | { kind: "NOT_FOUND" };

export async function loadCase(actor: StaffActor, id: string): Promise<LoadedCase> {
  const r = await resolveCase(actor.organisationId, id);
  if (r.kind === "NOT_FOUND") return { kind: "NOT_FOUND" };
  // True: the exercise is restricted and the actor is not named on it (an administrator is never let in by being named). Logged.
  const restrictedFromReader = await exerciseIsHidden(actor, r.exerciseId);
  const visibility = caseVisibility({ restricted: restrictedFromReader, actorNamed: false, system: false, issued: r.kind !== "AWARD_ONLY" });
  if (visibility === "HIDDEN") return { kind: "NOT_FOUND" };
  switch (r.kind) {
    case "CONTRACT":
      return { kind: "CONTRACT", contractId: r.contractId, awardId: r.awardId, visibility };
    case "AWARD_ONLY":
      // HIDDEN has been answered above, so this is WHOLE.
      return { kind: "AWARD_ONLY", awardId: r.awardId, visibility: "WHOLE" };
    case "AWARD_WITH_CONTRACT":
      return visibility === "WHOLE" ? { kind: "REDIRECT", contractId: r.contractId } : { kind: "NOT_FOUND" };
  }
}

/**
 * Where an old `/awards/{id}` address leads (Award and Contract Requirements v2, C-6; AC-23). The same guard as `loadCase`, stricter:
 * today's award page returned 404 to a reader not named on a restricted exercise before issue and after it, so the redirect is made
 * only when the case is WHOLE to the reader. A CONTRACT_STAGES_ONLY reader is never forwarded to the contract from an award link, and
 * a hidden case is never forwarded to its exercise either (the refusal is logged by `exerciseIsHidden`, before the tab is read).
 * A contract id is not an award's address, as `loadAward` never found one: NOT_FOUND.
 *
 * `tab` is the old `?tab=`, mapped by `awardTabToCase`: "notices" goes to the exercise's Award tab (AC-22); none or unknown opens
 * the case's default step.
 */
export type OldAwardTarget = { kind: "NOT_FOUND" } | { kind: "REDIRECT"; href: string };

export async function oldAwardTarget(actor: StaffActor, awardId: string, tab: string | undefined): Promise<OldAwardTarget> {
  const r = await resolveCase(actor.organisationId, awardId);
  if (r.kind !== "AWARD_ONLY" && r.kind !== "AWARD_WITH_CONTRACT") return { kind: "NOT_FOUND" };
  const restrictedFromReader = await exerciseIsHidden(actor, r.exerciseId);
  const visibility = caseVisibility({ restricted: restrictedFromReader, actorNamed: false, system: false, issued: r.kind === "AWARD_WITH_CONTRACT" });
  if (visibility !== "WHOLE") return { kind: "NOT_FOUND" };
  const at = awardTabToCase(tab);
  if ("exercise" in at) return { kind: "REDIRECT", href: `/sourcing/${r.exerciseId}?tab=award` };
  return { kind: "REDIRECT", href: caseHref({ awardId: r.awardId, contractId: r.kind === "AWARD_WITH_CONTRACT" ? r.contractId : null }, at) };
}
