import { BREAKDOWN_WORDS, EXERCISE_PHASE_WORDS, EXERCISE_STATUS_WORDS } from "@/lib/i18n/catalogues/dashboard";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";

import { EXERCISE_STATUS_ORDER } from "./labels";
import type { ExerciseStatus } from "./types";

/// The three phases an open sourcing exercise is in, for a summary that fits a dashboard card
/// (founder, 2026-10-04: the full status list was too long there). The statuses stay the record;
/// the phase is only a grouping of them, and the full breakdown stays one hover away.
export type ExercisePhase = "PREPARING" | "IN_MARKET" | "EVALUATING";

export const EXERCISE_PHASE: Record<Exclude<ExerciseStatus, "CANCELLED">, ExercisePhase> = {
  DRAFT: "PREPARING",
  DOCUMENTS_IN_PREPARATION: "PREPARING",
  PENDING_APPROVAL_FOR_TENDERING: "PREPARING",
  APPROVED_FOR_TENDERING: "PREPARING",
  ADVERTISED: "IN_MARKET",
  INVITED: "IN_MARKET",
  OPENING_IN_PROGRESS: "EVALUATING",
  OPENED: "EVALUATING",
  UNDER_EVALUATION: "EVALUATING",
  EVALUATED: "EVALUATING",
};

export const EXERCISE_PHASE_LABEL: Record<ExercisePhase, string> = {
  PREPARING: "preparing",
  IN_MARKET: "out to market",
  EVALUATING: "at opening or evaluation",
};

const PHASE_ORDER: readonly ExercisePhase[] = ["PREPARING", "IN_MARKET", "EVALUATING"];

type Bucket = { status: ExerciseStatus; count: number };

/// "13 preparing · 2 out to market · 3 at opening or evaluation": phases with none are left out.
/// Cancelled exercises are not open and are not counted here.
export function phaseSummary(openByStatus: readonly Bucket[], lang: Language = "en"): string {
  const totals = new Map<ExercisePhase, number>();
  for (const b of openByStatus) {
    if (b.status === "CANCELLED" || b.count <= 0) continue;
    const phase = EXERCISE_PHASE[b.status];
    totals.set(phase, (totals.get(phase) ?? 0) + b.count);
  }
  return PHASE_ORDER.filter((p) => (totals.get(p) ?? 0) > 0)
    .map((p) => `${totals.get(p)} ${say(EXERCISE_PHASE_WORDS[p], lang)}`)
    .join(" · ");
}

/// The full breakdown behind the summary, in the statuses' own order, for its tooltip.
export function statusBreakdown(openByStatus: readonly Bucket[], cancelled: number, lang: Language = "en"): string {
  const by = new Map(openByStatus.map((b) => [b.status, b.count]));
  const parts = EXERCISE_STATUS_ORDER.filter((s) => s !== "CANCELLED" && (by.get(s) ?? 0) > 0).map(
    (s) => `${by.get(s)} ${say(EXERCISE_STATUS_WORDS[s], lang).toLowerCase()}`,
  );
  if (cancelled > 0) parts.push(sayWith(BREAKDOWN_WORDS.cancelledNotCounted, lang, { count: String(cancelled) }));
  return parts.join(" · ");
}
