import { describe, expect, it } from "vitest";

import { decisionRecord, type DecisionRecordInput } from "@/lib/committee/record";

import { committeeStepFrom } from "./committee-step";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const input = (over: Partial<DecisionRecordInput["decision"]> = {}): DecisionRecordInput => ({
  meeting: { reference: "SIT/1", meetingDate: d("2026-08-20"), committeeName: "Board" },
  decision: {
    subject: "Over-budget requisition", matterRef: "REQ/1", outcome: "CARRIED", decisionDate: d("2026-08-20"),
    quorumRequired: 2, presentVoters: 2, recusedCount: 0, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
    outcomeNote: "", notApprovedOutcomeNameEn: null, notApprovedOutcomeKind: null, ...over,
  },
  votes: [],
});

describe("a committee step, from decisionRecord() only (FR-REQ-012)", () => {
  it("stays pending while the matter is undecided or deferred", () => {
    expect(committeeStepFrom(decisionRecord(input({ outcome: "PENDING" }))).decision).toBe("PENDING");
    expect(committeeStepFrom(decisionRecord(input({ outcome: "DEFERRED" }))).decision).toBe("PENDING");
    expect(committeeStepFrom(null).decision).toBe("PENDING");
  });

  it("is done on the decision date when carried, citing the sitting", () => {
    const s = committeeStepFrom(decisionRecord(input()));
    expect(s).toMatchObject({ decision: "DONE", decidedOn: d("2026-08-20"), citation: { meetingReference: "SIT/1", committee: "Board" } });
  });

  it("rejects and loops back to Draft on a looping not-approved outcome", () => {
    const s = committeeStepFrom(decisionRecord(input({ outcome: "NOT_CARRIED", notApprovedOutcomeNameEn: "Revise", notApprovedOutcomeKind: "LOOP" })));
    expect(s).toMatchObject({ decision: "REJECTED", requisitionGoesTo: "DRAFT" });
  });

  it("rejects and closes on a terminal one", () => {
    const s = committeeStepFrom(decisionRecord(input({ outcome: "NOT_CARRIED", notApprovedOutcomeNameEn: "Refused", notApprovedOutcomeKind: "TERMINAL" })));
    expect(s).toMatchObject({ decision: "REJECTED", requisitionGoesTo: "CLOSED" });
  });
});
