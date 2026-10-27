import type { Tx } from "@/lib/db";
import { senFromDecimal } from "@/lib/money";

import { PAYABLE_KINDS } from "@/lib/insights/where";

import { caseFunding, splitLocked } from "./case-funding";
import { inForce } from "./eligibility";
import { bpToPercent } from "./split";
import type { CaseFunding, SourceRef } from "./types";

/**
 * The funding source as the headers read it (ADR 0046 FS-5, plan step 5): picked on the requisition, read through it by the tender, the award and the case
 * before signing, and held on the contract once a split is recorded. Labels only; a code never leaves here for a screen.
 */

/// Every source of the organisation, retired ones too: splits and requisitions still name them, and the split's tie order needs their sortOrder.
export async function sourcesOf(client: Tx, organisationId: string): Promise<SourceRef[]> {
  const rows = await client.fundingSource.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  return rows.map((s) => ({ id: s.id, code: s.code, label: s.nameEn, sortOrder: s.sortOrder, envelope: s.envelope == null ? null : senFromDecimal(s.envelope), categoriesRestricted: s.categoriesRestricted, eligibleCategoryCodes: s.eligibleCategoryCodes, retiredOn: s.retiredOn }));
}

/// "Sukuk Tranche 1 2026", or "Sukuk Tranche 1 2026 60% · Internal 40%"; null: not set.
export function fundingText(funding: CaseFunding, names: ReadonlyMap<string, string>): string | null {
  if (funding.state === "NOT_SET") return null;
  const name = (id: string) => names.get(id) ?? "A source no longer configured";
  if (funding.shares.length === 1 && funding.shares[0].bp === 10000) return name(funding.shares[0].sourceId);
  return funding.shares.map((s) => `${name(s.sourceId)} ${bpToPercent(s.bp)}%`).join(" · ");
}

async function names(client: Tx, organisationId: string): Promise<Map<string, string>> {
  return new Map((await client.fundingSource.findMany({ where: { organisationId }, select: { id: true, nameEn: true } })).map((s) => [s.id, s.nameEn]));
}

export async function fundingTextForRequisition(client: Tx, organisationId: string, requisitionId: string): Promise<string | null> {
  const r = await client.requisition.findFirst({ where: { id: requisitionId, organisationId }, select: { fundingSourceId: true } });
  return fundingText(caseFunding([], r?.fundingSourceId ?? null), await names(client, organisationId));
}

export async function contractFunding(client: Tx, organisationId: string, contractId: string): Promise<CaseFunding> {
  const c = await client.contract.findFirst({
    where: { id: contractId, organisationId },
    select: { fundingAllocations: { select: { fundingSourceId: true, sharePct: true }, orderBy: { sharePct: "desc" } }, award: { select: { exercise: { select: { requisition: { select: { fundingSourceId: true } } } } } } },
  });
  return c ? caseFunding(c.fundingAllocations, c.award.exercise.requisition.fundingSourceId) : { state: "NOT_SET" };
}

export async function fundingTextForContract(client: Tx, organisationId: string, contractId: string): Promise<string | null> {
  return fundingText(await contractFunding(client, organisationId, contractId), await names(client, organisationId));
}

/// The header's Funding fact: "Funding: …", or "Funding not set"; null where the organisation keeps no funding source at all, so a customer who does not use them sees nothing.
export async function fundingFact(client: Tx, organisationId: string, text: string | null): Promise<string | null> {
  if (text) return `Funding: ${text}`;
  return (await client.fundingSource.count({ where: { organisationId } })) > 0 ? "Funding not set" : null;
}

/// FS-7's lock, read: an issued certificate of a payable kind, or a supply payment, on the contract.
export async function splitLockedOn(client: Tx, organisationId: string, contractId: string): Promise<boolean> {
  // In turn, not at once: inside a transaction the client is one connection.
  const issuedPayableCertificates = await client.certificate.count({ where: { organisationId, contractId, status: "ISSUED", kind: { in: [...PAYABLE_KINDS] } } });
  const supplyPayments = await client.supplyInvoicePayment.count({ where: { organisationId, contractId } });
  return splitLocked({ issuedPayableCertificates, supplyPayments });
}

export interface FundingCardView {
  state: CaseFunding["state"];
  rows: { label: string; percent: string }[];
  locked: boolean;
  /// The split as it stands, for the drawer: source id and percent.
  current: { sourceId: string; percent: string }[];
  /// Sources in force on the day, for the drawer's dropdowns.
  sources: { value: string; label: string }[];
}

/// The project overview's Funding card (plan §4.5): each source with its share, "From the requisition" when no split is recorded, and whether it is fixed.
export async function fundingCard(client: Tx, organisationId: string, contractId: string, on: Date): Promise<FundingCardView> {
  const [funding, sources, locked] = await Promise.all([contractFunding(client, organisationId, contractId), sourcesOf(client, organisationId), splitLockedOn(client, organisationId, contractId)]);
  const label = (id: string) => sources.find((s) => s.id === id)?.label ?? "A source no longer configured";
  const shares = funding.state === "NOT_SET" ? [] : funding.shares;
  return {
    state: funding.state,
    rows: shares.map((s) => ({ label: label(s.sourceId), percent: bpToPercent(s.bp) })),
    locked,
    current: shares.map((s) => ({ sourceId: s.sourceId, percent: bpToPercent(s.bp) })),
    sources: sources.filter((s) => inForce(s, on)).map((s) => ({ value: s.id, label: s.label })),
  };
}

export interface ImpactCardView {
  /// Measures in force, with this contract's figure (null: none recorded); a retired measure with a figure is kept.
  measures: { id: string; label: string; unit: string; value: string | null }[];
}

/// The project overview's Impact card (SF-04): null while the organisation has no measure, so the card is hidden.
export async function impactCard(client: Tx, organisationId: string, contractId: string, on: Date): Promise<ImpactCardView | null> {
  const [measures, values] = await Promise.all([
    client.impactMeasure.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, unit: true, retiredOn: true } }),
    client.projectImpact.findMany({ where: { organisationId, contractId }, select: { measureId: true, value: true } }),
  ]);
  if (measures.length === 0) return null;
  const valueOf = (id: string) => values.find((v) => v.measureId === id)?.value.toString() ?? null;
  return { measures: measures.filter((m) => inForce(m, on) || valueOf(m.id) != null).map((m) => ({ id: m.id, label: m.nameEn, unit: m.unit, value: valueOf(m.id) })) };
}
