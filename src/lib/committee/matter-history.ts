import { sulitWithheld, through, type Sulit } from "@/lib/auth/sulit-access";

/**
 * A committee matter's amount as the sitting's History shows it (Phase 3b). The trail names the matter by its id, and the matter’s kind says whose figure the amount is
 * (`matterAmountScope`): the page asks about every matter of the sitting once, and this holds each trail row to its matter’s answer. Pure.
 *
 * - Not an amount: null (the trail draws the field as it always did).
 * - A matter of the sitting whose kind makes its amount SULIT (`gate` is given): the amount held to the reader’s answer.
 * - A matter of the sitting whose amount is not SULIT (no gate): as it is.
 * - Anything else (a row for a matter this sitting no longer holds, or an `amount` on another kind of record): withheld. Nothing is shown on a guess.
 */
export type HistoryAmount = { sulit: Sulit<string>; text?: undefined } | { text: string; sulit?: undefined };

export function historyAmount(i: { field: string; entity: string; entityId: string; known: boolean; gate: Sulit<true> | null; text: string }): HistoryAmount | null {
  if (i.field !== "amount") return null;
  if (i.entity !== "CommitteeDecision" || !i.known) return { sulit: sulitWithheld<string>("FIELD_NOT_FOR_THIS_RECORD", "requisition") };
  if (i.gate) return { sulit: through(i.gate, i.text) };
  return { text: i.text };
}
