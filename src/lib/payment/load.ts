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
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import type { Decision } from "@/lib/lad/charge";
import { liveDecision } from "@/lib/lad/non-completion";
import { formatSen, parseSen, senFromDecimal, type Sen } from "@/lib/money";
import type { ContractPartyKind } from "@/lib/supervision/types";

import { readJudgedUnder, type AssembleInput, type IssuedInterim, type ValuationIn } from "./assemble";
import { EXECUTED_STATUSES } from "./eligibility";
import { OPENING_GROUP_WORDS } from "./labels";
import { assumedGroups, openingAsIssued, openingReconciles, openingReleaseRow, releaseState, type OpeningProvenance } from "./opening";
import type { Finding, KeyedDeductionKind, PackItem, Provenance, ValuationTrigger, WaterfallRemainder } from "./types";

const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const pct = (v: { toString(): string } | null | undefined) => {
  if (v == null) return null;
  const x = v.toString();
  return x.includes(".") ? x.replace(/0+$/, "").replace(/\.$/, "") : x;
};
const senOrNull = (v: { toString(): string } | null | undefined): Sen | null => (v == null ? null : parseSen(v.toString()));

const certSelect = { id: true, kind: true, status: true, number: true, sequence: true, certificateDate: true, issuedAt: true, issueSnapshot: true, openedOn: true, financePayment: { include: { person: { select: { name: true } } } } } as const;

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
  nonCompletions: { include: { person: { select: { name: true } }, certificate: { select: certSelect } }, orderBy: [{ decidedOn: "asc" as const }, { recordedAt: "asc" as const }] },
  pendingDeductions: { include: { valuation: { select: { id: true, certificate: { select: { status: true } } } }, person: { select: { name: true } } }, orderBy: { paidOn: "asc" as const } },
  openingPosition: { include: { person: { select: { name: true } } } },
  certificates: { where: { kind: "INTERIM_PAYMENT" as const, status: "ISSUED" as const, interimValuation: { is: null } }, select: { number: true, sequence: true }, orderBy: { sequence: "asc" as const } },
  contractParties: { orderBy: [{ kind: "asc" as const }, { recordedAt: "asc" as const }] as { kind?: "asc"; recordedAt?: "asc" }[] },
  siteRecordsHandovers: { where: { recordsSet: "AS_BUILT" as const }, orderBy: { handedOverOn: "asc" as const } },
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
  const [policy, kinds, clocks] = await Promise.all([
    client.postAwardPolicy.findUnique({ where: { organisationId } }),
    client.certificateKindSetting.findMany({ where: { organisationId }, include: { template: { select: { id: true, nameEn: true } }, routingType: { select: { id: true, labelEn: true, retiredOn: true } } } }),
    client.contractClockRule.findMany({ where: { organisationId } }),
  ]);
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
export function assembleInputOf(l: LoadedContract, p: PaymentRows, cfg: PaymentConfig, v: PaymentRows["interimValuations"][number], today: string, preExecution: Awaited<ReturnType<typeof preExecutionFacts>>): AssembleInput | null {
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
    // Step 4 (FR-PAD-003) adds the issued adjustments of the contract sum: none can be issued before it.
    adjustments: [],
    // The opening position's release first (MUST 1: never clawed back), then the system's.
    releases: [...openingReleaseRow(p.openingPosition ? openingOf(p.openingPosition).released : null), ...p.retentionReleases.map((r) => ({ main: senFromDecimal(r.main), nsc: senFromDecimal(r.nsc), ns: senFromDecimal(r.ns), releasedOn: storedDay(r.releasedOn) }))],
    advances: issuedAdvances(p),
    decision: decisionOf(p, baseline),
    baselineDamages: baselineDamagesOf(p, baseline),
    pending: freePending(p),
    preExecution,
  };
}

/// The four pack items as stored.
export const packOf = (json: unknown): { item: PackItem; text: string; notRequired: boolean }[] => (Array.isArray(json) ? (json as { item: PackItem; text: string; notRequired: boolean }[]) : []);

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
