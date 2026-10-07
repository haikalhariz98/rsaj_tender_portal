"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { closeRejected } from "@/lib/approvals/rejection-store";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { routeCoreFields, stepOrigin } from "@/lib/authority/core-routing";
import { personDecisionWrite } from "@/lib/authority/decided-step";
import { actingOffice } from "@/lib/authority/escalation";
import { loadIssue } from "@/lib/authority/load";
import { boundaryOperatorFor } from "@/lib/authority/resolve";
import { dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { isLive } from "@/lib/documents/evidence";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { manualVendorMaster, normaliseVendorCode, VENDOR_CODE_FORMAT_KEY } from "@/lib/integration/vendor-master";
import { ACT_LABEL } from "@/lib/labels";
import { NumberingError, issueReference } from "@/lib/numbering/issue";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { ableToAct, deciderFaults } from "@/lib/requisition/holders";
import { appInclude, ERASED, recordOutcome, rejectApplicant, setAsideOnlineApplication } from "@/lib/suppliers/application-acts";
import { SUPPLIER_ENTITY } from "@/lib/suppliers/audit-view";
import { lodgeFaults, verifyFaults } from "@/lib/suppliers/documents";
import { applicationFaults, contactFaults, normaliseRegistrationNo, receiptFaults } from "@/lib/suppliers/identity";
import type { DocumentState } from "@/lib/suppliers/documents";
import { APPLICATION_KIND_LABEL, approvedWords, CHANNEL_LABEL, DOCUMENT_STATE_LABEL, OUTCOME_LABEL, REGISTRATION_MATTER, REGISTRATION_REFUSED_DECIDED_BY, SUPPLIER_DECIDER_TEXT, SUPPLIER_STATUS_LABEL, supplierFaultText, VERIFICATION_LABEL } from "@/lib/suppliers/labels";
import { supplierApplicationLabel, supplierDocumentLabel, supplierOfApplication, supplierOfDocument } from "@/lib/suppliers/lock";
import { documentFacts, loadSupplierConfig, supplierOrg, typeFacts } from "@/lib/suppliers/repo";
import { approveFaults, decisionSnapshot, fileFacts, isOpen, lapseFaults, openApplicationFaults, submitFaults, type FileFacts } from "@/lib/suppliers/review";
import { supplierHolders, supplierRoute } from "@/lib/suppliers/route";
import { standingOf } from "@/lib/suppliers/standing-repo";
import { PAPER_CHANNELS, APPLICATION_KINDS, blocking, SUPPLIER_REGISTRATION_DOMAIN, SUPPLIER_SERIES_KEY, VERIFICATION_STATES, type ApplicationKind, type Finding, type RegistrationValueKind, type SupplierStatus } from "@/lib/suppliers/types";
import { splitValues } from "@/lib/ui/select-logic";
import { FormReader } from "@/lib/validate";

import { activePerson, audit, CHANGED, GONE, inSupplier, label, lockOrganisation, NO_ORG, refuse, Refusal, stampNow, type LockedSupplier } from "./shared";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";

/**
 * The staff-side supplier register's acts (plan 6.15 §4.1, increment a1; ADR 0019). An officer records a
 * supplier from its paper application, lodges and checks its documents, and the application is decided:
 * approved on an engine route (OD-2 A: domain `supplier_registration`, the application's kind as the
 * condition, no value), or resubmission requested, or rejected; a lapsed deadline is recorded as the
 * rejection it means. Every write locks the supplier row first and re-runs the lib's rule on what it
 * reads under the lock; every write is audited in the same transaction; every person named is recorded
 * on their behalf, not signed. Nothing is sent: notices are shown, not sent (INT-09).
 */

const NOT_SET = "Not set";
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const NO_ISSUE: FormState = { ok: false, message: "No approval matrix is in force, so nobody can be shown as approving a supplier's registration. Issue one under Configuration › Approval matrix." };

/// The field each identity or receipt fault belongs to, so the form marks it.
const FIELD_OF: Record<string, string> = {
  NAME_REQUIRED: "registeredName",
  REGISTRATION_NO_REQUIRED: "registrationNo",
  FORMAT_MISMATCH: "registrationNo",
  DUPLICATE: "registrationNo",
  ENTITY_TYPE_REQUIRED: "entityTypeCode",
  ENTITY_TYPE_NOT_LISTED: "entityTypeCode",
  COUNTRY_REQUIRED: "countryCode",
  COUNTRY_NOT_LISTED: "countryCode",
  ADDRESS_REQUIRED: "registeredAddress",
  EMAIL_REQUIRED: "companyEmail",
  EMAIL_NOT_VALID: "companyEmail",
  CONTACT_NAME_REQUIRED: "contactName",
  CONTACT_REACH_REQUIRED: "contactEmail",
  CONTACT_EMAIL_NOT_VALID: "contactEmail",
  RECEIVED_ON_REQUIRED: "receivedOn",
  RECEIVED_IN_FUTURE: "receivedOn",
  CHANNEL_REQUIRED: "channel",
  DECLARATION_IN_FUTURE: "declarationSignedOn",
  DECLARATION_AFTER_RECEIPT: "declarationSignedOn",
  RECORDER_REQUIRED: "recordedByPersonId",
  PERSON_REQUIRED: "personId",
};

/// Blocks as field errors where a field is named, the rest as the message.
function refusal(fs: readonly Finding[]): FormState {
  const blocks = blocking(fs);
  const errors: Record<string, string> = {};
  const rest: string[] = [];
  for (const f of blocks) {
    const field = FIELD_OF[f.code];
    if (field && !errors[field]) errors[field] = supplierFaultText(f);
    else if (!field) rest.push(supplierFaultText(f));
  }
  return { ok: false, errors, ...(rest.length ? { message: `Nothing was saved: ${[...new Set(rest)].join(" ")}` } : {}) };
}

const listWords = (cfg: Awaited<ReturnType<typeof loadSupplierConfig>>, kind: "ENTITY_TYPE" | "COUNTRY", code: string | null) => (code ? (cfg.listName(kind, code) ?? "A value no longer listed") : NOT_SET);


// ------------------------------------------------------------------ recording (FR-VND-001, 006)

function readContact(r: FormReader) {
  return {
    name: r.text("contactName", "Contact's name", { max: 240 }),
    designation: r.text("contactDesignation", "Designation", { max: 240 }),
    email: r.text("contactEmail", "Contact's email", { max: 240 }),
    phone: r.text("contactPhone", "Contact's telephone", { max: 60 }),
  };
}

/**
 * Record a new supplier from its paper application (FR-VND-001): the supplier as an applicant, its
 * primary contact (a SupplierContact, never a Person: ADR 0019), and the application received. The
 * reference is issued from the `supplier` series; unset, nothing is recorded and the setting is named.
 */
export async function recordApplication(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const r = new FormReader(data);
  // Recorded from an online application: the portal fixes the channel and the day it came in, and the
  // paper's days are not asked (the declaration is recorded on the application once it is signed).
  const portalApplicationId = String(data.get("portalApplicationId") ?? "").trim() || null;
  const v = {
    registeredName: r.text("registeredName", "Registered name", { max: 240 }),
    registrationNo: r.text("registrationNo", "Registration number", { max: 120 }),
    entityTypeCode: r.optionalText("entityTypeCode"),
    countryCode: r.optionalText("countryCode"),
    registeredAddress: r.text("registeredAddress", "Registered address", { max: 1000 }),
    companyEmail: r.text("companyEmail", "Company email", { max: 240 }),
    receivedOn: portalApplicationId ? null : r.optionalText("receivedOn"),
    channel: portalApplicationId ? null : r.choice("channel", "How it came in", PAPER_CHANNELS),
    declarationSignedOn: portalApplicationId ? null : r.optionalText("declarationSignedOn"),
    epaymentFormReceivedOn: portalApplicationId ? null : r.optionalText("epaymentFormReceivedOn"),
    recordedByPersonId: r.optionalText("recordedByPersonId"),
  };
  const contact = readContact(r);
  if (r.failed) return { ok: false, errors: r.errors };
  let created: string | null = null;
  const result = await db.$transaction(
    async (tx): Promise<FormState> => {
      const org = await supplierOrg(actor.organisationId, tx);
      if (!org) return NO_ORG;
      await lockOrganisation(tx, org.id);
      let portal: Awaited<ReturnType<typeof tx.portalApplication.findFirst>> = null;
      if (portalApplicationId) {
        await tx.$queryRaw`SELECT id FROM "PortalApplication" WHERE id = ${portalApplicationId} AND "organisationId" = ${org.id} FOR UPDATE`;
        portal = await tx.portalApplication.findFirst({ where: { id: portalApplicationId, organisationId: org.id } });
        if (!portal || portal.status !== "RECEIVED") return { ok: false, message: "That online application is not waiting any more: it was recorded or set aside already. Nothing was saved." };
        v.receivedOn = storedDay(portal.receivedOn);
        v.channel = "PORTAL";
      }
      const cfg = await loadSupplierConfig(org.id, tx);
      const key = normaliseRegistrationNo(v.registrationNo);
      const dup = key ? await tx.supplier.findFirst({ where: { organisationId: org.id, registrationNoKey: key }, select: { reference: true, registeredName: true } }) : null;
      const person = await activePerson(tx, org.id, v.recordedByPersonId);
      const fs: Finding[] = applicationFaults(
        { ...v, contact, recorderActive: !!person },
        { today: org.today, formatPattern: cfg.format?.pattern ?? null, entityTypeCodes: cfg.liveCodes("ENTITY_TYPE", org.today), countryCodes: cfg.liveCodes("COUNTRY", org.today), duplicate: dup ? { reference: dup.reference, name: dup.registeredName } : null },
      );
      if (v.epaymentFormReceivedOn && org.today && v.epaymentFormReceivedOn > org.today) fs.push({ code: "IN_FUTURE", level: "block" });
      if (blocking(fs).length) return refusal(fs);
      const today = org.today!;
      let reference: string;
      try {
        reference = await issueReference(tx, org.id, SUPPLIER_SERIES_KEY, dayToDate(today));
      } catch (e) {
        if (e instanceof NumberingError) return { ok: false, message: e.fault === "SERIES_MISSING" ? "No numbering series for suppliers is set, so no reference can be issued and nothing was recorded. Add the series for suppliers under Configuration › Numbering." : "The numbering series for suppliers is not valid, so no reference can be issued. Correct it under Configuration › Numbering." };
        throw e;
      }
      const supplier = await tx.supplier.create({
        data: {
          organisationId: org.id,
          reference,
          registeredName: v.registeredName,
          registrationNo: v.registrationNo.trim(),
          registrationNoKey: key,
          entityTypeCode: v.entityTypeCode!,
          countryCode: v.countryCode!,
          registeredAddress: v.registeredAddress,
          companyEmail: v.companyEmail,
        },
      });
      const c = await tx.supplierContact.create({ data: { organisationId: org.id, supplierId: supplier.id, name: contact.name, designation: contact.designation, email: contact.email, phone: contact.phone, isPrimary: true } });
      const app = await tx.supplierApplication.create({
        data: {
          organisationId: org.id,
          supplierId: supplier.id,
          kind: "NEW",
          receivedOn: dayToDate(v.receivedOn!),
          channel: v.channel!,
          recordedByPersonId: person!.id,
          recordedAt: now,
          declarationSignedOn: v.declarationSignedOn ? dayToDate(v.declarationSignedOn) : null,
          epaymentFormReceivedOn: v.epaymentFormReceivedOn ? dayToDate(v.epaymentFormReceivedOn) : null,
        },
        include: { supplier: { select: { reference: true } } },
      });
      await audit(tx, toAuditActor(actor), org.id, SUPPLIER_ENTITY.supplier, supplier.id, label(supplier, supplier.registeredName), "CREATE",
        diffFields(null, { reference, registeredName: supplier.registeredName, registrationNo: supplier.registrationNo, formatChecked: fs.some((f) => f.code === "FORMAT_NOT_CHECKED") ? "Not checked: no format is set" : "Matches the configured format", entityType: listWords(cfg, "ENTITY_TYPE", supplier.entityTypeCode), country: listWords(cfg, "COUNTRY", supplier.countryCode), registeredAddress: supplier.registeredAddress, companyEmail: supplier.companyEmail, status: "Applicant" }));
      await audit(tx, toAuditActor(actor), org.id, SUPPLIER_ENTITY.contact, c.id, label(supplier, "Primary contact"), "CREATE", diffFields(null, { contactName: c.name, contactDesignation: c.designation || null, contactEmail: c.email || null, contactPhone: c.phone || null, primary: true }));
      await audit(tx, toAuditActor(actor), org.id, SUPPLIER_ENTITY.application, app.id, supplierApplicationLabel(app), "CREATE",
        diffFields(null, { kind: APPLICATION_KIND_LABEL.NEW.en, receivedOn: v.receivedOn, channel: CHANNEL_LABEL[v.channel!].en, recordedBy: person!.name, recordedOnBehalf: "not signed", declarationSignedOn: v.declarationSignedOn, epaymentFormReceivedOn: v.epaymentFormReceivedOn, ...(portal ? { onlineApplication: portal.reference } : {}) }));
      if (portal) {
        // The supplier record now holds what the officer checked, so the applicant's own words are erased: nothing is kept twice.
        await tx.portalApplication.update({ where: { id: portal.id, organisationId: actor.organisationId }, data: { status: "RECORDED", acceptedSupplierId: supplier.id, decidedAt: now, decidedByPersonId: person!.id, erasedAt: now, ...ERASED } });
        await audit(tx, toAuditActor(actor), org.id, SUPPLIER_ENTITY.onlineApplication, portal.id, label({ reference: portal.reference }, "Online application"), "UPDATE",
          diffFields({ status: "Received", personalDetails: "Held on the application" }, { status: "Recorded as a supplier", supplier: supplier.reference, decidedBy: person!.name, personalDetails: "Erased: the supplier record holds them" }));
      }
      created = supplier.id;
      return { ok: true };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  if (!result.ok || !created) return result;
  revalidatePath("/suppliers");
  redirect(`/suppliers/${created}?tab=documents`);
}

/// Set an online application aside, with a reason (the core, with what it erases and audits, is `setAsideOnlineApplication`).
export async function discardPortalApplication(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const id = String(data.get("portalApplicationId") ?? "").trim();
  const r = new FormReader(data);
  const reason = r.text("reason", "Why it is set aside", { required: true, max: 2000 });
  const personId = r.optionalText("recordedByPersonId");
  if (r.failed) return { ok: false, errors: r.errors };
  const result = await db.$transaction(
    async (tx): Promise<FormState> => {
      const org = await supplierOrg(actor.organisationId, tx);
      if (!org) return NO_ORG;
      return setAsideOnlineApplication(tx, toAuditActor(actor), org.id, { id, reason, personId, now });
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  if (!result.ok) return result;
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/online/${id}`);
  return { ok: true, href: "/suppliers?tab=portal" };
}

/// Open a further application for a supplier on the register: a first registration again after a rejection, or a renewal or upgrade.
export async function openApplication(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const supplierId = String(data.get("supplierId") ?? "");
  const r = new FormReader(data);
  const kind = r.choice("kind", "What it is for", APPLICATION_KINDS);
  const receivedOn = r.optionalText("receivedOn");
  const channel = r.choice("channel", "How it came in", PAPER_CHANNELS);
  const declarationSignedOn = r.optionalText("declarationSignedOn");
  const epaymentFormReceivedOn = r.optionalText("epaymentFormReceivedOn");
  const personId = r.optionalText("recordedByPersonId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inSupplier(actor, supplierId, async (tx, l) => {
    const open = await tx.supplierApplication.findFirst({ where: { supplierId, status: { in: ["RECEIVED", "RESUBMISSION_REQUESTED"] }, lapsedRecordedAt: null }, select: { id: true } });
    const person = await activePerson(tx, l.org.id, personId);
    // FR-TRM-017 (fix S-2): the blacklisting in effect, read on the locked supplier row. M-1: and the cancellation in
    // effect, which allows a new registration (the way back) and refuses a renewal or an upgrade.
    const st = l.org.today ? await standingOf(supplierId, l.org.id, l.org.today, tx) : null;
    const blacklist = st?.reading.blacklist ?? null;
    const cancellation = st?.reading.cancellation ?? null;
    const fs: Finding[] = [...openApplicationFaults(kind, l.supplier.status as "APPLICANT" | "REGISTERED" | "REJECTED", !!open, blacklist, cancellation), ...receiptFaults({ receivedOn, channel, declarationSignedOn, recorderActive: !!person }, l.org.today)];
    if (epaymentFormReceivedOn && l.org.today && epaymentFormReceivedOn > l.org.today) fs.push({ code: "IN_FUTURE", level: "block" });
    if (blocking(fs).length) return refusal(fs);
    const app = await tx.supplierApplication.create({
      data: { organisationId: l.org.id, supplierId, kind: kind!, receivedOn: dayToDate(receivedOn!), channel: channel!, recordedByPersonId: person!.id, recordedAt: now, declarationSignedOn: declarationSignedOn ? dayToDate(declarationSignedOn) : null, epaymentFormReceivedOn: epaymentFormReceivedOn ? dayToDate(epaymentFormReceivedOn) : null },
      include: { supplier: { select: { reference: true } } },
    });
    // A supplier rejected before applies again as an applicant.
    if (kind === "NEW" && l.supplier.status === "REJECTED") {
      await tx.supplier.update({ where: { id: supplierId, organisationId: actor.organisationId }, data: { status: "APPLICANT" } });
      await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.supplier, supplierId, label(l.supplier, l.supplier.registeredName), "UPDATE", diffFields({ status: "Not registered: application rejected" }, { status: "Applicant" }));
    }
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.application, app.id, supplierApplicationLabel(app), "CREATE",
      diffFields(null, { kind: APPLICATION_KIND_LABEL[kind!].en, receivedOn, channel: CHANNEL_LABEL[channel!].en, recordedBy: person!.name, recordedOnBehalf: "not signed", declarationSignedOn, epaymentFormReceivedOn }));
    return { ok: true, message: "Recorded. Lodge its documents on the Documents tab." };
  });
}

/// Record the paper's days on an open application: when its declaration was signed, when the E-Payment form was received (OD-3 B: no bank field).
export async function recordApplicationPaper(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const applicationId = String(data.get("applicationId") ?? "");
  const r = new FormReader(data);
  const declarationSignedOn = r.optionalText("declarationSignedOn");
  const epaymentFormReceivedOn = r.optionalText("epaymentFormReceivedOn");
  if (r.failed) return { ok: false, errors: r.errors };
  const supplierId = await supplierOfApplication(applicationId);
  if (!supplierId) return GONE;
  return inSupplier(actor, supplierId, async (tx, l) => {
    await tx.$queryRaw`SELECT id FROM "SupplierApplication" WHERE id = ${applicationId} FOR UPDATE`;
    const a = await tx.supplierApplication.findFirst({ where: { id: applicationId, supplierId, organisationId: actor.organisationId }, include: { supplier: { select: { reference: true } }, routes: { select: { status: true } } } });
    if (!a) return GONE;
    if (!l.org.today) return { ok: false, message: supplierFaultText({ code: "TIME_ZONE_UNSET", level: "block" }) };
    if (!isOpen(a)) return refuse([{ code: "DECIDED", level: "block" }]);
    if (a.routes.some((x) => x.status === "PENDING")) return refuse([{ code: "ROUTE_PENDING", level: "block" }]);
    const errors: Record<string, string> = {};
    for (const [k, v] of [["declarationSignedOn", declarationSignedOn], ["epaymentFormReceivedOn", epaymentFormReceivedOn]] as const) if (v && v > l.org.today) errors[k] = supplierFaultText({ code: "IN_FUTURE", level: "block" });
    if (Object.keys(errors).length) return { ok: false, errors };
    const after = await tx.supplierApplication.update({ where: { id: applicationId, organisationId: actor.organisationId }, data: { declarationSignedOn: declarationSignedOn ? dayToDate(declarationSignedOn) : null, epaymentFormReceivedOn: epaymentFormReceivedOn ? dayToDate(epaymentFormReceivedOn) : null } });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.application, a.id, supplierApplicationLabel(a), "UPDATE", diffFields({ declarationSignedOn: day(a.declarationSignedOn), epaymentFormReceivedOn: day(a.epaymentFormReceivedOn) }, { declarationSignedOn: day(after.declarationSignedOn), epaymentFormReceivedOn: day(after.epaymentFormReceivedOn) }));
    return { ok: true };
  });
}

/// Add or change a contact (not a Person: ADR 0019). Marking one primary unmarks the other.
export async function saveContact(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const supplierId = String(data.get("supplierId") ?? "");
  const contactId = String(data.get("contactId") ?? "").trim() || null;
  const r = new FormReader(data);
  const c = readContact(r);
  const primary = r.bool("primary");
  if (r.failed) return { ok: false, errors: r.errors };
  return inSupplier(actor, supplierId, async (tx, l) => {
    const fs = contactFaults(c);
    if (blocking(fs).length) return refusal(fs);
    const before = contactId ? await tx.supplierContact.findFirst({ where: { id: contactId, supplierId, retiredOn: null, organisationId: actor.organisationId } }) : null;
    if (contactId && !before) return GONE;
    const words = (x: { name: string; designation: string; email: string; phone: string; isPrimary: boolean } | null) => (x ? { contactName: x.name, contactDesignation: x.designation || null, contactEmail: x.email || null, contactPhone: x.phone || null, primary: x.isPrimary } : null);
    const hasPrimary = await tx.supplierContact.findFirst({ where: { supplierId, isPrimary: true, retiredOn: null, ...(contactId ? { NOT: { id: contactId } } : {}) }, select: { id: true, name: true } });
    // The primary contact stays someone: unmarking the only primary is refused.
    if (before?.isPrimary && !primary && !hasPrimary) return { ok: false, errors: { primary: "Mark another contact primary first: the supplier keeps a primary contact." } };
    if (primary && hasPrimary) {
      await tx.supplierContact.update({ where: { id: hasPrimary.id, organisationId: actor.organisationId }, data: { isPrimary: false } });
      await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.contact, hasPrimary.id, label(l.supplier, "Contact"), "UPDATE", diffFields({ primary: true }, { primary: false }));
    }
    const row = { name: c.name, designation: c.designation, email: c.email, phone: c.phone, isPrimary: primary || (!hasPrimary && !before) };
    if (!before) {
      const created = await tx.supplierContact.create({ data: { organisationId: l.org.id, supplierId, ...row } });
      await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.contact, created.id, label(l.supplier, "Contact"), "CREATE", diffFields(null, words(created)!));
    } else {
      const after = await tx.supplierContact.update({ where: { id: before.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.contact, before.id, label(l.supplier, "Contact"), "UPDATE", diffFields(words(before), words(after)!));
    }
    return { ok: true };
  });
}

// ------------------------------------------------------------------ documents (FR-VND-002, 004, 008)

/**
 * Lodge a document, or a renewal of one (`renewsId`): one chain per type; a renewal takes effect only
 * once verified (FR-VND-008). Attached to the open application where there is one. The type's switches,
 * its body's values and the day are judged under the supplier's lock.
 */
export async function lodgeDocument(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const supplierId = String(data.get("supplierId") ?? "");
  const renewsId = String(data.get("renewsId") ?? "").trim() || null;
  const r = new FormReader(data);
  const v = {
    typeId: r.text("typeId", "Document type", { required: true }),
    reference: r.text("reference", "Reference", { max: 240 }),
    issuingAuthority: r.text("issuingAuthority", "Issuing authority", { max: 240 }),
    issuedOn: r.optionalText("issuedOn"),
    validFrom: r.optionalText("validFrom"),
    expiresOn: r.optionalText("expiresOn"),
    notApplicable: r.bool("notApplicable"),
    note: r.text("note", "Note", { max: 2000 }),
    personId: r.optionalText("recordedByPersonId"),
  };
  // The shared multi-select posts its choices as one newline-joined field (splitValues).
  const valueIds = splitValues(data.get("valueIds"));
  if (r.failed) return { ok: false, errors: r.errors };
  return inSupplier(actor, supplierId, async (tx, l) => {
    if (renewsId) await tx.$queryRaw`SELECT id FROM "SupplierDocument" WHERE id = ${renewsId} AND "supplierId" = ${supplierId} FOR UPDATE`;
    const typeRow = await tx.supplierDocumentType.findFirst({ where: { id: v.typeId, organisationId: l.org.id } });
    const chainRows = await tx.supplierDocument.findMany({ where: { supplierId, typeId: v.typeId } });
    const chain = chainRows.map(documentFacts);
    const renews = renewsId ? (chain.find((d) => d.id === renewsId) ?? null) : null;
    const values = valueIds.length ? await tx.registrationValue.findMany({ where: { id: { in: valueIds }, organisationId: l.org.id } }) : [];
    const person = await activePerson(tx, l.org.id, v.personId);
    const open = await tx.supplierApplication.findFirst({ where: { supplierId, status: { in: ["RECEIVED", "RESUBMISSION_REQUESTED"] }, lapsedRecordedAt: null }, select: { id: true } });
    const fs: Finding[] = lodgeFaults(
      { ...v, values: values.map((x) => ({ id: x.id, bodyId: x.bodyId, kind: x.kind as RegistrationValueKind, retiredOn: day(x.retiredOn) })) },
      { today: l.org.today, type: typeRow ? typeFacts(typeRow) : null, chain, renews, renewing: !!renewsId, supplierRejected: l.supplier.status === "REJECTED" && !open },
    );
    // A value chosen that is not configured (taken off since the form was opened) is not one the type records.
    if (values.length !== new Set(valueIds).size && typeRow) fs.push({ code: "VALUE_NOT_OF_TYPE", level: "block", data: { type: typeRow.nameEn } });
    if (!person) fs.push({ code: "PERSON_REQUIRED", level: "block" });
    if (blocking(fs).length) return refusal(fs);
    const doc = await tx.supplierDocument.create({
      data: {
        organisationId: l.org.id,
        supplierId,
        typeId: typeRow!.id,
        typeLabelSnapshot: typeRow!.nameEn,
        applicationId: open?.id ?? null,
        reference: v.notApplicable ? "" : v.reference,
        issuingAuthority: v.notApplicable ? "" : v.issuingAuthority,
        issuedOn: v.issuedOn ? dayToDate(v.issuedOn) : null,
        validFrom: v.validFrom ? dayToDate(v.validFrom) : null,
        expiresOn: v.expiresOn ? dayToDate(v.expiresOn) : null,
        notApplicable: v.notApplicable,
        supersedesId: renewsId,
        lodgedOn: dayToDate(l.org.today!),
        recordedAt: now,
        recordedByPersonId: person!.id,
        note: v.note,
        values: { create: values.map((x) => ({ organisationId: l.org.id, registrationValueId: x.id, kind: x.kind, codeSnapshot: x.code, labelSnapshot: x.nameEn })) },
      },
      include: { supplier: { select: { reference: true } } },
    });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.document, doc.id, supplierDocumentLabel(doc), "CREATE",
      diffFields(null, {
        documentType: typeRow!.nameEn,
        documentReference: doc.reference || null,
        issuingAuthority: doc.issuingAuthority || null,
        issuedOn: v.issuedOn,
        validFrom: v.validFrom,
        expiresOn: v.expiresOn,
        notApplicable: v.notApplicable || null,
        values: values.length ? values.map((x) => x.nameEn).join(", ") : null,
        renews: renews ? `${renews.typeLabel}, lodged ${formatDate(renews.lodgedOn)}` : null,
        lodgedOn: l.org.today,
        recordedBy: person!.name,
        recordedOnBehalf: "not signed",
      }), v.note);
    return { ok: true, message: `Lodged, not checked yet.${renews ? " The renewal takes effect once it is verified; until then the document it renews stays in force." : ""} Attach its scan, then record the check.` };
  });
}

/// An officer's check of a lodged document (FR-VND-004): verified (on its scan) or not in order (with why), by a named Person on a day.
export async function verifyDocument(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const documentId = String(data.get("documentId") ?? "");
  const r = new FormReader(data);
  const state = r.choice("verification", "Outcome of the check", VERIFICATION_STATES.filter((s) => s !== "NOT_CHECKED"));
  const personId = r.optionalText("personId");
  const verifiedOn = r.optionalText("verifiedOn");
  const note = r.text("verificationNote", "Why", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const supplierId = await supplierOfDocument(documentId);
  if (!supplierId) return GONE;
  return inSupplier(actor, supplierId, async (tx, l) => {
    await tx.$queryRaw`SELECT id FROM "SupplierDocument" WHERE id = ${documentId} FOR UPDATE`;
    const d = await tx.supplierDocument.findFirst({ where: { id: documentId, supplierId, organisationId: actor.organisationId }, include: { supplier: { select: { reference: true } }, attachments: { where: { purpose: "SUPPLIER_DOCUMENT" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } } } });
    if (!d) return GONE;
    const person = await activePerson(tx, l.org.id, personId);
    const fs = verifyFaults({ state, personActive: !!person, verifiedOn, note }, { verification: d.verification, lodgedOn: storedDay(d.lodgedOn), notApplicable: d.notApplicable, scanned: d.attachments.some(isLive) }, l.org.today);
    if (blocking(fs).length) {
      const errors: Record<string, string> = {};
      const rest: string[] = [];
      for (const f of blocking(fs)) {
        const field = f.code === "PERSON_REQUIRED" ? "personId" : f.code === "DAY_REQUIRED" || f.code === "IN_FUTURE" || f.code === "BEFORE_LODGED" ? "verifiedOn" : f.code === "NOTE_REQUIRED" ? "verificationNote" : f.code === "STATE_REQUIRED" ? "verification" : null;
        if (field) errors[field] = supplierFaultText(f);
        else rest.push(supplierFaultText(f));
      }
      return { ok: false, errors, ...(rest.length ? { message: `Nothing was saved: ${rest.join(" ")}` } : {}) };
    }
    const moved = await tx.supplierDocument.updateMany({ where: { id: d.id, verification: "NOT_CHECKED" }, data: { verification: state!, verifiedByPersonId: person!.id, verifiedOn: dayToDate(verifiedOn!), verifiedAt: now, verificationNote: note } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.document, d.id, supplierDocumentLabel(d), "UPDATE",
      diffFields({ verification: VERIFICATION_LABEL.NOT_CHECKED.en }, { verification: VERIFICATION_LABEL[state!].en, verifiedBy: person!.name, verifiedOn, recordedOnBehalf: "not signed", verificationNote: note || null }), note);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the decision (FR-VND-007, OD-2 A)

/// The application's file as approval judges it, read under the supplier's lock.
async function fileOf(tx: Tx, l: LockedSupplier, a: { kind: string; status: FileFacts["status"]; lapsedRecordedAt: Date | null; resubmitBy: Date | null; declarationSignedOn: Date | null; routes: { status: string }[]; attachments: { purpose: string; detachedAt: Date | null; version: { withdrawnAt: Date | null } }[] }) {
  const [types, docs, st] = await Promise.all([
    tx.supplierDocumentType.findMany({ where: { organisationId: l.org.id } }),
    tx.supplierDocument.findMany({ where: { supplierId: l.supplier.id } }),
    // FR-TRM-017 (fix S-2): a blacklisting in effect stops the approval, on the locked rows.
    l.org.today ? standingOf(l.supplier.id, l.org.id, l.org.today, tx) : Promise.resolve(null),
  ]);
  const f = fileFacts(
    { status: a.status, lapsedRecordedAt: a.lapsedRecordedAt, resubmitBy: day(a.resubmitBy), routePending: a.routes.some((x) => x.status === "PENDING"), declarationSignedOn: day(a.declarationSignedOn), declarationScanned: a.attachments.some((x) => x.purpose === "SUPPLIER_DECLARATION" && isLive(x)), blacklist: st?.reading.blacklist ?? null, kind: a.kind as ApplicationKind, supplierStatus: l.supplier.status as SupplierStatus, cancellation: st?.reading.cancellation ?? null },
    types.map(typeFacts),
    docs.map(documentFacts),
    l.org.today ?? "0000-01-01",
  );
  return { f, provenanceOf: (typeLabel: string) => types.find((t) => t.nameEn === typeLabel)?.provenance ?? null };
}



/**
 * Send the application for decision (OD-2 A): the file must be approvable today (every mandatory
 * document standing, the declaration's day and scan), then the engine's route on `supplier_registration`
 * under the application's kind, with no value, resolved now with the sender as requester and opened
 * with its steps. No rule: refused, naming the Approval matrix.
 */
export async function submitForDecision(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const applicationId = String(data.get("applicationId") ?? "");
  const r = new FormReader(data);
  const personId = r.text("personId", "Sent by", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const supplierId = await supplierOfApplication(applicationId);
  if (!supplierId) return GONE;
  return inSupplier(actor, supplierId, async (tx, l) => {
    await tx.$queryRaw`SELECT id FROM "SupplierApplication" WHERE id = ${applicationId} FOR UPDATE`;
    const a = await tx.supplierApplication.findFirst({ where: { id: applicationId, supplierId, organisationId: actor.organisationId }, include: appInclude });
    if (!a) return GONE;
    const person = await activePerson(tx, l.org.id, personId);
    if (!person) return { ok: false, errors: { personId: supplierFaultText({ code: "PERSON_REQUIRED", level: "block" }) } };
    const { f } = await fileOf(tx, l, a);
    const fs = submitFaults(f, l.org.today);
    if (blocking(fs).length) return refuse(fs, "Not sent:");
    const today = l.org.today!;
    const issue = await loadIssue(actor.organisationCode, dayToDate(today), undefined, null, tx);
    if (!issue) return NO_ISSUE;
    const roster = await loadRoster(actor.organisationCode, tx);
    const delegations = await loadDelegations(actor.organisationCode, tx);
    const people = new Map(roster.people.map((p) => [p.id, p]));
    const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
    const res = supplierRoute(issue.matrix, SUPPLIER_REGISTRATION_DOMAIN, a.kind, {
      id: person.id,
      holds: (code) => supplierHolders(code, roster, delegations, today).holderIds.includes(person.id),
      ableToAct: (code) => ableToAct(supplierHolders(code, roster, delegations, today), person.id, 0n, available),
    }, REGISTRATION_MATTER);
    if (res.refusal) return { ok: false, message: `Not sent: ${res.refusal.en}` };
    const rule = issue.matrix.rules.find((x) => x.ruleKey === res.ruleKey)!;
    const roleLabel = (code: string) => issue.matrix.roles[code]?.nameEn ?? "An office no longer configured";
    const instance = await tx.approvalInstance.create({
      data: {
        organisationId: l.org.id,
        matterKind: "SUPPLIER",
        supplierApplicationId: a.id,
        domain: SUPPLIER_REGISTRATION_DOMAIN,
        cond: a.kind,
        // OD-2 A: routed on no value. Never an invented 0.
        value: null,
        authorityMatrixId: issue.id,
        matrixLabel: issue.label,
        ruleKey: rule.ruleKey,
        ruleLabel: rule.labelEn,
        ruleClause: rule.clause,
        boundaryValue: String(issue.matrix.policy.boundaryValue),
        boundaryInclusive: issue.matrix.policy.boundaryInclusive,
        ruleFollowsBoundarySwitch: rule.followsBoundarySwitch,
        boundaryOperator: boundaryOperatorFor(rule, issue.matrix.policy),
        checkedAgainstMatrix: true,
        warnings: res.warnings as unknown as Prisma.InputJsonValue,
        status: "PENDING",
        openedAt: dayToDate(today),
        // A refusal returns the application to the officer: it stays open (ASSUMED, as the negotiation's).
        rejectionSnapshotAt: now,
        rejectionDestinationId: null,
        rejectionKind: "RETURN_TO_ORIGINATOR",
        rejectionReturnToRoleCode: null,
        rejectionProvenance: "ASSUMED",
        ...routeCoreFields(res.core, now),
        steps: { create: res.chain.map((s, i) => ({ sequence: i + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
      },
    });
    await tx.supplierApplication.update({ where: { id: a.id, organisationId: actor.organisationId }, data: { submittedByPersonId: person.id } });
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalInstance", instance.id, label(l.supplier, "Registration approval route"), "CREATE",
      diffFields(null, { matter: `${APPLICATION_KIND_LABEL[a.kind as ApplicationKind].en} of ${l.supplier.registeredName}`, matrix: issue.label, rule: rule.labelEn, routedOn: "No value (supplier matters are not routed on a value)", route: res.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), ifRefused: "the application stays open" }));
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.application, a.id, supplierApplicationLabel(a), "UPDATE", diffFields({ sentBy: null }, { sentBy: person.name, recordedOnBehalf: "not signed" }));
    return { ok: true, message: "Sent for decision. The application is approved when its route's last step is recorded." };
  });
}

/**
 * A named Person's decision on a step of a registration route: recorded on their behalf, not signed;
 * 6.1's holder, delegation, self-approval and date checks (`deciderFaults`), the holders read
 * organisation-wide. The last step's approval re-judges the file on the locked rows (a document may
 * have expired since it was sent): if it no longer stands, nothing is recorded. Approved, the
 * application is approved and a first registration registers the supplier, with what it was judged
 * under frozen on its decision.
 */
export async function decideRegistrationStep(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const r = new FormReader(data);
  const stepId = r.text("stepId", "Step", { required: true });
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  const personId = r.text("personId", "Decided by", { required: true });
  const on = r.date("decidedOn", "Decided on", { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (decision === "REJECTED" && !reason) r.reject("reason", "Say why it is refused.");
  if (r.failed || !decision || !on) return { ok: false, errors: r.errors };
  const found = await db.approvalStep.findUnique({ where: { id: stepId, instance: { organisationId: actor.organisationId } }, select: { instance: { select: { supplierApplicationId: true } } } });
  const applicationId = found?.instance.supplierApplicationId ?? null;
  if (!applicationId) return { ok: false, message: "That step is not on a supplier's registration route." };
  const supplierId = await supplierOfApplication(applicationId);
  if (!supplierId) return GONE;
  return inSupplier(actor, supplierId, async (tx, l) => {
    await tx.$queryRaw`SELECT id FROM "SupplierApplication" WHERE id = ${applicationId} FOR UPDATE`;
    const a = await tx.supplierApplication.findFirst({ where: { id: applicationId, supplierId, organisationId: actor.organisationId }, include: appInclude });
    if (!a) return GONE;
    const full = a.routes.find((x) => x.status === "PENDING" && x.steps.some((s) => s.id === stepId));
    if (!full) return { ok: false, message: "That step is not on a registration route awaiting a decision." };
    const step = full.steps.find((s) => s.id === stepId)!;
    const roster = await loadRoster(actor.organisationCode, tx);
    const delegations = await loadDelegations(actor.organisationCode, tx);
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id }, select: { id: true, name: true, isActive: true } });
    const decidedOn = storedDay(on);
    const office = actingOffice(step);
    const check = deciderFaults(step, {
      today: l.org.today,
      holders: office ? supplierHolders(office, roster, delegations, decidedOn) : { scope: null, holderIds: [], delegates: [] },
      declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
      person,
      requesterId: a.submittedByPersonId ?? "",
      endorserIds: [],
      otherDeciderIds: full.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
      earlierDone: full.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"),
      decidedOn,
      openedOn: storedDay(full.openedAt),
      value: 0n,
    });
    if (check.faults.length > 0) {
      const texts = check.faults.map((f) => SUPPLIER_DECIDER_TEXT[f].en.replace(/^That person/, person?.name ?? "That person"));
      return ["TIME_ZONE_UNSET", "COMMITTEE_STEP", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0]) ? { ok: false, message: texts.join(" ") } : { ok: false, errors: { personId: texts.join(" ") } };
    }
    const after = personDecisionWrite({ decision, person: { id: person!.id, name: person!.name }, decidedOn: on, delegationId: check.delegationId, reason, recordedAt: now });
    const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
    if (done.count !== 1) throw new Refusal(CHANGED);
    const routeLabel = label(l.supplier, "Registration approval route");
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalStep", step.id, `${routeLabel} · ${step.roleLabel}`, "UPDATE", diffFields({ decision: step.decision }, { decision, decidedBy: person!.name, decidedOn: on, recordedOnBehalf: "not signed", underDelegation: check.delegationId ? "yes" : null }), reason);
    if (decision === "REJECTED") {
      await closeRejected(tx, toAuditActor(actor), { organisationId: l.org.id, routeLabel }, full, { apply: "RETURN_TO_ORIGINATOR", source: "CONFIGURED" }, reason, REGISTRATION_REFUSED_DECIDED_BY);
      return { ok: true, message: "Refused on its route. The application stays open: request a resubmission, reject it, or send it again." };
    }
    if (!full.steps.every((s) => s.id === step.id || s.decision === "DONE")) return { ok: true };
    // The last step: the file judged again on the locked rows; if it no longer stands, nothing is recorded.
    const { f, provenanceOf } = await fileOf(tx, l, a);
    const fs = approveFaults(f, l.org.today);
    if (blocking(fs).length) throw new Refusal(refuse(fs, "Not approved, and the step was not recorded: the file no longer stands as it did when sent."));
    const today = l.org.today!;
    await tx.approvalInstance.update({ where: { id: full.id, organisationId: actor.organisationId }, data: { status: "APPROVED", closedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, "ApprovalInstance", full.id, routeLabel, "UPDATE", diffFields({ status: full.status }, { status: "APPROVED" }), reason);
    const moved = await tx.supplierApplication.updateMany({ where: { id: a.id, status: a.status, lapsedRecordedAt: null }, data: { status: "APPROVED", decidedAt: now } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    const snap = decisionSnapshot(f, today, provenanceOf);
    const dec = await tx.applicationDecision.create({ data: { organisationId: l.org.id, applicationId: a.id, outcome: "APPROVE", decidedByPersonId: person!.id, decidedOn: on, decidedAt: now, policySnapshot: snap as unknown as Prisma.InputJsonValue } });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.decision, dec.id, supplierApplicationLabel(a), "CREATE", diffFields(null, { outcome: OUTCOME_LABEL.APPROVE.en, decidedBy: person!.name, decidedOn: on, recordedOnBehalf: "not signed", judgedUnder: snap.mandatory.map((m) => `${m.type}: ${DOCUMENT_STATE_LABEL[m.state as DocumentState].en}`).join("; ") || "No mandatory document type" }));
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.application, a.id, supplierApplicationLabel(a), "UPDATE", diffFields({ status: a.status }, { status: "APPROVED" }));
    // M-1 (BD-613-108): a first registration sets the registration day, also for a supplier whose registration was
    // cancelled (the way back): its registeredOn moves to today, after the day the cancellation took effect (approveFaults
    // refused the very day), so the standing reads the cancellation as ended. The audit records the row as it was.
    let again: { since: string } | null = null;
    if (a.kind === "NEW") {
      const before = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId, organisationId: actor.organisationId }, select: { registeredOn: true } });
      again = l.supplier.status === "REGISTERED" && f.cancellation ? { since: f.cancellation.effectiveOn } : null;
      await tx.supplier.update({ where: { id: supplierId, organisationId: actor.organisationId }, data: { status: "REGISTERED", registeredOn: dayToDate(today) } });
      await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.supplier, supplierId, label(l.supplier, l.supplier.registeredName), "UPDATE",
        diffFields({ status: SUPPLIER_STATUS_LABEL[l.supplier.status as SupplierStatus]?.en ?? l.supplier.status, registeredOn: day(before.registeredOn) }, { status: "Registered", registeredOn: today, ...(again ? { cancellationEnded: `The registration cancelled from ${formatDate(again.since)} no longer stands` } : {}) }));
    }
    return { ok: true, message: approvedWords(a.kind, again, today).en };
  });
}

/**
 * An officer's outcome on an open application (FR-VND-007): resubmission requested (each item as written,
 * with a deadline) or rejected (with the reasons as written). The notice is shown, not sent (INT-09).
 * Items come from the form as `item:<documentId>` or `type:<typeId>` remarks; an empty one is not asked.
 */
export async function decideApplication(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const applicationId = String(data.get("applicationId") ?? "");
  const r = new FormReader(data);
  const outcome = r.choice("outcome", "Outcome", ["RESUBMIT", "REJECT"] as const, { required: true });
  // A rejection's drawer asks its reasons as the destructive act's reason; a resubmission's as remarks.
  const remarks = r.text("remarks", "Remarks", { max: 4000 }) || String(data.get("reason") ?? "").trim();
  const resubmitBy = r.optionalText("resubmitBy");
  const personId = r.optionalText("personId");
  if (r.failed || !outcome) return { ok: false, errors: r.errors };
  const items: { documentId: string | null; typeId: string | null; remarks: string }[] = [];
  for (const [k, raw] of data.entries()) {
    const text = String(raw).trim();
    if (!text) continue;
    if (k.startsWith("item:")) items.push({ documentId: k.slice(5), typeId: null, remarks: text });
    if (k.startsWith("type:")) items.push({ documentId: null, typeId: k.slice(5), remarks: text });
  }
  const supplierId = await supplierOfApplication(applicationId);
  if (!supplierId) return GONE;
  return inSupplier(actor, supplierId, (tx, l) => recordOutcome(tx, toAuditActor(actor), l, { applicationId, outcome, remarks, resubmitBy, personId, items, now }));
}

/**
 * Record the rejection a lapsed resubmission deadline means (FR-VND-007: "a lapsed resubmission deadline
 * auto-rejects"). The lapse is derived from the organisation's day, with no scheduler; this records it,
 * once, with nobody's name: it is the deadline's outcome, not a decision. The notice is shown, not sent.
 */
export async function recordLapse(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const applicationId = String(data.get("applicationId") ?? "");
  const supplierId = await supplierOfApplication(applicationId);
  if (!supplierId) return GONE;
  return inSupplier(actor, supplierId, async (tx, l) => {
    await tx.$queryRaw`SELECT id FROM "SupplierApplication" WHERE id = ${applicationId} FOR UPDATE`;
    const a = await tx.supplierApplication.findFirst({ where: { id: applicationId, supplierId, organisationId: actor.organisationId }, include: appInclude });
    if (!a) return GONE;
    const fs = lapseFaults({ status: a.status, lapsedRecordedAt: a.lapsedRecordedAt, resubmitBy: day(a.resubmitBy) }, l.org.today);
    if (blocking(fs).length) return refuse(fs, "Not recorded:");
    const today = l.org.today!;
    const remarks = `The resubmission deadline of ${formatDate(day(a.resubmitBy))} passed with the resubmission not received.`;
    const dec = await tx.applicationDecision.create({ data: { organisationId: l.org.id, applicationId: a.id, outcome: "LAPSE", remarks, decidedOn: dayToDate(today), decidedAt: now } });
    const moved = await tx.supplierApplication.updateMany({ where: { id: a.id, status: "RESUBMISSION_REQUESTED", lapsedRecordedAt: null }, data: { status: "REJECTED", lapsedRecordedAt: now, decidedAt: now } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.decision, dec.id, supplierApplicationLabel(a), "CREATE", diffFields(null, { outcome: OUTCOME_LABEL.LAPSE.en, remarks, decidedOn: today, lapse: `Recorded ${formatOrgDateTime(now, l.org.timeZone)}` }));
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.application, a.id, supplierApplicationLabel(a), "UPDATE", diffFields({ status: a.status }, { status: "REJECTED" }));
    await rejectApplicant(tx, toAuditActor(actor), l, a.kind);
    return { ok: true, message: "Recorded: the application is rejected on its lapsed deadline. The notice to the supplier is shown here, not sent." };
  });
}

// ------------------------------------------------------------------ the finance system (INT-03)

/// Record the finance system's vendor code (manual adapter). A changed code needs the reason.
export async function setErpVendorCode(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const now = stampNow();
  const supplierId = String(data.get("supplierId") ?? "");
  const r = new FormReader(data);
  // fix R-11: one normalised code is checked, looked up and stored (never the typed spacing).
  const code = normaliseVendorCode(r.text("erpVendorCode", "Vendor code", { max: 60 }));
  const reason = String(data.get("reason") ?? "").trim();
  if (r.failed) return { ok: false, errors: r.errors };
  return inSupplier(actor, supplierId, async (tx, l): Promise<FormState> => {
    const before = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId, organisationId: actor.organisationId }, select: { erpVendorCode: true } });
    if (before.erpVendorCode && !reason) return { ok: false, errors: { reason: "Say why the vendor code changes." } };
    const format = await tx.codeFormat.findFirst({ where: { organisationId: l.org.id, key: VENDOR_CODE_FORMAT_KEY }, select: { pattern: true } });
    const taken = code ? await tx.supplier.findFirst({ where: { organisationId: l.org.id, erpVendorCode: code, NOT: { id: supplierId } }, select: { id: true } }) : null;
    const faults = manualVendorMaster.check(code, { pattern: format?.pattern ?? null, taken: !!taken, registered: l.supplier.status === "REGISTERED" });
    if (faults.length) return { ok: false, errors: { erpVendorCode: faults.map((f) => supplierFaultText({ code: f, level: "block" })).join(" ") } };
    await tx.supplier.update({ where: { id: supplierId, organisationId: actor.organisationId }, data: { erpVendorCode: code, erpSyncedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.supplier, supplierId, label(l.supplier, l.supplier.registeredName), "UPDATE", diffFields({ erpVendorCode: before.erpVendorCode }, { erpVendorCode: code, recordedOnBehalf: `entered ${formatOrgDateTime(now, l.org.timeZone)}, not synced by an adapter` }), reason);
    return { ok: true };
  });
}
