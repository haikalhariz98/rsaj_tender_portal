import "dotenv/config";
// 6.13 Part A step 5: first, so the product's client is the one the demo's acts run through (prisma/demo-acts.ts).
import { raiseSeries } from "./demo-series";
import "./demo-acts";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

import { checkCaseStages, finishCaseStages, loadAwards, loadAwardSetup } from "./demo-award";
import { checkContractsDemo, configureContractsDemo, loadContractsDemo } from "./demo-contracts";
import { checkCertificatesDemo, configureCertificatesDemo, loadCertificatesDemo } from "./demo-certificates";
import { checkFidelityDemo, configureFidelityDemo } from "./demo-fidelity";
import { checkSupervisionDemo, configureSupervisionDemo, loadSupervisionDemo } from "./demo-supervision";
import { checkPaymentDemo, configurePaymentDemo, loadPaymentDemo } from "./demo-payment";
import { checkLifecycleDemo, configureLifecycleDemo, LIFECYCLE_PREPARED, loadLifecycleAward, loadLifecycleCon3, loadLifecycleDemo, loadLifecycleSetup } from "./demo-lifecycle";
import { loadDocuments } from "./demo-documents";
import { checkScope, loadScope, loadScopeExercises, loadScopeSitting } from "./demo-scope";
import { loadSittingTrail } from "./demo-sitting-trail";
import { checkTenderDocs, loadTenderDocs } from "./demo-tender-docs";
import { checkWindowDemo, loadWindowDemo } from "./demo-window";
import { checkAppendixAward, loadAppendixAward } from "./demo-award-appendix";
import { checkBidsDemo, configureBidsDemo, loadBidsDemo } from "./demo-bids";
import { checkOpeningDemo, configureOpeningDemo, loadOpeningDemo } from "./demo-opening";
import { loadOpeningOfficersDemo } from "./demo-officers";
import { loadScopeSwitchesDemo } from "./demo-switches";
import { checkEvaluationDemo, configureEvaluationDemo, loadEvaluationDemo } from "./demo-evaluation";
import { loadCompanyDemo } from "./demo-company";
import { loadMyBidsDemo } from "./demo-my-bids";
import { linkDemoContractor } from "./demo-contractor";
import { loadMyProjectsDemo } from "./demo-my-projects";
import { loadProjectDocumentsDemo } from "./demo-project-documents";
import { checkRegistrationDemo, configureRegistrationDemo, loadRegistrationDemo } from "./demo-registration";
import { checkSuppliersDemo, configureSuppliersDemo, loadSuppliersDemo } from "./demo-suppliers";
import { attributeSeededRows } from "./demo-attribution";
import { inboxDemoMissing, loadInboxDemo } from "./demo-inbox";
import { checkResultsDemo, loadResultsDemo, resultsDemoState } from "./demo-results";
import { loadOnlineDemo, onlineDemoUnsetWords } from "./demo-online";
import { loadDemoSignInAndGrants } from "./demo-fresh-config";
import { DEMO_PREFIX, DEMO_SWITCHES_RETIRED, DEMO_WIPE_RETIRED, demoIsLoaded, demoStarted } from "./demo-sign-in";
import { inspectLogo } from "../src/lib/organisation/logo";
import { initialsLogo } from "../src/lib/organisation/png";
import { DEMO_ACTOR } from "./demo-actor";
import { demoOrgId, demoScope } from "./demo-org";

/**
 * A demonstration dataset, loaded deliberately and never by default.
 *
 * `npm run setup` still creates one empty organisation and nothing else: shipping a
 * threshold or an approver as a starting value is how someone else's policy reaches
 * production. This exists for a different job — comparing our screens against the
 * approved prototype. An empty table renders an empty state, not columns, so without
 * data there is nothing to measure a column layout against.
 *
 * Everything here is invented. The names, codes, thresholds and committees are
 * deliberately not any customer's: if a figure from this file ever appeared on a real
 * screen it should be obviously wrong rather than plausibly wrong.
 *
 *   npm run demo:load      populate, once: a database that holds any of it gets nothing more
 *   npm run demo:results   add the Results fixture to a database loaded before it existed
 *   npm run demo:inbox     add the reporting lines and the not-approved memo rule (Phase 3c) to a database loaded before they existed
 *   npm run demo:wipe      retired (Phase 1d): refuses and explains, removes nothing
 *   npm run demo:switches  retired (ruling 12c): refuses and explains, writes nothing. Configuration rows are written only by demo:load on a fresh database.
 *
 * Every row is created with an id prefixed `demo_`. Nothing else in the product uses that prefix.
 *
 * Additive only (ADR 0034 D11, Phase 1d). The demo writes through the product's own acts, and every act leaves audit rows,
 * which the database now refuses to change or delete. So nothing here deletes a row, and the wipe that used to is gone:
 * a demonstration database is thrown away whole, never emptied. A load runs once. If it finds any demo row, finished or
 * not, it writes nothing; a load that stopped part way is not finished by running it again, it is replaced by a new database.
 * That whole-load guard is this loader's choice, not something the permanent trail forces (Phase 1d review): createMany with
 * skipDuplicates is INSERT ... ON CONFLICT DO NOTHING and needs no UPDATE, so per-step guards (skip a step whose stable-id rows
 * exist; write a step's audit rows only when it inserted, as `demo:results` does) could finish a part-made load. They are not built.
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ORG_CODE = process.env.ORGANISATION_CODE ?? "ORG";
/// Invented, like everything here: the demo's sittings need a zone to start, table and
/// vote (an unset zone blocks them). Set only where the organisation has none.
const DEMO_TIME_ZONE = "Asia/Kuala_Lumpur";
const P = DEMO_PREFIX;

/// The legal name is required, so the seed gives it a placeholder ("Your organisation",
/// or ORGANISATION_NAME). The demo replaces that placeholder, and only that, with an
/// invented name, so a name somebody typed is never touched.
const SEED_LEGAL_NAME = process.env.ORGANISATION_NAME ?? "Your organisation";
const DEMO_LEGAL_NAME = "Demo Utilities Sdn Bhd";

/// Invented identity details, set only on fields the organisation has not filled in. Details carry no provenance column, so nothing here is marked ASSUMED: every
/// value is invented and says so (".invalid" addresses, zeros for numbers).
const DEMO_DETAILS = {
  nameMs: "Demo Utiliti Berhad",
  shortName: "Demo Utilities",
  registrationNo: "200001010001 (000001-D)",
  taxIdentificationNo: "C00000000000",
  sstRegistrationNo: "W00-0000-00000000",
  addressLine1: "1 Demo Avenue",
  addressLine2: null,
  postcode: "00000",
  city: "Demo City",
  state: "Demo State",
  country: "Demo Country",
  phone: "+00 0-000 0000",
  email: "procurement@demo.invalid",
  website: "https://www.demo.invalid",
} as const;
const DEMO_LOGO_ID = `${P}logo`;
/// A drawn logo: white initials on a colour.
const demoLogoBytes = () => initialsLogo("DU", [30, 64, 175]);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function organisation() {
  const org = await db.organisation.findUnique({ where: { code: ORG_CODE } });
  if (!org) throw new Error(`No organisation "${ORG_CODE}". Run npm run setup first.`);
  return org;
}

async function load() {
  const org = await organisation();
  const organisationId = org.id;

  // Refuse to stack one demo run on another, or to run over one that stopped part way: either way nothing is written (Phase 1d).
  // Whether an earlier load finished cannot be told from here (a load can stop after any step), so the words do not claim it did.
  if (await demoStarted(db)) {
    console.log(
      "Demo data is already present, loaded wholly or in part: nothing was written. This loader runs once per database and does not finish a part-made load; nothing removes it (the trail is permanent). For a fresh demo, use a new database.",
    );
    // Ruling 12c, 20z: no configuration is written on a loaded database. The settings the online demonstration stands on that are not set are named, in words, for whoever sets them through Configuration.
    const unsetOnline = await onlineDemoUnsetWords(db, org.id);
    if (unsetOnline.length) {
      console.log("These settings are not set on this database (set them through Configuration, by two people; nothing was written here):");
      for (const line of unsetOnline) console.log(`  ${line}`);
    }
    return;
  }

  const from = day("2024-01-01");
  if (!org.timeZone) await db.organisation.update({ where: { id: org.id }, data: { timeZone: DEMO_TIME_ZONE } });

  // Identity details and a drawn logo, only where the organisation has none of its own.
  const unset = Object.fromEntries(Object.entries(DEMO_DETAILS).filter(([f, v]) => v !== null && (org as Record<string, unknown>)[f] == null));
  if (Object.keys(unset).length > 0) await db.organisation.update({ where: { id: org.id }, data: unset });
  if (org.name === SEED_LEGAL_NAME) await db.organisation.update({ where: { id: org.id }, data: { name: DEMO_LEGAL_NAME } });
  if (!(await db.organisationLogo.findUnique({ where: { organisationId: org.id }, select: { id: true } }))) {
    const bytes = demoLogoBytes();
    const check = inspectLogo(bytes);
    if (!check.ok) throw new Error("The demo logo is not a valid logo.");
    await db.organisationLogo.create({
      data: { id: DEMO_LOGO_ID, organisationId: org.id, bytes: new Uint8Array(bytes), mediaType: check.mediaType, sizeBytes: check.sizeBytes, sha256: check.sha256, width: check.width, height: check.height },
    });
  }

  // ------------------------------------------------------------------- people
  await db.person.createMany({
    data: [
      { id: `${P}p1`, organisationId, staffNo: "D001", name: "Aisyah Rahman", email: "aisyah.rahman@demo.invalid", jobTitle: "Chief Executive", jobTitleMs: "Ketua Pegawai Eksekutif", authorityLevel: "Chief Executive", department: "Executive", telephone: "07-000 0001", portalRoleCode: "CEO" },
      { id: `${P}p2`, organisationId, staffNo: "D002", name: "Bala Krishnan", email: "bala.krishnan@demo.invalid", jobTitle: "Finance Director", jobTitleMs: "Pengarah Kewangan", authorityLevel: "Functional Director", department: "Finance", telephone: "07-000 0002", portalRoleCode: "FD" },
      { id: `${P}p3`, organisationId, staffNo: "D003", name: "Chen Wei Ling", email: "chen.weiling@demo.invalid", jobTitle: "Head of Contract & Procurement", jobTitleMs: "Ketua Kontrak & Perolehan", authorityLevel: "Head of Department", department: "Contract & Procurement", telephone: "07-000 0003", portalRoleCode: "HOD_CP" },
      { id: `${P}p4`, organisationId, staffNo: "D004", name: "Daniel Anak Jelani", email: "daniel.jelani@demo.invalid", jobTitle: "Procurement Executive", jobTitleMs: "Eksekutif Perolehan", authorityLevel: "Contract & Procurement", department: "Contract & Procurement", telephone: "07-000 0004", portalRoleCode: "CP_EXEC" },
      { id: `${P}p5`, organisationId, staffNo: "D005", name: "Eng Siew Mei", email: "siewmei.eng@demo.invalid", jobTitle: "Section Head, Pre-contract", jobTitleMs: "Ketua Seksyen Pra-kontrak", authorityLevel: "Contract & Procurement", department: "Contract & Procurement", telephone: "07-000 0005", portalRoleCode: "SEC_PRE", isAvailable: false },
      { id: `${P}p7`, organisationId, staffNo: "D007", name: "Gopal Nair", email: "gopal.nair@demo.invalid", jobTitle: "Director, Operations", jobTitleMs: "Pengarah Operasi", authorityLevel: "Functional Director", department: "Operations", telephone: "07-000 0007" },
      { id: `${P}p8`, organisationId, staffNo: "D008", name: "Hana Yusof", email: "hana.yusof@demo.invalid", jobTitle: "Deputy Director, Operations", jobTitleMs: "Timbalan Pengarah Operasi", authorityLevel: "Head of Department", department: "Operations", telephone: "07-000 0008" },
      { id: `${P}p6`, organisationId, staffNo: "D006", name: "Faridah Osman", email: "faridah.osman@demo.invalid", jobTitle: "Regional Manager, North", jobTitleMs: "Pengurus Wilayah, Utara", authorityLevel: "Head of Department", department: "Northern Region", portalRoleCode: "REQUESTOR", isActive: false },
    ],
  });

  // ---------------------------------------------------------------- structure
  await db.costCentre.createMany({
    data: [
      { id: `${P}cc1`, organisationId, code: "CC-100", nameEn: "Head office overhead", orgUnitCode: "CP", siteCode: "HQ", activity: "General overhead", ownerPersonId: `${P}p3`, provenance: "STATED", sortOrder: 1, effectiveFrom: from },
      { id: `${P}cc2`, organisationId, code: "CC-200", nameEn: "Northern operations", orgUnitCode: "NTH", siteCode: "NTH-WKS", activity: "Operations", ownerPersonId: `${P}p6`, provenance: "STATED", sortOrder: 2, effectiveFrom: from },
      { id: `${P}cc3`, organisationId, code: "CC-300", nameEn: "Capital works", orgUnitCode: "OPS", siteCode: "HQ", activity: "Capital works", provenance: "OBSERVED", sortOrder: 3, effectiveFrom: from },
    ],
  });

  await db.accountCode.createMany({
    data: [
      { id: `${P}ac1`, organisationId, code: "6100100", nameEn: "Consumables", provenance: "STATED", sortOrder: 1, effectiveFrom: from },
      { id: `${P}ac2`, organisationId, code: "6200200", nameEn: "Maintenance services", provenance: "STATED", sortOrder: 2, effectiveFrom: from },
      { id: `${P}ac3`, organisationId, code: "7300300", nameEn: "Plant and equipment", provenance: "ASSUMED", sortOrder: 3, effectiveFrom: from },
    ],
  });

  await db.orgUnit.createMany({
    data: [
      { id: `${P}u1`, organisationId, code: "GRP", nameEn: "Demo Utilities Berhad", nameMs: "Demo Utiliti Berhad", kind: "COMPANY", headPersonId: `${P}p1`, registrationNumber: "200001010001 (000001-D)", taxReference: "C 0000 0000 0000", telephone: "00-000 0000", financialYearStart: "01-01", address: "1 Demo Avenue, 00000 Demo City", operatingLicence: "Demo regulator — invented licence", provenance: "STATED", sortOrder: 1, effectiveFrom: from },
      { id: `${P}u2`, organisationId, code: "OPS", nameEn: "Operations Division", kind: "DIVISION", parentCode: "GRP", provenance: "STATED", sortOrder: 2, effectiveFrom: from },
      { id: `${P}u3`, organisationId, code: "CP", nameEn: "Contract & Procurement", nameMs: "Kontrak & Perolehan", kind: "DEPARTMENT", parentCode: "OPS", costCentreCode: "CC-100", headPersonId: `${P}p3`, provenance: "STATED", sortOrder: 3, effectiveFrom: from },
      { id: `${P}u4`, organisationId, code: "CP-PRE", nameEn: "Pre-contract Section", kind: "SECTION", parentCode: "CP", costCentreCode: "CC-100", provenance: "OBSERVED", sortOrder: 4, effectiveFrom: from },
      { id: `${P}u5`, organisationId, code: "NTH", nameEn: "Northern Region", kind: "DEPARTMENT", parentCode: "OPS", costCentreCode: "CC-200", headPersonId: `${P}p6`, provenance: "STATED", sortOrder: 5, effectiveFrom: from },
    ],
  });

  await db.site.createMany({
    data: [
      { id: `${P}s1`, organisationId, code: "HQ", nameEn: "Head Office", kind: "Office", town: "Demo City", district: "Demo Central", address: "1 Demo Avenue", orgUnitCode: "GRP", provenance: "STATED", sortOrder: 1, effectiveFrom: from },
      { id: `${P}s2`, organisationId, code: "NTH-WKS", nameEn: "Northern Works Depot", kind: "Depot", town: "Demo North", district: "Demo North", address: "12 Depot Road", orgUnitCode: "NTH", provenance: "OBSERVED", sortOrder: 2, effectiveFrom: from },
    ],
  });

  await db.codeFormat.createMany({
    data: [
      { id: `${P}f1`, organisationId, key: "cost_centre", pattern: "CC-\\d{3}", example: "CC-100", description: "CC, a hyphen, three digits.", provenance: "STATED" },
      { id: `${P}f2`, organisationId, key: "account_code", pattern: "\\d{7}", example: "6100100", description: "Seven digits.", provenance: "STATED" },
    ],
  });

  await db.authorityRole.createMany({
    data: [
      { id: `${P}r1`, organisationId, code: "CEO", nameEn: "Chief Executive", nameMs: "Ketua Pegawai Eksekutif", workspace: "Internal", authorityLevel: "Chief Executive", escalatesToCode: "BOARD", sortOrder: 1 },
      { id: `${P}r2`, organisationId, code: "FD", nameEn: "Finance Director", nameMs: "Pengarah Kewangan", workspace: "Internal", authorityLevel: "Functional Director", escalatesToCode: "CEO", selfApprovalEscalatesToCode: "CEO", sortOrder: 2 },
      { id: `${P}r3`, organisationId, code: "HOD_CP", nameEn: "Head of Contract & Procurement", nameMs: "Ketua Kontrak & Perolehan", workspace: "Internal", authorityLevel: "Head of Department", escalatesToCode: "FD", selfApprovalEscalatesToCode: "FD", sortOrder: 3 },
      { id: `${P}r4`, organisationId, code: "SEC_PRE", nameEn: "Section Head, Pre-contract", nameMs: "Ketua Seksyen Pra-kontrak", workspace: "Internal", authorityLevel: "Contract & Procurement", escalatesToCode: "HOD_CP", sortOrder: 4 },
      { id: `${P}r5`, organisationId, code: "BOARD", nameEn: "Board of Directors", nameMs: "Lembaga Pengarah", isCommittee: true, workspace: "Internal", authorityLevel: "Board", sortOrder: 5 },
      { id: `${P}r6`, organisationId, code: "TENDER_BOARD", nameEn: "Tender Board", nameMs: "Lembaga Tender", isCommittee: true, workspace: "Internal", authorityLevel: "Committee", sortOrder: 6 },
      { id: `${P}r7`, organisationId, code: "CP_EXEC", nameEn: "Procurement Executive", nameMs: "Eksekutif Perolehan", workspace: "Internal", authorityLevel: "Contract & Procurement", escalatesToCode: "SEC_PRE", sortOrder: 7 },
      { id: `${P}r8`, organisationId, code: "REQUESTOR", nameEn: "Requestor", nameMs: "Pemohon", workspace: "Internal", authorityLevel: "Head of Department", sortOrder: 8 },
    ],
  });

  await db.roleAssignment.createMany({
    data: [
      { id: `${P}a1`, personId: `${P}p1`, roleCode: "CEO", effectiveFrom: from },
      { id: `${P}a2`, personId: `${P}p2`, roleCode: "FD", effectiveFrom: from },
      { id: `${P}a3`, personId: `${P}p3`, roleCode: "HOD_CP", effectiveFrom: from },
      { id: `${P}a4`, personId: `${P}p5`, roleCode: "SEC_PRE", effectiveFrom: from },
    ],
  });


  // ------------------------------------------------------------- capabilities
  // Deliberately uneven: a grid where every office holds everything teaches nobody
  // anything, and hides the case where a capability is held by nobody at all.
  await db.capability.createMany({
    data: [
      { id: `${P}cap1`, organisationId, code: "raise_requirement", nameEn: "Raise a requirement", groupLabel: "Sourcing", provenance: "STATED", sortOrder: 1 },
      { id: `${P}cap2`, organisationId, code: "approve_requirement", nameEn: "Approve a requirement", groupLabel: "Sourcing", provenance: "STATED", sortOrder: 2 },
      { id: `${P}cap3`, organisationId, code: "run_sourcing", nameEn: "Run a sourcing exercise", groupLabel: "Sourcing", provenance: "STATED", sortOrder: 3 },
      { id: `${P}cap4`, organisationId, code: "open_bids", nameEn: "Open bids", groupLabel: "Sourcing", provenance: "STATED", sortOrder: 4 },
      { id: `${P}cap5`, organisationId, code: "evaluate_bids", nameEn: "Evaluate bids", groupLabel: "Sourcing", provenance: "STATED", sortOrder: 5 },
      { id: `${P}cap6`, organisationId, code: "recommend_award", nameEn: "Recommend an award", groupLabel: "Sourcing", provenance: "STATED", sortOrder: 6 },
      { id: `${P}cap7`, organisationId, code: "approve_award", nameEn: "Approve an award", groupLabel: "Sourcing", provenance: "STATED", sortOrder: 7 },
      { id: `${P}cap8`, organisationId, code: "sign_contract", nameEn: "Sign a contract", groupLabel: "Contracts and projects", provenance: "STATED", sortOrder: 8 },
      { id: `${P}cap9`, organisationId, code: "issue_certificate", nameEn: "Issue a certificate", groupLabel: "Contracts and projects", provenance: "STATED", sortOrder: 9 },
      { id: `${P}cap10`, organisationId, code: "certify_payment", nameEn: "Certify a payment", groupLabel: "Contracts and projects", provenance: "STATED", sortOrder: 10 },
      { id: `${P}cap11`, organisationId, code: "approve_variation", nameEn: "Approve a variation order", groupLabel: "Contracts and projects", provenance: "STATED", sortOrder: 11 },
      { id: `${P}cap12`, organisationId, code: "grant_eot", nameEn: "Grant an extension of time", groupLabel: "Contracts and projects", provenance: "STATED", sortOrder: 12 },
      { id: `${P}cap13`, organisationId, code: "waive_damages", nameEn: "Waive delay damages", groupLabel: "Contracts and projects", provenance: "STATED", sortOrder: 13 },
      { id: `${P}cap14`, organisationId, code: "terminate_contract", nameEn: "Terminate a contract", groupLabel: "Contracts and projects", provenance: "STATED", sortOrder: 14 },
      { id: `${P}cap15`, organisationId, code: "register_supplier", nameEn: "Register a supplier", groupLabel: "Suppliers and documents", provenance: "STATED", sortOrder: 15 },
      { id: `${P}cap16`, organisationId, code: "verify_documents", nameEn: "Verify supplier documents", groupLabel: "Suppliers and documents", provenance: "STATED", sortOrder: 16 },
      { id: `${P}cap17`, organisationId, code: "suspend_supplier", nameEn: "Suspend a supplier", groupLabel: "Suppliers and documents", provenance: "STATED", sortOrder: 17 },
      { id: `${P}cap18`, organisationId, code: "release_document", nameEn: "Release a controlled document", groupLabel: "Suppliers and documents", provenance: "STATED", sortOrder: 18 },
      { id: `${P}cap19`, organisationId, code: "record_performance", nameEn: "Record contractor performance", groupLabel: "Suppliers and documents", provenance: "STATED", sortOrder: 19 },
      { id: `${P}cap20`, organisationId, code: "configure_portal", nameEn: "Configure the portal", groupLabel: "System", provenance: "STATED", sortOrder: 20 },
      { id: `${P}cap21`, organisationId, code: "manage_budget", nameEn: "Manage the budget", groupLabel: "System", provenance: "STATED", sortOrder: 21 },
      { id: `${P}cap22`, organisationId, code: "manage_users", nameEn: "Manage users and roles", groupLabel: "System", provenance: "STATED", sortOrder: 22 },
      { id: `${P}cap23`, organisationId, code: "delegate_authority", nameEn: "Delegate authority", groupLabel: "System", provenance: "STATED", sortOrder: 23 },
      { id: `${P}cap24`, organisationId, code: "view_audit", nameEn: "View the audit trail", groupLabel: "System", provenance: "STATED", sortOrder: 24 },
    ],
  });

  await db.roleCapability.createMany({
    data: [
      { id: `${P}rc1`, capabilityId: `${P}cap2`, roleCode: "CEO" },
      { id: `${P}rc2`, capabilityId: `${P}cap7`, roleCode: "CEO" },
      { id: `${P}rc3`, capabilityId: `${P}cap8`, roleCode: "CEO" },
      { id: `${P}rc4`, capabilityId: `${P}cap11`, roleCode: "CEO" },
      { id: `${P}rc5`, capabilityId: `${P}cap12`, roleCode: "CEO" },
      { id: `${P}rc6`, capabilityId: `${P}cap13`, roleCode: "CEO" },
      { id: `${P}rc7`, capabilityId: `${P}cap14`, roleCode: "CEO" },
      { id: `${P}rc8`, capabilityId: `${P}cap23`, roleCode: "CEO" },
      { id: `${P}rc9`, capabilityId: `${P}cap24`, roleCode: "CEO" },
      { id: `${P}rc10`, capabilityId: `${P}cap2`, roleCode: "FD" },
      { id: `${P}rc11`, capabilityId: `${P}cap6`, roleCode: "FD" },
      { id: `${P}rc12`, capabilityId: `${P}cap7`, roleCode: "FD" },
      { id: `${P}rc13`, capabilityId: `${P}cap8`, roleCode: "FD" },
      { id: `${P}rc14`, capabilityId: `${P}cap10`, roleCode: "FD" },
      { id: `${P}rc15`, capabilityId: `${P}cap11`, roleCode: "FD" },
      { id: `${P}rc16`, capabilityId: `${P}cap21`, roleCode: "FD" },
      { id: `${P}rc17`, capabilityId: `${P}cap23`, roleCode: "FD" },
      { id: `${P}rc18`, capabilityId: `${P}cap24`, roleCode: "FD" },
      { id: `${P}rc19`, capabilityId: `${P}cap1`, roleCode: "HOD_CP" },
      { id: `${P}rc20`, capabilityId: `${P}cap2`, roleCode: "HOD_CP" },
      { id: `${P}rc21`, capabilityId: `${P}cap3`, roleCode: "HOD_CP" },
      { id: `${P}rc22`, capabilityId: `${P}cap4`, roleCode: "HOD_CP" },
      { id: `${P}rc23`, capabilityId: `${P}cap5`, roleCode: "HOD_CP" },
      { id: `${P}rc24`, capabilityId: `${P}cap6`, roleCode: "HOD_CP" },
      { id: `${P}rc25`, capabilityId: `${P}cap9`, roleCode: "HOD_CP" },
      { id: `${P}rc26`, capabilityId: `${P}cap15`, roleCode: "HOD_CP" },
      { id: `${P}rc27`, capabilityId: `${P}cap16`, roleCode: "HOD_CP" },
      { id: `${P}rc28`, capabilityId: `${P}cap19`, roleCode: "HOD_CP" },
      { id: `${P}rc29`, capabilityId: `${P}cap24`, roleCode: "HOD_CP" },
      { id: `${P}rc30`, capabilityId: `${P}cap1`, roleCode: "SEC_PRE" },
      { id: `${P}rc31`, capabilityId: `${P}cap3`, roleCode: "SEC_PRE" },
      { id: `${P}rc32`, capabilityId: `${P}cap4`, roleCode: "SEC_PRE" },
      { id: `${P}rc33`, capabilityId: `${P}cap5`, roleCode: "SEC_PRE" },
      { id: `${P}rc34`, capabilityId: `${P}cap9`, roleCode: "SEC_PRE" },
      { id: `${P}rc35`, capabilityId: `${P}cap16`, roleCode: "SEC_PRE" },
      { id: `${P}rc36`, capabilityId: `${P}cap1`, roleCode: "CP_EXEC" },
      { id: `${P}rc37`, capabilityId: `${P}cap3`, roleCode: "CP_EXEC" },
      { id: `${P}rc38`, capabilityId: `${P}cap5`, roleCode: "CP_EXEC" },
      { id: `${P}rc39`, capabilityId: `${P}cap15`, roleCode: "CP_EXEC" },
      { id: `${P}rc40`, capabilityId: `${P}cap16`, roleCode: "CP_EXEC" },
      { id: `${P}rc41`, capabilityId: `${P}cap18`, roleCode: "CP_EXEC" },
      { id: `${P}rc42`, capabilityId: `${P}cap1`, roleCode: "REQUESTOR" },
      { id: `${P}rc43`, capabilityId: `${P}cap7`, roleCode: "TENDER_BOARD" },
      { id: `${P}rc44`, capabilityId: `${P}cap7`, roleCode: "BOARD" },
      { id: `${P}rc45`, capabilityId: `${P}cap14`, roleCode: "BOARD" },
    ],
  });

  await db.delegation.createMany({
    data: [
      {
        id: `${P}dg1`, organisationId,
        fromPersonId: `${P}p5`, toPersonId: `${P}p4`, roleCode: "SEC_PRE",
        capabilityCodes: ["run_sourcing", "open_bids"],
        valueCeiling: "50000.00",
        reason: "Annual leave",
        effectiveFrom: day("2026-08-04"), effectiveTo: day("2026-08-18"),
        provenance: "STATED",
      },
      {
        // No ceiling set, which is not a ceiling of zero — the screen says so.
        id: `${P}dg2`, organisationId,
        fromPersonId: `${P}p2`, toPersonId: `${P}p3`, roleCode: "FD",
        capabilityCodes: [],
        reason: "Overseas conference",
        effectiveFrom: day("2026-09-01"), effectiveTo: day("2026-09-08"),
        provenance: "OBSERVED",
      },
    ],
  });

  // -------------------------------------------------------------- committees
  await db.committee.createMany({
    data: [
      {
        id: `${P}c1`, organisationId, code: "TENDER_BOARD", nameEn: "Tender Board", nameMs: "Lembaga Tender",
        mandate: "Approves awards above the tender floor.", governingSource: "Demo constitution cl. 4",
        action: "APPROVES", quorum: 3, quorumProvenance: "STATED", compositionProvenance: "STATED",
        valueScopeMin: "300000", notes: "",
        aliases: ["Main Tender Board"], secretariatRoleCode: "HOD_CP",
        // Invented, like every demo figure. Without a rule no matter can be decided,
        // and the minuted sitting below could not exist.
        votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
      },
      {
        id: `${P}c2`, organisationId, code: "QUOTE_CTTE", nameEn: "Quotation Committee", nameMs: "Jawatankuasa Sebut Harga",
        mandate: "Recommends awards in the quotation band.", governingSource: "Demo constitution cl. 5",
        action: "RECOMMENDS", compositionProvenance: "OBSERVED",
        valueScopeMin: "15000", valueScopeMax: "300000", notes: "",
        // Quorum and voting rule deliberately unset: the sitting shows both gaps.
        secretariatRoleCode: "HOD_CP",
      },
    ],
  });

  await db.committeeMember.createMany({
    data: [
      { id: `${P}m1`, committeeId: `${P}c1`, seatRoleCode: "CEO", position: "CHAIRMAN", provenance: "STATED", effectiveFrom: from },
      { id: `${P}m2`, committeeId: `${P}c1`, seatRoleCode: "FD", position: "MEMBER", provenance: "STATED", effectiveFrom: from },
      { id: `${P}m3`, committeeId: `${P}c1`, personId: `${P}p3`, position: "SECRETARY", provenance: "OBSERVED", effectiveFrom: from },
      { id: `${P}m4`, committeeId: `${P}c2`, seatRoleCode: "FD", position: "CHAIRMAN", provenance: "OBSERVED", effectiveFrom: from },
      { id: `${P}m5`, committeeId: `${P}c2`, personId: `${P}p4`, position: "MEMBER", provenance: "ASSUMED", effectiveFrom: from },
      // D4: the Tender Board's quorum of 3 needs three voting seats. The Secretary does not vote.
      { id: `${P}m6`, committeeId: `${P}c1`, personId: `${P}p7`, position: "MEMBER", provenance: "STATED", appointmentRef: "DEMO/APPT/7", effectiveFrom: from },
    ],
  });
  await db.committeeMember.create({
    data: { id: `${P}m7`, committeeId: `${P}c1`, personId: `${P}p8`, position: "MEMBER", isAlternate: true, alternateForId: `${P}m6`, provenance: "STATED", appointmentRef: "DEMO/APPT/8", effectiveFrom: from },
  });

  // ------------------------------------------------- not-approved outcomes
  // Invented wording. The product ships none; these exist only to exercise the screens.
  await db.notApprovedOutcome.createMany({
    data: [
      { id: `${P}nao1`, organisationId, code: "reclarify", nameEn: "Return for re-clarification", nameMs: "Kembali untuk penjelasan semula", kind: "LOOP", returnsToStage: "evaluation.clarification", governingSource: "Demo policy 7.2(a)", provenance: "ASSUMED", sortOrder: 1 },
      { id: `${P}nao2`, organisationId, code: "renegotiate", nameEn: "Return for re-negotiation", nameMs: "Kembali untuk rundingan semula", kind: "LOOP", returnsToStage: "evaluation.negotiation", governingSource: "Demo policy 7.2(b)", provenance: "ASSUMED", sortOrder: 2 },
      { id: `${P}nao3`, organisationId, code: "recall", nameEn: "Recall the exercise", nameMs: "Panggil semula pelawaan", kind: "LOOP", returnsToStage: "invitation", governingSource: "Demo policy 7.2(c)", provenance: "ASSUMED", sortOrder: 3 },
      { id: `${P}nao4`, organisationId, code: "cancel", nameEn: "Cancel the exercise", nameMs: "Batal pelawaan", kind: "TERMINAL", governingSource: "Demo policy 7.2(d)", provenance: "ASSUMED", sortOrder: 4 },
    ],
  });

  // --------------------------------------------------------------- sittings
  await db.meeting.createMany({
    data: [
      { id: `${P}mt1`, committeeId: `${P}c1`, reference: "DEMO/SIT/4/2026", meetingDate: day("2026-09-29"), status: "IN_PROGRESS", agenda: "Award of the demo cleaning contract." },
      {
        id: `${P}mt2`, committeeId: `${P}c1`, reference: "DEMO/SIT/3/2026", meetingDate: day("2026-08-20"), status: "MINUTED", minutedAt: day("2026-08-27"),
        agenda: "Three awards in the tender band.",
        minutes: "The Board met with three voting members present, the Director of Operations' alternate sitting in her principal's seat. The fleet award was carried. The Finance Director declared an interest in the IT award and stood aside, leaving the Board inquorate on it, so it was deferred. The civil works award was not carried and returned for re-negotiation.",
      },
      { id: `${P}mt3`, committeeId: `${P}c2`, reference: "DEMO/SQ/2/2026", meetingDate: day("2026-10-15"), status: "SCHEDULED", agenda: "Quotation for demo stationery." },
      { id: `${P}mt4`, committeeId: `${P}c1`, reference: "DEMO/SIT/2/2026", meetingDate: day("2026-07-10"), status: "CANCELLED", cancelledReason: "The chairman was abroad and nobody may stand in for the chair." },
    ],
  });

  await db.meetingAttendance.createMany({
    data: [
      { id: `${P}at1`, meetingId: `${P}mt1`, personId: `${P}p1`, attended: true },
      { id: `${P}at2`, meetingId: `${P}mt1`, personId: `${P}p2`, attended: true },
      { id: `${P}at3`, meetingId: `${P}mt1`, personId: `${P}p3`, attended: true },
      { id: `${P}at4`, meetingId: `${P}mt1`, personId: `${P}p7`, attended: false },
      { id: `${P}at5`, meetingId: `${P}mt2`, personId: `${P}p1`, attended: true },
      { id: `${P}at6`, meetingId: `${P}mt2`, personId: `${P}p2`, attended: true },
      { id: `${P}at7`, meetingId: `${P}mt2`, personId: `${P}p3`, attended: true },
      { id: `${P}at8`, meetingId: `${P}mt2`, personId: `${P}p7`, attended: false },
      { id: `${P}at9`, meetingId: `${P}mt2`, personId: `${P}p8`, attended: true, standingInForSeatId: `${P}m6` },
    ],
  });

  const tabled = { tabledByPersonId: `${P}p3` };
  await db.committeeDecision.createMany({
    data: [
      // Manual matters, d1–d6: linked to no record, so none names a reference that is
      // not one (6.10 local review 3 and its follow-up). No demo exercise, award or
      // contract has the same amount and kind as any of them, and linking one at a
      // mismatched amount could make it citable by the award flow (6.11 BD-3).
      { id: `${P}d1`, meetingId: `${P}mt1`, sequence: 1, domain: "appointment", subject: "Award of the head office cleaning contract", matterKind: null, matterRef: null, amount: "412000", act: "A", authorityRuleKey: "demo.purchase.high", ...tabled, tabledAt: day("2026-09-22") },
      {
        id: `${P}d2`, meetingId: `${P}mt2`, sequence: 1, domain: "appointment", subject: "Award of the fleet maintenance contract", matterKind: null, matterRef: null, amount: "655000", act: "A", ...tabled, tabledAt: day("2026-08-13"),
        outcome: "CARRIED", decisionDate: day("2026-08-20"), quorumRequired: 3, presentVoters: 3, recusedCount: 0, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
      },
      {
        id: `${P}d3`, meetingId: `${P}mt2`, sequence: 2, domain: "appointment", subject: "Award of the IT support contract", matterKind: null, matterRef: null, amount: "380000", act: "A", ...tabled, tabledAt: day("2026-08-13"),
        // Judged on two: the Finance Director, present, recused.
        outcome: "DEFERRED", decisionDate: day("2026-08-20"), quorumRequired: 3, presentVoters: 2, recusedCount: 1,
        outcomeNote: "The Finance Director's recusal left the Board inquorate on this matter. To be re-tabled at the next sitting.",
      },
      {
        id: `${P}d4`, meetingId: `${P}mt2`, sequence: 3, domain: "appointment", subject: "Award of the civil works package", matterKind: null, matterRef: null, amount: "1250000", act: "A", ...tabled, tabledAt: day("2026-08-13"),
        outcome: "NOT_CARRIED", decisionDate: day("2026-08-20"), quorumRequired: 3, presentVoters: 3, recusedCount: 0, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
        notApprovedOutcomeId: `${P}nao2`, notApprovedOutcomeNameEn: "Return for re-negotiation", notApprovedOutcomeKind: "LOOP", outcomeNote: "The tendered rates exceed the estimate by a margin the Board would not accept without negotiation.",
      },
      // The Director of Operations has an alternate and recuses: whether the alternate may
      // vote in his place is unset on the demo Tender Board, so the matter shows the gap.
      { id: `${P}d6`, meetingId: `${P}mt1`, sequence: 2, domain: "appointment", subject: "Renewal of the security services contract", matterKind: null, matterRef: null, amount: "520000", act: "A", ...tabled, tabledAt: day("2026-09-22") },
      { id: `${P}d5`, meetingId: `${P}mt3`, sequence: 1, domain: "appointment", subject: "Quotation for stationery supply", matterKind: null, matterRef: null, amount: "42000", act: "MR", authorityRuleKey: "demo.purchase.mid", ...tabled, tabledAt: day("2026-09-28") },
    ],
  });

  await db.decisionRecusal.createMany({
    data: [
      { id: `${P}rc1`, decisionId: `${P}d3`, personId: `${P}p2`, reason: "A family member is a director of one of the tenderers.", declaredAt: day("2026-08-20") },
      { id: `${P}rc2`, decisionId: `${P}d6`, personId: `${P}p7`, reason: "Previously employed by the incumbent contractor.", declaredAt: day("2026-09-22") },
    ],
  });

  const vote = (id: string, decisionId: string, personId: string, choice: "SETUJU" | "TIDAK_SETUJU", on: string, comment = "") => ({
    id: `${P}${id}`, decisionId: `${P}${decisionId}`, personId: `${P}${personId}`, choice, comment, votedAt: day(on), recordedAt: day(on),
  });
  await db.vote.createMany({
    data: [
      vote("v1", "d1", "p1", "SETUJU", "2026-09-29"),
      vote("v2", "d1", "p2", "SETUJU", "2026-09-29", "Subject to the performance bond."),
      vote("v3", "d2", "p1", "SETUJU", "2026-08-20"),
      vote("v4", "d2", "p2", "SETUJU", "2026-08-20"),
      vote("v5", "d2", "p8", "SETUJU", "2026-08-21"),
      vote("v6", "d4", "p1", "SETUJU", "2026-08-20"),
      vote("v7", "d4", "p2", "TIDAK_SETUJU", "2026-08-20", "Rates well above the estimate."),
      vote("v8", "d4", "p8", "TIDAK_SETUJU", "2026-08-21", "Negotiate first."),
    ],
  });

  // ------------------------------------------------------------ the authority
  await db.authorityMatrix.create({
    data: {
      id: `${P}mx1`, organisationId, label: "Demo limits, issue 1", effectiveFrom: from,
      boundaryValue: "300000", boundaryInclusive: true,
      quotationFloor: "15000", tenderFloor: "300000", requisitionBoundary: "50000",
      currency: "MYR", issuedAt: from,
      noRuleClause: "Demo policy 1.6", selfApprovalClause: "Demo policy 1.7", absenceClause: "Demo policy 1.8",
    },
  });

  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule1`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.purchase.low", domain: "purchase", maxValue: "15000", labelEn: "Purchase, below the quotation floor", approverCode: "SEC_PRE", clause: "DEMO 1.1", sortOrder: 1 },
      { id: `${P}rule2`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.purchase.mid", domain: "purchase", minValue: "15000", maxValue: "300000", followsBoundarySwitch: true, labelEn: "Purchase, quotation band", approverCode: "FD", committeeCode: "QUOTE_CTTE", committeeAct: "MR", clause: "DEMO 1.2", sortOrder: 2 },
      { id: `${P}rule3`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.purchase.high", domain: "purchase", minValue: "300000", followsBoundarySwitch: true, labelEn: "Purchase, tender band", approverCode: "TENDER_BOARD", committeeCode: "TENDER_BOARD", committeeAct: "A", nonDelegable: true, clause: "DEMO 1.3", sortOrder: 3 },
      { id: `${P}rule4`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.variation", domain: "variation", labelEn: "Variation order", isGap: true, gapNote: "The demo source is silent on variations above 20%.", clause: "DEMO 2.1", sortOrder: 4 },
    ],
  });

  await db.authorityRuleStep.createMany({
    data: [
      { id: `${P}st1`, authorityRuleId: `${P}rule2`, roleCode: "HOD_CP", act: "R", sequence: 1 },
      { id: `${P}st2`, authorityRuleId: `${P}rule3`, roleCode: "HOD_CP", act: "P", sequence: 1 },
      { id: `${P}st3`, authorityRuleId: `${P}rule3`, roleCode: "FD", act: "MR", sequence: 2 },
    ],
  });

  // ------------------------------------------------------------------ budget
  // A finance integration that is configured but has nothing behind it, and three
  // codes the two sides disagree about. Invented figures.
  await db.financeIntegration.create({
    data: {
      id: `${P}fi1`,
      organisationId,
      direction: "two_way",
      schedule: "nightly",
      varianceTolerance: "500.00",
      // Invented, like every demo setting: requisition checks read the portal ledger.
      budgetCheckSource: "PORTAL_LEDGER",
    },
  });

  await db.financeVariance.createMany({
    data: [
      // Note the difference is NOT the two shown figures subtracted once compacted:
      // 2.35M less 2.30M reads as 50K but the real gap is 47K.
      { id: `${P}fv1`, organisationId, budgetCodeCode: "CAP26-001", accountCode: "7300300", compares: "Allocation", portalAmount: "2350000.00", financeAmount: "2303000.00", reason: "Allocation revision not yet mirrored", lastSeenAt: day("2026-08-05") },
      { id: `${P}fv2`, organisationId, budgetCodeCode: "OPX26-014", accountCode: "6100100", compares: "Commitment", portalAmount: "700000.00", financeAmount: "712000.00", reason: "", lastSeenAt: day("2026-08-09") },
      // Inside the RM 500 tolerance, so it is listed but not counted as outstanding.
      { id: `${P}fv3`, organisationId, budgetCodeCode: "OPX26-022", accountCode: "6200200", compares: "Payment", portalAmount: "120000.00", financeAmount: "120300.00", reason: "Rounding on a part payment", lastSeenAt: day("2026-08-11") },
    ],
  });

  // Three budget years: one fully closed, one part-way through, one still planned.
  await db.budgetPeriod.createMany({
    data: [
      { id: `${P}bp202501`, organisationId, year: 2025, code: "P01", nameEn: "January 2025", startsOn: day("2025-01-01"), endsOn: day("2025-02-01"), openedOn: day("2025-01-01"), closedOn: day("2025-02-01"), sortOrder: 1 },
      { id: `${P}bp202502`, organisationId, year: 2025, code: "P02", nameEn: "February 2025", startsOn: day("2025-02-01"), endsOn: day("2025-03-01"), openedOn: day("2025-02-01"), closedOn: day("2025-03-01"), sortOrder: 2 },
      { id: `${P}bp202503`, organisationId, year: 2025, code: "P03", nameEn: "March 2025", startsOn: day("2025-03-01"), endsOn: day("2025-04-01"), openedOn: day("2025-03-01"), closedOn: day("2025-04-01"), sortOrder: 3 },
      { id: `${P}bp202504`, organisationId, year: 2025, code: "P04", nameEn: "April 2025", startsOn: day("2025-04-01"), endsOn: day("2025-05-01"), openedOn: day("2025-04-01"), closedOn: day("2025-05-01"), sortOrder: 4 },
      { id: `${P}bp202505`, organisationId, year: 2025, code: "P05", nameEn: "May 2025", startsOn: day("2025-05-01"), endsOn: day("2025-06-01"), openedOn: day("2025-05-01"), closedOn: day("2025-06-01"), sortOrder: 5 },
      { id: `${P}bp202506`, organisationId, year: 2025, code: "P06", nameEn: "June 2025", startsOn: day("2025-06-01"), endsOn: day("2025-07-01"), openedOn: day("2025-06-01"), closedOn: day("2025-07-01"), sortOrder: 6 },
      { id: `${P}bp202507`, organisationId, year: 2025, code: "P07", nameEn: "July 2025", startsOn: day("2025-07-01"), endsOn: day("2025-08-01"), openedOn: day("2025-07-01"), closedOn: day("2025-08-01"), sortOrder: 7 },
      { id: `${P}bp202508`, organisationId, year: 2025, code: "P08", nameEn: "August 2025", startsOn: day("2025-08-01"), endsOn: day("2025-09-01"), openedOn: day("2025-08-01"), closedOn: day("2025-09-01"), sortOrder: 8 },
      { id: `${P}bp202509`, organisationId, year: 2025, code: "P09", nameEn: "September 2025", startsOn: day("2025-09-01"), endsOn: day("2025-10-01"), openedOn: day("2025-09-01"), closedOn: day("2025-10-01"), sortOrder: 9 },
      { id: `${P}bp202510`, organisationId, year: 2025, code: "P10", nameEn: "October 2025", startsOn: day("2025-10-01"), endsOn: day("2025-11-01"), openedOn: day("2025-10-01"), closedOn: day("2025-11-01"), sortOrder: 10 },
      { id: `${P}bp202511`, organisationId, year: 2025, code: "P11", nameEn: "November 2025", startsOn: day("2025-11-01"), endsOn: day("2025-12-01"), openedOn: day("2025-11-01"), closedOn: day("2025-12-01"), sortOrder: 11 },
      { id: `${P}bp202512`, organisationId, year: 2025, code: "P12", nameEn: "December 2025", startsOn: day("2025-12-01"), endsOn: day("2026-01-01"), openedOn: day("2025-12-01"), closedOn: day("2026-01-01"), sortOrder: 12 },
      { id: `${P}bp202601`, organisationId, year: 2026, code: "P01", nameEn: "January 2026", startsOn: day("2026-01-01"), endsOn: day("2026-02-01"), openedOn: day("2026-01-01"), closedOn: day("2026-02-01"), sortOrder: 1 },
      { id: `${P}bp202602`, organisationId, year: 2026, code: "P02", nameEn: "February 2026", startsOn: day("2026-02-01"), endsOn: day("2026-03-01"), openedOn: day("2026-02-01"), closedOn: day("2026-03-01"), sortOrder: 2 },
      { id: `${P}bp202603`, organisationId, year: 2026, code: "P03", nameEn: "March 2026", startsOn: day("2026-03-01"), endsOn: day("2026-04-01"), openedOn: day("2026-03-01"), closedOn: day("2026-04-01"), sortOrder: 3 },
      { id: `${P}bp202604`, organisationId, year: 2026, code: "P04", nameEn: "April 2026", startsOn: day("2026-04-01"), endsOn: day("2026-05-01"), openedOn: day("2026-04-01"), closedOn: day("2026-05-01"), sortOrder: 4 },
      { id: `${P}bp202605`, organisationId, year: 2026, code: "P05", nameEn: "May 2026", startsOn: day("2026-05-01"), endsOn: day("2026-06-01"), openedOn: day("2026-05-01"), closedOn: day("2026-06-01"), sortOrder: 5 },
      { id: `${P}bp202606`, organisationId, year: 2026, code: "P06", nameEn: "June 2026", startsOn: day("2026-06-01"), endsOn: day("2026-07-01"), openedOn: day("2026-06-01"), closedOn: day("2026-07-01"), sortOrder: 6 },
      { id: `${P}bp202607`, organisationId, year: 2026, code: "P07", nameEn: "July 2026", startsOn: day("2026-07-01"), endsOn: day("2026-08-01"), openedOn: day("2026-07-01"), closedOn: day("2026-08-01"), sortOrder: 7 },
      { id: `${P}bp202608`, organisationId, year: 2026, code: "P08", nameEn: "August 2026", startsOn: day("2026-08-01"), endsOn: day("2026-09-01"), openedOn: day("2026-08-01"), closedOn: null, sortOrder: 8 },
      { id: `${P}bp202609`, organisationId, year: 2026, code: "P09", nameEn: "September 2026", startsOn: day("2026-09-01"), endsOn: day("2026-10-01"), openedOn: null, closedOn: null, sortOrder: 9 },
      { id: `${P}bp202610`, organisationId, year: 2026, code: "P10", nameEn: "October 2026", startsOn: day("2026-10-01"), endsOn: day("2026-11-01"), openedOn: null, closedOn: null, sortOrder: 10 },
      { id: `${P}bp202611`, organisationId, year: 2026, code: "P11", nameEn: "November 2026", startsOn: day("2026-11-01"), endsOn: day("2026-12-01"), openedOn: null, closedOn: null, sortOrder: 11 },
      { id: `${P}bp202612`, organisationId, year: 2026, code: "P12", nameEn: "December 2026", startsOn: day("2026-12-01"), endsOn: day("2027-01-01"), openedOn: null, closedOn: null, sortOrder: 12 },
      { id: `${P}bp202701`, organisationId, year: 2027, code: "P01", nameEn: "January 2027", startsOn: day("2027-01-01"), endsOn: day("2027-02-01"), openedOn: null, closedOn: null, sortOrder: 1 },
      { id: `${P}bp202702`, organisationId, year: 2027, code: "P02", nameEn: "February 2027", startsOn: day("2027-02-01"), endsOn: day("2027-03-01"), openedOn: null, closedOn: null, sortOrder: 2 },
      { id: `${P}bp202703`, organisationId, year: 2027, code: "P03", nameEn: "March 2027", startsOn: day("2027-03-01"), endsOn: day("2027-04-01"), openedOn: null, closedOn: null, sortOrder: 3 },
      { id: `${P}bp202704`, organisationId, year: 2027, code: "P04", nameEn: "April 2027", startsOn: day("2027-04-01"), endsOn: day("2027-05-01"), openedOn: null, closedOn: null, sortOrder: 4 },
      { id: `${P}bp202705`, organisationId, year: 2027, code: "P05", nameEn: "May 2027", startsOn: day("2027-05-01"), endsOn: day("2027-06-01"), openedOn: null, closedOn: null, sortOrder: 5 },
      { id: `${P}bp202706`, organisationId, year: 2027, code: "P06", nameEn: "June 2027", startsOn: day("2027-06-01"), endsOn: day("2027-07-01"), openedOn: null, closedOn: null, sortOrder: 6 },
      { id: `${P}bp202707`, organisationId, year: 2027, code: "P07", nameEn: "July 2027", startsOn: day("2027-07-01"), endsOn: day("2027-08-01"), openedOn: null, closedOn: null, sortOrder: 7 },
      { id: `${P}bp202708`, organisationId, year: 2027, code: "P08", nameEn: "August 2027", startsOn: day("2027-08-01"), endsOn: day("2027-09-01"), openedOn: null, closedOn: null, sortOrder: 8 },
      { id: `${P}bp202709`, organisationId, year: 2027, code: "P09", nameEn: "September 2027", startsOn: day("2027-09-01"), endsOn: day("2027-10-01"), openedOn: null, closedOn: null, sortOrder: 9 },
      { id: `${P}bp202710`, organisationId, year: 2027, code: "P10", nameEn: "October 2027", startsOn: day("2027-10-01"), endsOn: day("2027-11-01"), openedOn: null, closedOn: null, sortOrder: 10 },
      { id: `${P}bp202711`, organisationId, year: 2027, code: "P11", nameEn: "November 2027", startsOn: day("2027-11-01"), endsOn: day("2027-12-01"), openedOn: null, closedOn: null, sortOrder: 11 },
      { id: `${P}bp202712`, organisationId, year: 2027, code: "P12", nameEn: "December 2027", startsOn: day("2027-12-01"), endsOn: day("2028-01-01"), openedOn: null, closedOn: null, sortOrder: 12 },
    ],
  });

  await db.budgetYear.createMany({
    data: [
      { id: `${P}by2025`, organisationId, year: 2025, rollUnspentForward: false },
      { id: `${P}by2026`, organisationId, year: 2026, rollUnspentForward: true },
      // 2027 deliberately absent, so the switch renders as not set rather than off.
    ],
  });

  // Budget codes, and the ledger that says what each is worth. Invented figures.
  await db.budgetSettings.create({
    data: {
      id: `${P}bs1`,
      organisationId,
      availabilityCheck: "blocking",
      warningThresholdPercent: 85,
      commitOnApproval: true,
    },
  });

  await db.budgetCode.createMany({
    data: [
      { id: `${P}bcode1`, organisationId, code: "CAP26-001", descriptionEn: "Pipe replacement programme", descriptionMs: "Program penggantian paip", type: "Capital", owningUnitCode: "NTH", accountCode: "7300300", holderPersonId: `${P}p6`, effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") },
      { id: `${P}bcode2`, organisationId, code: "OPX26-014", descriptionEn: "Treatment chemicals", descriptionMs: "Bahan kimia rawatan", type: "Operating", owningUnitCode: "OPS", accountCode: "6100100", holderPersonId: `${P}p2`, effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") },
      { id: `${P}bcode3`, organisationId, code: "OPX26-022", descriptionEn: "Network maintenance", type: "Operating", owningUnitCode: "CP", accountCode: "6200200", effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") },
      { id: `${P}bcode4`, organisationId, code: "CAP25-009", descriptionEn: "Meter replacement, phase one", type: "Capital", owningUnitCode: "NTH", accountCode: "7300300", isActive: false, effectiveFrom: day("2025-01-01"), effectiveTo: day("2026-01-01") },
    ],
  });

  await db.budgetMovement.createMany({
    data: [
      // A code well inside its budget.
      { id: `${P}bm1`, budgetCodeId: `${P}bcode1`, kind: "ORIGINAL", amount: "8600000.00", occurredOn: day("2026-01-01"), reference: "BR26-001" },
      { id: `${P}bm2`, budgetCodeId: `${P}bcode1`, kind: "ACTUAL_SPEND", amount: "5937100.00", occurredOn: day("2026-04-12"), reference: "PROC2026001648", description: "Certified progress payment" },
      // One over the warning threshold, so the meter renders its warn tone.
      { id: `${P}bm3`, budgetCodeId: `${P}bcode2`, kind: "ORIGINAL", amount: "1200000.00", occurredOn: day("2026-01-01"), reference: "BR26-014" },
      { id: `${P}bm4`, budgetCodeId: `${P}bcode2`, kind: "REVISION", amount: "140000.00", occurredOn: day("2026-05-02"), reference: "BR26-118", description: "Approved uplift" },
      { id: `${P}bm5`, budgetCodeId: `${P}bcode2`, kind: "COMMITMENT", amount: "700000.00", occurredOn: day("2026-03-01"), reference: "DEMO/REQ/0011" },
      { id: `${P}bm6`, budgetCodeId: `${P}bcode2`, kind: "ACTUAL_SPEND", amount: "520000.00", occurredOn: day("2026-05-20"), reference: "PROC2026001702" },
      // A transfer, so the allocation ledger has both sides.
      { id: `${P}bm7`, budgetCodeId: `${P}bcode3`, kind: "ORIGINAL", amount: "640000.00", occurredOn: day("2026-01-01"), reference: "BR26-022" },
      { id: `${P}bm8`, budgetCodeId: `${P}bcode3`, kind: "TRANSFER_OUT", amount: "95000.00", occurredOn: day("2026-06-01"), reference: "BT26-660", counterpartCode: "CAP26-001", description: "Moved to pipe replacement" },
      { id: `${P}bm9`, budgetCodeId: `${P}bcode1`, kind: "TRANSFER_IN", amount: "95000.00", occurredOn: day("2026-06-01"), reference: "BT26-660", counterpartCode: "OPX26-022" },
      // A commitment that was released without being spent.
      { id: `${P}bm10`, budgetCodeId: `${P}bcode3`, kind: "COMMITMENT", amount: "60000.00", occurredOn: day("2026-02-10"), reference: "DEMO/REQ/0012", releasedOn: day("2026-04-01"), releaseNote: "Requirement withdrawn" },
      // A code with no allocation at all, so "not set" renders rather than 0%.
    ],
  });

  // -------------------------------------------------------------- the vocabulary
  await db.fundingRoute.createMany({
    data: [
      { id: `${P}fr1`, organisationId, code: "opex", nameEn: "Operating budget", approvalCommitsBudget: true, approvalCommitsBudgetProvenance: "ASSUMED", trigger: "Approved requisition", governingSource: "Demo policy 3.1", provenance: "STATED", sortOrder: 1 },
      { id: `${P}fr2`, organisationId, code: "capex", nameEn: "Capital budget", approvalCommitsBudget: true, approvalCommitsBudgetProvenance: "ASSUMED", trigger: "Capital allocation", governingSource: "Demo policy 3.2", provenance: "STATED", sortOrder: 2 },
      { id: `${P}fr3`, organisationId, code: "funder_led", nameEn: "Funder sets the route", routeDecidedExternally: true, supersedesAuthority: true, requiresExternalAuthorityRef: true, externalAuthorityRefLabel: "Funder execution letter", trigger: "Funder's execution letter", provenance: "OBSERVED", sortOrder: 3 },
      { id: `${P}fr4`, organisationId, code: "supervision", nameEn: "Supervision only", approvalCommitsBudget: false, approvalCommitsBudgetProvenance: "ASSUMED", organisationProcures: false, supersedesAuthority: true, trigger: "Application by letter", provenance: "OBSERVED", sortOrder: 4 },
    ],
  });

  await db.sourcingMethod.createMany({
    data: [
      { id: `${P}sm1`, organisationId, code: "open_tender", nameEn: "Open tender", nameMs: "Tender Terbuka", availableInTender: true, requiresAdvertisement: true, awardInstrument: "Letter of Acceptance", committeeCode: "TENDER_BOARD", authorityMethodKey: "tender", governingSource: "Demo policy 4.1", provenance: "STATED", sortOrder: 1 },
      { id: `${P}sm2`, organisationId, code: "open_quotation", nameEn: "Open quotation", nameMs: "Sebut Harga Terbuka", availableInQuotation: true, requiresAdvertisement: true, awardInstrument: "Appointment letter", committeeCode: "QUOTE_CTTE", authorityMethodKey: "quotation", governingSource: "Demo policy 4.2", provenance: "STATED", sortOrder: 2 },
      { id: `${P}sm3`, organisationId, code: "direct", nameEn: "Direct appointment", nameMs: "Lantikan Terus", availableInTender: true, availableInQuotation: true, availableBelow: true, awardInstrument: "Purchase order", authorityMethodKey: "direct", provenance: "OBSERVED", sortOrder: 3 },
      { id: `${P}sm4`, organisationId, code: "term_contract", nameEn: "Called off a term contract", availableInTender: true, availableInQuotation: true, availableBelow: true, requiresFreshSourcing: false, awardInstrument: "Indent", provenance: "ASSUMED", sortOrder: 4 },
    ],
  });

  await db.contractType.createMany({
    data: [
      { id: `${P}ct1`, organisationId, code: "works", nameEn: "Works", nameMs: "Kerja", governingSource: "Demo policy 5", provenance: "STATED", sortOrder: 1 },
      { id: `${P}ct2`, organisationId, code: "services", nameEn: "Services", nameMs: "Perkhidmatan", governingSource: "Demo policy 5", provenance: "STATED", sortOrder: 2 },
      { id: `${P}ct3`, organisationId, code: "supply", nameEn: "Supply", nameMs: "Bekalan", provenance: "ASSUMED", sortOrder: 3 },
    ],
  });

  // ------------------------------------------------------------------ records
  await db.numberingSeries.createMany({
    data: [
      { id: `${P}n1`, organisationId, key: "requisition", nameEn: "Requisitions", pattern: "DEMO/REQ/{SERIAL}/{YEAR}", padding: 4, resetOn: "CALENDAR_YEAR", nextSerial: 12, serialPeriod: "2026", provenance: "STATED" },
      { id: `${P}n2`, organisationId, key: "contract", nameEn: "Contracts", pattern: "DEMO/KP/T/{SERIAL}/{YEAR}", padding: 3, resetOn: "CALENDAR_YEAR", nextSerial: 4, serialPeriod: "2026", provenance: "STATED" },
      { id: `${P}n4`, organisationId, key: "meeting", nameEn: "Committee sittings", pattern: "DEMO/SIT/{SERIAL}/{YEAR}", padding: 1, resetOn: "CALENDAR_YEAR", nextSerial: 5, serialPeriod: "2026", provenance: "ASSUMED" },
      { id: `${P}n3`, organisationId, key: "certificate", nameEn: "Certificates", pattern: "DEMO/CERT/{SERIAL}", padding: 5, resetOn: "NEVER", nextSerial: 231, provenance: "OBSERVED" },
    ],
  });

  await db.documentClass.createMany({
    data: [
      // Document store (§9): Internal, assumed; SULIT; and correspondence left unclassified.
      { id: `${P}dc1`, organisationId, code: "contract", nameEn: "Contract documents", retentionMonths: 84, controlledCopy: true, releaseNeedsApproval: true, classification: "INTERNAL", retentionTrigger: "CONTRACT_FINAL_ACCOUNT", disposalMethod: "REVIEW", provenance: "STATED", notes: "Classification Internal is assumed for the demo.", sortOrder: 1 },
      { id: `${P}dc2`, organisationId, code: "certificate", nameEn: "Certificates", retentionMonths: 84, controlledCopy: true, classification: "SULIT", provenance: "STATED", sortOrder: 2 },
      { id: `${P}dc3`, organisationId, code: "correspondence", nameEn: "Correspondence", provenance: "ASSUMED", sortOrder: 3 },
    ],
  });

  await db.documentTemplate.createMany({
    data: [
      { id: `${P}dt1`, organisationId, code: "loa", nameEn: "Letter of Acceptance", formCode: "DEMO-F-001", revisionDate: day("2025-06-01"), bilingual: true, documentClassId: `${P}dc1`, provenance: "STATED", sortOrder: 1 },
      { id: `${P}dt2`, organisationId, code: "interim_cert", nameEn: "Interim payment certificate", formCode: "DEMO-F-014", revisionDate: day("2025-06-01"), bilingual: true, documentClassId: `${P}dc2`, provenance: "STATED", sortOrder: 2 },
      { id: `${P}dt3`, organisationId, code: "routing_sheet", nameEn: "Approval routing sheet", formCode: "DEMO-F-022", provenance: "OBSERVED", sortOrder: 3 },
    ],
  });

  await db.notificationRule.createMany({
    data: [
      { id: `${P}nr1`, organisationId, eventKey: "requisition_submitted", nameEn: "Requisition submitted", recipientRoleCodes: ["HOD_CP", "SEC_PRE"], reminderOffsetDays: [7, 3, 1], escalatesToRoleCode: "FD", provenance: "STATED", sortOrder: 1 },
      { id: `${P}nr2`, organisationId, eventKey: "award_approved", nameEn: "Award approved", recipientRoleCodes: ["FD", "HOD_CP"], reminderOffsetDays: [], provenance: "STATED", sortOrder: 2 },
      { id: `${P}nr3`, organisationId, eventKey: "bid_unsuccessful", nameEn: "Unsuccessful bidder notified", recipientRoleCodes: [], reminderOffsetDays: [], isActive: false, notes: "The demo source provides for no notification. Recorded as a decision.", provenance: "OBSERVED", sortOrder: 3 },
    ],
  });

  // The minuted sitting carries the register frozen as it stood, as minuting writes it.
  await loadRequisitions(organisationId, from);
  await loadMethodSelection(organisationId, from);
  const awardExercises = await loadAwardSetup(db, organisationId, from);
  // 6.13 Part A step 5: demo_con13's requisition and exercise, determined with the others.
  const lifecycleExercises = await loadLifecycleSetup(db, organisationId);
  const scopeExercises = await loadScopeExercises(db, organisationId);

  await determineExercises([`${P}sx1`, `${P}sx2`, `${P}sx3`, `${P}sx4`, `${P}sx5`, `${P}sx6`, `${P}sx7`, ...awardExercises, ...lifecycleExercises, ...scopeExercises], LIFECYCLE_PREPARED);
  await loadAwards(db, organisationId);
  // 6.13 Part A step 5: demo_aw13 on its Tender Board sitting, issued and returned; demo_con13 numbered.
  const lifecycleSittings = await loadLifecycleAward(db, organisationId);
  await nameRouteTrail(organisationId);
  await loadCloseout(organisationId);
  const minuted = [`${P}mt2`, `${P}mt5`, `${P}mt6`, `${P}mt7`, `${P}mt8`, `${P}mt9`, `${P}mt30`, ...lifecycleSittings];
  // Their History: the trail the sitting actions would have written (6.10 local review 4).
  await loadSittingTrail(db, organisationId, minuted);
  await snapshotMinuted(minuted);
  // 6.2: bills, panels and estimates, before the documents that attach to the panels.
  await loadScope(db, organisationId);
  // 6.2 increment 2 (X-4): sx15's scope matter at the Technical Committee, with its trail and register.
  const scopeSittings = await loadScopeSitting(db);
  await loadSittingTrail(db, organisationId, scopeSittings);
  await snapshotMinuted(scopeSittings);
  // Documents last: they attach to sittings, exercises, awards, delegations and panels.
  await loadDocuments(db, organisationId);
  // X-10 c: every 6.2 row passes the checks of its act, judged once the scans are attached and
  // before 6.4 moves the exercises on (each act judged in the state it was made in).
  await checkScope();
  // 6.4: tender and quotation documents, after the scope rows and documents they stand on;
  // each act checked by the product's own rules as it is written, then the whole read back.
  await loadTenderDocs(db, organisationId);
  await checkTenderDocs(db);
  // 6.5: the invitation windows, on exercises taken through 6.2's and 6.4's acts; every act judged
  // as it is written and dated relative to the load day, then each phase read back (X-10).
  // 6.6 CR-2: the method's bid-receipt rules are set first, so each publication freezes them.
  await configureBidsDemo(db, organisationId);
  // 6.8 (E-12): the evaluation models and policy before any publication, so each publication pins a model.
  await configureEvaluationDemo(db, organisationId);
  const windowSittings = (await loadWindowDemo(db, organisationId, { determine: determineExercises })).sittings;
  await loadSittingTrail(db, organisationId, windowSittings);
  await snapshotMinuted(windowSittings);
  await checkWindowDemo(db);
  // 6.6: the envelope register on sx16 (closed above) and on its own closed tender sx20, every act
  // judged by the product's rules as it is written and dated relative to the load day (X-10).
  const bidSittings = (await loadBidsDemo(db, organisationId, { determine: determineExercises })).sittings;
  await loadSittingTrail(db, organisationId, bidSittings);
  await snapshotMinuted(bidSittings);
  // 6.7: the opening's configuration, then sx16's openings (the late envelope admitted above opened at
  // its supplementary opening) and sx20's adjourned one, every act judged as it is written (X-10).
  await configureOpeningDemo(db, organisationId);
  await loadOpeningDemo(db, organisationId);
  // 6.8: sx16 evaluated (report issued, Kertas Cadangan checked and recommended) and its appointment
  // tabled at the Tender Board's sitting in progress; every act judged as it is written (X-10).
  await loadEvaluationDemo(db, organisationId, { determine: determineExercises });
  // 64-C4 (6.4 Q-1 B): an award on sx16, closed above, opened from its frozen Appendix with one
  // justified difference; its acts judged by the product's own rules, then read back.
  await loadAppendixAward(db);
  await checkAppendixAward();
  // 6.6 read back after the award (64-C4-d: demo_aw7 is not held back by the register).
  await checkBidsDemo(db);
  // 6.7 read back after the award (C-8: demo_aw7 names a bidder carried at sx16's opening).
  await checkOpeningDemo(db);
  // 6.8 read back after the award (E-9: demo_aw7 names the recommended tenderer).
  await checkEvaluationDemo(db);
  // SR-05 to SR-07 (rulings 8, 9, 11): the officers named to open, and the preparation of the pack still being prepared.
  {
    const officers = await loadOpeningOfficersDemo(db, organisationId);
    console.log(`Opening officers named: ${officers.named}${officers.left.length ? `; left as they are: ${officers.left.join("; ")}` : ""}`);
  }
  // SR-08, SR-09, SR-11 (rulings 12 to 14): the organisation's scope switches both off, and the prescribed bill workbook as the bill part's template file.
  {
    const made = await loadScopeSwitchesDemo(db, organisationId);
    console.log(`Scope switches: setting ${made.policySet ? "set (both off)" : "already set"}; ${made.pinned} exercise(s) took it; template file set on ${made.templateSet} part(s).`);
  }
  // 6.15a: the supplier register, its configuration and seven suppliers recorded from paper; every act
  // judged by the product's own rules as it is written and dated relative to the load day (X-10).
  await configureSuppliersDemo(db, organisationId);
  await loadSuppliersDemo(db, organisationId);
  await checkSuppliersDemo(db);
  // Phase 4b: the supplier's own registration, its settings and declarations' wording, and three registrations at three stages (prisma/demo-registration.ts).
  await configureRegistrationDemo(db, organisationId);
  await loadRegistrationDemo(db, organisationId);
  await checkRegistrationDemo(db);
  // 6.12: the three numbered contracts formed, each act judged by the product's own rules as it is
  // written, nothing dated after the load day (X-10); read back through the product's own readings.
  if (await configureContractsDemo(db, organisationId)) {
    // 6.13 Part A: the S.O. rows first, as the employer's signature resolves the S.O. from them.
    await configureSupervisionDemo(db, organisationId);
    await loadContractsDemo(db, organisationId);
    await checkContractsDemo(db);
    // 6.14 increment 1: forms, routing sheet types and five certificates on demo_con3, each act judged by
    // the product's own rules as it is written (X-10); demo_aw5's pre-award routing sheet.
    await configureCertificatesDemo(db, organisationId);
    // 6.14 increment 2: the printed form, a typing correction and a term, through Configuration's own acts, before
    // demo_con13's story begins, so the certificates it raises pin and freeze them (prisma/demo-fidelity.ts).
    await configureFidelityDemo(db);
    // 6.13 Part A step 3: the payment rows on the matrix, the payment certificates' forms, the clocks and the
    // controls (demo_hct1 is raised from interim valuation 1, so these come first).
    await configurePaymentDemo(db, organisationId);
    // 6.13 Part A step 5: demo_con13's life from formation to its third interim certificate (June to October), every
    // step the product's own act at the instant the story says (prisma/demo-acts.ts); before con3's certificates, so
    // the series numbers them in the order they were issued.
    await configureLifecycleDemo(db, organisationId);
    await loadLifecycleDemo(db, organisationId);
    await loadCertificatesDemo(db, organisationId);
    await checkCertificatesDemo(db);
    // 6.13 Part A run 1: demo_con3's supervision, possessed and In Delay (after the certificates, which read it stamped).
    await loadSupervisionDemo(db, organisationId);
    await checkSupervisionDemo(db);
    // 6.13 Part A step 3: interim valuation 2 on the contractor's claim, raised and sent for approval on the matrix.
    await loadPaymentDemo(db, organisationId);
    await checkPaymentDemo(db);
    // 6.13 Part A step 5: a variation on demo_con3 waiting at a person's step; the whole of Part A read back.
    await loadLifecycleCon3(db);
    await checkLifecycleDemo(db);
    await checkFidelityDemo(db);
  }
  // Phase 3c: a few reporting lines and the memo rule, set only for the demonstration (the product ships both empty). `npm run demo:inbox` applies them alone.
  await loadInboxDemo(db, organisationId);
  // Phase 4c: the supplier's own Company workspace (an applicant asked to resubmit, certificates near their expiry, a change of bank details found not in order, a requirement entered as a grade and a category). `npm run demo:company` applies it alone.
  await loadCompanyDemo(db, organisationId);
  // Phase 4d: the supplier's My Bids workspace (prisma/demo-my-bids.ts).
  await loadMyBidsDemo(db, organisationId);
  // Phase 4e: the contractor's My Projects workspace and the announcements board (prisma/demo-my-projects.ts).
  await loadMyProjectsDemo(db, organisationId);
  // ADR 0042: the Project workspace on the same contract: documents in each state of the simple flow, and the kick-off meeting held (prisma/demo-project-documents.ts).
  await loadProjectDocumentsDemo(db, organisationId);
  // Wave 3b step 18 (rulings 12c, 12d, 20z): the online sealed-bid demonstration, after every authored exercise is pinned on paper and before the Results fixture (which stays the last of the
  // demo's own data, and is written on paper whatever the channel). Only here, on a fresh database.
  await loadOnlineDemo(db, organisationId);
  // AC-65: the sample sign-in settings and the three grants, written here, on a fresh database, and never by `demo:accounts` on a loaded one.
  await loadDemoSignInAndGrants(db, { id: organisationId, name: org.name });
  // Ruling 4 (2026-10-06): one advertised quotation taken to an issued award, so the public Results page has a row;
  // last, on everything above (prisma/demo-results.ts). `npm run demo:results` applies it alone to a loaded database.
  await loadResultsDemo(db, organisationId, { determine: determineExercises });
  await checkResultsDemo(db);
  // AC-20 (wave C step C10): the award and exercise registers moved past the later-stage cases' references, and every stage of the case
  // list read back from the same filters the list uses.
  await finishCaseStages(db);
  await checkCaseStages(db, organisationId, new Date().toISOString().slice(0, 10));
  // Phase 2b: the rows the loaders wrote straight into the tables are attributed to the demo loader, as the acts it ran already are.
  await attributeSeededRows(db, organisationId);

  console.log("Demo data loaded. This is invented data for comparing screens — never ship it.");
  console.log("It stays: the trail is permanent, so a demonstration database is replaced by a new one, never emptied.");
}

/**
 * Requisitions (6.1): a department with a section, the requisition bands, the
 * controls, and one requisition in each state worth seeing. Invented throughout.
 *
 * Every stored figure and snapshot is what the portal's own rules would have written
 * on the day: budget checks are the ledger on their date, split checks the policy
 * applied to the requisitions that existed then, routes the demo matrix resolved.
 * The head of the Northern Region endorses at the department tier and, holding the
 * Head of Department office for that unit directly, decides its step (ruling BD-1).
 */
async function loadRequisitions(organisationId: string, from: Date) {
  const REQ = (n: number) => `DEMO/REQ/${String(n).padStart(4, "0")}/2026`;

  await db.person.createMany({
    data: [
      { id: `${P}p9`, organisationId, staffNo: "D009", name: "Imran Hakim", email: "imran.hakim@demo.invalid", jobTitle: "Head, Northern Region", jobTitleMs: "Ketua Wilayah Utara", authorityLevel: "Head of Department", department: "Northern Region" },
      { id: `${P}p10`, organisationId, staffNo: "D010", name: "Lim Kok Seng", email: "kokseng.lim@demo.invalid", jobTitle: "Section Head, Maintenance", jobTitleMs: "Ketua Seksyen Penyelenggaraan", authorityLevel: "Section", department: "Northern Region" },
      { id: `${P}p11`, organisationId, staffNo: "D011", name: "Nurul Izzah Kamal", email: "nurul.izzah@demo.invalid", jobTitle: "Maintenance Engineer", jobTitleMs: "Jurutera Penyelenggaraan", authorityLevel: "Officer", department: "Northern Region" },
      { id: `${P}p12`, organisationId, staffNo: "D012", name: "Suresh Pillai", email: "suresh.pillai@demo.invalid", jobTitle: "Deputy Head, Northern Region", jobTitleMs: "Timbalan Ketua Wilayah Utara", authorityLevel: "Head of Department", department: "Northern Region" },
    ],
  });

  // The Northern Region's head changed in July; the section is new.
  await db.orgUnit.update({ where: { id: `${P}u5` }, data: { effectiveTo: day("2026-07-01") } });
  await db.orgUnit.createMany({
    data: [
      { id: `${P}u7`, organisationId, code: "NTH", nameEn: "Northern Region", kind: "DEPARTMENT", parentCode: "OPS", costCentreCode: "CC-200", headPersonId: `${P}p9`, provenance: "STATED", sortOrder: 5, effectiveFrom: day("2026-07-01") },
      { id: `${P}u6`, organisationId, code: "NTH-MNT", nameEn: "Maintenance Section", nameMs: "Seksyen Penyelenggaraan", kind: "SECTION", parentCode: "NTH", costCentreCode: "CC-200", headPersonId: `${P}p10`, provenance: "OBSERVED", sortOrder: 6, effectiveFrom: from },
    ],
  });

  await db.authorityRole.createMany({
    data: [
      { id: `${P}r9`, organisationId, code: "DEPT_HEAD", nameEn: "Head of Department", nameMs: "Ketua Jabatan", workspace: "Internal", authorityLevel: "Head of Department", escalatesToCode: "DIV_HEAD", sortOrder: 9 },
      { id: `${P}r10`, organisationId, code: "DIV_HEAD", nameEn: "Head of Division", nameMs: "Ketua Bahagian", workspace: "Internal", authorityLevel: "Head of Division", escalatesToCode: "FD", sortOrder: 10 },
    ],
  });
  await db.roleAssignment.createMany({
    data: [
      { id: `${P}a5`, personId: `${P}p6`, roleCode: "DEPT_HEAD", scope: "NTH", effectiveFrom: from, effectiveTo: day("2026-07-01") },
      { id: `${P}a6`, personId: `${P}p9`, roleCode: "DEPT_HEAD", scope: "NTH", effectiveFrom: day("2026-07-01") },
      { id: `${P}a7`, personId: `${P}p7`, roleCode: "DIV_HEAD", scope: "OPS", effectiveFrom: from },
    ],
  });
  // The requisition bands, on the demo issue. They do not follow the boundary switch.
  const band = { authorityMatrixId: `${P}mx1`, domain: "requisition", followsBoundarySwitch: false };
  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule5`, ...band, ruleKey: "demo.requisition.1", maxValue: "1000", labelEn: "Requisition, up to RM1,000", approverCode: "DEPT_HEAD", clause: "DEMO 3.1(a)", sortOrder: 5 },
      // .2 to .4 take their chains from the demo core routing below (FR-APR-004): .3 and
      // .4 name no proposer of their own — the core routing puts the Head of Department
      // first — and add only what they strengthen. .1 and the over-budget rule are left
      // undecided, as an issue ships, and warn that their chain was not checked.
      { id: `${P}rule6`, ...band, ruleKey: "demo.requisition.2", minValue: "1000", maxValue: "40000", labelEn: "Requisition, RM1,000 to RM40,000", approverCode: "DIV_HEAD", generateCoreChain: true, clause: "DEMO 3.1(b)", sortOrder: 6 },
      { id: `${P}rule7`, ...band, ruleKey: "demo.requisition.3", minValue: "40000", maxValue: "250000", labelEn: "Requisition, RM40,000 to RM250,000", approverCode: "FD", generateCoreChain: true, clause: "DEMO 3.1(c)", sortOrder: 7 },
      { id: `${P}rule8`, ...band, ruleKey: "demo.requisition.4", minValue: "250000", labelEn: "Requisition, above RM250,000", approverCode: "CEO", generateCoreChain: true, clause: "DEMO 3.1(d)", sortOrder: 8 },
      { id: `${P}rule9`, ...band, ruleKey: "demo.requisition.over_budget", cond: "over_budget", labelEn: "Requisition over budget", approverCode: "BOARD", committeeCode: "BOARD", committeeAct: "A", clause: "DEMO 3.2", sortOrder: 9 },
    ],
  });
  await db.authorityRuleStep.createMany({
    data: [
      { id: `${P}st4`, authorityRuleId: `${P}rule6`, roleCode: "DEPT_HEAD", act: "R", sequence: 1 },
      { id: `${P}st5`, authorityRuleId: `${P}rule7`, roleCode: "DIV_HEAD", act: "R", sequence: 1 },
      { id: `${P}st6`, authorityRuleId: `${P}rule8`, roleCode: "DIV_HEAD", act: "R", sequence: 1 },
      { id: `${P}st7`, authorityRuleId: `${P}rule8`, roleCode: "FD", act: "MR", sequence: 2 },
      { id: `${P}st8`, authorityRuleId: `${P}rule9`, roleCode: "CEO", act: "MR", sequence: 1 },
    ],
  });
  // The demo issue's core routing: invented, ASSUMED, the chain beneath each approving
  // office. The flagged requisition rules generate exactly the chains the demo routes
  // below were opened with.
  const coreLevel = (n: number, approverCode: string, sortOrder: number) => ({
    id: `${P}core${n}`, organisationId, authorityMatrixId: `${P}mx1`, approverCode, clause: "DEMO 2.2", provenance: "ASSUMED" as const, sortOrder,
    note: "Invented for the demo.",
  });
  await db.coreRoutingLevel.createMany({
    data: [coreLevel(1, "DEPT_HEAD", 1), coreLevel(2, "DIV_HEAD", 2), coreLevel(3, "FD", 3), coreLevel(4, "CEO", 4)],
  });
  const coreStep = (n: number, level: number, roleCode: string, act: "P" | "R", sequence: number) => ({
    id: `${P}cs${n}`, organisationId, coreRoutingLevelId: `${P}core${level}`, roleCode, act, sequence, provenance: "ASSUMED" as const,
  });
  await db.coreRoutingStep.createMany({
    data: [
      coreStep(1, 2, "DEPT_HEAD", "R", 1),
      coreStep(2, 3, "DEPT_HEAD", "P", 1),
      coreStep(3, 3, "DIV_HEAD", "R", 2),
      coreStep(4, 4, "DEPT_HEAD", "P", 1),
      coreStep(5, 4, "DIV_HEAD", "R", 2),
      coreStep(6, 4, "FD", "R", 3),
    ],
  });

  // A funder's rule set for the funder-led route, issued and empty (OQ-06).
  await db.authorityMatrix.create({
    data: {
      id: `${P}mx2`, organisationId, label: "Demo funder's rules, issue 1", fundingRouteCode: "funder_led", effectiveFrom: day("2026-01-01"), issuedAt: day("2026-01-01"),
      boundaryValue: "300000", boundaryInclusive: true, quotationFloor: "15000", tenderFloor: "300000", requisitionBoundary: "50000", currency: "MYR",
    },
  });

  // An unissued revision of the demo limits, so the rule editor has a draft to open.
  // Invented for review: not drawn from any source, and it routes nothing until issued.
  await db.authorityMatrix.create({
    data: {
      id: `${P}mx3`, organisationId, label: "Demo limits, draft revision (invented, for review)", effectiveFrom: day("2027-01-01"), issuedAt: null,
      boundaryValue: "300000", boundaryInclusive: true, quotationFloor: "20000", tenderFloor: "300000", requisitionBoundary: "50000", currency: "MYR",
    },
  });
  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule_draft1`, authorityMatrixId: `${P}mx3`, ruleKey: "demo.purchase.low", domain: "purchase", maxValue: "20000", labelEn: "Purchase, below the quotation floor (invented draft)", approverCode: "SEC_PRE", clause: "DEMO DRAFT 1.1", sortOrder: 1 },
      { id: `${P}rule_draft2`, authorityMatrixId: `${P}mx3`, ruleKey: "demo.purchase.mid", domain: "purchase", minValue: "20000", maxValue: "300000", followsBoundarySwitch: true, labelEn: "Purchase, quotation band (invented draft)", approverCode: "FD", committeeCode: "QUOTE_CTTE", committeeAct: "MR", clause: "DEMO DRAFT 1.2", sortOrder: 2 },
    ],
  });
  await db.authorityRuleStep.createMany({
    data: [{ id: `${P}st_draft1`, authorityRuleId: `${P}rule_draft2`, roleCode: "HOD_CP", act: "R", sequence: 1 }],
  });

  await db.codeFormat.createMany({
    data: [
      { id: `${P}f3`, organisationId, key: "erp_requisition_no", pattern: "XR\\d{10}", example: "XR2026000101", description: "XR and ten digits, running on across years.", provenance: "ASSUMED" },
      { id: `${P}f4`, organisationId, key: "erp_note_no", pattern: "RN/\\d{4}/\\d{4}", example: "RN/2026/0101", description: "RN, the year, four digits.", provenance: "ASSUMED" },
    ],
  });
  await db.requisitionPolicy.create({
    data: {
      id: `${P}rp1`, organisationId, splittingWindowDays: 45, splittingMatchOn: ["unit", "accountCode"],
      budgetRecheckDays: 14, endorsementTiers: ["SECTION", "DEPARTMENT"], provenance: "ASSUMED",
      splittingAggregateAcrossYear: false, splitJustifyingRoleCode: "HOD_CP",
      notes: "Invented demo controls.",
    },
  });
  await raiseSeries(db, `${P}n1`, 25);

  await db.budgetCode.createMany({
    data: [
      { id: `${P}bcode5`, organisationId, code: "OPX26-031", descriptionEn: "Northern network repairs", type: "Operating", owningUnitCode: "NTH", accountCode: "6200200", holderPersonId: `${P}p9`, effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") },
      { id: `${P}bcode6`, organisationId, code: "OPX26-040", descriptionEn: "Northern consumables", type: "Operating", owningUnitCode: "NTH", accountCode: "6100100", effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") },
      { id: `${P}bcode7`, organisationId, code: "CAP26-017", descriptionEn: "Northern standby power", type: "Capital", owningUnitCode: "NTH", accountCode: "7300300", effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") },
    ],
  });
  await db.budgetMovement.createMany({
    data: [
      { id: `${P}bm11`, budgetCodeId: `${P}bcode5`, kind: "ORIGINAL", amount: "120000.00", occurredOn: day("2026-01-01"), reference: "BR26-031" },
      { id: `${P}bm15`, budgetCodeId: `${P}bcode5`, kind: "COMMITMENT", amount: "70000.00", occurredOn: day("2026-03-10"), reference: "DEMO/REQ/0009/2026", description: "Valve replacement" },
      { id: `${P}bm16`, budgetCodeId: `${P}bcode6`, kind: "ORIGINAL", amount: "40000.00", occurredOn: day("2026-01-01"), reference: "BR26-040" },
      { id: `${P}bm17`, budgetCodeId: `${P}bcode7`, kind: "ORIGINAL", amount: "45000.00", occurredOn: day("2026-01-01"), reference: "BR26-017" },
      // Commitments written when rq7 and rq12 were approved. rq9's supervision-only route
      // commits no budget of the organisation's (ruling BD-13).
      { id: `${P}bm12`, budgetCodeId: `${P}bcode2`, kind: "COMMITMENT", amount: "18500.00", occurredOn: day("2026-08-20"), reference: REQ(19), description: "Chlorine dosing pump spares" },
      // rq10, received from the finance system: its commitment posted to the portal ledger (ruling BD-10).
      { id: `${P}bm18`, budgetCodeId: `${P}bcode2`, kind: "COMMITMENT", amount: "15000.00", occurredOn: day("2026-09-25"), reference: REQ(22), description: "Meter reading handsets" },
      { id: `${P}bm13`, budgetCodeId: `${P}bcode7`, kind: "COMMITMENT", amount: "62000.00", occurredOn: day("2026-08-27"), reference: REQ(24), description: "Standby generator, Bukit Demo pump house" },
    ],
  });

  // The Board, which approves an over-budget requisition, and the sitting that did.
  await db.committee.create({
    data: {
      id: `${P}c3`, organisationId, code: "BOARD", nameEn: "Board of Directors", nameMs: "Lembaga Pengarah", mandate: "Approves requisitions over budget.",
      governingSource: "Demo constitution cl. 2", action: "APPROVES", quorum: 2, quorumProvenance: "ASSUMED", compositionProvenance: "ASSUMED",
      secretariatRoleCode: "HOD_CP", votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
    },
  });
  await db.committeeMember.createMany({
    data: [
      { id: `${P}m8`, committeeId: `${P}c3`, seatRoleCode: "CEO", position: "CHAIRMAN", provenance: "ASSUMED", effectiveFrom: from },
      { id: `${P}m9`, committeeId: `${P}c3`, personId: `${P}p7`, position: "MEMBER", provenance: "ASSUMED", effectiveFrom: from },
      { id: `${P}m10`, committeeId: `${P}c3`, personId: `${P}p3`, position: "SECRETARY", provenance: "ASSUMED", effectiveFrom: from },
    ],
  });
  await db.meeting.create({
    data: {
      id: `${P}mt5`, committeeId: `${P}c3`, reference: "DEMO/BOD/3/2026", meetingDate: day("2026-08-27"), status: "MINUTED", minutedAt: day("2026-08-28"),
      agenda: "Over-budget capital requisition for standby power.", minutes: "The Board considered the over-budget requisition for a standby generator with the Chief Executive's mandatory recommendation, and approved it.",
    },
  });
  await db.meetingAttendance.createMany({
    data: [
      { id: `${P}at10`, meetingId: `${P}mt5`, personId: `${P}p1`, attended: true },
      { id: `${P}at11`, meetingId: `${P}mt5`, personId: `${P}p7`, attended: true },
      { id: `${P}at12`, meetingId: `${P}mt5`, personId: `${P}p3`, attended: true },
    ],
  });

  // --------------------------------------------------------------- the requisitions
  const base = {
    organisationId, origin: "PORTAL" as const, requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`,
    costCentreCode: "CC-200", placeOfDelivery: "Northern Works Depot", siteCode: "NTH-WKS",
  };
  const erp = (n: number) => ({ erpRequisitionNo: `XR2026000${n}`, erpNoteNo: `RN/2026/0${n}`, erpRefSource: "MANUAL" as const, erpRefRecordedAt: day("2026-06-01") });
  const route = (code: string, posture: string, supersedes: boolean, sourcing = true) => ({
    fundingRouteCode: code, fundingSupersedesAuthority: supersedes, sourcingPermitted: sourcing, fundingPosture: posture,
  });
  const reqs = [
    { id: 1, n: 13, status: "DRAFT", title: "Pressure gauges for the northern reservoirs", value: "12000.00", account: "6200200", code: 5, raised: "2026-09-28", required: "2026-11-30", route: { fundingRouteCode: "opex" },
      lines: [["Pressure gauge, 0–16 bar", "5000.00"], ["Installation", "4500.00"]], justification: "Gauges at three reservoirs read out of tolerance.", need: "Accurate readings for the night-flow survey." },
    { id: 2, n: 14, status: "ENDORSED", title: "Road reinstatement after the Jalan Demo leak", value: "8400.00", account: "6200200", code: 5, raised: "2026-09-25", required: "2026-10-31", route: { fundingRouteCode: "opex" },
      lines: [["Reinstatement, 40 square metres", "8400.00"]], justification: "The council requires reinstatement within 30 days.", need: "Reinstate the carriageway over the repaired main." },
    { id: 3, n: 15, status: "PENDING_APPROVAL", title: "Replacement of the Bukit Demo booster pump", value: "38000.00", account: "6200200", code: 5, raised: "2026-07-20", required: "2026-10-15", route: route("opex", "PROCURES", false), erp: 131,
      lines: [["Booster pump, 15 kW", "31000.00"], ["Removal and installation", "7000.00"]], justification: "The pump has failed twice this quarter.", need: "Restore pressure to the upper zone." },
    { id: 4, n: 16, status: "PENDING_APPROVAL", title: "Treatment chemicals for the northern plants", value: "55000.00", account: "6100100", code: 6, raised: "2026-09-16", required: "2026-10-20", route: route("opex", "PROCURES", false), erp: 140,
      lines: [["Aluminium sulphate, 20 tonnes", "41000.00"], ["Polymer, 2 tonnes", "14000.00"]], justification: "Raw water turbidity is up after the monsoon.", need: "Six weeks of treatment chemicals." },
    { id: 5, n: 17, status: "PENDING_APPROVAL", title: "Valve exercising, zone A", value: "24000.00", account: "6200200", code: 5, raised: "2026-09-12", required: "2026-11-15", route: route("opex", "PROCURES", false), erp: 145,
      lines: [["Valve exercising, 60 valves", "24000.00"]], justification: "Zone A valves were last exercised in 2023.", need: "Isolation that works when the next main bursts." },
    { id: 6, n: 18, status: "ENDORSED", title: "Valve exercising, zone B", value: "24000.00", account: "6200200", code: 5, raised: "2026-09-22", required: "2026-11-30", route: { fundingRouteCode: "opex" },
      lines: [["Valve exercising, 60 valves", "24000.00"]], justification: "Zone B valves were last exercised in 2023.", need: "Isolation that works when the next main bursts." },
    { id: 7, n: 19, status: "APPROVED", title: "Chlorine dosing pump spares", value: "18500.00", account: "6100100", code: 2, raised: "2026-07-25", required: "2026-09-30", route: route("opex", "PROCURES", false), erp: 119,
      lines: [["Diaphragm kits", "11000.00"], ["Check valves", "7500.00"]], justification: "Two dosing pumps are running without spares.", need: "Spares on the shelf for both plants." },
    { id: 8, n: 20, status: "REGISTERED", title: "Rural supply extension, Kampung Demo", value: "120000.00", account: "7300300", code: 1, raised: "2026-09-18", required: "2027-03-31", route: { fundingRouteCode: "funder_led" }, erp: 158,
      lines: [["Pipe laying, 1.2 km", "120000.00"]], justification: "The funder has approved the extension in principle.", need: "Treated water to 60 households." },
    { id: 9, n: 21, status: "APPROVED", title: "Inspection of the developer's pipeline", value: "800.00", account: "7300300", code: 1, raised: "2026-05-10", required: "2026-06-15", route: route("supervision", "RECORDS_ONLY", true, false), erp: 108,
      lines: [["Inspection and test witnessing", "800.00"]], justification: "A developer's pipeline is to be handed over.", need: "Inspect and witness the pressure test before acceptance." },
    { id: 10, n: 22, status: "APPROVED", origin: "EXTERNAL", title: "Meter reading handsets", value: "15000.00", account: "6100100", code: 2, raised: "2026-09-25", required: "2026-10-31", route: route("opex", "PROCURES", false), erp: 150,
      lines: [["Handheld meter reading device", "15000.00"]], justification: "Received from the finance system.", need: "Replace failed handsets." },
    { id: 11, n: 23, status: "CANCELLED", title: "Fencing at the Demo tank", value: "6000.00", account: "6200200", code: 5, raised: "2026-08-02", required: "2026-09-30", route: { fundingRouteCode: "opex" },
      lines: [["Chain-link fencing", "6000.00"]], justification: "Vandalism at the tank site.", need: "Secure the site.", cancelReason: "The landowner has fenced the site at his own cost." },
    { id: 12, n: 24, status: "APPROVED", title: "Standby generator, Bukit Demo pump house", value: "62000.00", account: "7300300", code: 7, raised: "2026-07-01", required: "2026-10-01", route: route("capex", "PROCURES", false), erp: 120,
      lines: [["Standby generator, 100 kVA", "54000.00"], ["Changeover panel", "8000.00"]], justification: "Power cuts stop the pump house for hours at a time.", need: "Keep the upper zone supplied through outages." },
  ] as const;

  for (const r of reqs) {
    const x = r as typeof r & { erp?: number; origin?: "EXTERNAL"; cancelReason?: string };
    await db.requisition.create({
      data: {
        ...base,
        id: `${P}rq${x.id}`,
        reference: REQ(x.n),
        origin: x.origin ?? "PORTAL",
        ...(x.erp ? erp(x.erp) : {}),
        title: x.title,
        justification: x.justification,
        needStatement: x.need,
        accountCode: x.account,
        budgetCodeId: x.code ? `${P}bcode${x.code}` : null,
        dateRequired: day(x.required),
        estimatedValue: x.value,
        raisedOn: day(x.raised),
        status: x.status,
        cancelReason: x.cancelReason ?? "",
        ...x.route,
        ...(x.id === 7 ? { commitmentMovementId: `${P}bm12` } : x.id === 10 ? { commitmentMovementId: `${P}bm18` } : x.id === 12 ? { commitmentMovementId: `${P}bm13` } : {}),
        lines: { create: x.lines.map(([description, amount], i) => ({ id: `${P}rq${x.id}l${i + 1}`, lineNo: i + 1, description, estimatedAmount: amount })) },
      },
    });
  }

  // Endorsements: the section head, then the department head, as they were on the day.
  const endorse = (rq: number, sectionOn: string, deptOn: string, deptHead = `${P}p9`) => [
    { id: `${P}en${rq}a`, requisitionId: `${P}rq${rq}`, tier: "SECTION" as const, unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: day(sectionOn) },
    { id: `${P}en${rq}b`, requisitionId: `${P}rq${rq}`, tier: "DEPARTMENT" as const, unitCode: "NTH", personId: deptHead, endorsedOn: day(deptOn) },
  ];
  await db.requisitionEndorsement.createMany({
    data: [
      ...endorse(2, "2026-09-26", "2026-09-27"),
      ...endorse(3, "2026-07-21", "2026-07-22"),
      ...endorse(4, "2026-09-16", "2026-09-17"),
      ...endorse(5, "2026-09-13", "2026-09-14"),
      ...endorse(6, "2026-09-23", "2026-09-24"),
      ...endorse(7, "2026-07-26", "2026-07-27"),
      ...endorse(8, "2026-09-19", "2026-09-20"),
      ...endorse(9, "2026-05-11", "2026-05-12", `${P}p6`),
      ...endorse(11, "2026-08-03", "2026-08-04"),
      ...endorse(12, "2026-07-02", "2026-07-03"),
    ],
  });

  // Budget checks: the ledger on their day (ADR 0004); rq10's as typed from the finance system.
  const check = (rq: number, on: string, code: number | null, codeCode: string | null, requested: string, f: [string | null, string, string | null, string | null], verdict: "WITHIN" | "EXCEEDS", extra: object = {}) => ({
    id: `${P}bk${rq}`, requisitionId: `${P}rq${rq}`, checkedAt: day(on), asAt: day(on), source: "PORTAL_LEDGER" as const,
    budgetCodeId: code ? `${P}bcode${code}` : null, budgetCodeCode: codeCode, requestedAmount: requested,
    actualBudget: f[0], balanceAsAt: f[1], approvedAccount: f[2], approvedAccountProvenance: "ASSUMED" as const, projectedBalance: f[3], verdict, ...extra,
  });
  await db.requisitionBudgetCheck.createMany({
    data: [
      check(3, "2026-07-27", 5, "OPX26-031", "38000.00", ["120000.00", "50000.00", "70000.00", "12000.00"], "WITHIN"),
      check(4, "2026-09-18", 6, "OPX26-040", "55000.00", ["40000.00", "40000.00", "0.00", "-15000.00"], "EXCEEDS"),
      check(5, "2026-09-24", 5, "OPX26-031", "24000.00", ["120000.00", "50000.00", "70000.00", "26000.00"], "WITHIN"),
      check(7, "2026-08-12", 2, "OPX26-014", "18500.00", ["1340000.00", "120000.00", "1220000.00", "101500.00"], "WITHIN", { outcome: "COST_CENTRE_OUTSIDE_OWNER" }),
      check(9, "2026-05-15", 1, "CAP26-001", "800.00", ["8600000.00", "2662900.00", "5937100.00", "2662100.00"], "WITHIN"),
      check(12, "2026-07-04", 7, "CAP26-017", "62000.00", ["45000.00", "45000.00", "0.00", "-17000.00"], "EXCEEDS"),
      // Typed from the finance system and stored as typed: its figures need not close.
      { id: `${P}bk10`, requisitionId: `${P}rq10`, checkedAt: day("2026-09-25"), asAt: day("2026-09-22"), source: "MANUAL_ERP_ENTRY", requestedAmount: "15000.00",
        actualBudget: "200000.00", balanceAsAt: "60000.00", approvedAccount: "150000.00", approvedAccountProvenance: "OBSERVED", projectedBalance: "45000.00", verdict: "WITHIN" },
    ],
  });

  // Split checks, as the demo policy found them on submission.
  const policySnap = { windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, policyProvenance: "ASSUMED" as const };
  await db.requisitionSplitCheck.createMany({
    data: [
      { id: `${P}sp3`, requisitionId: `${P}rq3`, checkedAt: day("2026-07-28"), state: "CLEAR", ...policySnap, relatedRequisitionIds: [], relatedReferences: [] },
      { id: `${P}sp4`, requisitionId: `${P}rq4`, checkedAt: day("2026-09-18"), state: "CLEAR", ...policySnap, relatedRequisitionIds: [], relatedReferences: [] },
      {
        id: `${P}sp5`, requisitionId: `${P}rq5`, checkedAt: day("2026-09-24"), state: "FLAGGED", ...policySnap,
        relatedRequisitionIds: [`${P}rq6`], relatedReferences: [REQ(18)], combinedValue: "48000.00", crossesBand: true,
        overrideJustification: "Zones A and B are separate networks with separate contractors' access windows; the work cannot be let as one.",
        overriddenByPersonId: `${P}p3`, overriddenOn: day("2026-09-25"), overriddenAt: day("2026-09-25"),
      },
      { id: `${P}sp7`, requisitionId: `${P}rq7`, checkedAt: day("2026-08-12"), state: "CLEAR", ...policySnap, relatedRequisitionIds: [], relatedReferences: [] },
      // Submitted before the demo organisation set its splitting policy: not assessed, for ever.
      { id: `${P}sp9`, requisitionId: `${P}rq9`, checkedAt: day("2026-05-15"), state: "NOT_SET", windowDays: null, matchOn: [], aggregateAcrossYear: null, relatedRequisitionIds: [], relatedReferences: [], notSetReasons: ["WINDOW", "MATCH_ON", "YEAR_AGGREGATION"] },
      { id: `${P}sp12`, requisitionId: `${P}rq12`, checkedAt: day("2026-07-05"), state: "CLEAR", ...policySnap, relatedRequisitionIds: [], relatedReferences: [] },
    ],
  });

  // The Board's decision on rq12, tabled against it by the typed key.
  await db.committeeDecision.create({
    data: {
      id: `${P}d7`, meetingId: `${P}mt5`, sequence: 1, domain: "requisition", subject: "Over-budget requisition: standby generator, Bukit Demo pump house",
      matterKind: "REQUISITION", matterRef: REQ(24), requisitionId: `${P}rq12`, amount: "62000", act: "A", authorityRuleKey: "demo.requisition.over_budget",
      tabledByPersonId: `${P}p3`, tabledAt: day("2026-08-25"), outcome: "CARRIED", decisionDate: day("2026-08-27"),
      quorumRequired: 2, presentVoters: 2, recusedCount: 0, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
    },
  });
  await db.vote.createMany({
    data: [
      { id: `${P}v9`, decisionId: `${P}d7`, personId: `${P}p1`, choice: "SETUJU", votedAt: day("2026-08-27"), recordedAt: day("2026-08-27") },
      { id: `${P}v10`, decisionId: `${P}d7`, personId: `${P}p7`, choice: "SETUJU", votedAt: day("2026-08-27"), recordedAt: day("2026-08-27") },
    ],
  });

  // Approval routes, with the rules they were judged under.
  const inst = <const E extends { value: string }>(rq: number, rule: number, ruleLabel: string, clause: string, opened: string, extra: E) => ({
    id: `${P}ai${rq}`, organisationId, matterKind: "REQUISITION" as const, requisitionId: `${P}rq${rq}`, domain: "requisition",
    authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: `demo.requisition.${rule === 9 ? "over_budget" : rule - 4}`, ruleLabel, ruleClause: clause,
    boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null,
    budgetCheckId: `${P}bk${rq}`, splitCheckId: `${P}sp${rq}`, checkedAgainstMatrix: true, openedAt: day(opened), ...extra,
  });
  const budgetBlocking = { availabilityCheck: "blocking" };
  const noFunder = [{ code: "GOV_OVERRIDE", level: "warn", messageEn: "Externally funded, but no funder's rule set is issued for this funding route, so the approval matrix routed it. The funder's own guidelines may still prevail where they conflict. The clause behind this rule is not recorded in the approval matrix." }];
  await db.approvalInstance.createMany({
    data: [
      inst(3, 6, "Requisition, RM1,000 to RM40,000", "DEMO 3.1(b)", "2026-07-28", { value: "38000.00", budgetVerdict: "WITHIN", splitState: "CLEAR", fundingRouteCode: "opex", ...budgetBlocking, status: "PENDING" }),
      inst(4, 9, "Requisition over budget", "DEMO 3.2", "2026-09-18", {
        value: "55000.00", cond: "over_budget", budgetVerdict: "EXCEEDS", overBudgetInvoked: true, splitState: "CLEAR", fundingRouteCode: "opex", ...budgetBlocking, status: "PENDING",
      }),
      inst(5, 6, "Requisition, RM1,000 to RM40,000", "DEMO 3.1(b)", "2026-09-24", { value: "24000.00", budgetVerdict: "WITHIN", splitState: "FLAGGED", fundingRouteCode: "opex", ...budgetBlocking, status: "PENDING" }),
      inst(7, 6, "Requisition, RM1,000 to RM40,000", "DEMO 3.1(b)", "2026-08-12", {
        value: "18500.00", budgetVerdict: "WITHIN", splitState: "CLEAR", fundingRouteCode: "opex", ...budgetBlocking, status: "APPROVED", closedAt: day("2026-08-20"), commitOnApproval: true, routeCommitsBudget: true,
        warnings: [{ code: "COST_CENTRE_OUTSIDE_OWNER", level: "warn", messageEn: "The cost centre's unit is not the budget code's owning unit." }],
      }),
      inst(9, 5, "Requisition, up to RM1,000", "DEMO 3.1(a)", "2026-05-15", {
        value: "800.00", budgetVerdict: "WITHIN", splitState: "NOT_SET", fundingRouteCode: "supervision", ...budgetBlocking, status: "APPROVED", closedAt: day("2026-05-20"), commitOnApproval: true, routeCommitsBudget: false, warnings: noFunder,
      }),
      inst(12, 9, "Requisition over budget", "DEMO 3.2", "2026-07-05", {
        value: "62000.00", cond: "over_budget", budgetVerdict: "EXCEEDS", overBudgetInvoked: true, splitState: "CLEAR", fundingRouteCode: "capex", ...budgetBlocking,
        status: "APPROVED", closedAt: day("2026-08-27"), commitOnApproval: true, routeCommitsBudget: true,
      }),
      {
        id: `${P}ai10`, organisationId, matterKind: "REQUISITION", requisitionId: `${P}rq10`, domain: "requisition", value: "15000.00", fundingRouteCode: "opex",
        budgetCheckId: `${P}bk10`, budgetVerdict: "WITHIN", checkedAgainstMatrix: false, status: "APPROVED", openedAt: day("2026-09-18"), closedAt: day("2026-09-22"),
      },
    ],
  });
  const step = <const E extends object>(rq: number, seq: number, roleCode: string | null, roleLabel: string, act: "P" | "R" | "MR" | "A", extra: E = {} as E) => ({
    id: `${P}as${rq}_${seq}`, instanceId: `${P}ai${rq}`, sequence: seq, roleCode, roleLabel, act, sourceRuleKey: null, ...extra,
  });
  // The department head decides the department's step directly (ruling BD-1).
  const byHead = (on: string, pid = `${P}p9`, name = "Imran Hakim") => ({ decision: "DONE" as const, decidedByPersonId: pid, decidedByName: name, decidedOn: day(on), recordedAt: day(on) });
  const done = (pid: string, name: string, on: string) => ({ decision: "DONE" as const, decidedByPersonId: pid, decidedByName: name, decidedOn: day(on), recordedAt: day(on) });
  await db.approvalStep.createMany({
    data: [
      step(3, 1, "DEPT_HEAD", "Head of Department", "R", byHead("2026-08-03")),
      step(3, 2, "DIV_HEAD", "Head of Division", "A"),
      step(4, 1, "CEO", "Chief Executive", "MR", { nonDelegable: true }),
      step(4, 2, "BOARD", "Board of Directors", "A", { committeeCode: "BOARD" }),
      step(5, 1, "DEPT_HEAD", "Head of Department", "R"),
      step(5, 2, "DIV_HEAD", "Head of Division", "A"),
      step(7, 1, "DEPT_HEAD", "Head of Department", "R", byHead("2026-08-18")),
      step(7, 2, "DIV_HEAD", "Head of Division", "A", done(`${P}p7`, "Gopal Nair", "2026-08-20")),
      step(9, 1, "DEPT_HEAD", "Head of Department", "A", byHead("2026-05-20", `${P}p6`, "Faridah Osman")),
      step(12, 1, "CEO", "Chief Executive", "MR", { nonDelegable: true, ...done(`${P}p1`, "Aisyah Rahman", "2026-08-24") }),
      step(12, 2, "BOARD", "Board of Directors", "A", { committeeCode: "BOARD", decision: "DONE", decidedByName: "Board of Directors", decidedOn: day("2026-08-27"), committeeDecisionId: `${P}d7`, recordedAt: day("2026-08-28") }),
      // As received from the finance system: named as it names them.
      step(10, 1, null, "Head of Department", "R", { decision: "DONE", decidedByName: "Imran Hakim", decidedByPersonId: `${P}p9`, decidedOn: day("2026-09-18"), recordedAt: day("2026-09-25") }),
      step(10, 2, null, "Head of Division", "A", { decision: "DONE", decidedByName: "G. Nair", decidedOn: day("2026-09-22"), recordedAt: day("2026-09-25") }),
    ],
  });
}

/**
 * Method selection (6.3): the method family on the demo issue, contract terms bands,
 * the nine methods' behaviours, contract-type behaviours, bases, other classifications
 * and their mappings, a mixed-scope threshold, two approved parents and six exercises.
 * Invented throughout, like every demo figure. The exercises' bands and decided records
 * are written by the same lib functions a save writes (`determineExercises`).
 */
async function loadMethodSelection(organisationId: string, from: Date) {
  const REQ = (n: number) => `DEMO/REQ/${String(n).padStart(4, "0")}/2026`;
  const mx = `${P}mx1`;

  // Bodies and offices the method family routes to.
  await db.authorityRole.createMany({
    data: [
      { id: `${P}r11`, organisationId, code: "QUOTE_CTTE", nameEn: "Quotation Committee", nameMs: "Jawatankuasa Sebut Harga", isCommittee: true, workspace: "Internal", authorityLevel: "Committee", sortOrder: 11 },
      { id: `${P}r12`, organisationId, code: "CHAIRMAN", nameEn: "Chairman", nameMs: "Pengerusi", workspace: "Internal", authorityLevel: "Board", sortOrder: 12 },
      { id: `${P}r13`, organisationId, code: "TECH_CTTE", nameEn: "Technical Committee", nameMs: "Jawatankuasa Teknikal", isCommittee: true, workspace: "Internal", authorityLevel: "Committee", sortOrder: 13 },
    ],
  });
  await db.committee.create({
    data: {
      id: `${P}c4`, organisationId, code: "TECH_CTTE", nameEn: "Technical Committee", nameMs: "Jawatankuasa Teknikal",
      mandate: "Considers specialist and sole-source scopes.", governingSource: "Demo constitution cl. 6", action: "RECOMMENDS",
      compositionProvenance: "ASSUMED", secretariatRoleCode: "HOD_CP",
      // 6.2 increment 2 (X-4): the committee sits on demo_sx15's scope (demo_mt11), so its
      // quorum, voting rule and seats are set, all assumed.
      quorum: 2, quorumProvenance: "ASSUMED", votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
    },
  });
  await db.committeeMember.createMany({
    data: [
      { id: `${P}m40`, committeeId: `${P}c4`, seatRoleCode: "CEO", position: "CHAIRMAN", provenance: "ASSUMED", effectiveFrom: day("2024-01-01") },
      { id: `${P}m41`, committeeId: `${P}c4`, seatRoleCode: "FD", position: "MEMBER", provenance: "ASSUMED", effectiveFrom: day("2024-01-01") },
      { id: `${P}m42`, committeeId: `${P}c4`, personId: `${P}p3`, position: "SECRETARY", provenance: "ASSUMED", effectiveFrom: day("2024-01-01") },
    ],
  });

  // The method family on the demo issue. Every edge at RM300,000 follows the switch.
  const app = { authorityMatrixId: mx, domain: "appointment" };
  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule20`, ...app, method: "direct", ruleKey: "demo.direct.1", maxValue: "2000", labelEn: "Direct appointment, up to RM2,000", approverCode: "DEPT_HEAD", clause: "DEMO 4.1(a)", sortOrder: 20 },
      { id: `${P}rule21`, ...app, method: "direct", ruleKey: "demo.direct.2", minValue: "2000", maxValue: "8000", labelEn: "Direct appointment, RM2,000 to RM8,000", approverCode: "DIV_HEAD", clause: "DEMO 4.1(b)", sortOrder: 21 },
      { id: `${P}rule22`, ...app, method: "direct", ruleKey: "demo.direct.3", minValue: "8000", maxValue: "15000", labelEn: "Direct appointment, RM8,000 to RM15,000", approverCode: "FD", clause: "DEMO 4.1(c)", sortOrder: 22 },
      { id: `${P}rule23`, ...app, method: "direct", ruleKey: "demo.direct.4", minValue: "15000", maxValue: "300000", followsBoundarySwitch: true, labelEn: "Direct appointment, RM15,000 to RM300,000", approverCode: "CEO", committeeCode: "QUOTE_CTTE", committeeAct: "MR", nonDelegable: true, clause: "DEMO 4.1(d)", sortOrder: 23 },
      { id: `${P}rule24`, ...app, method: "direct", ruleKey: "demo.direct.5", minValue: "300000", maxValue: "1000000", followsBoundarySwitch: true, labelEn: "Direct appointment, RM300,000 to RM1 million", approverCode: "TENDER_BOARD", committeeCode: "TENDER_BOARD", committeeAct: "A", nonDelegable: true, clause: "DEMO 4.1(e)", sortOrder: 24 },
      { id: `${P}rule25`, ...app, method: "direct", ruleKey: "demo.direct.6", minValue: "1000000", maxValue: "4000000", labelEn: "Direct appointment, RM1 million to RM4 million", approverCode: "CHAIRMAN", committeeCode: "TENDER_BOARD", committeeAct: "MR", nonDelegable: true, clause: "DEMO 4.1(f)", sortOrder: 25 },
      { id: `${P}rule26`, ...app, method: "direct", ruleKey: "demo.direct.7", minValue: "4000000", labelEn: "Direct appointment, above RM4 million", approverCode: "BOARD", committeeCode: "TENDER_BOARD", committeeAct: "MR", nonDelegable: true, clause: "DEMO 4.1(g)", sortOrder: 26 },
      { id: `${P}rule27`, ...app, method: "tender", ruleKey: "demo.tender", minValue: "300000", followsBoundarySwitch: true, labelEn: "Tender, above RM300,000", approverCode: "TENDER_BOARD", committeeCode: "TENDER_BOARD", committeeAct: "A", nonDelegable: true, clause: "DEMO 4.2", sortOrder: 27 },
      { id: `${P}rule28`, ...app, method: "quotation", ruleKey: "demo.quotation", minValue: "15000", maxValue: "300000", followsBoundarySwitch: true, labelEn: "Quotation, RM15,000 to RM300,000", approverCode: "CEO", committeeCode: "QUOTE_CTTE", committeeAct: "MR", nonDelegable: true, clause: "DEMO 4.3", sortOrder: 28 },
      { id: `${P}rule29`, authorityMatrixId: mx, domain: "name_approval", method: "tender", ruleKey: "demo.name.tender", labelEn: "Name approval, selected tender", proposerCode: "SEC_PRE", approverCode: "CEO", clause: "DEMO 4.4", sortOrder: 29 },
      { id: `${P}rule30`, authorityMatrixId: mx, domain: "name_approval", method: "quotation", ruleKey: "demo.name.quotation", labelEn: "Name approval, selective quotation", proposerCode: "DEPT_HEAD", approverCode: "FD", clause: "DEMO 4.5", sortOrder: 30 },
      { id: `${P}rule31`, ...app, method: "specialist", ruleKey: "demo.specialist", labelEn: "Specialist or sole source", approverCode: "CEO", committeeCode: "TECH_CTTE", committeeAct: "R", clause: "DEMO 4.6", sortOrder: 31 },
    ],
  });
  await db.authorityRuleStep.createMany({
    data: [
      { id: `${P}st20`, authorityRuleId: `${P}rule23`, roleCode: "QUOTE_CTTE", act: "MR", sequence: 1 },
      { id: `${P}st21`, authorityRuleId: `${P}rule25`, roleCode: "TENDER_BOARD", act: "MR", sequence: 1 },
      { id: `${P}st22`, authorityRuleId: `${P}rule26`, roleCode: "TENDER_BOARD", act: "MR", sequence: 1 },
      { id: `${P}st23`, authorityRuleId: `${P}rule28`, roleCode: "QUOTE_CTTE", act: "MR", sequence: 1 },
      { id: `${P}st24`, authorityRuleId: `${P}rule29`, roleCode: "HOD_CP", act: "MR", sequence: 1 },
      { id: `${P}st25`, authorityRuleId: `${P}rule29`, roleCode: "DIV_HEAD", act: "JR", sequence: 2 },
      { id: `${P}st26`, authorityRuleId: `${P}rule29`, roleCode: "FD", act: "R", sequence: 3 },
      { id: `${P}st27`, authorityRuleId: `${P}rule30`, roleCode: "DEPT_HEAD", act: "JR", sequence: 1 },
      { id: `${P}st28`, authorityRuleId: `${P}rule30`, roleCode: "DIV_HEAD", act: "R", sequence: 2 },
      { id: `${P}st29`, authorityRuleId: `${P}rule31`, roleCode: "TECH_CTTE", act: "R", sequence: 1 },
    ],
  });

  // Contract terms bands on the quotation route. Invented split, not any customer's.
  await db.termsBand.createMany({
    data: [
      { id: `${P}tb1`, authorityMatrixId: mx, bandKey: "demo.terms.short", regime: "quotation", maxValue: "80000", labelEn: "Short-form terms", retentionApplies: false, defectsLiabilityApplies: false, insuranceNote: "Public liability for the works period", clause: "DEMO T1", provenance: "OBSERVED", sortOrder: 1 },
      { id: `${P}tb2`, authorityMatrixId: mx, bandKey: "demo.terms.extended", regime: "quotation", minValue: "80000", labelEn: "Extended terms", retentionApplies: true, defectsLiabilityApplies: true, insuranceNote: "Works and public liability to the end of defects liability", clause: "DEMO T2", provenance: "OBSERVED", sortOrder: 2 },
    ],
  });

  // The methods' behaviours, and the five methods the demo did not have.
  await db.sourcingMethod.update({ where: { id: `${P}sm1` }, data: { defaultInTender: true } });
  await db.sourcingMethod.update({ where: { id: `${P}sm2` }, data: { defaultInQuotation: true } });
  await db.sourcingMethod.update({ where: { id: `${P}sm3` }, data: { defaultBelow: true } });
  const anyValue = { availableInTender: true, availableInQuotation: true, availableBelow: true };
  await db.sourcingMethod.createMany({
    data: [
      {
        id: `${P}sm5`, organisationId, code: "selected_tender", nameEn: "Selected tender", nameMs: "Tender Terpilih", availableInTender: true, invitesNamedSuppliers: true,
        awardInstrument: "Letter of Acceptance", committeeCode: "TENDER_BOARD", authorityMethodKey: "tender",
        requiresJustification: true, justificationPrompt: "The specialist expertise that makes an open tender unsuitable.", requiresProposal: true, requiresNameApproval: true, restrictedAccess: true,
        governingSource: "Demo policy 4.4", provenance: "STATED", sortOrder: 5,
      },
      { id: `${P}sm6`, organisationId, code: "selective_quotation", nameEn: "Selective quotation", nameMs: "Sebut Harga Terpilih", availableInQuotation: true, invitesNamedSuppliers: true, awardInstrument: "Appointment letter", committeeCode: "QUOTE_CTTE", authorityMethodKey: "quotation", requiresNameApproval: true, governingSource: "Demo policy 4.5", provenance: "STATED", sortOrder: 6 },
      { id: `${P}sm7`, organisationId, code: "selective_direct", nameEn: "Selective direct appointment", nameMs: "Lantikan Terus Terpilih", ...anyValue, awardInstrument: "Purchase order", authorityMethodKey: "direct", requiresDossier: true, dossierSeriesKey: "direct_appointment", provenance: "OBSERVED", sortOrder: 7 },
      { id: `${P}sm8`, organisationId, code: "specialist", nameEn: "Specialist or sole source", availableInQuotation: true, availableBelow: true, awardInstrument: "Appointment letter", committeeCode: "TECH_CTTE", authorityMethodKey: "specialist", requiresJustification: true, justificationPrompt: "Why only this specialist can do the work, and that they scoped it on site.", provenance: "OBSERVED", sortOrder: 8 },
      { id: `${P}sm9`, organisationId, code: "emergency", nameEn: "Emergency works", ...anyValue, awardInstrument: "Purchase order", authorityMethodKey: "direct", requiresCoordinationRecord: true, governingSource: "Demo policy 4.7", provenance: "STATED", sortOrder: 9 },
    ],
  });
  await db.methodChecklistItem.createMany({
    data: [
      { id: `${P}mci1`, sourcingMethodId: `${P}sm5`, key: "scope", labelEn: "The work and its scope", sortOrder: 1 },
      { id: `${P}mci2`, sourcingMethodId: `${P}sm5`, key: "estimate", labelEn: "The estimated cost and the budget that covers it", sortOrder: 2 },
      { id: `${P}mci3`, sourcingMethodId: `${P}sm5`, key: "grades", labelEn: "The grades and registration of the firms eligible", sortOrder: 3 },
      { id: `${P}mci4`, sourcingMethodId: `${P}sm5`, key: "firms", labelEn: "The firms proposed, and their background", sortOrder: 4 },
      { id: `${P}mci5`, sourcingMethodId: `${P}sm5`, key: "period", labelEn: "The completion period", sortOrder: 5 },
      { id: `${P}mci6`, sourcingMethodId: `${P}sm5`, key: "benefit", labelEn: "What is gained over an open tender", required: false, sortOrder: 6 },
    ],
  });
  await db.justificationReason.createMany({
    data: [
      { id: `${P}jr1`, organisationId, code: "sole_distributor", nameEn: "Sole authorised distributor", sourcingMethodCode: "selective_direct", governingSource: "Demo policy 4.6(a)", provenance: "OBSERVED", sortOrder: 1 },
      { id: `${P}jr2`, organisationId, code: "continuity", nameEn: "Continuity of an existing installation", governingSource: "Demo policy 4.6(b)", provenance: "ASSUMED", sortOrder: 2 },
    ],
  });

  // Contract types: the deliverable each is the default for, and what each drives.
  await db.contractType.update({
    where: { id: `${P}ct1` },
    data: {
      deliverableKind: "MEASURED_CONSTRUCTION", pricingBasis: "Bill of quantities, or drawings and specification", registrationTest: "Works contractor registration",
      administratorRoleCodes: ["HOD_CP", "SEC_PRE"], startRequiresSecurities: true, eotInstrument: "Certificate of extension of time", completionInstrument: "Certificate of practical completion",
      defectsLiabilityApplies: true, makingGoodCertificate: true, nominationAllowed: true, interimPaymentRule: "Monthly: work done and materials on site",
      sumAdjustmentDrivers: ["Variations", "Re-measurement"], claimsApprovalCommitteeCode: "TENDER_BOARD",
    },
  });
  await db.contractType.update({
    where: { id: `${P}ct2` },
    data: {
      deliverableKind: "TERM_PERFORMANCE", pricingBasis: "Schedule of rates", registrationTest: "Services registration", administratorRoleCodes: ["HOD_CP"],
      startRequiresSecurities: true, completionInstrument: "Certificate of completion at the end of the term",
      // The demo sources disagree on defects liability for services: left not set.
      nominationAllowed: false, interimPaymentRule: "Monthly: services performed",
    },
  });
  await db.contractType.update({
    where: { id: `${P}ct3` },
    data: {
      deliverableKind: "GOODS_DELIVERED", pricingBasis: "Specification and schedule of prices", administratorRoleCodes: ["SEC_PRE"], startRequiresSecurities: false,
      completionInstrument: "Delivery certificate", defectsLiabilityApplies: false, makingGoodCertificate: false, nominationAllowed: false, interimPaymentRule: "Local order, invoice and delivery order",
    },
  });
  await db.contractBasis.createMany({
    data: [
      { id: `${P}cb1`, organisationId, code: "bq", nameEn: "Bill of quantities", standardFormLabel: "Demo standard form A", governingSource: "Demo policy 5.2", provenance: "STATED", sortOrder: 1 },
      { id: `${P}cb2`, organisationId, code: "ds", nameEn: "Drawings and specification", standardFormLabel: "Demo standard form B", governingSource: "Demo policy 5.2", provenance: "STATED", sortOrder: 2 },
    ],
  });
  await db.classificationTaxonomy.createMany({
    data: [
      { id: `${P}tx1`, organisationId, code: "panel", nameEn: "Specification panel type", provenance: "OBSERVED", sortOrder: 1 },
      { id: `${P}tx2`, organisationId, code: "report", nameEn: "Performance report form", provenance: "OBSERVED", sortOrder: 2 },
      { id: `${P}tx3`, organisationId, code: "evaluation", nameEn: "Evaluation approach", provenance: "ASSUMED", sortOrder: 3 },
    ],
  });
  await db.taxonomyValue.createMany({
    data: [
      { id: `${P}tv1`, taxonomyId: `${P}tx1`, code: "civil", nameEn: "Civil works panel", sortOrder: 1 },
      { id: `${P}tv2`, taxonomyId: `${P}tx1`, code: "general", nameEn: "General supplies panel", sortOrder: 2 },
      { id: `${P}tv3`, taxonomyId: `${P}tx2`, code: "works", nameEn: "Works report", sortOrder: 1 },
      { id: `${P}tv4`, taxonomyId: `${P}tx2`, code: "design_build", nameEn: "Design and build report", sortOrder: 2 },
      { id: `${P}tv5`, taxonomyId: `${P}tx2`, code: "services", nameEn: "Services report", sortOrder: 3 },
      { id: `${P}tv6`, taxonomyId: `${P}tx2`, code: "supply", nameEn: "Supply report", sortOrder: 4 },
      { id: `${P}tv7`, taxonomyId: `${P}tx3`, code: "two_envelope", nameEn: "Technical then price", sortOrder: 1 },
      { id: `${P}tv8`, taxonomyId: `${P}tx3`, code: "lowest_price", nameEn: "Lowest compliant price", sortOrder: 2 },
    ],
  });
  const m = (n: number, contractTypeCode: string, taxonomyCode: string, valueCode: string, extra: object = {}) => ({ id: `${P}tm${n}`, organisationId, contractTypeCode, taxonomyCode, valueCode, provenance: "ASSUMED" as const, ...extra });
  await db.taxonomyMapping.createMany({
    data: [
      m(1, "works", "panel", "civil"),
      m(2, "works", "evaluation", "two_envelope"),
      // Works has two report forms; only the drawings-and-specification basis settles it.
      m(3, "works", "report", "works"),
      m(4, "works", "report", "design_build"),
      m(5, "works", "report", "design_build", { whenBasisCode: "ds" }),
      m(6, "services", "panel", "general"),
      m(7, "services", "report", "services"),
      m(8, "services", "evaluation", "two_envelope"),
      m(9, "supply", "panel", "general"),
      m(10, "supply", "report", "supply"),
      m(11, "supply", "evaluation", "lowest_price"),
    ],
  });
  await db.classificationPolicy.create({ data: { id: `${P}cp1`, organisationId, dominanceSharePct: "60.0000", provenance: "ASSUMED", notes: "Invented demo threshold." } });
  await db.numberingSeries.createMany({
    data: [
      { id: `${P}n5`, organisationId, key: "exercise", nameEn: "Sourcing exercises", pattern: "DEMO/SX/{SERIAL}/{YEAR}", padding: 4, resetOn: "CALENDAR_YEAR", nextSerial: 8, serialPeriod: "2026", provenance: "ASSUMED" },
      { id: `${P}n6`, organisationId, key: "direct_appointment", nameEn: "Direct appointment dossiers", pattern: "DEMO/DA/{SERIAL}/{YEAR}", padding: 4, resetOn: "CALENDAR_YEAR", nextSerial: 3, serialPeriod: "2026", provenance: "OBSERVED" },
    ],
  });

  // Two approved parents, with the trail the 6.1 rules would have written on the day.
  await db.accountCode.create({ data: { id: `${P}ac4`, organisationId, code: "7400400", nameEn: "Civil works", provenance: "ASSUMED", sortOrder: 4, effectiveFrom: from } });
  await db.budgetCode.create({
    data: { id: `${P}bcode8`, organisationId, code: "CAP26-044", descriptionEn: "Northern treatment works upgrade", type: "Capital", owningUnitCode: "NTH", accountCode: "7400400", holderPersonId: `${P}p9`, effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") },
  });
  await db.budgetMovement.createMany({
    data: [
      { id: `${P}bm19`, budgetCodeId: `${P}bcode8`, kind: "ORIGINAL", amount: "1500000.00", occurredOn: day("2026-01-01"), reference: "BR26-044" },
      { id: `${P}bm20`, budgetCodeId: `${P}bcode8`, kind: "COMMITMENT", amount: "330000.00", occurredOn: day("2026-06-24"), reference: REQ(25), description: "Filter and pipework renewal, Bukit Demo plant" },
      { id: `${P}bm21`, budgetCodeId: `${P}bcode8`, kind: "COMMITMENT", amount: "600000.00", occurredOn: day("2026-08-28"), reference: REQ(26), description: "Clear-water tank refurbishment" },
    ],
  });
  const base = {
    organisationId, origin: "PORTAL" as const, requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`,
    costCentreCode: "CC-200", placeOfDelivery: "Bukit Demo treatment plant", siteCode: "NTH-WKS", accountCode: "7400400", budgetCodeId: `${P}bcode8`,
    fundingRouteCode: "capex", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES", erpRefSource: "MANUAL" as const, erpRefRecordedAt: day("2026-06-02"),
  };
  await db.requisition.create({
    data: {
      ...base, id: `${P}rq13`, reference: REQ(25), erpRequisitionNo: "XR2026000161", erpNoteNo: "RN/2026/0161", title: "Filter and pipework renewal, Bukit Demo plant",
      justification: "Filter media and headers are past their service life.", needStatement: "Restore filter throughput before the dry season.",
      dateRequired: day("2026-12-31"), estimatedValue: "330000.00", raisedOn: day("2026-06-01"), status: "SOURCING", commitmentMovementId: `${P}bm20`,
      lines: { create: [{ id: `${P}rq13l1`, lineNo: 1, description: "Filter renewal works", estimatedAmount: "300000.00" }, { id: `${P}rq13l2`, lineNo: 2, description: "Dosing controllers and spares", estimatedAmount: "30000.00" }] },
    },
  });
  await db.requisition.create({
    data: {
      ...base, id: `${P}rq14`, reference: REQ(26), erpRequisitionNo: "XR2026000162", erpNoteNo: "RN/2026/0162", title: "Clear-water tank refurbishment",
      justification: "The tank lining has failed its inspection.", needStatement: "Reline and re-roof the clear-water tank.",
      dateRequired: day("2027-03-31"), estimatedValue: "600000.00", raisedOn: day("2026-08-10"), status: "APPROVED", commitmentMovementId: `${P}bm21`,
      lines: { create: [{ id: `${P}rq14l1`, lineNo: 1, description: "Tank relining and roof works", estimatedAmount: "600000.00" }] },
    },
  });
  await raiseSeries(db, `${P}n1`, 27);
  await db.requisitionEndorsement.createMany({
    data: [
      { id: `${P}en13a`, requisitionId: `${P}rq13`, tier: "SECTION", unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: day("2026-06-02") },
      { id: `${P}en13b`, requisitionId: `${P}rq13`, tier: "DEPARTMENT", unitCode: "NTH", personId: `${P}p9`, endorsedOn: day("2026-06-02") },
      { id: `${P}en14a`, requisitionId: `${P}rq14`, tier: "SECTION", unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: day("2026-08-11") },
      { id: `${P}en14b`, requisitionId: `${P}rq14`, tier: "DEPARTMENT", unitCode: "NTH", personId: `${P}p9`, endorsedOn: day("2026-08-12") },
    ],
  });
  const check = (rq: number, on: string, requested: string, balance: string, approvedAccount: string, projected: string) => ({
    id: `${P}bk${rq}`, requisitionId: `${P}rq${rq}`, checkedAt: day(on), asAt: day(on), source: "PORTAL_LEDGER" as const, budgetCodeId: `${P}bcode8`, budgetCodeCode: "CAP26-044",
    requestedAmount: requested, actualBudget: "1500000.00", balanceAsAt: balance, approvedAccount, approvedAccountProvenance: "ASSUMED" as const, projectedBalance: projected, verdict: "WITHIN" as const,
  });
  await db.requisitionBudgetCheck.createMany({ data: [check(13, "2026-06-05", "330000.00", "1500000.00", "0.00", "1170000.00"), check(14, "2026-08-15", "600000.00", "1170000.00", "330000.00", "570000.00")] });
  const policySnap = { windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, policyProvenance: "ASSUMED" as const, relatedRequisitionIds: [], relatedReferences: [] };
  await db.requisitionSplitCheck.createMany({
    data: [
      { id: `${P}sp13`, requisitionId: `${P}rq13`, checkedAt: day("2026-06-05"), state: "CLEAR", ...policySnap },
      { id: `${P}sp14`, requisitionId: `${P}rq14`, checkedAt: day("2026-08-15"), state: "CLEAR", ...policySnap },
    ],
  });
  const approvedRoute = (rq: number, opened: string, closed: string) => ({
    id: `${P}ai${rq}`, organisationId, matterKind: "REQUISITION" as const, requisitionId: `${P}rq${rq}`, domain: "requisition", value: rq === 13 ? "330000.00" : "600000.00",
    authorityMatrixId: mx, matrixLabel: "Demo limits, issue 1", ruleKey: "demo.requisition.4", ruleLabel: "Requisition, above RM250,000", ruleClause: "DEMO 3.1(d)",
    boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null, fundingRouteCode: "capex",
    budgetCheckId: `${P}bk${rq}`, budgetVerdict: "WITHIN" as const, availabilityCheck: "blocking", splitCheckId: `${P}sp${rq}`, splitState: "CLEAR" as const,
    checkedAgainstMatrix: true, status: "APPROVED" as const, openedAt: day(opened), closedAt: day(closed), commitOnApproval: true, routeCommitsBudget: true,
  });
  await db.approvalInstance.createMany({ data: [approvedRoute(13, "2026-06-05", "2026-06-24"), approvedRoute(14, "2026-08-15", "2026-08-28")] });
  const step = (rq: number, seq: number, roleCode: string, roleLabel: string, act: "P" | "R" | "MR" | "A", pid: string, name: string, on: string, nonDelegable = false) => ({
    id: `${P}as${rq}_${seq}`, instanceId: `${P}ai${rq}`, sequence: seq, roleCode, roleLabel, act, nonDelegable, sourceRuleKey: "demo.requisition.4",
    decision: "DONE" as const, decidedByPersonId: pid, decidedByName: name, decidedOn: day(on), recordedAt: day(on),
  });
  await db.approvalStep.createMany({
    data: [
      step(13, 1, "DEPT_HEAD", "Head of Department", "P", `${P}p9`, "Imran Hakim", "2026-06-08"),
      step(13, 2, "DIV_HEAD", "Head of Division", "R", `${P}p7`, "Gopal Nair", "2026-06-12"),
      step(13, 3, "FD", "Finance Director", "MR", `${P}p2`, "Bala Krishnan", "2026-06-18", true),
      step(13, 4, "CEO", "Chief Executive", "A", `${P}p1`, "Aisyah Rahman", "2026-06-24"),
      step(14, 1, "DEPT_HEAD", "Head of Department", "P", `${P}p9`, "Imran Hakim", "2026-08-17"),
      step(14, 2, "DIV_HEAD", "Head of Division", "R", `${P}p7`, "Gopal Nair", "2026-08-19"),
      step(14, 3, "FD", "Finance Director", "MR", `${P}p2`, "Bala Krishnan", "2026-08-24", true),
      step(14, 4, "CEO", "Chief Executive", "A", `${P}p1`, "Aisyah Rahman", "2026-08-28"),
    ],
  });

  // Their trail, in the shape the requisition actions write it (UX 5; ruling on the demo
  // trail): raised, endorsed twice, checked and submitted with its route, each step
  // decided, committed and approved — and rq13 moved into sourcing by DEMO/SX/0002.
  await db.auditEntry.createMany({ data: [...(await requisitionTrail(organisationId, 13)), ...(await requisitionTrail(organisationId, 14))] });

  // The exercises. Their bands, snapshots and decided records are written afterwards by
  // the same functions a save uses.
  const SX = (n: number) => `DEMO/SX/${String(n).padStart(4, "0")}/2026`;
  const ex = (n: number, rq: number, title: string, value: string, method: string, extra: object = {}) => ({
    id: `${P}sx${n}`, organisationId, specPanelUsed: true, onScreenBillUsed: true, saleMode: "COUNTER" as const, submissionChannel: "PAPER" as const, reference: SX(n), requisitionId: `${P}rq${rq}`, title, estimatedValue: value, sourcingMethodCode: method,
    createdAt: day("2026-09-01"), ...extra,
  });
  await db.sourcingExercise.createMany({
    data: [
      ex(1, 13, "Filter renewal works", "300000.00", "open_quotation", { contractBasisCode: "bq", createdAt: day("2026-09-10") }),
      ex(2, 13, "Dosing controllers from the sole distributor", "9000.00", "selective_direct", {
        status: "DOCUMENTS_IN_PREPARATION", methodReason: "The controllers must match the installed dosing system; only its distributor supplies them.",
        justificationReasonCode: "sole_distributor", justificationText: "The installed dosing system accepts only its maker's controllers.", evidenceNote: "Distributor's letter of sole authority, dated 12 August 2026, held by Contract & Procurement.",
        dossierReference: "DEMO/DA/0001/2026", contractBasisCode: "ds", createdAt: day("2026-09-02"),
      }),
      ex(3, 14, "Tank relining by a specialist contractor", "420000.00", "selected_tender", {
        methodReason: "Relining a potable-water tank needs an accredited applicator; only a few firms hold the accreditation.",
        justificationText: "Three firms in the region hold the potable-water lining accreditation.", contractBasisCode: "ds", proposalState: "REVIEWED",
        proposalSubmittedOn: day("2026-09-15"), proposalReviewedOn: day("2026-09-20"), proposalReviewerPersonId: `${P}p3`, proposalReviewComment: "Grades confirmed against the register.", createdAt: day("2026-09-12"),
      }),
      ex(4, 13, "Emergency repair of the trunk main", "12000.00", "emergency", {
        status: "DOCUMENTS_IN_PREPARATION", methodReason: "A burst trunk main cut supply to the upper zone.",
        emergencyTrigger: "Burst trunk main at Jalan Demo, supply to the upper zone cut.", coordinationMeetingOn: day("2026-09-02"),
        coordinationAttendees: "Operations, Contract & Procurement, Northern Region", coordinationScopeNote: "Replace 12 metres of main and reinstate the road.", bqReference: "DEMO/BQ/2026/017",
        contractBasisCode: "bq", createdAt: day("2026-09-03"),
      }),
      ex(5, 14, "Roof works and tank fittings", "150000.00", "open_quotation", { contractBasisCode: "bq", createdAt: day("2026-09-18") }),
      ex(6, 13, "Spare filter nozzles", "15000.00", "direct", { status: "CANCELLED", cancelReason: "The nozzles were supplied under the filter works instead.", createdAt: day("2026-09-04") }),
      // A second direct appointment, its dossier evidence not attached: BD-4's block stays visible.
      ex(7, 14, "Chlorine analyser spares from the sole agent", "9500.00", "selective_direct", {
        status: "DOCUMENTS_IN_PREPARATION", methodReason: "The analyser's maker supplies its spares only through its sole agent.",
        justificationReasonCode: "sole_distributor", justificationText: "The installed analyser accepts only its maker's spares.", evidenceNote: "Agent's letter of appointment, to be scanned.",
        dossierReference: "DEMO/DA/0002/2026", contractBasisCode: "ds", createdAt: day("2026-09-05"),
      }),
    ],
  });
  const part = (n: number, i: number, kind: "GOODS_DELIVERED" | "MEASURED_CONSTRUCTION" | "TERM_PERFORMANCE", amount: string, description: string) => ({ id: `${P}sx${n}p${i}`, exerciseId: `${P}sx${n}`, deliverableKind: kind, amount, description, sortOrder: i });
  await db.exerciseScopePart.createMany({
    data: [
      part(1, 1, "MEASURED_CONSTRUCTION", "300000.00", "Filter media and header renewal"),
      part(2, 1, "GOODS_DELIVERED", "9000.00", "Two dosing controllers"),
      part(3, 1, "MEASURED_CONSTRUCTION", "420000.00", "Relining the tank"),
      part(4, 1, "MEASURED_CONSTRUCTION", "12000.00", "Main replacement and reinstatement"),
      part(5, 1, "MEASURED_CONSTRUCTION", "105000.00", "Roof replacement"),
      part(5, 2, "GOODS_DELIVERED", "45000.00", "Tank fittings and hatches"),
      part(6, 1, "GOODS_DELIVERED", "15000.00", "Filter nozzles"),
      part(7, 1, "GOODS_DELIVERED", "9500.00", "Analyser sensor spares"),
    ],
  });
  // The emergency's report form was ambiguous for works on a bill of quantities: chosen once.
  await db.exerciseTaxonomyValue.create({ data: { id: `${P}sx4tv`, exerciseId: `${P}sx4`, taxonomyCode: "report", valueCode: "works", pick: "CHOSEN" } });
  await db.exerciseProposalAnswer.createMany({
    data: [
      { id: `${P}pa1`, exerciseId: `${P}sx3`, itemKey: "scope", text: "Blast, prime and reline the 5 ML clear-water tank; replace the access hatches.", answeredAt: day("2026-09-14") },
      { id: `${P}pa2`, exerciseId: `${P}sx3`, itemKey: "estimate", text: "RM420,000, within the requisition's approved RM600,000 on CAP26-044.", answeredAt: day("2026-09-14") },
      { id: `${P}pa3`, exerciseId: `${P}sx3`, itemKey: "grades", text: "Grade 5 and above, with the potable-water lining accreditation.", answeredAt: day("2026-09-14") },
      { id: `${P}pa4`, exerciseId: `${P}sx3`, itemKey: "firms", text: "Demo Linings Sdn Bhd, Contoh Coatings Sdn Bhd, Sampel Tank Works Sdn Bhd — each has relined a tank for the demo utility.", answeredAt: day("2026-09-14") },
      { id: `${P}pa5`, exerciseId: `${P}sx3`, itemKey: "period", text: "Sixteen weeks, with the tank out of service for ten.", answeredAt: day("2026-09-14") },
    ],
  });
  await db.exerciseParticipant.createMany({
    data: [
      { id: `${P}xp1`, exerciseId: `${P}sx3`, personId: `${P}p3`, capacity: "Contract & Procurement" },
      { id: `${P}xp2`, exerciseId: `${P}sx3`, personId: `${P}p4`, capacity: "Evaluation panel" },
      { id: `${P}xp3`, exerciseId: `${P}sx3`, personId: `${P}p7`, capacity: "Head of Division" },
    ],
  });
  // The selected tender's name, sent for approval and part-way through its route.
  await db.approvalInstance.create({
    data: {
      id: `${P}ai20`, organisationId, matterKind: "EXERCISE", exerciseId: `${P}sx3`, domain: "name_approval", value: "420000.00",
      authorityMatrixId: mx, matrixLabel: "Demo limits, issue 1", ruleKey: "demo.name.tender", ruleLabel: "Name approval, selected tender", ruleClause: "DEMO 4.4",
      boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: null, boundaryOperator: null, fundingRouteCode: "capex",
      checkedAgainstMatrix: true, status: "PENDING", openedAt: day("2026-09-21"),
      steps: {
        create: [
          { id: `${P}as20_1`, sequence: 1, roleCode: "SEC_PRE", roleLabel: "Section Head, Pre-contract", act: "P", sourceRuleKey: "demo.name.tender", decision: "DONE", decidedByPersonId: `${P}p5`, decidedByName: "Eng Siew Mei", decidedOn: day("2026-09-22"), recordedAt: day("2026-09-22") },
          { id: `${P}as20_2`, sequence: 2, roleCode: "HOD_CP", roleLabel: "Head of Contract & Procurement", act: "MR", nonDelegable: true, sourceRuleKey: "demo.name.tender" },
          { id: `${P}as20_3`, sequence: 3, roleCode: "DIV_HEAD", roleLabel: "Head of Division", act: "JR", sourceRuleKey: "demo.name.tender" },
          { id: `${P}as20_4`, sequence: 4, roleCode: "FD", roleLabel: "Finance Director", act: "R", sourceRuleKey: "demo.name.tender" },
          { id: `${P}as20_5`, sequence: 5, roleCode: "CEO", roleLabel: "Chief Executive", act: "A", sourceRuleKey: "demo.name.tender" },
        ],
      },
    },
  });
}

/**
 * The Phase 1 close-out (committee gates, rejection destinations, step escalation, the
 * holder's recommendation). Invented throughout, like every demo figure.
 *
 * - A funding route that needs a committee gate, two gate rules on it, and a committee
 *   that decides gates, with its own carried label and not-carried outcomes. Operating
 *   and capital budgets say they have no gate; funder-led and supervision stay unset.
 * - Three requisitions on that route: one awaiting its gates, one returned then passed,
 *   one ended by its gate and closed without sourcing (commitment released).
 * - A requisition destination (return to the Head of Division's step), snapshotted on
 *   the routes opened after it took effect; one rejection applied (a successor route),
 *   one decided by the officer's recorded choice, one awaiting it.
 * - A conflict declared on a pending step and escalated one level up.
 *
 * The gate requisitions are on their own account and budget code, raised more than the
 * splitting window apart, so their stored split checks are what the policy would find.
 */
async function loadCloseout(organisationId: string) {
  const REQ = (n: number) => `DEMO/REQ/${String(n).padStart(4, "0")}/2026`;

  // ------------------------------------------------------------- funding routes
  await db.fundingRoute.updateMany({ where: { id: { in: [`${P}fr1`, `${P}fr2`] } }, data: { committeeGateRequired: false, committeeGateProvenance: "ASSUMED" } });
  await db.fundingRoute.create({
    data: {
      id: `${P}fr5`, organisationId, code: "capital_projects", nameEn: "Capital projects", approvalCommitsBudget: true, approvalCommitsBudgetProvenance: "ASSUMED",
      committeeGateRequired: true, committeeGateProvenance: "ASSUMED", trigger: "Capital project approved in the plan", governingSource: "Demo policy 3.3", provenance: "ASSUMED", sortOrder: 5,
    },
  });
  await db.accountCode.createMany({
    data: [
      { id: `${P}ac6`, organisationId, code: "7500500", nameEn: "Capital works", provenance: "ASSUMED", sortOrder: 6, effectiveFrom: day("2024-01-01") },
      { id: `${P}ac7`, organisationId, code: "6300300", nameEn: "Minor works", provenance: "ASSUMED", sortOrder: 7, effectiveFrom: day("2024-01-01") },
    ],
  });
  await db.budgetCode.createMany({
    data: [
      { id: `${P}bcode10`, organisationId, code: "CAP26-060", descriptionEn: "Northern capital projects", type: "Capital", owningUnitCode: "NTH", accountCode: "7500500", holderPersonId: `${P}p9`, effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") },
      { id: `${P}bcode11`, organisationId, code: "OPX26-063", descriptionEn: "Northern minor works", type: "Operating", owningUnitCode: "NTH", accountCode: "6300300", holderPersonId: `${P}p9`, effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") },
    ],
  });
  await db.budgetMovement.createMany({
    data: [
      { id: `${P}bm40`, budgetCodeId: `${P}bcode10`, kind: "ORIGINAL", amount: "3000000.00", occurredOn: day("2026-01-01"), reference: "BR26-060" },
      { id: `${P}bm41`, budgetCodeId: `${P}bcode11`, kind: "ORIGINAL", amount: "200000.00", occurredOn: day("2026-01-01"), reference: "BR26-063" },
      // Written when rq26, rq27 and rq25 were approved; rq27's released when its gate ended it.
      { id: `${P}bm42`, budgetCodeId: `${P}bcode10`, kind: "COMMITMENT", amount: "140000.00", occurredOn: day("2026-06-26"), reference: REQ(33), description: "Telemetry for the northern reservoirs" },
      {
        id: `${P}bm43`, budgetCodeId: `${P}bcode10`, kind: "COMMITMENT", amount: "90000.00", occurredOn: day("2026-08-12"), reference: REQ(34), description: "Second clear-water main, Taman Demo",
        releasedOn: day("2026-09-26"), releaseNote: `Released: ${REQ(34)} closed without sourcing — the Capital Works Committee found the second main not required.`,
      },
      { id: `${P}bm44`, budgetCodeId: `${P}bcode10`, kind: "COMMITMENT", amount: "320000.00", occurredOn: day("2026-09-25"), reference: REQ(32), description: "Booster station, Bukit Demo upper zone" },
    ],
  });

  // ------------------------------------------------- the committee that decides gates
  await db.committee.create({
    data: {
      id: `${P}c5`, organisationId, code: "CAPWORKS_CTTE", nameEn: "Capital Works Committee", nameMs: "Jawatankuasa Kerja Modal",
      mandate: "Scrutinises capital projects after approval and before sourcing.", governingSource: "Demo constitution cl. 6", action: "RECOMMENDS",
      quorum: 2, quorumProvenance: "ASSUMED", compositionProvenance: "ASSUMED", secretariatRoleCode: "HOD_CP", votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
      carriedLabelEn: "Supported", carriedLabelMs: "Disokong",
    },
  });
  await db.committeeMember.createMany({
    data: [
      { id: `${P}m20`, committeeId: `${P}c5`, seatRoleCode: "CEO", position: "CHAIRMAN", provenance: "ASSUMED", effectiveFrom: day("2024-01-01") },
      { id: `${P}m21`, committeeId: `${P}c5`, seatRoleCode: "FD", position: "MEMBER", provenance: "ASSUMED", effectiveFrom: day("2024-01-01") },
      { id: `${P}m22`, committeeId: `${P}c5`, personId: `${P}p3`, position: "SECRETARY", provenance: "ASSUMED", effectiveFrom: day("2024-01-01") },
    ],
  });
  await db.notApprovedOutcome.createMany({
    data: [
      { id: `${P}nao5`, organisationId, code: "cwc_revise", nameEn: "Revise and re-table", nameMs: "Semak dan bentang semula", kind: "LOOP", committeeId: `${P}c5`, governingSource: "Demo constitution cl. 6.4(a)", provenance: "ASSUMED", sortOrder: 5 },
      { id: `${P}nao6`, organisationId, code: "cwc_not_required", nameEn: "Not required", nameMs: "Tidak diperlukan", kind: "TERMINAL", committeeId: `${P}c5`, governingSource: "Demo constitution cl. 6.4(b)", provenance: "ASSUMED", sortOrder: 6 },
    ],
  });
  await db.committeeGateRule.createMany({
    data: [
      { id: `${P}gr1`, organisationId, fundingRouteCode: "capital_projects", committeeCode: "CAPWORKS_CTTE", subjectEn: "Capital works scrutiny", subjectMs: "Penelitian kerja modal", act: "R", governingSource: "Demo policy 3.3(a)", provenance: "ASSUMED", effectiveFrom: day("2026-06-01"), sortOrder: 1 },
      { id: `${P}gr2`, organisationId, fundingRouteCode: "capital_projects", committeeCode: "TECH_CTTE", subjectEn: "Technical review", act: "R", aboveValue: "250000.00", governingSource: "Demo policy 3.3(b)", provenance: "ASSUMED", effectiveFrom: day("2026-06-01"), sortOrder: 2 },
    ],
  });

  // ------------------------------------------------------- rejection destinations
  await db.rejectionDestination.create({
    data: {
      id: `${P}rd1`, organisationId, domain: "requisition", kind: "RETURN_TO_STEP", returnToRoleCode: "DIV_HEAD", governingSource: "Demo policy 3.5", provenance: "ASSUMED",
      notes: "Invented: a rejected requisition goes back to the Head of Division's step.", effectiveFrom: day("2026-07-01"),
    },
  });
  const snap = (opened: string) => ({ rejectionSnapshotAt: day(opened), rejectionDestinationId: `${P}rd1`, rejectionKind: "RETURN_TO_STEP" as const, rejectionReturnToRoleCode: "DIV_HEAD", rejectionProvenance: "ASSUMED" as const });
  // The pending routes opened after it took effect carry it, as submission writes it.
  await db.approvalInstance.update({ where: { id: `${P}ai3` }, data: snap("2026-07-28") });
  // The pending route on demo.requisition.2 opened with the core routing recorded: its
  // chain was generated from the Head of Division's row, as submission now writes it.
  // Every other demo route predates that and reads "Not recorded".
  await db.approvalInstance.update({
    where: { id: `${P}ai3` },
    data: {
      coreSnapshotAt: day("2026-07-28"), coreChainFlag: true, coreChainReason: null,
      coreRoutingSnapshot: { approverCode: "DIV_HEAD", clause: "DEMO 2.2", provenance: "ASSUMED", note: "Invented for the demo.", steps: [{ roleCode: "DEPT_HEAD", act: "R", provenance: "ASSUMED" }] },
    },
  });
  await db.approvalStep.update({ where: { id: `${P}as3_1` }, data: { chainOrigin: "CORE" } });
  await db.approvalInstance.update({ where: { id: `${P}ai4` }, data: snap("2026-09-18") });
  await db.approvalInstance.update({ where: { id: `${P}ai5` }, data: snap("2026-09-24") });

  // ------------------------------------------------------------- the requisitions
  const chains = {
    6: { key: "demo.requisition.2", label: "Requisition, RM1,000 to RM40,000", clause: "DEMO 3.1(b)", steps: [["DEPT_HEAD", "Head of Department", "R"], ["DIV_HEAD", "Head of Division", "A"]] },
    7: { key: "demo.requisition.3", label: "Requisition, RM40,000 to RM250,000", clause: "DEMO 3.1(c)", steps: [["DEPT_HEAD", "Head of Department", "P"], ["DIV_HEAD", "Head of Division", "R"], ["FD", "Finance Director", "A"]] },
    8: { key: "demo.requisition.4", label: "Requisition, above RM250,000", clause: "DEMO 3.1(d)", steps: [["DEPT_HEAD", "Head of Department", "P"], ["DIV_HEAD", "Head of Division", "R"], ["FD", "Finance Director", "MR"], ["CEO", "Chief Executive", "A"]] },
  } as const;
  const deciders: Record<string, [string, string]> = { DEPT_HEAD: ["p9", "Imran Hakim"], DIV_HEAD: ["p7", "Gopal Nair"], FD: ["p2", "Bala Krishnan"], CEO: ["p1", "Aisyah Rahman"] };
  type Spec = {
    id: number; n: number; title: string; value: string; route: string; account: string; code: number; raised: string; endorsed: [string, string]; checked: string; balance: string;
    rule: 6 | 7 | 8; decided: string[]; rejectedOn?: string; reason?: string; status: string; commitment?: string;
    justification: string; need: string; deptHead?: [string, string];
  };
  const specs: Spec[] = [
    { id: 25, n: 32, title: "Booster station, Bukit Demo upper zone", value: "320000.00", route: "capital_projects", account: "7500500", code: 10, raised: "2026-09-16", endorsed: ["2026-09-17", "2026-09-18"], checked: "2026-09-21", balance: "2770000.00",
      rule: 8, decided: ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"], status: "APPROVED", commitment: `${P}bm44`,
      justification: "The upper zone loses pressure at peak demand.", need: "A booster station feeding the upper zone." },
    { id: 26, n: 33, title: "Telemetry for the northern reservoirs", value: "140000.00", route: "capital_projects", account: "7500500", code: 10, raised: "2026-06-15", endorsed: ["2026-06-16", "2026-06-17"], checked: "2026-06-19", balance: "3000000.00",
      rule: 7, decided: ["2026-06-22", "2026-06-24", "2026-06-26"], status: "APPROVED", commitment: `${P}bm42`,
      justification: "Reservoir levels are read by hand twice a day.", need: "Levels and flows reported to the control room." },
    { id: 27, n: 34, title: "Second clear-water main, Taman Demo", value: "90000.00", route: "capital_projects", account: "7500500", code: 10, raised: "2026-07-31", endorsed: ["2026-08-01", "2026-08-03"], checked: "2026-08-04", balance: "2860000.00",
      rule: 7, decided: ["2026-08-06", "2026-08-10", "2026-08-12"], status: "CLOSED", commitment: `${P}bm43`,
      justification: "A single main feeds the estate.", need: "A second main so the estate stays supplied during repairs." },
    { id: 28, n: 35, title: "District meters, zone C", value: "60000.00", route: "opex", account: "6300300", code: 11, raised: "2026-07-20", endorsed: ["2026-07-21", "2026-07-22"], checked: "2026-07-23", balance: "200000.00",
      rule: 7, decided: ["2026-07-27", "2026-07-30"], rejectedOn: "2026-08-05", reason: "The meters specified do not match the zone's pipe sizes. The Head of Division to review the specification.", status: "PENDING_APPROVAL",
      justification: "Zone C's night flow cannot be measured.", need: "Meters at the zone's four inlets." },
    { id: 29, n: 36, title: "Pipe repair clamps", value: "20000.00", route: "opex", account: "6300300", code: 11, raised: "2026-05-25", endorsed: ["2026-05-26", "2026-05-27"], checked: "2026-06-01", balance: "200000.00",
      rule: 6, decided: ["2026-06-03"], rejectedOn: "2026-06-05", reason: "Clamps are held on the term contract. Raise against it instead.", status: "DRAFT", deptHead: ["p6", "Faridah Osman"],
      justification: "Clamps run out during the monsoon.", need: "Repair clamps, 100 mm to 300 mm." },
    { id: 30, n: 37, title: "Hydrant replacement, Taman Demo", value: "22000.00", route: "opex", account: "6300300", code: 11, raised: "2026-09-14", endorsed: ["2026-09-15", "2026-09-16"], checked: "2026-09-17", balance: "200000.00",
      rule: 6, decided: ["2026-09-21"], rejectedOn: "2026-09-24", reason: "The hydrants are the fire authority's to replace under the bulk supply agreement.", status: "REJECTED",
      justification: "Six hydrants failed their annual test.", need: "Working hydrants on the estate's ring main." },
  ];
  const code = (n: number) => (n === 10 ? "CAP26-060" : "OPX26-063");
  for (const s of specs) {
    const rq = `${P}rq${s.id}`;
    const chain = chains[s.rule];
    const dept = s.deptHead ?? ["p9", "Imran Hakim"];
    await db.requisition.create({
      data: {
        id: rq, organisationId, reference: REQ(s.n), origin: "PORTAL", erpRequisitionNo: `XR20260002${s.n}`, erpNoteNo: `RN/2026/02${s.n}`, erpRefSource: "MANUAL", erpRefRecordedAt: day(s.raised),
        requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, title: s.title, justification: s.justification, needStatement: s.need,
        costCentreCode: "CC-200", accountCode: s.account, budgetCodeId: `${P}bcode${s.code}`, siteCode: "NTH-WKS", placeOfDelivery: "Northern network", dateRequired: day("2027-03-31"),
        estimatedValue: s.value, raisedOn: day(s.raised), fundingRouteCode: s.route, fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES",
        status: s.status as "APPROVED", commitmentMovementId: s.commitment ?? null,
        ...(s.route === "capital_projects" ? { gatesDeterminedOn: day(s.decided[s.decided.length - 1]), gateRequired: true, gateRequiredProvenance: "ASSUMED" as const } : {}),
        ...(s.id === 27 ? { closedReason: "The Capital Works Committee found the second main not required: the estate's ring main is to be looped instead." } : {}),
        lines: { create: [{ id: `${rq}l1`, lineNo: 1, description: s.title, estimatedAmount: s.value }] },
      },
    });
    await db.requisitionEndorsement.createMany({
      data: [
        { id: `${P}en${s.id}a`, requisitionId: rq, tier: "SECTION", unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: day(s.endorsed[0]) },
        { id: `${P}en${s.id}b`, requisitionId: rq, tier: "DEPARTMENT", unitCode: "NTH", personId: `${P}${dept[0]}`, endorsedOn: day(s.endorsed[1]) },
      ],
    });
    const balance = BigInt(s.balance.replace(".", ""));
    const value = BigInt(s.value.replace(".", ""));
    const actual = s.code === 10 ? 300_000_000n : 20_000_000n;
    const fmt = (x: bigint) => `${x / 100n}.${String(x % 100n).padStart(2, "0")}`;
    await db.requisitionBudgetCheck.create({
      data: {
        id: `${P}bk${s.id}`, requisitionId: rq, checkedAt: day(s.checked), asAt: day(s.checked), source: "PORTAL_LEDGER", budgetCodeId: `${P}bcode${s.code}`, budgetCodeCode: code(s.code),
        requestedAmount: s.value, actualBudget: fmt(actual), balanceAsAt: s.balance, approvedAccount: fmt(actual - balance), approvedAccountProvenance: "ASSUMED", projectedBalance: fmt(balance - value), verdict: "WITHIN",
      },
    });
    await db.requisitionSplitCheck.create({
      data: { id: `${P}sp${s.id}`, requisitionId: rq, checkedAt: day(s.checked), state: "CLEAR", windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, policyProvenance: "ASSUMED", relatedRequisitionIds: [], relatedReferences: [] },
    });
    // The route as opened: under the destination where it was in force that day.
    const afterDestination = s.checked >= "2026-07-01";
    const rejected = s.rejectedOn != null;
    const rejectingSeq = rejected ? s.decided.length + 1 : null;
    await db.approvalInstance.create({
      data: {
        id: `${P}ai${s.id}`, organisationId, matterKind: "REQUISITION", requisitionId: rq, domain: "requisition", value: s.value,
        authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: chain.key, ruleLabel: chain.label, ruleClause: chain.clause,
        boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null, fundingRouteCode: s.route,
        budgetCheckId: `${P}bk${s.id}`, budgetVerdict: "WITHIN", availabilityCheck: "blocking", splitCheckId: `${P}sp${s.id}`, splitState: "CLEAR",
        checkedAgainstMatrix: true, openedAt: day(s.checked), commitOnApproval: true, routeCommitsBudget: !rejected,
        ...(afterDestination ? snap(s.checked) : {}),
        ...(rejected
          ? {
              status: "REJECTED" as const, closedAt: day(s.rejectedOn!), rejectionReason: s.reason!,
              // rq28: the destination applied. rq30: it named a step not before the rejecting one, so the officer chooses.
              // rq29: rejected before destinations existed; the officer's choice recorded since.
              ...(s.id === 28 ? { rejectionApplied: "RETURN_TO_STEP" as const, rejectionSource: "CONFIGURED" as const } : {}),
              ...(s.id === 30 ? { rejectionChoices: ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"] as ("RETURN_TO_ORIGINATOR" | "RETURN_TO_STEP" | "TERMINATE")[], rejectionChoiceWhy: "STEP_NOT_ON_ROUTE" } : {}),
              ...(s.id === 29 ? { rejectionApplied: "RETURN_TO_ORIGINATOR" as const, rejectionSource: "OFFICER_CHOICE" as const, rejectionChosenByPersonId: `${P}p3` } : {}),
            }
          : { status: "APPROVED" as const, closedAt: day(s.decided[s.decided.length - 1]) }),
        steps: {
          create: chain.steps.map(([roleCode, roleLabel, act], i) => {
            const [pid, name] = roleCode === "DEPT_HEAD" ? dept : deciders[roleCode];
            const base = { id: `${P}as${s.id}_${i + 1}`, sequence: i + 1, roleCode, roleLabel, act, nonDelegable: act === "MR", sourceRuleKey: chain.key };
            if (i < s.decided.length) return { ...base, decision: "DONE" as const, decidedByPersonId: `${P}${pid}`, decidedByName: name, decidedOn: day(s.decided[i]), recordedAt: day(s.decided[i]) };
            if (i + 1 === rejectingSeq) return { ...base, decision: "REJECTED" as const, decidedByPersonId: `${P}${pid}`, decidedByName: name, decidedOn: day(s.rejectedOn!), recordedAt: day(s.rejectedOn!), reason: s.reason! };
            return { ...base, decision: "PENDING" as const };
          }),
        },
      },
    });
  }

  // rq28's successor: the same approval continued from the Head of Division's step,
  // the department's step carried with its decision (ADR 0009).
  const c7 = chains[7];
  await db.approvalInstance.create({
    data: {
      id: `${P}ai28s`, organisationId, matterKind: "REQUISITION", requisitionId: `${P}rq28`, domain: "requisition", value: "60000.00",
      authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: c7.key, ruleLabel: c7.label, ruleClause: c7.clause,
      boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null, fundingRouteCode: "opex",
      budgetCheckId: `${P}bk28`, budgetVerdict: "WITHIN", availabilityCheck: "blocking", splitCheckId: `${P}sp28`, splitState: "CLEAR", checkedAgainstMatrix: true,
      ...snap("2026-07-23"), supersedesInstanceId: `${P}ai28`, status: "PENDING", openedAt: day("2026-08-05"),
      steps: {
        create: [
          { id: `${P}as28s_1`, sequence: 1, roleCode: "DEPT_HEAD", roleLabel: "Head of Department", act: "P", sourceRuleKey: c7.key, decision: "DONE", decidedByPersonId: `${P}p9`, decidedByName: "Imran Hakim", decidedOn: day("2026-07-27"), recordedAt: day("2026-07-27"), carriedFromStepId: `${P}as28_1` },
          { id: `${P}as28s_2`, sequence: 2, roleCode: "DIV_HEAD", roleLabel: "Head of Division", act: "R", sourceRuleKey: c7.key, decision: "PENDING" },
          { id: `${P}as28s_3`, sequence: 3, roleCode: "FD", roleLabel: "Finance Director", act: "A", sourceRuleKey: c7.key, decision: "PENDING" },
        ],
      },
    },
  });

  // ---------------------------------------------------------------- the gates
  const gate = (id: string, rq: number, committeeCode: string, committeeLabel: string, subjectEn: string, rule: string, aboveValue: string | null, on: string) => ({
    id: `${P}${id}`, requisitionId: `${P}rq${rq}`, gateRuleId: `${P}${rule}`, committeeCode, committeeLabel, subjectEn, act: "R" as const, aboveValue, ruleProvenance: "ASSUMED" as const, determinedOn: day(on),
  });
  await db.requisitionGate.createMany({
    data: [
      gate("rg25a", 25, "CAPWORKS_CTTE", "Capital Works Committee", "Capital works scrutiny", "gr1", null, "2026-09-25"),
      // Above RM250,000 the Technical Committee too; nothing is tabled against this gate yet.
      gate("rg25b", 25, "TECH_CTTE", "Technical Committee", "Technical review", "gr2", "250000.00", "2026-09-25"),
      gate("rg26", 26, "CAPWORKS_CTTE", "Capital Works Committee", "Capital works scrutiny", "gr1", null, "2026-06-26"),
      gate("rg27", 27, "CAPWORKS_CTTE", "Capital Works Committee", "Capital works scrutiny", "gr1", null, "2026-08-12"),
    ],
  });
  await db.meeting.createMany({
    data: [
      {
        id: `${P}mt8`, committeeId: `${P}c5`, reference: "DEMO/CWC/1/2026", meetingDate: day("2026-07-16"), status: "MINUTED", minutedAt: day("2026-07-17"),
        agenda: "Reservoir telemetry.", minutes: "The Committee asked for the telemetry scheme to be revised to cover the service reservoirs as well, and re-tabled.",
      },
      {
        id: `${P}mt9`, committeeId: `${P}c5`, reference: "DEMO/CWC/2/2026", meetingDate: day("2026-09-24"), status: "MINUTED", minutedAt: day("2026-09-25"),
        agenda: "Reservoir telemetry, revised. Second clear-water main, Taman Demo.",
        minutes: "The Committee supported the revised telemetry scheme. It found the second main not required, the ring main being looped instead.",
      },
      { id: `${P}mt10`, committeeId: `${P}c5`, reference: "DEMO/CWC/3/2026", meetingDate: day("2026-10-20"), status: "SCHEDULED", agenda: "Booster station, Bukit Demo upper zone." },
    ],
  });
  await db.meetingAttendance.createMany({
    data: [
      { id: `${P}at30`, meetingId: `${P}mt8`, personId: `${P}p1`, attended: true },
      { id: `${P}at31`, meetingId: `${P}mt8`, personId: `${P}p2`, attended: true },
      { id: `${P}at32`, meetingId: `${P}mt8`, personId: `${P}p3`, attended: true },
      { id: `${P}at33`, meetingId: `${P}mt9`, personId: `${P}p1`, attended: true },
      { id: `${P}at34`, meetingId: `${P}mt9`, personId: `${P}p2`, attended: true },
      { id: `${P}at35`, meetingId: `${P}mt9`, personId: `${P}p3`, attended: true },
    ],
  });
  const gateMatter = (id: string, meeting: string, seq: number, rq: number, n: number, amount: string, subject: string, tabled: string, gateId: string, decided?: object) => ({
    id: `${P}${id}`, meetingId: `${P}${meeting}`, sequence: seq, domain: "committee_gate", subject, matterKind: "REQUISITION" as const, matterRef: REQ(n), requisitionId: `${P}rq${rq}`,
    requisitionGateId: `${P}${gateId}`, amount, act: "R" as const, tabledByPersonId: `${P}p3`, tabledAt: day(tabled), ...decided,
  });
  const decidedOn = (on: string) => ({ decisionDate: day(on), quorumRequired: 2, presentVoters: 2, recusedCount: 0, votingRule: "SIMPLE_MAJORITY" as const, votingRuleProvenance: "ASSUMED" as const });
  await db.committeeDecision.createMany({
    data: [
      gateMatter("d20", "mt8", 1, 26, 33, "140000", "Capital works scrutiny: telemetry for the northern reservoirs", "2026-07-09", "rg26", {
        ...decidedOn("2026-07-16"), outcome: "NOT_CARRIED", notApprovedOutcomeId: `${P}nao5`, notApprovedOutcomeNameEn: "Revise and re-table", notApprovedOutcomeKind: "LOOP",
        outcomeNote: "Revise to cover the service reservoirs as well.",
      }),
      gateMatter("d21", "mt9", 1, 26, 33, "140000", "Capital works scrutiny: telemetry for the northern reservoirs, revised", "2026-09-17", "rg26", { ...decidedOn("2026-09-24"), outcome: "CARRIED" }),
      gateMatter("d22", "mt9", 2, 27, 34, "90000", "Capital works scrutiny: second clear-water main, Taman Demo", "2026-09-17", "rg27", {
        ...decidedOn("2026-09-24"), outcome: "NOT_CARRIED", notApprovedOutcomeId: `${P}nao6`, notApprovedOutcomeNameEn: "Not required", notApprovedOutcomeKind: "TERMINAL",
        outcomeNote: "The ring main is to be looped instead.",
      }),
      gateMatter("d23", "mt10", 1, 25, 32, "320000", "Capital works scrutiny: booster station, Bukit Demo upper zone", "2026-09-28", "rg25a"),
    ],
  });
  const v = (id: string, d: string, p: string, choice: "SETUJU" | "TIDAK_SETUJU", on: string) => ({ id: `${P}${id}`, decisionId: `${P}${d}`, personId: `${P}${p}`, choice, votedAt: day(on), recordedAt: day(on) });
  await db.vote.createMany({
    data: [
      v("v30", "d20", "p1", "TIDAK_SETUJU", "2026-07-16"), v("v31", "d20", "p2", "TIDAK_SETUJU", "2026-07-16"),
      v("v32", "d21", "p1", "SETUJU", "2026-09-24"), v("v33", "d21", "p2", "SETUJU", "2026-09-24"),
      v("v34", "d22", "p1", "TIDAK_SETUJU", "2026-09-24"), v("v35", "d22", "p2", "TIDAK_SETUJU", "2026-09-24"),
    ],
  });
  await raiseSeries(db, `${P}n1`, 38);

  // Approved before gates were checked on approval: their routes have no gate, as
  // determined. rq7 is left undetermined, so "Check committee gates" has work to do;
  // rq9's supervision route is unset, so checking it says so.
  const approved = await db.requisition.findMany({
    where: { id: { startsWith: P }, status: { in: ["APPROVED", "SOURCING"] }, fundingRouteCode: { in: ["opex", "capex"] }, gatesDeterminedOn: null, NOT: { id: `${P}rq7` } },
    select: { id: true, approvalInstances: { where: { status: "APPROVED" }, select: { closedAt: true } } },
  });
  for (const r of approved) {
    const on = r.approvalInstances[0]?.closedAt;
    if (on) await db.requisition.update({ where: { id: r.id }, data: { gatesDeterminedOn: on, gateRequired: false, gateRequiredProvenance: "ASSUMED" } });
  }

  // ------------------------------------------------------- a conflict, escalated
  // The Head of Division declares an interest in the booster pump and stands aside: the
  // step escalates one level, to the Finance Director, who is not on the route (C4).
  await db.approvalStep.update({
    where: { id: `${P}as3_2` },
    data: {
      actingRoleCode: "FD", actingRoleLabel: "Finance Director", escalation: "CONFLICT_DECLARED", escalationCount: 1, escalatedOn: day("2026-09-29"),
      escalationReason: "A relative supplies the pump offered. Declared and stood aside.", declaredByPersonId: `${P}p7`,
    },
  });

  // ------------------------------------- a delegation by a holder who is away
  await db.delegation.create({
    data: {
      id: `${P}dg3`, organisationId, fromPersonId: `${P}p5`, toPersonId: `${P}p4`, roleCode: "SEC_PRE", capabilityCodes: ["run_sourcing"], valueCeiling: "50000.00",
      reason: "Medical leave", effectiveFrom: day("2026-09-28"), effectiveTo: day("2026-10-16"), provenance: "STATED",
      holderRecommendation: "Recommended by the Section Head in her email of 25 September, before her leave.", holderRecommendedOn: day("2026-09-25"),
    },
  });
}

/// A demo requisition's 6.1 trail, built with the diff the requisition actions use and
/// in the same fields, dated as the demo tells it.
async function requisitionTrail(organisationId: string, rq: 13 | 14) {
  const { diffFields } = await import("../src/lib/audit/diff");
  const { ACT_LABEL } = await import("../src/lib/labels");
  const { TIER_LABEL } = await import("../src/lib/requisition/labels");
  const d = rq === 13
    ? { ref: "DEMO/REQ/0025/2026", title: "Filter and pipework renewal, Bukit Demo plant", raised: "2026-06-01", endorsed: ["2026-06-02", "2026-06-02"], checked: "2026-06-05", balance: "1500000.00", value: "330000.00", required: "2026-12-31", lines: 2,
        justification: "Filter media and headers are past their service life.", need: "Restore filter throughput before the dry season.", steps: ["2026-06-08", "2026-06-12", "2026-06-18", "2026-06-24"], movement: `${P}bm20`, sourcing: "2026-09-08" }
    : { ref: "DEMO/REQ/0026/2026", title: "Clear-water tank refurbishment", raised: "2026-08-10", endorsed: ["2026-08-11", "2026-08-12"], checked: "2026-08-15", balance: "1170000.00", value: "600000.00", required: "2027-03-31", lines: 1,
        justification: "The tank lining has failed its inspection.", need: "Reline and re-roof the clear-water tank.", steps: ["2026-08-17", "2026-08-19", "2026-08-24", "2026-08-28"], movement: `${P}bm21`, sourcing: null };
  const reqId = `${P}rq${rq}`;
  const label = `${d.ref} · ${d.title}`;
  const route = `${d.ref} · approval route`;
  const chain = [
    ["DEPT_HEAD", "Head of Department", "P", "Imran Hakim"],
    ["DIV_HEAD", "Head of Division", "R", "Gopal Nair"],
    ["FD", "Finance Director", "MR", "Bala Krishnan"],
    ["CEO", "Chief Executive", "A", "Aisyah Rahman"],
  ] as const;
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", at: string, changes: object[], reason = "") =>
    ({ id: `${reqId}_au${++n}`, organisationId, entity, entityId, entityLabel, action, at: day(at), changes: changes as object, reason, ...DEMO_ACTOR });
  return [
    entry("Requisition", reqId, label, "CREATE", d.raised, diffFields(null, {
      reference: d.ref, title: d.title, justification: d.justification, needStatement: d.need, requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`,
      costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode8`, siteCode: "NTH-WKS", placeOfDelivery: "Bukit Demo treatment plant", dateRequired: day(d.required),
      estimatedValue: d.value, fundingRouteCode: "capex", contractTypeCode: null, lines: d.lines, status: "DRAFT",
    })),
    entry("RequisitionEndorsement", `${P}en${rq}a`, `${d.ref} · ${TIER_LABEL.SECTION}`, "CREATE", d.endorsed[0], diffFields(null, { tier: "SECTION", unit: "Maintenance Section", person: "Lim Kok Seng", endorsedOn: day(d.endorsed[0]), note: "" })),
    entry("RequisitionEndorsement", `${P}en${rq}b`, `${d.ref} · ${TIER_LABEL.DEPARTMENT}`, "CREATE", d.endorsed[1], diffFields(null, { tier: "DEPARTMENT", unit: "Northern Region", person: "Imran Hakim", endorsedOn: day(d.endorsed[1]), note: "" })),
    entry("Requisition", reqId, label, "UPDATE", d.endorsed[1], diffFields({ status: "DRAFT" }, { status: "ENDORSED" })),
    // Submission: the budget check, the route opened, the requisition sent for approval.
    entry("RequisitionBudgetCheck", `${P}bk${rq}`, `${d.ref} · budget check`, "CREATE", d.checked, diffFields(null, { source: "PORTAL_LEDGER", asAt: day(d.checked), budgetCode: "CAP26-044", verdict: "WITHIN", balanceAsAt: d.balance, requestedAmount: d.value })),
    entry("ApprovalInstance", `${P}ai${rq}`, route, "CREATE", d.checked, diffFields(null, {
      matrix: "Demo limits, issue 1", rule: "Requisition, above RM250,000",
      route: chain.map(([, roleLabel, act]) => `${roleLabel} (${ACT_LABEL[act]?.toLowerCase() ?? "acts"})`).join(" → "),
      overBudget: false, fundingOverrideApplied: false, splitState: "CLEAR",
    })),
    entry("Requisition", reqId, label, "UPDATE", d.checked, diffFields({ status: "ENDORSED", sourcingPermitted: null }, { status: "PENDING_APPROVAL", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES" })),
    ...chain.map(([, roleLabel, , name], i) =>
      entry("ApprovalStep", `${P}as${rq}_${i + 1}`, `${d.ref} · ${roleLabel}`, "UPDATE", d.steps[i], diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: name, decidedOn: day(d.steps[i]), recordedOnBehalf: "not signed", underDelegation: null }))),
    // The last step approves: the commitment written, the route closed, the requisition approved.
    entry("BudgetMovement", d.movement, `CAP26-044 · commitment for ${d.ref}`, "CREATE", d.steps[3], diffFields(null, { kind: "COMMITMENT", budgetCode: "CAP26-044", reference: d.ref, amount: d.value, occurredOn: day(d.steps[3]) })),
    entry("ApprovalInstance", `${P}ai${rq}`, route, "UPDATE", d.steps[3], diffFields({ status: "PENDING" }, { status: "APPROVED", commitment: "written" })),
    entry("Requisition", reqId, label, "UPDATE", d.steps[3], diffFields({ status: "PENDING_APPROVAL" }, { status: "APPROVED" })),
    ...(d.sourcing ? [entry("Requisition", reqId, label, "UPDATE", d.sourcing, diffFields({ status: "APPROVED" }, { status: "SOURCING" }), "Exercise DEMO/SX/0002/2026 moved into preparation.")] : []),
  ];
}

/// The name route's trail, in the shape the request and decision actions write.
async function nameRouteTrail(organisationId: string) {
  const { diffFields } = await import("../src/lib/audit/diff");
  const { ACT_LABEL } = await import("../src/lib/labels");
  const chain = [["Section Head, Pre-contract", "P"], ["Head of Contract & Procurement", "MR"], ["Head of Division", "JR"], ["Finance Director", "R"], ["Chief Executive", "A"]] as const;
  await db.auditEntry.createMany({
    data: [
      {
        id: `${P}ai20_au1`, organisationId, entity: "ApprovalInstance", entityId: `${P}ai20`, entityLabel: "DEMO/SX/0003/2026 · name approval", action: "CREATE", at: day("2026-09-21"), ...DEMO_ACTOR,
        changes: diffFields(null, { matrix: "Demo limits, issue 1", rule: "Name approval, selected tender", route: chain.map(([r, a]) => `${r} (${ACT_LABEL[a]?.toLowerCase() ?? "acts"})`).join(" → "), fundingOverrideApplied: false }) as object,
      },
      {
        id: `${P}as20_1_au1`, organisationId, entity: "ApprovalStep", entityId: `${P}as20_1`, entityLabel: "DEMO/SX/0003/2026 · Section Head, Pre-contract", action: "UPDATE", at: day("2026-09-22"), ...DEMO_ACTOR,
        changes: diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: "Eng Siew Mei", decidedOn: day("2026-09-22"), recordedOnBehalf: "not signed", underDelegation: null }) as object,
      },
    ],
  });
}

/**
 * Determine the demo exercises as a save would: the bands under the issue in force, the
 * snapshot the screen renders from, and — for those loaded past Draft — the decided
 * record, all through `src/lib/method`. Refuses loudly if a demo exercise would not
 * pass its own save checks.
 */
async function determineExercises(ids: string[], preparedDates: Readonly<Record<string, string>> = {}) {
  const repo = await import("../src/lib/method/repo");
  const { evaluateExercise, saveBlockers } = await import("../src/lib/method/evaluate");
  const snap = await import("../src/lib/method/snapshot");
  const { behaviourProfile } = await import("../src/lib/method/profile");
  const { auditCreate, auditPair } = await import("../src/lib/method/audit-view");
  const { diffFields } = await import("../src/lib/audit/diff");
  const { DELIVERABLE_LABEL } = await import("../src/lib/method/labels");
  const { parseSen, senToDecimalString } = await import("../src/lib/money");
  // The minuted sittings are snapshotted next, on the same lib client, which they close.
  {
    for (const id of ids) {
      const l = await repo.loadExercise(await demoOrgId(), id);
      if (!l) throw new Error(`Demo exercise ${id} did not load.`);
      const { issue, cfg, ctx } = await repo.evaluationContext(l.org, l.req, l.ex);
      if (!issue || !ctx) throw new Error("No issue in force for the demo exercises.");
      const ev = evaluateExercise(repo.draftOf(l.ex), ctx);
      const blockers = saveBlockers(ev.findings);
      if (blockers.length > 0 && l.ex.status !== "CANCELLED") throw new Error(`Demo exercise ${id} would not save: ${blockers.map((b) => b.code).join(", ")}`);
      const on = day(l.org.today ?? "2026-09-30");
      const cols = snap.determinationColumns(ev, issue, (c) => cfg.config.methods.find((x) => x.code === c)?.nameEn ?? "", on);
      const prepared = l.ex.status === "DOCUMENTS_IN_PREPARATION";
      // The day it moved into preparation: 2026-09-08 for the exercises of 6.3–6.11, or as its module says.
      const preparedOn = preparedDates[id] ?? "2026-09-08";
      const decided = prepared
        ? snap.classificationSnapshotOf(ev, cfg.config, l.ex.contractBasisCode, (c) => issue.matrix.roles[c]?.nameEn ?? "", behaviourProfile, {
            reasonName: cfg.config.reasons.find((r) => r.code === l.ex.justificationReasonCode)?.nameEn ?? null,
            appointment: { state: ev.bands.appointment.state, ruleLabel: ev.bands.appointment.ruleLabel },
          })
        : null;
      // A submitted or reviewed proposal carries its record, as a submission writes it.
      const { proposalRecordOf } = await import("../src/lib/method/proposal");
      const record = l.ex.proposalState && l.ex.proposalState !== "DRAFT" ? proposalRecordOf(cfg.checklist[l.ex.sourcingMethodCode] ?? [], l.ex.proposalAnswers, day("2026-09-15")) : null;
      if (prepared && !decided) throw new Error(`Demo exercise ${id} cannot be decided.`);
      await db.sourcingExercise.update({
        where: { id },
        data: {
          ...cols,
          requisitionRuleKey: ctx.approved?.ruleKey ?? null,
          requisitionRuleLabel: ctx.approved?.ruleLabel ?? null,
          methodReason: cols.proposedMethodCode === l.ex.sourcingMethodCode ? "" : l.ex.methodReason,
          ...(record ? { proposalRecord: record as object } : {}),
          // Loaded as decided on the day it moved into preparation.
          ...(prepared ? { classificationSnapshot: decided as object, preparedAt: day(preparedOn), determinedAt: day(preparedOn) } : {}),
        },
      });
      // The trail in the shape the actions write it (UX 5; ruling on the demo trail), built
      // with their own helpers and dated as the demo tells it.
      const label = `${l.ex.reference} · ${l.ex.title}`;
      const asCreated = {
        ...l.ex, ...cols, requisitionRuleKey: ctx.approved?.ruleKey ?? null, requisitionRuleLabel: ctx.approved?.ruleLabel ?? null,
        methodReason: cols.proposedMethodCode === l.ex.sourcingMethodCode ? "" : l.ex.methodReason,
        status: "DRAFT", dossierReference: null, preparedAt: null, cancelReason: "", proposalState: l.ex.proposalState ? "DRAFT" : null,
        proposalSubmittedOn: null, proposalReviewedOn: null, proposalReviewerPersonId: null, proposalReviewComment: "", scopeParts: undefined, taxonomyValues: undefined,
      };
      const taxName = (t: string) => cfg.config.taxonomies.find((x) => x.code === t)?.nameEn ?? "A classification no longer configured";
      const valName = (t: string, v: string) => cfg.config.taxonomies.find((x) => x.code === t)?.values.find((x) => x.code === v)?.nameEn ?? "A value no longer configured";
      const trail: { entity: string; entityId: string; entityLabel: string; at: Date; action: "CREATE" | "UPDATE"; changes: object[]; reason?: string }[] = [
        { entity: "SourcingExercise", entityId: id, entityLabel: label, at: l.ex.createdAt, action: "CREATE", changes: auditCreate(asCreated, { requisition: l.req.reference }) },
        ...l.ex.scopeParts.map((p) => ({
          entity: "ExerciseScopePart", entityId: p.id, entityLabel: `${l.ex.reference} · scope: ${DELIVERABLE_LABEL[p.deliverableKind as keyof typeof DELIVERABLE_LABEL].toLowerCase()}`, at: l.ex.createdAt, action: "CREATE" as const,
          changes: diffFields(null, { deliverableKind: p.deliverableKind, amount: senToDecimalString(parseSen(p.amount.toString())), description: p.description }),
        })),
        ...ev.taxonomies.filter((x) => x.state === "DERIVED" && x.valueCode).map((t) => ({
          entity: "ExerciseTaxonomyValue", entityId: `${id}tv_${t.taxonomyCode}`, entityLabel: `${l.ex.reference} · ${taxName(t.taxonomyCode)}`, at: l.ex.createdAt, action: "CREATE" as const,
          changes: diffFields(null, { taxonomy: taxName(t.taxonomyCode), value: valName(t.taxonomyCode, t.valueCode!), pick: t.state }),
        })),
        ...l.ex.taxonomyValues.filter((t) => t.pick === "CHOSEN").map((t) => ({
          entity: "ExerciseTaxonomyValue", entityId: t.id, entityLabel: `${l.ex.reference} · ${taxName(t.taxonomyCode)}`, at: l.ex.createdAt, action: "CREATE" as const,
          changes: diffFields(null, { taxonomy: taxName(t.taxonomyCode), value: valName(t.taxonomyCode, t.valueCode), pick: "CHOSEN" }),
        })),
      ];
      if (l.ex.proposalState === "REVIEWED") {
        trail.push({ entity: "SourcingExercise", entityId: id, entityLabel: label, at: l.ex.proposalSubmittedOn!, action: "UPDATE", changes: diffFields({ proposalState: "DRAFT" }, { proposalState: "SUBMITTED", proposalSubmittedOn: l.ex.proposalSubmittedOn }) });
        trail.push({
          entity: "SourcingExercise", entityId: id, entityLabel: label, at: l.ex.proposalReviewedOn!, action: "UPDATE", reason: l.ex.proposalReviewComment,
          changes: diffFields({ proposalState: "SUBMITTED", proposalReviewComment: "" }, { proposalState: "REVIEWED", proposalReviewedOn: l.ex.proposalReviewedOn, proposalReviewComment: l.ex.proposalReviewComment, reviewedBy: l.ex.proposalReviewer?.name ?? null, recordedOnBehalf: "not signed" }),
        });
      }
      if (prepared) {
        // The move, as moveToPreparation audits it: the dossier numbered, the record written.
        const movedOn = day(preparedOn);
        trail.push({ entity: "SourcingExercise", entityId: id, entityLabel: label, at: movedOn, action: "UPDATE", changes: auditPair(asCreated, { ...asCreated, status: "DOCUMENTS_IN_PREPARATION", preparedAt: movedOn, dossierReference: l.ex.dossierReference, classificationRecorded: "yes" }) });
      }
      if (l.ex.status === "CANCELLED") trail.push({ entity: "SourcingExercise", entityId: id, entityLabel: label, at: day("2026-09-06"), action: "UPDATE", changes: diffFields({ status: "DRAFT" }, { status: "CANCELLED" }), reason: l.ex.cancelReason });
      await db.auditEntry.createMany({
        data: trail.map((e, i) => ({ id: `${id}_au${i + 1}`, organisationId: l.org.id, entity: e.entity, entityId: e.entityId, entityLabel: e.entityLabel, action: e.action, changes: e.changes as object, reason: e.reason ?? "", at: e.at, ...DEMO_ACTOR })),
      });
      for (const t of ev.taxonomies.filter((x) => x.state === "DERIVED" && x.valueCode)) {
        await db.exerciseTaxonomyValue.create({ data: { id: `${id}tv_${t.taxonomyCode}`, exerciseId: id, taxonomyCode: t.taxonomyCode, valueCode: t.valueCode!, pick: "DERIVED" } });
      }
    }
  }
}

/// Freeze the register of a demo sitting loaded as already minuted, with the same
/// functions the minuting action uses.
async function snapshotMinuted(ids: string[]) {
  const { loadSitting } = await import("../src/lib/committee/sittings");
  const { snapshotRegister } = await import("../src/lib/committee/assess-sitting");
  const lib = await import("../src/lib/db");
  try {
    for (const id of ids) {
      const s = await loadSitting(await demoScope(), id);
      if (!s) throw new Error(`Demo sitting ${id} did not load.`);
      const people = [
        ...s.register.voting.map((v) => v.personId),
        ...s.register.alternates.map((v) => v.personId),
        ...s.register.nonVotingMemberIds,
        ...s.meeting.attendance.map((a) => a.personId),
      ].filter((p): p is string => p != null);
      const snap = snapshotRegister(s.register, s.rules, s.committeeName, Object.fromEntries(people.map((p) => [p, s.names[p] ?? ""])));
      await db.meeting.update({ where: { id }, data: { registerSnapshot: snap as object } });
    }
  } finally {
    await lib.db.$disconnect();
  }
}

/**
 * Ruling 4 (2026-10-06): the Results fixture alone, added to a database the demo is already loaded in, without a wipe.
 * Nothing where it is already issued; refused, touching nothing, where it stands part-made (since Phase 1d nothing removes that: use a new database).
 */
async function results() {
  const org = await organisation();
  if (!(await demoIsLoaded(db))) {
    console.log("The demo is not loaded. Run npm run demo:load, which includes this step.");
    return;
  }
  const state = await resultsDemoState(db);
  if (state === "PARTIAL") throw new Error("The Results fixture stands part-made (its requisition or exercise exists without an issued award). Nothing was written. This loader does not finish a part-made fixture, and nothing removes it (the trail is permanent, Phase 1d); use a new database.");
  if (state === "ABSENT") {
    const made = await loadResultsDemo(db, org.id, { determine: determineExercises });
    console.log(`Results fixture added: ${made.reference}, its award issued.`);
  } else console.log("The Results fixture is already loaded: nothing was written.");
  await checkResultsDemo(db);
}

/**
 * Phase 2b: the demo's own rows that have no attribution yet, attributed to the demo loader (prisma/demo-attribution.ts), in a database the demo was loaded in
 * before attribution existed. Adds and changes nothing else; a second run writes nothing.
 */
async function attribute() {
  const org = await organisation();
  if (!(await demoIsLoaded(db))) {
    console.log("The demo is not loaded: nothing to attribute.");
    return;
  }
  const written = await attributeSeededRows(db, org.id);
  console.log(written > 0 ? `${written} demo rows attributed to the demo loader.` : "Every demo row already has its attribution: nothing was written.");
}

/**
 * Phase 3c: the reporting lines and the memo rule, added to a database the demo is already loaded in. Nothing where they stand.
 */
async function inbox() {
  const org = await organisation();
  if (!(await demoIsLoaded(db))) {
    console.log("The demo is not loaded. Run npm run demo:load, which includes this step.");
    return;
  }
  // Ruling 12c: the reporting lines and the notification rule are configuration. An add-on step on a loaded database writes none; it says what is missing.
  const missing = await inboxDemoMissing(db, org.id);
  if (missing.lines === 0 && !missing.rule) console.log("The reporting lines and the not-approved memo rule are already there: nothing was written.");
  else {
    console.log(
      `Nothing was written: this step would add configuration, which the demonstration writes only when it is first loaded (ruling G2). ${[
        missing.lines > 0 ? `${missing.lines} reporting line(s) of the demonstration's people are not set: add them under Configuration, Users` : null,
        missing.rule ? "the notification rule for a matter not carried is not set: add it under Configuration, Notifications" : null,
      ]
        .filter(Boolean)
        .join("; ")}.`,
    );
  }
}

/**
 * Phase 4c: the supplier's Company workspace demonstration (prisma/demo-company.ts), added to a database the demo is already loaded in. Nothing where it stands; its rows are attributed to the demo loader.
 */
async function company() {
  const org = await organisation();
  if (!(await demoIsLoaded(db))) {
    console.log("The demo is not loaded. Run npm run demo:load, which includes this step.");
    return;
  }
  const made = await loadCompanyDemo(db, org.id);
  await attributeSeededRows(db, org.id);
  console.log(made.notes.length ? `Added: ${made.notes.join("; ")}.` : "The Company demonstration is already there: nothing was written.");
}

/**
 * Phase 4d: the supplier's My Bids demonstration (prisma/demo-my-bids.ts), added to a database the demo is already loaded in. Nothing where it stands; it sets no policy.
 */
async function myBids() {
  const org = await organisation();
  if (!(await demoIsLoaded(db))) {
    console.log("The demo is not loaded. Run npm run demo:load, which includes this step.");
    return;
  }
  const made = await loadMyBidsDemo(db, org.id);
  await attributeSeededRows(db, org.id);
  console.log(made.notes.length ? `Added: ${made.notes.join("; ")}.` : "The My Bids demonstration is already there: nothing was written.");
}

/**
 * Phase 4e: the contractor's My Projects demonstration and the announcements board (prisma/demo-my-projects.ts), added to a database the demo is already loaded in. Nothing where it stands; it sets no policy.
 */
async function myProjects() {
  const org = await organisation();
  if (!(await demoIsLoaded(db))) {
    console.log("The demo is not loaded. Run npm run demo:load, which includes this step.");
    return;
  }
  const made = await loadMyProjectsDemo(db, org.id);
  await attributeSeededRows(db, org.id);
  console.log(made.notes.length ? `Added: ${made.notes.join("; ")}.` : "The My Projects demonstration is already there: nothing was written.");
}

/**
 * ADR 0042: the Project workspace demonstration (prisma/demo-project-documents.ts), added to a database the demo is already loaded in. Nothing where it stands; it sets no policy.
 */
async function projectDocuments() {
  const org = await organisation();
  if (!(await demoIsLoaded(db))) {
    console.log("The demo is not loaded. Run npm run demo:load, which includes this step.");
    return;
  }
  const made = await loadProjectDocumentsDemo(db, org.id);
  await attributeSeededRows(db, org.id);
  console.log(made.notes.length ? `Added: ${made.notes.join("; ")}.` : "The Project workspace demonstration is already there: nothing was written.");
}

/**
 * Decisions log, 2026-10-09, ruling on 1897 R2: demo_con13's contractor on the register with checked bank details, linked to its award (prisma/demo-contractor.ts), for a database loaded before it existed.
 * Nothing where it stands; nothing is deleted.
 */
async function contractor() {
  const org = await organisation();
  if (!(await demoIsLoaded(db))) {
    console.log("The demo is not loaded. Run npm run demo:load, which includes this step.");
    return;
  }
  const made = await linkDemoContractor(db, org.id);
  await attributeSeededRows(db, org.id);
  console.log(made.notes.length ? `Added: ${made.notes.join("; ")}.` : "The contractor is already linked: nothing was written.");
}

const mode = process.argv[2];

if (mode === "wipe") {
  console.error(DEMO_WIPE_RETIRED);
  process.exit(1);
}
// Ruling 12c (2026-10-12): the scope switches, upload rules and template file are configuration, written only inside the load on a fresh database. This mode touches nothing.
if (mode === "switches") {
  console.error(DEMO_SWITCHES_RETIRED);
  process.exit(1);
}
if (mode !== "load" && mode !== "results" && mode !== "attribute" && mode !== "inbox" && mode !== "company" && mode !== "my-bids" && mode !== "my-projects" && mode !== "project-documents" && mode !== "contractor") {
  console.error("usage: tsx prisma/demo.ts <load|results|attribute|inbox|company|my-bids|my-projects|project-documents|contractor>");
  process.exit(2);
}

(mode === "load" ? load() : mode === "attribute" ? attribute() : mode === "inbox" ? inbox() : mode === "company" ? company() : mode === "my-bids" ? myBids() : mode === "my-projects" ? myProjects() : mode === "project-documents" ? projectDocuments() : mode === "contractor" ? contractor() : results())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
