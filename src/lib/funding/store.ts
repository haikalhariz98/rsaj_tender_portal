import type { Tx } from "@/lib/db";
import { senFromDecimal } from "@/lib/money";

import { caseFunding } from "./case-funding";
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
