/**
 * What the budget controls mean when a requirement actually arrives.
 *
 * The worked example on the Controls tab is computed from these rules and the real
 * ledger, never written down. A card that explained the settings in prose would go
 * stale the moment somebody changed one.
 */

import { addSen, type Sen } from "@/lib/money";

import { figuresFor, fitsWithin, type BudgetCode, type Movement } from "./codes";

/**
 * What happens to a requirement that does not fit.
 *
 * Four outcomes, not two. A check nobody has configured cannot be said to block or
 * to warn, and guessing either way would tell an officer the portal will do
 * something it may not.
 */
export type CheckOutcome = "RELEASED" | "HELD" | "ALLOWED_WITH_WARNING" | "NOT_SET";

export function outcomeFor(
  availabilityCheck: string | null | undefined,
  fits: boolean,
): CheckOutcome {
  if (fits) return "RELEASED";
  if (!availabilityCheck) return "NOT_SET";
  return availabilityCheck === "blocking" ? "HELD" : "ALLOWED_WITH_WARNING";
}

export const OUTCOME_WORD: Record<CheckOutcome, string> = {
  RELEASED: "released",
  HELD: "held",
  ALLOWED_WITH_WARNING: "allowed with a warning",
  NOT_SET: "undecided",
};

export interface WorkedExample {
  code: BudgetCode;
  available: Sen;
  /// The amount the example asks about — one sen more than is available, so the
  /// example exercises the setting instead of passing whatever it is set to.
  amount: Sen;
  /// Where the code's utilisation would land if the requirement went through.
  utilisationAfter: number | null;
  outcome: CheckOutcome;
}

/**
 * A requirement worth illustrating, against a real budget code.
 *
 * The amount is one sen over what the code has left, because an example that fits
 * reads the same whether the check blocks or merely warns — which is exactly the
 * setting the card is there to explain.
 *
 * Null where there is no code with an allocation to illustrate against. Better than
 * inventing a code and an amount, which is what a fixed example would be.
 */
export function workedExample(
  codes: readonly BudgetCode[],
  movements: readonly Movement[],
  availabilityCheck: string | null | undefined,
  on: Date,
): WorkedExample | null {
  const candidates = codes
    .map((code) => ({ code, figures: figuresFor(movements, code.id, on) }))
    .filter((c) => c.figures.allocated > 0n);
  if (candidates.length === 0) return null;

  // The one closest to running out is the one worth asking about.
  candidates.sort((a, b) => (b.figures.utilisation ?? 0) - (a.figures.utilisation ?? 0));
  const { code, figures } = candidates[0];

  const available = figures.available;
  const amount = available > 0n ? available + 1n : 1n;
  const used = addSen(addSen(figures.committed, figures.actualSpend), amount);
  const utilisationAfter =
    figures.allocated > 0n ? Number((used * 10000n) / figures.allocated) / 100 : null;

  return {
    code,
    available,
    amount,
    utilisationAfter,
    outcome: outcomeFor(availabilityCheck, fitsWithin(available, amount)),
  };
}
