/**
 * What the Tender documents tab says about assurance and the mandatory clauses, decided in one
 * place so the page counts nothing (founder, 2026-10-05: the assurance card only where the policy
 * asks for it, and the clauses as one line that opens only when something is wrong). Pure; words only.
 */

/// The organisation's answer to a yes/no policy: not answered is its own state, never "no".
export type Tri = "yes" | "no" | "unset";
export const triOf = (b: boolean | null | undefined): Tri => (b == null ? "unset" : b ? "yes" : "no");

/**
 * The assurance card is shown unless the organisation has decided it is not required. An unanswered
 * policy still blocks submission (ASSURANCE_POLICY_NOT_SET), so the card stays to say so.
 */
export const assuranceCardShown = (policy: Tri): boolean => policy !== "no";

/// The status words a clause row carries, from the read models (live and frozen).
export const CLAUSE_STATUS = {
  carried: "Carried",
  missing: "Missing",
  notSet: "Not set",
  endorsed: "Left out under an endorsement",
  notRequired: "Not required in every agreement",
  notChecked: "Checked once the documents are started",
} as const;

export interface ClausesLine {
  text: string;
  tone: "ok" | "warn" | "neutral";
  /// The list opens only where there is something to act on or to read.
  expand: boolean;
  /// No clause to list at all: the line is the whole statement.
  empty: boolean;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * "2 clauses carried", or what is wrong with the rest. `none` is the sentence for a customer who has
 * configured no clauses at all: said as it is, never as "0 carried".
 */
export function clausesSummary(input: { none: string | null; noneTone?: "warn" | "neutral"; statuses: readonly string[] }): ClausesLine {
  if (input.none) return { text: input.none, tone: input.noneTone ?? "warn", expand: false, empty: true };
  const count = (s: string) => input.statuses.filter((x) => x === s).length;
  const [carried, missing, notSet, endorsed, notChecked, notRequired] = [CLAUSE_STATUS.carried, CLAUSE_STATUS.missing, CLAUSE_STATUS.notSet, CLAUSE_STATUS.endorsed, CLAUSE_STATUS.notChecked, CLAUSE_STATUS.notRequired].map(count);
  const parts = [
    carried > 0 ? `${n(carried, "clause", "clauses")} carried` : null,
    missing > 0 ? `${missing} missing` : null,
    notSet > 0 ? `${n(notSet, "clause", "clauses")} whose mandatory status is not set` : null,
    endorsed > 0 ? `${endorsed} left out under an endorsement` : null,
    notChecked > 0 ? `${n(notChecked, "clause", "clauses")} checked once the documents are started` : null,
  ].filter((p): p is string => p != null);
  if (parts.length === 0) return { text: notRequired > 0 ? `No clause is required in every agreement (${notRequired} configured)` : "No clause is configured", tone: "neutral", expand: false, empty: true };
  const wrong = missing + notSet > 0;
  return { text: parts.join(", "), tone: wrong ? "warn" : endorsed > 0 ? "neutral" : "ok", expand: wrong || endorsed > 0, empty: false };
}
