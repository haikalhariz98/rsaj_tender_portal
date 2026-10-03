/**
 * A contract's opening position (BD-613-41 as amended): the way out for a contract whose earlier interim
 * certificates were not raised from a valuation here (an in-flight contract, an import, an earlier build's).
 *
 * Entered once, before the first interim valuation the system raises: the last interim certificate it covers (its
 * number and its sequence), the gross certified to date, previously certified to date, retention held and released
 * per tier, advance recouped by schedule number, and the first day damages were not yet charged. Each figure is
 * STATED (its note names the source certificate's reference) or ASSUMED (its note the reason); an ASSUMED figure
 * warns on every later certificate. Corrected only with a reason, and only while no valuation has been raised after
 * it. It must cover the sequence of every interim certificate not raised from a valuation; the payment module then
 * reads it as the latest issued interim certificate (so "previously certified", retention, the damages already
 * charged and the next sequence all continue from it). Pure: sen as bigint.
 *
 * The advance recouped is recorded and shown as entered: an advance granted before the system is not an advance
 * here, so its remaining recoupment is not continued automatically (said on the screen, BD-613-49).
 */

import type { Sen } from "@/lib/money";

import type { IssuedInterim, JudgedUnder } from "./assemble";
import type { Day, Finding } from "./types";

export const OPENING_GROUPS = ["gross", "previous", "retention", "released", "advance", "damages"] as const;
export type OpeningGroup = (typeof OPENING_GROUPS)[number];
export type OpeningProvenance = "STATED" | "ASSUMED";

export interface OpeningInput {
  lastCertificateNumber: string;
  lastSequence: number | null;
  grossToDate: Sen | null;
  previouslyCertified: Sen | null;
  retention: { MAIN: Sen; NSC: Sen; NS: Sen } | null;
  released: { MAIN: Sen; NSC: Sen; NS: Sen } | null;
  advanceRecouped: readonly { sequence: number; amount: Sen }[];
  damagesChargedUntil: Day | null;
  provenance: Record<OpeningGroup, { provenance: OpeningProvenance | null; note: string }>;
}

export interface OpeningContext {
  /// A valuation of this contract has been raised (its certificate opened) by the system: the position is closed.
  valuationRaised: boolean;
  /// An opening position is already recorded (a correction then needs its reason).
  existing: boolean;
  reason: string;
  /// The sequences of the interim certificates issued that no valuation raised: the position must cover them.
  foreignSequences: readonly number[];
}

export function openingFaults(i: OpeningInput, c: OpeningContext): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (c.valuationRaised) f("OPENING_CLOSED");
  if (c.existing && !c.reason.trim()) f("OPENING_REASON_REQUIRED");
  if (!i.lastCertificateNumber.trim()) f("OPENING_NUMBER_REQUIRED");
  if (i.lastSequence == null || !Number.isInteger(i.lastSequence) || i.lastSequence < 1) f("OPENING_SEQUENCE_REQUIRED");
  else {
    const uncovered = c.foreignSequences.filter((s) => s > i.lastSequence!);
    if (uncovered.length) f("OPENING_DOES_NOT_COVER", { last: i.lastSequence, uncovered: Math.max(...uncovered) });
  }
  if (i.grossToDate == null || i.grossToDate < 0n) f("OPENING_FIGURE_REQUIRED", { group: "gross" });
  if (i.previouslyCertified == null || i.previouslyCertified < 0n) f("OPENING_FIGURE_REQUIRED", { group: "previous" });
  if (!i.retention || Object.values(i.retention).some((v) => v < 0n)) f("OPENING_FIGURE_REQUIRED", { group: "retention" });
  if (!i.released || Object.values(i.released).some((v) => v < 0n)) f("OPENING_FIGURE_REQUIRED", { group: "released" });
  else if (i.retention && (["MAIN", "NSC", "NS"] as const).some((t) => i.released![t] > i.retention![t])) f("OPENING_RELEASED_ABOVE_HELD");
  if (i.advanceRecouped.some((r) => !Number.isInteger(r.sequence) || r.sequence < 1 || r.amount <= 0n || (i.lastSequence != null && r.sequence > i.lastSequence))) f("OPENING_ADVANCE_ROW_INVALID", { last: i.lastSequence });
  for (const g of OPENING_GROUPS) {
    const p = i.provenance[g];
    if (!p.provenance) f("OPENING_PROVENANCE_REQUIRED", { group: g });
    else if (!p.note.trim()) f(p.provenance === "STATED" ? "OPENING_SOURCE_REQUIRED" : "OPENING_ASSUMPTION_REASON_REQUIRED", { group: g });
  }
  return out;
}

/// Said, not refused: previously certified to date is gross to date less the retention it holds net (the identity
/// every certificate here keeps); a position that does not keep it is shown as entered, with the difference.
export function openingReconciles(i: { grossToDate: Sen; previouslyCertified: Sen; retention: { MAIN: Sen; NSC: Sen; NS: Sen }; released: { MAIN: Sen; NSC: Sen; NS: Sen } }): Finding[] {
  const net = i.retention.MAIN + i.retention.NSC + i.retention.NS - i.released.MAIN - i.released.NSC - i.released.NS;
  const expected = i.grossToDate - net;
  return expected === i.previouslyCertified ? [] : [{ code: "OPENING_NOT_RECONCILED", level: "warn", data: { expected: expected.toString(), entered: i.previouslyCertified.toString() } }];
}

/// The groups entered as ASSUMED: every later certificate warns of them.
export const assumedGroups = (p: Record<OpeningGroup, { provenance: OpeningProvenance | null }>): OpeningGroup[] => OPENING_GROUPS.filter((g) => p[g].provenance === "ASSUMED");

const dec = (v: Sen) => {
  const neg = v < 0n;
  const a = neg ? -v : v;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
};

/**
 * The position as the latest issued interim certificate, in the shape the assembler reads: carried forward is
 * previously certified to date (the sum of every earlier certificate's), the gross is the gross to date, retention
 * is held less released per tier with what was released, and the damages already charged until the day entered.
 */
export function openingAsIssued(o: { id: string; lastSequence: number; grossToDate: Sen; previouslyCertified: Sen; retention: { MAIN: Sen; NSC: Sen; NS: Sen }; released: { MAIN: Sen; NSC: Sen; NS: Sen }; damagesChargedUntil: Day | null }): IssuedInterim {
  const judgedUnder = {
    version: 1,
    sequence: o.lastSequence,
    released: { MAIN: dec(o.released.MAIN), NSC: dec(o.released.NSC), NS: dec(o.released.NS) },
    recoupments: [],
    lad: o.damagesChargedUntil ? { state: "CHARGED", from: null, to: null, until: o.damagesChargedUntil, days: null, rate: null, amount: null, reason: null } : { state: "NOT_DUE", from: null, to: null, until: null, days: null, rate: null, amount: null, reason: null },
  } as unknown as JudgedUnder;
  return {
    certificateId: `opening:${o.id}`,
    sequence: o.lastSequence,
    figures: new Map<string, string | null>([
      ["carryForward", dec(o.previouslyCertified)],
      ["gross", dec(o.grossToDate)],
      ["retentionMain", dec(o.retention.MAIN - o.released.MAIN)],
      ["retentionNsc", dec(o.retention.NSC - o.released.NSC)],
      ["retentionNs", dec(o.retention.NS - o.released.NS)],
    ]),
    judgedUnder,
  };
}
