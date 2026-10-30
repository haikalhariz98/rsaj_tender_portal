/**
 * Demo data for Phase 4b: the supplier's own registration (the CPD registration spec, B3 to B7). Invented throughout; every configured value is ASSUMED and none is a customer's
 * figure, list, wording or source. The declarations' wording says so in its source: "Demonstration wording, not the customer's".
 *
 * - Configuration (`configureRegistrationDemo`): the BANK and ACCOUNT_TYPE lists, the formats of an account number and a SWIFT code, the registration settings (help contact, upload
 *   quota, the classes uploads take, the ruling on the online declaration), the hints and the rate / repeatable switches on the document types, one repeatable type, and the two
 *   declarations' wording (version 1 each).
 * - Registrations (`loadRegistrationDemo`):
 *     demo_pap1  an online application RECEIVED, waiting for an officer (its step-one fields);
 *     demo_vnd8  a supplier accepted from an online application and not yet registered: a half-saved draft, two documents (one with its file), a bank profile begun;
 *     demo_vnd9  a supplier that SENT its registration: seven documents with files, work codes, bank details with the statement, both declarations signed, waiting for an officer.
 *   The two suppliers' portal accounts wait for activation (they hold the hash of a secret nobody knows); `npm run demo:accounts` gives them the demonstration password.
 *
 * demo_vnd9 is built exactly as the wizard builds it and judged by the product's own rule (`registrationFaults`) before it is sent, so the demonstration cannot hold a registration the
 * product would have refused. Its signatures are attributed to the demo loader on the account's behalf, and say so: nobody signed them.
 */

import { randomBytes } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { loginKeyOf } from "../src/lib/auth/identity";
import { hashPassword } from "../src/lib/auth/password";
import { dayToDate, instantAt, todayIn } from "../src/lib/dates";
import { issueReference } from "../src/lib/numbering/issue";
import { contextFor } from "../src/lib/portal/registration/context-store";
import { frozenWording } from "../src/lib/portal/registration/declaration-text";
import { blockingFaults, registrationFaults } from "../src/lib/portal/registration/faults";
import { draftOf, loadDraftView } from "../src/lib/portal/registration/draft-store";
import { normaliseRegistrationNo } from "../src/lib/suppliers/identity";
import { DEMO_ATTRIBUTION_REASON } from "./demo-attribution";
import { DEMO_ACTOR } from "./demo-actor";
import { demoPdf, writeDemoDocs } from "./demo-documents";
import { demoOrgId } from "./demo-org";
import { calendarOf } from "./demo-window";

type Db = PrismaClient;
const P = "demo_";
const SOURCE = "Demonstration wording, not the customer's";
const OFFICER = { id: `${P}p4`, name: "Daniel Anak Jelani" };

export const REGISTRATION_DEMO_ACCOUNTS = [
  { loginName: "demo.supplier3", supplierId: `${P}vnd8` },
  { loginName: "demo.supplier4", supplierId: `${P}vnd9` },
] as const;

type Entry = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason: string; unattributed: boolean };
const fail = (what: string): never => {
  throw new Error(`Demo 4b: ${what}.`);
};

// ------------------------------------------------------------------ configuration

const LISTS = [
  { id: `${P}slv11`, list: "BANK" as const, code: "demo_bank_a", nameEn: "Demo Bank A", nameMs: "Bank Demo A", sortOrder: 1 },
  { id: `${P}slv12`, list: "BANK" as const, code: "demo_bank_b", nameEn: "Demo Bank B", nameMs: "Bank Demo B", sortOrder: 2 },
  { id: `${P}slv13`, list: "ACCOUNT_TYPE" as const, code: "demo_current", nameEn: "Current account", nameMs: "Akaun semasa", sortOrder: 1 },
  { id: `${P}slv14`, list: "ACCOUNT_TYPE" as const, code: "demo_savings", nameEn: "Savings account", nameMs: "Akaun simpanan", sortOrder: 2 },
];

const FORMATS = [
  { id: `${P}f7`, key: "bank_account_no", pattern: "\\d{8,16}", example: "112233445566", description: "Eight to sixteen digits (demo, invented)." },
  { id: `${P}f8`, key: "swift_code", pattern: "[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?", example: "DEMOMYKL", description: "Eight or eleven characters (demo, invented)." },
];

/// What the applicant is told each type is, for the demonstration's types (invented wording).
const HINTS: Record<string, { hintEn: string; hintMs: string }> = {
  [`${P}sdt1`]: { hintEn: "The certificate of incorporation or registration of the business (demo wording).", hintMs: "Sijil pemerbadanan atau pendaftaran perniagaan (teks demo)." },
  [`${P}sdt2`]: { hintEn: "The contractor registration certificate, with its grade and categories (demo wording).", hintMs: "Sijil pendaftaran kontraktor, dengan gred dan kategorinya (teks demo)." },
  [`${P}sdt5`]: { hintEn: "A tax clearance letter that is still in force (demo wording).", hintMs: "Surat pelepasan cukai yang masih berkuat kuasa (teks demo)." },
  [`${P}sdt9`]: { hintEn: "The tax authority's clearance of the company (demo wording).", hintMs: "Pelepasan cukai syarikat oleh pihak berkuasa cukai (teks demo)." },
  [`${P}sdt10`]: { hintEn: "A signed statement that the company is not on any blacklist (demo wording).", hintMs: "Akuan bertandatangan bahawa syarikat tidak disenaraihitam (teks demo)." },
};

const OTHER_TYPE = { id: `${P}sdt11`, code: "demo_other_document", nameEn: "Other supporting document", nameMs: "Dokumen sokongan lain", bodyId: null, valueKinds: [] as string[], expires: false, mandatoryAtRegistration: false, notApplicableAllowed: true, hintEn: "Anything else you wish to send, each with a title of its own (demo wording).", hintMs: "Apa-apa lagi yang ingin dihantar, setiap satu dengan tajuknya (teks demo).", recordsRate: false, repeatable: true };

const TEXTS = [
  { id: `${P}dtx1`, kind: "GIRO_AUTHORISATION" as const, bodyEn: "I authorise {organisation} to pay every amount due to my company into the bank account given in this form, and I confirm that I am entitled to give this authorisation (demonstration wording, invented).", bodyMs: "Saya membenarkan {organisation} membayar semua jumlah yang kena dibayar kepada syarikat saya ke dalam akaun bank yang diberikan dalam borang ini, dan saya mengesahkan bahawa saya berhak memberi kebenaran ini (teks demo, rekaan)." },
  { id: `${P}dtx2`, kind: "FALSE_DECLARATION" as const, bodyEn: "I declare that everything in this registration is true and complete. I understand that a false declaration may lead to the registration being refused or withdrawn and to {organisation} taking further action (demonstration wording, invented).", bodyMs: "Saya mengaku bahawa semua yang terkandung dalam pendaftaran ini adalah benar dan lengkap. Saya faham bahawa akuan palsu boleh menyebabkan pendaftaran ditolak atau ditarik balik dan {organisation} mengambil tindakan lanjut (teks demo, rekaan)." },
  // ADR 0041 D4 (REG-4): the terms of registration, agreed with the Personal Data Notice by one tick. Demonstration and scratch data only: no terms text ships, and a customer issues its own.
  { id: `${P}dtx3`, kind: "TERMS_AND_CONDITIONS" as const, bodyEn: "These are the terms on which {organisation} keeps its supplier register. Registering does not entitle a company to any contract. The company keeps its details current and tells {organisation} of any change. {organisation} may suspend or cancel a registration under its published rules (demonstration wording, invented).", bodyMs: null },
];

const KIND_NAME = { GIRO_AUTHORISATION: "GIRO authorisation", FALSE_DECLARATION: "False-declaration acknowledgement", TERMS_AND_CONDITIONS: "Terms and conditions" } as const;

export async function configureRegistrationDemo(db: Db, organisationId: string) {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone ?? fail("the organisation's time zone is not set");
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  const at = instantAt(W(30), "10:00", tz)!;
  const later = (m: number) => new Date(at.getTime() + m * 60_000);
  const trail: Entry[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason = "") => trail.push({ id: `${P}rgau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });

  for (const [i, l] of LISTS.entries()) {
    if (await db.supplierListValue.findFirst({ where: { organisationId, list: l.list, code: l.code }, select: { id: true } })) continue;
    await db.supplierListValue.create({ data: { ...l, organisationId, provenance: "ASSUMED" } });
    entry("SupplierListValue", l.id, `${l.list === "BANK" ? "Bank" : "Account type"} · ${l.nameEn}`, "CREATE", later(i), diffFields(null, { name: l.nameEn, nameInMalay: l.nameMs, whereItComesFrom: "Assumed" }));
  }
  for (const [i, f] of FORMATS.entries()) {
    if (await db.codeFormat.findFirst({ where: { organisationId, key: f.key }, select: { id: true } })) continue;
    await db.codeFormat.create({ data: { ...f, organisationId, provenance: "ASSUMED" } });
    entry("CodeFormat", f.id, `Code format · ${f.key === "bank_account_no" ? "bank account number" : "SWIFT code"}`, "CREATE", later(10 + i), diffFields(null, { example: f.example, provenance: "ASSUMED" }));
  }
  // The hints, and the switches on the document types the demonstration holds.
  for (const [id, h] of Object.entries(HINTS)) {
    const t = await db.supplierDocumentType.findUnique({ where: { id }, select: { nameEn: true, hintEn: true } });
    if (!t || t.hintEn) continue;
    await db.supplierDocumentType.update({ where: { id }, data: h });
    entry("SupplierDocumentType", id, `Supplier document type · ${t.nameEn}`, "UPDATE", later(20), diffFields({ whatTheApplicantIsTold: null }, { whatTheApplicantIsTold: h.hintEn, whatTheApplicantIsToldInMalay: h.hintMs }));
  }
  const salesTax = await db.supplierDocumentType.findUnique({ where: { id: `${P}sdt6` }, select: { nameEn: true, recordsRate: true } });
  if (salesTax && salesTax.recordsRate == null) {
    await db.supplierDocumentType.update({ where: { id: `${P}sdt6` }, data: { recordsRate: true } });
    entry("SupplierDocumentType", `${P}sdt6`, `Supplier document type · ${salesTax.nameEn}`, "UPDATE", later(21), diffFields({ recordsARate: "Not set" }, { recordsARate: "Records a rate" }));
  }
  if (!(await db.supplierDocumentType.findFirst({ where: { organisationId, code: OTHER_TYPE.code }, select: { id: true } }))) {
    await db.supplierDocumentType.create({ data: { ...OTHER_TYPE, valueKinds: [] as never, organisationId, governingSource: "Demo supplier register guide (invented)", provenance: "ASSUMED", sortOrder: 11 } });
    entry("SupplierDocumentType", OTHER_TYPE.id, `Supplier document type · ${OTHER_TYPE.nameEn}`, "CREATE", later(22), diffFields(null, { name: OTHER_TYPE.nameEn, severalMayBeLodged: "Several, each with a title", whereItComesFrom: "Assumed" }));
  }
  // The registration settings: set (invented, ASSUMED) so the demonstration can be walked through. A customer sets its own; the screen shows each unset one as such.
  const policy = await db.supplierPolicy.findUnique({ where: { organisationId } });
  // Keyed on the help contact, which the generic starter pack (loaded by `npm run setup`) leaves unset while it sets the upload limits and classes.
  if (policy && policy.helpEmail == null) {
    const settings = {
      helpEmail: "procurement@demo.invalid", helpPhone: "+999 7 000 0000", helpProvenance: "ASSUMED" as const,
      uploadMaxFilesPerApplication: 12, uploadMaxBytesPerApplication: BigInt(25) * BigInt(1_048_576), uploadLimitProvenance: "ASSUMED" as const,
      supplierUploadClassId: `${P}dc1`, supplierBankStatementClassId: `${P}dc2`, uploadClassProvenance: "ASSUMED" as const,
      onlineDeclarationReplacesPaper: true, onlineDeclarationProvenance: "ASSUMED" as const,
    };
    await db.supplierPolicy.update({ where: { organisationId }, data: settings });
    entry("SupplierPolicy", policy.id, "Supplier register · registration online", "UPDATE", later(30), diffFields({ helpEmail: "Not set", filesPerRegistration: policy.uploadMaxFilesPerApplication ?? "Not set", megabytesPerRegistration: policy.uploadMaxBytesPerApplication == null ? "Not set" : Number(policy.uploadMaxBytesPerApplication / BigInt(1_048_576)), classOfUploads: policy.supplierUploadClassId ? "Starter pack class" : "Not set", classOfBankStatement: policy.supplierBankStatementClassId ? "Starter pack class" : "Not set", onlineDeclarationReplacesPaper: policy.onlineDeclarationReplacesPaper == null ? "Not set" : "Replaces the paper declaration" }, { helpEmail: settings.helpEmail, helpPhone: settings.helpPhone, filesPerRegistration: 12, megabytesPerRegistration: 25, classOfUploads: "Contract documents", classOfBankStatement: "Certificates", onlineDeclarationReplacesPaper: "Replaces the paper declaration", limitsFrom: "Assumed" }), "Demonstration settings (invented)");
  }
  for (const [i, t] of TEXTS.entries()) {
    if (await db.declarationText.findFirst({ where: { organisationId, kind: t.kind }, select: { id: true } })) continue;
    await db.declarationText.create({ data: { ...t, organisationId, version: 1, provenance: "ASSUMED", governingSource: SOURCE, issuedOn: dayToDate(W(30)) } });
    entry("DeclarationText", t.id, `${KIND_NAME[t.kind]} · version 1`, "CREATE", later(40 + i), diffFields(null, { declaration: KIND_NAME[t.kind], version: 1, wording: t.bodyEn, wordingInMalay: t.bodyMs, whereItComesFrom: "Assumed", governingSource: SOURCE }));
  }
  if (trail.length) await db.auditEntry.createMany({ data: trail as never });
}

// ------------------------------------------------------------------ the registrations

interface Applicant {
  id: string;
  contactId: string;
  name: string;
  no: string;
  email: string;
  addressLine1: string;
  city: string;
  postcode: string;
  contact: { name: string; designation: string; email: string; phone: string };
  incorporatedOn: string;
}

export async function loadRegistrationDemo(db: Db, organisationId: string) {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true, name: true } });
  const tz = org.timeZone ?? fail("the organisation's time zone is not set");
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  const D = (days: number) => {
    const t = dayToDate(L);
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
  };
  const T = (day: string, time: string) => instantAt(day, time, tz)!;
  const trail: Entry[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason = "") => trail.push({ id: `${P}rgvau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  const flush = async () => {
    if (trail.length) await db.auditEntry.createMany({ data: trail.splice(0) as never });
  };
  const portalRef = (when: Date) => db.$transaction((tx) => issueReference(tx, organisationId, "portal_application", dayToDate(todayIn(when, tz)!)));
  const supplierRef = (when: Date) => db.$transaction((tx) => issueReference(tx, organisationId, "supplier", dayToDate(todayIn(when, tz)!)));

  // ---- demo_pap1: an online application waiting for an officer.
  const when1 = T(W(1), "11:20");
  const ref1 = await portalRef(when1);
  const pap1 = { name: "Tiruan Maju Sdn Bhd", no: "DEMO-0201-T", email: "tender@tiruanmaju.invalid", line1: "21 Demo Jalan Satu", city: "Demo City", postcode: "00100", contact: { name: "Hanis Binti Roslan", designation: "Director", email: "hanis@tiruanmaju.invalid", phone: "012-000 0201" } };
  await db.portalApplication.create({
    data: {
      id: `${P}pap1`, organisationId, reference: ref1, status: "RECEIVED", receivedOn: dayToDate(todayIn(when1, tz)!), receivedAt: when1,
      registeredName: pap1.name, registrationNo: pap1.no, registrationNoKey: normaliseRegistrationNo(pap1.no), entityTypeCode: "private_limited", countryCode: "demo_home",
      addressLine1: pap1.line1, city: pap1.city, postcode: pap1.postcode, stateCode: "demo_state_a", registeredAddress: `${pap1.line1}, ${pap1.postcode} ${pap1.city}`,
      bumiputeraClaimCode: "demo_declared_yes", incorporatedOn: dayToDate(D(-1200)), companyEmail: pap1.email,
      contactName: pap1.contact.name, contactDesignation: pap1.contact.designation, contactEmail: pap1.contact.email, contactPhone: pap1.contact.phone,
    },
  });
  entry("PortalApplication", `${P}pap1`, `Online application ${ref1}`, "CREATE", when1, diffFields(null, { status: "Received", receivedOn: todayIn(when1, tz) }));

  // ---- the two suppliers accepted from online applications: recorded, with a contact and an account that waits for its activation.
  const waiting = await hashPassword(randomBytes(32).toString("base64url"));
  const accept = async (a: Applicant, papId: string, acceptedAt: Date, accountId: string, loginName: string) => {
    const papRef = await portalRef(acceptedAt);
    const ref = await supplierRef(acceptedAt);
    const day = todayIn(acceptedAt, tz)!;
    await db.supplier.create({
      data: {
        id: a.id, organisationId, reference: ref, registeredName: a.name, registrationNo: a.no, registrationNoKey: normaliseRegistrationNo(a.no), entityTypeCode: "private_limited", countryCode: "demo_home",
        registeredAddress: `${a.addressLine1}, ${a.postcode} ${a.city}`, addressLine1: a.addressLine1, city: a.city, postcode: a.postcode, stateCode: "demo_state_a", incorporatedOn: dayToDate(a.incorporatedOn), companyEmail: a.email, createdAt: acceptedAt,
      },
    });
    await db.supplierContact.create({ data: { id: a.contactId, organisationId, supplierId: a.id, ...a.contact, isPrimary: true, createdAt: acceptedAt } });
    await db.portalApplication.create({
      data: {
        id: papId, organisationId, reference: papRef, status: "RECORDED", receivedOn: dayToDate(day), receivedAt: new Date(acceptedAt.getTime() - 3_600_000), registeredName: a.name, registrationNo: a.no, registrationNoKey: normaliseRegistrationNo(a.no),
        entityTypeCode: "private_limited", countryCode: "demo_home", addressLine1: a.addressLine1, city: a.city, postcode: a.postcode, stateCode: "demo_state_a", registeredAddress: `${a.addressLine1}, ${a.postcode} ${a.city}`, incorporatedOn: dayToDate(a.incorporatedOn), companyEmail: a.email,
        contactName: a.contact.name, contactDesignation: a.contact.designation, contactEmail: a.contact.email, contactPhone: a.contact.phone, decidedAt: acceptedAt, decidedByPersonId: OFFICER.id, acceptedSupplierId: a.id,
      },
    });
    await db.supplierAccount.create({ data: { id: accountId, organisationId, contactId: a.contactId, supplierId: a.id, loginName, loginKey: loginKeyOf(loginName), passwordHash: waiting, passwordChangedAt: acceptedAt, status: "PENDING_ACTIVATION" } });
    entry("Supplier", a.id, `${ref} · ${a.name}`, "CREATE", acceptedAt, diffFields(null, { reference: ref, registeredName: a.name, registrationNo: a.no, status: "Applicant", recordedFrom: `online application ${papRef}` }));
    entry("PortalApplication", papId, `Online application ${papRef}`, "UPDATE", acceptedAt, diffFields({ status: "Received" }, { status: "Recorded", supplier: a.name }));
    entry("SupplierAccount", accountId, `${ref} · Portal account`, "CREATE", acceptedAt, diffFields(null, { status: "Waiting for activation", demonstration: "give it the demonstration password with npm run demo:accounts" }));
    return ref;
  };

  const v8: Applicant = { id: `${P}vnd8`, contactId: `${P}vct8`, name: "Contoh Laut Enterprise", no: "DEMO-0208-L", email: "office@contohlaut.invalid", addressLine1: "8 Demo Jalan Dua", city: "Demo City", postcode: "00200", contact: { name: "Syafiq Bin Ramli", designation: "Owner", email: "syafiq@contohlaut.invalid", phone: "012-000 0208" }, incorporatedOn: D(-900) };
  const v9: Applicant = { id: `${P}vnd9`, contactId: `${P}vct9`, name: "Pelita Teknik Sdn Bhd", no: "201801000109 (000109-P)", email: "tender@pelitateknik.invalid", addressLine1: "9 Demo Industrial Park", city: "Demo City", postcode: "00300", contact: { name: "Nurul Ain Binti Yusof", designation: "Director", email: "nurulain@pelitateknik.invalid", phone: "012-000 0209" }, incorporatedOn: D(-2400) };
  const ref8 = await accept(v8, `${P}pap2`, T(W(6), "10:00"), `${P}vacc8`, REGISTRATION_DEMO_ACCOUNTS[0].loginName);
  const ref9 = await accept(v9, `${P}pap3`, T(W(5), "10:00"), `${P}vacc9`, REGISTRATION_DEMO_ACCOUNTS[1].loginName);

  const typeRow = async (id: string) => db.supplierDocumentType.findUniqueOrThrow({ where: { id } });
  const lastSaved = T(W(2), "15:30");

  // ---- demo_vnd8: a draft half done. Its tax clearance has no file yet, no codes are chosen, and the bank details are begun.
  const draft8 = await db.registrationDraft.create({ data: { id: `${P}rdr8`, organisationId, supplierId: v8.id, version: 4, signatoryName: "", signatoryDesignation: "", giroConfirmed: false, lastSavedBySupplierAccountId: `${P}vacc8`, lastSavedAt: lastSaved, createdAt: T(W(4), "09:00") } });
  const company = await typeRow(`${P}sdt1`);
  const tax = await typeRow(`${P}sdt5`);
  await db.registrationDraftDocument.create({ data: { id: `${P}rdd8a`, organisationId, draftId: draft8.id, typeId: company.id, reference: "CR-208", issuingAuthority: "Demo Companies Registry", createdAt: T(W(4), "09:10") } });
  await db.registrationDraftDocument.create({ data: { id: `${P}rdd8b`, organisationId, draftId: draft8.id, typeId: tax.id, reference: "TC-0208", issuingAuthority: "Demo Tax Office", expiresOn: dayToDate(D(240)), createdAt: T(W(3), "11:00") } });
  await db.creditorProfile.create({ data: { id: `${P}cpr8`, organisationId, supplierId: v8.id, version: 1, beneficiaryName: v8.name, beneficiaryAddress: `${v8.addressLine1}, ${v8.postcode} ${v8.city}`, beneficiaryContactPerson: v8.contact.name, enteredBySupplierAccountId: `${P}vacc8`, createdAt: T(W(2), "15:20") } });
  entry("RegistrationDraft", draft8.id, `${ref8} · Registration draft`, "CREATE", T(W(4), "09:00"), diffFields(null, { status: "being filled in" }));
  await flush();

  const filesOf = async (docs: Parameters<typeof writeDemoDocs>[2], prefix: string, supplierAccountId: string, name: string) => {
    const e = await writeDemoDocs(db, organisationId, docs, prefix, { supplierAccountId, name });
    await e.flush();
  };
  const pdf = (title: string, who: string) => demoPdf([`${title} (demo scan)`, `Uploaded by ${who} through the supplier portal.`, "Not scanned for malware: the demonstration holds the file as it was sent."]);
  const file = (id: string, title: string, who: string, classId: string, className: string, classification: "INTERNAL" | "SULIT", at: string, attachment: { purpose: "SUPPLIER_DRAFT_DOCUMENT" | "SUPPLIER_BANK_STATEMENT"; owner: { registrationDraftDocumentId?: string; creditorProfileId?: string }; ownerLabel: string }) => ({
    id: `${P}${id}`, title, classId, className, classification, createdAt: at,
    versions: [{ id: `${P}${id}v1`, n: 1, bytes: pdf(title, who), mediaType: "application/pdf", filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: at.slice(0, 10), storedAt: at }],
    attachments: [{ id: `${P}${id}a1`, ...attachment, versionId: `${P}${id}v1`, at }],
  });
  const iso = (d: string, time: string) => `${d}T${time}`;
  await filesOf([file("rscan1", `Company certificate CR-208 for ${v8.name}`, v8.name, `${P}dc1`, "Contract documents", "INTERNAL", iso(W(4), "09:15"), { purpose: "SUPPLIER_DRAFT_DOCUMENT", owner: { registrationDraftDocumentId: `${P}rdd8a` }, ownerLabel: `${ref8} · registration draft` })], `${P}rscanau1_`, `${P}vacc8`, v8.name);

  // ---- demo_vnd9: a registration built as the wizard builds it, judged by the product's own rule, then sent.
  const draft9 = await db.registrationDraft.create({ data: { id: `${P}rdr9`, organisationId, supplierId: v9.id, version: 9, signatoryName: v9.contact.name, signatoryDesignation: v9.contact.designation, giroConfirmed: true, lastSavedBySupplierAccountId: `${P}vacc9`, lastSavedAt: T(W(1), "10:30"), createdAt: T(W(4), "09:00") } });
  type Doc = { id: string; typeId: string; reference: string; authority: string; title?: string; expiresOn?: string; rate?: string; values?: string[] };
  const docs9: Doc[] = [
    { id: `${P}rdd9a`, typeId: `${P}sdt1`, reference: "CR-109", authority: "Demo Companies Registry" },
    { id: `${P}rdd9b`, typeId: `${P}sdt2`, reference: "PT-G3-0109", authority: "Demo Contractors Board", expiresOn: D(500), values: [`${P}rgv3`, `${P}rgv7`, `${P}rgv9`] },
    { id: `${P}rdd9c`, typeId: `${P}sdt5`, reference: "TC-0109", authority: "Demo Tax Office", expiresOn: D(300) },
    { id: `${P}rdd9d`, typeId: `${P}sdt9`, reference: "LHDN-0109", authority: "Demo Inland Revenue", expiresOn: D(280) },
    { id: `${P}rdd9e`, typeId: `${P}sdt10`, reference: "SA-0109", authority: "Pelita Teknik Sdn Bhd" },
    { id: `${P}rdd9f`, typeId: `${P}sdt6`, reference: "ST-0109", authority: "Demo Customs", rate: "6.00" },
    { id: `${P}rdd9g`, typeId: `${P}sdt11`, reference: "", authority: "", title: "Company profile and past projects" },
  ];
  const names = new Map<string, string>();
  const scanTitle = (d: Doc, name: string) => `${names.get(d.typeId) ?? "Document"}${d.reference ? ` ${d.reference}` : ""}${d.title ? ` · ${d.title}` : ""} for ${name}`;
  for (const d of docs9) {
    const t = await typeRow(d.typeId);
    names.set(d.typeId, t.nameEn);
    await db.registrationDraftDocument.create({
      data: {
        id: d.id, organisationId, draftId: draft9.id, typeId: d.typeId, reference: d.reference, issuingAuthority: d.authority, title: d.title ?? "", expiresOn: d.expiresOn ? dayToDate(d.expiresOn) : null, ratePercent: d.rate ?? null, createdAt: T(W(4), "09:30"),
        ...(d.values?.length ? { values: { create: d.values.map((vid) => ({ organisationId, registrationValueId: vid })) } } : {}),
      },
    });
  }
  const profile9 = await db.creditorProfile.create({
    data: {
      id: `${P}cpr9`, organisationId, supplierId: v9.id, version: 1, beneficiaryName: v9.name, beneficiaryAddress: `${v9.addressLine1}, ${v9.postcode} ${v9.city}`, beneficiaryIdentityNo: v9.no, beneficiaryContactPerson: v9.contact.name,
      beneficiaryTelephone: v9.contact.phone, beneficiaryEmail: v9.email, bankCode: "demo_bank_a", bankAccountNo: "998877665544", bankAccountTypeCode: "demo_current", bankSwiftCode: "DEMOMYKL", bankAddress: "1 Demo Bank Street, 00100 Demo City",
      enteredBySupplierAccountId: `${P}vacc9`, createdAt: T(W(2), "11:00"),
    },
  });
  await filesOf(
    [
      ...docs9.map((d, i) => file(`rscan${10 + i}`, scanTitle(d, v9.name), v9.name, `${P}dc1`, "Contract documents", "INTERNAL", iso(W(4), `10:${String(10 + i * 3).padStart(2, "0")}`), { purpose: "SUPPLIER_DRAFT_DOCUMENT", owner: { registrationDraftDocumentId: d.id }, ownerLabel: `${ref9} · registration draft` })),
      file("rscan20", `Bank statement for ${v9.name}`, v9.name, `${P}dc2`, "Certificates", "SULIT", iso(W(2), "11:10"), { purpose: "SUPPLIER_BANK_STATEMENT", owner: { creditorProfileId: profile9.id }, ownerLabel: `${ref9} · creditor's profile` }),
    ],
    `${P}rscanau2_`,
    `${P}vacc9`,
    v9.name,
  );

  // The product's own rule, over the draft as it stands: the demonstration holds only a registration the product would have let through.
  const actor9 = { organisationId, supplierId: v9.id, displayName: v9.contact.name };
  const view = await loadDraftView(db as never, actor9);
  const ctx = await contextFor(db as never, actor9, view.documents.flatMap((d) => d.valueIds));
  const texts = [ctx.texts.GIRO_AUTHORISATION ?? fail("no GIRO text"), ctx.texts.FALSE_DECLARATION ?? fail("no false-declaration text"), ctx.texts.TERMS_AND_CONDITIONS ?? fail("no terms text")];
  const notice = ctx.personalDataNotice ?? fail("no Personal Data Notice");
  // The GIRO tick is about the wording it was made on: the demonstration's supplier ticked the wording in force, so the draft holds its hash (as the wizard stores it).
  await db.registrationDraft.update({ where: { id: draft9.id }, data: { giroTextSha256: texts[0].sha256 } });
  const view9 = { ...view, giroTextSha256: texts[0].sha256 };
  const faults = blockingFaults(registrationFaults(draftOf(view9), ctx, [
    { kind: "GIRO_AUTHORISATION", textVersionId: texts[0].id, textSha256: texts[0].sha256, signatoryName: v9.contact.name, signatoryDesignation: v9.contact.designation, confirmed: true },
    { kind: "FALSE_DECLARATION", textVersionId: texts[1].id, textSha256: texts[1].sha256, signatoryName: v9.contact.name, signatoryDesignation: v9.contact.designation, confirmed: true },
    { kind: "TERMS_AND_CONDITIONS", textVersionId: texts[2].id, textSha256: texts[2].sha256, signatoryName: v9.contact.name, signatoryDesignation: v9.contact.designation, confirmed: true },
  ], notice.sha256));
  if (faults.length) fail(`the registration of ${v9.name} would be refused: ${faults.map((f) => f.code).join(", ")}`);

  // Sent: the application the supplier sent, its documents lodged by its own account with their files moved, the bank details sent, the declarations signed, the draft frozen.
  const sentAt = T(W(1), "10:45");
  const sentOn = todayIn(sentAt, tz)!;
  const app = await db.supplierApplication.create({ data: { id: `${P}vapp9`, organisationId, supplierId: v9.id, kind: "NEW", receivedOn: dayToDate(sentOn), channel: "PORTAL", recordedByPersonId: null, recordedAt: sentAt, submittedAt: sentAt, submittedBySupplierAccountId: `${P}vacc9`, createdAt: sentAt } });
  entry("SupplierApplication", app.id, `${ref9} · Application received ${sentOn}`, "CREATE", sentAt, diffFields(null, { kind: "New registration", channel: "Online, sent by the supplier", receivedOn: sentOn, sentBy: "the supplier's own portal account" }));
  for (const [i, d] of docs9.entries()) {
    const t = await typeRow(d.typeId);
    const values = d.values?.length ? await db.registrationValue.findMany({ where: { id: { in: d.values } } }) : [];
    const doc = await db.supplierDocument.create({
      data: {
        id: `${P}vdoc9${i + 1}`, organisationId, supplierId: v9.id, typeId: d.typeId, typeLabelSnapshot: t.nameEn, applicationId: app.id, reference: d.reference, issuingAuthority: d.authority, title: d.title ?? "",
        expiresOn: d.expiresOn ? dayToDate(d.expiresOn) : null, ratePercent: d.rate ?? null, lodgedOn: dayToDate(sentOn), recordedAt: sentAt, recordedByPersonId: null, recordedBySupplierAccountId: `${P}vacc9`,
        ...(values.length ? { values: { create: values.map((v) => ({ organisationId, registrationValueId: v.id, kind: v.kind, codeSnapshot: v.code, labelSnapshot: v.nameEn })) } } : {}),
      },
    });
    const attachment = await db.documentAttachment.findFirstOrThrow({ where: { registrationDraftDocumentId: d.id, purpose: "SUPPLIER_DRAFT_DOCUMENT", detachedAt: null } });
    await db.documentAttachment.update({ where: { id: attachment.id }, data: { detachedAt: sentAt, detachReason: "Moved to the supplier's document when the registration was sent" } });
    await db.documentAttachment.create({ data: { organisationId, purpose: "SUPPLIER_DOCUMENT", versionId: attachment.versionId, supplierDocumentId: doc.id, attachedAt: sentAt } });
    entry("SupplierDocument", doc.id, `${ref9} · ${d.title ? `${t.nameEn} · ${d.title}` : t.nameEn}`, "CREATE", sentAt, diffFields(null, { type: t.nameEn, title: d.title || null, reference: d.reference || null, expiresOn: d.expiresOn ?? null, ratePercent: d.rate ?? null, codes: values.length ? values.map((v) => `${v.code} — ${v.nameEn}`).join("; ") : null, files: 1, lodgedBy: "the supplier's own portal account" }));
  }
  await db.creditorProfile.update({ where: { id: profile9.id }, data: { submittedAt: sentAt } });
  entry("CreditorProfile", profile9.id, `${ref9} · Creditor's profile`, "UPDATE", sentAt, [{ field: "status", before: "being filled in", after: "version 1 sent, waiting for an officer to check it" }]);
  const declarationIds: { entity: string; id: string }[] = [{ entity: "SupplierApplication", id: app.id }];
  for (const [i, kind] of (["GIRO_AUTHORISATION", "FALSE_DECLARATION", "TERMS_AND_CONDITIONS"] as const).entries()) {
    const text = texts[i]!;
    const wording = frozenWording(text, org.name);
    const d = await db.registrationDeclaration.create({
      data: {
        id: `${P}vdecl9${i + 1}`, organisationId, applicationId: app.id, creditorProfileId: kind === "GIRO_AUTHORISATION" ? profile9.id : null, kind, textId: text.id, textVersion: text.version, textSha256: wording.sha256, frozenTextEn: wording.en, frozenTextMs: wording.ms,
        ...(kind === "TERMS_AND_CONDITIONS" ? { noticeSha256: notice.sha256, noticeFrozenEn: notice.en } : {}),
        signatoryName: v9.contact.name, signatoryDesignation: v9.contact.designation, signedOn: dayToDate(sentOn), signedAt: sentAt, signedBySupplierAccountId: `${P}vacc9`,
      },
    });
    declarationIds.push({ entity: "RegistrationDeclaration", id: d.id });
    entry("RegistrationDeclaration", d.id, `${ref9} · ${KIND_NAME[kind]}`, "CREATE", sentAt, diffFields(null, { wordingVersion: text.version, wordingFingerprint: wording.sha256.slice(0, 12), position: v9.contact.designation, signedOn: sentOn }));
  }
  // The signatures are the demo loader's, on the account's behalf, and say so: no one entered a password.
  for (const a of declarationIds) {
    await db.actAttribution.create({
      data: { id: `${P}laaseed_${a.entity}_${a.id}`, organisationId, entity: a.entity, entityId: a.id, slot: a.entity === "SupplierApplication" ? "submittedBySupplierAccount" : "signedBy", subjectSupplierAccountId: `${P}vacc9`, recordedBySystemLabel: "demo loader", mode: "RECORDED_ON_BEHALF", reason: DEMO_ATTRIBUTION_REASON },
    });
  }
  await db.registrationDraft.update({ where: { id: draft9.id }, data: { submittedAt: sentAt, version: { increment: 1 } } });
  entry("RegistrationDraft", draft9.id, `${ref9} · Registration draft`, "UPDATE", sentAt, [{ field: "status", before: "being filled in", after: "sent to the procurement office" }]);
  await flush();
}

// ------------------------------------------------------------------ the read-back

export async function checkRegistrationDemo(db: Db) {
  const orgId = await demoOrgId();
  const sent = await db.supplierApplication.findFirst({ where: { id: `${P}vapp9`, channel: "PORTAL", submittedAt: { not: null } }, include: { declarations: true, documents: true } });
  if (!sent) return fail("demo_vnd9's registration was not sent");
  if (sent.declarations.length !== 3 || sent.documents.length !== 7) fail(`demo_vnd9's registration holds ${sent.declarations.length} declarations and ${sent.documents.length} documents, not 3 and 7`);
  if ((await db.creditorProfile.count({ where: { supplierId: `${P}vnd9`, submittedAt: { not: null }, verification: "NOT_CHECKED" } })) !== 1) fail("demo_vnd9's bank details are not waiting for an officer");
  if ((await db.supplier.count({ where: { id: { in: [`${P}vnd8`, `${P}vnd9`] }, status: "APPLICANT" } })) !== 2) fail("the two online suppliers are not applicants");
  if ((await db.portalApplication.count({ where: { id: `${P}pap1`, status: "RECEIVED" } })) !== 1) fail("demo_pap1 is not waiting");
  const draft8 = await db.registrationDraft.findFirst({ where: { supplierId: `${P}vnd8`, submittedAt: null } });
  if (!draft8) fail("demo_vnd8 holds no draft");
  if ((await db.supplierAccount.count({ where: { organisationId: orgId, id: { in: [`${P}vacc8`, `${P}vacc9`] }, status: "PENDING_ACTIVATION" } })) !== 2) fail("the two online suppliers' accounts are not waiting for activation");
}
