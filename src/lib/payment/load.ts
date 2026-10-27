/**
 * A contract's interim payments and damages chain, loaded (6.13 Part A step 3). Reads only; every rule is in the
 * pure modules beside this. Server-only: called by the contract's Payments tab and by the acts inside their own
 * locked transaction (`client` the transaction), so a decision reads the rows it locked.
 */

import type { Tx } from "@/lib/audit/record";
import { INSURANCE_KIND_LABEL } from "@/lib/award/labels";
import { baselineFor } from "@/lib/contract/baseline";
import { baselineRows, contractGate, valuesOf } from "@/lib/contract/load";
import type { LoadedContract } from "@/lib/contract/repo";
import type { BaselineReason } from "@/lib/contract/types";
import { storedDay, dayOrNull as day } from "@/lib/dates";
import { decimalText } from "@/lib/format";
import { db } from "@/lib/db";
import type { Decision } from "@/lib/lad/charge";
import { liveDecision } from "@/lib/lad/non-completion";
import { issuedAdjustmentsFrom } from "@/lib/adjustment/ppjhk";
import { claimState, liveDecisionsByScope, scopeKey, type ClaimFact, type Scope } from "@/lib/lad/basis";
import type { CreditRow, IssuedLine } from "@/lib/lad/credit";
import type { LadBasis } from "@/lib/lad/frozen";
import type { ScopeDecision, ScopeIn } from "@/lib/lad/scopes";
import { lineScopeOf } from "@/lib/lad/scopes";
import { rateSegments, segmentsKey } from "@/lib/lad/segments";
import { accrualOf } from "@/lib/lad/accrual";
import { applicationOf, ladAmountAt, type WaiverBasis } from "@/lib/lad/waiver";
import { approvalOfRecord } from "@/lib/matter/matter";
import { scopeDate } from "@/lib/time/extension";
import { formatSen, parseSen, senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";
import type { ContractPartyKind } from "@/lib/supervision/types";

import { CORRECTIONS } from "./correction";
import { readJudgedUnder, type AssembleInput, type DamagesIn, type IssuedInterim, type ValuationIn } from "./assemble";
import { EXECUTED_STATUSES, type CreditorFacts } from "./eligibility";
import { OPENING_GROUP_WORDS } from "./labels";
import { assumedGroups, openingAsIssued, openingReconciles, openingReleaseRow, releaseState, type OpeningProvenance } from "./opening";
import type { Finding, KeyedDeductionKind, Provenance, ValuationTrigger, WaterfallRemainder } from "./types";
import { inOrder } from "@/lib/series";

const pct = (v: { toString(): string } | null | undefined) => decimalText(v);
const senOrNull = (v: { toString(): string } | null | undefined): Sen | null => (v == null ? null : parseSen(v.toString()));

const certSelect = { id: true, kind: true, status: true, number: true, sequence: true, certificateDate: true, issuedAt: true, issueSnapshot: true, openedOn: true, financePayment: { include: { person: { select: { name: true } }, ...CORRECTIONS } } } as const;

export const paymentInclude = {
  paymentCalendar: { include: { person: { select: { name: true } } } },
  interimValuations: {
    include: {
      person: { select: { id: true, name: true } },
      materialLines: { orderBy: { recordedAt: "asc" as const } },
      partyLines: { include: { party: { select: { id: true, name: true, kind: true, directPayment: true } } }, orderBy: { recordedAt: "asc" as const } },
      deductions: { orderBy: { recordedAt: "asc" as const } },
      certificate: { select: certSelect },
    },
    orderBy: [{ valuationDate: "asc" as const }, { recordedAt: "asc" as const }],
  },
  retentionReleases: { include: { person: { select: { name: true } }, basisCertificate: { select: { number: true, sequence: true } } }, orderBy: { releasedOn: "asc" as const } },
  advancePayments: { include: { person: { select: { name: true } }, schedule: { orderBy: { sequence: "asc" as const } }, security: { select: { id: true, kind: true, instrumentRef: true, status: true, value: true } }, contractParty: { select: { name: true } }, certificate: { select: certSelect } }, orderBy: { recordedAt: "asc" as const } },
  ladWarnings: { include: { person: { select: { name: true } }, certificate: { select: certSelect } }, orderBy: { recordedAt: "asc" as const } },
  nonCompletions: {
    include: {
      person: { select: { name: true } },
      certificate: { select: certSelect },
      // 6.13 Part B run 1b (613A-C2): the EOT certificate that superseded it, and the waivers of its damages.
      supersededByEot: { select: { id: true, certificate: { select: { id: true, number: true, status: true } } } },
      waivers: { select: { id: true, ladAmount: true, waived: true, asOf: true, basis: true, appliedOnCertificateId: true, waiverLetterRef: true, reason: true, recordedAt: true, matter: { select: { id: true, reference: true, closedAt: true, approvedRouteId: true, routes: { select: { id: true, status: true }, orderBy: { openedAt: "asc" as const } } } } }, orderBy: { recordedAt: "asc" as const } },
    },
    orderBy: [{ decidedOn: "asc" as const }, { recordedAt: "asc" as const }],
  },
  // 6.13 Part B run 1b (FR-LAD-001): the EOT claims, with whether each is determined, closed or certified.
  eotClaims: { select: { id: true, scope: true, sectionRef: true, entitlement: true, matter: { select: { reference: true, closedAt: true } }, extensions: { select: { id: true, certificate: { select: { id: true, number: true, status: true } } } } }, orderBy: { recordedAt: "asc" as const } },
  pendingDeductions: { include: { valuation: { select: { id: true, certificate: { select: { status: true } } } }, person: { select: { name: true } } }, orderBy: { paidOn: "asc" as const } },
  openingPosition: { include: { person: { select: { name: true } } } },
  certificates: { where: { kind: "INTERIM_PAYMENT" as const, status: "ISSUED" as const, interimValuation: { is: null } }, select: { number: true, sequence: true }, orderBy: { sequence: "asc" as const } },
  contractParties: { orderBy: [{ kind: "asc" as const }, { recordedAt: "asc" as const }] as { kind?: "asc"; recordedAt?: "asc" }[] },
  siteRecordsHandovers: { where: { recordsSet: "AS_BUILT" as const }, orderBy: { handedOverOn: "asc" as const } },
  // 6.13 Part A step 4 (FR-PAD-003): the adjustments of the contract sum, of which only the issued are read.
  sumAdjustments: { select: { id: true, certificate: { select: { id: true, number: true, status: true, issuedAt: true, issueSnapshot: true } } } },
  // FR-PAY-008: variation work commenced pending approval is not valued until approved (said on the valuation).
  variations: { where: { commencedOn: { not: null }, status: "SUPPORTED" as const, exemption: null }, select: { id: true, reference: true, estimate: true, approvals: { select: { event: true, approvalInstance: { select: { status: true } } } } } },
};

export type PaymentRows = Awaited<ReturnType<typeof readRows>>;
function readRows(contractId: string, client: Tx) {
  return client.contract.findUniqueOrThrow({ where: { id: contractId }, select: { id: true, ...paymentInclude } });
}

export async function loadPayment(contractId: string, client: Tx = db): Promise<PaymentRows> {
  return readRows(contractId, client);
}

/// The organisation's settings the payment acts read: the policy, the forms and routing sheets per kind, the clocks.
export async function loadPaymentConfig(organisationId: string, client: Tx = db) {
  const [policy, kinds, clocks] = await inOrder(
    () => client.postAwardPolicy.findUnique({ where: { organisationId } }),
    () => client.certificateKindSetting.findMany({ where: { organisationId }, include: { template: { select: { id: true, nameEn: true } }, routingType: { select: { id: true, labelEn: true, retiredOn: true } } } }),
    () => client.contractClockRule.findMany({ where: { organisationId } }));
  return { policy, kinds, clocks };
}
export type PaymentConfig = Awaited<ReturnType<typeof loadPaymentConfig>>;

/// The kind's form and routing sheet (null each where not set).
export const kindSettingOf = (cfg: PaymentConfig, kind: string) => cfg.kinds.find((k) => k.kind === kind) ?? null;

/// The baseline version in force on a day (what a certificate opened that day pins), with its values.
export function baselineOn(l: LoadedContract, on: string) {
  const versions = baselineRows(l.contract).versions.map((b) => ({ ...b, reason: b.reason as BaselineReason | null, recordedOn: day(b.recordedOn) }));
  const b = baselineFor(versions, on);
  return b ? { id: b.id, version: b.version!, values: valuesOf(l.contract.baselines.find((x) => x.id === b.id)!) } : null;
}

/// Whether a certificate's status lets it still count (not void).
export const live = (c: { status: string } | null | undefined) => !!c && c.status !== "VOID";

/// The interim certificates issued, as issued, oldest first.
export function issuedInterims(p: PaymentRows): IssuedInterim[] {
  const opening = p.openingPosition ? [openingAsIssued(openingOf(p.openingPosition))] : [];
  return [...opening, ...valuationInterims(p)].sort((a, b) => a.sequence - b.sequence);
}

/// The opening position's figures in sen (BD-613-41).
export const openingOf = (o: NonNullable<PaymentRows["openingPosition"]>) => ({
  id: o.id,
  lastSequence: o.lastSequence,
  grossToDate: senFromDecimal(o.grossToDate),
  previouslyCertified: senFromDecimal(o.previouslyCertified),
  retention: { MAIN: senFromDecimal(o.retentionMain), NSC: senFromDecimal(o.retentionNsc), NS: senFromDecimal(o.retentionNs) },
  released: { MAIN: senFromDecimal(o.releasedMain), NSC: senFromDecimal(o.releasedNsc), NS: senFromDecimal(o.releasedNs) },
  damagesChargedUntil: day(o.damagesChargedUntil),
});

/// The interim certificates issued from valuations here, as issued.
function valuationInterims(p: PaymentRows): IssuedInterim[] {
  return p.interimValuations
    .filter((v) => v.certificate?.status === "ISSUED")
    .map((v) => {
      const snap = v.certificate?.issueSnapshot as { figures?: { lines?: { key: string; value: string | null }[]; totals?: { key: string; value: string | null }[] } } | null;
      const figures = new Map<string, string | null>([...(snap?.figures?.lines ?? []), ...(snap?.figures?.totals ?? [])].map((x) => [x.key, x.value]));
      return { certificateId: v.certificate?.id ?? "", sequence: v.certificate?.sequence ?? 0, figures, judgedUnder: readJudgedUnder(v.judgedUnder) };
    })
    .sort((a, b) => a.sequence - b.sequence);
}

/// A valuation of this contract still in progress (being valued, or raised with its certificate neither issued nor void).
export const inProgress = (p: PaymentRows) => p.interimValuations.find((v) => v.status === "OPEN" || (v.status === "RAISED" && v.certificate?.status != null && v.certificate.status !== "ISSUED" && v.certificate.status !== "VOID")) ?? null;

/// The sequence the valuation in progress was (or will be) assembled as: every interim certificate issued on the
/// contract, from a valuation or not, plus one; null where none is in progress.
export const inProgressSequenceOf = (p: PaymentRows): number | null => (inProgress(p) ? nextInterimSequence(p) : null);

/// The next interim sequence: the highest issued (from a valuation, not from one, or the opening position) plus one.
export const nextInterimSequence = (p: PaymentRows): number => Math.max(0, ...issuedInterims(p).map((x) => x.sequence), ...p.certificates.map((c) => c.sequence ?? 0)) + 1;

/// Interim certificates issued that no valuation raised and the opening position does not cover (BD-613-41).
export const uncoveredForeign = (p: PaymentRows) => p.certificates.filter((c) => !p.openingPosition || (c.sequence ?? 0) > p.openingPosition.lastSequence);

/// The non-completion decision in force (code review run 2 item 6: one live at a time; a replaced or void one is not).
export const liveDecisionOf = (p: PaymentRows) => liveDecision(p.nonCompletions.map((d) => ({ ...d, certificateStatus: d.certificate?.status ?? null })));

export function decisionOf(p: PaymentRows, baseline: ReturnType<typeof baselineOn>): (Decision & { id: string }) | null {
  const d = liveDecisionOf(p);
  if (!d) return null;
  void baseline;
  // BD-613-48 (FREEZE): the rate and the date for completion as recorded with the decision and its CNC.
  return { id: d.id, outcome: d.outcome, reason: d.reason, certificateIssued: d.certificate?.status === "ISSUED", from: day(d.windowFrom), until: day(d.windowUntil), rate: d.rate == null ? null : senFromDecimal(d.rate), dateForCompletion: day(d.dateForCompletion) };
}

/// What the pinned baseline states now for what the decision in force covers (the whole works', or the section's),
/// to compare with the frozen figures (BD-613-48).
export function baselineDamagesOf(p: PaymentRows, baseline: ReturnType<typeof baselineOn>): { rate: Sen | null; dateForCompletion: string | null } {
  const d = liveDecisionOf(p);
  if (!baseline) return { rate: null, dateForCompletion: null };
  const rate = d?.scope === "SECTION" ? (baseline.values.sections.find((x) => x.ref === d.sectionRef)?.ladDaily ?? null) : baseline.values.ladDaily;
  return { rate, dateForCompletion: baseline.values.dateForCompletion };
}

/// Premiums the employer paid that no live certificate deducts.
export const freePending = (p: PaymentRows) =>
  p.pendingDeductions.filter((d) => !d.valuation || d.valuation.certificate?.status === "VOID").map((d) => ({ id: d.id, amount: senFromDecimal(d.amount), paidOn: storedDay(d.paidOn) }));

/// Issued advances, with their schedules.
export const issuedAdvances = (p: PaymentRows) =>
  p.advancePayments.filter((a) => a.certificate.status === "ISSUED").map((a) => ({ id: a.id, party: a.party, amount: senFromDecimal(a.amount), schedule: a.schedule.map((r) => ({ sequence: r.sequence, amount: senFromDecimal(r.amount) })) }));

/// FR-PAY-014's facts, as the contract's registers stand.
export async function preExecutionFacts(l: LoadedContract, client: Tx = db) {
  const gate = await contractGate(l, client);
  const verified = l.contract.policies.filter((x) => x.status === "VERIFIED");
  return {
    executed: EXECUTED_STATUSES.includes(l.contract.status),
    gate: gate.items.map((g) => ({ key: g.key, state: g.state })),
    withoutReceipt: verified.filter((x) => !x.premiumReceiptRef.trim()).map((x) => `${INSURANCE_KIND_LABEL[x.kind]}${x.policyNo ? ` ${x.policyNo}` : ""}`),
    perkesoRecorded: verified.some((x) => x.perkesoRegistrationNo.trim() !== ""),
  };
}

/// A valuation as the assembler reads it.
export function valuationIn(v: PaymentRows["interimValuations"][number]): ValuationIn {
  return {
    id: v.id,
    trigger: v.trigger as ValuationTrigger,
    triggerDate: day(v.triggerDate),
    valuationDate: storedDay(v.valuationDate),
    mainWorks: senOrNull(v.mainWorks),
    jointRecorded: v.jointOn != null && v.contractorAnswer != null,
    materials: v.materialLines.map((m) => ({ id: m.id, value: senFromDecimal(m.value), protectedOnSite: m.protectedOnSite, notTooEarly: m.notTooEarly, formsPartOfWorks: m.formsPartOfWorks, temporary: m.temporary, submittedOn: storedDay(m.submittedOn) })),
    parties: v.partyLines.map((x) => ({ partyId: x.partyId, name: x.party.name, kind: x.party.kind as ContractPartyKind, value: senOrNull(x.value), due: senFromDecimal(x.due), submittedOn: storedDay(x.submittedOn) })),
    deductions: v.deductions.map((x) => ({ kind: x.kind as KeyedDeductionKind, label: x.label, amount: senFromDecimal(x.amount) })),
  };
}

/// Everything `assembleInterim` reads for a valuation, from the contract's rows and settings, on a day.
export function assembleInputOf(l: LoadedContract, p: PaymentRows, cfg: PaymentConfig, v: PaymentRows["interimValuations"][number], today: string, preExecution: Awaited<ReturnType<typeof preExecutionFacts>>, creditor?: CreditorFacts): AssembleInput | null {
  const baseline = baselineOn(l, today);
  if (!baseline) return null;
  const pol = cfg.policy;
  return {
    valuation: valuationIn(v),
    computedOn: today,
    baseline: { version: baseline.version, values: baseline.values },
    policy: {
      materialsPct: pct(pol?.unfixedMaterialsDefaultPct),
      materialsProvenance: (pol?.unfixedMaterialsProvenance ?? null) as Provenance | null,
      preExecutionLimit: pol?.preExecutionInterimLimit ?? null,
      preExecutionProvenance: (pol?.preExecutionProvenance ?? null) as Provenance | null,
      remainder: (pol?.waterfallRemainder ?? null) as WaterfallRemainder | null,
      remainderProvenance: (pol?.waterfallProvenance ?? null) as Provenance | null,
    },
    issued: issuedInterims(p),
    foreign: uncoveredForeign(p),
    openingUnreconciled: openingUnreconciledOf(p),
    openingAssumed: p.openingPosition ? assumedGroups({ gross: { provenance: p.openingPosition.grossProvenance as OpeningProvenance }, previous: { provenance: p.openingPosition.previousProvenance as OpeningProvenance }, retention: { provenance: p.openingPosition.retentionProvenance as OpeningProvenance }, released: { provenance: p.openingPosition.releasedProvenance as OpeningProvenance }, advance: { provenance: p.openingPosition.advanceProvenance as OpeningProvenance }, damages: { provenance: p.openingPosition.damagesProvenance as OpeningProvenance } }).map((g) => OPENING_GROUP_WORDS[g].en) : [],
    // FR-PAD-003: the revised sum read only from the issued adjustments of the contract sum (their nets), never a variation.
    adjustments: issuedAdjustmentsOf(p).map((a) => a.net),
    adjustmentIds: issuedAdjustmentsOf(p).map((a) => a.id),
    commencedPending: commencedPendingOf(p),
    // The opening position's release first (MUST 1: never clawed back), then the system's.
    releases: [...openingReleaseRow(p.openingPosition ? openingOf(p.openingPosition).released : null), ...p.retentionReleases.map((r) => ({ main: senFromDecimal(r.main), nsc: senFromDecimal(r.nsc), ns: senFromDecimal(r.ns), releasedOn: storedDay(r.releasedOn) }))],
    advances: issuedAdvances(p),
    decision: decisionOf(p, baseline),
    damages: damagesOf(p, baseline),
    baselineDamages: baselineDamagesOf(p, baseline),
    pending: freePending(p),
    preExecution,
    ...(creditor ? { creditor } : {}),
  };
}

/// What has been released already (the system's records and the opening position's), for the release act and its preview.
export const releaseStateOf = (p: PaymentRows) =>
  releaseState(p.retentionReleases.map((r) => ({ kind: r.kind, main: senFromDecimal(r.main), nsc: senFromDecimal(r.nsc), ns: senFromDecimal(r.ns) })), p.openingPosition ? openingOf(p.openingPosition).released : null);

/// Advances applied for whose certificate is neither issued nor void, named (residual MUST 3).
export const pendingAdvancesOf = (p: PaymentRows) =>
  p.advancePayments.filter((a) => a.certificate.status !== "ISSUED" && a.certificate.status !== "VOID").map((a) => ({ label: `the advance to ${a.party === "MAIN" ? "the main contractor" : (a.contractParty?.name ?? "a nominated sub-contractor")} of ${formatSen(senFromDecimal(a.amount))}` }));

/// Residual SHOULD 1: an opening position that does not reconcile, while figures in it are assumed, is said on every
/// later certificate (null otherwise).
export function openingUnreconciledOf(p: PaymentRows): Finding | null {
  const o = p.openingPosition;
  if (!o) return null;
  const assumed = [o.grossProvenance, o.previousProvenance, o.retentionProvenance, o.releasedProvenance].some((x) => x === "ASSUMED");
  const r = openingReconciles(openingOf(o));
  return assumed && r.length ? { code: "OPENING_NOT_RECONCILED_ASSUMED", level: "warn", data: r[0].data ?? {} } : null;
}

/// FR-PAD-003: the issued adjustments of the contract sum, oldest first, each with the net it moved the sum by.
export const issuedAdjustmentsOf = (p: Pick<PaymentRows, "sumAdjustments">) => issuedAdjustmentsFrom(p.sumAdjustments).map((a) => ({ id: a.id, net: a.net }));

/// FR-PAY-008: variations commenced pending approval and not yet approved (named, with their estimate).
export const commencedPendingOf = (p: Pick<PaymentRows, "variations">) =>
  p.variations.filter((v) => !v.approvals.some((a) => a.event === "PRIOR" && a.approvalInstance.status === "APPROVED")).map((v) => ({ reference: v.reference ?? "a variation not yet numbered", estimate: senFromDecimal(v.estimate) }));

// ------------------------------------------------------------------ 6.13 Part B run 1b: damages per scope

type Baseline = NonNullable<ReturnType<typeof baselineOn>>;

/// A scope's date for completion on the baseline (the whole works', or a section's with its own extensions).
export function scopeDateOf(baseline: Baseline, key: string): string | null {
  const v = baseline.values;
  const sections = v.sections.map((x) => ({ ref: x.ref, extensionDays: (x as { extensionDays?: number }).extensionDays ?? 0 }));
  return key === "WHOLE" ? v.dateForCompletion : scopeDate({ dateForCompletion: v.dateForCompletion, sections }, "SECTION", key.slice("SECTION:".length));
}

/// A scope in words, from the baseline's sections.
export function scopeLabelOf(baseline: Baseline | null, key: string): string {
  if (key === "WHOLE") return "the whole works";
  const ref = key.slice("SECTION:".length);
  const sec = baseline?.values.sections.find((x) => x.ref === ref);
  return sec?.description ? `Section ${ref}: ${sec.description}` : `Section ${ref}`;
}

/// The EOT claims, as the damages decision's basis reads them (FR-LAD-001).
export const claimFactsOf = (p: Pick<PaymentRows, "eotClaims">): ClaimFact[] =>
  p.eotClaims.map((c) => ({ id: c.id, reference: c.matter.reference, scope: c.scope as Scope, sectionRef: c.sectionRef, entitlement: c.entitlement as ClaimFact["entitlement"], closed: c.matter.closedAt != null, certified: c.extensions.some((e) => e.certificate.status === "ISSUED") }));
export { claimState };

/// The live decision of each scope (FR-LAD-011), the rows as loaded.
export const liveDecisionsOf = (p: PaymentRows) => liveDecisionsByScope(p.nonCompletions.map((d) => ({ ...d, scope: d.scope as Scope | null, certificateStatus: d.certificate?.status ?? null })));

const waiverApproved = (w: PaymentRows["nonCompletions"][number]["waivers"][number]) => !w.matter.closedAt && w.matter.approvedRouteId != null && approvalOfRecord(w.matter.routes) === w.matter.approvedRouteId;

/// The issued damages lines per scope, the credits they returned, and the waivers applied on them (from what each
/// issued interim froze). A line frozen before damages were kept per scope is read as the only scope ever decided with
/// damages (LAD_LINE_SCOPE_UNKNOWN where two could own it). The opening position's damages before the system count as
/// charged to their day, with no rate on record (a warning where an extension now reaches them).
export function issuedDamagesOf(p: PaymentRows): { issued: IssuedLine[]; returned: CreditRow[]; waiversApplied: { scopeKey: string; amount: Sen }[]; faults: Finding[] } {
  const ladKeys = p.nonCompletions.filter((d) => d.outcome === "LAD_APPLIES").map((d) => scopeKey(d.scope as Scope | null, d.sectionRef));
  const legacy = lineScopeOf(ladKeys);
  const issued: IssuedLine[] = [];
  const returned: CreditRow[] = [];
  const waiversApplied: { scopeKey: string; amount: Sen }[] = [];
  const faults: Finding[] = [];
  for (const v of p.interimValuations) {
    if (v.certificate?.status !== "ISSUED") continue;
    const j = readJudgedUnder(v.judgedUnder);
    if (!j) continue;
    const number = v.certificate.number;
    if (j.ladScopes) {
      for (const sc of j.ladScopes) {
        if (sc.segments.length) issued.push({ certificateId: v.certificate.id, number, scopeKey: sc.key, segments: sc.segments.map((g) => ({ from: g.from, until: g.until, rate: parseSen(g.rate), days: g.days })), gross: parseSen(sc.gross), rounding: 0n });
        if (parseSen(sc.waived) !== 0n) waiversApplied.push({ scopeKey: sc.key, amount: parseSen(sc.waived) });
      }
      for (const c of j.ladCredits ?? []) returned.push({ ...c, rate: parseSen(c.rate), amount: parseSen(c.amount) });
    } else if (j.lad.state === "CHARGED" && j.lad.from && j.lad.until && j.lad.rate && j.lad.days != null) {
      if (!legacy.ok) faults.push({ code: "LAD_LINE_SCOPE_UNKNOWN", level: "block", data: { issuedNumber: number } });
      else issued.push({ certificateId: v.certificate.id, number, scopeKey: legacy.key, segments: [{ from: j.lad.from, until: j.lad.until, rate: parseSen(j.lad.rate), days: j.lad.days }], gross: parseSen(j.lad.rate) * BigInt(j.lad.days), rounding: 0n });
    }
  }
  const o = p.openingPosition;
  if (o?.damagesChargedUntil) issued.push({ certificateId: "opening", number: o.lastCertificateNumber ?? null, scopeKey: legacy.ok ? legacy.key : "WHOLE", segments: [], gross: 0n, rounding: 0n, chargedUntil: storedDay(o.damagesChargedUntil) });
  return { issued, returned, waiversApplied, faults };
}

/// The damages basis as it stands (what an interim freezes at its raise and reads again at its issue).
export function ladBasisOf(p: PaymentRows, baseline: Baseline): LadBasis {
  const live = liveDecisionsOf(p);
  const keys = new Set<string>(["WHOLE", ...live.keys()]);
  return {
    decisions: [...live].map(([key, d]) => ({ key, id: d.id, supersededBy: d.supersededByEot ? (d.supersededByEot.certificate.number ?? d.supersededByEot.id) : null })),
    extensions: p.eotClaims.flatMap((c) => c.extensions.filter((e) => e.certificate.status === "ISSUED").map((e) => e.id)),
    waiversApproved: p.nonCompletions.flatMap((d) => d.waivers.filter((w) => waiverApproved(w) && !w.appliedOnCertificateId).map((w) => w.id)),
    waiversApplied: [],
    scopeDates: Object.fromEntries([...keys].map((k) => [k, scopeDateOf(baseline, k)])),
    segments: Object.fromEntries([...live].map(([key, d]) => [key, d.rate == null ? "" : segmentsKey(rateSegments(senFromDecimal(d.rate), null))])),
  };
}

/// Names for what a moved basis says (an extension by its certificate's number, a waiver by its matter's, a scope in words).
export function basisNamesOf(p: PaymentRows, baseline: Baseline | null) {
  const ext = new Map(p.eotClaims.flatMap((c) => c.extensions.map((e) => [e.id, e.certificate.number ?? "(not yet numbered)"] as const)));
  const wv = new Map(p.nonCompletions.flatMap((d) => d.waivers.map((w) => [w.id, w.matter.reference ?? "(not yet numbered)"] as const)));
  return { extension: (id: string) => ext.get(id) ?? "(an extension of time)", waiver: (id: string) => wv.get(id) ?? "(a waiver)", scope: (k: string) => scopeLabelOf(baseline, k) };
}

/// Everything the interim's damages are assembled from (6.13 Part B run 1b), on the baseline in force.
export function damagesOf(p: PaymentRows, baseline: Baseline, waiversToApply: DamagesIn["waiversToApply"] = []): DamagesIn {
  const live = liveDecisionsOf(p);
  const scopes: ScopeIn[] = live.size
    ? [...live].map(([key, d]) => ({ key, label: scopeLabelOf(baseline, key), dateNow: scopeDateOf(baseline, key), decision: scopeDecisionOf(d, scopeDateOf(baseline, key)) }))
    : [{ key: "WHOLE", label: scopeLabelOf(baseline, "WHOLE"), dateNow: scopeDateOf(baseline, "WHOLE"), decision: null }];
  const d = issuedDamagesOf(p);
  const basis = ladBasisOf(p, baseline);
  // Damages charged before the system have no rate on record: where an extension of time has issued, the days it
  // reaches among them are not returned by the product, and the certificate says so (never silently).
  const opening = d.issued.find((l) => l.certificateId === "opening");
  const warnings: Finding[] = opening && basis.extensions.length ? [{ code: "OPENING_DAMAGES_NOT_CREDITED", level: "warn", data: { day: opening.chargedUntil ?? null } }] : [];
  return { wholeDate: baseline.values.dateForCompletion, scopes, issued: d.issued, returned: d.returned, waiversApplied: d.waiversApplied, waiversToApply, faults: d.faults, warnings, basis };
}

function scopeDecisionOf(d: PaymentRows["nonCompletions"][number], dateNow: string | null): ScopeDecision {
  return {
    id: d.id,
    outcome: d.outcome,
    reason: d.reason,
    certificateIssued: d.certificate?.status === "ISSUED",
    from: day(d.windowFrom),
    until: day(d.windowUntil),
    rate: d.rate == null ? null : senFromDecimal(d.rate),
    dateForCompletion: day(d.dateForCompletion),
    // BD-613-89: superseded for later certificates only; the scope's date now is the new date (a later extension of the
    // scope moves it further, and the decision stays superseded).
    superseded: d.supersededByEot && dateNow ? { eotNumber: d.supersededByEot.certificate.number, newDate: dateNow } : null,
    occupation: null,
  };
}

// ------------------------------------------------------------------ Phase 2 close-out stage A: the LAD waiver's basis and its application

/// What a waiver's LAD amount reads, for one decision, to `asOf` (design note 6.13B §6.9): the decision's window and rate, the scope's date now,
/// its supersession, and the days the issued lines on its scope charged. Null where the decision is not on the contract.
export function waiverBasisOf(p: PaymentRows, baseline: Baseline, decisionId: string, asOf: string): (WaiverBasis & { charging: boolean; scopeKey: string; label: string }) | null {
  const d = p.nonCompletions.find((x) => x.id === decisionId);
  if (!d) return null;
  const key = scopeKey(d.scope as Scope | null, d.sectionRef);
  const live = liveDecisionsOf(p).get(key);
  const label = `the decision on ${scopeLabelOf(baseline, key)}${d.certificate?.number ? ` (${d.certificate.number})` : ""}`;
  const charging = d.outcome === "LAD_APPLIES" && live?.id === d.id && d.rate != null && d.windowFrom != null;
  const dateNow = scopeDateOf(baseline, key);
  const segments = d.rate == null ? [] : rateSegments(senFromDecimal(d.rate), null);
  const charged = issuedDamagesOf(p).issued.filter((l) => l.scopeKey === key).flatMap((l) => l.segments.map((g) => ({ from: g.from, until: g.until, rate: g.rate })));
  const amount = charging ? ladAmountAt({ window: { from: storedDay(d.windowFrom!), until: day(d.windowUntil) }, asOf, scopeDate: dateNow, superseded: d.supersededByEot && dateNow ? { newDate: dateNow } : null, charged, segments }) : 0n;
  const extensions = p.eotClaims.filter((c) => c.scope === "WHOLE" || key === scopeKey("SECTION", c.sectionRef)).flatMap((c) => c.extensions.filter((e) => e.certificate.status === "ISSUED").map((e) => ({ id: e.id, number: e.certificate.number })));
  return { amount, extensions, supersededBy: d.supersededByEot ? (d.supersededByEot.certificate.number ?? d.supersededByEot.id) : null, segments: segmentsKey(segments), charging, scopeKey: key, label };
}

/// A waiver's frozen basis, as stored at its send (`LadWaiver.basis`); null where it cannot be read.
export function readWaiverBasis(j: unknown): WaiverBasis | null {
  const b = j as { amount?: string; extensions?: { id: string; number: string | null }[]; supersededBy?: string | null; segments?: string } | null;
  return b && typeof b.amount === "string" && Array.isArray(b.extensions) && typeof b.segments === "string" ? { amount: parseSen(b.amount), extensions: b.extensions, supersededBy: b.supersededBy ?? null, segments: b.segments } : null;
}
export const waiverBasisJson = (b: WaiverBasis) => ({ amount: senToDecimalString(b.amount), extensions: b.extensions, supersededBy: b.supersededBy, segments: b.segments });

/// The approved waivers the next interim applies (the switch NEXT_CERTIFICATE), and the ones refused LAD_BASIS_MOVED (the raise goes on without
/// them and says so). Each waiver's LAD amount is read again for its own `asOf`.
export function waiversToApplyOf(p: PaymentRows, baseline: Baseline, setting: "NEXT_CERTIFICATE" | "FINAL_ACCOUNT" | null): { apply: DamagesIn["waiversToApply"]; moved: Finding[] } {
  const apply: { id: string; scopeKey: string; amount: Sen; label: string }[] = [];
  const moved: Finding[] = [];
  for (const d of p.nonCompletions) {
    for (const w of d.waivers) {
      const now = waiverBasisOf(p, baseline, d.id, storedDay(w.asOf));
      const frozen = readWaiverBasis(w.basis);
      if (!now || !frozen) continue;
      const a = applicationOf({ setting, approved: waiverApproved(w), applied: w.appliedOnCertificateId != null, frozen, now });
      if (a.state === "APPLY") apply.push({ id: w.id, scopeKey: now.scopeKey, amount: senFromDecimal(w.waived), label: w.matter.reference ?? "a waiver" });
      if (a.state === "MOVED") moved.push({ code: "WAIVER_NOT_APPLIED_MOVED", level: "warn", data: { waiver: w.matter.reference ?? "", moved: String(a.fault.data?.moved ?? "") } });
    }
  }
  return { apply, moved };
}

/// FR-LAD-012: the damages accrual per live decision charging damages, against the policy's day count (unset: "Not set", no alert).
export function accrualOfPayment(p: PaymentRows, baseline: Baseline, policy: { ladAntiOppressionDays: number | null; ladAntiOppressionProvenance: string | null } | null, today: string) {
  const charged = issuedDamagesOf(p).issued;
  const scopes = [...liveDecisionsOf(p)].filter(([, d]) => d.outcome === "LAD_APPLIES").map(([key, d]) => ({ key, label: scopeLabelOf(baseline, key), from: day(d.windowFrom), until: day(d.windowUntil), charged: charged.filter((l) => l.scopeKey === key).reduce((a, l) => a + l.gross, 0n) }));
  return accrualOf({ scopes, today, days: { value: policy?.ladAntiOppressionDays ?? null, provenance: (policy?.ladAntiOppressionProvenance ?? null) as Provenance | null } });
}

/// A waiver's state in words, as its matter stands.
export function waiverStateOf(w: PaymentRows["nonCompletions"][number]["waivers"][number]): "Recorded" | "Awaiting approval" | "Approved" | "Applied" | "Refused" | "Closed" {
  if (w.appliedOnCertificateId) return "Applied";
  if (w.matter.closedAt) return "Closed";
  if (waiverApproved(w)) return "Approved";
  const latest = w.matter.routes.at(-1);
  return latest?.status === "PENDING" ? "Awaiting approval" : latest ? "Refused" : "Recorded";
}
