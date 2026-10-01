import { describe, expect, it } from "vitest";

import { submitFaults } from "./appointment";
import { awardableStatus, awardOpenRefusal, exerciseOpenForAward, issueFaults, type IssueInput } from "./gate";
import { awardFindingText } from "./labels";

/**
 * X-9 (6.4, Q-2 A): an exercise that assembles a tender or quotation pack has its award
 * opened, sent and issued only once its documents are approved for tendering. One
 * prepared before document assembly (no pack-kind snapshot, demo_sx10–14), or with no
 * pack, keeps the Phase 1 path: in preparation. 6.5 replaces this with the window.
 */

describe("the state an award needs, by the pack kind the exercise was prepared under", () => {
  it("Phase 1 exercises and those with no pack: documents in preparation, unchanged", () => {
    expect(awardableStatus(null)).toBe("DOCUMENTS_IN_PREPARATION");
    expect(awardableStatus("NONE")).toBe("DOCUMENTS_IN_PREPARATION");
    expect(exerciseOpenForAward("DOCUMENTS_IN_PREPARATION", null)).toBe(true);
    expect(exerciseOpenForAward("APPROVED_FOR_TENDERING", null)).toBe(false);
  });
  it.each(["TENDER", "QUOTATION"] as const)("%s: approved for tendering, and nothing before it", (kind) => {
    expect(awardableStatus(kind)).toBe("APPROVED_FOR_TENDERING");
    expect(exerciseOpenForAward("APPROVED_FOR_TENDERING", kind)).toBe(true);
    for (const s of ["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "CANCELLED"]) expect(exerciseOpenForAward(s, kind)).toBe(false);
    expect(awardOpenRefusal(kind)).toMatch(/approved for tendering/);
  });
});

describe("the gates read it", () => {
  const route = { ok: true as const, ruleKey: "k", ruleLabel: "l", clause: null, approverCode: "CEO", committeeCode: null, chain: [], warnings: [], source: "DAL" as const, overrideIssue: null, core: null } as unknown as Parameters<typeof submitFaults>[0]["route"];
  const sub = (exerciseStatus: string, exercisePackKind: "TENDER" | null) =>
    submitFaults({ status: "DRAFT", today: "2026-10-01", exerciseStatus, exercisePackKind, openRoute: false, method: null, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route }).map((f) => f.code);

  it("sending the appointment for approval: a tender exercise in preparation is refused, naming the documents", () => {
    expect(sub("DOCUMENTS_IN_PREPARATION", "TENDER")).toContain("EXERCISE_NOT_APPROVED_FOR_TENDERING");
    expect(sub("APPROVED_FOR_TENDERING", "TENDER")).not.toContain("EXERCISE_NOT_APPROVED_FOR_TENDERING");
    expect(sub("DOCUMENTS_IN_PREPARATION", null)).not.toContain("EXERCISE_NOT_IN_PREPARATION");
    expect(awardFindingText({ code: "EXERCISE_NOT_APPROVED_FOR_TENDERING", level: "block" })).toMatch(/approved for tendering/);
  });

  it("issuing: the same rule, worded by what it needs", () => {
    const base = { status: "APPROVED", today: "2026-10-01", exerciseStatus: "DOCUMENTS_IN_PREPARATION", exercisePackKind: "TENDER" } as unknown as IssueInput;
    const f = issueFaults({ ...base, commitment: null, sourcingPermitted: true, instrument: { kind: "LETTER_OF_ACCEPTANCE" }, valueFaults: [], dossierFaults: [], appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [] }, signatory: { ok: false, fault: "SIGNATORY_UNRESOLVED" }, indent: null, distribution: { rows: [{}] }, documents: [], variant: null, terms: null, bond: { required: false, reason: "", basis: { state: "NOT_REQUIRED" } } as never, contractNumber: { source: "SERIES", seriesKey: "c" }, startDate: null, wc: { required: false, basis: null } }).find((x) => x.code === "EXERCISE_NOT_OPEN");
    expect(f?.data?.needs).toBe("APPROVED_FOR_TENDERING");
    expect(awardFindingText(f!)).toMatch(/not approved for tendering/);
    expect(awardFindingText({ code: "EXERCISE_NOT_OPEN", level: "block", data: { needs: "DOCUMENTS_IN_PREPARATION" } })).toBe("The exercise is no longer in preparation.");
  });
});
