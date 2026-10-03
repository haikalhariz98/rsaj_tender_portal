/**
 * The variation's certificates' figures and the Variation Order Certificate's rules (6.13 Part A step 4: FR-VAR-003,
 * 008, 018, 020, 021, 024; FR-PAD-004).
 *
 * The application (VO-660) and the order (VO-663) are certificates of the core: their figures are lines and totals
 * worked out here, frozen with them, money as decimal strings and every total recomputed from its lines. Neither is
 * signed before its approval: the application once its prior approval route is approved; the order once the value it
 * certifies is approved (the prior approval and any approved increase cover it, and the amount measured at agreed
 * rates is covered by an approved agreed-rate route; an exempt re-measurement's own route approved at the order's
 * value). An exempt variation of another category has no approval route by FR-VAR-004: its order is signed by the
 * S.O. after the recommending officer (FR-VAR-021), its exemption printed on it (BD-613-53). The order's description
 * is the instruction's, word for word (FR-VAR-020). Pure.
 */

import type { ComputedSnapshot, FigureLine, FigureTotal } from "@/lib/certificate/snapshot";
import { senToDecimalString, type Sen } from "@/lib/money";

import { approvedValue, priorApproved, routesOf, type VariationFacts } from "./application";
import type { AdjustmentDirection, Day, Finding } from "./types";

const m = (key: string, en: string, ms: string, v: Sen | null): FigureLine => ({ key, labelEn: en, labelMs: ms, type: "MONEY", value: v == null ? null : senToDecimalString(v), overridable: false });
const text = (key: string, en: string, ms: string, value: string, valueMs?: string): FigureLine => ({ key, labelEn: en, labelMs: ms, type: "TEXT", value, ...(valueMs !== undefined ? { valueMs } : {}), overridable: false });
const date = (key: string, en: string, ms: string, value: Day | null): FigureLine => ({ key, labelEn: en, labelMs: ms, type: "DATE", value, overridable: false });
const t = (key: string, en: string, ms: string, terms: [string, 1 | -1][]): FigureTotal => ({ key, labelEn: en, labelMs: ms, terms: terms.map(([k, sign]) => ({ key: k, sign })) });

export interface Bilingual {
  en: string;
  ms: string;
}

// ------------------------------------------------------------------ the application (VO-660)

export interface ApplicationFiguresInput {
  computedOn: Day;
  reference: string;
  original: Sen;
  /// The net of the issued adjustments of the contract sum (FR-PAD-003), and the revised sum it makes.
  adjustedNet: Sen;
  possessionDate: Day | null;
  dateForCompletion: Day | null;
  /// The extensions of time recorded on the contract, in words (none recorded yet: said so).
  extensions: Bilingual;
  progress: { pct: string; on: Day } | null;
  description: string;
  reason: string;
  estimate: Sen;
  /// The value the prior approval is sought at (the S.O.'s cap where set, else the estimate).
  routedValue: Sen;
  soDecision: Bilingual;
  thisPct: Bilingual;
  cumulative: Sen;
  cumulativePct: Bilingual;
  periodImplication: boolean;
  basis: Bilingual;
}

export function applicationFigures(i: ApplicationFiguresInput): ComputedSnapshot {
  const yes = i.periodImplication ? { en: "Yes", ms: "Ya" } : { en: "No", ms: "Tidak" };
  const lines: FigureLine[] = [
    m("originalSum", "Contract sum", "Harga kontrak", i.original),
    m("adjustedNet", "Net adjustment of the contract sum to date (issued adjustments)", "Pelarasan bersih harga kontrak setakat ini (pelarasan yang dikeluarkan)", i.adjustedNet),
    date("possessionDate", "Date of possession of site", "Tarikh milik tapak", i.possessionDate),
    date("dateForCompletion", "Original date for completion", "Tarikh siap asal", i.dateForCompletion),
    text("extensions", "Extension of time granted", "Lanjutan masa diberi", i.extensions.en, i.extensions.ms),
    ...(i.progress
      ? [{ key: "progressPct", labelEn: "Current progress (per cent)", labelMs: "Kemajuan semasa (peratus)", type: "PERCENT", value: i.progress.pct, overridable: false } as FigureLine, date("progressOn", "Progress as at", "Kemajuan pada", i.progress.on)]
      : [text("progressPct", "Current progress", "Kemajuan semasa", "No progress recorded", "Tiada kemajuan direkodkan")]),
    text("reference", "Variation number", "Nombor perubahan kerja", i.reference),
    text("description", "Description", "Keterangan", i.description),
    text("reason", "Reason it is done as a variation", "Sebab dibuat sebagai perubahan kerja", i.reason),
    m("estimate", "Estimated amount of this variation", "Anggaran amaun perubahan kerja ini", i.estimate),
    text("soDecision", "The S.O.'s decision", "Keputusan P.P.", i.soDecision.en, i.soDecision.ms),
    m("thisVariation", "This variation, as sent for approval", "Perubahan kerja ini, seperti dihantar untuk kelulusan", i.routedValue),
    text("thisPct", "Percentage of this variation", "Peratus perubahan kerja ini", i.thisPct.en, i.thisPct.ms),
    m("cumulative", "Cumulative approved variations to date", "Kumulatif perubahan kerja diluluskan setakat ini", i.cumulative),
    text("cumulativePct", "Cumulative percentage, with this variation", "Peratus kumulatif, termasuk perubahan kerja ini", i.cumulativePct.en, i.cumulativePct.ms),
    text("periodImplication", "Implication for the original contract period", "Implikasi kepada tempoh kontrak asal", yes.en, yes.ms),
    text("basis", "The percentage's basis (as set for the organisation)", "Asas peratus (seperti ditetapkan)", i.basis.en, i.basis.ms),
  ];
  const totals: FigureTotal[] = [
    t("revisedSum", "Revised contract sum (issued adjustments)", "Harga kontrak disemak (pelarasan yang dikeluarkan)", [["originalSum", 1], ["adjustedNet", 1]]),
    t("newSum", "New contract sum including this variation", "Harga kontrak baharu termasuk perubahan kerja ini", [["originalSum", 1], ["cumulative", 1], ["thisVariation", 1]]),
  ];
  return { version: 1, computedOn: i.computedOn, rule: { en: "Application to implement a variation: the contract sum, the cumulative approved variations and this variation", ms: "Permohonan melaksanakan perubahan kerja: harga kontrak, kumulatif perubahan kerja diluluskan dan perubahan kerja ini" }, lines, totals, routingRatio: null };
}

// ------------------------------------------------------------------ the order (VO-663)

export interface OrderLineIn {
  itemRef: string;
  description: string;
  /// "12.500 m³ at RM45.00, less 5%" (worked out by the caller in words).
  particulars: string;
  amount: Sen;
  direction: AdjustmentDirection;
}

export interface OrderFiguresInput {
  computedOn: Day;
  original: Sen;
  reference: string;
  instruction: { number: string; date: Day | null };
  description: string;
  clauseTitle: string;
  exemption: Bilingual | null;
  lines: readonly OrderLineIn[];
  approved: Sen;
  cumulative: Sen;
  cumulativePct: Bilingual;
  /// Which bands the cumulative percentage was read against (acceptance S-5).
  cumulativeBands: Bilingual;
}

export interface OrderTotals {
  additions: Sen;
  omissions: Sen;
  net: Sen;
  direction: AdjustmentDirection;
}

export const orderTotals = (lines: readonly Pick<OrderLineIn, "amount" | "direction">[]): OrderTotals => {
  const additions = lines.filter((l) => l.direction === "ADDITION").reduce((a, l) => a + l.amount, 0n);
  const omissions = lines.filter((l) => l.direction === "OMISSION").reduce((a, l) => a + l.amount, 0n);
  const net = additions - omissions;
  return { additions, omissions, net, direction: net < 0n ? "OMISSION" : "ADDITION" };
};

export function orderFigures(i: OrderFiguresInput): { snapshot: ComputedSnapshot; totals: OrderTotals } {
  const tot = orderTotals(i.lines);
  const dir = tot.direction === "ADDITION" ? { en: "Addition to the contract sum", ms: "Penambahan kepada harga kontrak" } : { en: "Omission from the contract sum", ms: "Pengurangan daripada harga kontrak" };
  const items = i.lines.map((l, n) => m(`item${n + 1}`, `${l.direction === "ADDITION" ? "Addition" : "Omission"}, item ${l.itemRef}: ${l.description} (${l.particulars})`, `${l.direction === "ADDITION" ? "Penambahan" : "Pengurangan"}, butiran ${l.itemRef}: ${l.description} (${l.particulars})`, l.amount));
  const lines: FigureLine[] = [
    text("reference", "Variation number", "Nombor perubahan kerja", i.reference),
    text("instructionNumber", "The S.O.'s instruction", "Arahan P.P.", i.instruction.number),
    date("instructionDate", "Date of the instruction", "Tarikh arahan", i.instruction.date),
    text("description", "Description of the work (as on the instruction)", "Keterangan kerja (seperti pada arahan)", i.description),
    text("direction", "Addition or omission", "Penambahan atau pengurangan", dir.en, dir.ms),
    text("clause", "Valued under", "Dinilai di bawah", i.clauseTitle),
    ...(i.exemption ? [text("exemption", "Exempt from prior approval", "Dikecualikan daripada kelulusan terdahulu", i.exemption.en, i.exemption.ms)] : []),
    m("originalSum", "Original contract sum", "Harga kontrak asal", i.original),
    ...items,
    m("additions", "Measured additions", "Penambahan diukur", tot.additions),
    m("omissions", "Measured omissions", "Pengurangan diukur", tot.omissions),
    m("approved", "Approved value of this variation (prior approval and increases)", "Nilai diluluskan perubahan kerja ini (kelulusan terdahulu dan tambahan)", i.approved),
    m("cumulative", "Cumulative approved variations to date", "Kumulatif perubahan kerja diluluskan setakat ini", i.cumulative),
    text("cumulativePct", "Cumulative percentage", "Peratus kumulatif", i.cumulativePct.en, i.cumulativePct.ms),
    text("cumulativeBands", "Percentage read against", "Peratus dibaca berdasarkan", i.cumulativeBands.en, i.cumulativeBands.ms),
  ];
  const totals: FigureTotal[] = [t("net", "Net value of this variation", "Nilai bersih perubahan kerja ini", [["additions", 1], ["omissions", -1]])];
  return { snapshot: { version: 1, computedOn: i.computedOn, rule: { en: "Variation Order Certificate: the measured additions less the measured omissions", ms: "Perakuan Perubahan Kerja: penambahan diukur tolak pengurangan diukur" }, lines, totals, routingRatio: null }, totals: tot };
}

/// Why an order cannot be raised now.
export function orderFaults(i: { v: VariationFacts; instructionIssued: boolean; orderLive: boolean; lines: number; description: string; instructionDescription: string; clauseChosen: boolean }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.v.status !== "SUPPORTED") return [{ code: "NOT_SUPPORTED_YET", level: "block", data: { status: i.v.status } }];
  if (!i.instructionIssued) return [{ code: "INSTRUCTION_NOT_ISSUED", level: "block" }];
  if (i.orderLive) f("ORDER_EXISTS");
  if (i.lines === 0) f("NO_MEASUREMENT");
  // FR-VAR-020: identical, word for word.
  if (i.description !== i.instructionDescription) f("DESCRIPTION_NOT_INSTRUCTION", { instruction: i.instructionDescription });
  if (!i.clauseChosen) f("FIELD_REQUIRED", { field: "valuationClauseId" });
  return out;
}

/// What the order's value must be covered by before it is signed (its approval of record).
export function orderApprovalFaults(i: { v: VariationFacts; net: Sen; agreedRateTotal: Sen }): Finding[] {
  const v = i.v;
  const out: Finding[] = [];
  const approvedAgreed = routesOf(v, "AGREED_RATE").filter((r) => r.status === "APPROVED").reduce((a, r) => a + r.value, 0n);
  if (i.agreedRateTotal > approvedAgreed) out.push({ code: "AGREED_RATE_BEYOND_APPROVAL", level: "block", data: { measured: i.agreedRateTotal.toString(), approved: approvedAgreed.toString() } });
  if (v.exemption === "REMEASUREMENT") {
    const abs = i.net < 0n ? -i.net : i.net;
    const r = routesOf(v, "REMEASUREMENT").filter((x) => x.status === "APPROVED" && x.value === abs);
    if (abs > 0n && r.length === 0) out.push({ code: "REMEASUREMENT_NOT_APPROVED", level: "block", data: { value: abs.toString() } });
    return out;
  }
  if (v.exemption != null) return out;
  if (!priorApproved(v)) return [...out, { code: "NOT_APPROVED", level: "block" }];
  const covered = approvedValue(v);
  if (i.net > covered) out.push({ code: "INCREASE_NOT_APPROVED", level: "block", data: { net: i.net.toString(), approved: covered.toString() } });
  return out;
}
