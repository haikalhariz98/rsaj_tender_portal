import { describe, expect, it } from "vitest";

import { SPEC_METHODS } from "@/lib/method/fixture";
import { parseSen, type Sen } from "@/lib/money";

import { baselineOf, baselineSnapshot, differenceFindings, differences, LAD_PER_DAY, ladOnValueChange, matchesBaseline, prefill, reasonsOnSave, worksAppendixAmount, type AwardTerms, type FrozenTender } from "./appendix-baseline";
import { evaluateAward, type AwardFacts } from "./evaluate";
import { AWARD_MATRIX } from "./fixture";
import { issueFaults } from "./gate";
import { awardFindingText, DIFFERS_TEXT, tenderTermText } from "./labels";

/**
 * 64-C4 (6.4 Q-1 B): the award pre-fills from the frozen tender Appendix, and a term it
 * states differently needs a reason before it is issued.
 *
 * Worked example (for a reader checking by hand; invented figures, §8.6 and §8.10's shapes):
 *
 *   Frozen Appendix, pack version 1:
 *     liquidated damages       0.025% of the contract sum a day
 *     defects liability        12 months
 *     works insurance uplift   10% of the contract sum
 *     regulated activity       yes (the exercise's answer, frozen with the pack)
 *
 *   Awarded sum RM1,077,508.60 (the exercise's estimate, RM1,200,000.00, plays no part).
 *
 *   Damages a day   = 1,077,508.60 × 0.025 / 100 = 269.37715  → RM269.38 (half up to the sen)
 *   Works uplift    = 1,077,508.60 × 10 / 100    = 107,750.86 → insured sum RM1,185,259.46
 *
 *   The award opens with RM269.38 per day, 12 months and "yes": nothing differs.
 *   Negotiated to 24 months' defects liability: it differs. Without a reason, issue is
 *   refused, naming the defects liability period; with one, it is issued and the screen
 *   says "differs from the tender Appendix" beside the reason.
 */

const RM = (s: string) => parseSen(s);

const APPENDIX: FrozenTender["appendix"] = {
  ladKind: "PERCENT_OF_SUM_PER_DAY",
  ladAmount: null,
  ladPct: "0.025",
  dlpApplies: true,
  dlpMonths: 12,
  tplMinimum: RM("2000000"),
  wcMinimum: RM("500000"),
  worksInsuranceUpliftKind: "PERCENT",
  worksInsuranceUpliftAmount: null,
  worksInsuranceUpliftPct: "10",
  insuranceExcess: RM("10000"),
  sectionalCompletion: false,
};
const TENDER: FrozenTender = { packVersion: 1, frozenOn: "2026-09-10", appendix: APPENDIX, regulated: true };
const AWARDED = RM("1077508.60");

const terms = (x: Partial<AwardTerms> = {}): AwardTerms => ({ ladAmount: RM("269.38"), ladUnit: LAD_PER_DAY, dlpMonths: 12, regulatedActivity: true, ...x });

describe("the worked example", () => {
  const b = baselineOf(TENDER, AWARDED);

  it("resolves the percentage damages against the awarded sum, half up to the sen: RM269.38 a day", () => {
    expect(b.lad).toEqual({ kind: "PERCENT", pct: "0.025", sen: RM("269.38") });
  });

  it("resolves the works uplift against the awarded sum: RM107,750.86 beyond the price", () => {
    expect(b.insurance.worksUplift).toEqual({ kind: "PERCENT", pct: "10", sen: RM("107750.86") });
  });

  it("opens the award with the tender's terms, so nothing differs", () => {
    expect(prefill(b)).toEqual({ ladAmount: RM("269.38"), ladUnit: "per day", dlpMonths: 12, regulatedActivity: true });
    expect(differences(b, { ...terms({ ladAmount: null, ladUnit: "", dlpMonths: null, regulatedActivity: null }), ...prefill(b) }, {})).toEqual([]);
  });

  it("24 months' defects liability without a reason refuses issue, naming the term", () => {
    const d = differences(b, terms({ dlpMonths: 24 }), {});
    expect(d).toEqual([{ field: "dlp", reason: null }]);
    const f = differenceFindings(d);
    expect(f).toEqual([{ code: "APPENDIX_DIFFERENCE_UNEXPLAINED", level: "block", data: { field: "dlp" } }]);
    expect(awardFindingText(f[0])).toMatch(/^Defects liability period: differs from the tender Appendix/);
  });

  it("with its reason, the difference stands and issue is not refused for it", () => {
    const d = differences(b, terms({ dlpMonths: 24 }), { dlp: "  Contractor offered 24 months at clarification  " });
    expect(d).toEqual([{ field: "dlp", reason: "Contractor offered 24 months at clarification" }]);
    expect(differenceFindings(d)).toEqual([]);
  });
});

describe("liquidated damages", () => {
  it("an amount a day is the baseline as stated, whatever the awarded sum", () => {
    const b = baselineOf({ ...TENDER, appendix: { ...APPENDIX, ladKind: "AMOUNT_PER_DAY", ladAmount: RM("500"), ladPct: null } }, AWARDED);
    expect(b.lad).toEqual({ kind: "AMOUNT", sen: RM("500") });
  });

  it("rounds once, half up, exactly on the half sen: 0.025% of RM20.00 is half a sen, stated as RM0.01; of RM19.99 it is RM0.00", () => {
    expect(baselineOf(TENDER, RM("20.00")).lad).toMatchObject({ sen: 1n });
    expect(baselineOf(TENDER, RM("19.99")).lad).toMatchObject({ sen: 0n });
  });

  it("is the same figure on either side of a rounding edge only when the sen agree: one sen out differs", () => {
    const b = baselineOf(TENDER, AWARDED);
    expect(matchesBaseline("lad", b, terms({ ladAmount: RM("269.37") }))).toBe(false);
    expect(matchesBaseline("lad", b, terms({ ladAmount: RM("269.39") }))).toBe(false);
    expect(matchesBaseline("lad", b, terms({ ladAmount: RM("269.38") }))).toBe(true);
  });

  it("the same figure per week, or with no unit, differs: the Appendix states a day", () => {
    const b = baselineOf(TENDER, AWARDED);
    expect(matchesBaseline("lad", b, terms({ ladUnit: "per week" }))).toBe(false);
    expect(matchesBaseline("lad", b, terms({ ladUnit: "" }))).toBe(false);
    expect(matchesBaseline("lad", b, terms({ ladUnit: " Per Day " }))).toBe(true);
  });

  it("an Appendix stating no damages compares nothing (never read as none)", () => {
    const b = baselineOf({ ...TENDER, appendix: { ...APPENDIX, ladKind: null, ladPct: null } }, AWARDED);
    expect(b.lad).toBeNull();
    expect(matchesBaseline("lad", b, terms({ ladAmount: null }))).toBeNull();
    expect(prefill(b)).not.toHaveProperty("ladAmount");
  });

  it("property: across awarded sums and rates, the figure is the exact product rounded half up, and the pre-fill never differs", () => {
    let seed = 20261001n;
    const next = (mod: bigint) => {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
      return seed % mod;
    };
    for (let i = 0; i < 500; i++) {
      const value: Sen = next(10n ** 12n);
      const millionths = next(1_000_000n); // up to 1% a day, to six places
      const pct = `${millionths / 1_000_000n}.${(millionths % 1_000_000n).toString().padStart(6, "0")}`;
      const b = baselineOf({ ...TENDER, appendix: { ...APPENDIX, ladPct: pct } }, value);
      const exact = value * millionths; // in units of 10^-8 sen
      const sen = b.lad!.sen;
      expect(sen * 100_000_000n - exact <= 50_000_000n && exact - sen * 100_000_000n < 50_000_000n, `${value} @ ${pct}`).toBe(true);
      const filled = { ...terms({ ladAmount: null, ladUnit: "", dlpMonths: null, regulatedActivity: null }), ...prefill(b) };
      expect(differences(b, filled, {})).toEqual([]);
    }
  });
});

describe("defects liability and the regulated activity", () => {
  it("an Appendix with no defects liability period opens the award at 0 months, and anything else differs", () => {
    const b = baselineOf({ ...TENDER, appendix: { ...APPENDIX, dlpApplies: false, dlpMonths: null } }, AWARDED);
    expect(b.dlp).toEqual({ applies: false });
    expect(prefill(b).dlpMonths).toBe(0);
    expect(matchesBaseline("dlp", b, terms({ dlpMonths: 0 }))).toBe(true);
    expect(matchesBaseline("dlp", b, terms({ dlpMonths: 6 }))).toBe(false);
  });

  it("a period the award leaves unstated differs from one the Appendix states", () => {
    expect(matchesBaseline("dlp", baselineOf(TENDER, AWARDED), terms({ dlpMonths: null }))).toBe(false);
  });

  it("the regulated answer follows the frozen tender; unanswered there, nothing is compared", () => {
    expect(matchesBaseline("regulated", baselineOf(TENDER, AWARDED), terms({ regulatedActivity: false }))).toBe(false);
    expect(matchesBaseline("regulated", baselineOf(TENDER, AWARDED), terms({ regulatedActivity: null }))).toBe(false);
    const open = baselineOf({ ...TENDER, regulated: null }, AWARDED);
    expect(matchesBaseline("regulated", open, terms({ regulatedActivity: false }))).toBeNull();
    expect(prefill(open)).not.toHaveProperty("regulatedActivity");
    expect(awardFindingText({ code: "APPENDIX_DIFFERENCE_UNEXPLAINED", level: "block", data: { field: "regulated" } })).toMatch(/differs from the tender's answer/);
  });
});

describe("reasons on a save of the terms", () => {
  const b = baselineOf(TENDER, AWARDED);
  const all = new Set(["lad", "dlp", "regulated"] as const);

  it("a difference with no reason given or stored is named, and refused", () => {
    expect(reasonsOnSave(b, terms({ dlpMonths: 24 }), all, {}, {}).missing).toEqual(["dlp"]);
  });

  it("the reason given is kept, trimmed; a stored one stands when none is given", () => {
    expect(reasonsOnSave(b, terms({ dlpMonths: 24 }), all, { dlp: " Negotiated " }, {}).reasons.dlp).toBe("Negotiated");
    const r = reasonsOnSave(b, terms({ dlpMonths: 24 }), all, {}, { dlp: "Earlier reason" });
    expect(r).toEqual({ reasons: { lad: null, dlp: "Earlier reason", regulated: null }, missing: [] });
  });

  it("set back to the Appendix, the reason is cleared: nothing differs", () => {
    expect(reasonsOnSave(b, terms(), all, { dlp: "Left over" }, { dlp: "Earlier" }).reasons.dlp).toBeNull();
  });

  it("a field the save did not carry keeps its stored reason and is not judged", () => {
    const r = reasonsOnSave(b, terms({ dlpMonths: 24, ladAmount: RM("1") }), new Set(["dlp"] as const), { dlp: "x" }, { lad: "Kept" });
    expect(r).toEqual({ reasons: { lad: "Kept", dlp: "x", regulated: null }, missing: [] });
  });
});

describe("a draft's awarded value changes", () => {
  it("damages still as the tender stated them follow the new sum", () => {
    expect(ladOnValueChange(TENDER, AWARDED, RM("1000000"), terms())).toBe(RM("250"));
  });
  it("damages the officer changed are left as stated", () => {
    expect(ladOnValueChange(TENDER, AWARDED, RM("1000000"), terms({ ladAmount: RM("300") }))).toBeNull();
  });
  it("an amount a day does not move with the sum", () => {
    const t = { ...TENDER, appendix: { ...APPENDIX, ladKind: "AMOUNT_PER_DAY" as const, ladAmount: RM("500"), ladPct: null } };
    expect(ladOnValueChange(t, AWARDED, RM("1000000"), terms({ ladAmount: RM("500") }))).toBeNull();
  });
});

describe("a works policy's amount stated in the appendix", () => {
  const b = baselineOf(TENDER, AWARDED);
  it("left blank, it is the Appendix's uplift at the awarded sum", () => {
    expect(worksAppendixAmount(true, null, b)).toEqual({ amount: RM("107750.86") });
  });
  it("another figure is refused, naming the Appendix's", () => {
    expect(worksAppendixAmount(true, RM("50000"), b)).toEqual({ fault: "DIFFERS_FROM_APPENDIX", appendix: RM("107750.86") });
    expect(worksAppendixAmount(true, RM("107750.86"), b)).toEqual({ amount: RM("107750.86") });
  });
  it("a policy not covering the works, or an exercise with no frozen Appendix, takes what was entered, as before", () => {
    expect(worksAppendixAmount(false, RM("1"), b)).toEqual({ amount: RM("1") });
    expect(worksAppendixAmount(true, RM("1"), null)).toEqual({ amount: RM("1") });
    expect(worksAppendixAmount(true, null, null)).toEqual({ amount: null });
  });
});

describe("the snapshot frozen at issue", () => {
  it("keeps the baseline and each difference with its reason, in words", () => {
    const b = baselineOf(TENDER, AWARDED);
    const s = baselineSnapshot(b, [{ field: "dlp", reason: "Negotiated" }]);
    expect(s).toEqual({ packVersion: 1, frozenOn: "2026-09-10", lad: { kind: "PERCENT", sen: "26938", pct: "0.025" }, dlp: { applies: true, months: 12 }, regulated: true, differences: [{ field: "Defects liability period", reason: "Negotiated" }] });
  });
});

// ------------------------------------------------------------- through the gate

const tenderMethod = SPEC_METHODS.find((m) => m.code === "open_tender")!;
const record = { committee: "Tender Board", meetingReference: "S/3", meetingDate: new Date("2026-09-20T00:00:00Z"), subject: "", matterRef: null, outcome: "CARRIED" as const, decisionDate: new Date("2026-09-20T00:00:00Z"), quorum: { required: 3, present: 3, recused: 0 }, votingRule: { rule: null, provenance: null }, notApproved: null, note: "", votes: [] };

/// An approved Letter of Acceptance on a closed open tender, otherwise ready to issue.
const facts = (award: Partial<AwardFacts["award"]> = {}, tender: FrozenTender | null | "omitted" = TENDER): AwardFacts => ({
  today: "2026-09-30",
  organisationName: "Demo",
  award: {
    status: "APPROVED", reference: "AW/1", instrumentKind: "LETTER_OF_ACCEPTANCE", value: AWARDED, awardeeName: "Demo Works Sdn Bhd", awardeeRegistrationNo: "0000000-X", awardeeAddress: "1 Demo Lane",
    completionPeriod: 24, completionUnit: "MONTHS", startDate: "2026-11-01", commencedOn: null, regulatedActivity: true,
    bondRequired: true, bondNotRequiredReason: "", bondBasis: "CONTRACT_PRICE", bondPercent: "5", bondBasisAmount: null, bondValidityExtraMonths: 12,
    ladAmount: RM("269.38"), ladUnit: "per day", retentionPercent: null, retentionCapPercent: null, dlpMonths: 12, erpCommitmentNo: null, erpCommitmentKind: null, indentReceivedOn: null, signatoryName: null, issuedOn: null, contractNumber: null, wcBasis: null,
    ...award,
  },
  ...(tender === "omitted" ? {} : { tender }),
  exercise: { reference: "SX/1", title: "Works", status: "ADVERTISED", packKindSnapshot: "TENDER", window: { phase: "CLOSED", changePending: false }, regime: "tender", appointmentRuleKey: "APP_TENDER", appointmentRuleLabel: "Tender", termsBandKey: null, termsState: "NONE_IN_REGIME", terms: null, contractTypeCode: "works", estimate: RM("1200000"), justificationReasonCode: null, dossierReference: null },
  requisition: { reference: "RQ/1", status: "SOURCING", sourcingPermitted: true, approvedValue: RM("2500000"), route: { status: "APPROVED", steps: [{ sequence: 1, roleLabel: "Chief Executive", decision: "DONE" }] } },
  otherAwards: [],
  policy: { tenderInstrument: "LETTER_OF_ACCEPTANCE", quotationInstrument: "WORK_INDENT", indentValidityDays: 14, commencementGraceDays: 7, acceptanceReturnDays: 14, preContractUnitCode: null, postContractUnitCode: null, quotationContractKey: "INDENT_NUMBER", regulatedActivityLabel: null, loaTemplateId: "t1", declarationTemplateId: "t2", coveringMemoTemplateId: null, provenance: "ASSUMED" },
  funder: { dal: AWARD_MATRIX, override: null, supersedes: false },
  method: tenderMethod,
  routePeople: { absentRoleCodes: [], requesterHolds: () => false },
  appointment: { status: "APPROVED", openedAt: new Date("2026-09-15T00:00:00Z"), steps: [{ id: "s1", sequence: 1, roleCode: "TBC", roleLabel: "Tender Board", act: "A", committeeCode: "TBC", decision: "DONE", decidedByName: "Tender Board", decidedOn: new Date("2026-09-20T00:00:00Z"), receivedOn: null, cited: { record, minuted: true } }] },
  recipients: [{ id: "r1", instrumentKind: "LETTER_OF_ACCEPTANCE", nameEn: "Finance", mandatory: true, onlyWhenRegulated: false, sortOrder: 1, retiredOn: null }],
  variants: [],
  templates: [
    { id: "t1", code: "loa", nameEn: "LoA", formCode: "F1", revisionDate: null, bodyMs: null, bodyEn: "To {{awardee.name}}, damages {{terms.lad}}.", primaryLanguage: null, bodyVersion: 1 },
    { id: "t2", code: "decl", nameEn: "Declaration", formCode: "F2", revisionDate: null, bodyMs: null, bodyEn: "I, for {{awardee.name}}, declare.", primaryLanguage: null, bodyVersion: 1 },
  ],
  indentPattern: null,
  contractSeriesKey: "contract",
  wcRequired: false,
});

describe("the award's issue gate", () => {
  it("terms as the frozen Appendix states them: ready to issue", () => {
    const ev = evaluateAward(facts());
    expect(ev.issueFaults).toEqual([]);
    expect(ev.appendix?.differences).toEqual([]);
  });

  it("a negotiated term with no reason is a finding on the gate, and refuses issue", () => {
    const ev = evaluateAward(facts({ dlpMonths: 24 }));
    expect(ev.issueFaults).toEqual([{ code: "APPENDIX_DIFFERENCE_UNEXPLAINED", level: "block", data: { field: "dlp" } }]);
  });

  it("with its reason recorded, the award is issued and the difference is kept for the screen", () => {
    const ev = evaluateAward(facts({ dlpMonths: 24, appendixReasons: { dlp: "Negotiated at clarification" } }));
    expect(ev.issueFaults).toEqual([]);
    expect(ev.appendix?.differences).toEqual([{ field: "dlp", reason: "Negotiated at clarification" }]);
  });

  it("damages are resolved against the awarded sum, never the exercise's estimate", () => {
    // At the estimate (RM1,200,000.00) the figure would be RM300.00: stating it differs.
    const ev = evaluateAward(facts({ ladAmount: RM("300") }));
    expect(ev.appendix?.baseline.lad?.sen).toBe(RM("269.38"));
    expect(ev.issueFaults.map((f) => f.data?.field)).toEqual(["lad"]);
  });

  it("no frozen Appendix: nothing compared, and the gate is as it was — any terms issue", () => {
    for (const tender of ["omitted", null] as const) {
      const ev = evaluateAward(facts({ ladAmount: RM("1"), dlpMonths: 99, regulatedActivity: false }, tender));
      expect(ev.appendix).toBeNull();
      expect(ev.issueFaults).toEqual([]);
    }
  });

  it("the gate itself: absent differences add nothing; each unexplained one adds one finding", () => {
    const base = { status: "APPROVED", today: "2026-09-30", exerciseStatus: "DOCUMENTS_IN_PREPARATION", exercisePackKind: null, commitment: null, sourcingPermitted: true, instrument: { kind: "WORK_INDENT" }, valueFaults: [], dossierFaults: [], appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [] }, signatory: { ok: true }, indent: null, distribution: { rows: [] }, documents: [], variant: null, terms: null, bond: { required: false, reason: "x", basis: { state: "NOT_SET" } }, contractNumber: { source: "SERIES", seriesKey: "c" }, startDate: "2026-10-01", wc: { required: false, basis: null } } as unknown as Parameters<typeof issueFaults>[0];
    expect(issueFaults(base)).toEqual([]);
    expect(issueFaults({ ...base, appendixDifferences: [] })).toEqual([]);
    expect(issueFaults({ ...base, appendixDifferences: [{ field: "lad", reason: null }, { field: "regulated", reason: "Why" }] })).toEqual([{ code: "APPENDIX_DIFFERENCE_UNEXPLAINED", level: "block", data: { field: "lad" } }]);
  });
});

describe("the words beside each term", () => {
  it("say what the tender states, with a percentage's figure at the awarded sum, and never a code", () => {
    const b = baselineOf(TENDER, AWARDED);
    expect(tenderTermText("lad", b)).toBe("RM269.38 per day: 0.025% of the awarded sum a day");
    expect(tenderTermText("dlp", b)).toBe("12 months");
    expect(tenderTermText("regulated", b)).toBe("Yes");
    const none = baselineOf({ ...TENDER, regulated: null, appendix: { ...APPENDIX, ladKind: "AMOUNT_PER_DAY", ladAmount: RM("500"), ladPct: null, dlpApplies: false, dlpMonths: null } }, AWARDED);
    expect(tenderTermText("lad", none)).toBe("RM500 per day");
    expect(tenderTermText("dlp", none)).toBe("None");
    expect(tenderTermText("regulated", none)).toBeNull();
  });
  it("a difference reads as differing from the tender Appendix (the regulated answer: from the tender)", () => {
    expect(DIFFERS_TEXT).toEqual({ lad: "Differs from the tender Appendix", dlp: "Differs from the tender Appendix", regulated: "Differs from the tender" });
  });
});
