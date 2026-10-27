/**
 * What an extension's certificate does at its issue (6.13 Part B run 1b design note §6.6, §6.7; ADR 0030; plan
 * closeout-plan.md CO-2, §4.1). Server-only: each runs inside `recordSignature`'s transaction, under the certificate's
 * lock, through `KIND_ISSUE_HOOK` (src/lib/certificate/issue-hooks.ts). The matter, then its record, then the domain row
 * are locked after the certificate (run 1b §1). A refusal is returned as words, and the caller rolls the issue back.
 *
 * - The EOT certificate: refused EOT_MOVED where the scope's date on the latest version is no longer the one it was
 *   raised on; after issue, the EXTENSION_OF_TIME version, `ExtensionOfTime.baselineId`, and every live damages decision
 *   on a scope it moves marked superseded with its note (BD-613-89).
 * - The contract period agreement: refused PERIOD_MOVED likewise; after issue, the PERIOD_EXTENSION version and
 *   `PeriodAgreement.baselineId`.
 * - BD-613-121: the matter a certificate approved on a contract matter is the certificate of (`certificateMatterFacts`).
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import type { CertificateKind } from "@/lib/certificate/types";
import { latestVersion } from "@/lib/contract/baseline";
import { baselineRows, valuesOf } from "@/lib/contract/load";
import { contractLabel, type LoadedContract } from "@/lib/contract/repo";
import { writeExtensionVersion } from "@/lib/contract/version-write";
import { daysFrom, storedDay } from "@/lib/dates";
import { liveDecisionsByScope, supersededNote } from "@/lib/lad/basis";
import type { ContractMatterKind, MatterFacts } from "@/lib/matter/matter";

import { issueMovedFaults, movesScope, scopeDate } from "./extension";
import { timeRefusal } from "./labels";
import { periodMovedFaults } from "./period";
import type { Scope } from "./types";

type Cert = { id: string; kind: string };

const matterSelect = { kind: true, reference: true, closedAt: true, closeReason: true, approvedRouteId: true, routes: { select: { id: true, status: true }, orderBy: [{ openedAt: "asc" }, { id: "asc" }] } } satisfies Prisma.ContractMatterSelect;

/// The matter of the record a matter-approved certificate is the certificate of; null where none is found (a
/// termination, which has no record in Phase 2) or the kind is not approved on a matter.
export async function certificateMatterFacts(tx: Tx, cert: { id: string; kind: CertificateKind | string }): Promise<MatterFacts | null> {
  const m =
    cert.kind === "EOT"
      ? (await tx.extensionOfTime.findUnique({ where: { certificateId: cert.id }, select: { claim: { select: { matter: { select: matterSelect } } } } }))?.claim.matter
      : cert.kind === "CONTRACT_PERIOD_AGREEMENT"
        ? (await tx.periodAgreement.findUnique({ where: { certificateId: cert.id }, select: { extension: { select: { matter: { select: matterSelect } } } } }))?.extension.matter
        : null;
  if (!m) return null;
  return { kind: m.kind as ContractMatterKind, reference: m.reference, closed: m.closedAt ? { reason: m.closeReason } : null, seriesSet: true, routes: m.routes, approvedRouteId: m.approvedRouteId };
}

/// The latest version's values (what the version writer extends).
const latestValues = (l: LoadedContract) => {
  const v = latestVersion(baselineRows(l.contract).versions);
  return v ? valuesOf(v) : null;
};

/// The extension of the certificate, its claim and matter locked after the certificate (run 1b §1).
async function lockedExtension(tx: Tx, certId: string) {
  const pre = await tx.extensionOfTime.findUnique({ where: { certificateId: certId }, select: { id: true, claim: { select: { id: true, matterId: true } } } });
  if (!pre) return null;
  await tx.$queryRaw`SELECT id FROM "ContractMatter" WHERE id = ${pre.claim.matterId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "EotClaim" WHERE id = ${pre.claim.id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "ExtensionOfTime" WHERE id = ${pre.id} FOR UPDATE`;
  return tx.extensionOfTime.findUniqueOrThrow({ where: { id: pre.id }, include: { claim: { select: { scope: true, sectionRef: true } } } });
}

/// EOT_MOVED: the scope's date on the latest version must still be the date the certificate was raised on.
export async function eotIssueRefusal(tx: Tx, l: LoadedContract, cert: Cert): Promise<string | null> {
  const x = await lockedExtension(tx, cert.id);
  if (!x) return "Not issued: the certificate has no extension of time recorded with it.";
  const v = latestValues(l);
  const now = v ? scopeDate({ dateForCompletion: v.dateForCompletion, sections: v.sections.map((s) => ({ ref: s.ref, extensionDays: s.extensionDays ?? 0 })) }, x.claim.scope as Scope, x.claim.sectionRef) : null;
  const fs = issueMovedFaults(storedDay(x.previousCompletion), now);
  return fs.length ? timeRefusal("Not issued:", fs) : null;
}

/// After the EOT certificate's issue: the version, the extension's link to it, and the decisions it supersedes.
export async function eotAtIssue(tx: Tx, actor: AuditActor, l: LoadedContract, cert: Cert, number: string, now: Date, today: string): Promise<string | null> {
  const x = await lockedExtension(tx, cert.id);
  if (!x) return "Not issued: the certificate has no extension of time recorded with it.";
  const scope = x.claim.scope as Scope;
  const version = await writeExtensionVersion(tx, actor, l, { reason: "EXTENSION_OF_TIME", scope, sectionRef: x.claim.sectionRef, days: x.grantedDays, writtenBy: { kind: "EOT", certificateId: cert.id, number }, now, today });
  await tx.extensionOfTime.update({ where: { id: x.id }, data: { baselineId: version.id } });
  const label = contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });
  await writeAudit(tx, { actor, organisationId: l.org.id, entity: "ExtensionOfTime", entityId: x.id, entityLabel: `${label} · extension of time ${number}`, reason: "" }, "UPDATE", diffFields({ baselineVersion: null }, { baselineVersion: `version ${version.version}` }));
  // BD-613-89: every live decision on a scope the extension moves is superseded, for later certificates only.
  await tx.$queryRaw`SELECT id FROM "NonCompletion" WHERE "contractId" = ${l.contract.id} ORDER BY id FOR UPDATE`;
  const rows = await tx.nonCompletion.findMany({ where: { contractId: l.contract.id }, select: { id: true, scope: true, sectionRef: true, replacesId: true, supersededByEotId: true, supersededNote: true, certificate: { select: { status: true, number: true } } }, orderBy: [{ decidedOn: "asc" }, { recordedAt: "asc" }] });
  const live = liveDecisionsByScope(rows.map((r) => ({ ...r, scope: r.scope as Scope | null, certificateStatus: r.certificate?.status ?? null })));
  for (const d of live.values()) {
    if (!movesScope({ scope, sectionRef: x.claim.sectionRef }, d)) continue;
    const newDate = scopeDate({ dateForCompletion: version.values.dateForCompletion, sections: version.values.sections.map((s) => ({ ref: s.ref, extensionDays: s.extensionDays ?? 0 })) }, d.scope ?? "WHOLE", d.sectionRef);
    const note = newDate ? supersededNote(number, newDate, today).en : `Superseded by the extension of time ${number}.`;
    await tx.nonCompletion.update({ where: { id: d.id }, data: { supersededByEotId: x.id, supersededNote: note } });
    await writeAudit(tx, { actor, organisationId: l.org.id, entity: "NonCompletion", entityId: d.id, entityLabel: `${label} · non-completion decision${d.certificate?.number ? ` ${d.certificate.number}` : ""}`, reason: "" }, "UPDATE", diffFields({ supersededBy: d.supersededByEotId ? "an earlier extension of time" : null, note: d.supersededNote || null }, { supersededBy: `the extension of time ${number}`, note }));
  }
  return null;
}

/// The period agreement, its extension and matter locked after the certificate.
async function lockedAgreement(tx: Tx, certId: string) {
  const pre = await tx.periodAgreement.findUnique({ where: { certificateId: certId }, select: { id: true, extension: { select: { id: true, matterId: true } } } });
  if (!pre) return null;
  await tx.$queryRaw`SELECT id FROM "ContractMatter" WHERE id = ${pre.extension.matterId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "PeriodExtension" WHERE id = ${pre.extension.id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "PeriodAgreement" WHERE id = ${pre.id} FOR UPDATE`;
  return tx.periodAgreement.findUniqueOrThrow({ where: { id: pre.id }, include: { extension: { select: { currentExpiry: true, newExpiry: true } } } });
}

/// PERIOD_MOVED: the contract period on the latest version must still end where the agreement was raised on.
export async function periodIssueRefusal(tx: Tx, l: LoadedContract, cert: Cert): Promise<string | null> {
  const a = await lockedAgreement(tx, cert.id);
  if (!a) return "Not issued: the agreement has no extension of the contract period recorded with it.";
  const fs = periodMovedFaults(storedDay(a.extension.currentExpiry), latestValues(l)?.dateForCompletion ?? null);
  return fs.length ? timeRefusal("Not issued:", fs) : null;
}

/// After the agreement's issue: the PERIOD_EXTENSION version (the new expiry as the date for completion) and its link.
export async function periodAtIssue(tx: Tx, actor: AuditActor, l: LoadedContract, cert: Cert, number: string, now: Date, today: string): Promise<string | null> {
  const a = await lockedAgreement(tx, cert.id);
  if (!a) return "Not issued: the agreement has no extension of the contract period recorded with it.";
  const days = daysFrom(storedDay(a.extension.currentExpiry), storedDay(a.extension.newExpiry));
  const version = await writeExtensionVersion(tx, actor, l, { reason: "PERIOD_EXTENSION", scope: "WHOLE", sectionRef: null, days, writtenBy: { kind: "CONTRACT_PERIOD_AGREEMENT", certificateId: cert.id, number }, now, today });
  await tx.periodAgreement.update({ where: { id: a.id }, data: { baselineId: version.id } });
  const label = contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });
  await writeAudit(tx, { actor, organisationId: l.org.id, entity: "PeriodAgreement", entityId: a.id, entityLabel: `${label} · contract period agreement ${number}`, reason: "" }, "UPDATE", diffFields({ baselineVersion: null }, { baselineVersion: `version ${version.version}` }));
  return null;
}
