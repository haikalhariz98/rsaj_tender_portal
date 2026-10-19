import { describe, expect, it } from "vitest";

import { submitFaults } from "./appointment";
import { awardableStatus, awardOpenRefusal, exerciseOpenForAward, issueFaults, type IssueInput } from "./gate";
import { awardFindingText } from "./labels";

/**
 * X-9 (6.4, Q-2 A; tightened by 6.5, flagged): an exercise that assembles a tender or quotation
 * pack has its award opened, sent and issued only once it was advertised or invited, its window's
 * phase is CLOSED and no window change is pending (6.4 asked only for approval for tendering). One
 * prepared before document assembly (no pack-kind snapshot, demo_sx10–14), or with no pack, keeps
 * the Phase 1 path: in preparation. 6.7 replaces this interim gate.
 */

describe("the state an award needs, by the pack kind the exercise was prepared under", () => {
  it("Phase 1 exercises and those with no pack: documents in preparation, unchanged", () => {
    expect(awardableStatus(null)).toBe("DOCUMENTS_IN_PREPARATION");
    expect(awardableStatus("NONE")).toBe("DOCUMENTS_IN_PREPARATION");
    expect(exerciseOpenForAward("DOCUMENTS_IN_PREPARATION", null)).toBe(true);
    expect(exerciseOpenForAward("APPROVED_FOR_TENDERING", null)).toBe(false);
  });
  it.each(["TENDER", "QUOTATION"] as const)("%s: published with its window closed and no change pending, and nothing before it", (kind) => {
    const closed = { phase: "CLOSED" as const, changePending: false };
    expect(awardableStatus(kind)).toBe("WINDOW_CLOSED");
    // 6.5 (tightened, flagged): approved for tendering is no longer enough.
    expect(exerciseOpenForAward("APPROVED_FOR_TENDERING", kind)).toBe(false);
    expect(exerciseOpenForAward("APPROVED_FOR_TENDERING", kind, closed)).toBe(false);
    // 6.7 C-8 (flagged, stricter): published and closed is no longer enough; the main opening must be finalised (Opened).
    for (const s of ["OPENED"]) {
      expect(exerciseOpenForAward(s, kind, closed)).toBe(true);
      expect(exerciseOpenForAward(s, kind, { phase: "CLOSED_FOR_PURCHASE", changePending: false })).toBe(false);
      expect(exerciseOpenForAward(s, kind, { phase: "CLOSED", changePending: true })).toBe(false);
      // Not judged is not open.
      expect(exerciseOpenForAward(s, kind)).toBe(false);
    }
    for (const s of ["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "ADVERTISED", "INVITED", "OPENING_IN_PROGRESS", "CANCELLED"]) expect(exerciseOpenForAward(s, kind, closed)).toBe(false);
    expect(awardOpenRefusal(kind)).toMatch(/advertised or invited, or the invitation window is not closed/); // shortened by note 0005, founder 2026-10-19
    expect(awardOpenRefusal(kind, "ADVERTISED", { phase: "CLOSED", changePending: true })).toMatch(/invitation window change awaits approval/i); // shortened by note 0005, founder 2026-10-19
  });
});

describe("the gates read it", () => {
  const route = { ok: true as const, ruleKey: "k", ruleLabel: "l", clause: null, approverCode: "CEO", committeeCode: null, chain: [], warnings: [], source: "DAL" as const, overrideIssue: null, core: null } as unknown as Parameters<typeof submitFaults>[0]["route"];
  const sub = (exerciseStatus: string, exercisePackKind: "TENDER" | null) =>
    submitFaults({ opening: null, status: "DRAFT", today: "2026-10-01", exerciseStatus, exercisePackKind, openRoute: false, method: null, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route }).map((f) => f.code);

  it("sending the appointment for approval: a tender exercise not yet closed is refused, naming the window", () => {
    expect(sub("DOCUMENTS_IN_PREPARATION", "TENDER")).toContain("EXERCISE_WINDOW_NOT_CLOSED");
    // 6.5 (tightened, flagged): approved for tendering is refused too, until the window closes.
    expect(sub("APPROVED_FOR_TENDERING", "TENDER")).toContain("EXERCISE_WINDOW_NOT_CLOSED");
    // 6.7 C-8 (flagged, stricter): clear only once Opened; published and closed is refused, naming the opening.
    expect(submitFaults({ opening: null, status: "DRAFT", today: "2026-10-01", exerciseStatus: "OPENED", exercisePackKind: "TENDER", exerciseWindow: { phase: "CLOSED", changePending: false }, openRoute: false, method: null, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route }).map((f) => f.code)).toEqual([]);
    expect(submitFaults({ opening: null, status: "DRAFT", today: "2026-10-01", exerciseStatus: "ADVERTISED", exercisePackKind: "TENDER", exerciseWindow: { phase: "CLOSED", changePending: false }, openRoute: false, method: null, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route }).map((f) => f.code)).toEqual(["EXERCISE_NOT_OPENED"]);
    expect(submitFaults({ opening: null, status: "DRAFT", today: "2026-10-01", exerciseStatus: "ADVERTISED", exercisePackKind: "TENDER", exerciseWindow: { phase: "CLOSED", changePending: true }, openRoute: false, method: null, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route }).map((f) => f.code)).toEqual(["WINDOW_CHANGE_PENDING"]);
    expect(awardFindingText({ code: "EXERCISE_WINDOW_NOT_CLOSED", level: "block" })).toMatch(/invitation window must close/i); // wording shortened by note 0005, founder 2026-10-19; the meaning pinned is unchanged
    expect(sub("DOCUMENTS_IN_PREPARATION", null)).not.toContain("EXERCISE_NOT_IN_PREPARATION");
    expect(awardFindingText({ code: "EXERCISE_NOT_APPROVED_FOR_TENDERING", level: "block" })).toMatch(/approved for tendering/);
  });

  it("issuing: the same rule, worded by what it needs", () => {
    const base = { status: "APPROVED", today: "2026-10-01", exerciseStatus: "DOCUMENTS_IN_PREPARATION", exercisePackKind: "TENDER" } as unknown as IssueInput;
    const f = issueFaults({ ...base, commitment: null, sourcingPermitted: true, instrument: { kind: "LETTER_OF_ACCEPTANCE" }, valueFaults: [], dossierFaults: [], appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [] }, signatory: { ok: false, fault: "SIGNATORY_UNRESOLVED" }, indent: null, distribution: { rows: [{}] }, documents: [], variant: null, terms: null, bond: { required: false, reason: "", basis: { state: "NOT_REQUIRED" } } as never, contractNumber: { source: "SERIES", seriesKey: "c" }, startDate: null, wc: { required: false, basis: null } }).find((x) => x.code === "EXERCISE_NOT_OPEN");
    expect(f?.data?.needs).toBe("WINDOW_CLOSED");
    expect(awardFindingText(f!)).toMatch(/invitation window not closed/i); // wording shortened by note 0005, founder 2026-10-19; the meaning pinned is unchanged
    expect(awardFindingText({ code: "EXERCISE_NOT_OPEN", level: "block", data: { needs: "DOCUMENTS_IN_PREPARATION" } })).toBe("The exercise is no longer in preparation.");
  });
});
