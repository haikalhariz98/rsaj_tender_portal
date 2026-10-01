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

/// The outcome as a sentence-case title: "Held", not "held".
export function outcomeTitle(o: CheckOutcome): string {
  const w = OUTCOME_WORD[o];
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export interface WorkedExample {
  code: BudgetCode;
  available: Sen;
  /// The amount the example asks about — one sen more than is available, so the
  /// example exercises the setting instead of passing whatever it is set to.
  amount: Sen;
  /// Where the code's utilisation would land if the requirement went through.
  utilisationAfter: number | null;
  outcome: CheckOutcome;
  /// The code has nothing left (already spent or committed past its allocation). No
  /// code with a balance exists to illustrate against, so the example says so.
  overspent: boolean;
}

/**
 * What the example says, in words. A code with a balance is asked about one sen more
 * than is left. An overspent one is not: asking "a sen more than a negative balance"
 * is nonsense, so it says the code is already over and what the setting does to
 * anything further.
 */
export function exampleSentence(e: WorkedExample, f: { amount: string; available: string }): string {
  if (e.overspent) {
    const what =
      e.outcome === "NOT_SET"
        ? "nobody has said whether the portal should hold a requirement that exceeds the balance or let it through"
        : `any requirement on it would be ${OUTCOME_WORD[e.outcome]}`;
    return `${e.code.code} is already overspent (${f.available} available), and no budget code with a balance is left to illustrate against. As things stand, ${what}.`;
  }
  if (e.outcome === "NOT_SET") {
    return `A requirement of ${f.amount} on ${e.code.code} today would exceed the balance, and nobody has said whether the portal should hold it or let it through.`;
  }
  return `A requirement of ${f.amount} on ${e.code.code} today would be ${OUTCOME_WORD[e.outcome]}.`;
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

  // The one closest to running out is the one worth asking about, among those that
  // still have a balance: a sen more than a negative balance asks nothing.
  const closest = (a: (typeof candidates)[number], b: (typeof candidates)[number]) => (b.figures.utilisation ?? 0) - (a.figures.utilisation ?? 0);
  const withBalance = candidates.filter((c) => c.figures.available > 0n).sort(closest);
  const { code, figures } = (withBalance.length > 0 ? withBalance : candidates.sort(closest))[0];

  const available = figures.available;
  const overspent = available <= 0n;
  const amount = overspent ? 1n : available + 1n;
  const used = addSen(addSen(figures.committed, figures.actualSpend), amount);
  const utilisationAfter =
    figures.allocated > 0n ? Number((used * 10000n) / figures.allocated) / 100 : null;

  return {
    code,
    available,
    amount,
    utilisationAfter,
    outcome: outcomeFor(availabilityCheck, fitsWithin(available, amount)),
    overspent,
  };
}
