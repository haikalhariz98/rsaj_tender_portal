import { describe, expect, it } from "vitest";

import { CONTRACT_STATUSES, type ContractStatus } from "@/lib/contract/types";

import { issuedCopiesWhere, openSheetsWhere, outstandingCopiesWhere } from "./library";

/**
 * BD-613-97 (6.14 increment 2 intake 8, pinned at 6.13 Part B run 1a once the statuses exist): a TERMINATED or CLOSED
 * contract's copies and open sheets stay listed on /documents (a terminated contract has live documents: the notice of
 * termination, the final payment on termination, bond-claim copies); only a CANCELLED contract's are kept apart. The
 * chip that names them comes with run 4.
 */

/// Whether a where-clause's contract filter admits a contract in this state (the two shapes library.ts writes).
const admits = (where: { contract?: { status: ContractStatus | { not: ContractStatus } } }, s: ContractStatus) => {
  const f = where.contract!.status;
  return typeof f === "string" ? f === s : f.not !== s;
};
const certWhere = (onCancelled: boolean) => issuedCopiesWhere("org", onCancelled).certificate as { contract: { status: ContractStatus | { not: ContractStatus } } };

describe("which contracts' documents /documents lists", () => {
  it("every state but CANCELLED on the main lists, TERMINATED and CLOSED included; CANCELLED alone kept apart", () => {
    for (const s of CONTRACT_STATUSES) {
      expect(admits(certWhere(false), s), s).toBe(s !== "CANCELLED");
      expect(admits(certWhere(true), s), s).toBe(s === "CANCELLED");
      expect(admits(openSheetsWhere("org", false), s), s).toBe(s !== "CANCELLED");
      expect(admits(openSheetsWhere("org", true), s), s).toBe(s === "CANCELLED");
    }
    expect(admits(certWhere(false), "TERMINATED")).toBe(true);
    expect(admits(certWhere(false), "CLOSED")).toBe(true);
    expect((outstandingCopiesWhere("org", false).certificate as { contract: unknown }).contract).toEqual({ status: { not: "CANCELLED" } });
  });
});
