/**
 * The supplier register, read (plan 6.15 §5). Reads only, and the adapters from rows to the facts the
 * pure rules judge (`src/lib/suppliers/*`). A write reads the same through its own locked transaction
 * (`client`).
 */

import type { Prisma } from "@/generated/prisma/client";
import { LIST_EXPORT_MAX_ROWS, listOrderBy, parseListQuery, sortKeys, type ListQuery } from "@/lib/list-query";
import { wordsWhere } from "@/lib/search/words";
import type { Tx } from "@/lib/audit/record";
import { dayToDate, storedDay, dayOrNull as day } from "@/lib/dates";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";

import type { DocumentFacts, DocumentTypeFacts, Provenance, RegistrationValueKind, SupplierListKind, VerificationState } from "./types";
import { SUPPLIER_EXPIRY_EVENT } from "./expiry";
import { REGISTRATION_NO_FORMAT_KEY } from "./types";
import { isAnsweredOnTime, queueState, type QueueState } from "./review";
import { cancellationEnded } from "./standing";
import { deeperDisplaced, documentStates, stateCounts } from "./documents";
import { inOrder } from "@/lib/series";

export const supplierOrg = exerciseOrg;
export type SupplierOrg = NonNullable<Awaited<ReturnType<typeof supplierOrg>>>;

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
  const [bodies, types, lists, policy, format, reasons, expiryRule] = await inOrder(
    () => client.registrationBody.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }], include: { values: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }] } } }),
    () => client.supplierDocumentType.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    () => client.supplierListValue.findMany({ where: { organisationId }, orderBy: [{ list: "asc" }, { sortOrder: "asc" }, { nameEn: "asc" }] }),
    () => client.supplierPolicy.findUnique({ where: { organisationId } }),
    () => client.codeFormat.findFirst({ where: { organisationId, key: REGISTRATION_NO_FORMAT_KEY } }),
    // a2: the maintained list of standing reasons, and the expiry reminder rule (shown, never sent).
    () => client.standingReason.findMany({ where: { organisationId }, orderBy: [{ appliesTo: "asc" }, { sortOrder: "asc" }, { nameEn: "asc" }] }),
    () => client.notificationRule.findFirst({ where: { organisationId, eventKey: SUPPLIER_EXPIRY_EVENT }, select: { id: true, nameEn: true, reminderOffsetDays: true, isActive: true } }));
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
    /// The dial code a country carries, or null where none is set (then no prefix is shown and a number is taken as typed).
    callingCodeOf: (countryCode: string | null): string | null => (countryCode ? (lists.find((l) => l.list === "COUNTRY" && l.code === countryCode)?.callingCode ?? null) : null),
    /// The codes of a list in force on the day. Empty: the list is not set.
    liveCodes: (kind: SupplierListKind, today: string | null) => lists.filter((l) => l.list === kind && live(l, today)).map((l) => l.code),
    live,
  };
}
export type SupplierConfig = Awaited<ReturnType<typeof loadSupplierConfig>>;

const supplierInclude = {
  // Phase 4a: each contact's portal account, if one was opened (its state, not its password), and the accounts' ids for the supplier's own History.
  contacts: {
    orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
    include: { account: { select: { id: true, loginName: true, status: true, failedAttempts: true, lockedUntil: true, lastSignInAt: true } } },
  },
  accounts: { select: { id: true } },
  // Phase 4b: the online application the supplier was accepted from, if any (the header says it is waiting for the applicant to complete the registration).
  portalApplications: { select: { id: true, reference: true } },
  applications: {
    orderBy: [{ receivedOn: "desc" as const }, { createdAt: "desc" as const }],
    include: {
      recordedBy: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      // ADR 0041 D6: the whole online application it was approved from, whose route, agreements and first files stay on it.
      portalApplication: { select: { id: true, reference: true, receivedAt: true } },
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
      attachments: { select: { id: true, purpose: true, detachedAt: true, version: { select: { withdrawnAt: true, scanState: true } } } },
    },
  },
  // a2: standing (recorded acts and requests with their routes), and what is linked to the supplier.
  standingEvents: { orderBy: [{ effectiveOn: "desc" as const }, { recordedAt: "desc" as const }], include: { recordedBy: { select: { id: true, name: true } }, withdrawnBy: { select: { id: true, name: true } } } },
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
  awards: { orderBy: { createdAt: "asc" as const }, select: { id: true, exerciseId: true, reference: true, status: true, awardeeName: true, awardeePartyId: true, cancelConsequence: true } },
} satisfies Prisma.SupplierInclude;

/**
 * One supplier with everything its record shows. Null when it does not exist.
 *
 * `hidden`: the restricted exercises the reader may not see (FR-MTD-007). A supplier's parties and awards on them are left out, so the register does not
 * say that this supplier tendered for, or won, an exercise the reader may not know exists. `hidden` is returned too, for the panels that read exercises
 * of their own.
 */
export async function loadSupplier(organisationId: string, id: string, hidden: readonly string[], client: Tx = db) {
  const org = await supplierOrg(organisationId, client);
  if (!org) return null;
  const found = await client.supplier.findFirst({ where: { id, organisationId: org.id }, include: supplierInclude });
  if (!found) return null;
  const gone = new Set(hidden);
  // Phase 4a: whether a contact's portal account is locked right now, read here where the clock may be read, so that a screen draws it without asking the time.
  const now = Date.now();
  const contacts = found.contacts.map((c) => ({ ...c, account: c.account ? { ...c.account, locked: c.account.lockedUntil != null && c.account.lockedUntil.getTime() > now } : null }));
  const supplier = { ...found, contacts, parties: found.parties.filter((p) => !gone.has(p.exerciseId)), awards: found.awards.filter((a) => !gone.has(a.exerciseId)) };
  return { org, supplier, hidden: [...hidden] };
}
export type LoadedSupplier = NonNullable<Awaited<ReturnType<typeof loadSupplier>>>;

/// How many suppliers the register shows on a page, and how many the queue and the watched lists show at most (fix R-10).
export const SUPPLIERS_PAGE = 100;

/// The register's views (the Register tab) and the open applications' (the Applications tab): the keys of the address.
export const SUPPLIER_VIEWS = ["registered", "applicants", "attention", "barred", "unsynced"] as const;
export type SupplierView = (typeof SUPPLIER_VIEWS)[number];
export const APPLICATION_VIEWS = ["received", "approval", "resubmission", "lapsed"] as const;
export type ApplicationView = (typeof APPLICATION_VIEWS)[number];

/**
 * "Documents to see to" (FR-VND-008), judged over the whole register and never a page: the suppliers with a mandatory type missing, or a document expired, not in order,
 * not yet checked or not yet valid. The states are `documentStates`' own, derived from the documents, never stored. Ids only, so the page can page the judged set.
 */
export async function documentsToSeeToIds(organisationId: string, types: readonly DocumentTypeFacts[], today: string, client: Tx = db): Promise<string[]> {
  const rows = await client.supplier.findMany({ where: { organisationId }, select: { id: true, documents: { select: { id: true, typeId: true, typeLabelSnapshot: true, lodgedOn: true, issuedOn: true, validFrom: true, expiresOn: true, notApplicable: true, verification: true, verifiedOn: true, supersedesId: true } } } });
  return rows
    .filter((r) => {
      const c = stateCounts(documentStates(types, r.documents.map(documentFacts), today));
      return !!(c.MISSING || c.EXPIRED || c.NOT_IN_ORDER || c.NOT_CHECKED || c.NOT_YET_VALID);
    })
    .map((r) => r.id);
}

/// What every list row derives its standing and document states from, and nothing more.
const listedSupplier = {
  id: true,
  reference: true,
  registeredName: true,
  registrationNo: true,
  status: true,
  // M-1: the registration day ends a cancellation it is later than.
  registeredOn: true,
  erpVendorCode: true,
  documents: { select: { id: true, typeId: true, typeLabelSnapshot: true, lodgedOn: true, issuedOn: true, validFrom: true, expiresOn: true, notApplicable: true, verification: true, verifiedOn: true, supersedesId: true } },
  // a2: standing is derived from these, never stored.
  standingEvents: { select: { id: true, kind: true, effectiveOn: true, endsOn: true, offenceNo: true, reasonSnapshot: true, reinstatesEventId: true, liftsEventId: true, flaggedDocumentIds: true, withdrawnAt: true, bodyLabelSnapshot: true, externalReference: true } },
} satisfies Prisma.SupplierSelect;

const OPEN_APPLICATION = { status: { in: ["RECEIVED" as const, "RESUBMISSION_REQUESTED" as const] }, lapsedRecordedAt: null };

/**
 * Where a document is the one in force for its type on `today`, as far as one query can tell (residual 1):
 * verified, not "not applicable", and not renewed by a verified renewal whose validity has started (M-3).
 * A renewal lodged and not verified, or verified and starting later, leaves the old one in force, so its
 * expiry still counts.
 *
 * 615-C7: that one-link test alone is wrong for a chain renewed twice with an unverified link between (A verified,
 * B waiting or found not in order, C verified and started): A's own renewal is B, which does not displace it, yet C
 * does. A query cannot walk a chain, so the documents a deeper link displaces are named by `displacedDocumentIds`
 * (which decides with the pure `documentInForce`, never in SQL) and passed in as `displaced`.
 */
export function inForceDocumentWhere(today: string, displaced: readonly string[] = []): Prisma.SupplierDocumentWhereInput {
  const T = dayToDate(today);
  return {
    verification: "VERIFIED",
    notApplicable: false,
    NOT: { renewedBy: { is: { verification: "VERIFIED", OR: [{ validFrom: null }, { validFrom: { lte: T } }] } } },
    ...(displaced.length ? { id: { notIn: [...displaced] } } : {}),
  };
}

const DISPLACEMENT_FACTS = { id: true, typeId: true, typeLabelSnapshot: true, lodgedOn: true, issuedOn: true, validFrom: true, expiresOn: true, notApplicable: true, verification: true, verifiedOn: true, supersedesId: true } as const;

/**
 * 615-C7: the verified documents that a LATER link of their chain displaces, which the one-link test of `inForceDocumentWhere` cannot see. The candidates are the verified
 * documents whose own renewal exists but does not displace them (it is waiting, not in order, or starts later): rare, because each is a renewal still being checked. Each
 * candidate's later links are read and `documentInForce` decides, so the rule is the register's own, on the whole register (never a page).
 */
export async function displacedDocumentIds(organisationId: string, today: string, client: Tx = db): Promise<string[]> {
  const T = dayToDate(today);
  const candidates = await client.supplierDocument.findMany({
    where: { organisationId, verification: "VERIFIED", notApplicable: false, renewedBy: { is: { NOT: { verification: "VERIFIED", OR: [{ validFrom: null }, { validFrom: { lte: T } }] } } } },
    select: DISPLACEMENT_FACTS,
  });
  if (candidates.length === 0) return [];
  const later: ReturnType<typeof documentFacts>[] = [];
  let frontier = candidates.map((c) => c.id);
  // A chain is short; the bound only keeps a corrupt cycle from looping.
  for (let depth = 0; depth < 100 && frontier.length > 0; depth++) {
    const next = await client.supplierDocument.findMany({ where: { organisationId, supersedesId: { in: frontier } }, select: DISPLACEMENT_FACTS });
    later.push(...next.map(documentFacts));
    frontier = next.map((n) => n.id);
  }
  return deeperDisplaced(candidates.map(documentFacts), later, today);
}

/**
 * The suppliers whose standing on `today` bars them (residual 1: counted in the database from the whole
 * register, never from a page), as `standing` derives it: registered, and a blacklisting in effect (taken
 * effect, not lifted by a lift in effect, before its exclusive end), a suspension in effect (not reinstated
 * by a reinstatement in effect), a registration cancelled, or, where the lapse rule is set to suspend, a
 * mandatory document in force that has expired.
 */
export function barredSupplierWhere(organisationId: string, today: string, autoSuspendOnLapse: boolean | null, cancelledIds: readonly string[], displaced: readonly string[] = []): Prisma.SupplierWhereInput {
  const T = dayToDate(today);
  return {
    organisationId,
    status: "REGISTERED",
    OR: [
      { standingEvents: { some: { kind: "BLACKLIST", effectiveOn: { lte: T }, OR: [{ endsOn: null }, { endsOn: { gt: T } }], NOT: { liftedBy: { is: { effectiveOn: { lte: T } } } } } } },
      { standingEvents: { some: { kind: "SUSPEND", effectiveOn: { lte: T }, NOT: { reinstatedBy: { is: { effectiveOn: { lte: T } } } } } } },
      // 615-C2: a cancellation withdrawn as recorded in error never stood. M-1: nor one ended by a later registration, which a
      // query cannot compare across the two rows, so the suppliers are named by `cancelledSupplierIds`, by standing's own rule.
      { id: { in: [...cancelledIds] } },
      ...(autoSuspendOnLapse === true ? [{ documents: { some: lapsedMandatoryWhere(today, displaced) } }] : []),
    ],
  };
}

/**
 * M-1 (BD-613-108): the registered suppliers with a registration cancelled in effect on `today`, read from the whole register:
 * each live (not withdrawn) cancellation taken effect, kept only where the supplier has not registered again since
 * (`cancellationEnded`, the standing rule's own test, never restated in SQL).
 */
export async function cancelledSupplierIds(organisationId: string, today: string, client: Tx = db): Promise<string[]> {
  const rows = await client.standingEvent.findMany({ where: { organisationId, kind: "REGISTRATION_CANCELLED", withdrawnAt: null, effectiveOn: { lte: dayToDate(today) }, supplier: { status: "REGISTERED" } }, select: { supplierId: true, effectiveOn: true, supplier: { select: { registeredOn: true } } } });
  return [...new Set(rows.filter((r) => !cancellationEnded(r.supplier.registeredOn ? storedDay(r.supplier.registeredOn) : null, storedDay(r.effectiveOn))).map((r) => r.supplierId))].sort();
}

/// A mandatory document in force that has expired (the day after its expiry day).
export const lapsedMandatoryWhere = (today: string, displaced: readonly string[] = []): Prisma.SupplierDocumentWhereInput => ({ ...inForceDocumentWhere(today, displaced), type: { mandatoryAtRegistration: true }, expiresOn: { lt: dayToDate(today) } });

/**
 * The /suppliers lists, each loading only what it shows (fix R-10, the requisitions' page pattern; residual 1):
 *
 * - the register: one page of suppliers by name (`page`, from 0), with their documents, standing events and
 *   open application only, and the total;
 * - the queue: the open applications, oldest first, up to a page, and how many there are;
 * - Expiring: the suppliers with a document in force expiring up to `horizon` (the furthest band; every
 *   expiry where the bands are not set), soonest expiry first, up to a page, and how many — a renewed
 *   document no longer keeps its supplier here;
 * - Standing: the barred suppliers, those with a blacklisting request still open, and (lapse rule not set)
 *   those with a mandatory document in force expired, each up to a page, and how many in all; the barred
 *   count comes from the whole register.
 *
 * With no organisation day (`today` null) nothing is judged: the two derived lists are empty and the barred
 * count is null. Counts that are columns are counted in the database; what is derived (standing, document
 * states, bands) is derived from the rows read, never stored.
 */
export async function listSuppliers(
  organisationId: string,
  register: ListQuery<SupplierView>,
  today: string | null = null,
  horizon: string | null = null,
  autoSuspendOnLapse: boolean | null = null,
  opts: { applications?: ListQuery<ApplicationView>; attentionIds?: readonly string[]; all?: "register" | "applications" } = {},
  client: Tx = db,
) {
  const org = await supplierOrg(organisationId, client);
  if (!org) return null;
  const where = { organisationId: org.id };
  const apps = opts.applications ?? parseListQuery({}, APPLICATION_VIEWS, sortKeys("application"));
  const watchedSelect = { ...listedSupplier, standingRequests: { select: { id: true, kind: true, withdrawnAt: true, event: { select: { id: true } }, routes: { select: { status: true, createdAt: true } } } } } satisfies Prisma.SupplierSelect;
  // 615-C7: the documents a deeper link of a chain displaces, named once and used by every list below.
  const displaced = today ? await displacedDocumentIds(org.id, today, client) : [];
  const expiringDoc: Prisma.SupplierDocumentWhereInput | null = today ? { ...inForceDocumentWhere(today, displaced), organisationId: org.id, expiresOn: horizon ? { not: null, lte: dayToDate(horizon) } : { not: null } } : null;
  const barredWhere = today ? barredSupplierWhere(org.id, today, autoSuspendOnLapse, await cancelledSupplierIds(org.id, today, client), displaced) : null;
  const openRequest: Prisma.SupplierWhereInput = { organisationId: org.id, standingRequests: { some: { event: { is: null }, withdrawnAt: null } } };
  const lapseUnset: Prisma.SupplierWhereInput | null = today && autoSuspendOnLapse !== true ? { organisationId: org.id, status: "REGISTERED", documents: { some: lapsedMandatoryWhere(today, displaced) } } : null;
  const standingWhere: Prisma.SupplierWhereInput | null = barredWhere ? { organisationId: org.id, OR: [barredWhere, openRequest, ...(lapseUnset ? [lapseUnset] : [])] } : null;
  // The register's views, in the database: status and the finance-system code are columns; barred is the standing rule's own where; "documents to see to" is judged by the caller over the whole register.
  const viewWhere: Record<SupplierView, Prisma.SupplierWhereInput> = {
    registered: { status: "REGISTERED" },
    applicants: { status: "APPLICANT" },
    unsynced: { status: "REGISTERED", erpVendorCode: null },
    barred: barredWhere ?? { id: { in: [] } },
    attention: { id: { in: [...(opts.attentionIds ?? [])] } },
  };
  const registerWhere: Prisma.SupplierWhereInput = { AND: [where, wordsWhere("supplier", register.words), register.view ? viewWhere[register.view] : {}] };
  // A page past the end shows the last page.
  const total = await client.supplier.count({ where: registerWhere });
  const at = opts.all === "register" ? 0 : Math.min(Math.max(0, register.page), Math.max(0, Math.ceil(total / register.size) - 1));
  // The open applications' views are judged on the organisation's day (a lapsed deadline reads "lapsed" before the lapse is recorded), over the whole open set, then paged.
  const open = await client.supplierApplication.findMany({ where: { ...where, ...OPEN_APPLICATION }, select: { id: true, status: true, resubmitBy: true, lapsedRecordedAt: true, routes: { select: { status: true } } } });
  const answered = await answeredOnTimeIds(client, org.id, open.map((a) => a.id));
  const applicationCounts: Record<ApplicationView, number> = { received: 0, approval: 0, resubmission: 0, lapsed: 0 };
  const applicationIds: Record<ApplicationView, string[]> = { received: [], approval: [], resubmission: [], lapsed: [] };
  for (const a of open) {
    const st: QueueState = queueState({ ...a, resubmitBy: day(a.resubmitBy), answeredOnTime: answered.has(a.id) }, today);
    const v: ApplicationView = st === "WITH_APPROVAL" ? "approval" : st === "LAPSED" ? "lapsed" : st === "RESUBMISSION_REQUESTED" ? "resubmission" : "received";
    applicationCounts[v]++;
    applicationIds[v].push(a.id);
  }
  const queueWhere: Prisma.SupplierApplicationWhereInput = { AND: [where, OPEN_APPLICATION, wordsWhere("application", apps.words), apps.view ? { id: { in: applicationIds[apps.view] } } : {}] };
  const applicationsTotal = await client.supplierApplication.count({ where: queueWhere });
  const queueAt = opts.all === "applications" ? 0 : Math.min(Math.max(0, apps.page), Math.max(0, Math.ceil(applicationsTotal / apps.size) - 1));
  const [suppliers, registered, unsynced, applicants, queue, queueTotal, soonest, expiringTotal, barred, requested, lapsed, standingTotal, barredCount] = await inOrder(
    () => client.supplier.findMany({
      where: registerWhere,
      orderBy: listOrderBy("supplier", register),
      ...(opts.all === "register" ? { take: LIST_EXPORT_MAX_ROWS + 1 } : { skip: at * register.size, take: register.size }),
      select: { ...listedSupplier, applications: { where: OPEN_APPLICATION, orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }], take: 1, select: { id: true, kind: true, status: true, resubmitBy: true, lapsedRecordedAt: true, routes: { select: { status: true } } } } },
    }),
    () => client.supplier.count({ where: { ...where, status: "REGISTERED" } }),
    () => client.supplier.count({ where: { ...where, status: "REGISTERED", erpVendorCode: null } }),
    () => client.supplier.count({ where: { ...where, status: "APPLICANT" } }),
    () => client.supplierApplication.findMany({
      where: queueWhere,
      orderBy: listOrderBy("application", apps),
      ...(opts.all === "applications" ? { take: LIST_EXPORT_MAX_ROWS + 1 } : { skip: queueAt * apps.size, take: apps.size }),
      select: { id: true, kind: true, status: true, channel: true, receivedOn: true, resubmitBy: true, lapsedRecordedAt: true, routes: { select: { status: true } }, supplier: { select: { id: true, reference: true, registeredName: true } } },
    }),
    () => client.supplierApplication.count({ where: { ...where, ...OPEN_APPLICATION } }),
    // Soonest expiry first: each supplier by its earliest expiring document in force.
    () => expiringDoc ? client.supplierDocument.groupBy({ by: ["supplierId"], where: expiringDoc, _min: { expiresOn: true }, orderBy: [{ _min: { expiresOn: "asc" } }, { supplierId: "asc" }], take: SUPPLIERS_PAGE }) : Promise.resolve([]),
    () => expiringDoc ? client.supplier.count({ where: { organisationId: org.id, documents: { some: expiringDoc } } }) : Promise.resolve(0),
    () => barredWhere ? client.supplier.findMany({ where: barredWhere, orderBy: [{ registeredName: "asc" }, { id: "asc" }], take: SUPPLIERS_PAGE, select: watchedSelect }) : Promise.resolve([]),
    () => barredWhere ? client.supplier.findMany({ where: openRequest, orderBy: [{ registeredName: "asc" }, { id: "asc" }], take: SUPPLIERS_PAGE, select: watchedSelect }) : Promise.resolve([]),
    () => lapseUnset ? client.supplier.findMany({ where: lapseUnset, orderBy: [{ registeredName: "asc" }, { id: "asc" }], take: SUPPLIERS_PAGE, select: watchedSelect }) : Promise.resolve([]),
    () => standingWhere ? client.supplier.count({ where: standingWhere }) : Promise.resolve(0),
    () => barredWhere ? client.supplier.count({ where: barredWhere }) : Promise.resolve(null));
  const expiringRows = soonest.length ? await client.supplier.findMany({ where: { id: { in: soonest.map((g) => g.supplierId) } }, select: watchedSelect }) : [];
  const expiring = soonest.map((g) => expiringRows.find((x) => x.id === g.supplierId)!).filter(Boolean);
  const standing = [...new Map([...barred, ...requested, ...lapsed].map((x) => [x.id, x])).values()].sort((a, b) => a.registeredName.localeCompare(b.registeredName) || a.id.localeCompare(b.id));
  return { org, page: at, suppliers, total, registered, unsynced, applicants, queue, queueTotal, applicationsTotal, applicationsPage: queueAt, applicationCounts, expiring, expiringTotal, standing, standingTotal, barredCount };
}

/**
 * Which of these applications were answered in time (Phase 4c, FR-VND-007 online): each is waiting on a supplier's resubmission, and every item of its latest request has a document the
 * supplier lodged against it on or before the deadline day. Read for the whole set at once; derived from the documents, never stored (`isAnsweredOnTime` is the rule).
 */
export async function answeredOnTimeIds(client: Tx, organisationId: string, applicationIds: readonly string[]): Promise<Set<string>> {
  if (applicationIds.length === 0) return new Set();
  const rows = await client.supplierApplication.findMany({
    where: { id: { in: [...applicationIds] }, organisationId, status: "RESUBMISSION_REQUESTED", resubmitBy: { not: null } },
    select: { id: true, resubmitBy: true, decisions: { where: { outcome: "RESUBMIT" }, orderBy: { decidedAt: "desc" }, take: 1, select: { items: { select: { id: true, answers: { select: { lodgedOn: true } } } } } } },
  });
  return new Set(
    rows
      .filter((r) => {
        const items = r.decisions[0]?.items ?? [];
        return isAnsweredOnTime(
          items,
          items.flatMap((i) => i.answers.map((a) => ({ answersItemId: i.id, lodgedOn: storedDay(a.lodgedOn) }))),
          r.resubmitBy ? storedDay(r.resubmitBy) : null,
        );
      })
      .map((r) => r.id),
  );
}

/// The supplier's History: every audit row on the supplier, its contacts, applications (and their routes and steps), decisions and documents.
export const HISTORY_PAGE = 200;
export async function supplierHistory(l: LoadedSupplier) {
  const s = l.supplier;
  const ids = [
    s.id,
    ...s.contacts.map((c) => c.id),
    ...s.accounts.map((a) => a.id),
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
