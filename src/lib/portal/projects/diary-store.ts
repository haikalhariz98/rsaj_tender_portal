import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { attributeSupplierAct } from "@/lib/auth/supplier-attribution-store";
import type { SupplierActor } from "@/lib/auth/types";
import { actStatusFault } from "@/lib/contract/act-status";
import { contractLabel } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayToDate, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { attestFaults } from "@/lib/supervision/diary";

import { disagreementFaults } from "./submission";
import { inHeldContract, supplierAuditActor } from "./submission-store";
import { ProjectRefused, type ProjectFinding } from "./types";

/**
 * The contractor's agent signs the site diary (FR-SUP-007: "dual-signed by the responsible officer and the contractor's agent"), from the supplier's own portal account, with the password
 * asked again (Phase 4e). One transaction under the contract's lock, the entry locked, the diary rule (`attestFaults`) judged on the locked row as the officers' act judges it, the entry
 * written with the account that signed and the instant, the attribution naming the entry as the exact document signed, and the audit row beside it. The agent's name on the entry is the
 * signed-in contact's, as the supplier named them. A disagreement is recorded the same way (words, not a signature) and escalates the entry to the S.O., as the officers' act does.
 */

const refuse = (fs: readonly ProjectFinding[], status: 404 | 409 | 422 = 422): never => {
  throw new ProjectRefused(fs, status);
};

export async function attestDiaryAsAgent(actor: SupplierActor, i: { contractId: string; entryId: string; stepUpAt: Date | null }, now: Date = new Date()): Promise<{ entryId: string; day: string }> {
  return inHeldContract(actor, i.contractId, async (tx, l, today) => {
    if (actStatusFault("SUPERVISION", l.contract.status as ContractStatus)) return refuse([{ code: "CONTRACT_NOT_ACTIVE", level: "block" }]);
    await tx.$queryRaw`SELECT id FROM "SiteDiaryEntry" WHERE id = ${i.entryId} AND "contractId" = ${l.contract.id} FOR UPDATE`;
    const e = await tx.siteDiaryEntry.findFirst({ where: { id: i.entryId, contractId: l.contract.id, organisationId: actor.organisationId }, select: { id: true, day: true, agentAttestedOn: true, officer: { select: { name: true } } } });
    if (!e) return refuse([{ code: "ENTRY_NOT_FOUND", level: "block" }], 404);
    const day = storedDay(e.day);
    const fs = attestFaults({ who: "AGENT", already: e.agentAttestedOn != null, day, on: today, today, agentName: actor.displayName });
    if (fs.length) return refuse(fs.map((f) => ({ code: f.code === "ALREADY_ATTESTED" ? "ALREADY_ATTESTED" : "ENTRY_IN_FUTURE", level: "block" as const })));
    const moved = await tx.siteDiaryEntry.updateMany({ where: { id: e.id, agentAttestedOn: null }, data: { agentAttestedOn: dayToDate(today), agentName: actor.displayName, agentAttestedBySupplierAccountId: actor.accountId, agentAttestedAt: now } });
    if (moved.count !== 1) return refuse([{ code: "ALREADY_ATTESTED", level: "block" }], 409);
    await attributeSupplierAct(tx, { actor, entity: "SiteDiaryEntry", entityId: e.id, slot: "agentAttestedBy", stepUpAt: i.stepUpAt, document: { entity: "SiteDiaryEntry", id: e.id }, reason: "Signed with the password entered when the entry was attested" });
    await writeAudit(
      tx,
      { actor: supplierAuditActor(actor), organisationId: actor.organisationId, entity: "SiteDiaryEntry", entityId: e.id, entityLabel: `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} · site diary ${formatDate(day)}` },
      "UPDATE",
      diffFields({ attestedBy: null }, { attestedBy: `${actor.displayName} (the contractor's agent), signed from the supplier's own portal account`, attestedOn: today }),
    );
    return { entryId: e.id, day };
  });
}

export async function disputeDiaryAsAgent(actor: SupplierActor, i: { contractId: string; entryId: string; disagreement: string }): Promise<{ entryId: string; day: string }> {
  return inHeldContract(actor, i.contractId, async (tx, l, today) => {
    if (actStatusFault("SUPERVISION", l.contract.status as ContractStatus)) return refuse([{ code: "CONTRACT_NOT_ACTIVE", level: "block" }]);
    await tx.$queryRaw`SELECT id FROM "SiteDiaryEntry" WHERE id = ${i.entryId} AND "contractId" = ${l.contract.id} FOR UPDATE`;
    const e = await tx.siteDiaryEntry.findFirst({ where: { id: i.entryId, contractId: l.contract.id, organisationId: actor.organisationId }, select: { id: true, day: true, disagreement: true } });
    if (!e) return refuse([{ code: "ENTRY_NOT_FOUND", level: "block" }], 404);
    const fs = disagreementFaults({ disagreement: i.disagreement, existing: e.disagreement });
    if (fs.length) return refuse(fs);
    const moved = await tx.siteDiaryEntry.updateMany({ where: { id: e.id, disagreement: "" }, data: { disagreement: i.disagreement.trim(), escalatedOn: dayToDate(today), disputedBySupplierAccountId: actor.accountId } });
    if (moved.count !== 1) return refuse([{ code: "ALREADY_DISPUTED", level: "block" }], 409);
    const day = storedDay(e.day);
    await writeAudit(
      tx,
      { actor: supplierAuditActor(actor), organisationId: actor.organisationId, entity: "SiteDiaryEntry", entityId: e.id, entityLabel: `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} · site diary ${formatDate(day)}` },
      "UPDATE",
      diffFields({ disagreement: null }, { disagreement: i.disagreement.trim(), escalatedToTheSo: today, recordedBy: `${actor.displayName} (the contractor's agent), from the supplier's own portal account` }),
    );
    return { entryId: e.id, day };
  });
}
