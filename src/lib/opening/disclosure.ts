import { disclose, type EstimateFacts } from "@/lib/scope/estimate";

/**
 * Review R-1: everything that would refuse the disclosure, judged before anything is written: the
 * estimate's state (6.2 `disclose`), and its lodged version on record (version numbers only, never a
 * figure). Pure.
 */
export function disclosureFault(facts: Pick<EstimateFacts, "state" | "lodgedVersionNo" | "currentVersionNo">, versionNos: readonly number[], at: Date): string | null {
  const d = disclose(facts, at);
  if (!d.ok) return d.fault;
  const lodgedNo = facts.lodgedVersionNo ?? facts.currentVersionNo;
  return versionNos.includes(lodgedNo) ? null : "LODGED_VERSION_MISSING";
}
