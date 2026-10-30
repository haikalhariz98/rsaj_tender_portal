/**
 * What the close-out certificates do at their issue (ADR 0047 D1, D2; plan closeout-plan.md CO-2, CO-4, §4.2–4.4; ruling 4). Server-only: each
 * runs inside `recordSignature`'s transaction, under the certificate's lock, through `KIND_ISSUE_HOOK`. The domain row is locked after the
 * certificate, then the defect lines by ascending id (the plan's lock order). A refusal is returned as words, and the caller rolls the issue back.
 *
 * - The CPC: refused while a damages window is open or closes on another day than the completion date, or while open work would be stranded
 *   in PRACTICALLY_COMPLETE; after issue, its lines frozen into `frozenLines`, then the status PRACTICALLY_COMPLETE (its one writer).
 * - The Schedule of Defects: after issue, the lines still open frozen into its `frozenLines`. It writes no status.
 * - The CMGD: refused while a line is open or open work would be stranded in MAKING_GOOD_COMPLETE; after issue, every line frozen with its end
 *   state (a withdrawn one with its reason), then the status MAKING_GOOD_COMPLETE (its one writer).
 * - The FINAL (stage C): refused while the contractor's acceptance is refused (FINAL_NOT_ACCEPTED, ruling 1 of its review), while it reads a contract with a defects liability period and no CMGD, while anything its account read has
 *   moved since its raise (FINAL_BASIS_MOVED), or while open work would be stranded in FINAL_CERTIFICATE_ISSUED; after issue, that status.
 * A status is written only through `contractTransition` with the writer `STATUS_WRITTEN_BY` names.
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import { openCertificate as openCert, openMatter, strandedFaults, type OpenItem } from "@/lib/certificate/issue-hooks";
import { KIND_WORDS } from "@/lib/certificate/labels";
import type { CertificateKind } from "@/lib/certificate/types";
import { contractLabel, type LoadedContract } from "@/lib/contract/repo";
import { CONTRACT_STATUS_WORDS } from "@/lib/contract/labels";
import { contractTransition, type StatusWriter } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { lockLinkedItems, writeScheduleDue } from "@/lib/work/defect-link-store";
import { loadMatters, matterFactsOf } from "@/lib/matter/load";
import { matterApproved, type ContractMatterKind } from "@/lib/matter/matter";
import { matterLabel } from "@/lib/matter/write";
import { eotClaimState } from "@/lib/time/claim-state";
import { claimStateFactsOf } from "@/lib/time/view";

import { ladWindowFaults } from "./completion";
import { defectState, frozenLinesOf, isOpenLine } from "./defects";
import { closeoutRefusal } from "./labels";
import { defectFactsOf, liveLadWindows, loadCloseout } from "./load";
import { finalAcceptanceFaults, variationsNotAdjusted } from "./final-account";
import { loadFinal, variationsOpenNow } from "./final-load";
import { finalMovedFaults } from "./final-write";
import { cmgdFiguresMoved } from "./making-good";
import { cmgdFiguresNow } from "./view";

type Cert = { id: string; kind: string };

/**
 * The open work a status-writing issue must not strand (CO-2): a matter not closed whose work is not finished (its route pending or not sent;
 * an extension of time not yet granted; an extension of the contract period not yet agreed), and every other certificate in DRAFT, IN_ROUTING or
 * SIGNING. `strandedFaults` judges each by its family's row of ACT_STATUS.
 */
export async function openItemsOf(tx: Tx, l: LoadedContract, exceptCertificateId: string): Promise<OpenItem[]> {
  const matters = await loadMatters(l.contract.id, tx);
  const out: OpenItem[] = [];
  for (const m of matters) {
    if (m.closedAt) continue;
    const kind = m.kind as ContractMatterKind;
    const done =
      kind === "EOT" && m.eotClaim ? ["GRANTED", "NOT_ENTITLED", "CLOSED"].includes(eotClaimState(claimStateFactsOf(m)))
      : kind === "PERIOD_EXTENSION" ? !!m.periodExtension?.agreements.some((a) => a.certificate.status === "ISSUED")
      : matterApproved(matterFactsOf(m));
    if (!done) out.push(openMatter(kind, matterLabel(l, m)));
  }
  const certs = await tx.certificate.findMany({ where: { contractId: l.contract.id, status: { in: ["DRAFT", "IN_ROUTING", "SIGNING"] }, id: { not: exceptCertificateId } }, select: { kind: true, number: true }, orderBy: [{ openedAt: "asc" }, { id: "asc" }] });
  for (const c of certs) out.push(openCert(c.kind as CertificateKind, `${KIND_WORDS[c.kind as CertificateKind].en}${c.number ? ` ${c.number}` : " (in progress)"}`));
  return out;
}

/// Write the status the issue writes (or the close, stage C), through its one writer, from where the contract stands (the lock holds it).
export async function writeStatus(tx: Tx, actor: AuditActor, l: LoadedContract, to: ContractStatus, act: StatusWriter): Promise<string | null> {
  const from = l.contract.status as ContractStatus;
  if (contractTransition(from, to, { act })) return `Not issued: the contract cannot move to “${CONTRACT_STATUS_WORDS[to].en}” from “${CONTRACT_STATUS_WORDS[from].en}”.`;
  const moved = await tx.contract.updateMany({ where: { id: l.contract.id, status: from }, data: { status: to } });
  if (moved.count !== 1) return "Not issued: the contract changed while this was being saved. Reload and try again.";
  await writeAudit(tx, { actor, organisationId: l.org.id, entity: "Contract", entityId: l.contract.id, entityLabel: contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } }), reason: "" }, "UPDATE", diffFields({ status: from }, { status: to }));
  return null;
}

/// The status move judged before issue, with the open work it would strand.
async function statusRefusal(tx: Tx, l: LoadedContract, cert: Cert, to: ContractStatus, act: StatusWriter): Promise<string | null> {
  const from = l.contract.status as ContractStatus;
  if (contractTransition(from, to, { act })) return `Not issued: the contract cannot move to “${CONTRACT_STATUS_WORDS[to].en}” from “${CONTRACT_STATUS_WORDS[from].en}”.`;
  const fs = strandedFaults(await openItemsOf(tx, l, cert.id), to);
  return fs.length ? closeoutRefusal("Not issued:", fs) : null;
}

/// The domain row of the certificate, locked after it; then the contract's lines, by ascending id.
async function lockRow(tx: Tx, table: "PracticalCompletion" | "DefectSchedule" | "MakingGood", certId: string) {
  if (table === "PracticalCompletion") await tx.$queryRaw`SELECT id FROM "PracticalCompletion" WHERE "certificateId" = ${certId} FOR UPDATE`;
  if (table === "DefectSchedule") await tx.$queryRaw`SELECT id FROM "DefectSchedule" WHERE "certificateId" = ${certId} FOR UPDATE`;
  if (table === "MakingGood") await tx.$queryRaw`SELECT id FROM "MakingGood" WHERE "certificateId" = ${certId} FOR UPDATE`;
}
async function lockLines(tx: Tx, contractId: string) {
  await tx.$queryRaw`SELECT id FROM "DefectItem" WHERE "contractId" = ${contractId} ORDER BY id FOR UPDATE`;
  return loadCloseout(contractId, tx);
}
const json = (v: unknown) => v as Prisma.InputJsonValue;

// ------------------------------------------------------------------ the certificate of practical completion

export async function cpcIssueRefusal(tx: Tx, l: LoadedContract, cert: Cert): Promise<string | null> {
  await lockRow(tx, "PracticalCompletion", cert.id);
  const pc = await tx.practicalCompletion.findUnique({ where: { certificateId: cert.id } });
  if (!pc) return "Not issued: the certificate has no practical completion recorded with it.";
  await tx.$queryRaw`SELECT id FROM "NonCompletion" WHERE "contractId" = ${l.contract.id} ORDER BY id FOR UPDATE`;
  const fs = ladWindowFaults(storedDay(pc.completionDate), await liveLadWindows(l.contract.id, tx));
  if (fs.length) return closeoutRefusal("Not issued:", fs);
  return statusRefusal(tx, l, cert, "PRACTICALLY_COMPLETE", "PRACTICAL_COMPLETION");
}

export async function cpcAtIssue(tx: Tx, actor: AuditActor, l: LoadedContract, cert: Cert, number: string): Promise<string | null> {
  await lockRow(tx, "PracticalCompletion", cert.id);
  const rows = await lockLines(tx, l.contract.id);
  const pc = await tx.practicalCompletion.findUniqueOrThrow({ where: { certificateId: cert.id } });
  const frozen = frozenLinesOf(defectFactsOf(rows).filter((d) => rows.lines.find((x) => x.id === d.id)?.practicalCompletionId === pc.id));
  await tx.practicalCompletion.update({ where: { id: pc.id }, data: { frozenLines: json(frozen) } });
  await writeAudit(tx, { actor, organisationId: l.org.id, entity: "PracticalCompletion", entityId: pc.id, entityLabel: `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} · practical completion ${number}`, reason: "" }, "UPDATE", diffFields({ defectsCertified: null }, { defectsCertified: `${frozen.length} listed, as issued` }));
  return writeStatus(tx, actor, l, "PRACTICALLY_COMPLETE", "PRACTICAL_COMPLETION");
}

// ------------------------------------------------------------------ the Schedule of Defects

export async function scheduleIssueRefusal(tx: Tx, _l: LoadedContract, cert: Cert): Promise<string | null> {
  await lockRow(tx, "DefectSchedule", cert.id);
  return (await tx.defectSchedule.findUnique({ where: { certificateId: cert.id }, select: { id: true } })) ? null : "Not issued: the certificate has no schedule recorded with it.";
}

export async function scheduleAtIssue(tx: Tx, actor: AuditActor, l: LoadedContract, cert: Cert, number: string): Promise<string | null> {
  await lockRow(tx, "DefectSchedule", cert.id);
  // Contract, then the linked WorkItems, then the lines (the defect link's lock order).
  const scope = { organisationId: l.org.id, contractId: l.contract.id, contractNumber: l.contract.number };
  await lockLinkedItems(tx, scope);
  const rows = await lockLines(tx, l.contract.id);
  const s = await tx.defectSchedule.findUniqueOrThrow({ where: { certificateId: cert.id } });
  const frozen = frozenLinesOf(defectFactsOf(rows).filter((d) => isOpenLine(defectState(d.events).state)));
  // WR-3: an open linked line's item takes the schedule's rectify-by day as its due day.
  await writeScheduleDue(tx, actor, scope, frozen, storedDay(s.rectifyBy));
  await tx.defectSchedule.update({ where: { id: s.id }, data: { frozenLines: json(frozen) } });
  await writeAudit(tx, { actor, organisationId: l.org.id, entity: "DefectSchedule", entityId: s.id, entityLabel: `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} · schedule of defects ${number}`, reason: "" }, "UPDATE", diffFields({ defectsScheduled: null }, { defectsScheduled: `${frozen.length} open, as issued` }));
  return null;
}

// ------------------------------------------------------------------ the certificate of making good defects

export async function cmgdIssueRefusal(tx: Tx, l: LoadedContract, cert: Cert): Promise<string | null> {
  await lockRow(tx, "MakingGood", cert.id);
  if (!(await tx.makingGood.findUnique({ where: { certificateId: cert.id }, select: { id: true } }))) return "Not issued: the certificate has no making good recorded with it.";
  const rows = await lockLines(tx, l.contract.id);
  const open = defectFactsOf(rows).filter((d) => isOpenLine(defectState(d.events).state)).length;
  if (open > 0) return closeoutRefusal("Not issued:", [{ code: "DEFECTS_OPEN", level: "block", data: { n: open } }]);
  // F5 (code review of close-out stage B): what it prints is what is held as it issues; a figure that moved since the raise refuses, by name.
  const printed = (await tx.certificate.findUniqueOrThrow({ where: { id: cert.id }, select: { computedSnapshot: true } })).computedSnapshot as { lines?: { key: string; value: string | null }[] } | null;
  const moved = cmgdFiguresMoved(new Map((printed?.lines ?? []).map((x) => [x.key, x.value])), (await cmgdFiguresNow(l.contract.id, rows, tx)).lines);
  if (moved.length) return closeoutRefusal("Not issued:", moved);
  return statusRefusal(tx, l, cert, "MAKING_GOOD_COMPLETE", "MAKING_GOOD");
}

export async function cmgdAtIssue(tx: Tx, actor: AuditActor, l: LoadedContract, cert: Cert, number: string): Promise<string | null> {
  await lockRow(tx, "MakingGood", cert.id);
  const rows = await lockLines(tx, l.contract.id);
  const mg = await tx.makingGood.findUniqueOrThrow({ where: { certificateId: cert.id } });
  // Ruling 4: every line with its end state; a withdrawn one keeps its reason.
  const frozen = frozenLinesOf(defectFactsOf(rows));
  await tx.makingGood.update({ where: { id: mg.id }, data: { frozenLines: json(frozen) } });
  const withdrawn = frozen.filter((x) => x.state === "WITHDRAWN").length;
  await writeAudit(tx, { actor, organisationId: l.org.id, entity: "MakingGood", entityId: mg.id, entityLabel: `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} · making good of defects ${number}`, reason: "" }, "UPDATE", diffFields({ defectsCertified: null }, { defectsCertified: `${frozen.length - withdrawn} made good${withdrawn ? `, ${withdrawn} withdrawn, not made good` : ""}` }));
  return writeStatus(tx, actor, l, "MAKING_GOOD_COMPLETE", "MAKING_GOOD");
}

// ------------------------------------------------------------------ the final certificate (stage C)

export async function finalIssueRefusal(tx: Tx, l: LoadedContract, cert: Cert): Promise<string | null> {
  await tx.$queryRaw`SELECT id FROM "FinalAccount" WHERE "certificateId" = ${cert.id} FOR UPDATE`;
  // Ruling 1 (code review of close-out stage C): a final account the contractor refused to accept is not issued; it is voided and raised again.
  const signatures = await tx.certificateSignature.findMany({ where: { certificateId: cert.id }, select: { blockKind: true, blockLabel: true, refused: true, signedOn: true }, orderBy: { blockOrder: "asc" } });
  const refused = finalAcceptanceFaults(signatures.map((x) => ({ ...x, signedOn: storedDay(x.signedOn) })));
  if (refused.length) return closeoutRefusal("Not issued:", refused);
  const fa = await loadFinal(l.contract.id, tx);
  if (!fa || fa.certificateId !== cert.id) return "Not issued: the certificate has no final account recorded with it.";
  const rows = await loadCloseout(l.contract.id, tx);
  if (rows.cpc?.certificate.status !== "ISSUED") return closeoutRefusal("Not issued:", [{ code: "CPC_NOT_ISSUED", level: "block" }]);
  // PRACTICALLY_COMPLETE → FINAL_CERTIFICATE_ISSUED only where no defects liability period applies (ADR 0031), judged by this act.
  if (rows.cpc.dlpStart && rows.cmgd?.certificate.status !== "ISSUED") return closeoutRefusal("Not issued:", [{ code: "MAKING_GOOD_NOT_ISSUED_FINAL", level: "block" }]);
  // Ruling 8: a variation approved (or commenced) since the raise is not in what it read, so it is asked again here, by name.
  const open = variationsNotAdjusted(await variationsOpenNow(tx, l.contract.id));
  if (open.length) return closeoutRefusal("Not issued:", open);
  const moved = await finalMovedFaults(tx, l, fa, storedDay(rows.cpc.completionDate));
  if (moved.length) return closeoutRefusal("Not issued:", moved);
  return statusRefusal(tx, l, cert, "FINAL_CERTIFICATE_ISSUED", "FINAL_CERTIFICATE");
}

export async function finalAtIssue(tx: Tx, actor: AuditActor, l: LoadedContract): Promise<string | null> {
  return writeStatus(tx, actor, l, "FINAL_CERTIFICATE_ISSUED", "FINAL_CERTIFICATE");
}
