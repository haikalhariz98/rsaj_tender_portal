/**
 * The finance system's commitment behind an award (INT-04, INT-05), behind a façade.
 *
 * The finance system mints the indent or purchase order number; the portal consumes it
 * and never mints one. Until an adapter exists the only one is manual: an officer types
 * the number the finance system returned, and it is checked against the configured
 * format where one is set. The "Issued, no commitment number" view on /awards is the
 * reconciliation list.
 */

export interface CommitmentNumber {
  number: string;
  kind: "INDENT" | "PURCHASE_ORDER";
  receivedOn: string;
}

export type CommitmentFault = "NUMBER_REQUIRED" | "FORMAT" | "FUTURE_DATE" | "TAKEN";

export interface CommitmentGateway {
  /// Where an adapter exists, ask the finance system for the commitment. Manual: nothing to ask.
  requestCommitment(awardReference: string): Promise<void>;
  /// Check a number as it is recorded.
  check(n: CommitmentNumber, ctx: { pattern: string | null; today: string; taken: boolean }): CommitmentFault[];
}

/// A pattern anchored by the validator, as every CodeFormat is.
export function matchesFormat(value: string, pattern: string | null): boolean | null {
  if (!pattern) return null;
  try {
    return new RegExp(`^(?:${pattern})$`).test(value);
  } catch {
    return null;
  }
}

export const manualCommitment: CommitmentGateway = {
  async requestCommitment() {
    // Manual: the officer raises it in the finance system and records the number here.
  },
  check(n, ctx) {
    const out: CommitmentFault[] = [];
    if (!n.number.trim()) out.push("NUMBER_REQUIRED");
    else if (matchesFormat(n.number.trim(), ctx.pattern) === false) out.push("FORMAT");
    if (n.receivedOn > ctx.today) out.push("FUTURE_DATE");
    if (ctx.taken) out.push("TAKEN");
    return out;
  },
};
