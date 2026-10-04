/**
 * Which interim certificates may be issued before the contract is signed (6.13 Part A step 3: FR-PAY-014, as ruled:
 * checked at issue on the sequence allocated under the contract's lock, warned of when the valuation is opened).
 *
 * Once the formal contract is executed, any certificate may issue. Before it, only certificates numbered up to the
 * organisation's limit (PostAwardPolicy.preExecutionInterimLimit: the spec's "1 to 3" is a customer figure, so it
 * ships unset and an unset limit refuses every certificate before execution, naming the setting), and only where the
 * contractor has returned the signed and witnessed Letter of Acceptance, lodged the performance bond and every
 * stipulated policy (each verified: the 6.11 readiness gate), every policy relied on carries its premium receipt (a
 * cover note is not evidence of insurance without one; the register does not tell a cover note from a policy, so
 * every policy needs it: the stricter reading, BD-613-31), and the social security (PERKESO) registration number is
 * recorded. The contractor's bank details are not captured before sign-in (6.15 OD-3 B): said, not checked.
 * Pure.
 */

import { EXECUTED_STATES } from "@/lib/contract/status";
import type { Finding } from "./types";

export interface PreExecutionFacts {
  executed: boolean;
  /// The limit frozen with the valuation when its certificate was raised. Null: not set then.
  limit: number | null;
  /// The 6.11 readiness gate's items (RETURNED, BOND, INSURANCE) as judged now.
  gate: readonly { key: string; state: string }[];
  /// Verified policies with no premium receipt recorded, by name.
  withoutReceipt: readonly string[];
  /// A PERKESO registration number is recorded on a verified policy.
  perkesoRecorded: boolean;
}

/// Why certificate number `sequence` may not issue before execution (empty: it may). `level` warn at open, block at issue.
export function preExecutionFaults(sequence: number, f: PreExecutionFacts, level: "block" | "warn" = "block"): Finding[] {
  if (f.executed) return [];
  const out: Finding[] = [];
  const add = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level, data });
  if (f.limit == null) {
    add("PRE_EXECUTION_LIMIT_NOT_SET", { sequence });
    return out;
  }
  if (sequence > f.limit) {
    add("CONTRACT_NOT_SIGNED", { sequence, limit: f.limit });
    return out;
  }
  for (const key of ["RETURNED", "BOND", "INSURANCE"]) {
    const item = f.gate.find((g) => g.key === key);
    if (!item || item.state !== "MET") add("PRE_EXECUTION_GATE", { item: key });
  }
  if (f.withoutReceipt.length) add("COVER_NOTE_NO_RECEIPT", { policies: f.withoutReceipt.join(", ") });
  if (!f.perkesoRecorded) add("PERKESO_NOT_RECORDED");
  return out;
}

/// The statuses at which the formal contract is signed (FR-PAY-014's "Contract Document is signed"): the contract's own
/// rule (isExecuted), so a contract past Active is still signed (6.13 Part B run 1a, ADR 0031).
export const EXECUTED_STATUSES: readonly string[] = EXECUTED_STATES;
