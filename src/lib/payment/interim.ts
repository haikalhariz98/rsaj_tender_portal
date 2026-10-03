/**
 * The interim payment certificate's arithmetic (6.13 Part A step 3: FR-PAY-011, 012; §8.3, the B.INT block).
 *
 *   net adjustment      = Σ issued adjustments of the contract sum (PPJHK, read only from issued ones, FR-PAD-003)
 *   new contract sum    = original + net adjustment
 *   gross value         = main contractor's works + materials allowance + nominated sub-contractors + suppliers
 *   less                = retention (main, NSC, NS: held to date after the cap, less what was released) + previously certified
 *   carried forward     = gross − less
 *   deductions          = damages (rate × days − waived) + rounding + advance recouped (main, NSC) + premiums and
 *                         social security paid by the employer + wages paid by the employer + costs of non-compliance
 *                         + up to three other permitted deductions
 *   recommended payment = carried forward − deductions
 *
 * Every total is computed, never keyed, and handed to the certificate core as a total (recomputed from its lines
 * whenever it is read: the workbook's two re-keyed totals are not ported). Changing any input recomputes. "Previously
 * certified" is the sum of what earlier issued certificates carried forward (so a deduction made once stays made);
 * the gross this period (gross less the previous certificate's gross) is a total too, for the route figure (OD-A6).
 * Money is sen; each figure is rounded once, half up to the sen, where its rule states it (retention, the materials
 * allowance); nothing passes through a float. Pure.
 */

import type { ComputedSnapshot, FigureLine, FigureTotal } from "@/lib/certificate/snapshot";
import { senToDecimalString, type Sen } from "@/lib/money";

import type { LadLine } from "@/lib/lad/charge";

import { type MaterialsPct } from "./materials";
import { overReleased, retentionHeld, retentionFaults, type Held, type RetentionReading, type Tiers } from "./retention";
import type { Day, Finding, WaterfallRemainder } from "./types";

export interface InterimInput {
  computedOn: Day;
  /// The pinned baseline's contract sum.
  originalSum: Sen;
  /// The net of each issued adjustment of the contract sum.
  adjustments: readonly Sen[];
  /// The main contractor's work executed, to date.
  mainWorks: Sen;
  materials: { eligibleValue: Sen; allowance: Sen | null; pct: MaterialsPct };
  /// The nominated sub-contractors' and suppliers' values, to date.
  nominated: { NSC: Sen; NS: Sen };
  retention: RetentionReading;
  /// Released to date, per tier (on or before the valuation day).
  released: Tiers;
  /// Σ what earlier issued interim certificates carried forward, and the latest one's gross.
  previous: Sen;
  previousGross: Sen;
  lad: LadLine;
  /// The signed rounding on the damages line (keyed, kept apart).
  ladRounding: Sen;
  advance: { main: Sen; nsc: Sen };
  /// Keyed (or recorded elsewhere and read): premiums and social security, wages, non-compliance, the others (≤ 3).
  premiums: Sen;
  /// Where a capped retention's leftover sen go: the payment waterfall's configured rule (OD-A4, BD-613-28 as amended).
  remainder?: WaterfallRemainder | null;
  /// Of `premiums`, what the employer paid and this certificate recovers (tied to it at raising): an override of the
  /// premiums line may correct only the keyed part, never below this (code review run 2, item 3).
  premiumsPending?: Sen;
  wages: Sen;
  nonCompliance: Sen;
  others: readonly { label: string; amount: Sen }[];
}

export interface InterimFigures {
  newSum: Sen;
  gross: Sen;
  held: Held;
  less: Sen;
  carryForward: Sen;
  ladAmount: Sen;
  deductions: Sen;
  recommended: Sen;
  grossThisPeriod: Sen;
}

export interface InterimResult {
  figures: InterimFigures | null;
  snapshot: ComputedSnapshot | null;
  faults: Finding[];
}

export const MAX_OTHER_DEDUCTIONS = 3;

const m = (key: string, en: string, ms: string, v: Sen | null, overridable = false): FigureLine => ({ key, labelEn: en, labelMs: ms, type: "MONEY", value: v == null ? null : senToDecimalString(v), overridable });
const t = (key: string, en: string, ms: string, terms: [string, 1 | -1][]): FigureTotal => ({ key, labelEn: en, labelMs: ms, terms: terms.map(([k, sign]) => ({ key: k, sign })) });

export function interimCertificate(i: InterimInput): InterimResult {
  const faults: Finding[] = [...retentionFaults(i.retention)];
  if (i.materials.allowance == null) faults.push({ code: "MATERIALS_PCT_NOT_SET", level: "block" });
  if (i.others.length > MAX_OTHER_DEDUCTIONS) faults.push({ code: "TOO_MANY_OTHER_DEDUCTIONS", level: "block", data: { max: MAX_OTHER_DEDUCTIONS } });
  for (const [k, v] of [["mainWorks", i.mainWorks], ["nsc", i.nominated.NSC], ["ns", i.nominated.NS], ["premiums", i.premiums], ["wages", i.wages], ["nonCompliance", i.nonCompliance], ...i.others.map((o) => ["other", o.amount] as const)] as const) {
    if (v < 0n) faults.push({ code: "NEGATIVE_INPUT", level: "block", data: { field: k } });
  }
  if (faults.some((f) => f.level === "block")) return { figures: null, snapshot: null, faults };

  const allowance = i.materials.allowance!;
  const newSum = i.adjustments.reduce((a, x) => a + x, i.originalSum);
  const gross = i.mainWorks + allowance + i.nominated.NSC + i.nominated.NS;
  const held = retentionHeld(i.retention, i.originalSum, { MAIN: i.mainWorks + allowance, NSC: i.nominated.NSC, NS: i.nominated.NS }, i.released, i.remainder ?? null);
  if (held.faults.length) return { figures: null, snapshot: null, faults: held.faults };
  const over = overReleased(held);
  if (over.length) return { figures: null, snapshot: null, faults: [{ code: "RELEASED_MORE_THAN_HELD", level: "block", data: { tiers: over.join(",") } }] };
  const less = held.net.MAIN + held.net.NSC + held.net.NS + i.previous;
  const carryForward = gross - less;
  const lad = i.lad.state === "CHARGED" ? i.lad : null;
  const ladAmount = lad ? lad.amount : 0n;
  const otherTotal = i.others.reduce((a, o) => a + o.amount, 0n);
  const deductions = ladAmount + (lad ? i.ladRounding : 0n) + i.advance.main + i.advance.nsc + i.premiums + i.wages + i.nonCompliance + otherTotal;
  const recommended = carryForward - deductions;
  const grossThisPeriod = gross - i.previousGross;
  if (!lad && i.ladRounding !== 0n) faults.push({ code: "ROUNDING_WITHOUT_LAD", level: "block" });
  // BD-613-47: a rounding to the ringgit, never a waiver: −RM1.00 < rounding < RM1.00, and damages + rounding ≥ 0.
  faults.push(...ladRoundingFaults(ladAmount, lad ? i.ladRounding : 0n));
  if (recommended < 0n) faults.push({ code: "RECOMMENDED_NEGATIVE", level: "block", data: { recommended: recommended.toString() } });
  const figures: InterimFigures = { newSum, gross, held, less, carryForward, ladAmount, deductions, recommended, grossThisPeriod };
  if (faults.some((f) => f.level === "block")) return { figures, snapshot: null, faults };

  const pctLine: FigureLine = { key: "materialsPct", labelEn: "Allowance on unfixed materials (per cent)", labelMs: "Elaun bahan tidak terpasang (peratus)", type: "PERCENT", value: i.materials.pct.state === "SET" ? i.materials.pct.pct : null, overridable: false };
  const retentionNote: FigureLine[] =
    i.retention.state === "NONE" ? [{ key: "retentionNote", labelEn: "Retention", labelMs: "Wang tahanan", type: "TEXT", value: i.retention.source === "DERIVED" ? "Does not apply: the contract's terms band holds none" : "Does not apply: as recorded at baseline, with its provenance", overridable: false }] : [];
  const ladLines: FigureLine[] = lad
    ? [
        m("ladRate", "Liquidated damages: rate a day (as on the Certificate of Non-Completion)", "Ganti rugi tertentu: kadar sehari (seperti pada Perakuan Kerja Tidak Siap)", lad.rate),
        { key: "ladFrom", labelEn: "Liquidated damages: from", labelMs: "Ganti rugi tertentu: dari", type: "DATE", value: lad.from, overridable: false },
        { key: "ladTo", labelEn: "Liquidated damages: to", labelMs: "Ganti rugi tertentu: hingga", type: "DATE", value: lad.to, overridable: false },
        { key: "ladDays", labelEn: "Liquidated damages: days charged", labelMs: "Ganti rugi tertentu: hari dikenakan", type: "DAYS", value: String(lad.days), overridable: false },
        m("ladWaived", "Liquidated damages: waived", "Ganti rugi tertentu: dikecualikan", lad.waived),
        m("ladAmount", "Liquidated damages", "Ganti rugi tertentu", lad.amount),
        m("ladRounding", "Liquidated damages: rounding", "Ganti rugi tertentu: pelarasan pembundaran", i.ladRounding),
      ]
    : i.lad.state === "EXCUSED"
      ? [{ key: "ladNote", labelEn: "Liquidated damages", labelMs: "Ganti rugi tertentu", type: "TEXT", value: `None: the delay is excusable or its entitlement pending (${i.lad.reason.trim() || "reason recorded with the decision"})`, overridable: false }]
      : i.lad.state === "NOTHING_TO_CHARGE"
        ? [{ key: "ladNote", labelEn: "Liquidated damages", labelMs: "Ganti rugi tertentu", type: "TEXT", value: "None this certificate: every day of the window to its valuation day is charged already, or the window has not begun", overridable: false }]
        : [];
  const others = i.others.map((o, n) => m(`other${n + 1}`, `Other deduction: ${o.label}`, `Potongan lain: ${o.label}`, o.amount, true));
  const lines: FigureLine[] = [
    m("originalSum", "Original contract sum", "Harga kontrak asal", i.originalSum),
    m("netAdjustment", "Net adjustment of the contract sum (issued adjustments)", "Pelarasan bersih harga kontrak (pelarasan yang dikeluarkan)", newSum - i.originalSum),
    m("mainWorks", "Work executed by the main contractor, to date", "Kerja dilaksanakan oleh kontraktor utama, setakat ini", i.mainWorks),
    m("materialsValue", "Unfixed materials and goods on site, eligible", "Bahan dan barang tidak terpasang di tapak, layak", i.materials.eligibleValue),
    pctLine,
    m("materialsAllowance", "Allowance on unfixed materials", "Elaun bahan tidak terpasang", allowance),
    m("nscWorks", "Nominated sub-contractors, to date", "Subkontraktor dinamakan, setakat ini", i.nominated.NSC),
    m("nsWorks", "Nominated suppliers, to date", "Pembekal dinamakan, setakat ini", i.nominated.NS),
    m("retentionMain", "Retention: main contractor", "Wang tahanan: kontraktor utama", held.net.MAIN),
    m("retentionNsc", "Retention: nominated sub-contractors", "Wang tahanan: subkontraktor dinamakan", held.net.NSC),
    m("retentionNs", "Retention: nominated suppliers", "Wang tahanan: pembekal dinamakan", held.net.NS),
    ...retentionNote,
    m("retentionReleased", "Retention released to date (paid through this and earlier certificates)", "Wang tahanan dilepaskan setakat ini", held.released.MAIN + held.released.NSC + held.released.NS),
    m("previous", "Previously certified", "Telah diperakui terdahulu", i.previous),
    ...ladLines,
    m("advanceMain", "Advance recouped: main contractor", "Bayaran pendahuluan dipulihkan: kontraktor utama", i.advance.main),
    m("advanceNsc", "Advance recouped: nominated sub-contractors", "Bayaran pendahuluan dipulihkan: subkontraktor dinamakan", i.advance.nsc),
    {
      ...m("premiums", "Insurance premiums and social security paid by the employer", "Premium insurans dan PERKESO dibayar oleh majikan", i.premiums, true),
      ...((i.premiumsPending ?? 0n) > 0n ? { floor: { value: senToDecimalString(i.premiumsPending!), en: "the premiums the employer paid and this certificate recovers (recorded under Site); only the keyed part may be corrected", ms: "premium yang dibayar oleh majikan dan dipulihkan oleh perakuan ini" } } : {}),
    },
    m("wages", "Workers' wages paid by the employer", "Upah pekerja dibayar oleh majikan", i.wages, true),
    m("nonCompliance", "Costs of the contractor's failure to comply with instructions", "Kos kegagalan kontraktor mematuhi arahan", i.nonCompliance, true),
    ...others,
    m("previousGross", "Gross value on the previous certificate", "Nilai kasar pada perakuan terdahulu", i.previousGross),
  ];
  const deductionTerms: [string, 1 | -1][] = [...(lad ? ([["ladAmount", 1], ["ladRounding", 1]] as [string, 1][]) : []), ["advanceMain", 1], ["advanceNsc", 1], ["premiums", 1], ["wages", 1], ["nonCompliance", 1], ...others.map((o) => [o.key, 1] as [string, 1])];
  const totals: FigureTotal[] = [
    t("newContractSum", "New contract sum", "Harga kontrak baharu", [["originalSum", 1], ["netAdjustment", 1]]),
    t("gross", "Gross value of work to date", "Nilai kasar kerja setakat ini", [["mainWorks", 1], ["materialsAllowance", 1], ["nscWorks", 1], ["nsWorks", 1]]),
    t("less", "Less retention and previously certified", "Tolak wang tahanan dan yang telah diperakui", [["retentionMain", 1], ["retentionNsc", 1], ["retentionNs", 1], ["previous", 1]]),
    t("carryForward", "Carried forward", "Dibawa ke hadapan", [["gross", 1], ["less", -1]]),
    t("totalDeductions", "Total deductions", "Jumlah potongan", deductionTerms),
    t("recommended", "Payment recommended", "Bayaran yang disyorkan", [["carryForward", 1], ["totalDeductions", -1]]),
    t("grossThisPeriod", "Gross value this period", "Nilai kasar tempoh ini", [["gross", 1], ["previousGross", -1]]),
  ];
  const snapshot: ComputedSnapshot = {
    version: 1,
    computedOn: i.computedOn,
    rule: { en: "Interim valuation: gross value less retention and previous payments, less the deductions", ms: "Penilaian interim: nilai kasar tolak wang tahanan dan bayaran terdahulu, tolak potongan" },
    lines,
    totals,
    routingRatio: null,
  };
  return { figures, snapshot, faults };
}

/// BD-613-47: the signed rounding on the damages line is a rounding to the ringgit (the worked example's +0.20
/// brings 2,693.80 to 2,694.00), never a waiver: strictly between −RM1.00 and RM1.00, and never taking the damages
/// below nothing. RM1.00 is the definition of the rounding, not a customer threshold.
export const LAD_ROUNDING_LIMIT: Sen = 100n;
export function ladRoundingFaults(damages: Sen, rounding: Sen): Finding[] {
  const out: Finding[] = [];
  if (rounding <= -LAD_ROUNDING_LIMIT || rounding >= LAD_ROUNDING_LIMIT) out.push({ code: "LAD_ROUNDING_OUT_OF_RANGE", level: "block", data: { rounding: rounding.toString() } });
  if (damages + rounding < 0n) out.push({ code: "LAD_ROUNDING_BELOW_NOTHING", level: "block", data: { damages: damages.toString(), rounding: rounding.toString() } });
  return out;
}
