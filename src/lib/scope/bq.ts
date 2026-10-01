/**
 * The bill of quantities (FR-EST-001 core, 002, 003). Pure.
 *
 * Every amount is worked out here, in sen, from a quantity and a rate, and never keyed: a
 * line's amount is `itemAmount`, the bill's totals are `bqTotals`, and a figure typed beside
 * them is only ever compared (`keyedMismatch`) and then ignored. A quantity is held as an
 * integer number of thousandths, never as a float; the product is rounded once, half up, to
 * the sen (`lineAmount`, shared with requisition lines).
 *
 * The bill's versions: one draft at a time; a draft is edited, then finalised once, frozen
 * with its totals and its preparer's qualification as they stood; a revision is a new draft
 * copied from the latest finalised version, and finalising it supersedes that one.
 */

import { dayIn } from "@/lib/dates";
import { fitsMoneyColumn, senToDecimalString, type Sen } from "@/lib/money";
import { lineAmount } from "@/lib/requisition/lines";
import type { ExerciseStatus } from "@/lib/method/types";

import type { BqLine, BqScopedBy, BqStatus, Finding, QualificationHolding, QualificationRow, ScopePolicy } from "./types";

/// A line's amount: quantity (to three places) times rate (sen), half up to the sen. Null
/// until both are given, or when the quantity is not a non-negative decimal of three places at most.
export function itemAmount(quantity: string | null, rate: Sen | null): Sen | null {
  if (quantity == null || rate == null || rate < 0n) return null;
  return lineAmount(quantity, senToDecimalString(rate));
}

/// Whether a quantity is one the bill accepts: a non-negative decimal, three places at most.
/// Its size is judged apart (`lineSizeFaults`), so a too-large quantity says so, not "not a number".
export const isQuantity = (q: string) => /^\d+(?:\.\d{1,3})?$/.test(q.replace(/,/g, "").trim());

/// `BqItem.quantity` is `Decimal(18, 3)`: 15 digits before the point.
export const QUANTITY_COLUMN_MAX_WHOLE = 10n ** 15n - 1n;

/// Whether a quantity (as `isQuantity` accepts it) fits its column. Leading zeros do not count.
export function quantityFits(q: string): boolean {
  const whole = q.replace(/,/g, "").trim().split(".")[0];
  return /^\d+$/.test(whole) && BigInt(whole) <= QUANTITY_COLUMN_MAX_WHOLE;
}

export type LineSizeField = "quantity" | "rate" | "amount";

/**
 * Whether a line's figures fit the columns they are stored in (quantity `Decimal(18, 3)`,
 * rate and amount `Decimal(18, 2)`), so a figure that would overflow is refused by name
 * rather than failing the save. The amount is checked too: two figures that each fit can
 * multiply past the column.
 */
export function lineSizeFaults(quantity: string | null, rate: Sen | null): (Finding<"TOO_LARGE"> & { field: LineSizeField })[] {
  const out: (Finding<"TOO_LARGE"> & { field: LineSizeField })[] = [];
  if (quantity != null && isQuantity(quantity) && !quantityFits(quantity)) out.push({ code: "TOO_LARGE", level: "block", field: "quantity", data: { field: "quantity" } });
  if (rate != null && !fitsMoneyColumn(rate)) out.push({ code: "TOO_LARGE", level: "block", field: "rate", data: { field: "rate" } });
  if (out.length === 0) {
    const amount = itemAmount(quantity, rate);
    if (amount != null && !fitsMoneyColumn(amount)) out.push({ code: "TOO_LARGE", level: "block", field: "amount", data: { field: "amount" } });
  }
  return out;
}

/// A figure typed beside a computed one: reported when it differs, never used.
export function keyedMismatch(keyed: Sen | null, computed: Sen | null): { keyed: Sen; computed: Sen | null } | null {
  if (keyed == null) return null;
  return keyed === computed ? null : { keyed, computed };
}

export interface BqTotals {
  /// Measured work that is not provisional.
  measuredFirm: Sen;
  /// Measured work marked provisional (FR-EST-002).
  provisionalQuantities: Sen;
  primeCostSums: Sen;
  provisionalSums: Sen;
  total: Sen;
  /// §8.3: the total less prime cost and provisional sums.
  buildersWorks: Sen;
  /// OD-7: the total less provisional quantities where the bill says they are left out of
  /// the firm value, the total where it says they are not, null where it does not say.
  firmValue: Sen | null;
  /// Provisional quantities as a percentage of the total, four places. Null on a zero total.
  provisionalSharePct: string | null;
  /// Lines with no amount yet (a quantity or a rate missing): not in any total.
  incompleteLines: number;
}

/**
 * A part as a percentage of a whole, to four decimal places, half up — exactly, in integers.
 * Null when the whole is zero or less (no share of nothing is stated). The 30% routing that
 * reads it stays in 6.13's configured rows; nothing here compares it with a threshold.
 */
export function sharePct(part: Sen, whole: Sen): string | null {
  if (whole <= 0n) return null;
  const negative = part < 0n;
  const abs = negative ? -part : part;
  // Percent to four places: part * 100 * 10^4 / whole, rounded half up.
  const scaled = (abs * 1_000_000n * 2n + whole) / (whole * 2n);
  const whole4 = scaled / 10_000n;
  const frac = (scaled % 10_000n).toString().padStart(4, "0");
  return `${negative && scaled !== 0n ? "-" : ""}${whole4}.${frac}`;
}

export function bqTotals(lines: readonly BqLine[], excludeProvisional: boolean | null): BqTotals {
  let measuredFirm = 0n;
  let provisionalQuantities = 0n;
  let primeCostSums = 0n;
  let provisionalSums = 0n;
  let incompleteLines = 0;
  for (const l of lines) {
    const a = itemAmount(l.quantity, l.rate);
    if (a == null) {
      incompleteLines++;
      continue;
    }
    switch (l.kind) {
      case "MEASURED":
        if (l.provisional) provisionalQuantities += a;
        else measuredFirm += a;
        break;
      case "PRIME_COST_SUM":
        primeCostSums += a;
        break;
      case "PROVISIONAL_SUM":
        provisionalSums += a;
        break;
    }
  }
  const total = measuredFirm + provisionalQuantities + primeCostSums + provisionalSums;
  return {
    measuredFirm,
    provisionalQuantities,
    primeCostSums,
    provisionalSums,
    total,
    buildersWorks: total - primeCostSums - provisionalSums,
    firmValue: excludeProvisional == null ? null : excludeProvisional ? total - provisionalQuantities : total,
    provisionalSharePct: sharePct(provisionalQuantities, total),
    incompleteLines,
  };
}

/// The totals as frozen on a finalised version: decimal strings, never floats.
export function totalsSnapshot(t: BqTotals) {
  const s = (x: Sen | null) => (x == null ? null : senToDecimalString(x));
  return {
    measuredFirm: s(t.measuredFirm),
    provisionalQuantities: s(t.provisionalQuantities),
    primeCostSums: s(t.primeCostSums),
    provisionalSums: s(t.provisionalSums),
    total: s(t.total),
    buildersWorks: s(t.buildersWorks),
    firmValue: s(t.firmValue),
    provisionalSharePct: t.provisionalSharePct,
  };
}

/**
 * The holding a person has of a qualification on a day. A holding counts from its first
 * day to its last, both inclusive (BD-62-4); one that ends the day before does not count.
 * A qualification the organisation has retired by that day counts for nobody.
 */
export function holdingOn(holdings: readonly QualificationHolding[], personId: string, code: string, day: string, qualifications: readonly QualificationRow[] = []): QualificationHolding | null {
  const q = qualifications.find((x) => x.code === code);
  if (q?.retiredOn && q.retiredOn <= day) return null;
  return holdings.find((h) => h.personId === personId && h.qualificationCode === code && h.validFrom <= day && (h.validTo == null || day <= h.validTo)) ?? null;
}

export type FinaliseFault =
  | "NOT_DRAFT"
  | "EXERCISE_CANCELLED"
  | "NO_ITEMS"
  | "ITEM_INCOMPLETE"
  | "SECTION_NUMBER_REPEATED"
  | "SCOPED_BY_NOT_SET"
  | "STANDARD_NOT_SET"
  | "STANDARD_UNANSWERED"
  | "DEPARTURES_REQUIRED"
  | "PREPARER_REQUIRED"
  | "QUALIFICATION_NOT_SET"
  | "PREPARER_NOT_QUALIFIED"
  | "TIME_ZONE_NOT_SET";

export interface BqVersionFacts {
  status: BqStatus;
  scopedBy: BqScopedBy | null;
  followsStandard: boolean | null;
  departuresText: string;
  preparerPersonId: string | null;
  lines: readonly BqLine[];
  /// Every section's number, in order. A number used twice makes the bill ambiguous.
  sectionNumbers: readonly string[];
}

/// Section numbers used more than once in a version (trimmed), each once, in order of first repeat.
export function repeatedSectionNumbers(numbers: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const n of numbers.map((x) => x.trim())) {
    if (seen.has(n) && !repeated.includes(n)) repeated.push(n);
    seen.add(n);
  }
  return repeated;
}

/**
 * Whether a draft may be finalised (FR-EST-001, 003). `today` is the organisation's day,
 * null while no time zone is set (the qualification is judged on that day, never on UTC's).
 * `provisionalExcludedFromFirm` unset does not block (OD-7): the firm value reads "Not stated".
 */
export function finaliseFaults(
  v: BqVersionFacts,
  ctx: { policy: ScopePolicy; holdings: readonly QualificationHolding[]; qualifications: readonly QualificationRow[]; today: string | null; exerciseStatus: ExerciseStatus },
): Finding<FinaliseFault>[] {
  if (v.status !== "DRAFT") return [{ code: "NOT_DRAFT", level: "block" }];
  const out: Finding<FinaliseFault>[] = [];
  if (ctx.exerciseStatus === "CANCELLED") out.push({ code: "EXERCISE_CANCELLED", level: "block" });
  if (v.lines.length === 0) out.push({ code: "NO_ITEMS", level: "block" });
  const incomplete = v.lines.filter((l) => !l.description.trim() || itemAmount(l.quantity, l.rate) == null);
  if (incomplete.length) out.push({ code: "ITEM_INCOMPLETE", level: "block", data: { count: incomplete.length, first: incomplete[0].itemRef || null } });
  const repeated = repeatedSectionNumbers(v.sectionNumbers);
  if (repeated.length) out.push({ code: "SECTION_NUMBER_REPEATED", level: "block", data: { numbers: repeated.join(", ") } });
  if (v.scopedBy == null) out.push({ code: "SCOPED_BY_NOT_SET", level: "block" });
  if (ctx.policy.measurementStandardLabel == null) out.push({ code: "STANDARD_NOT_SET", level: "block" });
  if (v.followsStandard == null) out.push({ code: "STANDARD_UNANSWERED", level: "block" });
  else if (!v.followsStandard && !v.departuresText.trim()) out.push({ code: "DEPARTURES_REQUIRED", level: "block" });
  const code = ctx.policy.bqPreparerQualificationCode;
  if (v.preparerPersonId == null) out.push({ code: "PREPARER_REQUIRED", level: "block" });
  if (code == null) out.push({ code: "QUALIFICATION_NOT_SET", level: "block" });
  if (ctx.today == null) out.push({ code: "TIME_ZONE_NOT_SET", level: "block" });
  else if (code != null && v.preparerPersonId != null && !holdingOn(ctx.holdings, v.preparerPersonId, code, ctx.today, ctx.qualifications)) {
    out.push({ code: "PREPARER_NOT_QUALIFIED", level: "block", data: { qualification: ctx.qualifications.find((q) => q.code === code)?.nameEn ?? null, on: ctx.today } });
  }
  return out;
}

/// What a finalised version keeps of its preparer's qualification, as it read that day.
export function qualificationSnapshot(holding: QualificationHolding, qualification: QualificationRow | undefined, day: string) {
  return { code: holding.qualificationCode, name: qualification?.nameEn ?? null, validFrom: holding.validFrom, validTo: holding.validTo, judgedOn: day };
}

/**
 * Whether the exercise's bill may be changed at all, by its status. Exhaustive over
 * ExerciseStatus (X-8): 6.4 adds its states here (the pack under approval refuses), and the
 * compiler names this switch when it does.
 */
export function exerciseAllowsBq(status: ExerciseStatus): "OPEN" | "EXERCISE_CANCELLED" {
  switch (status) {
    case "DRAFT":
    case "DOCUMENTS_IN_PREPARATION":
      return "OPEN";
    case "CANCELLED":
      return "EXERCISE_CANCELLED";
    default: {
      const never: never = status;
      return never;
    }
  }
}

export type DraftFault = "EXERCISE_CANCELLED" | "NOT_DRAFT" | "DRAFT_EXISTS" | "ALREADY_STARTED" | "NOTHING_FINALISED" | "REASON_REQUIRED";

/// Editing a version's lines or header: a draft only, on an exercise that is open.
export function draftEditFaults(v: { status: BqStatus }, exerciseStatus: ExerciseStatus): Finding<DraftFault>[] {
  const out: Finding<DraftFault>[] = [];
  if (exerciseAllowsBq(exerciseStatus) !== "OPEN") out.push({ code: "EXERCISE_CANCELLED", level: "block" });
  if (v.status !== "DRAFT") out.push({ code: "NOT_DRAFT", level: "block" });
  return out;
}

/// Starting the exercise's first bill: none yet, on an exercise that is open.
export function startBqFaults(versions: readonly { status: BqStatus }[], exerciseStatus: ExerciseStatus): Finding<DraftFault>[] {
  const out: Finding<DraftFault>[] = [];
  if (exerciseAllowsBq(exerciseStatus) !== "OPEN") out.push({ code: "EXERCISE_CANCELLED", level: "block" });
  if (versions.length > 0) out.push({ code: "ALREADY_STARTED", level: "block" });
  return out;
}

/**
 * Starting a revision: a new draft copied from the latest finalised version, with the
 * reason. Refused while a draft exists (at most one), before anything is finalised, and on
 * a closed exercise.
 */
export function reviseFaults(versions: readonly { status: BqStatus }[], exerciseStatus: ExerciseStatus, reason: string): Finding<DraftFault>[] {
  const out: Finding<DraftFault>[] = [];
  if (exerciseAllowsBq(exerciseStatus) !== "OPEN") out.push({ code: "EXERCISE_CANCELLED", level: "block" });
  if (versions.some((v) => v.status === "DRAFT")) out.push({ code: "DRAFT_EXISTS", level: "block" });
  else if (!versions.some((v) => v.status === "FINALISED")) out.push({ code: "NOTHING_FINALISED", level: "block" });
  if (!reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  return out;
}

/// The version a reader sees as the bill: the finalised one, else the draft, else none.
export function currentBq<V extends { status: BqStatus; versionNo: number }>(versions: readonly V[]): { finalised: V | null; draft: V | null } {
  const sorted = [...versions].sort((a, b) => b.versionNo - a.versionNo);
  return { finalised: sorted.find((v) => v.status === "FINALISED") ?? null, draft: sorted.find((v) => v.status === "DRAFT") ?? null };
}

/// A frozen bill as 6.4 issues it to tenderers (OD-8): every line's rate and amount, and every total, removed.
export interface FrozenBq {
  versionNo: number;
  sections: { number: string; title: string; items: (BqLine & { amount?: Sen | null })[] }[];
  totals?: unknown;
}

export function unpricedBq(frozen: FrozenBq): { versionNo: number; sections: { number: string; title: string; items: Omit<BqLine, "rate">[] }[] } {
  return {
    versionNo: frozen.versionNo,
    sections: frozen.sections.map((s) => ({
      number: s.number,
      title: s.title,
      items: s.items.map((i) => ({ itemRef: i.itemRef, description: i.description, unit: i.unit, kind: i.kind, quantity: i.quantity, provisional: i.provisional })),
    })),
  };
}

/// The organisation's day for an instant, for stamping a finalised bill. Null while no zone is set.
export const finalisingDay = (now: Date, timeZone: string | null) => (timeZone ? dayIn(now, timeZone) : null);
