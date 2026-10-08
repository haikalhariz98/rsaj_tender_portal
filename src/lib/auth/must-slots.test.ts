import { describe, expect, it } from "vitest";

import { slotOf } from "./act-slots";

/**
 * Phase 3d, "module Musts that need the actor beyond attribution": what each Must asks of the act that carries it, held to the registry that `beginAct` reads, so that a Must
 * cannot quietly slip back to being "recorded on someone's behalf, not signed". Each row names the Must, the slot of the act and what the act is:
 *
 *   OWN     the signed-in person's own act: not a signature, not paper-capable. The person judged is the actor (a person a form names is not read).
 *   SIGNED  the signed-in person's own signature: the password is asked, the exact record and the office or capacity are written, and it is not paper-capable.
 *   PAPER   may be recorded for the person from their paper, judged on both people, and shown as not signed when it is.
 *   SIGNED_OR_PAPER  as SIGNED, and, only with `acts.recordOnBehalf`, the paper's reference and `paperSignatureRecording = ALLOWED`, from paper.
 */

type Kind = "OWN" | "SIGNED" | "PAPER" | "SIGNED_OR_PAPER";

const MUSTS: { must: string; slot: string; kind: Kind; note?: string }[] = [
  { must: "FR-REQ-003 endorsement by the named user", slot: "RequisitionEndorsement.person", kind: "PAPER", note: "the head's own sign-in, or their paper keyed by an officer who is not the requester (ruling 2b(a): ordinary acts need no signature)" },
  { must: "FR-EST-005 panel verifications are signed", slot: "SpecPanelVerification.person", kind: "SIGNED" },
  { must: "FR-MTD-011 the contract-type override is attributed", slot: "SourcingExercise.overriddenBy", kind: "OWN" },
  { must: "FR-DOC-011 the endorser is the actor", slot: "ClauseOverride.person", kind: "OWN" },
  { must: "FR-DOC-014 the assurance actor is the actor", slot: "PackAssurance.person", kind: "OWN" },
  { must: "FR-OPN-003 each authorising panel member re-authenticates", slot: "OpeningAuthorisation.person", kind: "SIGNED" },
  { must: "FR-EVL-001 each evaluator scores under their own identity", slot: "EvaluationScore.scoredBy", kind: "OWN" },
  { must: "FR-EVL-001 each side submits under its own identity", slot: "StageSubmission.submittedBy", kind: "OWN" },
  { must: "FR-APR-007 every approval step is attributed (and signed)", slot: "ApprovalStep.decidedBy", kind: "SIGNED_OR_PAPER" },
  { must: "FR-APR-009 a conflict declaration is signed", slot: "ApprovalStep.declaredBy", kind: "SIGNED" },
  { must: "FR-CTE-006 the tabler is the actor", slot: "CommitteeDecision.tabledBy", kind: "OWN" },
  { must: "FR-AWD-002 the signatory signs", slot: "Award.signatoryPerson", kind: "SIGNED_OR_PAPER" },
  { must: "FR-CON-009 the Contract Date is the employer's signature act", slot: "ContractSignature.person", kind: "SIGNED_OR_PAPER" },
  { must: "FR-CON-007 the employer's signature on an amendment", slot: "ReconciliationAmendment.officer", kind: "SIGNED_OR_PAPER" },
  { must: "FR-CRT-004 a certificate's signature block is signed", slot: "CertificateSignature.person", kind: "SIGNED_OR_PAPER" },
  { must: "FR-SUP-003 the S.O.'s decision on a programme is signed", slot: "WorkProgramme.decidedBy", kind: "SIGNED_OR_PAPER" },
];

describe("the module Musts of Phase 3d, as the acts that carry them are registered", () => {
  for (const m of MUSTS) {
    it(`${m.must}: ${m.slot} is ${m.kind}`, () => {
      const [entity, field] = m.slot.split(".");
      const slot = slotOf(entity, field);
      expect(slot, `${m.slot} is registered`).toBeDefined();
      const s = slot!;
      expect(s.signatureClass, "signature-class").toBe(m.kind === "SIGNED" || m.kind === "SIGNED_OR_PAPER");
      expect(s.onBehalf, "paper-capable").toBe(m.kind === "PAPER" || m.kind === "SIGNED_OR_PAPER");
      // A signature or an own act is refused to an administrator account, which keeps administration apart from transactions (NFR-SEC-004): none of these is an administrator's.
      expect(s.administratorMay, "an administrator's own act").toBeUndefined();
    });
  }

  it("lists each Must once", () => {
    const keys = MUSTS.map((m) => `${m.must}|${m.slot}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
