import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import type { VariationFacts } from "./application";
import { addMonths, clockReading, consentFaults, dueOn, instructionFaults, instructionIssueFaults, oralLoopFaults, type InstructionInput } from "./instruction";

/** The S.O.'s instruction and the oral loop (FR-VAR-009, 015, 016; OD-A5). Invented fixtures. */

const v = (x: Partial<VariationFacts> = {}): VariationFacts => ({ id: "v1", status: "SUPPORTED", exemption: null, estimate: parseSen("90000.00"), soDecision: "SUPPORTED", soDecisionCap: null, routes: [{ id: "r", event: "PRIOR", status: "APPROVED", value: parseSen("90000.00"), applied: null, choices: [], openedOn: "2026-05-01", sentAt: "2026-05-01T01:00:00.000Z" }], instructions: [], orders: [], commencedOn: null, ...x });
const i = (x: Partial<InstructionInput> = {}): InstructionInput => ({ v: v(), funderConsentRequired: false, consent: "NONE", agreedRateExists: false, scheduleForm: "MEASURED", description: "Additional valve chamber at CH 1+200", oralIssuedOn: null, today: "2026-06-01", ...x });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("FR-VAR-015: not before approval", () => {
  it("an approved variation, or an exempt one", () => {
    expect(instructionFaults(i())).toEqual([]);
    expect(codes(instructionFaults(i({ v: v({ routes: [] }) })))).toEqual(["NOT_APPROVED"]);
    expect(instructionFaults(i({ v: v({ routes: [], exemption: "PC_SUM", soDecision: null }) }))).toEqual([]);
    expect(codes(instructionFaults(i({ v: v({ instructions: [{ id: "x", certificateStatus: "SIGNING" }] }) })))).toEqual(["INSTRUCTION_EXISTS"]);
    expect(codes(instructionFaults(i({ v: v({ status: "CLOSED" }) })))).toEqual(["NOT_SUPPORTED_YET"]);
  });
  it("its issue re-checks the same under the lock", () => {
    expect(codes(instructionIssueFaults({ v: v({ routes: [] }), funderConsentRequired: false, consent: "NONE" }))).toEqual(["NOT_APPROVED"]);
    expect(instructionIssueFaults({ v: v(), funderConsentRequired: true, consent: "CARRIED" })).toEqual([]);
  });
});

describe("FR-VAR-009: a funder's consent, from a quorate committee's decision", () => {
  it("required and not carried refuses; the answer itself is required", () => {
    for (const c of ["NONE", "PENDING", "NOT_CARRIED"] as const) expect(codes(consentFaults(true, c))).toEqual(["FUNDER_CONSENT_MISSING"]);
    expect(consentFaults(true, "CARRIED")).toEqual([]);
    expect(consentFaults(false, "NONE")).toEqual([]);
    expect(codes(consentFaults(null, "NONE"))).toEqual(["FIELD_REQUIRED"]);
  });
});

describe("OD-A5: the schedule form, unset blocks", () => {
  it("the agreed-rate test answered, and the form set for its branch", () => {
    expect(codes(instructionFaults(i({ scheduleForm: null })))).toEqual(["SCHEDULE_FORM_NOT_SET"]);
    expect(codes(instructionFaults(i({ agreedRateExists: null })))).toEqual(["FIELD_REQUIRED"]);
  });
});

describe("FR-VAR-016: the oral loop and its two clocks", () => {
  it("clocks run from the day given, calendar days, weeks as seven, whole months (a shorter month's last day)", () => {
    expect(dueOn("2026-05-01", { length: 7, unit: "DAYS" })).toBe("2026-05-08");
    expect(dueOn("2026-05-01", { length: 2, unit: "WEEKS" })).toBe("2026-05-15");
    expect(dueOn("2026-01-31", { length: 1, unit: "MONTHS" })).toBe("2026-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(dueOn("2026-05-01", null)).toBeNull();
    expect(dueOn(null, { length: 7, unit: "DAYS" })).toBeNull();
  });
  it("the reading: not set, open, met on time or late", () => {
    expect(clockReading(null, null)).toEqual({ state: "NOT_SET" });
    expect(clockReading("2026-05-08", null)).toEqual({ state: "OPEN", due: "2026-05-08" });
    expect(clockReading("2026-05-08", "2026-05-08")).toMatchObject({ state: "MET", late: false });
    expect(clockReading("2026-05-08", "2026-05-09")).toMatchObject({ state: "MET", late: true });
  });
  it("the days in order; an objection only on a mismatch, with its words", () => {
    const o = { issuedOn: "2026-05-03", oralIssuedOn: "2026-05-01", contractorConfirmedOn: "2026-05-04", confirmationMatches: false, objectedOn: "2026-05-06", objectionNote: "Not as intended", today: "2026-05-07" };
    expect(oralLoopFaults(o)).toEqual([]);
    expect(codes(oralLoopFaults({ ...o, confirmationMatches: true }))).toEqual(["OBJECTION_ONLY_ON_MISMATCH"]);
    expect(codes(oralLoopFaults({ ...o, objectedOn: "2026-05-03" }))).toEqual(["OBJECTION_BEFORE_CONFIRMATION"]);
    expect(codes(oralLoopFaults({ ...o, oralIssuedOn: null }))).toEqual(["NOT_ORAL"]);
    expect(codes(oralLoopFaults({ ...o, contractorConfirmedOn: "2026-04-30", objectedOn: null }))).toEqual(["CONFIRMED_BEFORE_ORAL"]);
    expect(codes(oralLoopFaults({ ...o, objectedOn: "2026-05-08" }))).toEqual(["FUTURE_DATE"]);
  });
});
