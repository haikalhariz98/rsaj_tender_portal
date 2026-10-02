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
  // a2: standing (recorded acts and requests with their routes), and what is linked to the supplier.
  standingEvents: { orderBy: [{ effectiveOn: "desc" as const }, { recordedAt: "desc" as const }], include: { recordedBy: { select: { id: true, name: true } } } },
  standingRequests: {
    orderBy: { requestedAt: "desc" as const },
    include: {
      requestedBy: { select: { id: true, name: true } },
      withdrawnBy: { select: { id: true, name: true } },
      sourceAward: { select: { id: true, reference: true } },
      event: { select: { id: true } },
      routes: { orderBy: [{ createdAt: "desc" as const }], include: { steps: { orderBy: { sequence: "asc" as const }, include: { delegation: { select: { fromPerson: { select: { name: true } } } }, declaredBy: { select: { name: true } } } } } },
    },
  },
  parties: {
    orderBy: { createdAt: "asc" as const },
    include: {
      exercise: { select: { id: true, reference: true, title: true, status: true, window: { select: { specialPermissionOffered: true } }, registrationRequirements: { orderBy: [{ alternativeGroup: "asc" as const }, { sortOrder: "asc" as const }], select: { id: true, bodyLabelSnapshot: true, qualifiers: true } } } },
      sales: { orderBy: { soldOn: "asc" as const }, select: { id: true, soldOn: true, voidedAt: true, registrationCheck: true, suspensionCheck: true, eligibilitySnapshot: true } },
      openedBids: { orderBy: { listingNo: "asc" as const }, select: { id: true, listingNo: true, eligibilityFinding: true, verdict: true } },
      specialPermissions: {
        orderBy: { requestedAt: "asc" as const },
        include: { requestedBy: { select: { name: true } }, grantedBy: { select: { name: true } }, routes: { orderBy: [{ createdAt: "desc" as const }], include: { steps: { orderBy: { sequence: "asc" as const }, include: { delegation: { select: { fromPerson: { select: { name: true } } } }, declaredBy: { select: { name: true } } } } } } },
      },
    },
  },
  awards: { orderBy: { createdAt: "asc" as const }, select: { id: true, reference: true, status: true, awardeeName: true, awardeePartyId: true, cancelConsequence: true } },
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

/// How many suppliers the register shows on a page, and how many the queue and the watched lists show at most (fix R-10).
export const SUPPLIERS_PAGE = 100;

/// What every list row derives its standing and document states from, and nothing more.
const listedSupplier = {
  id: true,
  reference: true,
  registeredName: true,
  registrationNo: true,
  status: true,
  erpVendorCode: true,
  documents: { select: { id: true, typeId: true, typeLabelSnapshot: true, lodgedOn: true, issuedOn: true, validFrom: true, expiresOn: true, notApplicable: true, verification: true, verifiedOn: true, supersedesId: true } },
  // a2: standing is derived from these, never stored.
  standingEvents: { select: { id: true, kind: true, effectiveOn: true, endsOn: true, offenceNo: true, reasonSnapshot: true, reinstatesEventId: true, liftsEventId: true, flaggedDocumentIds: true } },
} satisfies Prisma.SupplierSelect;

const OPEN_APPLICATION = { status: { in: ["RECEIVED" as const, "RESUBMISSION_REQUESTED" as const] }, lapsedRecordedAt: null };

/**
 * The /suppliers lists, each loading only what it shows (fix R-10, the requisitions' page pattern):
 *
 * - the register: one page of suppliers by name (`page`, from 0), with their documents, standing events and
 *   open application only, and the total;
 * - the queue: the open applications, oldest first, up to a page, and how many there are;
 * - the watched suppliers, for the Expiring and Standing lists: those with a standing event or request, or a
 *   verified document with an expiry up to `horizon` (the furthest band from today; every expiry where the
 *   bands are not set, as the Expiring list then shows each one), by name, up to a page, and how many.
 *
 * Counts that are columns are counted in the database; what is derived (standing, document states, bands)
 * is derived from the rows read, never stored.
 */
export async function listSuppliers(page = 0, horizon: string | null = null, client: Tx = db) {
  const org = await supplierOrg(client);
  if (!org) return null;
  const where = { organisationId: org.id };
  const watchWhere: Prisma.SupplierWhereInput = {
    organisationId: org.id,
    OR: [
      { standingEvents: { some: {} } },
      { standingRequests: { some: {} } },
      { documents: { some: { verification: "VERIFIED", notApplicable: false, expiresOn: horizon ? { not: null, lte: dayToDate(horizon) } : { not: null } } } },
    ],
  };
  // A page past the end shows the last page.
  const total = await client.supplier.count({ where });
  const at = Math.min(Math.max(0, page), Math.max(0, Math.ceil(total / SUPPLIERS_PAGE) - 1));
  const [suppliers, registered, unsynced, queue, queueTotal, watched, watchedTotal] = await Promise.all([
    client.supplier.findMany({
      where,
      orderBy: [{ registeredName: "asc" }, { id: "asc" }],
      skip: at * SUPPLIERS_PAGE,
      take: SUPPLIERS_PAGE,
      select: { ...listedSupplier, applications: { where: OPEN_APPLICATION, orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }], take: 1, select: { id: true, kind: true, status: true, resubmitBy: true, lapsedRecordedAt: true, routes: { select: { status: true } } } } },
    }),
    client.supplier.count({ where: { ...where, status: "REGISTERED" } }),
    client.supplier.count({ where: { ...where, status: "REGISTERED", erpVendorCode: null } }),
    client.supplierApplication.findMany({
      where: { ...where, ...OPEN_APPLICATION },
      orderBy: [{ receivedOn: "asc" }, { createdAt: "asc" }],
      take: SUPPLIERS_PAGE,
      select: { id: true, kind: true, status: true, receivedOn: true, resubmitBy: true, lapsedRecordedAt: true, routes: { select: { status: true } }, supplier: { select: { id: true, reference: true, registeredName: true } } },
    }),
    client.supplierApplication.count({ where: { ...where, ...OPEN_APPLICATION } }),
    client.supplier.findMany({
      where: watchWhere,
      orderBy: [{ registeredName: "asc" }, { id: "asc" }],
      take: SUPPLIERS_PAGE,
      select: { ...listedSupplier, standingRequests: { select: { id: true, kind: true, withdrawnAt: true, event: { select: { id: true } }, routes: { select: { status: true, createdAt: true } } } } },
    }),
    client.supplier.count({ where: watchWhere }),
  ]);
  return { org, page: at, suppliers, total, registered, unsynced, queue, queueTotal, watched, watchedTotal };
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
    // a2: standing events, requests and their routes; linked parties, awards and special permissions.
    ...s.standingEvents.map((e) => e.id),
    ...s.standingRequests.flatMap((r) => [r.id, ...r.routes.flatMap((x) => [x.id, ...x.steps.map((st) => st.id)])]),
    ...s.parties.flatMap((p) => [p.id, ...p.specialPermissions.flatMap((sp) => [sp.id, ...sp.routes.flatMap((x) => [x.id, ...x.steps.map((st) => st.id)])])]),
  ];
  // An award's own trail stays on the award: here only its link to this supplier.
  const where = { organisationId: l.org.id, OR: [{ entityId: { in: ids } }, { entityLabel: { startsWith: `${s.reference} ·` } }, { entity: "Award", entityId: { in: s.awards.map((a) => a.id) }, entityLabel: { endsWith: "· Awardee's supplier" } }] };
  const [rows, total] = await Promise.all([db.auditEntry.findMany({ where, orderBy: { at: "desc" }, take: HISTORY_PAGE }), db.auditEntry.count({ where })]);
  return {
    total,
    entries: rows.map((e) => ({ id: e.id, entity: e.entity, entityLabel: e.entityLabel, action: e.action, at: e.at, reason: e.reason, changes: (e.changes ?? []) as unknown as { field: string; before: string | null; after: string | null }[] })),
  };
}

/// The organisation's day as a stored date, for a column holding a day.
export const orgDay = (today: string) => dayToDate(today);

export type { Provenance };
