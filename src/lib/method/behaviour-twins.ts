/**
 * Typed twins of a contract type's free-text behaviours (6.13 Part A step 1, plan A7, FR-MTD-012). The free
 * text stays as the customer's label; the twin is what a module reads. Empty or null is "not set", and the act
 * that depends on it refuses, naming the setting, never reading it as "none".
 *
 * Part A's twin is `sumAdjustmentTriggers` (FR-PAD-001's five triggers, read by the adjustment certificate in
 * step 4). The extension-of-time and completion instruments wait for the certificate kinds Part B adds in their
 * own migrations (X-6): a twin typed now could only name Part A's kinds (BD-613-7). Pure.
 */

import { w, type Words } from "@/lib/contract/labels";
import type { Finding } from "@/lib/contract/types";

export const SUM_ADJUSTMENT_TRIGGERS = ["VARIATION", "LOSS_AND_EXPENSE", "REMEASUREMENT", "PC_AND_PROVISIONAL_SUMS", "PRICE_FLUCTUATION"] as const;
export type SumAdjustmentTrigger = (typeof SUM_ADJUSTMENT_TRIGGERS)[number];

/// Each trigger in words (exhaustive), as SK013 names it.
export const SUM_ADJUSTMENT_TRIGGER_WORDS: Readonly<Record<SumAdjustmentTrigger, Words>> = {
  VARIATION: w("Variation of works"),
  LOSS_AND_EXPENSE: w("Contractor's claim for loss or expense"),
  REMEASUREMENT: w("Re-measurement of provisional quantities"),
  PC_AND_PROVISIONAL_SUMS: w("Adjustment of prime cost and provisional sums"),
  PRICE_FLUCTUATION: w("Material price fluctuation and extension of the contract period"),
};

export const isSumAdjustmentTrigger = (v: string): v is SumAdjustmentTrigger => (SUM_ADJUSTMENT_TRIGGERS as readonly string[]).includes(v);

export type TriggerFault = "TRIGGERS_NOT_SET" | "TRIGGER_NOT_FOR_TYPE";

/**
 * Whether a contract of a type may adjust its sum by a trigger: the type's typed list, read from the type as
 * frozen for the contract. Empty: not set (refused, naming the setting); a trigger not on it: refused.
 */
export function triggerFaults(typeName: string | null, triggers: readonly SumAdjustmentTrigger[], asked: SumAdjustmentTrigger): Finding<TriggerFault>[] {
  if (triggers.length === 0) return [{ code: "TRIGGERS_NOT_SET", level: "block", data: { type: typeName } }];
  if (!triggers.includes(asked)) return [{ code: "TRIGGER_NOT_FOR_TYPE", level: "block", data: { type: typeName, trigger: asked } }];
  return [];
}

export function triggerFaultWords(f: Finding): Words {
  const t = f.data?.type ? String(f.data.type) : "the contract type";
  if (f.code === "TRIGGERS_NOT_SET") return w(`Which adjustments of the contract sum ${t} allows is not set. Set its contract-sum adjustment triggers under Configuration › Reference data.`);
  const g = SUM_ADJUSTMENT_TRIGGER_WORDS[f.data?.trigger as SumAdjustmentTrigger] ?? w("That adjustment");
  return w(`${g.en} is not a contract-sum adjustment ${t} allows.`);
}
