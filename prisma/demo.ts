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
  await db.committeeDecision.deleteMany({ where: demo });
  await db.meetingAttendance.deleteMany({ where: demo });
  await db.meeting.deleteMany({ where: demo });
  await db.committeeMember.deleteMany({ where: demo });
  await db.committee.deleteMany({ where: demo });

  await db.authorityRuleStep.deleteMany({ where: demo });
  await db.authorityRule.deleteMany({ where: demo });
  await db.authorityMatrix.deleteMany({ where: demo });

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

  await db.roleAssignment.deleteMany({ where: demo });
  await db.authorityRole.deleteMany({ where: demo });
  await db.person.deleteMany({ where: demo });

  await db.auditEntry.deleteMany({ where: { organisationId: org.id, entityId: { startsWith: P } } });

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

  // ---------------------------------------------------------------- structure
  await db.costCentre.createMany({
    data: [
      { id: `${P}cc1`, organisationId, code: "CC-100", nameEn: "Head office overhead", provenance: "STATED", sortOrder: 1, effectiveFrom: from },
      { id: `${P}cc2`, organisationId, code: "CC-200", nameEn: "Northern operations", provenance: "STATED", sortOrder: 2, effectiveFrom: from },
      { id: `${P}cc3`, organisationId, code: "CC-300", nameEn: "Capital works", provenance: "OBSERVED", sortOrder: 3, effectiveFrom: from },
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
      { id: `${P}u1`, organisationId, code: "GRP", nameEn: "Demo Utilities Berhad", kind: "COMPANY", provenance: "STATED", sortOrder: 1, effectiveFrom: from },
      { id: `${P}u2`, organisationId, code: "OPS", nameEn: "Operations Division", kind: "DIVISION", parentCode: "GRP", provenance: "STATED", sortOrder: 2, effectiveFrom: from },
      { id: `${P}u3`, organisationId, code: "CP", nameEn: "Contract & Procurement", kind: "DEPARTMENT", parentCode: "OPS", costCentreCode: "CC-100", provenance: "STATED", sortOrder: 3, effectiveFrom: from },
      { id: `${P}u4`, organisationId, code: "CP-PRE", nameEn: "Pre-contract Section", kind: "SECTION", parentCode: "CP", costCentreCode: "CC-100", provenance: "OBSERVED", sortOrder: 4, effectiveFrom: from },
      { id: `${P}u5`, organisationId, code: "NTH", nameEn: "Northern Region", kind: "DEPARTMENT", parentCode: "OPS", costCentreCode: "CC-200", provenance: "STATED", sortOrder: 5, effectiveFrom: from },
    ],
  });

  await db.site.createMany({
    data: [
      { id: `${P}s1`, organisationId, code: "HQ", nameEn: "Head Office", address: "1 Demo Avenue", orgUnitCode: "GRP", provenance: "STATED", sortOrder: 1, effectiveFrom: from },
      { id: `${P}s2`, organisationId, code: "NTH-WKS", nameEn: "Northern Works Depot", address: "12 Depot Road", orgUnitCode: "NTH", provenance: "OBSERVED", sortOrder: 2, effectiveFrom: from },
    ],
  });

  await db.codeFormat.createMany({
    data: [
      { id: `${P}f1`, organisationId, key: "cost_centre", pattern: "CC-\\d{3}", example: "CC-100", description: "CC, a hyphen, three digits.", provenance: "STATED" },
      { id: `${P}f2`, organisationId, key: "account_code", pattern: "\\d{7}", example: "6100100", description: "Seven digits.", provenance: "STATED" },
    ],
  });

  // ------------------------------------------------------------------- people
  await db.person.createMany({
    data: [
      { id: `${P}p1`, organisationId, staffNo: "D001", name: "Aisyah Rahman", email: "aisyah.rahman@demo.invalid", jobTitle: "Chief Executive" },
      { id: `${P}p2`, organisationId, staffNo: "D002", name: "Bala Krishnan", email: "bala.krishnan@demo.invalid", jobTitle: "Finance Director" },
      { id: `${P}p3`, organisationId, staffNo: "D003", name: "Chen Wei Ling", email: "chen.weiling@demo.invalid", jobTitle: "Head of Contract & Procurement" },
      { id: `${P}p4`, organisationId, staffNo: "D004", name: "Daniel Anak Jelani", email: "daniel.jelani@demo.invalid", jobTitle: "Procurement Executive" },
      { id: `${P}p5`, organisationId, staffNo: "D005", name: "Eng Siew Mei", email: "siewmei.eng@demo.invalid", jobTitle: "Section Head, Pre-contract" },
      { id: `${P}p6`, organisationId, staffNo: "D006", name: "Faridah Osman", email: "faridah.osman@demo.invalid", jobTitle: "Regional Manager, North", isActive: false },
    ],
  });

  await db.authorityRole.createMany({
    data: [
      { id: `${P}r1`, organisationId, code: "CEO", nameEn: "Chief Executive", nameMs: "Ketua Pegawai Eksekutif", escalatesToCode: "BOARD", sortOrder: 1 },
      { id: `${P}r2`, organisationId, code: "FD", nameEn: "Finance Director", nameMs: "Pengarah Kewangan", escalatesToCode: "CEO", selfApprovalEscalatesToCode: "CEO", sortOrder: 2 },
      { id: `${P}r3`, organisationId, code: "HOD_CP", nameEn: "Head of Contract & Procurement", nameMs: "Ketua Kontrak & Perolehan", escalatesToCode: "FD", selfApprovalEscalatesToCode: "FD", sortOrder: 3 },
      { id: `${P}r4`, organisationId, code: "SEC_PRE", nameEn: "Section Head, Pre-contract", nameMs: "Ketua Seksyen Pra-kontrak", escalatesToCode: "HOD_CP", sortOrder: 4 },
      { id: `${P}r5`, organisationId, code: "BOARD", nameEn: "Board of Directors", nameMs: "Lembaga Pengarah", isCommittee: true, sortOrder: 5 },
      { id: `${P}r6`, organisationId, code: "TENDER_BOARD", nameEn: "Tender Board", nameMs: "Lembaga Tender", isCommittee: true, sortOrder: 6 },
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

  // -------------------------------------------------------------- committees
  await db.committee.createMany({
    data: [
      {
        id: `${P}c1`, organisationId, code: "TENDER_BOARD", nameEn: "Tender Board", nameMs: "Lembaga Tender",
        mandate: "Approves awards above the tender floor.", governingSource: "Demo constitution cl. 4",
        action: "APPROVES", quorum: 3, quorumProvenance: "STATED", compositionProvenance: "STATED",
        valueScopeMin: "300000", notes: "",
      },
      {
        id: `${P}c2`, organisationId, code: "QUOTE_CTTE", nameEn: "Quotation Committee", nameMs: "Jawatankuasa Sebut Harga",
        mandate: "Recommends awards in the quotation band.", governingSource: "Demo constitution cl. 5",
        action: "RECOMMENDS", compositionProvenance: "OBSERVED",
        valueScopeMin: "15000", valueScopeMax: "300000", notes: "",
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
    ],
  });

  // ------------------------------------------------------------ the authority
  await db.authorityMatrix.create({
    data: {
      id: `${P}mx1`, organisationId, label: "Demo limits, revision 1", effectiveFrom: from,
      boundaryValue: "300000", boundaryInclusive: true,
      quotationFloor: "15000", tenderFloor: "300000", requisitionBoundary: "50000",
      splittingWindowDays: 30, currency: "MYR",
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

  console.log("Demo data loaded. This is invented data for comparing screens — never ship it.");
  console.log("Remove it with: npm run demo:wipe");
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
