import { describe, expect, it } from "vitest";

import { contractCancellable, contractTransition, formationOpen, isExecuted, phaseOf } from "./status";

/**
 * §7.3.3 up to Active: every edge to STAMPED, the legal loop, cancellation only before execution, Active
 * only by possession (6.13), and the two derived phases (FR-CON-008).
 */

describe("the contract's transitions", () => {
  it("every edge of the main line to STAMPED", () => {
    expect(contractTransition("NUMBER_ALLOCATED", "IN_PREPARATION")).toBeNull();
    expect(contractTransition("IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT")).toBeNull();
    expect(contractTransition("PENDING_LEGAL_ENDORSEMENT", "LEGALLY_ENDORSED")).toBeNull();
    expect(contractTransition("LEGALLY_ENDORSED", "EXECUTED")).toBeNull();
    expect(contractTransition("EXECUTED", "STAMPED")).toBeNull();
  });

  it("the legal loop: returned, then pending again only by resubmission; never straight to endorsed", () => {
    expect(contractTransition("PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT")).toBeNull();
    expect(contractTransition("RETURNED_FOR_AMENDMENT", "PENDING_LEGAL_ENDORSEMENT")).toBeNull();
    expect(contractTransition("RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED")).toBe("NOT_ALLOWED");
    expect(contractTransition("RETURNED_FOR_AMENDMENT", "IN_PREPARATION")).toBe("NOT_ALLOWED");
  });

  it("no step is skipped", () => {
    expect(contractTransition("IN_PREPARATION", "LEGALLY_ENDORSED")).toBe("NOT_ALLOWED");
    expect(contractTransition("IN_PREPARATION", "EXECUTED")).toBe("NOT_ALLOWED");
    expect(contractTransition("NUMBER_ALLOCATED", "EXECUTED")).toBe("NOT_ALLOWED");
    expect(contractTransition("LEGALLY_ENDORSED", "STAMPED")).toBe("NOT_ALLOWED");
  });

  it("cancelled only before execution, and nothing leaves cancelled", () => {
    for (const s of ["NUMBER_ALLOCATED", "IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED"] as const) expect(contractCancellable(s)).toBe(true);
    for (const s of ["EXECUTED", "STAMPED", "ACTIVE"] as const) expect(contractTransition(s, "CANCELLED")).toBe("EXECUTED_NOT_CANCELLED");
    expect(contractTransition("CANCELLED", "IN_PREPARATION")).toBe("TERMINAL");
  });

  it("active only by 6.13's possession act", () => {
    expect(contractTransition("STAMPED", "ACTIVE")).toBe("ACTIVE_ONLY_BY_POSSESSION");
    expect(contractTransition("STAMPED", "ACTIVE", { act: "POSSESSION" })).toBeNull();
    expect(contractTransition("EXECUTED", "ACTIVE", { act: "POSSESSION" })).toBe("NOT_ALLOWED");
  });

  it("formation is open in preparation and when returned; executed means executed, stamped or active", () => {
    expect(formationOpen("IN_PREPARATION")).toBe(true);
    expect(formationOpen("RETURNED_FOR_AMENDMENT")).toBe(true);
    expect(formationOpen("PENDING_LEGAL_ENDORSEMENT")).toBe(false);
    expect(isExecuted("STAMPED")).toBe(true);
    expect(isExecuted("LEGALLY_ENDORSED")).toBe(false);
  });
});

describe("the derived phases (FR-CON-008, never stored)", () => {
  it("legally endorsed with the gate not met is awaiting conditions precedent", () => {
    expect(phaseOf("LEGALLY_ENDORSED", { ready: false }, true)).toBe("AWAITING_CONDITIONS");
  });
  it("ready to sign only with the gate met and the resolution on file", () => {
    expect(phaseOf("LEGALLY_ENDORSED", { ready: true }, true)).toBe("READY_TO_SIGN");
    expect(phaseOf("LEGALLY_ENDORSED", { ready: true }, false)).toBe("LEGALLY_ENDORSED");
  });
  it("other states read as stored, gate or not", () => {
    expect(phaseOf("IN_PREPARATION", { ready: true }, true)).toBe("IN_PREPARATION");
    expect(phaseOf("EXECUTED", { ready: false }, false)).toBe("EXECUTED");
  });
});
