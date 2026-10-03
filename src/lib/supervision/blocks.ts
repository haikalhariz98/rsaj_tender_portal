/**
 * Who holds a certificate's supervised signature block on a day (6.14's SO, SO_REP and RECOMMENDING_OFFICER
 * rules, resolved from the contract's supervision; 6.13 Part A, BD-613-13). Pure.
 *
 * - SO: the holders of the S.O. office in force on the day (the contract's assignment), and those acting in it
 *   under a delegation of the whole office (6.1), exactly as a named office's block reads its office.
 * - SO_REP: the Principal S.O. Representatives whose delegation is in force on the day (its letter issued on or
 *   before it, not revoked by it). A specialist representative does not sign as the S.O.'s representative.
 * - RECOMMENDING_OFFICER: who recommends depends on what the certificate certifies, and the first certificate
 *   that carries the block (the interim payment) arrives with its own module; until then nobody is resolved,
 *   and the block says so rather than guessing.
 * Null: nobody can hold the block (no S.O. on the day, or a rule not yet resolved): the block refuses everyone.
 */

import type { OfficeHolders } from "@/lib/certificate/signature";

import { inForce, type DelegationFacts } from "./authority";
import type { Day } from "./types";

export type SupervisedRule = "SO" | "SO_REP" | "RECOMMENDING_OFFICER";

export const isSupervisedRule = (rule: string): rule is SupervisedRule => rule === "SO" || rule === "SO_REP" || rule === "RECOMMENDING_OFFICER";

export function supervisedHolders(rule: SupervisedRule, so: OfficeHolders | null, delegations: readonly DelegationFacts[], day: Day): OfficeHolders | null {
  if (!so) return null;
  switch (rule) {
    case "SO":
      return so;
    case "SO_REP": {
      const ids = [...new Set(delegations.filter((d) => d.kind === "PRINCIPAL" && inForce(d, day)).map((d) => d.delegatePersonId))];
      return ids.length ? { holderIds: ids, delegates: [] } : null;
    }
    case "RECOMMENDING_OFFICER":
      return null;
  }
}
