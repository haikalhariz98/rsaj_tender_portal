import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

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
 *   npm run demo:load    populate
 *   npm run demo:wipe    remove every row this created, leaving the organisation
 *
 * Every row is created with an id prefixed `demo_`, which is how the wipe finds them.
 * Nothing else in the product uses that prefix.
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ORG_CODE = process.env.ORGANISATION_CODE ?? "ORG";
/// Invented, like everything here: the demo's sittings need a zone to start, table and
/// vote (an unset zone blocks them). Set only where the organisation has none, and
/// cleared by the wipe only if it is still this value.
const DEMO_TIME_ZONE = "Asia/Kuala_Lumpur";
const P = "demo_";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function organisation() {
  const org = await db.organisation.findUnique({ where: { code: ORG_CODE } });
  if (!org) throw new Error(`No organisation "${ORG_CODE}". Run npm run setup first.`);
  return org;
}

/**
 * Remove everything the demo created.
 *
 * Ordered so a child never outlives its parent. Cascades would cover most of this,
 * but relying on them would also delete rows that were not part of the demo if a real
 * record had been attached to a demo parent.
 */
async function wipe() {
  const org = await organisation();
  const demo = { id: { startsWith: P } };

  await db.vote.deleteMany({ where: demo });
  await db.decisionRecusal.deleteMany({ where: demo });
  // A matter may depend on another: clear the links before removing either.
  await db.committeeDecision.updateMany({ where: demo, data: { dependsOnDecisionId: null } });
  await db.committeeDecision.deleteMany({ where: demo });
  await db.notApprovedOutcome.deleteMany({ where: demo });
  await db.meetingAttendance.deleteMany({ where: demo });
  await db.meeting.deleteMany({ where: demo });
  await db.committeeMember.updateMany({ where: demo, data: { alternateForId: null } });
  await db.committeeMember.deleteMany({ where: demo });
  await db.committee.deleteMany({ where: demo });

  await db.authorityRuleStep.deleteMany({ where: demo });
  await db.authorityRule.deleteMany({ where: demo });
  await db.authorityMatrix.deleteMany({ where: demo });

  await db.financeVariance.deleteMany({ where: demo });
  await db.financeSyncRun.deleteMany({ where: demo });
  await db.financeIntegration.deleteMany({ where: demo });
  await db.budgetPeriod.deleteMany({ where: demo });
  await db.budgetYear.deleteMany({ where: demo });
  await db.budgetMovement.deleteMany({ where: demo });
  await db.budgetCode.deleteMany({ where: demo });
  await db.budgetSettings.deleteMany({ where: demo });
  await db.budgetCommitment.deleteMany({ where: demo });
  await db.budgetAllocation.deleteMany({ where: demo });

  await db.notificationRule.deleteMany({ where: demo });
  await db.documentTemplate.deleteMany({ where: demo });
  await db.documentClass.deleteMany({ where: demo });
  await db.numberingSeries.deleteMany({ where: demo });

  await db.fundingRoute.deleteMany({ where: demo });
  await db.sourcingMethod.deleteMany({ where: demo });
  await db.contractType.deleteMany({ where: demo });

  await db.codeFormat.deleteMany({ where: demo });
  await db.site.deleteMany({ where: demo });
  await db.accountCode.deleteMany({ where: demo });
  await db.costCentre.deleteMany({ where: demo });
  await db.orgUnit.deleteMany({ where: demo });

  await db.delegation.deleteMany({ where: demo });
  await db.roleCapability.deleteMany({ where: demo });
  await db.capability.deleteMany({ where: demo });

  await db.roleAssignment.deleteMany({ where: demo });
  await db.authorityRole.deleteMany({ where: demo });
  await db.person.deleteMany({ where: demo });

  await db.auditEntry.deleteMany({ where: { organisationId: org.id, entityId: { startsWith: P } } });
  if (org.timeZone === DEMO_TIME_ZONE) await db.organisation.update({ where: { id: org.id }, data: { timeZone: null } });

  console.log("Demo data removed. The organisation and any real configuration are untouched.");
}

async function load() {
  const org = await organisation();
  const organisationId = org.id;

  // Refuse to stack one demo run on another.
  const already = await db.orgUnit.count({ where: { id: { startsWith: P } } });
  if (already > 0) {
    console.log("Demo data is already loaded. Run npm run demo:wipe first.");
    return;
  }

  const from = day("2024-01-01");
  if (!org.timeZone) await db.organisation.update({ where: { id: org.id }, data: { timeZone: DEMO_TIME_ZONE } });

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
      { id: `${P}nao1`, organisationId, code: "reclarify", nameEn: "Return for re-clarification", nameMs: "Kembali untuk penjelasan semula", kind: "LOOP", returnsToStage: "evaluation", governingSource: "Demo policy 7.2(a)", provenance: "ASSUMED", sortOrder: 1 },
      { id: `${P}nao2`, organisationId, code: "renegotiate", nameEn: "Return for re-negotiation", nameMs: "Kembali untuk rundingan semula", kind: "LOOP", returnsToStage: "negotiation", governingSource: "Demo policy 7.2(b)", provenance: "ASSUMED", sortOrder: 2 },
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
      { id: `${P}d1`, meetingId: `${P}mt1`, sequence: 1, domain: "appointment", subject: "Award of the head office cleaning contract", matterKind: "EXERCISE", matterRef: "DEMO/T/2026/014", amount: "412000", act: "A", authorityRuleKey: "demo.purchase.high", ...tabled, tabledAt: day("2026-09-22") },
      {
        id: `${P}d2`, meetingId: `${P}mt2`, sequence: 1, domain: "appointment", subject: "Award of the fleet maintenance contract", matterKind: "EXERCISE", matterRef: "DEMO/T/2026/009", amount: "655000", act: "A", ...tabled, tabledAt: day("2026-08-13"),
        outcome: "CARRIED", decisionDate: day("2026-08-20"), quorumRequired: 3, presentVoters: 3, recusedCount: 0, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
      },
      {
        id: `${P}d3`, meetingId: `${P}mt2`, sequence: 2, domain: "appointment", subject: "Award of the IT support contract", matterKind: "EXERCISE", matterRef: "DEMO/T/2026/010", amount: "380000", act: "A", ...tabled, tabledAt: day("2026-08-13"),
        // Judged on two: the Finance Director, present, recused.
        outcome: "DEFERRED", decisionDate: day("2026-08-20"), quorumRequired: 3, presentVoters: 2, recusedCount: 1,
        outcomeNote: "The Finance Director's recusal left the Board inquorate on this matter. To be re-tabled at the next sitting.",
      },
      {
        id: `${P}d4`, meetingId: `${P}mt2`, sequence: 3, domain: "appointment", subject: "Award of the civil works package", matterKind: "EXERCISE", matterRef: "DEMO/T/2026/011", amount: "1250000", act: "A", ...tabled, tabledAt: day("2026-08-13"),
        outcome: "NOT_CARRIED", decisionDate: day("2026-08-20"), quorumRequired: 3, presentVoters: 3, recusedCount: 0, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
        notApprovedOutcomeId: `${P}nao2`, notApprovedOutcomeNameEn: "Return for re-negotiation", notApprovedOutcomeKind: "LOOP", outcomeNote: "The tendered rates exceed the estimate by a margin the Board would not accept without negotiation.",
      },
      // The Director of Operations has an alternate and recuses: whether the alternate may
      // vote in his place is unset on the demo Tender Board, so the matter shows the gap.
      { id: `${P}d6`, meetingId: `${P}mt1`, sequence: 2, domain: "appointment", subject: "Renewal of the security services contract", matterKind: "CONTRACT", matterRef: "DEMO/KP/T/2024/003", amount: "520000", act: "A", ...tabled, tabledAt: day("2026-09-22") },
      { id: `${P}d5`, meetingId: `${P}mt3`, sequence: 1, domain: "appointment", subject: "Quotation for stationery supply", matterKind: "EXERCISE", matterRef: "DEMO/SH/2026/031", amount: "42000", act: "MR", authorityRuleKey: "demo.purchase.mid", ...tabled, tabledAt: day("2026-09-28") },
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
      id: `${P}mx1`, organisationId, label: "Demo limits, revision 1", effectiveFrom: from,
      boundaryValue: "300000", boundaryInclusive: true,
      quotationFloor: "15000", tenderFloor: "300000", requisitionBoundary: "50000",
      splittingWindowDays: 30, currency: "MYR", issuedAt: from,
      noRuleClause: "Demo policy 1.6", selfApprovalClause: "Demo policy 1.7", absenceClause: "Demo policy 1.8",
    },
  });

  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule1`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.purchase.low", domain: "purchase", maxValue: "15000", labelEn: "Purchase, below the quotation floor", approverCode: "SEC_PRE", clause: "DEMO 1.1", sortOrder: 1 },
      { id: `${P}rule2`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.purchase.mid", domain: "purchase", minValue: "15000", maxValue: "300000", labelEn: "Purchase, quotation band", approverCode: "FD", committeeCode: "QUOTE_CTTE", committeeAct: "MR", clause: "DEMO 1.2", sortOrder: 2 },
      { id: `${P}rule3`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.purchase.high", domain: "purchase", minValue: "300000", labelEn: "Purchase, tender band", approverCode: "TENDER_BOARD", committeeCode: "TENDER_BOARD", committeeAct: "A", nonDelegable: true, clause: "DEMO 1.3", sortOrder: 3 },
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
  await db.budgetAllocation.createMany({
    data: [
      { id: `${P}b1`, organisationId, costCentreCode: "CC-100", accountCodeCode: "6100100", periodLabel: "2026", amount: "500000.00", provenance: "STATED", sortOrder: 1, effectiveFrom: day("2026-01-01") },
      { id: `${P}b2`, organisationId, costCentreCode: "CC-200", accountCodeCode: "6200200", periodLabel: "2026", amount: "1250000.00", provenance: "STATED", sortOrder: 2, effectiveFrom: day("2026-01-01") },
      { id: `${P}b3`, organisationId, costCentreCode: "CC-300", accountCodeCode: "7300300", periodLabel: "2026", amount: "80000.00", provenance: "ASSUMED", sortOrder: 3, effectiveFrom: day("2026-01-01") },
    ],
  });

  // A finance integration that is configured but has nothing behind it, and three
  // codes the two sides disagree about. Invented figures.
  await db.financeIntegration.create({
    data: {
      id: `${P}fi1`,
      organisationId,
      direction: "two_way",
      schedule: "nightly",
      varianceTolerance: "500.00",
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
      overCommitmentTolerancePercent: 5,
      commitOnApproval: true,
      overrideRoleCodes: ["FD", "CEO"],
      advanceRecoupmentRatePercent: 25,
      minimumInterimCertificate: "1000.00",
      paymentTargetDays: 30,
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

  await db.budgetCommitment.createMany({
    data: [
      { id: `${P}bc1`, allocationId: `${P}b1`, reference: "DEMO/REQ/0001", description: "Office consumables, first quarter", amount: "120000.00", committedOn: day("2026-02-01") },
      { id: `${P}bc2`, allocationId: `${P}b2`, reference: "DEMO/REQ/0002", description: "Pipeline maintenance", amount: "400000.00", committedOn: day("2026-03-01") },
      // Deliberately over-commits CC-300, so the negative balance path renders.
      { id: `${P}bc3`, allocationId: `${P}b3`, reference: "DEMO/REQ/0003", description: "Pump replacement", amount: "95000.00", committedOn: day("2026-03-15") },
      { id: `${P}bc4`, allocationId: `${P}b1`, reference: "DEMO/REQ/0004", description: "Cancelled order", amount: "50000.00", committedOn: day("2026-02-10"), releasedOn: day("2026-04-01"), releaseNote: "Requirement withdrawn" },
    ],
  });

  // -------------------------------------------------------------- the vocabulary
  await db.fundingRoute.createMany({
    data: [
      { id: `${P}fr1`, organisationId, code: "opex", nameEn: "Operating budget", trigger: "Approved requisition", governingSource: "Demo policy 3.1", provenance: "STATED", sortOrder: 1 },
      { id: `${P}fr2`, organisationId, code: "capex", nameEn: "Capital budget", trigger: "Capital allocation", governingSource: "Demo policy 3.2", provenance: "STATED", sortOrder: 2 },
      { id: `${P}fr3`, organisationId, code: "funder_led", nameEn: "Funder sets the route", routeDecidedExternally: true, supersedesAuthority: true, trigger: "Funder's execution letter", provenance: "OBSERVED", sortOrder: 3 },
      { id: `${P}fr4`, organisationId, code: "supervision", nameEn: "Supervision only", organisationProcures: false, supersedesAuthority: true, trigger: "Application by letter", provenance: "OBSERVED", sortOrder: 4 },
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
      { id: `${P}dc1`, organisationId, code: "contract", nameEn: "Contract documents", retentionMonths: 84, controlledCopy: true, releaseNeedsApproval: true, provenance: "STATED", sortOrder: 1 },
      { id: `${P}dc2`, organisationId, code: "certificate", nameEn: "Certificates", retentionMonths: 84, controlledCopy: true, provenance: "STATED", sortOrder: 2 },
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
  await snapshotMinuted([`${P}mt2`]);

  console.log("Demo data loaded. This is invented data for comparing screens — never ship it.");
  console.log("Remove it with: npm run demo:wipe");
}

/// Freeze the register of a demo sitting loaded as already minuted, with the same
/// functions the minuting action uses.
async function snapshotMinuted(ids: string[]) {
  const { loadSitting } = await import("../src/lib/committee/sittings");
  const { snapshotRegister } = await import("../src/lib/committee/assess-sitting");
  const lib = await import("../src/lib/db");
  try {
    for (const id of ids) {
      const s = await loadSitting(id);
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

const mode = process.argv[2];

if (mode !== "load" && mode !== "wipe") {
  console.error("usage: tsx prisma/demo.ts <load|wipe>");
  process.exit(2);
}

(mode === "load" ? load() : wipe())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
