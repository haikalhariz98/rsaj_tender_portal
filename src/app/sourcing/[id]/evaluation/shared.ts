/**
 * What every evaluation write shares (plan §4): one transaction that locks the exercise's
 * requisition, the exercise and its window (`inWindow`), then its openings and its evaluations (the
 * order of `src/lib/evaluation/lock.ts`), and re-reads everything the rules judge under those locks
 * (`loadEvaluationContext`). The server's clock is read once, at the act's entry, before any lock,
 * truncated to the second (6.6 CR-3). The pure rule is re-run on the locked rows; the write and its
 * audit rows share the transaction; a refusal after a write is thrown, so the transaction rolls back.
 * People are recorded on their behalf, not signed. Codes go back, never figures.
 */

import { sulitWriteRefusal } from "@/lib/auth/sulit-store";
import type { StaffActor } from "@/lib/auth/types";
import type { FormState } from "@/components/record-editor";
import type { Tx } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { lockEvaluationRows } from "@/lib/evaluation/lock";
import { evaluationFindingText } from "@/lib/evaluation/labels";
import { loadEvaluationContext, type EvaluationContext } from "@/lib/evaluation/repo";
import { blocking, type Finding } from "@/lib/evaluation/types";
import { fieldsOfScope } from "@/lib/sulit-fields";
import { lockOpeningRows } from "@/lib/opening/lock";

import { inWindow, type LockedWindow } from "../window/shared";

export const stampNow = () => toSecond(new Date());

export const refuse = (fs: readonly Finding[], lead = "Nothing was saved:"): FormState => ({ ok: false, message: `${lead} ${[...new Set(blocking(fs).map(evaluationFindingText))].join(" ")}` });
export const notes = (fs: readonly Finding[]) => [...new Set(fs.filter((f) => f.level !== "block").map(evaluationFindingText))].join(" ");

export const NO_EVALUATION: FormState = { ok: false, message: "No evaluation is in progress on this exercise." };
export const GONE_BIDDER: FormState = { ok: false, message: "That bid is not in this evaluation." };

/// Run an evaluation write with every lock its order asks for, and the context read under them.
/// FR-EVL-014: a person the evaluation is closed to may not change it, and is told so (the rule Phase 3a made for an exercise's estimate). Asked first, under the
/// exercise's lock, and logged in the act's transaction, so a refusal is kept.
export async function inEvaluation(actor: StaffActor, exerciseId: string, fn: (tx: Tx, l: LockedWindow, c: EvaluationContext) => Promise<FormState>): Promise<FormState> {
  return inWindow(actor, exerciseId, async (tx, l) => {
    const refusal = await sulitWriteRefusal(tx, actor, { scope: "evaluation", exerciseId: l.ex.id }, fieldsOfScope("evaluation"));
    if (refusal) return { ok: false, message: `Nothing was saved: the evaluation is SULIT and is closed to you. ${refusal}` };
    await lockOpeningRows(tx, l.ex.id);
    await lockEvaluationRows(tx, l.ex.id);
    return fn(tx, l, await loadEvaluationContext(l, tx));
  });
}

/// The version in force's label for the trail: the exercise's reference first, so its History finds it.
export const evLabel = (l: LockedWindow, version: number, what?: string) => `${l.ex.reference} · Evaluation, version ${version}${what ? ` · ${what}` : ""}`;

/// The person picks a multi-select posted, newline-joined (the shared multi-select).
export function picks(data: FormData, name: string): string[] {
  return [...new Set(data.getAll(name).flatMap((v) => String(v).split(/\r?\n/).map((x) => x.trim()).filter(Boolean)))];
}

/// A signed amount, to two places (a balance may be overdrawn). Null: empty; "bad": not an amount.
export function signedMoney(data: FormData, name: string): string | null | "bad" {
  const v = String(data.get(name) ?? "").trim().replace(/,/g, "");
  if (!v) return null;
  return /^-?\d{1,16}(\.\d{1,2})?$/.test(v) ? v : "bad";
}
