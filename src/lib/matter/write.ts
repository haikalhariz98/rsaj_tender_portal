/**
 * The one writer of ContractMatter (6.13 Part B run 1b; ADR 0029; the single-writer scan in contract-matter.test.ts).
 * Server-only: each runs inside the caller's act, under the contract's lock and then the matter's (the matter is the
 * first domain row), and audits before and after in the same transaction under the contract's label. Nobody is signed
 * in: who recorded it is a named Person, "recorded on behalf of, not signed".
 *
 * - `openMatter`: a new matter (no reference until its first send).
 * - `markSent`: the first send's reference (from the `contract_matter` series), and the value, ratio and condition its
 *   route is resolved on (SULIT, BD-613-73).
 * - `writeApprovalOfRecord`: the route hook's write, the latest route approved (only from route-write.ts).
 * - `closeMatter`: closed with its reason (never reopened).
 */

import type { ActWriter } from "@/lib/auth/act-writer";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { contractLabel, type LoadedContract } from "@/lib/contract/repo";
import { senToDecimalString, type Sen } from "@/lib/money";
import type { ExactRatio } from "@/lib/percent-band";

import type { ContractMatterKind } from "./matter";
import type { AuditActor } from "@/lib/auth/types";

export class MatterChanged extends Error {
  constructor() {
    super("The matter changed while this was being saved. Reload and try again.");
    this.name = "MatterChanged";
  }
}

export const MATTER_KIND_WORDS: Readonly<Record<ContractMatterKind, { en: string; ms: string }>> = {
  EOT: { en: "extension-of-time claim", ms: "tuntutan lanjutan masa" },
  PERIOD_EXTENSION: { en: "contract period extension", ms: "lanjutan tempoh kontrak" },
  LAD_WAIVER: { en: "waiver of damages", ms: "pengecualian ganti rugi" },
  TERMINATION: { en: "termination", ms: "penamatan" },
  NOMINATED_INCREASE: { en: "nominated-sum increase", ms: "pertambahan jumlah dinamakan" },
  NOMINATION: { en: "nomination", ms: "penamaan" },
  LOSS_EXPENSE: { en: "loss-and-expense claim", ms: "tuntutan kerugian dan perbelanjaan" },
};

/// How the trail names the matter: under its contract's label, so the contract's History shows it.
export const matterLabel = (l: LoadedContract, m: { kind: string; reference: string | null }) =>
  `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} · ${MATTER_KIND_WORDS[m.kind as ContractMatterKind]?.en ?? "matter"} ${m.reference ?? "(not yet numbered)"}`;

async function audit(tx: Tx, actor: AuditActor, l: LoadedContract, id: string, label: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>, reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: l.org.id, entity: "ContractMatter", entityId: id, entityLabel: label, reason }, action, changes);
}

export async function openMatter(tx: Tx, actor: AuditActor, l: LoadedContract, kind: ContractMatterKind, act: ActWriter, personName: string, now: Date): Promise<string> {
  const row = await tx.contractMatter.create({ data: { organisationId: l.org.id, contractId: l.contract.id, kind, personId: act.subjectPersonId, recordedAt: now } });
  await audit(tx, actor, l, row.id, matterLabel(l, { kind, reference: null }), "CREATE", diffFields(null, { matter: MATTER_KIND_WORDS[kind].en, recordedBy: personName }));
  // The act's own attribution, in this transaction (Phase 2b): the matter's person is whoever the act is attributed to.
  await act.write(tx, row.id);
  return row.id;
}

export async function markSent(tx: Tx, actor: AuditActor, l: LoadedContract, m: { id: string; kind: string; reference: string | null }, i: { reference: string | null; value: Sen | null; ratio: ExactRatio | null; cond: string | null }): Promise<string | null> {
  const reference = m.reference ?? i.reference;
  const moved = await tx.contractMatter.updateMany({
    where: { id: m.id, closedAt: null, reference: m.reference },
    data: { reference, matterRoutedValue: i.value == null ? null : senToDecimalString(i.value), matterRatioNum: i.ratio ? senToDecimalString(i.ratio.num) : null, matterRatioDen: i.ratio ? senToDecimalString(i.ratio.den) : null, cond: i.cond },
  });
  if (moved.count !== 1) throw new MatterChanged();
  await audit(tx, actor, l, m.id, matterLabel(l, { kind: m.kind, reference }), "UPDATE", diffFields({ reference: m.reference }, { reference, sentForApproval: "yes", routedOn: i.cond ?? (i.ratio ? "the share waived of the damages" : i.value != null ? "its value" : "the matrix's row for it") }));
  return reference;
}

export async function writeApprovalOfRecord(tx: Tx, actor: AuditActor, l: LoadedContract, m: { id: string; kind: string; reference: string | null }, routeId: string): Promise<void> {
  const moved = await tx.contractMatter.updateMany({ where: { id: m.id, closedAt: null }, data: { approvedRouteId: routeId } });
  if (moved.count !== 1) throw new MatterChanged();
  await audit(tx, actor, l, m.id, matterLabel(l, m), "UPDATE", diffFields({ approved: "no" }, { approved: "yes, its route approved" }));
}

export async function closeMatter(tx: Tx, actor: AuditActor, l: LoadedContract, m: { id: string; kind: string; reference: string | null }, reason: string, now: Date): Promise<void> {
  const moved = await tx.contractMatter.updateMany({ where: { id: m.id, closedAt: null }, data: { closedAt: now, closeReason: reason } });
  if (moved.count !== 1) throw new MatterChanged();
  await audit(tx, actor, l, m.id, matterLabel(l, m), "UPDATE", diffFields({ stage: "open" }, { stage: "closed" }), reason);
}
