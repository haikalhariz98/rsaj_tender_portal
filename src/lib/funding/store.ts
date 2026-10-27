import type { Prisma } from "@/generated/prisma/client";
import { readIssuedAdjustments } from "@/lib/adjustment/ppjhk";
import type { Tx } from "@/lib/db";
import type { InsightsQuery } from "@/lib/insights/query";
import type { InsightsContext } from "@/lib/insights/store";
import { insightsWhere, PAYABLE_KINDS } from "@/lib/insights/where";
import { financialYear, type FinancialYear } from "@/lib/insights/year";
import { listHref } from "@/lib/list-query";
import { parseSen, senFromDecimal, type Sen } from "@/lib/money";
import { asCorrected, CORRECTIONS } from "@/lib/payment/correction";
import { paidFigureOf, snapshotFigure } from "@/lib/payment/finance";
import { requisitionListWhere } from "@/lib/requisition/repo";

import { caseFunding, splitLocked } from "./case-funding";
import { inForce } from "./eligibility";
import { useOfProceeds, type ContractMoney, type Read, type SourceProceeds } from "./proceeds";
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

// ------------------------------------------------------------------ Use of proceeds (SF-03, RP-03; plan step 7)

/// One source's row on the Dashboard's Use of proceeds tab, and the "Not set" row (no `code`).
export interface ProceedsRow extends Omit<SourceProceeds, "sourceId"> {
  code: string | null;
  label: string;
}

export interface ProceedsProject {
  label: string;
  href: string;
  percent: string;
  committed: Sen;
  certified: Sen;
  paid: Sen;
}

export interface ProceedsFigures {
  tab: "proceeds";
  fy: FinancialYear;
  rows: ProceedsRow[];
  /// The source the address names (`source`), with its projects; null when none is named or it is not the organisation's.
  selected: (ProceedsRow & { projects: ProceedsProject[]; awaitingAward: { count: number; href: string } }) | null;
}

const MONEY_SELECT = {
  id: true,
  number: true,
  status: true,
  contractSum: true,
  award: { select: { awardeeName: true, exercise: { select: { contractTypeCode: true, requisition: { select: { fundingSourceId: true } } } } } },
  fundingAllocations: { select: { fundingSourceId: true, sharePct: true }, orderBy: { sharePct: "desc" } },
  sumAdjustments: { select: { id: true, certificate: { select: { id: true, number: true, status: true, issuedAt: true, issueSnapshot: true } } } },
  certificates: { where: { status: "ISSUED", kind: { in: [...PAYABLE_KINDS] } }, select: { kind: true, number: true, sequence: true, issueSnapshot: true, financePayment: { select: { paidOn: true, batchNo: true, amount: true, ...CORRECTIONS } } } },
  supplyInvoicePayments: { select: { paidOn: true, batchNo: true, amount: true, ...CORRECTIONS } },
} satisfies Prisma.ContractSelect;

type MoneyRow = Prisma.ContractGetPayload<{ select: typeof MONEY_SELECT }>;

const NO_NUMBER = "without a number";

/// One contract's money, as `useOfProceeds` reads it (FS-8): every figure from the portal's own issued records and payments, each payment at its latest correction.
export function contractMoney(c: MoneyRow, supplyRoute: boolean): ContractMoney {
  let certified: Read = { ok: true, sen: 0n };
  for (const x of c.certificates) {
    const v = paidFigureOf(x.kind, x.issueSnapshot);
    if (v == null) {
      certified = { ok: false, number: x.number ?? NO_NUMBER };
      break;
    }
    certified = { ok: true, sen: (certified as { sen: Sen }).sen + parseSen(v) };
  }
  // Amendment 15: what the latest issued interim certificate still held, after release.
  const latest = c.certificates.filter((x) => x.kind === "INTERIM_PAYMENT").sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))[0];
  let retentionHeld: Read = { ok: true, sen: 0n };
  if (latest) {
    const parts = ["retentionMain", "retentionNsc", "retentionNs"].map((k) => snapshotFigure(latest.issueSnapshot, k));
    retentionHeld = parts.some((p) => p == null) ? { ok: false, number: latest.number ?? NO_NUMBER } : { ok: true, sen: parts.reduce((a, p) => a + parseSen(p!), 0n) };
  }
  const payments = [...c.certificates.flatMap((x) => (x.financePayment ? [asCorrected(x.financePayment)] : [])), ...c.supplyInvoicePayments.map((p) => asCorrected(p))];
  return {
    contractId: c.id,
    label: `${c.number} · ${c.award.awardeeName}`,
    status: c.status,
    supplyRoute,
    contractSum: senFromDecimal(c.contractSum),
    adjustments: readIssuedAdjustments(c.sumAdjustments),
    certified,
    retentionHeld,
    paid: payments.reduce((a, p) => a + senFromDecimal(p.amount), 0n),
    funding: caseFunding(c.fundingAllocations, c.award.exercise.requisition.fundingSourceId),
  };
}

/**
 * The Dashboard's Use of proceeds tab: one row per source with money or in force, then "Not set". To date, so the year does not apply. Read only behind
 * `mayReadBudget` (the caller asks); cancelled contracts are left out, and a case the reader may not see follows the Dashboard's rule (`visibleCase`). No
 * SULIT field is read: an approved requisition's estimate is not, only how many await award, counted by the very where of the list it links to.
 */
export async function proceedsFigures(client: Tx, ctx: InsightsContext, q: InsightsQuery): Promise<ProceedsFigures> {
  const organisationId = ctx.organisationId;
  const sources = await sourcesOf(client, organisationId);
  const types = await client.contractType.findMany({ where: { organisationId }, select: { code: true, paymentRoute: true } });
  const rows = await client.contract.findMany({ where: insightsWhere.proceedsContracts(organisationId, ctx.hidden), select: MONEY_SELECT, orderBy: { number: "asc" } });
  const supply = (code: string | null) => types.find((t) => t.code === code)?.paymentRoute === "DELIVERY_ORDER_INVOICE";
  const u = useOfProceeds(sources, rows.map((c) => contractMoney(c, supply(c.award.exercise.contractTypeCode))));
  const rowOf = (r: SourceProceeds): ProceedsRow => {
    const s = sources.find((x) => x.id === r.sourceId)!;
    const { sourceId: _, ...figures } = r;
    return { ...figures, code: s.code, label: s.label };
  };
  const shown = u.bySource.filter((r) => r.contracts > 0 || inForce(sources.find((s) => s.id === r.sourceId)!, ctx.on)).map(rowOf);
  const notSet: ProceedsRow = { ...u.notSet, code: null, label: "Not set", envelope: null, unallocated: null };
  const asked = q.source ? sources.find((s) => s.code === q.source) : undefined;
  let selected: ProceedsFigures["selected"] = null;
  if (asked) {
    // The count and the list it links to agree by construction (I-6): the very where of /requisitions?source=…&stage=awaiting.
    const awaiting = requisitionListWhere(organisationId, { words: [], view: null, unit: null, route: null, method: null, source: asked.code, stage: "awaiting", from: null, to: null });
    selected = {
      ...rowOf(u.bySource.find((r) => r.sourceId === asked.id)!),
      projects: u.parts
        .filter((p) => p.sourceId === asked.id)
        .map((p) => ({ label: p.label, href: `/projects/${p.contractId}`, percent: bpToPercent(p.bp), committed: p.committed, certified: p.certified, paid: p.paid })),
      awaitingAward: { count: await client.requisition.count({ where: awaiting }), href: listHref("/requisitions", { source: asked.code, stage: "awaiting" }) },
    };
  }
  return { tab: "proceeds", fy: financialYear(ctx.periods, q.year), rows: [...shown, notSet], selected };
}
