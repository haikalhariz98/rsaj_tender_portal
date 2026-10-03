import { describe, expect, it } from "vitest";

import { dayPlus } from "@/lib/dates";
import { parseSen } from "@/lib/money";

import { decisionFaults, postFaults, responseDue, warningFaults, type DecisionInput } from "./non-completion";

/// FR-LAD-001, 003–006; OD-A1 A as ruled. FIXTURE days and figures.
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const PACK = (["STUDY", "PROGRESS", "EMPLOYER_DELAY", "PAYMENTS"] as const).map((item) => ({ item, text: `${item} written (demo)`, notRequired: false }));

describe("the warning letter (FR-LAD-003)", () => {
  const ok = { dateForCompletion: "2026-06-30", rate: parseSen("269.38"), eotClause: "Clause 43", ladClause: "Clause 40", extendedCompletion: "2026-06-30", liveWarning: false, formSet: true };
  it("carries the clauses, the extended date and the baseline's rate", () => {
    expect(codes(warningFaults(ok))).toEqual([]);
    expect(codes(warningFaults({ ...ok, rate: null, eotClause: "", ladClause: " ", extendedCompletion: null, formSet: false }))).toEqual(["LAD_RATE_NOT_SET", "CLAUSE_REQUIRED", "CLAUSE_REQUIRED", "EXTENDED_COMPLETION_REQUIRED", "FORM_NOT_SET"]);
    expect(codes(warningFaults({ ...ok, extendedCompletion: "2026-06-29" }))).toEqual(["EXTENDED_BEFORE_COMPLETION"]);
  });
  it("by registered post, with its consignment reference, once, after it is issued", () => {
    expect(codes(postFaults({ letterIssued: true, already: false, ref: "RR123456789MY", postedOn: "2026-07-02", issuedOn: "2026-07-01", today: "2026-07-03" }))).toEqual([]);
    expect(codes(postFaults({ letterIssued: false, already: true, ref: "", postedOn: "2026-06-30", issuedOn: "2026-07-01", today: "2026-07-03" }))).toEqual(["WARNING_NOT_ISSUED", "POST_ALREADY_RECORDED", "CONSIGNMENT_REQUIRED", "POSTED_BEFORE_ISSUE"]);
  });
  it("the response window from the organisation's clock (7 days is the fixture); unset reads not set (advisory)", () => {
    expect(responseDue("2026-07-02", { length: 7, unit: "DAYS" }, (d) => d, dayPlus)).toBe("2026-07-09");
    expect(responseDue("2026-07-02", { length: 1, unit: "WEEKS" }, (d) => d, dayPlus)).toBe("2026-07-09");
    expect(responseDue("2026-07-02", null, (d) => d, dayPlus)).toBeNull();
  });
});

describe("the non-completion decision (FR-LAD-001, 004, 005)", () => {
  const ok: DecisionInput = {
    outcome: "LAD_APPLIES",
    reason: "The causes of delay give no ground for an extension",
    dateForCompletion: "2026-06-30",
    today: "2026-07-15",
    scope: "WHOLE",
    section: null,
    wholeRate: parseSen("269.38"),
    warning: { issued: true, posted: true },
    eotClause: "Clause 43",
    ladClause: "Clause 40",
    insuranceExpiry: "2026-12-31",
    expectedCompletion: "2026-09-30",
    windowFrom: "2026-07-01",
    windowUntil: null,
    pack: PACK,
    formSet: true,
  };
  it("only once the date for completion has passed", () => {
    expect(codes(decisionFaults(ok))).toEqual([]);
    expect(codes(decisionFaults({ ...ok, today: "2026-06-30" }))).toEqual(["NOT_PAST_COMPLETION"]);
  });
  it("excusable or pending needs only its reasons", () => {
    expect(codes(decisionFaults({ ...ok, outcome: "EXCUSED_OR_PENDING", warning: null, scope: null, insuranceExpiry: null, pack: [] }))).toEqual([]);
    expect(codes(decisionFaults({ ...ok, outcome: "EXCUSED_OR_PENDING", reason: "" }))).toEqual(["DECISION_REASON_REQUIRED"]);
  });
  it("damages need the warning sent first (FR-LAD-003 before imposition)", () => {
    expect(codes(decisionFaults({ ...ok, warning: { issued: true, posted: false } }))).toEqual(["WARNING_NOT_SENT"]);
  });
  it("the certificate cannot go without the insurance expiry, and cover extended to the expected completion", () => {
    expect(codes(decisionFaults({ ...ok, insuranceExpiry: null }))).toEqual(["INSURANCE_EXPIRY_REQUIRED"]);
    expect(codes(decisionFaults({ ...ok, insuranceExpiry: "2026-09-29" }))).toEqual(["INSURANCE_NOT_EXTENDED"]);
    expect(codes(decisionFaults({ ...ok, insuranceExpiry: "2026-09-30" }))).toEqual([]);
  });
  it("the four pack items each answered, or not required with its recorded reason", () => {
    expect(codes(decisionFaults({ ...ok, pack: PACK.slice(1) }))).toEqual(["PACK_ITEM_REQUIRED"]);
    expect(codes(decisionFaults({ ...ok, pack: [...PACK.slice(1), { item: "STUDY", text: "", notRequired: true }] }))).toEqual(["PACK_NOT_REQUIRED_REASON"]);
    expect(codes(decisionFaults({ ...ok, pack: [...PACK.slice(1), { item: "STUDY", text: "Studied at the special meeting", notRequired: true }] }))).toEqual([]);
  });
  it("the window starts after the date for completion; a section needs its own rate", () => {
    expect(codes(decisionFaults({ ...ok, windowFrom: "2026-06-30" }))).toEqual(["WINDOW_BEFORE_COMPLETION"]);
    expect(codes(decisionFaults({ ...ok, windowUntil: "2026-07-01" }))).toEqual(["WINDOW_ENDS_BEFORE_START"]);
    expect(codes(decisionFaults({ ...ok, scope: "SECTION", section: { known: true, rate: null } }))).toEqual(["LAD_RATE_NOT_SET"]);
    expect(codes(decisionFaults({ ...ok, scope: "SECTION", section: null }))).toEqual(["SECTION_REQUIRED", "LAD_RATE_NOT_SET"]);
  });
});
