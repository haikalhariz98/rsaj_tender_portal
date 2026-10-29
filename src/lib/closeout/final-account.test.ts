import { describe, expect, it } from "vitest";

import { parseSen, type Sen } from "@/lib/money";

import { closeoutFaultText, owedByContractor } from "./labels";
import { finalAcceptanceFaults, finalAccountOf, finalBasisMoved, finalPreconditionFaults, finalRouteFaults, type FinalAccountInput, type FinalInterim, type FinalJudged } from "./final-account";

const rm = (v: string): Sen => parseSen(v);
const zero = { MAIN: 0n, NSC: 0n, NS: 0n };
const noLad = { gross: 0n, waived: 0n, credit: 0n, rounding: 0n };
const interim = (o: Partial<FinalInterim> & { carryForward: Sen }): FinalInterim => {
  const x = { certificateId: "c", number: null, recommended: 0n, lad: noLad, advance: { MAIN: 0n, NSC: 0n }, premiums: 0n, wages: 0n, nonCompliance: 0n, others: 0n, released: zero, ...o };
  // An interim's payment is its carry-forward less its deductions, as the interim certificate computes it.
  const ded = x.lad.gross - x.lad.waived - x.lad.credit + x.lad.rounding + x.advance.MAIN + x.advance.NSC + x.premiums + x.wages + x.nonCompliance + x.others;
  return { ...x, recommended: x.carryForward - ded };
};
const noNow = { gross: 0n, waived: 0n, credit: 0n, waiverIds: [], waiverRefs: [] };

/**
 * The worked example (6.13 plan B5, spec §8.8, CPD/SFA(T)), to check by hand:
 *
 *   Original contract sum                      1,077,508.60
 *   Net of the issued adjustments              +  37,800.00
 *   Final contract sum                         1,115,308.60
 *
 *   Less  previous interim payments (as paid)  1,000,000.00
 *         retention released, main contractor     53,875.43
 *                                              1,053,875.43
 *
 *   Deduct liquidated damages (30 days at 269.38)  8,081.40
 *          waived (letter W/1)                    −2,020.35
 *          rounding                                   −0.05
 *          premiums paid by the employer           1,200.00
 *          cost of making good defects             3,500.00
 *                                                 10,761.00
 *
 *   Payment recommended  1,115,308.60 − 1,053,875.43 − 10,761.00 = 50,672.17
 *
 * The history behind it: one interim certificate paid 1,053,875.43, its carry-forward including the 53,875.43 retention released before its
 * valuation day; it deducted the 30 days' damages (8,081.40) and the premiums (1,200.00), so it carried forward 1,063,156.83. The final applies
 * the approved waiver (2,020.35) and the keyed rounding and making-good cost.
 */
const fixture: FinalAccountInput = {
  basis: "AS_PAID",
  originalSum: rm("1077508.60"),
  adjustments: [{ id: "adj1", net: rm("37800.00") }],
  interims: [interim({ certificateId: "ipc1", carryForward: rm("1063156.83"), lad: { gross: rm("8081.40"), waived: 0n, credit: 0n, rounding: 0n }, premiums: rm("1200.00"), released: { MAIN: rm("53875.43"), NSC: 0n, NS: 0n } })],
  advances: [],
  ladNow: { gross: 0n, waived: rm("2020.35"), credit: 0n, waiverIds: ["w1"], waiverRefs: ["W/1"] },
  pending: [],
  keyed: [
    { kind: "LAD_ROUNDING", label: "Rounding", amount: rm("-0.05") },
    { kind: "MAKING_GOOD_COST", label: "Cost of making good defects", amount: rm("3500.00") },
  ],
};

describe("finalAccountOf: the worked example", () => {
  it("as paid: final sum 1,115,308.60, less 1,053,875.43, deduct 10,761.00, recommended 50,672.17", () => {
    const r = finalAccountOf(fixture);
    expect(r.faults).toEqual([]);
    expect(fixture.interims[0].recommended).toBe(rm("1053875.43"));
    expect([r.finalSum, r.less, r.deduct, r.recommended]).toEqual([rm("1115308.60"), rm("1053875.43"), rm("10761.00"), rm("50672.17")]);
    expect(r.lines.filter((l) => l.block === "LESS").map((l) => [l.kind, l.amount])).toEqual([["PREVIOUS_INTERIM", rm("1000000.00")], ["RETENTION_RELEASED_MAIN", rm("53875.43")]]);
    expect(r.lines.find((l) => l.kind === "LAD_WAIVED")?.label).toBe("Liquidated damages waived (W/1)");
  });
  it("before deductions: the blocks print differently, the payment is the same", () => {
    const r = finalAccountOf({ ...fixture, basis: "BEFORE_DEDUCTIONS" });
    expect(r.less).toBe(rm("1063156.83"));
    expect(r.deduct).toBe(rm("1479.60"));
    expect(r.recommended).toBe(rm("50672.17"));
    // The damages and premiums the interim took are off what it paid, so they are not deducted again.
    expect(r.lines.some((l) => l.kind === "LAD" || l.kind === "PREMIUMS_PERKESO")).toBe(false);
  });
});

describe("finalAccountOf: what the contractor is owed less what it was paid (property, 200 seeded histories)", () => {
  // mulberry32: a small seeded generator, so a failure names its history.
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let seed = 1; seed <= 200; seed++) {
    it(`history ${seed}`, () => {
      const r = rng(seed);
      const sen = (max: number) => BigInt(Math.floor(r() * max));
      const n = Math.floor(r() * 5);
      const advMain = r() < 0.5 ? sen(5_000_000) : 0n;
      const advNsc = r() < 0.3 ? sen(1_000_000) : 0n;
      let recoupLeft = { MAIN: advMain, NSC: advNsc };
      let released = { MAIN: 0n, NSC: 0n, NS: 0n };
      const interims: FinalInterim[] = [];
      for (let k = 0; k < n; k++) {
        // Releases before this interim's valuation day (some histories release after the last one: paid by the final).
        if (r() < 0.3) released = { MAIN: released.MAIN + sen(200_000), NSC: released.NSC + sen(50_000), NS: released.NS + sen(20_000) };
        const gross = r() < 0.4 ? sen(900_000) : 0n;
        const waived = gross && r() < 0.5 ? sen(Number(gross)) : 0n;
        const credit = r() < 0.2 ? sen(100_000) : 0n;
        const rounding = gross ? BigInt(Math.floor(r() * 199) - 99) : 0n;
        const rec = { MAIN: r() < 0.6 ? (recoupLeft.MAIN * BigInt(Math.floor(r() * 100))) / 100n : 0n, NSC: r() < 0.6 ? recoupLeft.NSC : 0n };
        recoupLeft = { MAIN: recoupLeft.MAIN - rec.MAIN, NSC: recoupLeft.NSC - rec.NSC };
        interims.push(interim({ certificateId: `i${k}`, carryForward: sen(50_000_000) + 10_000_000n, lad: { gross, waived, credit, rounding }, advance: rec, premiums: sen(300_000), wages: r() < 0.2 ? sen(100_000) : 0n, nonCompliance: r() < 0.2 ? sen(100_000) : 0n, others: r() < 0.2 ? sen(100_000) : 0n, released: { ...released } }));
      }
      const ladNow = { gross: r() < 0.3 ? sen(500_000) : 0n, waived: r() < 0.3 ? sen(100_000) : 0n, credit: r() < 0.2 ? sen(50_000) : 0n, waiverIds: [], waiverRefs: [] };
      const pending = r() < 0.3 ? [{ id: "p", amount: sen(200_000) }] : [];
      const keyed = r() < 0.5 ? [{ kind: "MAKING_GOOD_COST" as const, label: "Making good", amount: sen(300_000) }, { kind: "OTHER" as const, label: "Other", amount: sen(100_000) }] : [];
      const input: FinalAccountInput = { basis: "AS_PAID", originalSum: sen(500_000_000) + 100_000_000n, adjustments: [{ id: "a", net: sen(10_000_000) - 5_000_000n }], interims, advances: [{ id: "am", party: "MAIN", amount: advMain }, { id: "an", party: "NSC", amount: advNsc }], ladNow, pending, keyed };

      // The oracle, worked independently: owed = the final sum less every deduction over the contract's life; paid = every interim's payment
      // plus the advances. The final pays the difference.
      const all = (f: (x: FinalInterim) => Sen) => interims.reduce((a, x) => a + f(x), 0n);
      const finalSum = input.originalSum + input.adjustments[0].net;
      const deductions = all((x) => x.lad.gross - x.lad.waived - x.lad.credit + x.lad.rounding + x.premiums + x.wages + x.nonCompliance + x.others) + ladNow.gross - ladNow.waived - ladNow.credit + pending.reduce((a, p) => a + p.amount, 0n) + keyed.reduce((a, k) => a + k.amount, 0n);
      const paid = all((x) => x.recommended) + advMain + advNsc;
      const oracle = finalSum - deductions - paid;

      const asPaid = finalAccountOf(input);
      const before = finalAccountOf({ ...input, basis: "BEFORE_DEDUCTIONS" });
      expect(asPaid.recommended).toBe(oracle);
      expect(before.recommended).toBe(oracle);
      // Each total is its lines.
      for (const a of [asPaid, before]) expect(a.finalSum - a.lines.filter((l) => l.block === "LESS").reduce((x, l) => x + l.amount, 0n) - a.lines.filter((l) => l.block === "DEDUCT").reduce((x, l) => x + l.amount, 0n)).toBe(a.recommended);
    });
  }
});

const fixtureAccount = () => finalAccountOf(fixture);

describe("finalAccountOf: keyed deductions", () => {
  const withKeyed = (keyed: FinalAccountInput["keyed"]) => finalAccountOf({ ...fixture, keyed });
  it("allows three other deductions and refuses a fourth", () => {
    const other = { kind: "OTHER" as const, label: "Other", amount: 100n };
    expect(withKeyed([other, other, other]).faults).toEqual([]);
    expect(withKeyed([other, other, other, other]).faults.map((f) => f.code)).toEqual(["TOO_MANY_OTHER_DEDUCTIONS"]);
  });
  it("accepts a rounding of ±0.99 and refuses ±1.00", () => {
    const r = (v: string) => withKeyed([{ kind: "LAD_ROUNDING", label: "Rounding", amount: rm(v) }]).faults.map((f) => f.code);
    expect(r("0.99")).toEqual([]);
    expect(r("-0.99")).toEqual([]);
    expect(r("1.00")).toEqual(["LAD_ROUNDING_OUT_OF_RANGE"]);
    expect(r("-1.00")).toEqual(["LAD_ROUNDING_OUT_OF_RANGE"]);
  });
  it("refuses a rounding with no damages, a second rounding, and a deduction below nothing", () => {
    const noDamages: FinalAccountInput = { ...fixture, interims: [interim({ carryForward: rm("1000000.00") })], ladNow: noNow };
    expect(finalAccountOf({ ...noDamages, keyed: [{ kind: "LAD_ROUNDING", label: "Rounding", amount: rm("0.10") }] }).faults.map((f) => f.code)).toEqual(["ROUNDING_WITHOUT_LAD"]);
    expect(withKeyed([{ kind: "LAD_ROUNDING", label: "R", amount: 5n }, { kind: "LAD_ROUNDING", label: "R", amount: 5n }]).faults.map((f) => f.code)).toContain("ROUNDING_ONCE");
    expect(withKeyed([{ kind: "WAGES", label: "Wages", amount: -1n }]).faults.map((f) => f.code)).toEqual(["NEGATIVE_DEDUCTION"]);
  });
  it("refuses a payment below nothing, naming the shortfall", () => {
    const r = withKeyed([{ kind: "DIMINUTION", label: "Diminution", amount: rm("60000.00") }]);
    expect(r.faults).toEqual([{ code: "FINAL_NEGATIVE", level: "block", data: { amount: rm("5827.88").toString() } }]);
  });
  // Ruling 3 (code review of close-out stage C): the amount owed is shown, never 0, and the contract stays open.
  it("shows what the contractor owes, 5,827.88, and says the contract stays open", () => {
    const r = withKeyed([{ kind: "DIMINUTION", label: "Diminution", amount: rm("60000.00") }]);
    expect(owedByContractor(r.recommended)).toEqual({ label: "Owed by the contractor", value: "RM5,827.88", note: "The contract stays open until recovering an amount the contractor owes is built." });
    expect(closeoutFaultText(r.faults[0])).toBe("The deductions exceed what is due: the contractor owes RM5,827.88. Recovering it is not built yet, so no final certificate is raised and the contract stays open.");
    expect(owedByContractor(0n)).toBeNull();
    expect(owedByContractor(fixtureAccount().recommended)).toBeNull();
  });
});

describe("finalPreconditionFaults (§4.6)", () => {
  const ready = { cpcIssued: true, dlpApplies: true, cmgdIssued: true, inProgress: [], valuationOpen: false, eotOpen: [], lossExpenseOpen: [], basis: "AS_PAID" as const, waiversUnapplied: 0, waiverSetting: null, waiversMoved: [], live: null, parties: [] };
  const codes = (o: Partial<typeof ready> | Record<string, unknown>) => finalPreconditionFaults({ ...ready, ...o } as never).map((f) => f.code);
  it("passes when everything is done", () => expect(codes({})).toEqual([]));
  it.each([
    [{ cmgdIssued: false }, "MAKING_GOOD_NOT_ISSUED_FINAL"],
    [{ cpcIssued: false, dlpApplies: null, cmgdIssued: false }, "CPC_NOT_ISSUED"],
    [{ inProgress: ["Interim payment IPC/4"] }, "CERTIFICATES_IN_PROGRESS"],
    [{ valuationOpen: true }, "VALUATION_OPEN"],
    [{ eotOpen: ["EOT/1"] }, "EOT_OPEN"],
    [{ lossExpenseOpen: ["LE/1"] }, "LOSS_EXPENSE_NOT_VALUED"],
    [{ basis: null }, "FINAL_BASIS_NOT_SET"],
    [{ waiversUnapplied: 1 }, "WAIVER_SETTING_NOT_SET"],
    [{ waiversMoved: ["LW/1"] }, "WAIVER_MOVED"],
    [{ live: { number: null } }, "FINAL_LIVE"],
    [{ parties: ["Syarikat NSC"] }, "PARTY_SPLIT_NOT_BUILT"],
  ])("refuses %o alone", (o, code) => expect(codes(o)).toEqual([code]));
  it("needs no CMGD where no defects liability period applies, and a set switch once waivers wait", () => {
    expect(codes({ dlpApplies: false, cmgdIssued: false })).toEqual([]);
    expect(codes({ waiversUnapplied: 1, waiverSetting: "FINAL_ACCOUNT" })).toEqual([]);
  });
});

describe("finalRouteFaults (§4.6, ruling 17)", () => {
  const ready = { pack: [{ label: "As-built drawings", met: true }], declarationTakenUp: true, financeConfirmed: 500n, financePaid: 500n, performance: null };
  const codes = (o: Record<string, unknown>) => finalRouteFaults({ ...ready, ...o } as never).map((f) => f.code);
  it("passes when everything is in", () => expect(codes({})).toEqual([]));
  it("refuses each, alone", () => {
    expect(codes({ pack: [{ label: "As-built drawings", met: false }] })).toEqual(["PACK_INCOMPLETE"]);
    expect(codes({ declarationTakenUp: false })).toEqual(["DECLARATION_NOT_TAKEN_UP"]);
    expect(codes({ financeConfirmed: null })).toEqual(["FINANCE_NOT_CONFIRMED"]);
    expect(codes({ performance: { code: "PERFORMANCE_NOT_FILED", level: "block" } })).toEqual(["PERFORMANCE_NOT_FILED"]);
  });
  it("FINANCE_TOTAL_DIFFERS names both totals, by one sen", () => {
    expect(finalRouteFaults({ ...ready, financeConfirmed: 501n })).toEqual([{ code: "FINANCE_TOTAL_DIFFERS", level: "block", data: { confirmed: "501", computed: "500" } }]);
  });
});

describe("finalBasisMoved", () => {
  const j: FinalJudged = { version: 1, basis: "AS_PAID", interims: ["a", "b"], advances: [], adjustments: [], releases: ["r1"], waivers: [], pending: [], finalSum: "1.00", less: "1.00", ladNow: "0.00" };
  it("is quiet when only the order differs, and names what moved", () => {
    expect(finalBasisMoved(j, { ...j, interims: ["b", "a"] })).toEqual([]);
    expect(finalBasisMoved(j, { ...j, interims: ["a", "b", "c"], releases: [] })).toEqual([{ code: "FINAL_BASIS_MOVED", level: "block", data: { items: "the interim certificates, the retention released" } }]);
  });
});

// Close-out stage C review, ruling 1 (FR-FIN-009): a refused acceptance is not a final certificate.
describe("finalAcceptanceFaults", () => {
  const sig = (o: Partial<{ blockKind: string; blockLabel: string; refused: boolean; signedOn: string }>) => ({ blockKind: "CONTRACTOR", blockLabel: "Accepted by the contractor", refused: false, signedOn: "2027-11-11", ...o });
  it("refuses the FINAL's issue on a refused contractor block, naming the block and its day", () => {
    expect(finalAcceptanceFaults([sig({ blockKind: "RECOMMENDING", blockLabel: "Recommended" }), sig({ refused: true })])).toEqual([{ code: "FINAL_NOT_ACCEPTED", level: "block", data: { block: "Accepted by the contractor", day: "2027-11-11" } }]);
  });
  it("is quiet on a signed contractor block, and on a refusal by any other block", () => {
    expect(finalAcceptanceFaults([sig({})])).toEqual([]);
    expect(finalAcceptanceFaults([sig({ blockKind: "WITNESS", refused: true })])).toEqual([]);
  });
});
