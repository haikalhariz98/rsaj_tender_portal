import { describe, expect, it } from "vitest";

import { SPEC_METHODS } from "@/lib/method/fixture";
import { parseSen } from "@/lib/money";
import type { Holders } from "@/lib/requisition/holders";

import { absentFrom, absentOffices, appointmentRoute, submitFaults } from "./appointment";
import { exerciseCitationFault } from "./citation";
import { AWARD_MATRIX, AWARD_MATRIX_GTE } from "./fixture";
import { awardValueFaults, instrumentFor } from "./instrument";
import { approvedOnOf, resolveSignatory, checkSignatory } from "./signatory";
import { awardTransition, cancellable, exerciseCancelBlockedBy, isLiveAward, LIVE_STATUSES } from "./status";
import { instrumentReturned } from "./stage-two";
import { regimeFor } from "@/lib/authority/resolve";

const RM = parseSen;
const POLICY = { tenderInstrument: "LETTER_OF_ACCEPTANCE", quotationInstrument: "WORK_INDENT" } as const;

describe("the instrument follows the exercise's regime (spec §6.11)", () => {
  it("RM300,000.00 on the boundary: GT puts it in quotation, an indent; GTE in tender, a Letter of Acceptance", () => {
    expect(instrumentFor(regimeFor(300_000, AWARD_MATRIX.policy), POLICY)).toEqual({ kind: "WORK_INDENT" });
    expect(instrumentFor(regimeFor(300_000, AWARD_MATRIX_GTE.policy), POLICY)).toEqual({ kind: "LETTER_OF_ACCEPTANCE" });
  });
  it("an RM180,000 quotation exercise is awarded by indent", () => {
    expect(instrumentFor("quotation", POLICY)).toEqual({ kind: "WORK_INDENT" });
  });
  it("an unset regime policy refuses, and below the quotation floor there is no award instrument here", () => {
    expect(instrumentFor("tender", { tenderInstrument: null, quotationInstrument: null })).toEqual({ fault: "INSTRUMENT_NOT_SET", regime: "tender" });
    expect(instrumentFor("below", POLICY)).toEqual({ fault: "NO_AWARD_IN_REGIME", regime: "below" });
  });
});

describe("the awarded value (6.11 ruling)", () => {
  const base = { value: RM("300000"), estimate: RM("300000"), exerciseRegime: "quotation", exerciseRuleKey: "APP_QUOTATION", exerciseRuleLabel: "Quotation", freshRegime: "quotation", freshRuleKey: "APP_QUOTATION", freshRuleLabel: "Quotation", approvedValue: RM("330000") as bigint | null, otherAwards: [] as bigint[] };
  const codes = (x: Partial<typeof base>) => awardValueFaults({ ...base, ...x }).map((f) => f.code);
  it("passes within the approval and the exercise's bands", () => expect(codes({})).toEqual([]));
  it("the requisition's awards together may not exceed its approved value", () => {
    expect(codes({ otherAwards: [RM("30000.01")] })).toEqual(["EXCEEDS_APPROVED_VALUE"]);
    expect(codes({ otherAwards: [RM("30000")] })).toEqual([]);
  });
  it("RM310,000 on a quotation exercise is outside its regime, refused until reclassified", () => {
    expect(codes({ value: RM("310000"), freshRegime: "tender", freshRuleKey: "APP_TENDER" })).toContain("VALUE_OUTSIDE_EXERCISE_REGIME");
  });
  it("a value another appointment rule would approve is refused", () => {
    expect(codes({ freshRuleKey: "OTHER" })).toEqual(["APPOINTMENT_BAND_CHANGED"]);
  });
  it("above the estimate within the approval warns, and says the difference is not posted", () => {
    const f = awardValueFaults({ ...base, value: RM("320000"), estimate: RM("300000") });
    expect(f).toEqual([{ code: "ABOVE_ESTIMATE", level: "warn", data: { estimate: "RM300,000", difference: "RM20,000" } }]);
  });
  it("no approved route on the requisition refuses", () => expect(codes({ approvedValue: null })).toEqual(["NO_APPROVED_ROUTE"]));
});

describe("the signatory (FR-AWD-002, DAL §3.1.4.4 item 5)", () => {
  const sign = (value: number, kind: "LETTER_OF_ACCEPTANCE" | "WORK_INDENT", m = AWARD_MATRIX) => {
    const s = resolveSignatory(m, { kind, value });
    return s.ok ? s.roleCode : s.fault;
  };
  it("RM2.1 million presents the Functional Director as the only valid signatory", () => {
    expect(sign(2_100_000, "LETTER_OF_ACCEPTANCE")).toBe("FD");
  });
  it("the three bands, with Contract & Procurement recommending in all three", () => {
    expect(sign(300_000.01, "LETTER_OF_ACCEPTANCE")).toBe("HODIV");
    expect(sign(1_000_000, "LETTER_OF_ACCEPTANCE")).toBe("HODIV");
    expect(sign(1_000_000.01, "LETTER_OF_ACCEPTANCE")).toBe("FD");
    expect(sign(3_000_000.01, "LETTER_OF_ACCEPTANCE")).toBe("CEO");
    for (const v of [500_000, 2_000_000, 4_000_000]) {
      const s = resolveSignatory(AWARD_MATRIX, { kind: "LETTER_OF_ACCEPTANCE", value: v });
      expect(s.ok && s.recommenders.map((r) => [r.roleCode, r.act])).toEqual([["CP", "R"]]);
    }
  });
  it("RM300,000.00 under both boundary settings: inclusive, an indent signed by the head of department; exclusive, a Letter of Acceptance signed by the head of division", () => {
    const low = instrumentFor(regimeFor(300_000, AWARD_MATRIX.policy), POLICY);
    expect(low).toEqual({ kind: "WORK_INDENT" });
    expect(sign(300_000, "WORK_INDENT")).toBe("HOD");
    // No Letter of Acceptance signatory is asked on the indent route.
    expect(sign(300_000, "LETTER_OF_ACCEPTANCE")).toBe("SIGNATORY_UNRESOLVED");
    const high = instrumentFor(regimeFor(300_000, AWARD_MATRIX_GTE.policy), POLICY);
    expect(high).toEqual({ kind: "LETTER_OF_ACCEPTANCE" });
    expect(sign(300_000, "LETTER_OF_ACCEPTANCE", AWARD_MATRIX_GTE)).toBe("HODIV");
  });
  it("no row refuses: the engine's upward reversion is not applied to a signatory", () => {
    expect(sign(10_000, "WORK_INDENT")).toBe("SIGNATORY_UNRESOLVED");
  });
  it("two rows equally matching refuse as ambiguous", () => {
    const m = { ...AWARD_MATRIX, rules: [...AWARD_MATRIX.rules, { ...AWARD_MATRIX.rules.find((r) => r.ruleKey === "SIG_LOA_3M")!, ruleKey: "SIG_DUP", approverCode: "CEO" }] };
    expect(sign(2_100_000, "LETTER_OF_ACCEPTANCE", m)).toBe("SIGNATORY_AMBIGUOUS");
  });
  it("a row recorded as a known gap refuses: a signatory is never an assumption", () => {
    const m = { ...AWARD_MATRIX, rules: AWARD_MATRIX.rules.map((r) => (r.ruleKey === "SIG_LOA_3M" ? { ...r, isGap: true } : r)) };
    expect(sign(2_100_000, "LETTER_OF_ACCEPTANCE", m)).toBe("SIGNATORY_GAP");
  });
  it("an edge on the boundary nobody has decided refuses", () => {
    const m = { ...AWARD_MATRIX, rules: AWARD_MATRIX.rules.map((r) => (r.ruleKey === "SIG_INDENT" ? { ...r, followsBoundarySwitch: null } : r)) };
    expect(sign(300_000, "WORK_INDENT", m)).toBe("SIGNATORY_BOUNDARY_UNDECIDED");
  });
  it("a general signatory row, naming no instrument, is not used for either instrument, and says what to configure", () => {
    const general = { ...AWARD_MATRIX.rules.find((r) => r.ruleKey === "SIG_INDENT")!, ruleKey: "SIG_GENERAL", cond: null, minValue: null, maxValue: null };
    const m = { ...AWARD_MATRIX, rules: [...AWARD_MATRIX.rules.filter((r) => r.domain !== "award_signatory"), general] };
    expect(sign(200_000, "WORK_INDENT", m)).toBe("SIGNATORY_NOT_FOR_INSTRUMENT");
    expect(sign(2_100_000, "LETTER_OF_ACCEPTANCE", m)).toBe("SIGNATORY_NOT_FOR_INSTRUMENT");
  });
  it("delegable as the engine reads it: a mandatory approval or a mandatory recommendation is not delegated", () => {
    const with_ = (x: object) => ({ ...AWARD_MATRIX, rules: AWARD_MATRIX.rules.map((r) => (r.ruleKey === "SIG_INDENT" ? { ...r, ...x } : r)) });
    const d = (m: typeof AWARD_MATRIX) => { const s = resolveSignatory(m, { kind: "WORK_INDENT", value: 200_000 }); return s.ok && s.delegable; };
    expect(d(AWARD_MATRIX)).toBe(true);
    expect(d(with_({ approverMandatory: true }))).toBe(false);
    expect(d(with_({ recommenders: [{ roleCode: "CP", act: "MR" }] }))).toBe(false);
    expect(d(with_({ nonDelegable: true }))).toBe(false);
  });

  const holders = (ids: string[], delegates: { personId: string; ceiling?: string | null }[] = []): Holders => ({
    scope: null,
    holderIds: ids,
    delegates: delegates.map((d) => ({ personId: d.personId, delegation: { id: `dg_${d.personId}`, valueCeiling: d.ceiling ?? null } as never })),
  });
  const ctx = { today: "2026-09-30", signedOn: "2026-09-30", approvedOn: "2026-09-20", value: RM("2100000") };
  it("a CEO or head of department signing an RM2.1 million letter is refused; the Functional Director's holder is accepted", () => {
    const fd = holders(["p_fd"]);
    expect(checkSignatory({ delegable: false }, { id: "p_ceo", isActive: true }, fd, ctx).faults).toEqual(["NOT_HOLDER"]);
    expect(checkSignatory({ delegable: false }, { id: "p_hod", isActive: true }, fd, ctx).faults).toEqual(["NOT_HOLDER"]);
    expect(checkSignatory({ delegable: false }, { id: "p_fd", isActive: true }, fd, ctx)).toEqual({ faults: [], delegationId: null });
  });
  it("a delegate signs only where the rule is delegable, within the ceiling", () => {
    const h = holders(["p_fd"], [{ personId: "p_dep", ceiling: "1000000" }]);
    expect(checkSignatory({ delegable: false }, { id: "p_dep", isActive: true }, h, ctx).faults).toEqual(["DELEGATION_NOT_PERMITTED"]);
    expect(checkSignatory({ delegable: true }, { id: "p_dep", isActive: true }, h, ctx).faults).toEqual(["OVER_CEILING"]);
  });
  it("a holder who has left is refused", () => {
    expect(checkSignatory({ delegable: false }, { id: "p_fd", isActive: false }, holders(["p_fd"]), ctx).faults).toEqual(["INACTIVE"]);
  });
  it("the approval's day is the latest day a step was decided, as the organisation reckons it — not the route's UTC closing time", () => {
    const steps = [{ decision: "DONE", decidedOn: new Date("2026-09-18T00:00:00Z") }, { decision: "DONE", decidedOn: new Date("2026-09-20T00:00:00Z") }];
    expect(approvedOnOf({ status: "APPROVED", steps })).toBe("2026-09-20");
    expect(approvedOnOf({ status: "PENDING", steps })).toBeNull();
    expect(approvedOnOf(null)).toBeNull();
  });
  it("never after today, never before the approval", () => {
    expect(checkSignatory({ delegable: false }, { id: "p_fd", isActive: true }, holders(["p_fd"]), { ...ctx, signedOn: "2026-10-01" }).faults).toEqual(["FUTURE_DATE"]);
    expect(checkSignatory({ delegable: false }, { id: "p_fd", isActive: true }, holders(["p_fd"]), { ...ctx, signedOn: "2026-09-19" }).faults).toEqual(["BEFORE_APPROVAL"]);
  });
});

describe("the appointment route at award (6.3 BD-3, FR-APR-010)", () => {
  const ctx = { dal: AWARD_MATRIX, override: null, supersedes: false };
  const quotation = SPEC_METHODS.find((m) => m.code === "open_quotation")!;
  const tender = SPEC_METHODS.find((m) => m.code === "open_tender")!;
  const nobody = { absentRoleCodes: [], requesterHolds: () => false };
  it("re-resolves for the awarded value: a quotation routes to the committee, then the Chief Executive", () => {
    const r = appointmentRoute(ctx, quotation, 180_000, nobody);
    expect(r.ok && r.chain.map((s) => [s.roleCode, s.act, s.committeeCode ?? null])).toEqual([["QC", "MR", "QC"], ["CEO", "A", null]]);
  });
  it("a tender routes to the Tender Board, as a committee step", () => {
    const r = appointmentRoute(ctx, tender, 2_100_000, nobody);
    expect(r.ok && r.chain.map((s) => [s.roleCode, s.act, s.committeeCode ?? null])).toEqual([["TBC", "A", "TBC"]]);
  });
  it("no rule at the value is refused, never routed round", () => {
    expect(appointmentRoute(ctx, tender, 100_000, nobody)).toMatchObject({ ok: false, fault: "NO_RULE" });
  });
  it("a method with no approval key, or no method, is refused", () => {
    expect(appointmentRoute(ctx, SPEC_METHODS.find((m) => m.code === "call_off")!, 100_000, nobody)).toMatchObject({ ok: false, fault: "NO_METHOD_KEY" });
    expect(appointmentRoute(ctx, null, 100_000, nobody)).toMatchObject({ ok: false, fault: "DEPENDS_ON_METHOD" });
  });
  it("an absent approver with nowhere to escalate is refused, saying so", () => {
    const r = appointmentRoute(ctx, quotation, 180_000, { absentRoleCodes: ["CEO"], requesterHolds: () => false });
    expect(r).toMatchObject({ ok: false, fault: "ROUTE_ERROR" });
  });
  it("an absent approver escalates upward where the office names where", () => {
    const m = { ...AWARD_MATRIX, roles: { ...AWARD_MATRIX.roles, CEO: { ...AWARD_MATRIX.roles.CEO, escalatesToCode: "CHAIR" } } };
    const r = appointmentRoute({ ...ctx, dal: m }, quotation, 180_000, { absentRoleCodes: ["CEO"], requesterHolds: () => false });
    expect(r.ok && r.approverCode).toBe("CHAIR");
    expect(r.ok && r.warnings.some((w) => w.code === "ABSENCE")).toBe(true);
    // BD-2: the screen names the office treated as absent, from the route's warnings.
    expect(r.ok && absentFrom(r.warnings)).toEqual(["CEO"]);
    expect(absentFrom(null)).toEqual([]);
    // Only an ABSENCE warning names an absent office; another warning's "from" does not.
    expect(absentFrom([{ code: "SELF_APPROVAL", from: "CEO" }, { code: "ABSENCE", from: "FD" }, { code: "ABSENCE", from: "FD" }])).toEqual(["FD"]);
  });
  it("the requester holding the approving office escalates it, or is refused with nowhere to go", () => {
    expect(appointmentRoute(ctx, quotation, 180_000, { absentRoleCodes: [], requesterHolds: (c) => c === "CEO" })).toMatchObject({ ok: false, fault: "ROUTE_ERROR" });
    const m = { ...AWARD_MATRIX, roles: { ...AWARD_MATRIX.roles, CEO: { ...AWARD_MATRIX.roles.CEO, selfApprovalEscalatesToCode: "CHAIR" } } };
    const r = appointmentRoute({ ...ctx, dal: m }, quotation, 180_000, { absentRoleCodes: [], requesterHolds: (c) => c === "CEO" });
    expect(r.ok && r.approverCode).toBe("CHAIR");
  });
  it("an office is absent only when every holder and delegate is away; a vacant one is not absent", () => {
    const holders = (c: string) => ({ CEO: { holderIds: ["p1"], delegates: [] }, FD: { holderIds: ["p2"], delegates: [{ personId: "p3" }] }, HOD: { holderIds: [], delegates: [] } })[c as "CEO"];
    expect(absentOffices(["CEO", "FD", "HOD"], holders, (p) => p === "p3")).toEqual(["CEO"]);
  });
  it("a dossier method cannot be submitted while its evidence cannot be attached (FR-MTD-009)", () => {
    const r = appointmentRoute(ctx, quotation, 180_000, nobody);
    const f = submitFaults({ opening: null, status: "DRAFT", today: "2026-09-30", exerciseStatus: "DOCUMENTS_IN_PREPARATION", exercisePackKind: null, openRoute: false, method: { requiresDossier: true }, dossier: { justificationReasonCode: "r", dossierReference: "DA/1", evidenceAttachments: 0 }, route: r });
    expect(f.map((x) => x.code)).toEqual(["EVIDENCE_NOT_ATTACHED"]);
  });
  it("an unresolved route refuses submission, naming it", () => {
    const f = submitFaults({ opening: null, status: "DRAFT", today: "2026-09-30", exerciseStatus: "DOCUMENTS_IN_PREPARATION", exercisePackKind: null, openRoute: false, method: { requiresDossier: false }, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route: appointmentRoute(ctx, tender, 100_000, nobody) });
    expect(f.map((x) => x.code)).toEqual(["NO_RULE"]);
  });
  it("a second route is not opened while one is open", () => {
    const f = submitFaults({ opening: null, status: "DRAFT", today: "2026-09-30", exerciseStatus: "DOCUMENTS_IN_PREPARATION", exercisePackKind: null, openRoute: true, method: null, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route: appointmentRoute(ctx, quotation, 180_000, nobody) });
    expect(f.map((x) => x.code)).toEqual(["ANOTHER_ROUTE_OPEN"]);
  });
  it("CO-8: a name-approval method is not submitted without an approved, non-withdrawn name route", () => {
    const r = appointmentRoute(ctx, quotation, 180_000, nobody);
    const base = { opening: null, status: "DRAFT", today: "2026-09-30", exerciseStatus: "DOCUMENTS_IN_PREPARATION", exercisePackKind: null, openRoute: false, method: { requiresDossier: false, requiresNameApproval: true }, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route: r };
    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    expect(submitFaults({ ...base }).map((x) => x.code)).toEqual(["NAME_NOT_REQUESTED"]);
    expect(submitFaults({ ...base, nameRoutes: [] }).map((x) => x.code)).toEqual(["NAME_NOT_REQUESTED"]);
    expect(submitFaults({ ...base, nameRoutes: [{ status: "PENDING", openedAt: day("2026-09-01") }] }).map((x) => x.code)).toEqual(["NAME_NOT_APPROVED"]);
    expect(submitFaults({ ...base, nameRoutes: [{ status: "REJECTED", openedAt: day("2026-09-01") }] }).map((x) => x.code)).toEqual(["NAME_REJECTED"]);
    // Approved, then withdrawn on a change: the latest route speaks.
    expect(submitFaults({ ...base, nameRoutes: [{ status: "APPROVED", openedAt: day("2026-09-01") }, { status: "RECALLED", openedAt: day("2026-09-10") }] }).map((x) => x.code)).toEqual(["NAME_NOT_REQUESTED"]);
    expect(submitFaults({ ...base, nameRoutes: [{ status: "APPROVED", openedAt: day("2026-09-01") }] })).toEqual([]);
    // A method that does not ask for the name is not held by it.
    expect(submitFaults({ ...base, method: { requiresDossier: false, requiresNameApproval: false } })).toEqual([]);
  });
  it("only a draft is submitted, only from an exercise in preparation", () => {
    const r = appointmentRoute(ctx, quotation, 180_000, nobody);
    const base = { opening: null, status: "DRAFT", today: "2026-09-30", exerciseStatus: "DRAFT", exercisePackKind: null, openRoute: false, method: null, dossier: { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }, route: r };
    expect(submitFaults(base).map((x) => x.code)).toEqual(["EXERCISE_NOT_IN_PREPARATION"]);
    expect(submitFaults({ ...base, status: "APPROVED" }).map((x) => x.code)).toEqual(["NOT_DRAFT"]);
  });
});

describe("citing a committee decision on an appointment step (6.3 BD-3)", () => {
  const matter = { id: "d1", exerciseId: "x1", matterKind: "EXERCISE", domain: "appointment", act: "A", amount: "2100000", committeeCode: "TBC", decidedOn: "2026-09-20" };
  const step = { committeeCode: "TBC", act: "A" };
  const award = { exerciseId: "x1", value: "2100000.00", routeOpenedOn: "2026-09-15" };
  it("a matter of this exercise, committee, act and value discharges the step", () => expect(exerciseCitationFault(matter, step, award, [])).toBeNull());
  it("refuses another exercise, a manual matter, another committee, act or amount, and a second citation", () => {
    expect(exerciseCitationFault({ ...matter, exerciseId: "x2" }, step, award, [])).toBe("NOT_THIS_EXERCISE");
    expect(exerciseCitationFault({ ...matter, matterKind: null }, step, award, [])).toBe("NOT_AN_APPOINTMENT_MATTER");
    expect(exerciseCitationFault({ ...matter, committeeCode: "QC" }, step, award, [])).toBe("OTHER_COMMITTEE");
    expect(exerciseCitationFault({ ...matter, act: "MR" }, step, award, [])).toBe("OTHER_ACT");
    expect(exerciseCitationFault({ ...matter, amount: "2000000" }, step, award, [])).toBe("OTHER_AMOUNT");
    expect(exerciseCitationFault(matter, step, award, ["d1"])).toBe("ALREADY_CITED");
    expect(exerciseCitationFault({ ...matter, decidedOn: "2026-09-10" }, step, award, [])).toBe("DECIDED_BEFORE_ROUTE");
  });
});

describe("the award's states", () => {
  const t = awardTransition;
  const today = "2026-09-30";
  it("moves forward one step at a time", () => {
    expect(t("DRAFT", "PENDING_APPROVAL", { today })).toBeNull();
    expect(t("PENDING_APPROVAL", "APPROVED", { today })).toBeNull();
    expect(t("APPROVED", "ISSUED", { today })).toBeNull();
    expect(t("DRAFT", "ISSUED", { today })).toBe("NOT_ALLOWED");
  });
  it("a refused route returns it to Draft", () => expect(t("PENDING_APPROVAL", "DRAFT", { today })).toBeNull());
  it("cancelling needs a reason; an issued award only before return or commencement; never once accepted", () => {
    expect(t("APPROVED", "CANCELLED", { today, reason: "" })).toBe("CANCEL_REASON_REQUIRED");
    expect(t("ISSUED", "CANCELLED", { today, reason: "Never started", commenced: true })).toBe("ALREADY_COMMENCED");
    expect(t("ISSUED", "CANCELLED", { today, reason: "Returned", returned: true })).toBe("ALREADY_RETURNED");
    expect(t("ISSUED", "CANCELLED", { today, reason: "Never started" })).toBeNull();
    expect(t("ACCEPTED", "CANCELLED", { today, reason: "x" })).toBe("ACCEPTED_NOT_CANCELLED");
  });
  it("accepted only with the return complete", () => {
    expect(t("ISSUED", "ACCEPTED", { today, returnComplete: false })).toBe("RETURN_INCOMPLETE");
    expect(t("ISSUED", "ACCEPTED", { today, returnComplete: true })).toBeNull();
  });
  it("nothing moves without the organisation's day", () => expect(t("DRAFT", "PENDING_APPROVAL", { today: null })).toBe("TIME_ZONE_UNSET"));
});

describe("cancelling, read once", () => {
  it("the page offers cancellation on the rule the action enforces", () => {
    expect(cancellable("DRAFT", { returned: false, commenced: false })).toBe(true);
    expect(cancellable("ISSUED", { returned: true, commenced: false })).toBe(false);
    expect(cancellable("ISSUED", { returned: false, commenced: true })).toBe(false);
    expect(cancellable("ACCEPTED", { returned: false, commenced: false })).toBe(false);
    expect(cancellable("CANCELLED", { returned: false, commenced: false })).toBe(false);
  });
  it("returned means the signed letter back, or the acceptance page's signatory recorded", () => {
    expect(instrumentReturned("LETTER_OF_ACCEPTANCE", { signedLetterReceivedOn: "2026-09-01", signatoryName: "" })).toBe(true);
    expect(instrumentReturned("LETTER_OF_ACCEPTANCE", { signedLetterReceivedOn: null, signatoryName: "Ali" })).toBe(false);
    expect(instrumentReturned("WORK_INDENT", { signedLetterReceivedOn: null, signatoryName: " Ali " })).toBe(true);
    expect(instrumentReturned("WORK_INDENT", null)).toBe(false);
    // An acceptance page is back once its received day is recorded, signatory or not.
    expect(instrumentReturned("WORK_INDENT", { signedLetterReceivedOn: "2026-09-29", signatoryName: "" })).toBe(true);
    expect(instrumentReturned("WORK_INDENT", { signedLetterReceivedOn: null, signatoryName: "" })).toBe(false);
  });
  it("an exercise is not cancelled while a live award stands on it, naming it", () => {
    expect(exerciseCancelBlockedBy([{ reference: "AW/1", status: "CANCELLED" as const }, { reference: "AW/2", status: "DRAFT" as const }])).toEqual({ reference: "AW/2", status: "DRAFT" });
    expect(exerciseCancelBlockedBy([{ reference: "AW/1", status: "CANCELLED" as const }])).toBeNull();
    expect(exerciseCancelBlockedBy([])).toBeNull();
  });
});

describe("one rule for a live award", () => {
  it("live until cancelled, and the query list is that rule", () => {
    expect(isLiveAward("ACCEPTED")).toBe(true);
    expect(isLiveAward("CANCELLED")).toBe(false);
    expect(LIVE_STATUSES).not.toContain("CANCELLED");
    expect(LIVE_STATUSES).toHaveLength(5);
  });
});

describe("award submission refuses a step only the requester could act for (FR-APR-008, ruling R1)", () => {
  const quotation = SPEC_METHODS.find((m) => m.code === "open_quotation")!;
  // The requester is the Chief Executive: the approval escalates to the Chairman, and the
  // Chief Executive's step is downgraded to a recommendation the requester alone holds.
  const m = { ...AWARD_MATRIX, roles: { ...AWARD_MATRIX.roles, CEO: { ...AWARD_MATRIX.roles.CEO, selfApprovalEscalatesToCode: "CHAIR" } } };
  const ctx = { dal: m, override: null, supersedes: false };
  const people = (delegateIds: string[]) => ({
    absentRoleCodes: [],
    requesterHolds: (c: string) => c === "CEO",
    requesterId: "p_ceo",
    ableToAct: (c: string) => (c === "CEO" ? { holderIds: ["p_ceo"], delegateIds } : { holderIds: [`p_${c.toLowerCase()}`], delegateIds: [] }),
  });
  it("is refused, naming a delegation or another raiser, where the requester alone holds the downgraded step", () => {
    const r = appointmentRoute(ctx, quotation, 180_000, people([]));
    expect(r).toMatchObject({ ok: false, fault: "REQUESTER_ONLY" });
    expect(!r.ok && r.messages.join(" ")).toMatch(/Record a delegation .*or have another officer raise the requisition/);
  });
  it("routes once a delegation of that office to another officer is live", () => {
    const r = appointmentRoute(ctx, quotation, 180_000, people(["p_deputy"]));
    expect(r.ok && r.approverCode).toBe("CHAIR");
  });
});
