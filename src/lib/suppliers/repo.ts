/**
 * The supplier register, read (plan 6.15 §5). Reads only, and the adapters from rows to the facts the
 * pure rules judge (`src/lib/suppliers/*`). A write reads the same through its own locked transaction
 * (`client`).
 */

import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";

import type { DocumentFacts, DocumentTypeFacts, Provenance, RegistrationValueKind, SupplierListKind, VerificationState } from "./types";
import { SUPPLIER_EXPIRY_EVENT } from "./expiry";
import { REGISTRATION_NO_FORMAT_KEY } from "./types";

export const supplierOrg = exerciseOrg;
export type SupplierOrg = NonNullable<Awaited<ReturnType<typeof supplierOrg>>>;

const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);

/// A document type row as the rules read it.
export function typeFacts(t: { id: string; nameEn: string; bodyId: string | null; valueKinds: string[]; expires: boolean | null; mandatoryAtRegistration: boolean | null; notApplicableAllowed: boolean | null; retiredOn: Date | null }): DocumentTypeFacts {
  return { id: t.id, label: t.nameEn, bodyId: t.bodyId, valueKinds: t.valueKinds as RegistrationValueKind[], expires: t.expires, mandatoryAtRegistration: t.mandatoryAtRegistration, notApplicableAllowed: t.notApplicableAllowed, retiredOn: day(t.retiredOn) };
}

/// A lodged document row as the rules read it.
export function documentFacts(d: { id: string; typeId: string; typeLabelSnapshot: string; lodgedOn: Date; issuedOn: Date | null; validFrom: Date | null; expiresOn: Date | null; notApplicable: boolean; verification: string; verifiedOn: Date | null; supersedesId: string | null }): DocumentFacts {
  return {
    id: d.id,
    typeId: d.typeId,
    typeLabel: d.typeLabelSnapshot,
    lodgedOn: storedDay(d.lodgedOn),
    issuedOn: day(d.issuedOn),
    validFrom: day(d.validFrom),
    expiresOn: day(d.expiresOn),
    notApplicable: d.notApplicable,
    verification: d.verification as VerificationState,
    verifiedOn: day(d.verifiedOn),
    supersedesId: d.supersedesId,
  };
}

/// The register's configuration: bodies with their values, document types, lists, policy and the number format.
export async function loadSupplierConfig(organisationId: string, client: Tx = db) {
  const [bodies, types, lists, policy, format, reasons, expiryRule] = await Promise.all([
    client.registrationBody.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }], include: { values: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }] } } }),
    client.supplierDocumentType.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    client.supplierListValue.findMany({ where: { organisationId }, orderBy: [{ list: "asc" }, { sortOrder: "asc" }, { nameEn: "asc" }] }),
    client.supplierPolicy.findUnique({ where: { organisationId } }),
    client.codeFormat.findFirst({ where: { organisationId, key: REGISTRATION_NO_FORMAT_KEY } }),
    // a2: the maintained list of standing reasons, and the expiry reminder rule (shown, never sent).
    client.standingReason.findMany({ where: { organisationId }, orderBy: [{ appliesTo: "asc" }, { sortOrder: "asc" }, { nameEn: "asc" }] }),
    client.notificationRule.findFirst({ where: { organisationId, eventKey: SUPPLIER_EXPIRY_EVENT }, select: { id: true, nameEn: true, reminderOffsetDays: true, isActive: true } }),
  ]);
  const listName = (kind: SupplierListKind, code: string) => lists.find((l) => l.list === kind && l.code === code)?.nameEn ?? null;
  const live = (r: { retiredOn: Date | null }, today: string | null) => r.retiredOn == null || (today != null && storedDay(r.retiredOn) > today);
  return {
    bodies,
    types,
    typeFacts: types.map(typeFacts),
    lists,
    policy,
    format,
    reasons,
    /// The reminder offsets in force: none where the rule is absent or off.
    expiryRule,
    reminderOffsets: expiryRule?.isActive ? expiryRule.reminderOffsetDays : [],
    listName,
    /// The codes of a list in force on the day. Empty: the list is not set.
    liveCodes: (kind: SupplierListKind, today: string | null) => lists.filter((l) => l.list === kind && live(l, today)).map((l) => l.code),
    live,
  };
}
export type SupplierConfig = Awaited<ReturnType<typeof loadSupplierConfig>>;

const supplierInclude = {
  contacts: { orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] },
  applications: {
    orderBy: [{ receivedOn: "desc" as const }, { createdAt: "desc" as const }],
    include: {
      recordedBy: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      decisions: { orderBy: { decidedAt: "desc" as const }, include: { decidedBy: { select: { id: true, name: true } }, items: true } },
      routes: {
        orderBy: [{ openedAt: "desc" as const }, { createdAt: "desc" as const }],
        include: { steps: { orderBy: { sequence: "asc" as const }, include: { delegation: { select: { fromPerson: { select: { name: true } } } }, declaredBy: { select: { name: true } } } } },
      },
      attachments: { select: { id: true, purpose: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
    },
  },
  documents: {
    orderBy: [{ lodgedOn: "desc" as const }, { recordedAt: "desc" as const }],
    include: {
      values: true,
      recordedBy: { select: { id: true, name: true } },
      verifiedBy: { select: { id: true, name: true } },
      renewedBy: { select: { id: true } },
      attachments: { select: { id: true, purpose: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
    },
  },
} satisfies Prisma.SupplierInclude;

/// One supplier with everything its record shows. Null when it does not exist.
export async function loadSupplier(id: string, client: Tx = db) {
  const org = await supplierOrg(client);
  if (!org) return null;
  const supplier = await client.supplier.findFirst({ where: { id, organisationId: org.id }, include: supplierInclude });
  if (!supplier) return null;
  return { org, supplier };
}
export type LoadedSupplier = NonNullable<Awaited<ReturnType<typeof loadSupplier>>>;

/// The register, every supplier with its documents and open applications (for the lists and their counts).
export async function listSuppliers(client: Tx = db) {
  const org = await supplierOrg(client);
  if (!org) return null;
  const suppliers = await client.supplier.findMany({
    where: { organisationId: org.id },
    orderBy: [{ registeredName: "asc" }, { id: "asc" }],
    include: {
      documents: { select: { id: true, typeId: true, typeLabelSnapshot: true, lodgedOn: true, issuedOn: true, validFrom: true, expiresOn: true, notApplicable: true, verification: true, verifiedOn: true, supersedesId: true } },
      applications: { orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }], select: { id: true, kind: true, status: true, receivedOn: true, resubmitBy: true, lapsedRecordedAt: true, routes: { select: { status: true } } } },
    },
  });
  return { org, suppliers };
}

/// The supplier's History: every audit row on the supplier, its contacts, applications (and their routes and steps), decisions and documents.
export const HISTORY_PAGE = 200;
export async function supplierHistory(l: LoadedSupplier) {
  const s = l.supplier;
  const ids = [
    s.id,
    ...s.contacts.map((c) => c.id),
    ...s.applications.flatMap((a) => [a.id, ...a.decisions.map((d) => d.id), ...a.routes.flatMap((r) => [r.id, ...r.steps.map((x) => x.id)])]),
    ...s.documents.map((d) => d.id),
  ];
  const where = { organisationId: l.org.id, OR: [{ entityId: { in: ids } }, { entityLabel: { startsWith: `${s.reference} ·` } }] };
  const [rows, total] = await Promise.all([db.auditEntry.findMany({ where, orderBy: { at: "desc" }, take: HISTORY_PAGE }), db.auditEntry.count({ where })]);
  return {
    total,
    entries: rows.map((e) => ({ id: e.id, entity: e.entity, entityLabel: e.entityLabel, action: e.action, at: e.at, reason: e.reason, changes: (e.changes ?? []) as unknown as { field: string; before: string | null; after: string | null }[] })),
  };
}

/// The organisation's day as a stored date, for a column holding a day.
export const orgDay = (today: string) => dayToDate(today);

export type { Provenance };
