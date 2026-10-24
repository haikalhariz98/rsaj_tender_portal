import { addSen, senFromDecimal, senToDecimalString } from "@/lib/money";

import type { Movement } from "./codes";

export const WITHHELD_COMMITMENTS_LABEL = "Requisitions not shown (SULIT)";

/**
 * Budget page, "gate and fold" (product owner, 2026-10-24). A commitment's description, reference and amount are a requisition's estimate,
 * which is SULIT. The commitments a reader may not read are replaced, per budget code, by one unnamed row holding their sum as at `on`, so the
 * figures a reader sees do not change and no single estimate is sent. Unreadable commitments that are released or not yet dated hold nothing
 * at `on` and are dropped. Other kinds, and readable commitments, pass through unchanged.
 */
export function foldWithheldCommitments(movements: readonly Movement[], readable: ReadonlySet<string>, on: Date): Movement[] {
  const out: Movement[] = [];
  const sums = new Map<string, bigint>();
  for (const m of movements) {
    if (m.kind !== "COMMITMENT" || readable.has(m.id)) {
      out.push(m);
      continue;
    }
    if (m.occurredOn <= on && (m.releasedOn == null || m.releasedOn > on)) {
      sums.set(m.budgetCodeId, addSen(sums.get(m.budgetCodeId) ?? 0n, senFromDecimal(m.amount)));
    }
  }
  for (const [budgetCodeId, sen] of sums) {
    out.push({ id: `withheld:${budgetCodeId}`, budgetCodeId, kind: "COMMITMENT", reference: "", description: WITHHELD_COMMITMENTS_LABEL, amount: senToDecimalString(sen), occurredOn: on, releasedOn: null, releaseNote: "", counterpartCode: null });
  }
  return out;
}
