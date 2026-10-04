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
import { ladRoundingFaults } from "@/lib/lad/rounding";

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
  /// 6.13 Part B run 1b (FR-LAD-011; 613A-C2): one damages line per scope, each by rate segment, with the waivers
  /// applied. Given, it replaces `lad` in the figures (`lad` stays the frozen reading's primary line). Absent: Part A's
  /// one line, unchanged.
  ladScopes?: readonly ScopeFigure[];
  /// The damages returned on extensions of time (LAD_CREDIT), on this certificate.
  ladCredit?: Sen;
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

/// One scope's damages on the certificate (6.13 Part B run 1b).
export interface ScopeFigure {
  /// The scope in words ("the whole works", "Section 2: the pump house").
  label: string;
  state: "CHARGED" | "EXCUSED" | "NOTHING_TO_CHARGE" | "CLOSED_BY_EXTENSION";
  /// EXCUSED: the decision's reasons; CLOSED_BY_EXTENSION: the extension of time's number.
  reason?: string;
  segments: readonly { from: Day; to: Day; days: number; rate: Sen }[];
  waived: Sen;
  /// Gross less waived (negative where a waiver returns damages charged before).
  amount: Sen;
}

export interface InterimFigures {
  newSum: Sen;
  gross: Sen;
  held: Held;
  less: Sen;
  carryForward: Sen;
  ladAmount: Sen;
  /// 6.13 Part B run 1b: the damages returned on extensions of time (0 where none).
  ladCredit: Sen;
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
  const scoped = i.ladScopes ?? null;
  const lad = scoped ? null : i.lad.state === "CHARGED" ? i.lad : null;
  const anyCharged = scoped ? scoped.some((x) => x.state === "CHARGED") : !!lad;
  const ladAmount = scoped ? scoped.reduce((a, x) => a + x.amount, 0n) : lad ? lad.amount : 0n;
  const ladCredit = i.ladCredit ?? 0n;
  const otherTotal = i.others.reduce((a, o) => a + o.amount, 0n);
  const deductions = ladAmount + (anyCharged ? i.ladRounding : 0n) - ladCredit + i.advance.main + i.advance.nsc + i.premiums + i.wages + i.nonCompliance + otherTotal;
  const recommended = carryForward - deductions;
  const grossThisPeriod = gross - i.previousGross;
  if (!anyCharged && i.ladRounding !== 0n) faults.push({ code: "ROUNDING_WITHOUT_LAD", level: "block" });
  // BD-613-47: a rounding to the ringgit, never a waiver: −RM1.00 < rounding < RM1.00, and damages + rounding ≥ 0.
  // 6.13 Part B run 1b: damages a waiver took below nothing (a return) with no rounding keyed is not a rounding's fault.
  if (!(ladAmount < 0n && i.ladRounding === 0n)) faults.push(...ladRoundingFaults(ladAmount, anyCharged ? i.ladRounding : 0n));
  if (recommended < 0n) faults.push({ code: "RECOMMENDED_NEGATIVE", level: "block", data: { recommended: recommended.toString() } });
  const figures: InterimFigures = { newSum, gross, held, less, carryForward, ladAmount, ladCredit, deductions, recommended, grossThisPeriod };
  if (faults.some((f) => f.level === "block")) return { figures, snapshot: null, faults };

  const pctLine: FigureLine = { key: "materialsPct", labelEn: "Allowance on unfixed materials (per cent)", labelMs: "Elaun bahan tidak terpasang (peratus)", type: "PERCENT", value: i.materials.pct.state === "SET" ? i.materials.pct.pct : null, overridable: false };
  const retentionNote: FigureLine[] =
    i.retention.state === "NONE" ? [{ key: "retentionNote", labelEn: "Retention", labelMs: "Wang tahanan", type: "TEXT", value: i.retention.source === "DERIVED" ? "Does not apply: the contract's terms band holds none" : "Does not apply: as recorded at baseline, with its provenance", valueMs: i.retention.source === "DERIVED" ? "Tidak dikenakan: jalur terma kontrak tidak mengenakannya" : "Tidak dikenakan: seperti direkodkan dalam garis dasar, dengan sumbernya", overridable: false }] : [];
  const ladLines: FigureLine[] = scoped
    ? scopeFigureLines(scoped, i.ladRounding, ladCredit)
    : lad
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
      ? [{ key: "ladNote", labelEn: "Liquidated damages", labelMs: "Ganti rugi tertentu", type: "TEXT", value: `None: the delay is excusable or its entitlement pending (${i.lad.reason.trim() || "reason recorded with the decision"})`, valueMs: `Tiada: kelewatan boleh dimaafkan atau haknya belum diputuskan (${i.lad.reason.trim() || "sebab direkodkan bersama keputusan"})`, overridable: false }]
      : i.lad.state === "NOTHING_TO_CHARGE"
        ? [{ key: "ladNote", labelEn: "Liquidated damages", labelMs: "Ganti rugi tertentu", type: "TEXT", value: "None this certificate: every day of the window to its valuation day is charged already, or the window has not begun", valueMs: "Tiada bagi perakuan ini: setiap hari tempoh hingga hari penilaiannya telah dikenakan, atau tempoh belum bermula", overridable: false }]
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
    m("retentionMain", "Retention held after release: main contractor", "Wang tahanan dipegang selepas pelepasan: kontraktor utama", held.net.MAIN),
    m("retentionNsc", "Retention held after release: nominated sub-contractors", "Wang tahanan dipegang selepas pelepasan: subkontraktor dinamakan", held.net.NSC),
    m("retentionNs", "Retention held after release: nominated suppliers", "Wang tahanan dipegang selepas pelepasan: pembekal dinamakan", held.net.NS),
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
  const ladTerms: [string, 1 | -1][] = scoped ? scopeTerms(scoped, ladCredit) : lad ? [["ladAmount", 1], ["ladRounding", 1]] : [];
  const deductionTerms: [string, 1 | -1][] = [...ladTerms, ["advanceMain", 1], ["advanceNsc", 1], ["premiums", 1], ["wages", 1], ["nonCompliance", 1], ...others.map((o) => [o.key, 1] as [string, 1])];
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

/// The figure keys of scope `n` (0-based) and segment `k`: the first scope's first segment keeps Part A's keys, so a
/// certificate with one scope and one rate prints exactly as Part A's did.
const sfx = (n: number, k = 0) => `${n === 0 ? "" : `_${n + 1}`}${k === 0 ? "" : `s${k + 1}`}`;
const scopeLabel = (scopes: readonly ScopeFigure[], x: ScopeFigure, en: string, ms: string) => (scopes.length === 1 ? { en, ms } : { en: `${en.replace("Liquidated damages", `Liquidated damages, ${x.label}`)}`, ms: `${ms.replace("Ganti rugi tertentu", `Ganti rugi tertentu, ${x.label}`)}` });

/// 6.13 Part B run 1b: the damages lines, one block per scope (by segment), the rounding once, the credit.
function scopeFigureLines(scopes: readonly ScopeFigure[], rounding: Sen, credit: Sen): FigureLine[] {
  const out: FigureLine[] = [];
  scopes.forEach((x, n) => {
    const L = (en: string, ms: string) => scopeLabel(scopes, x, en, ms);
    if (x.state === "CHARGED") {
      x.segments.forEach((sg, k) => {
        const rate = L(k === 0 ? "Liquidated damages: rate a day (as on the Certificate of Non-Completion)" : "Liquidated damages: rate a day (as confirmed on partial occupation)", k === 0 ? "Ganti rugi tertentu: kadar sehari (seperti pada Perakuan Kerja Tidak Siap)" : "Ganti rugi tertentu: kadar sehari (seperti disahkan semasa pendudukan separa)");
        const from = L("Liquidated damages: from", "Ganti rugi tertentu: dari");
        const to = L("Liquidated damages: to", "Ganti rugi tertentu: hingga");
        const days = L("Liquidated damages: days charged", "Ganti rugi tertentu: hari dikenakan");
        out.push(m(`ladRate${sfx(n, k)}`, rate.en, rate.ms, sg.rate));
        out.push({ key: `ladFrom${sfx(n, k)}`, labelEn: from.en, labelMs: from.ms, type: "DATE", value: sg.from, overridable: false });
        out.push({ key: `ladTo${sfx(n, k)}`, labelEn: to.en, labelMs: to.ms, type: "DATE", value: sg.to, overridable: false });
        out.push({ key: `ladDays${sfx(n, k)}`, labelEn: days.en, labelMs: days.ms, type: "DAYS", value: String(sg.days), overridable: false });
      });
      const waived = L("Liquidated damages: waived", "Ganti rugi tertentu: dikecualikan");
      const amount = L("Liquidated damages", "Ganti rugi tertentu");
      out.push(m(`ladWaived${sfx(n)}`, waived.en, waived.ms, x.waived));
      out.push(m(`ladAmount${sfx(n)}`, amount.en, amount.ms, x.amount));
      return;
    }
    const note = L("Liquidated damages", "Ganti rugi tertentu");
    const text =
      x.state === "EXCUSED"
        ? { en: `None: the delay is excusable or its entitlement pending (${x.reason?.trim() || "reason recorded with the decision"})`, ms: `Tiada: kelewatan boleh dimaafkan atau haknya belum diputuskan (${x.reason?.trim() || "sebab direkodkan bersama keputusan"})` }
        : x.state === "CLOSED_BY_EXTENSION"
          ? { en: `None: the decision was closed by the extension of time ${x.reason ?? ""}, and the new date for completion is not past`.replace("  ", " "), ms: `Tiada: keputusan ditutup oleh lanjutan masa ${x.reason ?? ""}, dan tarikh siap baharu belum berlalu`.replace("  ", " ") }
          : { en: "None this certificate: every day of the window to its valuation day is charged already, or the window has not begun", ms: "Tiada bagi perakuan ini: setiap hari tempoh hingga hari penilaiannya telah dikenakan, atau tempoh belum bermula" };
    out.push({ key: `ladNote${sfx(n)}`, labelEn: note.en, labelMs: note.ms, type: "TEXT", value: text.en, valueMs: text.ms, overridable: false });
    if (x.waived !== 0n) out.push(m(`ladAmount${sfx(n)}`, `${note.en}: waived, returned`, `${note.ms}: dikecualikan, dikembalikan`, x.amount));
  });
  if (scopes.some((x) => x.state === "CHARGED")) out.push(m("ladRounding", "Liquidated damages: rounding", "Ganti rugi tertentu: pelarasan pembundaran", rounding));
  if (credit !== 0n) out.push(m("ladCredit", "Damages returned on extension of time", "Ganti rugi dikembalikan atas lanjutan masa", credit));
  return out;
}

function scopeTerms(scopes: readonly ScopeFigure[], credit: Sen): [string, 1 | -1][] {
  const out: [string, 1 | -1][] = [];
  scopes.forEach((x, n) => {
    if (x.state === "CHARGED" || x.waived !== 0n) out.push([`ladAmount${sfx(n)}`, 1]);
  });
  if (scopes.some((x) => x.state === "CHARGED")) out.push(["ladRounding", 1]);
  if (credit !== 0n) out.push(["ladCredit", -1]);
  return out;
}

/// BD-613-47: the signed rounding on the damages line (a rounding to the ringgit, never a waiver). The rule moved to
/// lad/rounding.ts at 6.13 Part B run 0 (BD-613-92: §8.9 and the final account read the same rule); re-exported here so
/// Part A's callers and tests are unchanged.
export { LAD_ROUNDING_LIMIT, ladRoundingFaults } from "@/lib/lad/rounding";
