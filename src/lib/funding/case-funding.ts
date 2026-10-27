import { percentToBp } from "./split";
import type { CaseFunding } from "./types";

/**
 * FS-5: a contract's funding, in order: its own FundingAllocation rows; otherwise the requisition's source at 100%; otherwise not set.
 * Nothing is copied at award. Pure.
 */
export function caseFunding(allocations: readonly { fundingSourceId: string; sharePct: { toString(): string } }[], requisitionSourceId: string | null): CaseFunding {
  if (allocations.length > 0) {
    return {
      state: "SPLIT",
      shares: allocations.map((a) => {
        const bp = percentToBp(a.sharePct.toString());
        // The CHECK holds every stored share in (0, 100] at 2 decimals, so this cannot be reached by stored data.
        if (bp == null) throw new Error(`A stored share cannot be read: ${a.sharePct.toString()}`);
        return { sourceId: a.fundingSourceId, bp };
      }),
    };
  }
  return requisitionSourceId ? { state: "FROM_REQUISITION", shares: [{ sourceId: requisitionSourceId, bp: 10000 }] } : { state: "NOT_SET" };
}

/// FS-7's lock: money is certified on the contract (an issued certificate of a payable kind, or a supply payment).
export const splitLocked = (i: { issuedPayableCertificates: number; supplyPayments: number }): boolean => i.issuedPayableCertificates > 0 || i.supplyPayments > 0;
