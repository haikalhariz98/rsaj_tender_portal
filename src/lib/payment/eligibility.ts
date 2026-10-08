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
 * recorded. Pure.
 *
 * The contractor's bank details (BD-613-44, Phase 4b): a payment certificate issues only to a contractor whose creditor profile an officer has CHECKED. `creditorFaults` reads the
 * latest checked version, as `creditorStanding` says it: a newer version that is sent and not yet checked leaves the earlier checked one in force, and with none checked the payment is
 * refused, in words that say which of the three it is (nothing entered, waiting for a check, found not in order). A contractor the award does not link to the supplier register has no
 * profile to read, and is refused as such rather than read as an empty account.
 */

import { EXECUTED_STATES } from "@/lib/contract/status";
import { creditorStanding, type CreditorVersionFact } from "./creditor";
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

/// What is known of the bank details of the contractor a payment certificate is made out to.
export interface CreditorFacts {
  /// The award names a supplier of the register (`Award.vendorId`). False: there is no profile to read.
  onRegister: boolean;
  /// The creditor profile versions of that supplier, as stored.
  versions: readonly CreditorVersionFact[];
}

/// Why this payment may not issue for want of checked bank details (empty: it may). `level` warn where it is only said, block at issue. The version in force is not named in a fault; the
/// words for a payment that may go (`creditorStandingWords`) name it.
export function creditorFaults(f: CreditorFacts, level: "block" | "warn" = "block"): Finding[] {
  if (!f.onRegister) return [{ code: "CONTRACTOR_NOT_ON_REGISTER", level, data: {} }];
  const standing = creditorStanding(f.versions);
  if (standing.state === "IN_FORCE") return [];
  return [{ code: "CREDITOR_NOT_VERIFIED", level, data: { reason: standing.reason } }];
}

/// The statuses at which the formal contract is signed (FR-PAY-014's "Contract Document is signed"): the contract's own
/// rule (isExecuted), so a contract past Active is still signed (6.13 Part B run 1a, ADR 0031).
export const EXECUTED_STATUSES: readonly string[] = EXECUTED_STATES;
