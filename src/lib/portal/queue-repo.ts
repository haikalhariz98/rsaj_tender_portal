/**
 * The staff side of online applications: the ones waiting, and one in full. Read for an officer only
 * (the public copy has no route to either); the applicant's own words are in these rows until the
 * application is set aside (Phase 4a: recording the supplier from it keeps them; an application recorded before that was erased when it was recorded).
 */

import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import type { SupplierStatus } from "@/lib/suppliers/types";

import { portalFlags, type PortalFlag } from "./queue";

/// How many waiting applications the list carries. More are counted, never silently dropped.
export const PORTAL_QUEUE_SHOWN = 200;

export interface PortalQueueRow {
  id: string;
  reference: string;
  receivedOn: string;
  registeredName: string;
  registrationNo: string;
  flags: PortalFlag[];
  /// ADR 0041: a whole application (every step, decided on its route), or company details only (the step-one form, recorded from).
  whole: boolean;
  /// How many certificates a whole application holds, and whether a route on it is waiting.
  documents: number;
  withApproval: boolean;
}

export async function loadPortalQueue(organisationId: string): Promise<{ total: number; rows: PortalQueueRow[] }> {
  const where = { organisationId, status: "RECEIVED" as const };
  const [total, apps] = await Promise.all([db.portalApplication.count({ where }), db.portalApplication.findMany({ where, orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take: PORTAL_QUEUE_SHOWN, include: { _count: { select: { documents: true } }, routes: { where: { status: "PENDING" }, select: { id: true } } } })]);
  const keys = [...new Set(apps.map((a) => a.registrationNoKey))];
  const [holders, same] = await Promise.all([
    db.supplier.findMany({ where: { organisationId, registrationNoKey: { in: keys } }, select: { registrationNoKey: true, reference: true, registeredName: true, status: true } }),
    db.portalApplication.groupBy({ by: ["registrationNoKey"], where: { ...where, registrationNoKey: { in: keys } }, _count: { _all: true } }),
  ]);
  const holderOf = new Map(holders.map((h) => [h.registrationNoKey, { reference: h.reference, name: h.registeredName, status: h.status as SupplierStatus }]));
  const waiting = new Map(same.map((g) => [g.registrationNoKey, g._count._all]));
  return {
    total,
    rows: apps.map((a) => ({
      id: a.id,
      reference: a.reference,
      receivedOn: storedDay(a.receivedOn),
      registeredName: a.registeredName,
      registrationNo: a.registrationNo,
      flags: portalFlags({ holder: holderOf.get(a.registrationNoKey) ?? null, othersWaiting: Math.max(0, (waiting.get(a.registrationNoKey) ?? 1) - 1) }),
      whole: a.form === "WHOLE",
      documents: a._count.documents,
      withApproval: a.routes.length > 0,
    })),
  };
}

/// One online application, in full, with what the register holds against its number. Null: there is none by that id.
export async function loadPortalApplication(organisationId: string, id: string) {
  const a = await db.portalApplication.findFirst({
    where: { id, organisationId },
    include: {
      decidedBy: { select: { name: true } },
      // Phase 4a: the supplier it became is read in full (with its primary contact), so the page can list every difference between the applicant's words and the register's entry.
      acceptedSupplier: {
        select: {
          id: true,
          reference: true,
          registeredName: true,
          registrationNo: true,
          entityTypeCode: true,
          countryCode: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          postcode: true,
          stateCode: true,
          bumiputeraClaimCode: true,
          incorporatedOn: true,
          companyEmail: true,
          contacts: { where: { isPrimary: true, retiredOn: null }, take: 1, select: { name: true, designation: true, email: true, phone: true } },
        },
      },
    },
  });
  if (!a) return null;
  const erased = a.erasedAt != null;
  const [holder, others] = erased
    ? [null, 0]
    : await Promise.all([
        db.supplier.findFirst({ where: { organisationId, registrationNoKey: a.registrationNoKey }, select: { reference: true, registeredName: true, status: true } }),
        db.portalApplication.count({ where: { organisationId, status: "RECEIVED", registrationNoKey: a.registrationNoKey, NOT: { id: a.id } } }),
      ]);
  return {
    application: a,
    erased,
    flags: a.status === "RECEIVED" ? portalFlags({ holder: holder ? { reference: holder.reference, name: holder.registeredName, status: holder.status as SupplierStatus } : null, othersWaiting: others }) : [],
  };
}
export type LoadedPortalApplication = NonNullable<Awaited<ReturnType<typeof loadPortalApplication>>>;

/**
 * A whole online application in full, for its page (ADR 0041, plan 6.1): the held certificates with their codes, files (name, size, type, scan state, whether moved since) and checks; the
 * bank details' check and statement files, never their values (those are read only through the creditor gate, `loadHeldCreditorValues`); the agreements as made; the routes with their
 * steps; who sent it and who decided it. Null: there is none by that id, or it holds company information only.
 */
export async function loadWholeApplication(organisationId: string, id: string) {
  return db.portalApplication.findFirst({
    where: { id, organisationId, form: "WHOLE" },
    include: {
      decidedBy: { select: { name: true } },
      sentBy: { select: { id: true, name: true } },
      acceptedSupplier: { select: { id: true, reference: true, registeredName: true, contacts: { where: { isPrimary: true, retiredOn: null }, take: 1, select: { id: true } } } },
      documents: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          type: { select: { hintEn: true, expires: true, mandatoryAtRegistration: true } },
          verifiedBy: { select: { name: true } },
          values: { orderBy: { codeSnapshot: "asc" } },
          attachments: { where: { purpose: "PORTAL_APPLICATION_DOCUMENT" }, orderBy: { attachedAt: "asc" }, select: { id: true, detachedAt: true, detachReason: true, version: { select: { id: true, originalFilename: true, byteSize: true, mediaType: true, scanState: true, withdrawnAt: true } } } },
        },
      },
      creditor: { select: { id: true, verification: true, verifiedByPersonId: true, verifiedBy: { select: { name: true } }, verifiedOn: true, verificationNote: true, erasedAt: true, attachments: { where: { purpose: "PORTAL_APPLICATION_BANK_STATEMENT" }, orderBy: { attachedAt: "asc" }, select: { id: true, detachedAt: true, detachReason: true, version: { select: { id: true, originalFilename: true, byteSize: true, mediaType: true, scanState: true, withdrawnAt: true } } } } } },
      declarations: { orderBy: [{ signedAt: "asc" }, { kind: "asc" }], select: { id: true, kind: true, textVersion: true, textSha256: true, noticeSha256: true, frozenTextEn: true, noticeFrozenEn: true, signatoryName: true, signatoryDesignation: true, signedAt: true } },
      routes: { orderBy: { createdAt: "desc" }, include: { steps: { orderBy: { sequence: "asc" }, include: { delegation: { select: { fromPerson: { select: { name: true } } } }, declaredBy: { select: { name: true } } } } } },
    },
  });
}
export type WholeApplication = NonNullable<Awaited<ReturnType<typeof loadWholeApplication>>>;

/// The bank details held on a whole application, by name. SULIT: read only after the creditor gate granted them to this reader (and logged it).
export async function loadHeldCreditorValues(organisationId: string, portalApplicationId: string) {
  return db.portalApplicationCreditor.findFirst({ where: { portalApplicationId, organisationId, erasedAt: null } });
}
