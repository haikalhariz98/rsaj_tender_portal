import { describe, expect, it } from "vitest";

import { attachFault, detachFault, ownerState, reliedOn, type OwnerFacts } from "./attach";
import { contractFacts } from "./owner-facts";

/**
 * 6.12: what a contract keeps, and when. Nothing before preparation; a cancelled contract keeps what it
 * has; what goes to legal review changes only while the contract is prepared or back for amendment; the
 * legal office's comments once it has been sent; the resolution and reconciliation scan until execution;
 * the signed contract and stamping certificate only after. The contractor's signature stands on the
 * company resolution.
 */

const c = (status: Extract<OwnerFacts, { kind: "contract" }>["status"], x: Partial<{ legalSubmitted: boolean; contractorSigned: boolean }> = {}): OwnerFacts => ({ kind: "contract", status, legalSubmitted: false, contractorSigned: false, ...x });

describe("a contract's papers", () => {
  it("nothing before preparation starts, and a cancelled contract is frozen", () => {
    expect(ownerState("COMPANY_RESOLUTION", c("NUMBER_ALLOCATED"))).toEqual({ state: "NOT_READY", exit: "CONTRACT_NOT_IN_PREPARATION" });
    expect(ownerState("LEGAL_SUBMISSION", c("CANCELLED"))).toEqual({ state: "FROZEN", exit: "CONTRACT_CANCELLED" });
  });

  it("what goes to legal review: open in preparation and when returned, frozen while pending and once endorsed", () => {
    expect(ownerState("LEGAL_SUBMISSION", c("IN_PREPARATION"))).toEqual({ state: "OPEN" });
    expect(ownerState("LEGAL_SUBMISSION", c("RETURNED_FOR_AMENDMENT"))).toEqual({ state: "OPEN" });
    expect(ownerState("LEGAL_SUBMISSION", c("PENDING_LEGAL_ENDORSEMENT"))).toEqual({ state: "FROZEN", exit: "LEGAL_REVIEW_PENDING" });
    expect(ownerState("LEGAL_SUBMISSION", c("LEGALLY_ENDORSED"))).toEqual({ state: "FROZEN", exit: "LEGALLY_ENDORSED" });
  });

  it("the legal office's comments once it has been sent", () => {
    expect(ownerState("LEGAL_COMMENTS", c("IN_PREPARATION"))).toEqual({ state: "NOT_READY", exit: "LEGAL_NOT_SUBMITTED" });
    expect(ownerState("LEGAL_COMMENTS", c("RETURNED_FOR_AMENDMENT", { legalSubmitted: true }))).toEqual({ state: "OPEN" });
  });

  it("the signed contract and stamping certificate only once executed; the resolution and reconciliation until then", () => {
    expect(ownerState("SIGNED_CONTRACT", c("LEGALLY_ENDORSED"))).toEqual({ state: "NOT_READY", exit: "CONTRACT_NOT_EXECUTED" });
    expect(ownerState("STAMPING_CERTIFICATE", c("EXECUTED"))).toEqual({ state: "OPEN" });
    expect(ownerState("COMPANY_RESOLUTION", c("LEGALLY_ENDORSED"))).toEqual({ state: "OPEN" });
    expect(ownerState("RECONCILIATION", c("STAMPED"))).toEqual({ state: "FROZEN", exit: "CONTRACT_EXECUTED" });
  });

  it("a purpose of another owner is refused on a contract", () => {
    const f = attachFault({ purpose: "SIGNED_LETTER", owner: c("IN_PREPARATION"), version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" } });
    expect(f.map((x) => x.code)).toEqual(["PURPOSE_NOT_FOR_OWNER"]);
  });

  it("the contractor's signature stands on the last live company resolution", () => {
    expect(reliedOn("COMPANY_RESOLUTION", c("LEGALLY_ENDORSED", { contractorSigned: true }), 1)).toBe("RESOLUTION_ON_IT");
    expect(reliedOn("COMPANY_RESOLUTION", c("LEGALLY_ENDORSED", { contractorSigned: true }), 2)).toBeNull();
    expect(reliedOn("COMPANY_RESOLUTION", c("LEGALLY_ENDORSED"), 1)).toBeNull();
    const d = detachFault({ purpose: "COMPANY_RESOLUTION", owner: c("LEGALLY_ENDORSED", { contractorSigned: true }), reason: "wrong file", reliedOn: "RESOLUTION_ON_IT" });
    expect(d.map((x) => x.code)).toEqual(["RELIED_ON"]);
  });

  it("contractFacts reads the signatures and the reviews", () => {
    expect(contractFacts({ status: "LEGALLY_ENDORSED", signatures: [{ party: "CONTRACTOR" }], legalReviews: [{}] })).toEqual(c("LEGALLY_ENDORSED", { legalSubmitted: true, contractorSigned: true }));
  });
});
