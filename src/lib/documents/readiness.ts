/**
 * Whether a document class is ready to run: a retention clock needs both how long to keep
 * (a period of at least a month: zero is not a period) and what starts it. A class with a
 * period and no start never begins to run, so it is not ready; one with no classification
 * is listed but never opened. Both are gaps the configuration screen must count, so a
 * header never says "all set" over a class that cannot run.
 */

import { isRetentionPeriod } from "./retention";

export interface ClassFacts {
  retentionMonths: number | null;
  retentionTrigger: string | null;
  classification: string | null;
}

export const isReadyToRun = (c: ClassFacts) => c.retentionMonths != null && isRetentionPeriod(c.retentionMonths) && c.retentionTrigger != null;

export function classReadiness<C extends ClassFacts>(classes: readonly C[]) {
  const ready = classes.filter(isReadyToRun);
  return { ready: ready.length, total: classes.length, needAttention: classes.filter((c) => !isReadyToRun(c) || c.classification == null) };
}

/// "2 classes need attention", "1 class needs attention"; null when every class is ready and classified.
export function attentionText(count: number): string | null {
  return count === 0 ? null : count === 1 ? "1 class needs attention" : `${count} classes need attention`;
}
