import { describe, expect, it } from "vitest";

import { answerFaults, determinationEffect, determinationFaults, exclusionOf, instrumentFaults, noticeFaults, openFaults, reasonFaults, weatherGuidanceOf, type DeterminationInput } from "./entitlement";
import { EOT_PACK_ITEMS, type PackAnswer } from "./types";

/**
 * 6.13 Part B run 1b: the EOT claim's rules (FR-EOT-001–006; the carry-in FR-AWD-014; BD-613-116's act-side reading of
 * the type's eotInstrumentKind and the policy's weatherGuidance). Pure. Spec figures only in fixtures.
 */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const pack = (o: Partial<Record<(typeof EOT_PACK_ITEMS)[number], PackAnswer>> = {}): PackAnswer[] => EOT_PACK_ITEMS.map((item) => o[item] ?? { item, text: "Answered.", notRequired: false });

describe("FR-EOT-001: a delay notice, by either path", () => {
  it("needs the cause, is never received before the delay occurred, nor after today", () => {
    expect(noticeFaults({ cause: "Late possession of the pump house.", occurredOn: "2026-09-01", receivedOn: "2026-09-01", today: "2026-09-02" })).toEqual([]);
    expect(codes(noticeFaults({ cause: " ", occurredOn: "2026-09-01", receivedOn: "2026-09-01", today: "2026-09-02" }))).toEqual(["NOTICE_CAUSE_REQUIRED"]);
    expect(codes(noticeFaults({ cause: "x", occurredOn: "2026-09-02", receivedOn: "2026-09-01", today: "2026-09-02" }))).toEqual(["RECEIVED_BEFORE_OCCURRED"]);
    expect(codes(noticeFaults({ cause: "x", occurredOn: "2026-09-01", receivedOn: "2026-09-03", today: "2026-09-02" }))).toEqual(["FUTURE_DATE"]);
  });
});

describe("BD-613-116 act side: the contract type's eotInstrumentKind", () => {
  it("an EOT claim needs EXTENSION_OF_TIME or BOTH; a period extension CONTRACT_PERIOD or BOTH; unset refuses naming the setting", () => {
    expect(instrumentFaults("EXTENSION_OF_TIME", "EOT", "Works")).toEqual([]);
    expect(instrumentFaults("BOTH", "EOT", "Works")).toEqual([]);
    expect(instrumentFaults("BOTH", "PERIOD", "Works")).toEqual([]);
    expect(instrumentFaults("CONTRACT_PERIOD", "PERIOD", "Annual service")).toEqual([]);
    expect(codes(instrumentFaults("CONTRACT_PERIOD", "EOT", "Annual service"))).toEqual(["EOT_NOT_OFFERED"]);
    expect(codes(instrumentFaults("EXTENSION_OF_TIME", "PERIOD", "Works"))).toEqual(["PERIOD_NOT_OFFERED"]);
    for (const want of ["EOT", "PERIOD"] as const) {
      const f = instrumentFaults(null, want, "Works");
      expect(codes(f)).toEqual(["EOT_INSTRUMENT_NOT_SET"]);
      expect(f[0].data).toEqual({ type: "Works" });
    }
  });
});

describe("opening a claim", () => {
  const ok = { notices: [{ onContract: true }], scope: "WHOLE" as const, sectionKnown: null, groundClause: "Clause 43.1(e)", cause: "Late possession.", programme: { approved: true }, proposedDays: 14, instrument: [] };
  it("passes when whole", () => expect(openFaults(ok)).toEqual([]));
  it("needs a notice of this contract, a section where the scope is one, the ground clause, the cause and an approved programme revision", () => {
    expect(codes(openFaults({ ...ok, notices: [] }))).toEqual(["NOTICE_REQUIRED"]);
    expect(codes(openFaults({ ...ok, notices: [{ onContract: false }] }))).toEqual(["NOTICE_NOT_ON_CONTRACT"]);
    expect(codes(openFaults({ ...ok, scope: "SECTION", sectionKnown: false }))).toEqual(["SECTION_REQUIRED"]);
    expect(openFaults({ ...ok, scope: "SECTION", sectionKnown: true })).toEqual([]);
    expect(codes(openFaults({ ...ok, groundClause: "", cause: "" }))).toEqual(["GROUND_CLAUSE_REQUIRED", "CAUSE_REQUIRED"]);
    expect(codes(openFaults({ ...ok, programme: null }))).toEqual(["PROGRAMME_NOT_APPROVED"]);
    expect(codes(openFaults({ ...ok, programme: { approved: false } }))).toEqual(["PROGRAMME_NOT_APPROVED"]);
    expect(codes(openFaults({ ...ok, proposedDays: -1 }))).toEqual(["PROPOSED_DAYS_REQUIRED"]);
  });
  it("carries the instrument's refusal", () => {
    expect(codes(openFaults({ ...ok, instrument: instrumentFaults(null, "EOT", "Works") }))).toEqual(["EOT_INSTRUMENT_NOT_SET"]);
  });
});

describe("answering a claim and its reasons", () => {
  it("frozen once closed or determined; an estimated completion where it cannot complete by the proposed date", () => {
    expect(answerFaults({ closed: null, determined: false, canComplete: true, estimatedCompletion: null, actualDelayDays: 10, earthworksDays: null })).toEqual([]);
    expect(codes(answerFaults({ closed: { reason: "r" }, determined: false, canComplete: null, estimatedCompletion: null, actualDelayDays: null, earthworksDays: null }))).toEqual(["CLAIM_CLOSED"]);
    expect(codes(answerFaults({ closed: null, determined: true, canComplete: null, estimatedCompletion: null, actualDelayDays: null, earthworksDays: null }))).toEqual(["CLAIM_DETERMINED"]);
    expect(codes(answerFaults({ closed: null, determined: false, canComplete: false, estimatedCompletion: null, actualDelayDays: null, earthworksDays: null }))).toEqual(["ESTIMATED_COMPLETION_REQUIRED"]);
    expect(codes(answerFaults({ closed: null, determined: false, canComplete: null, estimatedCompletion: null, actualDelayDays: -1, earthworksDays: -2 }))).toEqual(["DAYS_BELOW_NOTHING", "DAYS_BELOW_NOTHING"]);
  });
  it("a reason: clause and words, the delay ends after it begins (end exclusive), a concurrent one names its group", () => {
    const r = { closed: null, determined: false, clause: "43.1(e)", reason: "Late possession", delayFrom: "2026-09-01", delayUntil: "2026-09-11", extensionDays: 10, concurrency: "CONSECUTIVE" as const, group: null };
    expect(reasonFaults(r)).toEqual([]);
    expect(codes(reasonFaults({ ...r, clause: "" }))).toEqual(["REASON_FIELDS_REQUIRED"]);
    expect(codes(reasonFaults({ ...r, delayUntil: "2026-09-01" }))).toEqual(["UNTIL_NOT_AFTER_FROM"]);
    expect(codes(reasonFaults({ ...r, concurrency: "CONCURRENT" }))).toEqual(["GROUP_REQUIRED"]);
    expect(reasonFaults({ ...r, concurrency: "CONCURRENT", group: "A" })).toEqual([]);
    expect(codes(reasonFaults({ ...r, extensionDays: -1 }))).toEqual(["DAYS_BELOW_NOTHING"]);
    expect(codes(reasonFaults({ ...r, determined: true }))).toEqual(["CLAIM_DETERMINED"]);
  });
});

describe("the carry-in (FR-AWD-014, Phase 1 carry 9): a condition excluding an EOT", () => {
  const conds = [
    { id: "c1", name: "Way leave from the land office", excludesEot: true, satisfiedOn: null },
    { id: "c2", name: "Bond lodged", excludesEot: false, satisfiedOn: null },
    { id: "c3", name: "Site survey", excludesEot: true, satisfiedOn: "2026-08-01" },
  ];
  it("pre-answers \"not a ground\" only for an unmet condition that excludes an EOT, the one the delay is put down to", () => {
    expect(exclusionOf(conds, "c1")?.id).toBe("c1");
    expect(exclusionOf(conds, "c2")).toBeNull();
    expect(exclusionOf(conds, "c3")).toBeNull();
    expect(exclusionOf(conds, null)).toBeNull();
    expect(exclusionOf(conds, "elsewhere")).toBeNull();
  });
});

describe("determining a claim (FR-EOT-002, 003, 004, 005, 006)", () => {
  const ok: DeterminationInput = { closed: null, determined: false, entitlement: "ENTITLED", reason: "A relevant event outside the contractor's control.", bestEndeavours: "FULL", isWeather: false, exceptional: null, meteorologicalAttached: false, pack: pack(), actualDelayDays: 14, reasons: 1, exclusion: null, overrideReason: "" };
  it("an entitled claim with everything answered passes", () => expect(determinationFaults(ok)).toEqual([]));

  it("failed entitlement opens LAD, closes EOT: the claim's matter closes with the determination's reason", () => {
    const no = { ...ok, entitlement: "NOT_ENTITLED" as const, reason: "The delay was within the contractor's control." };
    expect(determinationFaults({ ...no, pack: [], actualDelayDays: null, reasons: 0, bestEndeavours: null })).toEqual([]);
    expect(determinationEffect(no)).toEqual({ closeMatter: "Not entitled: The delay was within the contractor's control.", opensDamages: true });
    expect(determinationEffect(ok)).toEqual({ closeMatter: null, opensDamages: false });
  });

  it("the determination and its reason are required", () => {
    expect(codes(determinationFaults({ ...ok, entitlement: null }))).toEqual(["ENTITLEMENT_REQUIRED"]);
    expect(codes(determinationFaults({ ...ok, reason: " " }))).toEqual(["ENTITLEMENT_REASON_REQUIRED"]);
  });

  it("weather claim without evidence refused; not exceptional refused; the exceptional answer is required either way", () => {
    expect(codes(determinationFaults({ ...ok, isWeather: true, exceptional: true, meteorologicalAttached: false }))).toEqual(["WEATHER_EVIDENCE_REQUIRED"]);
    expect(codes(determinationFaults({ ...ok, isWeather: true, exceptional: false, meteorologicalAttached: true }))).toEqual(["WEATHER_NOT_EXCEPTIONAL"]);
    expect(determinationFaults({ ...ok, isWeather: true, exceptional: true, meteorologicalAttached: true })).toEqual([]);
    expect(codes(determinationFaults({ ...ok, isWeather: true, exceptional: null, meteorologicalAttached: true }))).toEqual(["WEATHER_EXCEPTIONAL_REQUIRED"]);
    expect(codes(determinationFaults({ ...ok, entitlement: "NOT_ENTITLED", isWeather: true, exceptional: null }))).toEqual(["WEATHER_EXCEPTIONAL_REQUIRED"]);
  });

  it("best endeavours: required; none is no extension (determine it not entitled); partial is a partial extension", () => {
    expect(codes(determinationFaults({ ...ok, bestEndeavours: null }))).toEqual(["BEST_ENDEAVOURS_REQUIRED"]);
    expect(codes(determinationFaults({ ...ok, bestEndeavours: "NONE" }))).toEqual(["BEST_ENDEAVOURS_NONE"]);
    expect(determinationFaults({ ...ok, bestEndeavours: "PARTIAL" })).toEqual([]);
  });

  it("the five pack items each answered or not required with a reason; the actual delay against the programme; a reason at least", () => {
    const f = determinationFaults({ ...ok, pack: pack({ PROGRESS: { item: "PROGRESS", text: "", notRequired: false }, LOSS_EXPENSE: { item: "LOSS_EXPENSE", text: "", notRequired: true } }) });
    expect(f.map((x) => `${x.code}:${x.data?.item}`)).toEqual(["PACK_NOT_REQUIRED_REASON:LOSS_EXPENSE", "PACK_ITEM_REQUIRED:PROGRESS"]);
    expect(codes(determinationFaults({ ...ok, actualDelayDays: null }))).toEqual(["ACTUAL_DELAY_REQUIRED"]);
    expect(codes(determinationFaults({ ...ok, reasons: 0 }))).toEqual(["REASONS_REQUIRED"]);
  });

  it("an unmet excluding condition refuses ENTITLED unless overridden with a reason (audited by the act)", () => {
    const ex = { id: "c1", name: "Way leave from the land office", excludesEot: true, satisfiedOn: null };
    const f = determinationFaults({ ...ok, exclusion: ex });
    expect(codes(f)).toEqual(["EXCLUDED_BY_CONDITION"]);
    expect(f[0].data).toEqual({ condition: "Way leave from the land office" });
    expect(determinationFaults({ ...ok, exclusion: ex, overrideReason: "The land office's delay was caused by the employer's late application." })).toEqual([]);
    expect(determinationFaults({ ...ok, exclusion: ex, entitlement: "NOT_ENTITLED", pack: [], reasons: 0 })).toEqual([]);
  });

  it("closed or determined already refuses", () => {
    expect(codes(determinationFaults({ ...ok, closed: { reason: "x" } }))).toEqual(["CLAIM_CLOSED"]);
    expect(codes(determinationFaults({ ...ok, determined: true }))).toEqual(["CLAIM_DETERMINED"]);
  });
});

describe("BD-613-116 act side: the weather guidance (FR-EOT-005), shown, never a refusal", () => {
  it("set: its words; unset or blank: not set", () => {
    expect(weatherGuidanceOf({ guidance: "Records covering not less than three years.", provenance: "STATED" })).toEqual({ state: "SET", text: "Records covering not less than three years.", provenance: "STATED" });
    expect(weatherGuidanceOf({ guidance: null, provenance: null })).toEqual({ state: "NOT_SET" });
    expect(weatherGuidanceOf({ guidance: "  ", provenance: "ASSUMED" })).toEqual({ state: "NOT_SET" });
  });
});
