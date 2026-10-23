/**
 * The cores of two staff acts on applications, moved out of the "use server" file so they run the same
 * way from the screen and from a one-off data act: setting an online application aside, and an officer's
 * outcome on an open application (resubmission requested, or rejected). The actions in
 * `src/app/suppliers/actions.ts` read the form, call these inside their transaction, and revalidate.
 * Each takes the server's clock from its caller, read once at the act's entry.
 */

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import type { ActWriter } from "@/lib/auth/act-writer";
import type { Tx } from "@/lib/audit/record";
import { dayToDate, dayOrNull as day } from "@/lib/dates";

import { SUPPLIER_ENTITY } from "./audit-view";
import { OUTCOME_LABEL, supplierFaultText } from "./labels";
import { supplierApplicationLabel } from "./lock";
import { answeredOnTimeIds } from "./repo";
import { decisionFaults } from "./review";
import { blocking } from "./types";
import { activePerson, audit, CHANGED, GONE, label, Refusal, type LockedSupplier } from "./write";
import type { AuditActor } from "@/lib/auth/types";
import { inOrder } from "@/lib/series";
import { CREDITOR_FIELDS } from "@/lib/portal/registration/types";

/**
 * What an online application holds of the applicant's own words, blanked when it is SET ASIDE. Phase 4a (CPD's registration, ruling of 2026-10-07, "acceptance must stop
 * erasing the applicant's words"): recording the supplier from it no longer erases it. The officer corrects what the applicant typed, and the online page shows the
 * applicant's words beside the register's entry with every difference listed; erased only when nobody will act on it. The parts of the address, the claim and the day
 * incorporated are the applicant's words too, and go with the rest.
 */
export const ERASED = {
  registeredName: "",
  registrationNo: "",
  registrationNoKey: "",
  entityTypeCode: "",
  countryCode: "",
  registeredAddress: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
  stateCode: "",
  bumiputeraClaimCode: "",
  incorporatedOn: null,
  companyEmail: "",
  contactName: "",
  contactDesignation: "",
  contactEmail: "",
  contactPhone: "",
} as const;

/// An application as the decision acts read it under the lock: its supplier's reference, its routes and its attachments.
export const appInclude = { supplier: { select: { reference: true } }, routes: { include: { steps: { orderBy: { sequence: "asc" as const } } } }, attachments: { select: { purpose: true, detachedAt: true, version: { select: { withdrawnAt: true } } } } };

/**
 * Set an online application aside, with a reason. Its personal details are erased at the same time (the
 * applicant's own words are not kept once nobody will act on them); what remains is the reference, the
 * days, who set it aside and why. The audit row carries the reason and none of the applicant's details,
 * so nothing in the append-only trail needs erasing later. The reason is the officer's own words, so it
 * must not repeat the applicant's details.
 */
export async function setAsideOnlineApplication(tx: Tx, actor: AuditActor, organisationId: string, i: { id: string; reason: string; personId: string | null; now: Date; /// How the officer set it aside, attributed in this transaction (Phase 2b). A loader that calls the core directly has none.
  act?: ActWriter }): Promise<FormState> {
  await tx.$queryRaw`SELECT id FROM "PortalApplication" WHERE id = ${i.id} AND "organisationId" = ${organisationId} FOR UPDATE`;
  const pa = await tx.portalApplication.findFirst({ where: { id: i.id, organisationId }, include: { routes: { select: { status: true } } } });
  if (!pa) return { ok: false, message: "That online application no longer exists." };
  if (pa.status !== "RECEIVED") return { ok: false, message: "That online application is not waiting any more: it was recorded or set aside already. Nothing was changed." };
  // ADR 0041: a whole application on its route is decided there first (the status stays RECEIVED while it waits).
  if (pa.routes.some((r) => r.status === "PENDING")) return { ok: false, message: "Nothing was changed: A route is waiting. Decide it first." };
  const person = await activePerson(tx, organisationId, i.personId);
  if (!person) return { ok: false, errors: { recordedByPersonId: supplierFaultText({ code: "RECORDER_REQUIRED", level: "block" }) } };
  await tx.portalApplication.update({ where: { id: pa.id }, data: { status: "DISCARDED", decidedAt: i.now, decidedByPersonId: person.id, discardReason: i.reason, erasedAt: i.now, ...ERASED } });
  // A whole application's bank details are erased with the words (every field at once, as trigger PA037 allows); its files (ADR 0011) and its agreements (append-only) are kept.
  const whole = pa.form === "WHOLE";
  if (whole) await tx.portalApplicationCreditor.updateMany({ where: { portalApplicationId: pa.id, erasedAt: null }, data: { ...Object.fromEntries(CREDITOR_FIELDS.map((k) => [k, ""])), erasedAt: i.now } });
  await audit(tx, actor, organisationId, SUPPLIER_ENTITY.onlineApplication, pa.id, label({ reference: pa.reference }, "Online application"), "UPDATE",
    diffFields({ status: "Received", personalDetails: "Held on the application", ...(whole ? { bankDetails: "Held on the application" } : {}) }, { status: "Set aside", decidedBy: person.name, personalDetails: "Erased", ...(whole ? { bankDetails: "Erased", filesAndAgreements: "Files and agreements kept" } : {}) }), i.reason);
  await i.act?.write(tx, pa.id);
  return { ok: true };
}

export interface OutcomeInput {
  applicationId: string;
  outcome: "RESUBMIT" | "REJECT";
  remarks: string;
  resubmitBy: string | null;
  personId: string | null;
  /// How the officer decided it, attributed in this transaction (Phase 2b). A loader that calls the core directly has none.
  act?: ActWriter;
  /// Each item as written: a lodged document (`documentId`) or a document type not lodged (`typeId`).
  items: { documentId: string | null; typeId: string | null; remarks: string }[];
  now: Date;
}

/**
 * An officer's outcome on an open application (FR-VND-007), on the supplier row locked by the caller:
 * resubmission requested (each item as written, with a deadline) or rejected (with the reasons as written).
 * Throws a Refusal (rolling everything back) if the application moved under the lock.
 */
export async function recordOutcome(tx: Tx, actor: AuditActor, l: LockedSupplier, input: OutcomeInput): Promise<FormState> {
  const { applicationId, outcome, remarks, resubmitBy, personId, items, now, act } = input;
  const supplierId = l.supplier.id;
  await tx.$queryRaw`SELECT id FROM "SupplierApplication" WHERE id = ${applicationId} FOR UPDATE`;
  const a = await tx.supplierApplication.findFirst({ where: { id: applicationId, supplierId }, include: appInclude });
  if (!a) return GONE;
  const person = await activePerson(tx, l.org.id, personId);
  const [docs, types] = await inOrder(() => tx.supplierDocument.findMany({ where: { supplierId }, select: { id: true, typeLabelSnapshot: true, reference: true } }), () => tx.supplierDocumentType.findMany({ where: { organisationId: l.org.id }, select: { id: true, nameEn: true } }));
  const fs = decisionFaults(
    { outcome: outcome === "RESUBMIT" ? "RESUBMIT" : "REJECT", remarks, resubmitBy, items: outcome === "RESUBMIT" ? items : [], personActive: !!person },
    { status: a.status, lapsedRecordedAt: a.lapsedRecordedAt, resubmitBy: day(a.resubmitBy), routePending: a.routes.some((x) => x.status === "PENDING"), answeredOnTime: (await answeredOnTimeIds(tx, l.org.id, [a.id])).has(a.id) },
    { today: l.org.today, documentIds: docs.map((d) => d.id), typeIds: types.map((t) => t.id) },
  );
  if (blocking(fs).length) {
    const errors: Record<string, string> = {};
    const rest: string[] = [];
    for (const f of blocking(fs)) {
      const field = f.code === "PERSON_REQUIRED" ? "personId" : f.code === "DEADLINE_REQUIRED" || f.code === "DEADLINE_NOT_AFTER_TODAY" ? "resubmitBy" : f.code === "REMARKS_REQUIRED" ? "remarks" : null;
      if (field) errors[field] = supplierFaultText(f);
      else rest.push(supplierFaultText(f));
    }
    return { ok: false, errors, ...(rest.length ? { message: `Nothing was saved: ${[...new Set(rest)].join(" ")}` } : {}) };
  }
  const today = l.org.today!;
  const dec = await tx.applicationDecision.create({
    data: {
      organisationId: l.org.id,
      applicationId: a.id,
      outcome: outcome === "RESUBMIT" ? "RESUBMIT" : "REJECT",
      remarks,
      resubmitBy: outcome === "RESUBMIT" ? dayToDate(resubmitBy!) : null,
      decidedByPersonId: person!.id,
      decidedOn: dayToDate(today),
      decidedAt: now,
      items: {
        create: (outcome === "RESUBMIT" ? items : []).map((it) => {
          const d = it.documentId ? docs.find((x) => x.id === it.documentId)! : null;
          return { organisationId: l.org.id, supplierDocumentId: d?.id ?? null, documentTypeId: d ? null : it.typeId, labelSnapshot: d ? `${d.typeLabelSnapshot}${d.reference ? ` ${d.reference}` : ""}` : (types.find((t) => t.id === it.typeId)?.nameEn ?? "A document type"), remarks: it.remarks };
        }),
      },
    },
    include: { items: true },
  });
  await act?.write(tx, dec.id);
  const status = outcome === "RESUBMIT" ? "RESUBMISSION_REQUESTED" : "REJECTED";
  const moved = await tx.supplierApplication.updateMany({ where: { id: a.id, status: a.status, lapsedRecordedAt: null }, data: { status, resubmitBy: outcome === "RESUBMIT" ? dayToDate(resubmitBy!) : a.resubmitBy, ...(outcome === "REJECT" ? { decidedAt: now } : {}) } });
  if (moved.count !== 1) throw new Refusal(CHANGED);
  await audit(tx, actor, l.org.id, SUPPLIER_ENTITY.decision, dec.id, supplierApplicationLabel(a), "CREATE",
    diffFields(null, { outcome: OUTCOME_LABEL[dec.outcome].en, remarks: remarks || null, resubmitBy: outcome === "RESUBMIT" ? resubmitBy : null, items: dec.items.length ? dec.items.map((i) => `${i.labelSnapshot}: ${i.remarks}`).join(" | ") : null, decidedBy: person!.name, decidedOn: today, recordedOnBehalf: "not signed" }), remarks);
  await audit(tx, actor, l.org.id, SUPPLIER_ENTITY.application, a.id, supplierApplicationLabel(a), "UPDATE", diffFields({ status: a.status, resubmitBy: day(a.resubmitBy) }, { status, resubmitBy: outcome === "RESUBMIT" ? resubmitBy : day(a.resubmitBy) }));
  if (outcome === "REJECT") await rejectApplicant(tx, actor, l, a.kind);
  return { ok: true, message: `${OUTCOME_LABEL[dec.outcome].en}. The notice to the supplier is shown here, not sent.` };
}

/// A first registration rejected (or lapsed) leaves an applicant not registered.
export async function rejectApplicant(tx: Tx, actor: AuditActor, l: LockedSupplier, kind: string) {
  if (kind !== "NEW" || l.supplier.status !== "APPLICANT") return;
  await tx.supplier.update({ where: { id: l.supplier.id }, data: { status: "REJECTED" } });
  await audit(tx, actor, l.org.id, SUPPLIER_ENTITY.supplier, l.supplier.id, label(l.supplier, l.supplier.registeredName), "UPDATE", diffFields({ status: "Applicant" }, { status: "Not registered: application rejected" }));
}
