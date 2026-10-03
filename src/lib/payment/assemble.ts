/**
 * One interim valuation, assembled into its certificate (6.13 Part A step 3). The one function the Payments tab's
 * preview and the act that raises the certificate both call, with the same inputs, so the screen never says
 * anything the act would not (and the reverse).
 *
 * It reads: the valuation's own lines (the main contractor's works to date, the materials list, the parties'
 * totals, the keyed deductions), the certificate's pinned baseline (the contract sum, retention, the minimums, the
 * damages rate, the date for completion), the organisation's policy as it stands at raising (the materials
 * default, the pre-execution limit, the remainder rule), and the contract's history: earlier issued interim
 * certificates (what they carried forward, their gross, the damages days they charged, what advances they
 * recouped), retention released on or before the valuation day, issued advances and their schedules, the
 * non-completion decision in force, and premiums the employer paid that are still waiting for a certificate.
 *
 * It returns the certificate's figures (or the refusals, each naming its rule), and `judgedUnder`: every reading
 * the certificate rests on, frozen with the valuation when the certificate is raised and never read live again.
 * Pure: sen as bigint, days as strings, no clock.
 */

import type { BaselineValues } from "@/lib/contract/baseline";
import { frozenRateWarnings, ladFaults, ladLine, type Decision, type LadLine } from "@/lib/lad/charge";
import { formatMoney, parseSen, senToDecimalString, type Sen } from "@/lib/money";
import type { ContractPartyKind } from "@/lib/supervision/types";

import { recoupments, type LiveAdvance } from "./advance";
import { preExecutionFaults, type PreExecutionFacts } from "./eligibility";
import { interimCertificate, type InterimResult } from "./interim";
import { afterCutOff, materialsAllowance, materialsPct, type MaterialLine, type MaterialsPct } from "./materials";
import { paymentFaultText } from "./labels";
import { minimumFaults, minimumMeasureText, minimumReading, type MinimumReading } from "./minimum";
import { retentionReading, type RetentionReading, type Tiers } from "./retention";
import type { Day, Finding, KeyedDeductionKind, Provenance, ValuationTrigger, WaterfallRemainder } from "./types";
import { issueClockFrom } from "./valuation";
import { variationFaults } from "./variation-check";
import { waterfall, type Waterfall } from "./waterfall";

export interface PartyLineIn {
  partyId: string;
  name: string;
  kind: ContractPartyKind;
  value: Sen | null;
  due: Sen;
  submittedOn: Day;
}

export interface ValuationIn {
  id: string;
  trigger: ValuationTrigger;
  triggerDate: Day | null;
  valuationDate: Day;
  mainWorks: Sen | null;
  jointRecorded: boolean;
  materials: readonly (MaterialLine & { id: string })[];
  parties: readonly PartyLineIn[];
  deductions: readonly { kind: KeyedDeductionKind; label: string; amount: Sen }[];
}

/// An issued interim certificate, as it was issued.
export interface IssuedInterim {
  certificateId: string;
  sequence: number;
  /// Its figures as issued (lines and totals, overrides included), by key.
  figures: ReadonlyMap<string, string | null>;
  judgedUnder: JudgedUnder | null;
}

export interface ReleaseRow {
  main: Sen;
  nsc: Sen;
  ns: Sen;
  releasedOn: Day;
}

export interface AssembleInput {
  valuation: ValuationIn;
  computedOn: Day;
  baseline: { version: number; values: BaselineValues };
  policy: {
    materialsPct: string | null;
    materialsProvenance: Provenance | null;
    preExecutionLimit: number | null;
    preExecutionProvenance: Provenance | null;
    remainder: WaterfallRemainder | null;
    remainderProvenance: Provenance | null;
  };
  issued: readonly IssuedInterim[];
  /// Interim certificates issued on this contract that no valuation raised (none the product makes; an import's or an
  /// earlier build's). Their figures are not in this layout, so "previously certified" cannot be read from them: a
  /// valuation refuses while one stands, and the sequence still counts them as the issue does.
  foreign: readonly { number: string | null; sequence: number | null }[];
  /// The net of each issued adjustment of the contract sum (step 4 adds them; none before).
  adjustments: readonly Sen[];
  releases: readonly ReleaseRow[];
  /// Advances whose certificate is issued, with their schedules (recouped is read from `issued` here).
  advances: readonly Omit<LiveAdvance, "recouped">[];
  /// The non-completion decision in force, with its certificate's state (its rate and date frozen with it).
  decision: Decision | null;
  /// What the pinned baseline states now for what the decision covers (BD-613-48: compared, never charged).
  baselineDamages?: { rate: Sen | null; dateForCompletion: Day | null };
  /// Premiums the employer paid that no live certificate deducts yet.
  pending: readonly { id: string; amount: Sen; paidOn: Day }[];
  /// FR-PAY-014's facts as they stand (for the warning at open; the refusal is the issue's).
  preExecution: Omit<PreExecutionFacts, "limit">;
}

export interface JudgedUnder {
  version: 1;
  sequence: number;
  valuationDate: Day;
  trigger: ValuationTrigger;
  issueClockFrom: Day;
  baselineVersion: number;
  materialsPct: MaterialsPct;
  materialsProvenance: Provenance | null;
  retention: RetentionReading;
  released: Record<"MAIN" | "NSC" | "NS", string>;
  minimum: { state: MinimumReading["state"]; minimum: string | null; value: string | null; first: boolean };
  lad: { state: LadLine["state"]; from: Day | null; to: Day | null; until: Day | null; days: number | null; rate: string | null; amount: string | null; reason: string | null };
  recoupments: { advanceId: string; party: "MAIN" | "NSC"; recoup: string; balanceAfter: string }[];
  /// The issued advances read at raising (the issue refuses if that set has moved: ADVANCES_MOVED).
  advancesRead?: string[];
  parties: { partyId: string; name: string; kind: ContractPartyKind; value: string | null; due: string }[];
  pendingDeductionIds: string[];
  preExecution: { limit: number | null; provenance: Provenance | null };
  remainder: { rule: WaterfallRemainder | null; provenance: Provenance | null };
}

export interface Assembled {
  sequence: number;
  result: InterimResult;
  lad: LadLine;
  minimum: MinimumReading;
  /// Everything that refuses raising, each naming its rule (the interim's own, the minimum, the damages chain, the
  /// cut-off, the joint valuation, the value to date beyond the revised sum).
  faults: Finding[];
  /// FR-PAY-014 at open: said, not refused (the issue refuses on the sequence it allocates).
  warnings: Finding[];
  /// The payment waterfall on the payment recommended (FR-PAY-015).
  waterfall: Waterfall | null;
  judgedUnder: JudgedUnder | null;
}

const str = (v: Sen) => senToDecimalString(v);
const n = (v: string | null | undefined): Sen => (v == null ? 0n : parseSen(v));
const tierSum = (rows: readonly ReleaseRow[], on: Day): Tiers => rows.filter((r) => r.releasedOn <= on).reduce((a, r) => ({ MAIN: a.MAIN + r.main, NSC: a.NSC + r.nsc, NS: a.NS + r.ns }), { MAIN: 0n, NSC: 0n, NS: 0n } as Tiers);

/// The first day not charged, after the issued certificates' damages lines (null: none charged yet).
export const chargedUntilOf = (issued: readonly IssuedInterim[]): Day | null =>
  issued.map((c) => (c.judgedUnder?.lad.state === "CHARGED" ? c.judgedUnder.lad.until : null)).filter((d): d is Day => d != null).sort().at(-1) ?? null;

/// What each advance has recouped on the issued certificates.
export const recoupedOf = (issued: readonly IssuedInterim[], advanceId: string): Sen => issued.reduce((a, c) => a + (c.judgedUnder?.recoupments.filter((r) => r.advanceId === advanceId).reduce((x, r) => x + n(r.recoup), 0n) ?? 0n), 0n);

/// Σ what the issued certificates carried forward ("previously certified"), and the latest's gross.
export function previousOf(issued: readonly IssuedInterim[]): { previous: Sen; previousGross: Sen } {
  const sorted = [...issued].sort((a, b) => a.sequence - b.sequence);
  return { previous: sorted.reduce((a, c) => a + n(c.figures.get("carryForward")), 0n), previousGross: n(sorted.at(-1)?.figures.get("gross")) };
}

/// What the latest issued certificate held, per tier, before what had been released by then (for a release).
export function heldOnLatest(issued: readonly IssuedInterim[]): { certificateId: string; held: Tiers } | null {
  const last = [...issued].sort((a, b) => a.sequence - b.sequence).at(-1);
  if (!last) return null;
  const r = last.judgedUnder?.released ?? { MAIN: "0.00", NSC: "0.00", NS: "0.00" };
  return { certificateId: last.certificateId, held: { MAIN: n(last.figures.get("retentionMain")) + n(r.MAIN), NSC: n(last.figures.get("retentionNsc")) + n(r.NSC), NS: n(last.figures.get("retentionNs")) + n(r.NS) } };
}

export function assembleInterim(i: AssembleInput): Assembled {
  const v = i.valuation;
  const b = i.baseline.values;
  const sequence = i.issued.length + i.foreign.length + 1;
  const faults: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => faults.push({ code, level: "block", data });
  for (const x of i.foreign) f("INTERIM_NOT_FROM_VALUATION", { number: x.number ?? (x.sequence == null ? null : String(x.sequence)) });
  if (!v.jointRecorded) f("JOINT_NOT_RECORDED");
  if (v.mainWorks == null) f("MAIN_WORKS_NOT_RECORDED");
  // FR-PAY-005: the cut-off is hard.
  for (const m of v.materials) if (afterCutOff(m.submittedOn, v.valuationDate)) f("LINE_AFTER_CUT_OFF", { day: v.valuationDate, line: "material" });
  for (const p of v.parties) if (afterCutOff(p.submittedOn, v.valuationDate)) f("LINE_AFTER_CUT_OFF", { day: v.valuationDate, line: p.name });
  for (const p of v.parties) {
    if (p.kind !== "ASSIGNEE" && p.value == null) f("PARTY_VALUE_REQUIRED", { party: p.name });
    if (p.kind === "ASSIGNEE" && p.value != null) f("PARTY_VALUE_NOT_EXPECTED", { party: p.name });
  }

  const pct = materialsPct(b.unfixedMaterialsPct, i.policy.materialsPct);
  const mats = materialsAllowance(v.materials, pct);
  const retention = retentionReading({ applies: b.retentionApplies, percent: b.retentionPercent, capPercent: b.retentionCapPercent, source: b.retentionSource });
  const released = tierSum(i.releases, v.valuationDate);
  const { previous, previousGross } = previousOf(i.issued);
  const lad = ladLine({ dateForCompletion: b.dateForCompletion, valuationDate: v.valuationDate, decision: i.decision, chargedUntil: chargedUntilOf(i.issued) });
  faults.push(...ladFaults(lad));
  const advances = i.advances.map((a) => ({ ...a, recouped: recoupedOf(i.issued, a.id) }));
  const rec = recoupments(advances, sequence);
  const pending = i.pending.filter((p) => p.paidOn <= v.valuationDate);
  const sumOf = (k: KeyedDeductionKind) => v.deductions.filter((d) => d.kind === k).reduce((a, d) => a + d.amount, 0n);
  const nominated = { NSC: v.parties.filter((p) => p.kind === "NOMINATED_SUBCONTRACTOR").reduce((a, p) => a + (p.value ?? 0n), 0n), NS: v.parties.filter((p) => p.kind === "NOMINATED_SUPPLIER").reduce((a, p) => a + (p.value ?? 0n), 0n) };

  const result = interimCertificate({
    computedOn: i.computedOn,
    originalSum: b.contractSum,
    adjustments: i.adjustments,
    mainWorks: v.mainWorks ?? 0n,
    materials: { ...mats, pct },
    nominated,
    retention,
    released,
    previous,
    previousGross,
    lad,
    ladRounding: sumOf("LAD_ROUNDING"),
    advance: { main: rec.main, nsc: rec.nsc },
    premiums: sumOf("PREMIUMS_PERKESO") + pending.reduce((a, p) => a + p.amount, 0n),
    premiumsPending: pending.reduce((a, p) => a + p.amount, 0n),
    remainder: i.policy.remainder,
    wages: sumOf("WAGES"),
    nonCompliance: sumOf("NON_COMPLIANCE"),
    others: v.deductions.filter((d) => d.kind === "OTHER").map((d) => ({ label: d.label, amount: d.amount })),
  });
  faults.push(...result.faults.filter((x) => x.level === "block"));

  const minimum = result.figures ? minimumReading({ first: sequence === 1, firstMinimum: b.firstInterimMinimum, subsequentMinimum: b.subsequentInterimMinimum, gross: result.figures.gross, carryForward: result.figures.carryForward }) : ({ state: "NOT_SET", field: sequence === 1 ? "firstInterimMinimum" : "subsequentInterimMinimum" } as MinimumReading);
  if (result.figures) faults.push(...minimumFaults(minimum));
  // BD-613-29: the certificate says which measure its minimum is judged on, and that the measure is assumed.
  if (result.snapshot) {
    const t = minimumMeasureText(sequence === 1, sequence === 1 ? b.firstInterimMinimum : b.subsequentInterimMinimum, (x) => formatMoney(x));
    result.snapshot.lines.push({ key: "minimumMeasure", labelEn: "The certificate's minimum (assumed measure)", labelMs: "Minimum perakuan (ukuran andaian)", type: "TEXT", value: t.en, overridable: false });
  }
  // FR-PAY-008: the value to date beyond the revised contract sum needs a Variation Order Certificate first.
  if (result.figures) faults.push(...variationFaults({ valuedTotal: result.figures.gross, revisedSum: result.figures.newSum, unapproved: 0 }));

  const revised = i.baselineDamages ? frozenRateWarnings(i.decision, i.baselineDamages) : [];
  const warnings = [...preExecutionFaults(sequence, { ...i.preExecution, limit: i.policy.preExecutionLimit }, "warn"), ...revised];
  // BD-613-48: the certificate itself says the CNC's rate still applies where the baseline has since moved.
  if (result.snapshot && revised.length) result.snapshot.lines.push({ key: "ladRateNote", labelEn: "Damages rate", labelMs: "Kadar ganti rugi", type: "TEXT", value: paymentFaultText(revised[0]), overridable: false });
  const parties = v.parties.map((p) => ({ id: p.partyId, tier: (p.kind === "ASSIGNEE" ? "ASSIGNEE" : "NOMINATED") as "ASSIGNEE" | "NOMINATED", due: p.due }));
  const wf = result.figures ? waterfall(result.figures.recommended, parties, i.policy.remainder) : null;
  if (wf) faults.push(...wf.faults);

  const judgedUnder: JudgedUnder | null = result.figures
    ? {
        version: 1,
        sequence,
        valuationDate: v.valuationDate,
        trigger: v.trigger,
        issueClockFrom: issueClockFrom(v.trigger, v.triggerDate, v.valuationDate),
        baselineVersion: i.baseline.version,
        materialsPct: pct,
        materialsProvenance: pct.state === "SET" && pct.source === "POLICY" ? i.policy.materialsProvenance : null,
        retention,
        released: { MAIN: str(released.MAIN), NSC: str(released.NSC), NS: str(released.NS) },
        minimum: minimum.state === "NOT_SET" ? { state: minimum.state, minimum: null, value: null, first: sequence === 1 } : { state: minimum.state, minimum: str(minimum.minimum), value: str(minimum.value), first: minimum.first },
        lad: lad.state === "CHARGED" ? { state: lad.state, from: lad.from, to: lad.to, until: lad.until, days: lad.days, rate: str(lad.rate), amount: str(lad.amount), reason: null } : { state: lad.state, from: null, to: null, until: null, days: null, rate: null, amount: null, reason: lad.state === "EXCUSED" ? lad.reason : null },
        recoupments: rec.lines.filter((l) => l.recoup > 0n).map((l) => ({ advanceId: l.id, party: l.party, recoup: str(l.recoup), balanceAfter: str(l.balanceAfter) })),
        advancesRead: i.advances.map((a) => a.id),
        parties: v.parties.map((p) => ({ partyId: p.partyId, name: p.name, kind: p.kind, value: p.value == null ? null : str(p.value), due: str(p.due) })),
        pendingDeductionIds: pending.map((p) => p.id),
        preExecution: { limit: i.policy.preExecutionLimit, provenance: i.policy.preExecutionProvenance },
        remainder: { rule: i.policy.remainder, provenance: i.policy.remainderProvenance },
      }
    : null;
  return { sequence, result, lad, minimum, faults: dedupe(faults), warnings, waterfall: wf, judgedUnder };
}

/// The same refusal named once.
function dedupe(fs: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  return fs.filter((x) => {
    const k = `${x.code}|${JSON.stringify(x.data ?? {})}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/// A frozen reading read back from JSON, or null where it is not one (never guessed at).
export function readJudgedUnder(json: unknown): JudgedUnder | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Partial<JudgedUnder>;
  return j.version === 1 && typeof j.sequence === "number" && Array.isArray(j.recoupments) ? (j as JudgedUnder) : null;
}
