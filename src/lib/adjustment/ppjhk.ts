/**
 * The Certificate of Adjustment of Contract Sum (6.13 Part A step 4: FR-PAD-001–003, 005, 007; §8.8).
 *
 *   Nett 1.1 = Σ additions(1.1) − Σ omissions(1.1)      (variation-driven: each an issued Variation Order Certificate)
 *   Nett 1.2 = Σ additions(1.2) − Σ omissions(1.2)      (the other triggers, each with the basis of its calculation)
 *   Nett 1.3 = Nett 1.1 + Nett 1.2
 *   Revised  = original contract sum + Σ issued adjustments before it + Nett 1.3
 *
 * stated also in words, English and Malay, with the direction of this adjustment. It is the master record of the
 * contract sum's movement: an interim certificate reads the revised sum only from issued adjustment certificates,
 * never from a variation (FR-PAD-003), and one is needed even where a Variation Order Certificate exists for the same
 * change. Each trigger used must be one the contract's type adjusts its sum by (FR-PAD-001, the type's
 * `sumAdjustmentTriggers`; empty: not set, refused naming the setting). A price fluctuation (FR-PAD-005, partly met:
 * no formula engine, OQ-13) is keyed with the basis of its calculation, and only where the type provides for it.
 * Every figure is worked out in sen; nothing is keyed but the 1.2 lines' amounts and their bases. Pure.
 */

import type { ComputedSnapshot, FigureLine, FigureTotal } from "@/lib/certificate/snapshot";
import { parseSen, senToDecimalString, type Sen } from "@/lib/money";
import type { AdjustmentDirection, AdjustmentSection, AdjustmentTrigger, Day, Finding } from "@/lib/variation/types";

import { amountInWords } from "./words";

export interface AdjustmentLineIn {
  section: AdjustmentSection;
  trigger: AdjustmentTrigger;
  /// The variation's number (1.1), or the line's own reference (1.2).
  reference: string;
  description: string;
  direction: AdjustmentDirection;
  /// Above nothing: the direction says which way it moves the sum.
  amount: Sen;
  basis: string;
  /// 1.1: the issued Variation Order Certificate it is (by id).
  orderId?: string | null;
}

export interface AdjustmentFigures {
  add11: Sen;
  omit11: Sen;
  net11: Sen;
  add12: Sen;
  omit12: Sen;
  net12: Sen;
  net13: Sen;
  prior: Sen;
  revised: Sen;
}

const sum = (xs: readonly AdjustmentLineIn[], section: AdjustmentSection, dir: AdjustmentDirection) => xs.filter((l) => l.section === section && l.direction === dir).reduce((a, l) => a + l.amount, 0n);

export function adjustmentFigures(original: Sen, prior: readonly Sen[], lines: readonly AdjustmentLineIn[]): AdjustmentFigures {
  const add11 = sum(lines, "VARIATION", "ADDITION");
  const omit11 = sum(lines, "VARIATION", "OMISSION");
  const add12 = sum(lines, "OTHER", "ADDITION");
  const omit12 = sum(lines, "OTHER", "OMISSION");
  const net11 = add11 - omit11;
  const net12 = add12 - omit12;
  const net13 = net11 + net12;
  const p = prior.reduce((a, x) => a + x, 0n);
  return { add11, omit11, net11, add12, omit12, net12, net13, prior: p, revised: original + p + net13 };
}

export interface AdjustmentInput {
  /// The contract type's adjustment triggers (empty: not set).
  triggers: readonly AdjustmentTrigger[];
  lines: readonly AdjustmentLineIn[];
  /// Orders already on another adjustment certificate that is not void (by id).
  ordersAdjusted: readonly string[];
  /// Issued orders of the contract (by id): only an issued order is adjusted.
  ordersIssued: readonly string[];
  /// Another adjustment certificate of the contract in progress (not issued, not void), named; one at a time.
  inProgress: string | null;
  original: Sen;
  prior: readonly Sen[];
}

/// Why the adjustment cannot be raised.
export function adjustmentFaults(i: AdjustmentInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.inProgress) f("ADJUSTMENT_IN_PROGRESS", { adjustment: i.inProgress });
  if (i.triggers.length === 0) f("TRIGGERS_NOT_SET");
  if (i.lines.length === 0) f("NO_LINES");
  const seen = new Set<string>();
  for (const l of i.lines) {
    if (i.triggers.length && !i.triggers.includes(l.trigger)) f("TRIGGER_NOT_ALLOWED", { trigger: l.trigger });
    if (l.amount <= 0n) f("AMOUNT_NOT_POSITIVE", { reference: l.reference });
    if (l.section === "VARIATION") {
      if (l.trigger !== "VARIATION") f("SECTION_TRIGGER", { reference: l.reference });
      if (!l.orderId || !i.ordersIssued.includes(l.orderId)) f("ORDER_NOT_ISSUED", { reference: l.reference });
      else if (i.ordersAdjusted.includes(l.orderId) || seen.has(l.orderId)) f("ORDER_ALREADY_ADJUSTED", { reference: l.reference });
      if (l.orderId) seen.add(l.orderId);
    } else {
      if (l.trigger === "VARIATION") f("SECTION_TRIGGER", { reference: l.reference });
      if (!l.basis.trim()) f("BASIS_REQUIRED", { reference: l.reference });
      if (!l.reference.trim() || !l.description.trim()) f("FIELD_REQUIRED", { field: "line" });
    }
  }
  const fig = adjustmentFigures(i.original, i.prior, i.lines);
  if (out.length === 0 && fig.revised <= 0n) f("REVISED_NOT_POSITIVE", { revised: fig.revised.toString() });
  return dedupe(out);
}

function dedupe(fs: Finding[]): Finding[] {
  const seen = new Set<string>();
  return fs.filter((x) => {
    const k = `${x.code}|${JSON.stringify(x.data ?? {})}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const m = (key: string, en: string, ms: string, v: Sen): FigureLine => ({ key, labelEn: en, labelMs: ms, type: "MONEY", value: senToDecimalString(v), overridable: false });
const text = (key: string, en: string, ms: string, value: string, valueMs?: string): FigureLine => ({ key, labelEn: en, labelMs: ms, type: "TEXT", value, ...(valueMs !== undefined ? { valueMs } : {}), overridable: false });
const t = (key: string, en: string, ms: string, terms: [string, 1 | -1][]): FigureTotal => ({ key, labelEn: en, labelMs: ms, terms: terms.map(([k, sign]) => ({ key: k, sign })) });

const TRIGGER_EN: Readonly<Record<AdjustmentTrigger, [string, string]>> = {
  VARIATION: ["Variation of works", "Perubahan kerja"],
  LOSS_AND_EXPENSE: ["Loss and expense", "Kerugian dan perbelanjaan"],
  REMEASUREMENT: ["Re-measurement of provisional quantities", "Pengukuran semula kuantiti sementara"],
  PC_AND_PROVISIONAL_SUMS: ["Prime cost and provisional sums", "Wang kos prima dan wang peruntukan sementara"],
  PRICE_FLUCTUATION: ["Price fluctuation", "Turun naik harga"],
};

/// The certificate's figures: every line, the section totals, the reconciliation, and the revised sum in words.
export function adjustmentSnapshot(computedOn: Day, original: Sen, prior: readonly Sen[], lines: readonly AdjustmentLineIn[]): { snapshot: ComputedSnapshot; figures: AdjustmentFigures } {
  const fig = adjustmentFigures(original, prior, lines);
  const lineOf = (l: AdjustmentLineIn, n: number) => {
    const [en, ms] = TRIGGER_EN[l.trigger];
    const dirEn = l.direction === "ADDITION" ? "addition" : "omission";
    const dirMs = l.direction === "ADDITION" ? "penambahan" : "pengurangan";
    const sec = l.section === "VARIATION" ? "1.1" : "1.2";
    return m(`${l.section === "VARIATION" ? "v" : "o"}${l.direction === "ADDITION" ? "Add" : "Omit"}${n + 1}`, `${sec} ${l.reference}: ${l.description} (${en.toLowerCase()}, ${dirEn})`, `${sec} ${l.reference}: ${l.description} (${ms.toLowerCase()}, ${dirMs})`, l.amount);
  };
  const v = lines.filter((l) => l.section === "VARIATION");
  const o = lines.filter((l) => l.section === "OTHER");
  const vLines = v.map(lineOf);
  const oLines = o.map(lineOf);
  // A total names at least one line: where a section has none in a direction, a nil line says so.
  const nils: FigureLine[] = [];
  const keysOf = (xs: FigureLine[], dir: "Add" | "Omit", sec: "11" | "12"): [string, 1][] => {
    const keys = xs.filter((x) => x.key.includes(dir)).map((x) => [x.key, 1] as [string, 1]);
    if (keys.length) return keys;
    const key = `nil${sec}${dir}`;
    const [en, ms] = dir === "Add" ? ["additions", "penambahan"] : ["omissions", "pengurangan"];
    nils.push(m(key, `${sec === "11" ? "1.1" : "1.2"} ${en}: none`, `${sec === "11" ? "1.1" : "1.2"} ${ms}: tiada`, 0n));
    return [[key, 1]];
  };
  const bases: FigureLine[] = o.map((l, n) => text(`basis${n + 1}`, `Basis of calculation, ${l.reference}`, `Asas pengiraan, ${l.reference}`, l.basis.trim()));
  const dir13 = fig.net13 < 0n ? { en: "Omission", ms: "Pengurangan" } : { en: "Addition", ms: "Penambahan" };
  const abs13 = fig.net13 < 0n ? -fig.net13 : fig.net13;
  const totals: FigureTotal[] = [
    t("add11", "1.1 Additions (variations)", "1.1 Penambahan (perubahan kerja)", keysOf(vLines, "Add", "11")),
    t("omit11", "1.1 Omissions (variations)", "1.1 Pengurangan (perubahan kerja)", keysOf(vLines, "Omit", "11")),
    t("net11", "1.1 Nett variation adjustment", "1.1 Pelarasan bersih perubahan kerja", [["add11", 1], ["omit11", -1]]),
    t("add12", "1.2 Additions (other adjustments)", "1.2 Penambahan (pelarasan lain)", keysOf(oLines, "Add", "12")),
    t("omit12", "1.2 Omissions (other adjustments)", "1.2 Pengurangan (pelarasan lain)", keysOf(oLines, "Omit", "12")),
    t("net12", "1.2 Nett other adjustment", "1.2 Pelarasan bersih lain", [["add12", 1], ["omit12", -1]]),
    t("net13", "1.3 Total nett adjustment (1.1 + 1.2)", "1.3 Jumlah pelarasan bersih (1.1 + 1.2)", [["net11", 1], ["net12", 1]]),
    t("revisedSum", "Revised contract sum", "Harga kontrak disemak", [["originalSum", 1], ["priorAdjustments", 1], ["net13", 1]]),
  ];
  const outLines: FigureLine[] = [
    m("originalSum", "Original contract sum", "Harga kontrak asal", original),
    m("priorAdjustments", "Adjustments by earlier certificates (issued)", "Pelarasan oleh perakuan terdahulu (dikeluarkan)", fig.prior),
    ...vLines,
    ...oLines,
    ...nils,
    ...bases,
    text("direction", "This adjustment", "Pelarasan ini", dir13.en, dir13.ms),
    text("adjustmentInWords", "This adjustment, in words", "Pelarasan ini, dalam perkataan", `${dir13.en} of ${amountInWords(abs13, "en").replace(/^Ringgit/, "ringgit")}`, `${dir13.ms} sebanyak ${amountInWords(abs13, "ms").replace(/^Ringgit/, "ringgit")}`),
    text("revisedInWords", "Revised contract sum, in words", "Harga kontrak disemak, dalam perkataan", amountInWords(fig.revised, "en"), amountInWords(fig.revised, "ms")),
  ];
  return {
    snapshot: { version: 1, computedOn, rule: { en: "Adjustment of the contract sum: the original sum, the earlier issued adjustments and this one (1.1 variations, 1.2 other)", ms: "Pelarasan harga kontrak: harga asal, pelarasan terdahulu yang dikeluarkan dan pelarasan ini (1.1 perubahan kerja, 1.2 lain)" }, lines: outLines, totals, routingRatio: null },
    figures: fig,
  };
}

/// The net an issued adjustment certificate moved the sum by, read back from its issue snapshot's totals.
export function issuedNet(snapshot: unknown): Sen | null {
  const f = (snapshot as { figures?: { totals?: { key: string; value: string | null }[] } } | null)?.figures;
  const v = f?.totals?.find((x) => x.key === "net13")?.value ?? null;
  return v == null ? null : parseSen(v);
}
