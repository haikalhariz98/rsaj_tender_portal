/**
 * Demo data for 6.15a: the staff-side supplier register (plan 6.15 §6, as ruled: X-4, X-10, condition 5).
 * Invented throughout; every configured value is ASSUMED and none is a customer's figure, list or source
 * (X-10 d: no published CIDB/MOF list, no RSAJ period). Every row passes the checks of its act, judged by
 * the product's own functions on the rows as they stand when it is written; every act is dated relative
 * to the load day and never after it (X-10 a); only expiries and deadlines may be future.
 *
 * - Configuration (W(30)): entity types and countries (demo_slv1–5), values under 6.4's demo bodies
 *   (demo_rgv1–10: grades G1–G5 ranked 1–5 with ceilings shown only, two categories, two specialisations,
 *   two field codes), document types demo_sdt1–8 (one with its expiry switch left not set, to show it),
 *   the policy demo_spol1 (the verification notice), the `supplier` series demo_n21, the registration
 *   number's format demo_f6, and the demo matrix's rule demo_rule120 for supplier_registration (no value
 *   band: OD-2 A; the Head of Contract & Procurement approves).
 * - Suppliers (the names and numbers of the 6.5–6.8 demo's parties and 6.11's awards, so a2 can link them):
 *   demo_vnd1 Contoh Bina, every document verified, registered; demo_vnd2 Demo Paip Services, its tax
 *   clearance 20 days from expiry; demo_vnd3 Teladan Mekanikal, its contractor certificate expired under a
 *   renewal lodged and not yet verified; demo_vnd4 Rekaan Maju and demo_vnd5 Demo Civil Works, registered
 *   (a2 suspends and blacklists them); demo_vnd6 Sampel Kejuruteraan, an applicant whose resubmission
 *   deadline has passed (the lapse not yet recorded); demo_vnd7 Sampel Engineering, registered, with a
 *   renewal application sent for decision and its route pending.
 * - Routes: demo_ai120–124 approve vnd1–5, demo_ai127 approves vnd7, demo_ai128 is vnd7's pending
 *   renewal (ai125 and ai126 stay the plan's for a2's blacklisting and special permission).
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { dayToDate, instantAt, todayIn } from "../src/lib/dates";
import { formatDate } from "../src/lib/format";
import { ORGANISATION_CODE } from "../src/lib/org";
import { calendarOf } from "./demo-window";
import { DEMO_ACTOR } from "./demo-actor";
import { demoOrgId } from "./demo-org";

type Db = PrismaClient;
const P = "demo_";
const demoRef = { startsWith: P };
type Entry = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; changes: object[]; reason: string; unattributed: boolean };

const OFFICER = { id: `${P}p4`, name: "Daniel Anak Jelani" };
const APPROVER = { id: `${P}p3`, name: "Chen Wei Ling" };
const SOURCE = "Demo supplier register guide (invented)";

function refuse(what: string, fs: readonly { code: string; level: string }[]) {
  const b = fs.filter((f) => f.level === "block");
  if (b.length) throw new Error(`Demo 6.15 ${what} refused: ${b.map((f) => f.code).join(", ")}`);
}
const fail = (what: string): never => {
  throw new Error(`Demo 6.15: ${what}.`);
};

// ------------------------------------------------------------------ configuration

const LISTS = [
  { id: `${P}slv1`, list: "ENTITY_TYPE" as const, code: "private_limited", nameEn: "Private limited company", nameMs: "Syarikat sendirian berhad", sortOrder: 1 },
  { id: `${P}slv2`, list: "ENTITY_TYPE" as const, code: "partnership", nameEn: "Partnership", nameMs: "Perkongsian", sortOrder: 2 },
  { id: `${P}slv3`, list: "ENTITY_TYPE" as const, code: "sole_proprietor", nameEn: "Sole proprietor", nameMs: "Pemilikan tunggal", sortOrder: 3 },
  { id: `${P}slv4`, list: "COUNTRY" as const, code: "demo_home", nameEn: "Demo Country", nameMs: "Negara Demo", sortOrder: 1 },
  { id: `${P}slv5`, list: "COUNTRY" as const, code: "demo_abroad", nameEn: "Another Demo Country", nameMs: "Negara Demo Lain", sortOrder: 2 },
];

const VALUES = [
  { id: `${P}rgv1`, bodyId: `${P}rb2`, kind: "GRADE" as const, code: "G1", nameEn: "Grade G1", rank: 1, valueCeiling: "200000.00" },
  { id: `${P}rgv2`, bodyId: `${P}rb2`, kind: "GRADE" as const, code: "G2", nameEn: "Grade G2", rank: 2, valueCeiling: "500000.00" },
  { id: `${P}rgv3`, bodyId: `${P}rb2`, kind: "GRADE" as const, code: "G3", nameEn: "Grade G3", rank: 3, valueCeiling: "1000000.00" },
  { id: `${P}rgv4`, bodyId: `${P}rb2`, kind: "GRADE" as const, code: "G4", nameEn: "Grade G4", rank: 4, valueCeiling: "3000000.00" },
  { id: `${P}rgv5`, bodyId: `${P}rb2`, kind: "GRADE" as const, code: "G5", nameEn: "Grade G5", rank: 5, valueCeiling: null },
  { id: `${P}rgv6`, bodyId: `${P}rb2`, kind: "CATEGORY" as const, code: "CIV", nameEn: "Civil works", rank: null, valueCeiling: null },
  { id: `${P}rgv7`, bodyId: `${P}rb2`, kind: "CATEGORY" as const, code: "MEC", nameEn: "Mechanical works", rank: null, valueCeiling: null },
  { id: `${P}rgv8`, bodyId: `${P}rb2`, kind: "SPECIALISATION" as const, code: "CIV01", nameEn: "Pipe laying", parentCode: "CIV", rank: null, valueCeiling: null },
  { id: `${P}rgv9`, bodyId: `${P}rb2`, kind: "SPECIALISATION" as const, code: "MEC02", nameEn: "Pump installation", parentCode: "MEC", rank: null, valueCeiling: null },
  { id: `${P}rgv10`, bodyId: `${P}rb3`, kind: "FIELD_CODE" as const, code: "FC100", nameEn: "Pipes and fittings", rank: null, valueCeiling: null },
  { id: `${P}rgv11`, bodyId: `${P}rb3`, kind: "FIELD_CODE" as const, code: "FC200", nameEn: "Treatment chemicals", rank: null, valueCeiling: null },
];

/// The document types: three mandatory, four optional, one with its expiry left not set (it blocks lodging that type, and says so).
const TYPES = [
  { id: `${P}sdt1`, code: "demo_company_cert", nameEn: "Company registration certificate", nameMs: "Sijil pendaftaran syarikat", bodyId: `${P}rb1`, valueKinds: [] as string[], expires: false, mandatoryAtRegistration: true, notApplicableAllowed: false },
  { id: `${P}sdt2`, code: "demo_contractor_cert", nameEn: "Contractor registration certificate", nameMs: "Sijil pendaftaran kontraktor", bodyId: `${P}rb2`, valueKinds: ["GRADE", "CATEGORY", "SPECIALISATION"], expires: true, mandatoryAtRegistration: true, notApplicableAllowed: true },
  { id: `${P}sdt3`, code: "demo_supplier_cert", nameEn: "Supplier registration certificate", nameMs: "Sijil pendaftaran pembekal", bodyId: `${P}rb3`, valueKinds: ["FIELD_CODE"], expires: true, mandatoryAtRegistration: false, notApplicableAllowed: true },
  { id: `${P}sdt4`, code: "demo_status_cert", nameEn: "Status certificate", nameMs: "Sijil taraf", bodyId: null, valueKinds: [], expires: true, mandatoryAtRegistration: false, notApplicableAllowed: true },
  { id: `${P}sdt5`, code: "demo_tax_clearance", nameEn: "Tax clearance letter", nameMs: "Surat pelepasan cukai", bodyId: null, valueKinds: [], expires: true, mandatoryAtRegistration: true, notApplicableAllowed: false },
  { id: `${P}sdt6`, code: "demo_sales_tax", nameEn: "Sales tax registration", nameMs: "Pendaftaran cukai jualan", bodyId: null, valueKinds: [], expires: false, mandatoryAtRegistration: false, notApplicableAllowed: true },
  { id: `${P}sdt7`, code: "demo_bank_reference", nameEn: "Bank reference letter", nameMs: "Surat rujukan bank", bodyId: null, valueKinds: [], expires: true, mandatoryAtRegistration: false, notApplicableAllowed: false },
  { id: `${P}sdt8`, code: "demo_broker_licence", nameEn: "Insurance broker licence", nameMs: "Lesen broker insurans", bodyId: null, valueKinds: [], expires: null, mandatoryAtRegistration: false, notApplicableAllowed: true },
];

const triWords = (v: boolean | null, yes: string, no: string) => (v == null ? "Not set" : v ? yes : no);

/// The register's configuration, before any supplier is recorded.
export async function configureSuppliersDemo(db: Db, organisationId: string) {
  const { VALUE_KIND_LABEL } = await import("../src/lib/suppliers/labels");
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone ?? fail("the organisation's time zone is not set");
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  const at = instantAt(W(30), "09:00", tz)!;
  const later = (m: number) => new Date(at.getTime() + m * 60_000);
  const trail: Entry[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason = "") => trail.push({ id: `${P}vcau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });

  for (const [i, l] of LISTS.entries()) {
    await db.supplierListValue.create({ data: { ...l, organisationId, provenance: "ASSUMED" } });
    entry("SupplierListValue", l.id, `${l.list === "ENTITY_TYPE" ? "Entity type" : "Country"} · ${l.nameEn}`, "CREATE", later(i), diffFields(null, { name: l.nameEn, nameInMalay: l.nameMs, whereItComesFrom: "Assumed" }));
  }
  for (const [i, v] of VALUES.entries()) {
    await db.registrationValue.create({ data: { id: v.id, organisationId, bodyId: v.bodyId, kind: v.kind, code: v.code, nameEn: v.nameEn, parentCode: "parentCode" in v ? v.parentCode : null, rank: v.rank, valueCeiling: v.valueCeiling, ceilingProvenance: v.valueCeiling ? "ASSUMED" : null, governingSource: SOURCE, provenance: "ASSUMED", sortOrder: i + 1 } });
    entry("RegistrationValue", v.id, `Registration value · ${v.bodyId === `${P}rb2` ? "the Demo Contractors Board" : "the Demo Supplier Register"} · ${v.nameEn}`, "CREATE", later(10 + i), diffFields(null, { kindOfValue: VALUE_KIND_LABEL[v.kind].en, name: v.nameEn, rank: v.rank, valueCeiling: v.valueCeiling, governingSource: SOURCE, whereItComesFrom: "Assumed" }));
  }
  for (const [i, t] of TYPES.entries()) {
    await db.supplierDocumentType.create({ data: { ...t, valueKinds: t.valueKinds as never, organisationId, governingSource: SOURCE, provenance: "ASSUMED", sortOrder: i + 1 } });
    entry("SupplierDocumentType", t.id, `Supplier document type · ${t.nameEn}`, "CREATE", later(30 + i), diffFields(null, { name: t.nameEn, nameInMalay: t.nameMs, expires: triWords(t.expires, "Carries an expiry", "Does not expire"), mandatoryAtRegistration: triWords(t.mandatoryAtRegistration, "Mandatory for every registration", "Not mandatory"), notApplicableAllowed: triWords(t.notApplicableAllowed, "May be recorded as not applicable", "May not be recorded as not applicable"), governingSource: SOURCE, whereItComesFrom: "Assumed" }));
  }
  if (!(await db.supplierPolicy.findUnique({ where: { organisationId } }))) {
    const notice = { verificationNoticeEn: "Documents you lodge are not checked automatically: an officer checks each against its original before your registration is decided (demo wording, invented).", verificationNoticeMs: "Dokumen yang dikemukakan tidak disemak secara automatik: pegawai menyemak setiap satu dengan dokumen asal sebelum pendaftaran diputuskan (teks demo, rekaan)." };
    await db.supplierPolicy.create({ data: { id: `${P}spol1`, organisationId, ...notice, noticeProvenance: "ASSUMED", governingSource: SOURCE } });
    entry("SupplierPolicy", `${P}spol1`, "Supplier register · policy", "CREATE", later(50), diffFields(null, { verificationNotice: notice.verificationNoticeEn, verificationNoticeInMalay: notice.verificationNoticeMs, noticeFrom: "Assumed", governingSource: SOURCE }));
  }
  if (!(await db.numberingSeries.findFirst({ where: { organisationId, key: "supplier" } }))) {
    await db.numberingSeries.create({ data: { id: `${P}n21`, organisationId, key: "supplier", nameEn: "Suppliers", pattern: "DEMO/SUP/{SERIAL}/{YEAR}", padding: 4, resetOn: "NEVER", nextSerial: 1, serialPeriod: "", provenance: "ASSUMED" } });
    entry("NumberingSeries", `${P}n21`, "Numbering · Suppliers", "CREATE", later(51), diffFields(null, { name: "Suppliers", pattern: "DEMO/SUP/{SERIAL}/{YEAR}", provenance: "ASSUMED" }));
  }
  // The public application form's own series (a stranger's application takes no supplier reference) and its demo settings.
  if (!(await db.numberingSeries.findFirst({ where: { organisationId, key: "portal_application" } }))) {
    await db.numberingSeries.create({ data: { id: `${P}n22`, organisationId, key: "portal_application", nameEn: "Online supplier applications", pattern: "DEMO/APP/{SERIAL}/{YEAR}", padding: 4, resetOn: "CALENDAR_YEAR", nextSerial: 1, serialPeriod: "", provenance: "ASSUMED" } });
    entry("NumberingSeries", `${P}n22`, "Numbering · Online supplier applications", "CREATE", later(51), diffFields(null, { name: "Online supplier applications", pattern: "DEMO/APP/{SERIAL}/{YEAR}", provenance: "ASSUMED" }));
  }
  if (!(await db.codeFormat.findFirst({ where: { organisationId, key: "supplier_registration_no" } }))) {
    await db.codeFormat.create({ data: { id: `${P}f6`, organisationId, key: "supplier_registration_no", pattern: "\\d{12} \\(\\d{6}-[A-Z]\\)|[A-Z]{2,4}-?\\d{4,7}-[A-Z]", example: "201001000101 (000101-A)", description: "Twelve digits with the old number in brackets, or an older letter-prefixed number (demo, invented).", provenance: "ASSUMED" } });
    entry("CodeFormat", `${P}f6`, "Code format · supplier registration number", "CREATE", later(52), diffFields(null, { example: "201001000101 (000101-A)", provenance: "ASSUMED" }));
  }
  // OD-2 A: one rule on the domain, with no value band (a supplier matter is routed on no value).
  await db.authorityRule.create({ data: { id: `${P}rule120`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.supplier.registration", domain: "supplier_registration", labelEn: "Supplier registration", approverCode: "HOD_CP", clause: "DEMO 7.1", sortOrder: 120, generateCoreChain: false, coreChainReason: "One office approves a supplier's registration: nothing to generate (demo)." } });
  entry("AuthorityRule", `${P}rule120`, "Supplier registration", "CREATE", later(53), diffFields(null, { rule: "Supplier registration", approver: "Head of Contract & Procurement", act: "Approve", clause: "DEMO 7.1", routedOn: "No value band (supplier matters are not routed on a value)" }));
  // ---- a2: the standing reasons, the standing rules, two more rules on the demo matrix, the expiry reminder rule.
  const REASONS = [
    { id: `${P}srs1`, code: "demo_documents_not_in_order", appliesTo: "SUSPEND" as const, nameEn: "Statutory documents not in order", nameMs: "Dokumen berkanun tidak teratur" },
    { id: `${P}srs2`, code: "demo_under_investigation", appliesTo: "SUSPEND" as const, nameEn: "Under investigation", nameMs: "Dalam siasatan" },
    { id: `${P}srs3`, code: "demo_false_declaration", appliesTo: "BLACKLIST" as const, nameEn: "False declaration in a bid", nameMs: "Akuan palsu dalam tawaran" },
    { id: `${P}srs4`, code: "demo_failed_to_commence", appliesTo: "BLACKLIST" as const, nameEn: "Failed to commence work after award", nameMs: "Gagal memulakan kerja selepas anugerah" },
  ];
  for (const [i, x] of REASONS.entries()) {
    await db.standingReason.create({ data: { ...x, organisationId, governingSource: SOURCE, provenance: "ASSUMED", sortOrder: i + 1 } });
    entry("StandingReason", x.id, `Standing reason · ${x.nameEn}`, "CREATE", later(60 + i), diffFields(null, { givenFor: x.appliesTo === "SUSPEND" ? "Suspension" : "Blacklisting", reason: x.nameEn, reasonInMalay: x.nameMs, governingSource: SOURCE, whereItComesFrom: "Assumed" }));
  }
  {
    // The bands, the first-offence period and the restriction's evidence are set (invented, ASSUMED); the
    // closing-day rule, suspension on lapse, a sale's need of the register and the ineligible bidder's
    // consequence are left not set, to show what each holds back (OD-4..OD-7).
    const rules = { criticalDays: 30, warningDays: 60, upcomingDays: 90, bandsProvenance: "ASSUMED" as const, blacklistFirstOffenceMonths: 60, blacklistProvenance: "ASSUMED" as const, restrictionEvidenceTypeId: `${P}sdt4`, restrictionProvenance: "ASSUMED" as const };
    await db.supplierPolicy.update({ where: { organisationId }, data: rules });
    // Demo wording and figures, invented and ASSUMED: a customer writes its own notice and sets its own limits.
    const intake = { personalDataNoticeEn: "The details you enter are used only to review your application to join the supplier register. Only officers of the procurement office see them. They are kept while the application is considered and erased once it is decided. To ask for access or a correction, contact the procurement office quoting your reference (demo wording, invented).", personalDataNoticeMs: "Butiran yang anda masukkan hanya digunakan untuk menyemak permohonan anda menyertai daftar pembekal. Hanya pegawai pejabat perolehan melihatnya. Ia disimpan semasa permohonan dipertimbangkan dan dipadam selepas diputuskan. Untuk meminta akses atau pembetulan, hubungi pejabat perolehan dengan menyatakan rujukan anda (teks demo, rekaan).", personalDataProvenance: "ASSUMED" as const, portalDailyLimit: 100, portalDailyLimitPerNumber: 3, portalLimitProvenance: "ASSUMED" as const };
    await db.supplierPolicy.update({ where: { organisationId }, data: intake });
    entry("SupplierPolicy", `${P}spol1`, "Supplier register · online applications", "UPDATE", later(66), diffFields({ personalDataNotice: "Not set", personalDataNoticeInMalay: "Not set", noticeFrom: "Not set", applicationsPerDay: "Not set", applicationsPerNumberPerDay: "Not set", limitsFrom: "Not set" }, { personalDataNotice: intake.personalDataNoticeEn, personalDataNoticeInMalay: intake.personalDataNoticeMs, noticeFrom: "Assumed", applicationsPerDay: 100, applicationsPerNumberPerDay: 3, limitsFrom: "Assumed" }));
    entry("SupplierPolicy", `${P}spol1`, "Supplier register · standing rules", "UPDATE", later(65), diffFields({ expiryBands: "Not set", firstOffenceMonths: "Not set", restrictionEvidence: "Not set" }, { expiryBands: "critical within 30 days, warning within 60, upcoming within 90", bandsFrom: "Assumed", firstOffenceMonths: 60, periodFrom: "Assumed", restrictionEvidence: "Status certificate", restrictionFrom: "Assumed" }));
  }
  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule121`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.supplier.blacklist", domain: "supplier_blacklist", labelEn: "Supplier blacklisting, or its lifting", approverCode: "CEO", clause: "DEMO 7.2", sortOrder: 121, generateCoreChain: false, coreChainReason: "The Chief Executive decides a blacklisting alone (demo)." },
      { id: `${P}rule122`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.special.permission", domain: "special_permission", labelEn: "Special permission", approverCode: "HOD_CP", clause: "DEMO 7.3", sortOrder: 122, generateCoreChain: false, coreChainReason: "One office approves a special permission: nothing to generate (demo)." },
    ],
  });
  entry("AuthorityRule", `${P}rule121`, "Supplier blacklisting, or its lifting", "CREATE", later(66), diffFields(null, { rule: "Supplier blacklisting, or its lifting", approver: "Chief Executive", act: "Approve", clause: "DEMO 7.2", routedOn: "No value band (supplier matters are not routed on a value)" }));
  entry("AuthorityRule", `${P}rule122`, "Special permission", "CREATE", later(67), diffFields(null, { rule: "Special permission", approver: "Head of Contract & Procurement", act: "Approve", clause: "DEMO 7.3", routedOn: "No value band" }));
  await db.notificationRule.create({ data: { id: `${P}nr7`, organisationId, eventKey: "supplier.document.expiring", nameEn: "A supplier's document is expiring", recipientRoleCodes: ["HOD_CP"], reminderOffsetDays: [90, 60, 30, 7], provenance: "ASSUMED", notes: "Demo (invented). Shown on the register, never sent.", sortOrder: 7 } });
  entry("NotificationRule", `${P}nr7`, "Notification · A supplier's document is expiring", "CREATE", later(68), diffFields(null, { name: "A supplier's document is expiring", remindDaysBefore: "90, 60, 30, 7", provenance: "ASSUMED" }));
  await db.auditEntry.createMany({ data: trail as never });
}

// ------------------------------------------------------------------ the acts

type DocDef = { type: string; reference?: string; authority?: string; issuedOn?: string; validFrom?: string; expiresOn?: string; values?: string[]; notApplicable?: boolean; verified?: "VERIFIED" | "NOT_IN_ORDER" | null; renews?: string };

class Acts {
  trail: Entry[] = [];
  n = 0;
  scan = 0;
  constructor(readonly db: Db, readonly org: string, readonly tz: string, readonly L: string) {}
  entry(entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason = "") {
    this.trail.push({ id: `${P}vau${++this.n}`, organisationId: this.org, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  }
  at(day: string, time: string) {
    return instantAt(day, time, this.tz)!;
  }
  async flush() {
    await this.db.auditEntry.createMany({ data: this.trail as never });
    this.trail = [];
  }

  async config() {
    const { loadSupplierConfig } = await import("../src/lib/suppliers/repo");
    return loadSupplierConfig(this.org, this.db as never);
  }

  /// recordApplication, as the action judges it.
  async record(id: string, appId: string, contactId: string, s: { name: string; no: string; entity: string; country: string; address: string; email: string; contact: { name: string; designation: string; email: string; phone: string } }, receivedOn: string, declarationSignedOn: string | null, epayment: string | null, when: Date) {
    const { applicationFaults, normaliseRegistrationNo } = await import("../src/lib/suppliers/identity");
    const { issueReference } = await import("../src/lib/numbering/issue");
    const cfg = await this.config();
    const today = this.dayOf(when);
    const key = normaliseRegistrationNo(s.no);
    const dup = await this.db.supplier.findFirst({ where: { organisationId: this.org, registrationNoKey: key } });
    refuse(`recording ${s.name}`, applicationFaults({ registeredName: s.name, registrationNo: s.no, entityTypeCode: s.entity, countryCode: s.country, registeredAddress: s.address, companyEmail: s.email, contact: s.contact, receivedOn, channel: "COUNTER", declarationSignedOn, recorderActive: true }, { today, formatPattern: cfg.format?.pattern ?? null, entityTypeCodes: cfg.liveCodes("ENTITY_TYPE", today), countryCodes: cfg.liveCodes("COUNTRY", today), duplicate: dup ? { reference: dup.reference, name: dup.registeredName } : null }));
    // Sign-in programme Phase 0: drawn by the one issuer, under the series lock, as the product draws it.
    const reference = await this.db.$transaction((tx) => issueReference(tx, this.org, "supplier", dayToDate(today)));
    await this.db.supplier.create({ data: { id, organisationId: this.org, reference, registeredName: s.name, registrationNo: s.no, registrationNoKey: key, entityTypeCode: s.entity, countryCode: s.country, registeredAddress: s.address, companyEmail: s.email, createdAt: when } });
    await this.db.supplierContact.create({ data: { id: contactId, organisationId: this.org, supplierId: id, ...s.contact, isPrimary: true, createdAt: when } });
    await this.db.supplierApplication.create({ data: { id: appId, organisationId: this.org, supplierId: id, kind: "NEW", receivedOn: dayToDate(receivedOn), channel: "COUNTER", recordedByPersonId: OFFICER.id, recordedAt: when, declarationSignedOn: declarationSignedOn ? dayToDate(declarationSignedOn) : null, epaymentFormReceivedOn: epayment ? dayToDate(epayment) : null, createdAt: when } });
    this.entry("Supplier", id, `${reference} · ${s.name}`, "CREATE", when, diffFields(null, { reference, registeredName: s.name, registrationNo: s.no, formatChecked: "Matches the configured format", entityType: cfg.listName("ENTITY_TYPE", s.entity), country: cfg.listName("COUNTRY", s.country), registeredAddress: s.address, companyEmail: s.email, status: "Applicant" }));
    this.entry("SupplierContact", contactId, `${reference} · Primary contact`, "CREATE", when, diffFields(null, { contactName: s.contact.name, contactDesignation: s.contact.designation || null, contactEmail: s.contact.email || null, contactPhone: s.contact.phone || null, primary: true }));
    this.entry("SupplierApplication", appId, `${reference} · Application received ${formatDate(receivedOn)}`, "CREATE", when, diffFields(null, { kind: "First registration", receivedOn, channel: "Over the counter", recordedBy: OFFICER.name, recordedOnBehalf: "not signed", declarationSignedOn, epaymentFormReceivedOn: epayment }));
    return reference;
  }

  dayOf(when: Date) {
    return todayIn(when, this.tz)!;
  }

  /// lodgeDocument, as the action judges it.
  async lodge(supplierId: string, id: string, d: DocDef, when: Date) {
    const { lodgeFaults } = await import("../src/lib/suppliers/documents");
    const { documentFacts, typeFacts } = await import("../src/lib/suppliers/repo");
    const today = this.dayOf(when);
    const typeRow = await this.db.supplierDocumentType.findUniqueOrThrow({ where: { id: d.type } });
    const chain = (await this.db.supplierDocument.findMany({ where: { supplierId, typeId: d.type } })).map(documentFacts);
    const values = d.values?.length ? await this.db.registrationValue.findMany({ where: { id: { in: d.values } } }) : [];
    const sup = await this.db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { reference: true, status: true, applications: { where: { status: { in: ["RECEIVED", "RESUBMISSION_REQUESTED"] }, lapsedRecordedAt: null }, select: { id: true } } } });
    refuse(`lodging ${typeRow.nameEn} for ${supplierId}`, lodgeFaults({ typeId: d.type, reference: d.reference ?? "", issuingAuthority: d.authority ?? "", issuedOn: d.issuedOn ?? null, validFrom: d.validFrom ?? null, expiresOn: d.expiresOn ?? null, notApplicable: !!d.notApplicable, values: values.map((v) => ({ id: v.id, bodyId: v.bodyId, kind: v.kind as never, retiredOn: null })) }, { today, type: typeFacts(typeRow), chain, renews: d.renews ? (chain.find((x) => x.id === d.renews) ?? null) : null, renewing: !!d.renews, supplierRejected: sup.status === "REJECTED" && sup.applications.length === 0 }));
    await this.db.supplierDocument.create({
      data: {
        id, organisationId: this.org, supplierId, typeId: d.type, typeLabelSnapshot: typeRow.nameEn, applicationId: sup.applications[0]?.id ?? null,
        reference: d.reference ?? "", issuingAuthority: d.authority ?? "", issuedOn: d.issuedOn ? dayToDate(d.issuedOn) : null, validFrom: d.validFrom ? dayToDate(d.validFrom) : null, expiresOn: d.expiresOn ? dayToDate(d.expiresOn) : null,
        notApplicable: !!d.notApplicable, supersedesId: d.renews ?? null, lodgedOn: dayToDate(today), recordedAt: when, recordedByPersonId: OFFICER.id,
        values: { create: values.map((v) => ({ id: `${id}_v${v.code}`, organisationId: this.org, registrationValueId: v.id, kind: v.kind, codeSnapshot: v.code, labelSnapshot: v.nameEn })) },
      },
    });
    this.entry("SupplierDocument", id, `${sup.reference} · ${typeRow.nameEn}${d.reference ? ` ${d.reference}` : ""}`, "CREATE", when, diffFields(null, { documentType: typeRow.nameEn, documentReference: d.reference ?? null, issuingAuthority: d.authority ?? null, issuedOn: d.issuedOn ?? null, validFrom: d.validFrom ?? null, expiresOn: d.expiresOn ?? null, notApplicable: d.notApplicable || null, values: values.length ? values.map((v) => v.nameEn).join(", ") : null, renews: d.renews ? "the document it renews" : null, lodgedOn: today, recordedBy: OFFICER.name, recordedOnBehalf: "not signed" }));
  }

  /// A scan attached to a supplier's document or application, as attachDocument judges it (the owner open, the purpose its own).
  async attach(owner: { supplierDocumentId?: string; supplierApplicationId?: string }, purpose: "SUPPLIER_DOCUMENT" | "SUPPLIER_DECLARATION" | "SUPPLIER_EPAYMENT_FORM", title: string, ownerLabel: string, when: Date) {
    const { demoPdf, writeDemoDocs } = await import("./demo-documents");
    const docId = `${P}vscan${++this.scan}`;
    const at = when.toISOString().slice(0, 16);
    const sulit = purpose === "SUPPLIER_EPAYMENT_FORM";
    const e = await writeDemoDocs(this.db, this.org, [{
      id: docId, title, classId: sulit ? `${P}dc2` : `${P}dc1`, className: sulit ? "Certificates" : "Contract documents", classification: sulit ? "SULIT" : "INTERNAL", createdAt: at,
      versions: [{ id: `${docId}v1`, n: 1, bytes: demoPdf([`${title} (demo scan)`, "Handed in on paper; scanned by the officer.", sulit ? "SULIT: never downloadable before sign-in." : "Not restricted until sign-in."]), mediaType: "application/pdf", filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: this.dayOf(when), storedAt: at }],
      attachments: [{ id: `${docId}a1`, purpose, owner, ownerLabel, versionId: `${docId}v1`, at }],
    }], `${P}${docId.slice(P.length)}au`, OFFICER);
    await e.flush();
  }

  /// verifyDocument, as the action judges it.
  async verify(id: string, state: "VERIFIED" | "NOT_IN_ORDER", when: Date, note = "") {
    const { verifyFaults } = await import("../src/lib/suppliers/documents");
    const { isLive } = await import("../src/lib/documents/evidence");
    const d = await this.db.supplierDocument.findUniqueOrThrow({ where: { id }, include: { supplier: { select: { reference: true } }, attachments: { where: { purpose: "SUPPLIER_DOCUMENT" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } } } });
    const today = this.dayOf(when);
    refuse(`checking ${id}`, verifyFaults({ state, personActive: true, verifiedOn: today, note }, { verification: d.verification as never, lodgedOn: d.lodgedOn.toISOString().slice(0, 10), notApplicable: d.notApplicable, scanned: d.attachments.some(isLive) }, today));
    await this.db.supplierDocument.update({ where: { id }, data: { verification: state, verifiedByPersonId: OFFICER.id, verifiedOn: dayToDate(today), verifiedAt: when, verificationNote: note } });
    this.entry("SupplierDocument", id, `${d.supplier.reference} · ${d.typeLabelSnapshot}${d.reference ? ` ${d.reference}` : ""}`, "UPDATE", when, diffFields({ verification: "Not checked" }, { verification: state === "VERIFIED" ? "Verified" : "Not in order", verifiedBy: OFFICER.name, verifiedOn: today, recordedOnBehalf: "not signed", verificationNote: note || null }), note);
  }

  /// submitForDecision, as the action judges it: the file approvable, the route resolved from the demo matrix with the sender in mind.
  async submit(appId: string, routeId: string, when: Date) {
    const { submitFaults } = await import("../src/lib/suppliers/review");
    const { supplierRoute, supplierHolders } = await import("../src/lib/suppliers/route");
    const { loadIssue } = await import("../src/lib/authority/load");
    const { loadRoster, loadDelegations } = await import("../src/lib/people/load");
    const { ableToAct } = await import("../src/lib/requisition/holders");
    const { REGISTRATION_MATTER } = await import("../src/lib/suppliers/labels");
    const { routeCoreFields, stepOrigin } = await import("../src/lib/authority/core-routing");
    const { boundaryOperatorFor } = await import("../src/lib/authority/resolve");
    const today = this.dayOf(when);
    const { a, f } = await this.file(appId, today);
    refuse(`sending ${appId}`, submitFaults(f, today));
    const issue = (await loadIssue(ORGANISATION_CODE, dayToDate(today), undefined, null, this.db as never)) ?? fail("no matrix in force");
    const roster = await loadRoster(ORGANISATION_CODE, this.db as never);
    const delegations = await loadDelegations(ORGANISATION_CODE, this.db as never);
    const people = new Map(roster.people.map((p) => [p.id, p]));
    const res = supplierRoute(issue.matrix, "supplier_registration", a.kind, { id: OFFICER.id, holds: (c) => supplierHolders(c, roster, delegations, today).holderIds.includes(OFFICER.id), ableToAct: (c) => ableToAct(supplierHolders(c, roster, delegations, today), OFFICER.id, 0n, (pid) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable) }, REGISTRATION_MATTER);
    if (res.refusal) fail(`the route for ${appId}: ${res.refusal.en}`);
    const rule = issue.matrix.rules.find((x) => x.ruleKey === res.ruleKey)!;
    await this.db.approvalInstance.create({
      data: {
        id: routeId, organisationId: this.org, matterKind: "SUPPLIER", supplierApplicationId: appId, domain: "supplier_registration", cond: a.kind, value: null,
        authorityMatrixId: issue.id, matrixLabel: issue.label, ruleKey: rule.ruleKey, ruleLabel: rule.labelEn, ruleClause: rule.clause,
        boundaryValue: String(issue.matrix.policy.boundaryValue), boundaryInclusive: issue.matrix.policy.boundaryInclusive, ruleFollowsBoundarySwitch: rule.followsBoundarySwitch, boundaryOperator: boundaryOperatorFor(rule, issue.matrix.policy),
        checkedAgainstMatrix: true, warnings: res.warnings as never, status: "PENDING", openedAt: dayToDate(today),
        rejectionSnapshotAt: when, rejectionKind: "RETURN_TO_ORIGINATOR", rejectionProvenance: "ASSUMED", ...routeCoreFields(res.core, when), createdAt: when,
        steps: { create: res.chain.map((s, i) => ({ id: `${routeId}_s${i + 1}`, sequence: i + 1, roleCode: s.roleCode, roleLabel: issue.matrix.roles[s.roleCode]?.nameEn ?? s.roleCode, act: s.act, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
      },
    });
    await this.db.supplierApplication.update({ where: { id: appId }, data: { submittedByPersonId: OFFICER.id } });
    this.entry("ApprovalInstance", routeId, `${a.supplier.reference} · Registration approval route`, "CREATE", when, diffFields(null, { matter: `${a.kind === "NEW" ? "First registration" : "Renewal of registration"} of ${a.supplier.registeredName}`, matrix: issue.label, rule: rule.labelEn, routedOn: "No value (supplier matters are not routed on a value)", route: res.chain.map((s) => `${issue.matrix.roles[s.roleCode]?.nameEn} (approve)`).join(" → "), ifRefused: "the application stays open" }));
    this.entry("SupplierApplication", appId, `${a.supplier.reference} · Application received ${formatDate(a.receivedOn.toISOString().slice(0, 10))}`, "UPDATE", when, diffFields({ sentBy: null }, { sentBy: OFFICER.name, recordedOnBehalf: "not signed" }));
  }

  async file(appId: string, today: string) {
    const { fileFacts } = await import("../src/lib/suppliers/review");
    const { documentFacts, typeFacts } = await import("../src/lib/suppliers/repo");
    const { isLive } = await import("../src/lib/documents/evidence");
    const a = await this.db.supplierApplication.findUniqueOrThrow({ where: { id: appId }, include: { supplier: { select: { id: true, reference: true, registeredName: true, status: true } }, routes: { select: { status: true } }, attachments: { select: { purpose: true, detachedAt: true, version: { select: { withdrawnAt: true } } } } } });
    const types = await this.db.supplierDocumentType.findMany({ where: { organisationId: this.org } });
    const docs = await this.db.supplierDocument.findMany({ where: { supplierId: a.supplierId } });
    // FR-TRM-017 (fix S-2): a blacklisting in effect stops the approval, as the action reads it.
    // M-1: and the cancellation in effect, as the action reads it (the kind asked again at approval).
    const { reading } = await this.reading(a.supplierId, today);
    const blacklist = reading.blacklist;
    const f = fileFacts({ kind: a.kind as never, supplierStatus: a.supplier.status as never, cancellation: reading.cancellation, status: a.status as never, lapsedRecordedAt: a.lapsedRecordedAt, resubmitBy: a.resubmitBy ? a.resubmitBy.toISOString().slice(0, 10) : null, routePending: a.routes.some((r) => r.status === "PENDING"), declarationSignedOn: a.declarationSignedOn ? a.declarationSignedOn.toISOString().slice(0, 10) : null, declarationScanned: a.attachments.some((x) => x.purpose === "SUPPLIER_DECLARATION" && isLive(x)), blacklist }, types.map(typeFacts), docs.map(documentFacts), today);
    return { a, f, types };
  }

  /// decideRegistrationStep on the route's one step, approved: deciderFaults, then the file judged again, then the application approved.
  async approve(appId: string, routeId: string, when: Date) {
    const { deciderFaults, NO_EARLIER_RECORDERS } = await import("../src/lib/requisition/holders");
    const { approveFaults, decisionSnapshot } = await import("../src/lib/suppliers/review");
    const { supplierHolders } = await import("../src/lib/suppliers/route");
    const { loadRoster, loadDelegations } = await import("../src/lib/people/load");
    const { personDecisionWrite } = await import("../src/lib/authority/decided-step");
    const today = this.dayOf(when);
    const inst = await this.db.approvalInstance.findUniqueOrThrow({ where: { id: routeId }, include: { steps: { orderBy: { sequence: "asc" } } } });
    const roster = await loadRoster(ORGANISATION_CODE, this.db as never);
    const delegations = await loadDelegations(ORGANISATION_CODE, this.db as never);
    const { a, f, types } = await this.file(appId, today);
    for (const step of inst.steps) {
      const check = deciderFaults(step, { today, holders: supplierHolders(step.roleCode!, roster, delegations, today), person: { id: APPROVER.id, isActive: true }, requesterId: a.submittedByPersonId ?? "", endorserIds: [], earlier: NO_EARLIER_RECORDERS, otherDeciderIds: inst.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!), earlierDone: true, decidedOn: today, openedOn: inst.openedAt.toISOString().slice(0, 10), value: 0n });
      if (check.faults.length) fail(`deciding ${step.id}: ${check.faults.join(", ")}`);
      await this.db.approvalStep.update({ where: { id: step.id }, data: personDecisionWrite({ decision: "DONE", person: APPROVER, decidedOn: dayToDate(today), delegationId: null, reason: "", recordedAt: when }) });
      this.entry("ApprovalStep", step.id, `${a.supplier.reference} · Registration approval route · ${step.roleLabel}`, "UPDATE", when, diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: APPROVER.name, decidedOn: today, recordedOnBehalf: "not signed" }));
    }
    refuse(`approving ${appId}`, approveFaults(f, today));
    await this.db.approvalInstance.update({ where: { id: routeId }, data: { status: "APPROVED", closedAt: when } });
    this.entry("ApprovalInstance", routeId, `${a.supplier.reference} · Registration approval route`, "UPDATE", when, diffFields({ status: "PENDING" }, { status: "APPROVED" }));
    await this.db.supplierApplication.update({ where: { id: appId }, data: { status: "APPROVED", decidedAt: when } });
    const { DOCUMENT_STATE_LABEL } = await import("../src/lib/suppliers/labels");
    const snap = decisionSnapshot(f, today, (label) => types.find((t) => t.nameEn === label)?.provenance ?? null);
    const decId = `${P}vdec${++this.n}`;
    await this.db.applicationDecision.create({ data: { id: decId, organisationId: this.org, applicationId: appId, outcome: "APPROVE", decidedByPersonId: APPROVER.id, decidedOn: dayToDate(today), decidedAt: when, policySnapshot: snap as never } });
    const label = `${a.supplier.reference} · Application received ${formatDate(a.receivedOn.toISOString().slice(0, 10))}`;
    this.entry("ApplicationDecision", decId, label, "CREATE", when, diffFields(null, { outcome: "Approved", decidedBy: APPROVER.name, decidedOn: today, recordedOnBehalf: "not signed", judgedUnder: snap.mandatory.map((m) => `${m.type}: ${DOCUMENT_STATE_LABEL[m.state].en}`).join("; ") }));
    this.entry("SupplierApplication", appId, label, "UPDATE", when, diffFields({ status: "RECEIVED" }, { status: "APPROVED" }));
    if (a.kind === "NEW") {
      await this.db.supplier.update({ where: { id: a.supplierId }, data: { status: "REGISTERED", registeredOn: dayToDate(today) } });
      this.entry("Supplier", a.supplierId, `${a.supplier.reference} · ${a.supplier.registeredName}`, "UPDATE", when, diffFields({ status: "Applicant", registeredOn: null }, { status: "Registered", registeredOn: today }));
    }
  }

  /// decideApplication (RESUBMIT), as the action judges it.
  async resubmit(appId: string, items: { documentId?: string; typeId?: string; remarks: string }[], resubmitBy: string, when: Date) {
    const { decisionFaults } = await import("../src/lib/suppliers/review");
    const today = this.dayOf(when);
    const a = await this.db.supplierApplication.findUniqueOrThrow({ where: { id: appId }, include: { supplier: { select: { reference: true } }, routes: { select: { status: true } } } });
    const docs = await this.db.supplierDocument.findMany({ where: { supplierId: a.supplierId } });
    const types = await this.db.supplierDocumentType.findMany({ where: { organisationId: this.org } });
    refuse(`asking ${appId} to resubmit`, decisionFaults({ outcome: "RESUBMIT", remarks: "", resubmitBy, items: items.map((i) => ({ documentId: i.documentId ?? null, typeId: i.typeId ?? null, remarks: i.remarks })), personActive: true }, { status: a.status as never, lapsedRecordedAt: a.lapsedRecordedAt, resubmitBy: null, routePending: a.routes.some((r) => r.status === "PENDING") }, { today, documentIds: docs.map((d) => d.id), typeIds: types.map((t) => t.id) }));
    const decId = `${P}vdec${++this.n}`;
    await this.db.applicationDecision.create({
      data: {
        id: decId, organisationId: this.org, applicationId: appId, outcome: "RESUBMIT", resubmitBy: dayToDate(resubmitBy), decidedByPersonId: OFFICER.id, decidedOn: dayToDate(today), decidedAt: when,
        items: { create: items.map((i, k) => ({ id: `${decId}_i${k + 1}`, organisationId: this.org, supplierDocumentId: i.documentId ?? null, documentTypeId: i.documentId ? null : (i.typeId ?? null), labelSnapshot: i.documentId ? docs.find((d) => d.id === i.documentId)!.typeLabelSnapshot : types.find((t) => t.id === i.typeId)!.nameEn, remarks: i.remarks })) },
      },
    });
    await this.db.supplierApplication.update({ where: { id: appId }, data: { status: "RESUBMISSION_REQUESTED", resubmitBy: dayToDate(resubmitBy) } });
    const label = `${a.supplier.reference} · Application received ${formatDate(a.receivedOn.toISOString().slice(0, 10))}`;
    this.entry("ApplicationDecision", decId, label, "CREATE", when, diffFields(null, { outcome: "Resubmission requested", resubmitBy, items: items.map((i) => i.remarks).join(" | "), decidedBy: OFFICER.name, decidedOn: today, recordedOnBehalf: "not signed" }));
    this.entry("SupplierApplication", appId, label, "UPDATE", when, diffFields({ status: "RECEIVED", resubmitBy: null }, { status: "RESUBMISSION_REQUESTED", resubmitBy }));
  }

  /// setErpVendorCode, as the action judges it: entered by hand (the manual vendor master), never synced by an adapter.
  async vendorCode(supplierId: string, code: string, when: Date) {
    const { manualVendorMaster, VENDOR_CODE_FORMAT_KEY } = await import("../src/lib/integration/vendor-master");
    const { formatOrgDateTime } = await import("../src/lib/format");
    const sup = await this.db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { reference: true, registeredName: true, status: true, erpVendorCode: true } });
    const format = await this.db.codeFormat.findFirst({ where: { organisationId: this.org, key: VENDOR_CODE_FORMAT_KEY }, select: { pattern: true } });
    const taken = await this.db.supplier.findFirst({ where: { organisationId: this.org, erpVendorCode: code, NOT: { id: supplierId } }, select: { id: true } });
    const faults = manualVendorMaster.check(code, { pattern: format?.pattern ?? null, taken: !!taken, registered: sup.status === "REGISTERED" });
    if (faults.length || sup.erpVendorCode) fail(`entering ${supplierId}'s vendor code: ${faults.join(", ") || "already set"}`);
    await this.db.supplier.update({ where: { id: supplierId }, data: { erpVendorCode: code, erpSyncedAt: when } });
    this.entry("Supplier", supplierId, `${sup.reference} · ${sup.registeredName}`, "UPDATE", when, diffFields({ erpVendorCode: null }, { erpVendorCode: code, recordedOnBehalf: `entered ${formatOrgDateTime(when, this.tz)}, not synced by an adapter` }));
  }

  // ---------------------------------------------------------------- a2 acts

  /// linkPartyToSupplier, as the action judges it: the party's awards follow its link.
  async linkParty(partyId: string, supplierId: string, reason: string, when: Date) {
    const { linkPartyFaults } = await import("../src/lib/suppliers/link");
    const party = await this.db.exerciseParty.findUniqueOrThrow({ where: { id: partyId }, select: { id: true, name: true, registrationNo: true, vendorId: true, exerciseId: true, exercise: { select: { reference: true } }, awards: { select: { id: true, reference: true, vendorId: true } } } });
    const s = await this.db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { id: true, reference: true, registeredName: true, registrationNo: true, status: true } });
    const others = await this.db.exerciseParty.findMany({ where: { exerciseId: party.exerciseId, NOT: { id: partyId } }, select: { name: true, vendorId: true } });
    refuse(`linking ${partyId}`, linkPartyFaults(party, s, reason, others));
    await this.db.exerciseParty.update({ where: { id: partyId }, data: { vendorId: supplierId } });
    this.entry("ExerciseParty", partyId, `${party.exercise.reference} · Party ${party.name}`, "UPDATE", when, diffFields({ supplier: null }, { supplier: `${s.reference} · ${s.registeredName}`, linkReason: reason || null, linkedBy: OFFICER.name, recordedOnBehalf: "not signed" }), reason);
    for (const a of party.awards) {
      if (a.vendorId) fail(`award ${a.id} already names a supplier`);
      await this.db.award.update({ where: { id: a.id }, data: { vendorId: supplierId } });
      this.entry("Award", a.id, `${a.reference} · Awardee's supplier`, "UPDATE", when, diffFields({ supplier: null }, { supplier: `${s.reference} · ${s.registeredName}`, linkedBy: `${OFFICER.name}, through the awardee party's link` }));
    }
  }

  /// linkAwardToSupplier, as the action judges it (an award with no party).
  async linkAward(awardId: string, supplierId: string, when: Date) {
    const { linkAwardFaults } = await import("../src/lib/suppliers/link");
    const award = await this.db.award.findUniqueOrThrow({ where: { id: awardId }, select: { id: true, reference: true, awardeePartyId: true, awardeeRegistrationNo: true, vendorId: true } });
    const s = await this.db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { id: true, reference: true, registeredName: true, registrationNo: true, status: true } });
    refuse(`linking ${awardId}`, linkAwardFaults(award, s, ""));
    await this.db.award.update({ where: { id: awardId }, data: { vendorId: supplierId } });
    this.entry("Award", awardId, `${award.reference} · Awardee's supplier`, "UPDATE", when, diffFields({ supplier: null }, { supplier: `${s.reference} · ${s.registeredName}`, linkedBy: OFFICER.name, recordedOnBehalf: "not signed" }));
  }

  async reading(supplierId: string, on: string) {
    const { standingOf } = await import("../src/lib/suppliers/standing-repo");
    return (await standingOf(supplierId, this.org, on, this.db as never))!;
  }

  /// suspendSupplier, as the action judges it.
  async suspend(id: string, supplierId: string, reasonId: string, effectiveOn: string, flagged: string[], note: string, when: Date) {
    const { suspendFaults } = await import("../src/lib/suppliers/reinstate");
    const today = this.dayOf(when);
    const st = await this.reading(supplierId, today);
    const s = await this.db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { reference: true, registeredOn: true, documents: { select: { id: true, typeLabelSnapshot: true, reference: true } } } });
    const reason = await this.db.standingReason.findUniqueOrThrow({ where: { id: reasonId } });
    refuse(`suspending ${supplierId}`, suspendFaults({ reasonId, effectiveOn, personActive: true, flaggedDocumentIds: flagged }, { today, status: st.status, registeredOn: s.registeredOn ? s.registeredOn.toISOString().slice(0, 10) : null, reading: st.reading, reason: { appliesTo: reason.appliesTo, retiredOn: null }, documentIds: s.documents.map((d) => d.id) }));
    await this.db.standingEvent.create({ data: { id, organisationId: this.org, supplierId, kind: "SUSPEND", reasonId, reasonSnapshot: reason.nameEn, effectiveOn: dayToDate(effectiveOn), flaggedDocumentIds: flagged, note, recordedByPersonId: OFFICER.id, recordedAt: when } });
    const labels = s.documents.filter((d) => flagged.includes(d.id)).map((d) => `${d.typeLabelSnapshot}${d.reference ? ` ${d.reference}` : ""}`);
    this.entry("StandingEvent", id, `${s.reference} · Suspension`, "CREATE", when, diffFields(null, { standing: "Suspended", reason: reason.nameEn, effectiveOn, flaggedDocuments: labels.join(", ") || null, note: note || null, recordedBy: OFFICER.name, recordedOnBehalf: "not signed" }), note);
  }

  /// A route on a supplier domain, opened as openSupplierRoute does (no value; the requester never approves).
  async openRoute(routeId: string, owner: { standingRequestId: string } | { specialPermissionId: string }, domain: string, cond: string | null, what: { en: string; ms: string }, routeLabel: string, matter: string, ifRefused: string, when: Date) {
    const { supplierRoute, supplierHolders } = await import("../src/lib/suppliers/route");
    const { loadIssue } = await import("../src/lib/authority/load");
    const { loadRoster, loadDelegations } = await import("../src/lib/people/load");
    const { ableToAct } = await import("../src/lib/requisition/holders");
    const { routeCoreFields, stepOrigin } = await import("../src/lib/authority/core-routing");
    const { boundaryOperatorFor } = await import("../src/lib/authority/resolve");
    const today = this.dayOf(when);
    const issue = (await loadIssue(ORGANISATION_CODE, dayToDate(today), undefined, null, this.db as never)) ?? fail("no matrix in force");
    const roster = await loadRoster(ORGANISATION_CODE, this.db as never);
    const delegations = await loadDelegations(ORGANISATION_CODE, this.db as never);
    const people = new Map(roster.people.map((p) => [p.id, p]));
    const res = supplierRoute(issue.matrix, domain, cond, { id: OFFICER.id, holds: (c) => supplierHolders(c, roster, delegations, today).holderIds.includes(OFFICER.id), ableToAct: (c) => ableToAct(supplierHolders(c, roster, delegations, today), OFFICER.id, 0n, (pid) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable) }, what);
    if (res.refusal) fail(`the route ${routeId}: ${res.refusal.en}`);
    const rule = issue.matrix.rules.find((x) => x.ruleKey === res.ruleKey)!;
    await this.db.approvalInstance.create({
      data: {
        id: routeId, organisationId: this.org, matterKind: "SUPPLIER", ...owner, domain, cond, value: null,
        authorityMatrixId: issue.id, matrixLabel: issue.label, ruleKey: rule.ruleKey, ruleLabel: rule.labelEn, ruleClause: rule.clause,
        boundaryValue: String(issue.matrix.policy.boundaryValue), boundaryInclusive: issue.matrix.policy.boundaryInclusive, ruleFollowsBoundarySwitch: rule.followsBoundarySwitch, boundaryOperator: boundaryOperatorFor(rule, issue.matrix.policy),
        checkedAgainstMatrix: true, warnings: res.warnings as never, status: "PENDING", openedAt: dayToDate(today),
        rejectionSnapshotAt: when, rejectionKind: "RETURN_TO_ORIGINATOR", rejectionProvenance: "ASSUMED", ...routeCoreFields(res.core, when), createdAt: when,
        steps: { create: res.chain.map((s, i) => ({ id: `${routeId}_s${i + 1}`, sequence: i + 1, roleCode: s.roleCode, roleLabel: issue.matrix.roles[s.roleCode]?.nameEn ?? s.roleCode, act: s.act, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
      },
    });
    this.entry("ApprovalInstance", routeId, routeLabel, "CREATE", when, diffFields(null, { matter, matrix: issue.label, rule: rule.labelEn, routedOn: "No value (supplier matters are not routed on a value)", route: res.chain.map((s) => `${issue.matrix.roles[s.roleCode]?.nameEn} (approve)`).join(" → "), ifRefused, askedBy: OFFICER.name, recordedOnBehalf: "not signed" }));
  }

  /// decideSupplierStep on every step of a route, approved by `who`: deciderFaults on each.
  async approveRoute(routeId: string, who: { id: string; name: string }, requesterId: string, routeLabel: string, when: Date) {
    const { deciderFaults, NO_EARLIER_RECORDERS } = await import("../src/lib/requisition/holders");
    const { supplierHolders } = await import("../src/lib/suppliers/route");
    const { loadRoster, loadDelegations } = await import("../src/lib/people/load");
    const { personDecisionWrite } = await import("../src/lib/authority/decided-step");
    const today = this.dayOf(when);
    const inst = await this.db.approvalInstance.findUniqueOrThrow({ where: { id: routeId }, include: { steps: { orderBy: { sequence: "asc" } } } });
    const roster = await loadRoster(ORGANISATION_CODE, this.db as never);
    const delegations = await loadDelegations(ORGANISATION_CODE, this.db as never);
    for (const step of inst.steps) {
      const check = deciderFaults(step, { today, holders: supplierHolders(step.roleCode!, roster, delegations, today), person: { id: who.id, isActive: true }, requesterId, endorserIds: [], earlier: NO_EARLIER_RECORDERS, otherDeciderIds: [], earlierDone: true, decidedOn: today, openedOn: inst.openedAt.toISOString().slice(0, 10), value: 0n });
      if (check.faults.length) fail(`deciding ${step.id}: ${check.faults.join(", ")}`);
      await this.db.approvalStep.update({ where: { id: step.id }, data: personDecisionWrite({ decision: "DONE", person: who, decidedOn: dayToDate(today), delegationId: null, reason: "", recordedAt: when }) });
      this.entry("ApprovalStep", step.id, `${routeLabel} · ${step.roleLabel}`, "UPDATE", when, diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: who.name, decidedOn: today, recordedOnBehalf: "not signed" }));
    }
    await this.db.approvalInstance.update({ where: { id: routeId }, data: { status: "APPROVED", closedAt: when } });
    this.entry("ApprovalInstance", routeId, routeLabel, "UPDATE", when, diffFields({ status: "PENDING" }, { status: "APPROVED" }));
  }

  /// requestBlacklisting, as the action judges it, then its route opened.
  async requestBlacklisting(requestId: string, routeId: string, supplierId: string, reasonId: string, note: string, when: Date) {
    const { requestBlacklistFaults } = await import("../src/lib/suppliers/blacklist");
    const { BLACKLIST_MATTER, STANDING_REFUSED_DECIDED_BY } = await import("../src/lib/suppliers/labels");
    const today = this.dayOf(when);
    const st = await this.reading(supplierId, today);
    const s = await this.db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { reference: true, registeredName: true } });
    const reason = await this.db.standingReason.findUniqueOrThrow({ where: { id: reasonId } });
    refuse(`asking to blacklist ${supplierId}`, requestBlacklistFaults({ reasonId, personActive: true, sourceAward: null }, { today, supplierId, status: st.status, standing: st.reading.standing, reason: { appliesTo: reason.appliesTo, retiredOn: null }, requests: [] }));
    await this.db.standingRequest.create({ data: { id: requestId, organisationId: this.org, supplierId, kind: "BLACKLIST", reasonId, reasonSnapshot: reason.nameEn, note, requestedByPersonId: OFFICER.id, requestedAt: when } });
    this.entry("StandingRequest", requestId, `${s.reference} · Blacklisting asked for`, "CREATE", when, diffFields(null, { askedFor: "Blacklisting", reason: reason.nameEn, note: note || null, askedBy: OFFICER.name, recordedOnBehalf: "not signed" }), note);
    await this.openRoute(routeId, { standingRequestId: requestId }, "supplier_blacklist", "BLACKLIST", BLACKLIST_MATTER, `${s.reference} · Blacklisting route`, `Blacklisting of ${s.registeredName}`, STANDING_REFUSED_DECIDED_BY, when);
  }

  /// recordBlacklisting, as the action judges it: the period from the policy now, frozen on the event.
  async recordBlacklisting(eventId: string, requestId: string, effectiveOn: string, when: Date) {
    const { recordFaults, nextOffenceNo } = await import("../src/lib/suppliers/blacklist");
    const today = this.dayOf(when);
    const req = await this.db.standingRequest.findUniqueOrThrow({ where: { id: requestId }, include: { supplier: { select: { id: true, reference: true, standingEvents: true } }, routes: { include: { steps: true } } } });
    const st = await this.reading(req.supplierId, today);
    const route = req.routes[0];
    const approvedOn = route.steps.map((x) => x.decidedOn!.toISOString().slice(0, 10)).sort().at(-1)!;
    const policy = await this.db.supplierPolicy.findUniqueOrThrow({ where: { organisationId: this.org } });
    const offenceNo = nextOffenceNo(req.supplier.standingEvents);
    const r = recordFaults({ effectiveOn, personActive: true }, { today, request: { kind: "BLACKLIST", route: route.status === "APPROVED" ? "APPROVED" : "PENDING", approvedOn, recorded: false, withdrawn: false }, standing: st.reading.standing, offenceNo, months: policy.blacklistFirstOffenceMonths });
    refuse(`recording ${requestId}`, r.faults);
    const ends = r.period?.kind === "ENDS" ? r.period : null;
    await this.db.standingEvent.create({ data: { id: eventId, organisationId: this.org, supplierId: req.supplierId, kind: "BLACKLIST", reasonId: req.reasonId, reasonSnapshot: req.reasonSnapshot, effectiveOn: dayToDate(effectiveOn), endsOn: ends ? dayToDate(ends.endsOn) : null, offenceNo, periodMonths: ends?.months ?? null, requestId, note: req.note, recordedByPersonId: OFFICER.id, recordedAt: when } });
    this.entry("StandingEvent", eventId, `${req.supplier.reference} · Blacklisting`, "CREATE", when, diffFields(null, { standing: "Blacklisted", reason: req.reasonSnapshot, effectiveOn, offence: "First offence", period: ends ? `${ends.months} months` : "Until further notice", lastBlacklistedDay: ends?.lastDay ?? null, endsOn: ends?.endsOn ?? null, recordedBy: OFFICER.name, recordedOnBehalf: "not signed" }));
  }

  /// recordSpecialPermission (internal approval), then its route; grantSpecialPermission once approved.
  async specialPermission(id: string, routeId: string, partyId: string, bodyIds: string[], when: Date) {
    const { specialPermissionFaults } = await import("../src/lib/suppliers/permission");
    const { PERMISSION_MATTER, PERMISSION_REFUSED_DECIDED_BY } = await import("../src/lib/suppliers/labels");
    const today = this.dayOf(when);
    const party = await this.db.exerciseParty.findUniqueOrThrow({ where: { id: partyId }, include: { exercise: { select: { id: true, reference: true, window: { select: { specialPermissionOffered: true } }, registrationRequirements: { orderBy: { sortOrder: "asc" } } } }, specialPermissions: { include: { routes: { select: { status: true, createdAt: true } } } } } });
    if (!party.vendorId) fail(`${partyId} is not linked`);
    // The requirement on the board whose grade it relaxes (the demo Contractors Board), not the companies registry.
    const board = await this.db.registrationBody.findUniqueOrThrow({ where: { id: bodyIds[0] }, select: { code: true } });
    const req = party.exercise.registrationRequirements.find((r) => r.bodyCode === board.code) ?? fail(`${party.exercise.reference} states no requirement on that board`);
    const bodies = await this.db.registrationBody.findMany({ where: { organisationId: this.org, retiredOn: null } });
    refuse(`special permission for ${partyId}`, specialPermissionFaults({ requirementId: req.id, relaxes: "GRADE", grantingBodyIds: bodyIds, internalApproval: true, existingClassConfirmed: true, goodRecordConfirmed: true, personActive: true }, { today, offered: party.exercise.window?.specialPermissionOffered ?? null, requirementIds: party.exercise.registrationRequirements.map((r) => r.id), bodyIds: bodies.map((b) => b.id), existing: party.specialPermissions.map((p) => ({ requirementId: p.requirementId, relaxes: p.relaxes, granted: p.grantedOn != null, route: p.routes.some((r) => r.status === "PENDING") ? ("PENDING" as const) : p.routes.length ? ("APPROVED" as const) : ("NONE" as const) })) }));
    const { asHeading } = await import("../src/lib/suppliers/labels");
    const reqLabel = `${asHeading(req.bodyLabelSnapshot)}${req.qualifiers.trim() ? ` (${req.qualifiers.trim()})` : ""}`;
    const labels = bodyIds.map((b) => bodies.find((x) => x.id === b)!.labelEn);
    await this.db.specialPermission.create({ data: { id, organisationId: this.org, exerciseId: party.exercise.id, partyId, requirementId: req.id, requirementLabelSnapshot: reqLabel, relaxes: "GRADE", grantingBodyIds: bodyIds, grantingBodyLabels: labels, internalApproval: true, existingClassConfirmed: true, goodRecordConfirmed: true, note: "The firm holds the grade below; the board's letter permits this one exercise (demo).", requestedByPersonId: OFFICER.id, requestedAt: when } });
    const permLabel = `${party.exercise.reference} · Special permission for ${party.name}`;
    this.entry("SpecialPermission", id, permLabel, "CREATE", when, diffFields(null, { requirement: reqLabel, relaxes: "The grade", grantedByBodies: labels.join(", "), internalApproval: "Yes, on its route", existingClassConfirmed: "Confirmed", goodRecordConfirmed: "Confirmed", recordedBy: OFFICER.name, recordedOnBehalf: "not signed" }));
    await this.openRoute(routeId, { specialPermissionId: id }, "special_permission", null, PERMISSION_MATTER, `${permLabel} · route`, `Special permission for ${party.name} on ${party.exercise.reference}`, PERMISSION_REFUSED_DECIDED_BY, when);
    return permLabel;
  }

  async grantPermission(id: string, grantedOn: string, when: Date) {
    const { grantFaults } = await import("../src/lib/suppliers/permission");
    const today = this.dayOf(when);
    const perm = await this.db.specialPermission.findUniqueOrThrow({ where: { id }, include: { party: { select: { name: true } }, exercise: { select: { reference: true, window: { select: { specialPermissionOffered: true } } } }, routes: { include: { steps: true } } } });
    const approvedOn = perm.routes[0].steps.map((x) => x.decidedOn!.toISOString().slice(0, 10)).sort().at(-1)!;
    refuse(`granting ${id}`, grantFaults({ grantedOn, personActive: true }, { today, offered: perm.exercise.window?.specialPermissionOffered ?? null, granted: !!perm.grantedOn, internalApproval: true, route: perm.routes[0].status === "APPROVED" ? "APPROVED" : "PENDING", approvedOn }));
    await this.db.specialPermission.update({ where: { id }, data: { grantedOn: dayToDate(grantedOn), grantedByPersonId: OFFICER.id, grantedAt: when } });
    this.entry("SpecialPermission", id, `${perm.exercise.reference} · Special permission for ${perm.party.name}`, "UPDATE", when, diffFields({ grantedOn: null }, { grantedOn, grantedBy: OFFICER.name, recordedOnBehalf: "not signed" }));
  }

  /// openApplication (a renewal), as the action judges it.
  async openRenewal(supplierId: string, appId: string, receivedOn: string, declarationSignedOn: string, when: Date) {
    const { openApplicationFaults } = await import("../src/lib/suppliers/review");
    const { receiptFaults } = await import("../src/lib/suppliers/identity");
    const sup = await this.db.supplier.findUniqueOrThrow({ where: { id: supplierId }, include: { applications: { where: { status: { in: ["RECEIVED", "RESUBMISSION_REQUESTED"] }, lapsedRecordedAt: null } } } });
    const { reading } = await this.reading(supplierId, this.dayOf(when));
    refuse(`opening a renewal for ${supplierId}`, [...openApplicationFaults("RENEWAL", sup.status as never, sup.applications.length > 0, reading.blacklist, reading.cancellation), ...receiptFaults({ receivedOn, channel: "POST", declarationSignedOn, recorderActive: true }, this.dayOf(when))]);
    await this.db.supplierApplication.create({ data: { id: appId, organisationId: this.org, supplierId, kind: "RENEWAL", receivedOn: dayToDate(receivedOn), channel: "POST", recordedByPersonId: OFFICER.id, recordedAt: when, declarationSignedOn: dayToDate(declarationSignedOn), createdAt: when } });
    this.entry("SupplierApplication", appId, `${sup.reference} · Application received ${formatDate(receivedOn)}`, "CREATE", when, diffFields(null, { kind: "Renewal of registration", receivedOn, channel: "By post", recordedBy: OFFICER.name, recordedOnBehalf: "not signed", declarationSignedOn }));
  }
}

// ------------------------------------------------------------------ the suppliers

const COMPANY = (n: number) => ({ type: `${P}sdt1`, reference: `CR-${n}`, authority: "Demo Companies Registry" });

export async function loadSuppliersDemo(db: Db, organisationId: string) {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone ?? fail("the organisation's time zone is not set");
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  const D = (n: number) => {
    const t = dayToDate(L);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const acts = new Acts(db, organisationId, tz, L);
  const T = (d: string, time: string) => acts.at(d, time);
  const address = (n: number) => `${n} Demo Industrial Park, 00000 Demo City`;

  // A registered supplier: recorded, its documents lodged with their scans and checked, the declaration scanned, sent, approved.
  const registered = async (k: number, s: { name: string; no: string; email: string; contact: { name: string; designation: string; email: string; phone: string } }, start: number, docs: (DocDef & { id: string })[], epayment = false) => {
    const sid = `${P}vnd${k}`;
    const app = `${P}vapp${k}`;
    const ref = await acts.record(sid, app, `${P}vct${k}`, { ...s, entity: "private_limited", country: "demo_home", address: address(k) }, W(start), W(start + 1), epayment ? W(start) : null, T(W(start), "09:30"));
    for (const [i, d] of docs.entries()) {
      await acts.lodge(sid, d.id, d, T(W(start - 1), `10:${String(10 + i).padStart(2, "0")}`));
      if (!d.notApplicable) await acts.attach({ supplierDocumentId: d.id }, "SUPPLIER_DOCUMENT", `${d.type === `${P}sdt1` ? "Company certificate" : d.type === `${P}sdt2` ? "Contractor certificate" : d.type === `${P}sdt5` ? "Tax clearance" : d.type === `${P}sdt3` ? "Supplier certificate" : "Status certificate"} ${d.reference ?? ""} for ${s.name}`.trim(), `${ref} · document`, T(W(start - 1), `11:${String(10 + i).padStart(2, "0")}`));
      if (d.verified) await acts.verify(d.id, d.verified, T(W(start - 2), `09:${String(10 + i).padStart(2, "0")}`));
    }
    await acts.attach({ supplierApplicationId: app }, "SUPPLIER_DECLARATION", `Signed declaration of ${s.name}`, `${ref} · application`, T(W(start - 2), "14:00"));
    if (epayment) await acts.attach({ supplierApplicationId: app }, "SUPPLIER_EPAYMENT_FORM", `E-Payment form of ${s.name}`, `${ref} · application`, T(W(start - 2), "14:05"));
    return { sid, app, ref };
  };
  const decide = async (k: number, app: string, route: string, start: number) => {
    await acts.submit(app, route, T(W(start - 3), "10:00"));
    await acts.approve(app, route, T(W(start - 4), "11:00"));
  };

  // vnd1: every document verified, an E-Payment form received (its scan SULIT).
  const v1 = await registered(1, { name: "Contoh Bina Sdn Bhd", no: "201001000101 (000101-A)", email: "tender@contohbina.invalid", contact: { name: "Azman Bin Hashim", designation: "Director", email: "azman@contohbina.invalid", phone: "07-000 1101" } }, 40, [
    { id: `${P}vdoc1`, ...COMPANY(101), verified: "VERIFIED" },
    { id: `${P}vdoc2`, type: `${P}sdt2`, reference: "CB-G5-0101", authority: "Demo Contractors Board", issuedOn: D(-200), validFrom: D(-200), expiresOn: D(530), values: [`${P}rgv5`, `${P}rgv6`, `${P}rgv8`], verified: "VERIFIED" },
    { id: `${P}vdoc3`, type: `${P}sdt5`, reference: "TC-0101", authority: "Demo Tax Office", issuedOn: D(-60), expiresOn: D(300), verified: "VERIFIED" },
    { id: `${P}vdoc4`, type: `${P}sdt4`, reference: "ST-0101", authority: "Demo Status Office", issuedOn: D(-100), expiresOn: D(400), verified: "VERIFIED" },
  ], true);
  await decide(1, v1.app, `${P}ai120`, 40);

  // vnd2: its tax clearance 20 days from expiry (a2 reads it CRITICAL).
  const v2 = await registered(2, { name: "Demo Paip Services", no: "201501000104 (000104-D)", email: "office@demopaip.invalid", contact: { name: "Lim Kok Wai", designation: "Manager", email: "", phone: "07-000 1104" } }, 36, [
    { id: `${P}vdoc5`, ...COMPANY(104), verified: "VERIFIED" },
    { id: `${P}vdoc6`, type: `${P}sdt2`, reference: "DP-G4-0104", authority: "Demo Contractors Board", issuedOn: D(-300), expiresOn: D(420), values: [`${P}rgv4`, `${P}rgv6`, `${P}rgv8`], verified: "VERIFIED" },
    { id: `${P}vdoc7`, type: `${P}sdt5`, reference: "TC-0104", authority: "Demo Tax Office", issuedOn: D(-345), expiresOn: D(20), verified: "VERIFIED" },
    { id: `${P}vdoc8`, type: `${P}sdt3`, reference: "SR-0104", authority: "Demo Supplier Register", issuedOn: D(-100), expiresOn: D(260), values: [`${P}rgv10`], verified: "VERIFIED" },
  ]);
  await decide(2, v2.app, `${P}ai121`, 36);
  // vnd1 and vnd2: their vendor codes entered by hand from the finance system (the rest show "not in the finance system").
  await acts.vendorCode(v1.sid, "V-100101", T(W(30), "15:00"));
  await acts.vendorCode(v2.sid, "V-100104", T(W(30), "15:10"));

  // vnd3: the contractor certificate expired 10 days ago; its renewal lodged 3 working days ago, not yet verified.
  const v3 = await registered(3, { name: "Teladan Mekanikal Sdn Bhd", no: "200801000105 (000105-T)", email: "admin@teladan.invalid", contact: { name: "Rosnah Binti Kassim", designation: "Contracts executive", email: "rosnah@teladan.invalid", phone: "" } }, 32, [
    { id: `${P}vdoc9`, ...COMPANY(105), verified: "VERIFIED" },
    { id: `${P}vdoc10`, type: `${P}sdt2`, reference: "TM-G3-0105", authority: "Demo Contractors Board", issuedOn: D(-375), expiresOn: D(-10), values: [`${P}rgv3`, `${P}rgv7`, `${P}rgv9`], verified: "VERIFIED" },
    { id: `${P}vdoc11`, type: `${P}sdt5`, reference: "TC-0105", authority: "Demo Tax Office", issuedOn: D(-90), expiresOn: D(270), verified: "VERIFIED" },
  ]);
  await decide(3, v3.app, `${P}ai122`, 32);
  await acts.lodge(v3.sid, `${P}vdoc12`, { type: `${P}sdt2`, reference: "TM-G3-0105-R", authority: "Demo Contractors Board", issuedOn: W(4), expiresOn: D(355), values: [`${P}rgv3`, `${P}rgv7`, `${P}rgv9`], renews: `${P}vdoc10` }, T(W(3), "10:00"));
  await acts.attach({ supplierDocumentId: `${P}vdoc12` }, "SUPPLIER_DOCUMENT", "Contractor certificate TM-G3-0105-R for Teladan Mekanikal Sdn Bhd", `${v3.ref} · document`, T(W(3), "10:20"));

  // vnd4 and vnd5: registered in good order (a2 suspends vnd4 and blacklists vnd5).
  const v4 = await registered(4, { name: "Rekaan Maju Construction", no: "DM0000106-K", email: "tender@rekaanmaju.invalid", contact: { name: "Suresh Pillai", designation: "Partner", email: "suresh@rekaanmaju.invalid", phone: "07-000 1106" } }, 28, [
    { id: `${P}vdoc13`, ...COMPANY(106), verified: "VERIFIED" },
    { id: `${P}vdoc14`, type: `${P}sdt2`, reference: "RM-G4-0106", authority: "Demo Contractors Board", issuedOn: D(-150), expiresOn: D(580), values: [`${P}rgv4`, `${P}rgv6`], verified: "VERIFIED" },
    { id: `${P}vdoc15`, type: `${P}sdt5`, reference: "TC-0106", authority: "Demo Tax Office", issuedOn: D(-70), expiresOn: D(320), verified: "VERIFIED" },
  ]);
  await decide(4, v4.app, `${P}ai123`, 28);
  const v5 = await registered(5, { name: "Demo Civil Works Sdn Bhd", no: "DEMO-0001-X", email: "office@democivil.invalid", contact: { name: "Farid Bin Osman", designation: "Director", email: "farid@democivil.invalid", phone: "" } }, 26, [
    { id: `${P}vdoc16`, ...COMPANY(1), verified: "VERIFIED" },
    { id: `${P}vdoc17`, type: `${P}sdt2`, reference: "DC-G2-0001", authority: "Demo Contractors Board", issuedOn: D(-250), expiresOn: D(480), values: [`${P}rgv2`, `${P}rgv6`], verified: "VERIFIED" },
    { id: `${P}vdoc18`, type: `${P}sdt5`, reference: "TC-0001", authority: "Demo Tax Office", issuedOn: D(-60), expiresOn: D(330), verified: "VERIFIED" },
  ]);
  await decide(5, v5.app, `${P}ai124`, 26);

  // vnd6: an applicant; its tax clearance not in order and its contractor certificate never lodged; resubmission
  // requested with a deadline 4 working days ago, which has lapsed (the lapse is not recorded: the record says so).
  const v6 = await acts.record(`${P}vnd6`, `${P}vapp6`, `${P}vct6`, { name: "Sampel Kejuruteraan Enterprise", no: "DM0000102-X", entity: "sole_proprietor", country: "demo_home", address: address(6), email: "sampel@kejuruteraan.invalid", contact: { name: "Wong Mei Ling", designation: "Owner", email: "meiling@kejuruteraan.invalid", phone: "07-000 1102" } }, W(14), null, null, T(W(14), "09:30"));
  await acts.lodge(`${P}vnd6`, `${P}vdoc19`, COMPANY(102), T(W(13), "10:00"));
  await acts.attach({ supplierDocumentId: `${P}vdoc19` }, "SUPPLIER_DOCUMENT", "Company certificate CR-102 for Sampel Kejuruteraan Enterprise", `${v6} · document`, T(W(13), "10:10"));
  await acts.verify(`${P}vdoc19`, "VERIFIED", T(W(12), "09:00"));
  await acts.lodge(`${P}vnd6`, `${P}vdoc20`, { type: `${P}sdt5`, reference: "TC-0102", authority: "Demo Tax Office", issuedOn: D(-500), expiresOn: D(-140) }, T(W(13), "10:20"));
  await acts.attach({ supplierDocumentId: `${P}vdoc20` }, "SUPPLIER_DOCUMENT", "Tax clearance TC-0102 for Sampel Kejuruteraan Enterprise", `${v6} · document`, T(W(13), "10:30"));
  await acts.verify(`${P}vdoc20`, "NOT_IN_ORDER", T(W(12), "09:20"), "The letter handed in expired before the application was received.");
  await acts.resubmit(`${P}vapp6`, [{ documentId: `${P}vdoc20`, remarks: "Hand in a tax clearance letter in force (the one handed in has expired)." }, { typeId: `${P}sdt2`, remarks: "Lodge the contractor registration certificate, or say it is not applicable." }], W(4), T(W(10), "15:00"));

  // vnd7: registered; a renewal application received by post, its tax clearance renewed, sent for decision: its route pending.
  const v7 = await registered(7, { name: "Sampel Engineering Sdn Bhd", no: "DEMO-0003-X", email: "office@sampeleng.invalid", contact: { name: "Ganesh Raj", designation: "Director", email: "ganesh@sampeleng.invalid", phone: "07-000 1103" } }, 45, [
    { id: `${P}vdoc21`, ...COMPANY(3), verified: "VERIFIED" },
    { id: `${P}vdoc22`, type: `${P}sdt2`, notApplicable: true, verified: "VERIFIED" },
    { id: `${P}vdoc23`, type: `${P}sdt5`, reference: "TC-0003", authority: "Demo Tax Office", issuedOn: D(-370), expiresOn: D(15), verified: "VERIFIED" },
    { id: `${P}vdoc24`, type: `${P}sdt3`, reference: "SR-0003", authority: "Demo Supplier Register", issuedOn: D(-200), expiresOn: D(160), values: [`${P}rgv10`, `${P}rgv11`], verified: "VERIFIED" },
  ]);
  await decide(7, v7.app, `${P}ai127`, 45);
  await acts.openRenewal(v7.sid, `${P}vapp7r`, W(5), W(6), T(W(5), "09:00"));
  await acts.lodge(v7.sid, `${P}vdoc25`, { type: `${P}sdt5`, reference: "TC-0003-R", authority: "Demo Tax Office", issuedOn: W(6), expiresOn: D(380), renews: `${P}vdoc23` }, T(W(5), "09:30"));
  await acts.attach({ supplierDocumentId: `${P}vdoc25` }, "SUPPLIER_DOCUMENT", "Tax clearance TC-0003-R for Sampel Engineering Sdn Bhd", `${v7.ref} · document`, T(W(5), "09:40"));
  await acts.verify(`${P}vdoc25`, "VERIFIED", T(W(4), "09:00"));
  await acts.attach({ supplierApplicationId: `${P}vapp7r` }, "SUPPLIER_DECLARATION", "Signed declaration of Sampel Engineering Sdn Bhd (renewal)", `${v7.ref} · application`, T(W(4), "09:20"));
  await acts.submit(`${P}vapp7r`, `${P}ai128`, T(W(2), "10:00"));

  // ---- a2 (plan §6). Links first (OD-9: explicit acts, never matched): sx16, sx18 and sx20's parties;
  // sx16's Sampel Kejuruteraan (an applicant) and Demo Network Builders are left unlinked, to show "not checked".
  const links: [string, string][] = [[`${P}pty2`, v1.sid], [`${P}pty14`, v2.sid], [`${P}pty12`, v4.sid], [`${P}pty7`, v2.sid], [`${P}pty8`, v3.sid], [`${P}pty9`, v4.sid], [`${P}pty11`, v3.sid], [`${P}pty10`, v4.sid]];
  for (const [i, [party, sid]] of links.entries()) await acts.linkParty(party, sid, "", T(W(9), `09:${String(10 + i).padStart(2, "0")}`));
  // Phase 1's awards with no party: DEMO-0001-X and DEMO-0003-X.
  await acts.linkAward(`${P}aw1`, v5.sid, T(W(9), "10:00"));
  await acts.linkAward(`${P}aw3`, v7.sid, T(W(9), "10:05"));
  // vnd4 suspended by hand: its tax clearance found not to match the board's record (invented).
  await acts.suspend(`${P}vstd1`, v4.sid, `${P}srs1`, W(5), [`${P}vdoc15`], "The tax office could not confirm the letter's number; the supplier was asked for a fresh one.", T(W(5), "11:00"));
  // vnd5 blacklisted on its route (OD-8 A): asked, approved by the Chief Executive, recorded; a first offence of 60 months.
  await acts.requestBlacklisting(`${P}vsr1`, `${P}ai125`, v5.sid, `${P}srs3`, "The declaration in its bid for an earlier exercise was found false (demo).", T(W(8), "10:00"));
  await acts.approveRoute(`${P}ai125`, { id: `${P}p1`, name: "Aisyah Rahman" }, OFFICER.id, `${v5.ref} · Blacklisting route`, T(W(7), "15:00"));
  await acts.recordBlacklisting(`${P}vstd2`, `${P}vsr1`, W(6), T(W(6), "09:30"));
  // A special permission on sx18 for Teladan Mekanikal (FR-ADV-017): the board's letter and the organisation's own approval.
  const permLabel = await acts.specialPermission(`${P}vsp1`, `${P}ai126`, `${P}pty8`, [`${P}rb2`], T(W(4), "10:00"));
  await acts.approveRoute(`${P}ai126`, APPROVER, OFFICER.id, `${permLabel} · route`, T(W(3), "11:00"));
  await acts.grantPermission(`${P}vsp1`, W(3), T(W(3), "14:00"));

  await acts.flush();
}

// ------------------------------------------------------------------ the read-back (X-10 b)

export async function checkSuppliersDemo(db: Db) {
  const { loadSupplier } = await import("../src/lib/suppliers/repo");
  const { documentStates } = await import("../src/lib/suppliers/documents");
  const { documentFacts, loadSupplierConfig } = await import("../src/lib/suppliers/repo");
  const { queueState } = await import("../src/lib/suppliers/review");
  const registered = await db.supplier.count({ where: { id: demoRef, status: "REGISTERED" } });
  if (registered !== 6) fail(`${registered} demo suppliers are registered, not 6`);
  const v3 = (await loadSupplier(await demoOrgId(), `${P}vnd3`)) ?? fail("vnd3 did not load");
  const cfg = await loadSupplierConfig(v3.org.id);
  const s3 = documentStates(cfg.typeFacts, v3.supplier.documents.map(documentFacts), v3.org.today!).find((x) => x.type.id === `${P}sdt2`);
  if (s3?.state !== "EXPIRED" || !s3.pending) fail("vnd3's contractor certificate does not read expired under its unverified renewal");
  const v6 = (await loadSupplier(await demoOrgId(), `${P}vnd6`)) ?? fail("vnd6 did not load");
  const a6 = v6.supplier.applications[0];
  if (queueState({ ...a6, resubmitBy: a6.resubmitBy?.toISOString().slice(0, 10) ?? null }, v6.org.today) !== "LAPSED") fail("vnd6's application does not read lapsed");
  const pending = await db.approvalInstance.count({ where: { id: `${P}ai128`, status: "PENDING" } });
  if (pending !== 1) fail("vnd7's renewal route is not pending");
  const unrouted = await db.approvalInstance.count({ where: { id: { in: [`${P}ai120`, `${P}ai121`, `${P}ai122`, `${P}ai123`, `${P}ai124`, `${P}ai125`, `${P}ai126`, `${P}ai127`, `${P}ai128`] }, value: null, matterKind: "SUPPLIER" } });
  if (unrouted !== 9) fail("a demo supplier route was routed on a value");
  // a2, read back as the product reads it.
  const { standingOf } = await import("../src/lib/suppliers/standing-repo");
  const { addMonths } = await import("../src/lib/securities/period");
  const org = v3.org;
  const today = org.today!;
  const st = async (k: number) => (await standingOf(`${P}vnd${k}`, org.id, today, db as never))!.reading;
  if ((await st(4)).standing !== "SUSPENDED") fail("vnd4 does not read suspended");
  const b5 = await st(5);
  const ev = await db.standingEvent.findUniqueOrThrow({ where: { id: `${P}vstd2` } });
  if (b5.standing !== "BLACKLISTED" || b5.blacklist?.endsOn !== addMonths(ev.effectiveOn.toISOString().slice(0, 10), 60)) fail("vnd5 does not read blacklisted for 60 months (endsOn exclusive: the free-from day)");
  const r3 = await st(3);
  if (r3.standing !== "ACTIVE" || !r3.notes.some((n) => n.code === "LAPSE_RULE_NOT_SET")) fail("vnd3 does not read “Active — lapse rule not set” (OD-7)");
  if ((await db.exerciseParty.findUniqueOrThrow({ where: { id: `${P}pty3` } })).vendorId !== null) fail("pty3 should stay unlinked");
  if ((await db.award.findUniqueOrThrow({ where: { id: `${P}aw7` } })).vendorId !== `${P}vnd1`) fail("aw7 does not follow its party's link");
  if (!(await db.specialPermission.findUniqueOrThrow({ where: { id: `${P}vsp1` } })).grantedOn) fail("vsp1 is not granted");
}
