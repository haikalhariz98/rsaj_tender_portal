import { describe, expect, it } from "vitest";

import { applyOverrides } from "@/lib/certificate/override";
import { snapshotFaults, totalsFrom } from "@/lib/certificate/snapshot";
import { ladLine } from "@/lib/lad/charge";
import { parseSen, senToDecimalString, type Sen } from "@/lib/money";

import { interimCertificate, type InterimInput } from "./interim";
import { materialsAllowance, materialsPct, type MaterialLine } from "./materials";
import { retentionReading, ZERO_TIERS } from "./retention";

/**
 * The interim certificate's arithmetic (FR-PAY-011, 012; §8.3), on the plan's worked example, which a finance
 * officer can check by hand. FIXTURE ONLY: the contract sum, the retention terms, the 75% and the damages rate are
 * RSAJ's figures from the specification's examples, never seeded (the product ships no percentage).
 *
 *   Original contract sum                                  1,077,508.60
 *   Adjustments issued: +57,800.00 and −20,000.00  → net      37,800.00   → new sum 1,115,308.60
 *   Main contractor's works to date                          400,000.00
 *   Unfixed materials 20,000.00 at 75%                        15,000.00
 *   Nominated sub-contractors                                 30,000.00
 *   Nominated suppliers                                       10,000.00
 *   Gross value                                              455,000.00
 *   Retention 10%: (400,000 + 15,000) → 41,500.00; 30,000 → 3,000.00; 10,000 → 1,000.00   (cap 5% × 1,077,508.60 = 53,875.43, not reached)
 *   Previously certified                                     250,000.00
 *   Less                                                     295,500.00
 *   Carried forward                                          159,500.00
 *   Damages 10 days × 269.38 = 2,693.80, rounding +0.20; advance recouped 5,000.00; premiums 1,200.00
 *   Total deductions                                           8,894.00
 *   Payment recommended                                      150,606.00
 */

const s = (v: string): Sen => parseSen(v);
const money = (v: Sen | null | undefined) => (v == null ? null : senToDecimalString(v));
const RETENTION = retentionReading({ applies: true, percent: "10", capPercent: "5", source: "AWARD" });
const material = (value: string, over: Partial<MaterialLine> = {}): MaterialLine => ({ value: s(value), protectedOnSite: true, notTooEarly: true, formsPartOfWorks: true, temporary: false, submittedOn: "2026-07-10", ...over });
const LAD = ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-07-10", chargedUntil: null, decision: { outcome: "LAD_APPLIES", reason: "Not entitled to an extension", certificateIssued: true, from: "2026-07-01", until: null, rate: s("269.38") } });

const pct = materialsPct(null, "75");
const mats = materialsAllowance([material("20000.00")], pct);
const WORKED: InterimInput = {
  computedOn: "2026-07-12",
  originalSum: s("1077508.60"),
  adjustments: [s("57800.00"), s("-20000.00")],
  mainWorks: s("400000.00"),
  materials: { ...mats, pct },
  nominated: { NSC: s("30000.00"), NS: s("10000.00") },
  retention: RETENTION,
  released: ZERO_TIERS,
  previous: s("250000.00"),
  previousGross: s("300000.00"),
  lad: LAD,
  ladRounding: s("0.20"),
  advance: { main: s("5000.00"), nsc: 0n },
  premiums: s("1200.00"),
  wages: 0n,
  nonCompliance: 0n,
  others: [],
};

describe("the worked example (§8.3, plan A3)", () => {
  const r = interimCertificate(WORKED);
  const f = r.figures!;
  it("computes it line by line, to the sen", () => {
    expect(r.faults).toEqual([]);
    expect(money(f.newSum)).toBe("1115308.60");
    expect(money(mats.allowance)).toBe("15000.00");
    expect(money(f.gross)).toBe("455000.00");
    expect([f.held.net.MAIN, f.held.net.NSC, f.held.net.NS].map(money)).toEqual(["41500.00", "3000.00", "1000.00"]);
    expect(money(f.held.cap)).toBe("53875.43");
    expect(f.held.capped).toBe(false);
    expect(money(f.less)).toBe("295500.00");
    expect(money(f.carryForward)).toBe("159500.00");
    expect(money(f.ladAmount)).toBe("2693.80");
    expect(money(f.deductions)).toBe("8894.00");
    expect(money(f.recommended)).toBe("150606.00");
    expect(money(f.grossThisPeriod)).toBe("155000.00");
  });

  it("hands the core a sound snapshot whose totals the core recomputes to the same figures (never keyed)", () => {
    const snap = r.snapshot!;
    expect(snapshotFaults(snap)).toEqual([]);
    const totals = totalsFrom(snap, new Map(snap.lines.map((l) => [l.key, l.value])));
    expect(totals.get("newContractSum")).toBe("1115308.60");
    expect(totals.get("gross")).toBe("455000.00");
    expect(totals.get("less")).toBe("295500.00");
    expect(totals.get("carryForward")).toBe("159500.00");
    expect(totals.get("totalDeductions")).toBe("8894.00");
    expect(totals.get("recommended")).toBe("150606.00");
    // The damages block reproduces the printed one: rate, from, to, days, waived, amount and the signed rounding apart.
    const v = (k: string) => snap.lines.find((l) => l.key === k)?.value;
    expect([v("ladRate"), v("ladFrom"), v("ladTo"), v("ladDays"), v("ladWaived"), v("ladAmount"), v("ladRounding")]).toEqual(["269.38", "2026-07-01", "2026-07-10", "10", "0.00", "2693.80", "0.20"]);
    expect(v("materialsPct")).toBe("75");
  });

  it("an overridden deduction recomputes the payment recommended; the computed lines feeding retention are not overridable", () => {
    const snap = r.snapshot!;
    const e = applyOverrides(snap, [{ fieldKey: "premiums", computed: "1200.00", overridden: "1000.00", justification: "Receipt shows 1,000.00", personName: "QS", recordedAt: new Date() }]);
    expect(e.totals.find((x) => x.key === "recommended")?.value).toBe("150806.00");
    expect(snap.lines.filter((l) => l.overridable).map((l) => l.key)).toEqual(["premiums", "wages", "nonCompliance"]);
  });
});

describe("changing any input recomputes (FR-PAY-012)", () => {
  it("more work this period raises gross, retention and the payment together", () => {
    const r = interimCertificate({ ...WORKED, mainWorks: s("410000.00") });
    expect(money(r.figures!.gross)).toBe("465000.00");
    expect(money(r.figures!.held.net.MAIN)).toBe("42500.00");
    expect(money(r.figures!.recommended)).toBe("159606.00");
  });

  it("the cap bites: main 600,000.00 at 10% = 60,000.00 is more than 5% × 1,077,508.60 = 53,875.43, so 53,875.43 is held", () => {
    const r = interimCertificate({ ...WORKED, mainWorks: s("600000.00"), materials: { eligibleValue: 0n, allowance: 0n, pct }, nominated: { NSC: 0n, NS: 0n } });
    expect(money(r.figures!.held.computed.MAIN)).toBe("60000.00");
    expect(r.figures!.held.capped).toBe(true);
    expect(money(r.figures!.held.net.MAIN)).toBe("53875.43");
  });

  it("the cap shared across the tiers sums to the cap exactly", () => {
    const r = interimCertificate({ ...WORKED, mainWorks: s("500000.00"), nominated: { NSC: s("70000.00"), NS: s("33333.33") } });
    const h = r.figures!.held;
    expect(h.capped).toBe(true);
    expect(h.held.MAIN + h.held.NSC + h.held.NS).toBe(h.cap);
  });

  it("released retention comes off what is held and is paid through the certificate", () => {
    const r = interimCertificate({ ...WORKED, released: { MAIN: s("20750.00"), NSC: 0n, NS: 0n } });
    expect(money(r.figures!.held.net.MAIN)).toBe("20750.00");
    expect(money(r.figures!.recommended)).toBe("171356.00");
  });

  it("no retention in the band: no retention lines held, the certificate proceeds and says why", () => {
    const r = interimCertificate({ ...WORKED, retention: retentionReading({ applies: false, percent: null, capPercent: null, source: "DERIVED" }) });
    expect(r.faults).toEqual([]);
    expect(money(r.figures!.less)).toBe("250000.00");
    expect(r.snapshot!.lines.find((l) => l.key === "retentionNote")?.value).toMatch(/terms band holds none/);
  });
});

describe("refusals, each naming its rule", () => {
  const codes = (i: InterimInput) => interimCertificate(i).faults.map((f) => f.code);
  it("retention unset refuses naming the field; never 0", () => {
    expect(codes({ ...WORKED, retention: retentionReading({ applies: null, percent: null, capPercent: null, source: null }) })).toEqual(["RETENTION_NOT_SET"]);
    expect(interimCertificate({ ...WORKED, retention: retentionReading({ applies: true, percent: null, capPercent: "5", source: "AWARD" }) }).faults[0].data).toEqual({ field: "retentionPercent" });
  });
  it("materials with no percentage set refuse the materials line (never 0%)", () => {
    const none = materialsPct(null, null);
    expect(codes({ ...WORKED, materials: { ...materialsAllowance([material("20000.00")], none), pct: none } })).toEqual(["MATERIALS_PCT_NOT_SET"]);
  });
  it("deductions above what is carried forward refuse: a certificate does not certify a negative payment", () => {
    expect(codes({ ...WORKED, wages: s("200000.00") })).toEqual(["RECOMMENDED_NEGATIVE"]);
  });
  it("a rounding with no damages line, more than three others, a negative input", () => {
    expect(codes({ ...WORKED, lad: { state: "NOT_DUE" } })).toEqual(["ROUNDING_WITHOUT_LAD"]);
    expect(codes({ ...WORKED, others: [1, 2, 3, 4].map((n) => ({ label: `o${n}`, amount: s("1.00") })) })).toEqual(["TOO_MANY_OTHER_DEDUCTIONS"]);
    expect(codes({ ...WORKED, wages: s("-1.00") })).toEqual(["NEGATIVE_INPUT"]);
  });
  it("more released than held refuses", () => {
    expect(codes({ ...WORKED, released: { MAIN: 0n, NSC: s("3000.01"), NS: 0n } })).toEqual(["RELEASED_MORE_THAN_HELD"]);
  });
});

describe("property: the certificate always balances (seeded, the same every run)", () => {
  let seed = 20261003;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const sen = (max: number) => BigInt(rand(max)) * 100n + BigInt(rand(100));
  it("recommended = gross − retention − previous − deductions, and the core's recomputed totals agree, on 500 sets", () => {
    for (let k = 0; k < 500; k++) {
      const i: InterimInput = { ...WORKED, mainWorks: sen(900_000), nominated: { NSC: sen(90_000), NS: sen(30_000) }, previous: sen(100_000), premiums: sen(500), wages: sen(500), advance: { main: sen(1_000), nsc: sen(200) }, ladRounding: BigInt(rand(99)) - 49n };
      const r = interimCertificate(i);
      if (!r.figures || !r.snapshot) {
        expect(r.faults.map((f) => f.code)).toEqual(["RECOMMENDED_NEGATIVE"]);
        continue;
      }
      const f = r.figures;
      expect(f.recommended).toBe(f.gross - (f.held.net.MAIN + f.held.net.NSC + f.held.net.NS) - i.previous - f.deductions);
      expect(f.held.held.MAIN + f.held.held.NSC + f.held.held.NS <= f.held.cap!).toBe(true);
      const totals = totalsFrom(r.snapshot, new Map(r.snapshot.lines.map((l) => [l.key, l.value])));
      expect(totals.get("recommended")).toBe(senToDecimalString(f.recommended));
      expect(snapshotFaults(r.snapshot)).toEqual([]);
    }
  });
});
