/**
 * Certificates, loaded (6.14 increment 1). Reads only, apart from the one lock helper every certificate write
 * goes through. Every rule is in the pure modules beside this.
 *
 * The lock order (ADR 0022, 6.12 condition): `withLockedCertificate` runs inside 6.12's `withLockedContract`
 * (Requisition → Exercise → Award → Contract) and then locks the certificate row; a domain row (6.13) comes
 * after it, the supplier last. A source scan (`certificate-scan.test.ts`) keeps every certificate write on
 * this helper.
 */

import type { Tx } from "@/lib/audit/record";
import { contractLabel, loadContract, withLockedContract, type LoadedContract } from "@/lib/contract/repo";
import { dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";

import { KIND_WORDS } from "./labels";
import { sheetLabelsOf, type PrintedField } from "./printed";
import type { TemplateNow } from "./revision";
import type { Term } from "./terms";
import type { CheckDef, TypeNow } from "./routing-sheet";
import type { OfficeHolders } from "./signature";
import type { Block, CertificateKind, DistributionRow, SignedBlock } from "./types";
import { inOrder } from "@/lib/series";

export const certificateInclude = {
  signatures: { include: { person: { select: { id: true, name: true } } }, orderBy: { blockOrder: "asc" as const } },
  overrides: { orderBy: { recordedAt: "asc" as const } },
  documents: { orderBy: [{ version: "asc" as const }, { language: "asc" as const }] },
  copies: { orderBy: { copyNo: "asc" as const } },
  approvalInstances: { include: { steps: { orderBy: { sequence: "asc" as const } } }, orderBy: [{ openedAt: "asc" as const }, { createdAt: "asc" as const }] },
  routingChecks: { orderBy: [{ iteration: "asc" as const }, { defOrder: "asc" as const }] },
  template: { select: { id: true, code: true, nameEn: true, nameMs: true } },
  routingType: { select: { id: true, labelEn: true } },
  baseline: { select: { id: true, version: true, reason: true, recordedOn: true, contractSum: true, contractDate: true, completionPeriod: true, completionUnit: true } },
  section: { select: { id: true, ref: true, description: true } },
};

async function readCertificate(id: string, contractId: string, client: Tx) {
  return client.certificate.findFirst({ where: { id, contractId }, include: certificateInclude });
}

export type CertificateRow = NonNullable<Awaited<ReturnType<typeof readCertificate>>>;
export type LoadedCertificate = LoadedContract & { cert: CertificateRow };

/// A certificate with its contract (6.12's loader), read on one client.
export async function loadCertificate(organisationId: string, id: string, client: Tx = db): Promise<LoadedCertificate | null> {
  const c = await client.certificate.findFirst({ where: { id, organisationId }, select: { contractId: true } });
  if (!c) return null;
  const l = await loadContract(organisationId, c.contractId, client);
  if (!l) return null;
  const cert = await readCertificate(id, l.contract.id, client);
  if (!cert || cert.organisationId !== l.org.id) return null;
  return { ...l, cert };
}

/**
 * Lock the contract's chain (6.12's helper), then the certificate, and re-read it. Null: the certificate or its
 * contract is gone, or it is not this contract's.
 */
export async function withLockedCertificate<T>(organisationId: string, certificateId: string, fn: (tx: Tx, l: LoadedCertificate) => Promise<T>): Promise<T | null> {
  const found = await db.certificate.findFirst({ where: { id: certificateId, organisationId }, select: { contractId: true } });
  if (!found) return null;
  return withLockedContract(organisationId, found.contractId, async (tx, l) => {
    await tx.$queryRaw`SELECT id FROM "Certificate" WHERE id = ${certificateId} FOR UPDATE`;
    const cert = await readCertificate(certificateId, l.contract.id, tx);
    if (!cert || cert.organisationId !== l.org.id) return null;
    return fn(tx, { ...l, cert });
  });
}

/// How the trail names a certificate: under its contract's label, so the contract's History shows it too.
export function certificateLabel(l: LoadedContract, c: { kind: CertificateKind; number: string | null; id: string }): string {
  return `${contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } })} · ${KIND_WORDS[c.kind].en}${c.number ? ` ${c.number}` : ""}`;
}

/// A form as it stands now, with its blocks in printed order and its list (FR-CRT-001).
export async function templateNow(templateId: string | null, client: Tx = db): Promise<TemplateNow | null> {
  if (!templateId) return null;
  const t = await client.documentTemplate.findUnique({
    where: { id: templateId },
    include: {
      signatureBlocks: { orderBy: { blockOrder: "asc" } },
      distributionRows: { orderBy: [{ sortOrder: "asc" }, { recipientCode: "asc" }] },
      // 6.14 increment 2: the printed form and the corrections that apply to it.
      printedFields: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] },
      correctionForms: { include: { correction: { select: { id: true, fromText: true, toText: true } } } },
    },
  });
  if (!t) return null;
  // The organisation's terms, for {{term:code}} (frozen at the pin, only those the text cites).
  const terms = await client.term.findMany({ where: { organisationId: t.organisationId }, orderBy: { code: "asc" }, include: { aliases: { orderBy: { alias: "asc" } } } });
  return {
    id: t.id,
    code: t.code,
    nameEn: t.nameEn,
    nameMs: t.nameMs,
    formCode: t.formCode,
    revisionDate: t.revisionDate ? storedDay(t.revisionDate) : null,
    bodyVersion: t.bodyVersion,
    bodyEn: t.bodyEn,
    bodyMs: t.bodyMs,
    blocks: t.signatureBlocks.map(blockOf),
    distribution: t.distributionRows.map(rowOf),
    pageCount: t.pageCount,
    fields: t.printedFields.map(printedFieldOf),
    corrections: t.correctionForms.map((f) => ({ id: f.correction.id, fromText: f.correction.fromText, toText: f.correction.toText })),
    terms: terms.map(termOf),
  };
}

/// A printed field as the rules read it.
export const printedFieldOf = (f: { key: string; labelEn: string; labelMs: string | null; bound: boolean; computedKey: string | null; sortOrder: number }): PrintedField => ({ key: f.key, labelEn: f.labelEn, labelMs: f.labelMs, bound: f.bound, computedKey: f.computedKey, sortOrder: f.sortOrder });

/// A term with its aliases as the rules read it.
export const termOf = (t: { code: string; canonicalEn: string | null; canonicalMs: string | null; aliases: readonly { alias: string }[] }): Term => ({ code: t.code, canonicalEn: t.canonicalEn, canonicalMs: t.canonicalMs, aliases: t.aliases.map((a) => a.alias) });

export const blockOf = (b: { blockOrder: number; blockKind: Block["blockKind"]; labelEn: string; labelMs: string | null; datesCertificate: boolean; officeRule: Block["officeRule"]; officeCode: string | null; delegable: boolean | null; carriesDecision: boolean; refusalAllowed: boolean }): Block => ({
  blockOrder: b.blockOrder,
  blockKind: b.blockKind,
  labelEn: b.labelEn,
  labelMs: b.labelMs,
  datesCertificate: b.datesCertificate,
  officeRule: b.officeRule,
  officeCode: b.officeCode,
  delegable: b.delegable,
  carriesDecision: b.carriesDecision,
  refusalAllowed: b.refusalAllowed,
});

export const rowOf = (r: { recipientCode: string; labelEn: string; labelMs: string | null; mandatory: boolean; ackRequired: boolean; condition: DistributionRow["condition"]; isOriginal: boolean; sortOrder: number }): DistributionRow => ({
  recipientCode: r.recipientCode,
  labelEn: r.labelEn,
  labelMs: r.labelMs,
  mandatory: r.mandatory,
  ackRequired: r.ackRequired,
  condition: r.condition,
  isOriginal: r.isOriginal,
  sortOrder: r.sortOrder,
});

/// A routing sheet type as it stands now, with the office names its checks name.
export async function routingTypeNow(typeId: string | null, client: Tx = db): Promise<TypeNow | null> {
  if (!typeId) return null;
  const t = await client.routingSheetType.findUnique({ where: { id: typeId }, include: { checks: { orderBy: { order: "asc" } }, targets: true, template: { select: { id: true, nameEn: true, formCode: true, revisionDate: true, pageCount: true, printedFields: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] } } } } });
  if (!t) return null;
  const codes = t.checks.map((c) => c.officeCode).filter((c): c is string => c != null);
  const roles = codes.length ? await client.authorityRole.findMany({ where: { organisationId: t.organisationId, code: { in: codes } }, select: { code: true, nameEn: true } }) : [];
  return {
    id: t.id,
    code: t.code,
    labelEn: t.labelEn,
    labelMs: t.labelMs,
    subject: t.subject,
    certificateKind: t.certificateKind,
    upperEdgeInclusive: t.upperEdgeInclusive,
    provenance: t.provenance,
    retiredOn: t.retiredOn ? storedDay(t.retiredOn) : null,
    checks: t.checks.map((c): CheckDef => ({ order: c.order, kind: c.kind, labelEn: c.labelEn, labelMs: c.labelMs, officeCode: c.officeCode, officeLabel: roles.find((r) => r.code === c.officeCode)?.nameEn ?? null, targetDays: c.targetDays })),
    targets: t.targets.map((x) => ({ pctMin: x.pctMin?.toString() ?? null, pctMax: x.pctMax?.toString() ?? null, targetDays: x.targetDays, provenance: x.provenance })),
    // 6.14 increment 2: the printed sheet (the document tracking form) with its labels, frozen with the type when a sheet starts.
    printedForm: t.template ? { name: t.template.nameEn, formCode: t.template.formCode, revisionDate: t.template.revisionDate ? storedDay(t.template.revisionDate) : null, pageCount: t.template.pageCount, labels: sheetLabelsOf(t.template.printedFields.map(printedFieldOf)) } : null,
  };
}

/// The signatures as the rules read them.
export const signedOf = (cert: Pick<CertificateRow, "signatures">): SignedBlock[] =>
  cert.signatures.map((s) => ({ blockOrder: s.blockOrder, personId: s.personId, name: s.name, signedOn: storedDay(s.signedOn), refused: s.refused, decision: s.decision }));

/// The routes and checks as the sheet reads them: pure, in sheet-rows.ts.
export { checksOf, routesOf } from "./sheet-rows";

/**
 * Who holds an office on a day, for the contract's requisition unit (the nearest unit with a holder, else
 * organisation-wide), with live delegates of the whole office (holdersFor, as 6.1 and 6.11 judge it).
 * `instructionOnly` is false: increment 1 has no delegation scope (6.13 adds it).
 */
export async function officeHolders(l: LoadedContract, roleCode: string, day: string, client: Tx = db): Promise<OfficeHolders> {
  const people = await loadOfficePeople(l.org, client);
  return officeHoldersFrom(people, roleCode, l.req.sectionUnitCode || l.req.requestingUnitCode, day);
}

/// The organisation's roster, delegations and units, read once, for `officeHoldersFrom` (a reader of many contracts reads them once, not per contract).
export type OfficePeople = { roster: Awaited<ReturnType<typeof loadRoster>>; delegations: Awaited<ReturnType<typeof loadDelegations>>; units: OrgUnit[] };
export async function loadOfficePeople(org: { id: string; code: string }, client: Tx = db): Promise<OfficePeople> {
  const [roster, delegations, units] = await inOrder(() => loadRoster(org.code, client), () => loadDelegations(org.code, client), () => client.orgUnit.findMany({ where: { organisationId: org.id } }));
  return { roster, delegations, units: units as unknown as OrgUnit[] };
}

/// `officeHolders` on people already read: the office's holders for a requisition's unit on a day, and the live delegates of the whole office.
export function officeHoldersFrom(people: OfficePeople, roleCode: string, unitCode: string, day: string): OfficeHolders {
  const unitPath = pathTo(people.units, unitCode, dayToDate(day)).reverse().map((u) => u.code);
  const h = holdersFor(roleCode, unitPath, people.roster, people.delegations, day);
  return { holderIds: h.holderIds, delegates: h.delegates.map((d) => ({ personId: d.personId, delegationId: d.delegation.id, instructionOnly: false })) };
}

/// The name of an office, as configured now.
export async function officeName(organisationId: string, code: string | null, client: Tx = db): Promise<string | null> {
  if (!code) return null;
  return (await client.authorityRole.findFirst({ where: { organisationId, code }, select: { nameEn: true } }))?.nameEn ?? null;
}

/// A performance bond verified and in force on the day, with its issuer's name (the guarantor's copy, FR-CRT-006).
export function liveBondOf(l: LoadedContract, day: string): { issuerName: string } | null {
  const b = l.contract.securities.find((s) => s.kind === "PERFORMANCE_BOND" && s.status === "VERIFIED" && storedDay(s.effectiveFrom) <= day && (!s.expiresOn || storedDay(s.expiresOn) >= day));
  return b ? { issuerName: b.issuer?.name ?? b.issuerNameAsWritten } : null;
}

export const CERTIFICATES_PAGE = 100;

/// A contract's certificates, newest first, bounded (the contract's Documents tab).
export async function certificatesOfContract(contractId: string, page = 0, client: Tx = db) {
  const where = { contractId };
  const [rows, total] = await inOrder(
    () => client.certificate.findMany({ where, orderBy: [{ openedAt: "desc" }, { id: "asc" }], skip: page * CERTIFICATES_PAGE, take: CERTIFICATES_PAGE, select: { id: true, kind: true, number: true, sequence: true, status: true, certificateDate: true, openedOn: true, issuedAt: true, copies: { select: { mandatory: true, ackRequired: true, despatchedOn: true, acknowledgedOn: true } } } }),
    () => client.certificate.count({ where }));
  return { rows, total };
}
