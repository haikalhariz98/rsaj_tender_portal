/**
 * The interim certificate's damages, one line per scope (6.13 Part B run 1b: FR-LAD-008, 011; 613A-C2 as amended,
 * BD-613-89; BD-613-75; ADR 0030). Pure.
 *
 * Each scope with a live decision has its own line: Part A's `ladLine` (the window, the days not charged before, the
 * frozen rate and date), cut by rate segment, less the waivers applied on it. A decision an extension of time
 * superseded charges nothing more: a valuation past the new date is refused (NON_COMPLETION_SUPERSEDED) until a
 * replacement is recorded; on or before it the line is closed by the extension. Past the whole works' date with no
 * live decision on any scope, Part A's refusal stands unchanged (one decision governed before scopes existed).
 *
 * The credits due on the issued lines are returned on this certificate (`creditsDue`). The cap holds per scope: the
 * credits plus the waivers applied never exceed the damages charged on its issued lines and this one.
 */

import { ladFaults, ladLine, type LadLine } from "@/lib/lad/charge";
import type { Sen } from "@/lib/money";
import type { Finding } from "@/lib/method/types";

import { supersession } from "./basis";
import { capFaults, creditsDue, type CapRow, type CreditRow, type IssuedLine } from "./credit";
import { rateSegments, splitBySegments, type ChargedSegment } from "./segments";

type Day = string;

export interface ScopeDecision {
  id: string;
  outcome: "LAD_APPLIES" | "EXCUSED_OR_PENDING";
  reason: string;
  certificateIssued: boolean;
  from: Day | null;
  until: Day | null;
  rate: Sen | null;
  /// The date for completion frozen with the decision (BD-613-48).
  dateForCompletion: Day | null;
  superseded: { eotNumber: string | null; newDate: Day } | null;
  /// A partial occupation whose reduced rate is confirmed (run 2); null until then.
  occupation: { occupiedOn: Day; confirmedRate: Sen | null } | null;
}

export interface ScopeIn {
  key: string;
  label: string;
  /// The scope's date for completion on the baseline in force today (extensions included).
  dateNow: Day | null;
  decision: ScopeDecision | null;
}

export interface LadLinesInput {
  valuationDate: Day;
  /// The whole works' date for completion today (Part A's refusal where no scope has a decision).
  wholeDate: Day | null;
  scopes: readonly ScopeIn[];
  /// Every damages line on the issued interim certificates.
  issued: readonly IssuedLine[];
  /// The credits returned on the issued certificates.
  returned: readonly CreditRow[];
  /// The waivers applied on the issued certificates, by scope.
  waiversApplied: readonly { scopeKey: string; amount: Sen }[];
  /// The approved waivers this certificate applies (the switch and the basis judged by the caller).
  waiversToApply: readonly { id: string; scopeKey: string; amount: Sen; label: string }[];
}

export type ScopeLineState = LadLine["state"] | "CLOSED_BY_EXTENSION" | "SUPERSEDED";

export interface ScopeLine {
  key: string;
  label: string;
  decisionId: string | null;
  state: ScopeLineState;
  /// Part A's line, as it reads the window (the reason where excused).
  line: LadLine | null;
  segments: ChargedSegment[];
  from: Day | null;
  to: Day | null;
  until: Day | null;
  days: number;
  gross: Sen;
  waived: Sen;
  /// gross − waived (a waiver larger than this certificate's gross returns damages charged before: negative).
  amount: Sen;
  waiverIds: string[];
  /// CLOSED_BY_EXTENSION or SUPERSEDED: the extension of time's number.
  closedBy: string | null;
}

export interface LadLines {
  lines: ScopeLine[];
  credits: CreditRow[];
  faults: Finding[];
  total: { gross: Sen; waived: Sen; credit: Sen; amount: Sen };
}

const sum = (xs: readonly Sen[]) => xs.reduce((a, x) => a + x, 0n);
const chargedUntilOn = (issued: readonly IssuedLine[], key: string): Day | null =>
  issued.filter((l) => l.scopeKey === key).flatMap((l) => [...l.segments.map((s) => s.until), ...(l.chargedUntil ? [l.chargedUntil] : [])]).sort().at(-1) ?? null;

export function ladLines(i: LadLinesInput): LadLines {
  const faults: Finding[] = [];
  const lines: ScopeLine[] = [];
  if (!i.scopes.some((s) => s.decision) && i.wholeDate && i.valuationDate > i.wholeDate) faults.push(...ladFaults({ state: "DECISION_REQUIRED", dateForCompletion: i.wholeDate }));
  for (const s of i.scopes) {
    const d = s.decision;
    if (!d) continue;
    const toApply = i.waiversToApply.filter((w) => w.scopeKey === s.key);
    const waived = sum(toApply.map((w) => w.amount));
    const blank = { key: s.key, label: s.label, decisionId: d.id, line: null, segments: [], from: null, to: null, until: null, days: 0, gross: 0n, waived, amount: -waived, waiverIds: toApply.map((w) => w.id), closedBy: d.superseded?.eotNumber ?? null };
    const sup = supersession(d.superseded, i.valuationDate, s.label);
    if (sup.state === "REFUSED") {
      faults.push(sup.fault);
      lines.push({ ...blank, state: "SUPERSEDED" });
      continue;
    }
    if (sup.state === "CLOSED_BY_EXTENSION") {
      lines.push({ ...blank, state: "CLOSED_BY_EXTENSION" });
      continue;
    }
    const line = ladLine({ dateForCompletion: s.dateNow, valuationDate: i.valuationDate, decision: { outcome: d.outcome, reason: d.reason, certificateIssued: d.certificateIssued, from: d.from, until: d.until, rate: d.rate, dateForCompletion: d.dateForCompletion }, chargedUntil: chargedUntilOn(i.issued, s.key) });
    faults.push(...ladFaults(line));
    if (line.state !== "CHARGED") {
      lines.push({ ...blank, state: line.state, line });
      continue;
    }
    const segments = splitBySegments(line.from, line.until, rateSegments(line.rate, d.occupation));
    const gross = sum(segments.map((x) => x.rate * BigInt(x.days)));
    lines.push({ ...blank, state: "CHARGED", line, segments, from: line.from, to: line.to, until: line.until, days: line.days, gross, amount: gross - waived });
  }
  const scopeDates: Record<string, Day | null> = Object.fromEntries(i.scopes.map((s) => [s.key, s.dateNow]));
  const credits = creditsDue({ lines: i.issued, scopeDates, returned: i.returned });
  const keys = [...new Set([...i.scopes.map((s) => s.key), ...i.issued.map((l) => l.scopeKey)])];
  const caps: CapRow[] = keys.map((key) => {
    const charged = sum(i.issued.filter((l) => l.scopeKey === key).map((l) => l.gross)) + sum(lines.filter((l) => l.key === key).map((l) => l.gross));
    const credited = sum(i.returned.filter((c) => c.scopeKey === key).map((c) => c.amount)) + sum(credits.filter((c) => c.scopeKey === key).map((c) => c.amount));
    const waivedBefore = sum(i.waiversApplied.filter((w) => w.scopeKey === key).map((w) => w.amount));
    const waivedNow = sum(lines.filter((l) => l.key === key).map((l) => l.waived));
    const label = i.scopes.find((s) => s.key === key)?.label ?? key;
    return { scopeKey: key, label, charged, credited, waived: waivedBefore + waivedNow, by: credited + waivedBefore > charged ? "CREDIT" : "WAIVER" };
  });
  faults.push(...capFaults(caps));
  const total = { gross: sum(lines.map((l) => l.gross)), waived: sum(lines.map((l) => l.waived)), credit: sum(credits.map((c) => c.amount)), amount: sum(lines.map((l) => l.amount)) };
  return { lines, credits, faults, total };
}

/// A line issued before damages were kept per scope: its scope is the only one ever decided with damages (none: the
/// whole works); where two scopes could own it, it cannot be read (LAD_LINE_SCOPE_UNKNOWN, refused by the caller).
export function lineScopeOf(ladAppliesKeys: readonly string[]): { ok: true; key: string } | { ok: false } {
  const keys = [...new Set(ladAppliesKeys)];
  if (keys.length > 1) return { ok: false };
  return { ok: true, key: keys[0] ?? "WHOLE" };
}
