/**
 * Who holds a certificate's supervised signature block on a day (6.14's SO, SO_REP and RECOMMENDING_OFFICER
 * rules, resolved from the contract's supervision; 6.13 Part A, BD-613-13). Pure.
 *
 * - SO: the holders of the S.O. office in force on the day (the contract's assignment), and those acting in it
 *   under a delegation of the whole office (6.1), exactly as a named office's block reads its office.
 * - SO_REP: the Principal S.O. Representatives whose delegation is in force on the day (its letter issued on or
 *   before it, not revoked by it). A specialist representative does not sign as the S.O.'s representative.
 * - RECOMMENDING_OFFICER: who recommends depends on what the certificate certifies (BD-613-13, resolved at step 3,
 *   BD-613-30): on an interim payment certificate, the representatives whose delegation is in force on the day
 *   and whose scope lists valuing work for interim payment (FR-PAY-017: "the Quantity Surveyor or Recommending
 *   Officer", the Specialist QS representative where one is delegated). A kind that names no recommending act
 *   resolves nobody, and the block says so rather than guessing.
 * Null: nobody can hold the block (no S.O. on the day, or a rule not yet resolved): the block refuses everyone.
 */

import type { OfficeHolders } from "@/lib/certificate/signature";
import type { CertificateKind } from "@/lib/certificate/types";

import { inForce, type DelegationFacts } from "./authority";
import type { Day, SupervisionAct } from "./types";

/// The act a certificate kind's recommending officer must be delegated for (an exhaustive map; null: nobody is
/// resolved for that kind's recommending block yet; step 4 decides the variation's).
export const RECOMMENDING_ACT: Readonly<Record<CertificateKind, SupervisionAct | null>> = {
  DELEGATION_LETTER: null,
  DELEGATION_NOTICE: null,
  INTERIM_PAYMENT: "VALUATION",
  ADVANCE_PAYMENT: null,
  LAD_WARNING: null,
  NON_COMPLETION: null,
  VARIATION_APPLICATION: null,
  SO_INSTRUCTION: null,
  VARIATION: null,
  SUM_ADJUSTMENT: null,
  // 6.13 Part B run 1a: none yet; each kind's run decides its recommending act with its assembler.
  EOT: null,
  CONTRACT_PERIOD_AGREEMENT: null,
  PARTIAL_OCCUPATION: null,
  PRACTICAL_COMPLETION: null,
  SCHEDULE_OF_DEFECTS: null,
  MAKING_GOOD_DEFECTS: null,
  TERMINATION_INTENT: null,
  TERMINATION: null,
  TERMINATED_FINAL: null,
  NOMINATION_LETTER: null,
  FINAL: null,
};

export type SupervisedRule = "SO" | "SO_REP" | "RECOMMENDING_OFFICER";

export const isSupervisedRule = (rule: string): rule is SupervisedRule => rule === "SO" || rule === "SO_REP" || rule === "RECOMMENDING_OFFICER";

export function supervisedHolders(rule: SupervisedRule, so: OfficeHolders | null, delegations: readonly DelegationFacts[], day: Day, kind: CertificateKind | null = null): OfficeHolders | null {
  if (!so) return null;
  switch (rule) {
    case "SO":
      return so;
    case "SO_REP": {
      const ids = [...new Set(delegations.filter((d) => d.kind === "PRINCIPAL" && inForce(d, day)).map((d) => d.delegatePersonId))];
      return ids.length ? { holderIds: ids, delegates: [] } : null;
    }
    case "RECOMMENDING_OFFICER": {
      const act = kind ? RECOMMENDING_ACT[kind] : null;
      if (!act) return null;
      const ids = [...new Set(delegations.filter((d) => inForce(d, day) && d.scope.includes(act)).map((d) => d.delegatePersonId))];
      return ids.length ? { holderIds: ids, delegates: [] } : null;
    }
  }
}
