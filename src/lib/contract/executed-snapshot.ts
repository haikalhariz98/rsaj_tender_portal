/**
 * What the RSAJ signature froze (ADR 0021 §5; FR-CON-009): everything the execution was judged under, built
 * once by the signature act (and by the demo, through the same function) and read back by the Contract
 * Date's correction and the screens, never re-derived.
 *
 * 6.12 review M-1: the contractor's signature day (and the witness's, where recorded) is frozen here, so a
 * correction of the Contract Date is never to a day before the contractor signed.
 */

export interface ExecutedSnapshot {
  v: 1;
  contractDate: string;
  /// The first day the contract was ready to sign (the latest of its conditions' days).
  readySince: string | null;
  /// The day the contractor's signature was recorded as made, and the witness's.
  contractorSignedOn: string | null;
  witnessSignedOn: string | null;
  gate: unknown;
  legal: unknown;
  signatory: unknown;
  checks: unknown;
  formation: unknown;
}

export const executedSnapshot = (s: Omit<ExecutedSnapshot, "v">): ExecutedSnapshot => ({ v: 1, ...s });

/// The days a Contract Date correction is judged against, as frozen; null where a snapshot predates them.
export function frozenSigningDays(json: unknown): { readySince: string | null; contractorSignedOn: string | null | undefined; witnessSignedOn: string | null | undefined } {
  const j = (json && typeof json === "object" ? json : {}) as Partial<ExecutedSnapshot>;
  return {
    readySince: typeof j.readySince === "string" ? j.readySince : null,
    // undefined: frozen before the signature days were (6.12 before M-1); null: frozen as not recorded.
    contractorSignedOn: "contractorSignedOn" in j ? (j.contractorSignedOn ?? null) : undefined,
    witnessSignedOn: "witnessSignedOn" in j ? (j.witnessSignedOn ?? null) : undefined,
  };
}
