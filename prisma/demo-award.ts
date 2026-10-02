/**
 * The award's demonstration data (6.11): invented, `demo_`-prefixed, never shipped.
 *
 * Award controls with invented settings; signatory rows on the demo limits; the
 * Quotation Committee given an invented quorum and voting rule (ASSUMED, 6.11 ruling)
 * so the indent awards rest on a real carried decision; five approved requisitions and
 * their exercises in preparation, determined by 6.3's own functions; and six awards in
 * the states worth seeing. The issued documents are frozen by the same functions the
 * issue uses, and every trail entry is written in the actions' shape. Identity card
 * numbers are visibly invented.
 */

import type { PrismaClient } from "../src/generated/prisma/client";

const P = "demo_";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const REQ = (n: number) => `DEMO/REQ/${String(n).padStart(4, "0")}/2026`;
const SX = (n: number) => `DEMO/SX/${String(n).padStart(4, "0")}/2026`;
const AWD = (n: number) => `DEMO/AWD/${String(n).padStart(4, "0")}/2026`;

type Db = PrismaClient;

// --------------------------------------------------------------- invented text

const LOA_MS = `{{organisation.name}}

Rujukan: {{award.reference}} · Kontrak: {{contract.number}}
Tarikh: {{award.issueDate}}

{{awardee.name}}
{{awardee.address}}

SURAT SETUJU TERIMA: {{exercise.title}}

Dengan sukacitanya dimaklumkan bahawa tawaran tuan bernilai {{award.value}} telah diterima oleh {{committee.name}} pada {{committee.decisionDate}}. Tempoh siap ialah {{award.completionPeriod}} mulai {{award.startDate}}.

Bon pelaksanaan: {{bond.basis}}, sah selama {{bond.validity}} selepas tarikh siap.

Sila kembalikan surat ini yang telah ditandatangani bersama Surat Akuan Pembida Berjaya dan Surat Pewakilan Kuasa.

{{signatory.name}}
{{signatory.office}}

(Teks demo rekaan: bukan dokumen sebenar mana-mana organisasi.)`;

const LOA_EN = `{{organisation.name}}

Reference: {{award.reference}} · Contract: {{contract.number}}
Date: {{award.issueDate}}

{{awardee.name}}
{{awardee.address}}

LETTER OF ACCEPTANCE: {{exercise.title}}

Your tender of {{award.value}} was accepted by the {{committee.name}} on {{committee.decisionDate}}. The completion period is {{award.completionPeriod}} from {{award.startDate}}.

Performance bond: {{bond.basis}}, valid for {{bond.validity}} after completion.

Please return this letter signed, with the successful bidder's declaration and a letter of authorisation.

{{signatory.name}}
{{signatory.office}}

(Invented demo text: not any organisation's real document.)`;

const DECLARATION_MS = `SURAT AKUAN PEMBIDA BERJAYA

Saya, bagi pihak {{awardee.name}} ({{awardee.registrationNo}}), mengaku bahawa syarikat tidak menawarkan atau memberi sebarang suapan untuk memperoleh kontrak {{contract.number}} bagi {{exercise.title}}.

(Teks demo rekaan.)`;

const MEMO_EN = `MEMO

Indent {{indent.number}}, received {{indent.receivedOn}}, valid to {{indent.expiresOn}}.

Award {{award.reference}} to {{awardee.name}} for {{award.value}}: {{exercise.title}}.

Recommended by the {{committee.name}} at {{committee.meetingReference}} on {{committee.meetingDate}} ({{committee.outcome}}). Received by the {{approver.office}} on {{approver.receivedOn}}; approved by {{approver.name}} on {{approver.decidedOn}}.

(Invented demo text.)`;

const APPOINTMENT_SHORT_MS = `PEMBERITAHUAN PERLANTIKAN

{{awardee.name}}
{{awardee.address}}

Tuan dilantik untuk {{exercise.title}} bernilai {{award.value}}, mulai {{award.startDate}} selama {{award.completionPeriod}}. Ganti rugi tertentu: {{terms.lad}}.

Kerja hendaklah dimulakan dalam tempoh yang ditetapkan; jika tidak, pelantikan boleh dibatalkan.

{{signatory.name}}, {{signatory.office}}

(Teks demo rekaan.)`;

const APPOINTMENT_EXTENDED_MS = `PEMBERITAHUAN PERLANTIKAN

{{awardee.name}}
{{awardee.address}}

Tuan dilantik untuk {{exercise.title}} bernilai {{award.value}}, mulai {{award.startDate}} selama {{award.completionPeriod}}. Ganti rugi tertentu: {{terms.lad}}.

Wang tahanan: {{terms.retention}}, terhad kepada {{terms.retentionCap}}. Tempoh tanggungan kecacatan: {{terms.dlp}}.

Kerja hendaklah dimulakan dalam tempoh yang ditetapkan; jika tidak, pelantikan boleh dibatalkan dan penyenaraian hitam dicadangkan.

{{signatory.name}}, {{signatory.office}}

(Teks demo rekaan.)`;

// ------------------------------------------------------------------- the load

/// Configuration, requisitions, exercises and sittings. The exercises are determined afterwards by 6.3's loader.
export async function loadAwardSetup(db: Db, organisationId: string, from: Date) {
  // A post-contract section, for the handover at issue.
  await db.orgUnit.create({ data: { id: `${P}u8`, organisationId, code: "CP-POST", nameEn: "Post-contract Section", kind: "SECTION", parentCode: "CP", costCentreCode: "CC-100", provenance: "OBSERVED", sortOrder: 8, effectiveFrom: from } });

  // Templates: the Letter of Acceptance gets an invented body; four more, invented too.
  await db.documentTemplate.update({ where: { id: `${P}dt1` }, data: { bodyMs: LOA_MS, bodyEn: LOA_EN, primaryLanguage: "MS", bodyVersion: 1 } });
  await db.documentTemplate.createMany({
    data: [
      { id: `${P}dt4`, organisationId, code: "loa_declaration", nameEn: "Successful bidder's declaration", nameMs: "Surat Akuan Pembida Berjaya", formCode: "DEMO-F-002", revisionDate: day("2025-06-01"), documentClassId: `${P}dc1`, bodyMs: DECLARATION_MS, bodyVersion: 1, provenance: "ASSUMED", sortOrder: 4 },
      { id: `${P}dt5`, organisationId, code: "indent_memo", nameEn: "Indent covering memo", formCode: "DEMO-F-031", documentClassId: `${P}dc3`, bodyEn: MEMO_EN, bodyVersion: 1, provenance: "ASSUMED", sortOrder: 5 },
      { id: `${P}dt6`, organisationId, code: "appointment_short", nameEn: "Appointment letter, short form", nameMs: "Pemberitahuan Perlantikan (ringkas)", formCode: "DEMO-F-041", documentClassId: `${P}dc1`, bodyMs: APPOINTMENT_SHORT_MS, bodyVersion: 1, provenance: "ASSUMED", sortOrder: 6 },
      { id: `${P}dt7`, organisationId, code: "appointment_extended", nameEn: "Appointment letter, extended", nameMs: "Pemberitahuan Perlantikan (lanjutan)", formCode: "DEMO-F-042", documentClassId: `${P}dc1`, bodyMs: APPOINTMENT_EXTENDED_MS, bodyVersion: 1, provenance: "ASSUMED", sortOrder: 7 },
    ],
  });

  await db.awardPolicy.create({
    data: {
      id: `${P}ap1`, organisationId, tenderInstrument: "LETTER_OF_ACCEPTANCE", quotationInstrument: "WORK_INDENT", indentValidityDays: 10, commencementGraceDays: 5, acceptanceReturnDays: 21,
      preContractUnitCode: "CP-PRE", postContractUnitCode: "CP-POST", quotationContractKey: "INDENT_NUMBER", regulatedActivityLabel: "Regulated utility works",
      loaTemplateId: `${P}dt1`, declarationTemplateId: `${P}dt4`, coveringMemoTemplateId: `${P}dt5`, provenance: "ASSUMED", notes: "Invented demo controls.",
    },
  });
  await db.numberingSeries.create({ data: { id: `${P}n7`, organisationId, key: "award", nameEn: "Awards", pattern: "DEMO/AWD/{SERIAL}/{YEAR}", padding: 4, resetOn: "CALENDAR_YEAR", nextSerial: 7, serialPeriod: "2026", provenance: "ASSUMED" } });
  for (const ct of ["ct1", "ct2", "ct3"]) await db.contractType.update({ where: { id: `${P}${ct}` }, data: { contractSeriesKey: "contract" } });
  await db.codeFormat.create({ data: { id: `${P}f5`, organisationId, key: "erp_indent_no", pattern: "XI\\d{9}", example: "XI202600812", description: "XI and nine digits.", provenance: "ASSUMED" } });

  // Who signs: invented edges on the demo limits. The lower edge sits on the boundary and follows the switch.
  const sig = { authorityMatrixId: `${P}mx1`, domain: "award_signatory" };
  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule10`, ...sig, ruleKey: "demo.signatory.loa.1", cond: "LETTER_OF_ACCEPTANCE", minValue: "300000", maxValue: "900000", followsBoundarySwitch: true, labelEn: "Letter of Acceptance, RM300,000 to RM900,000", approverCode: "DIV_HEAD", nonDelegable: true, clause: "DEMO 6.1(a)", sortOrder: 10 },
      { id: `${P}rule11`, ...sig, ruleKey: "demo.signatory.loa.2", cond: "LETTER_OF_ACCEPTANCE", minValue: "900000", maxValue: "2500000", labelEn: "Letter of Acceptance, RM900,000 to RM2.5 million", approverCode: "FD", nonDelegable: true, clause: "DEMO 6.1(b)", sortOrder: 11 },
      { id: `${P}rule12`, ...sig, ruleKey: "demo.signatory.loa.3", cond: "LETTER_OF_ACCEPTANCE", minValue: "2500000", labelEn: "Letter of Acceptance, above RM2.5 million", approverCode: "CEO", nonDelegable: true, clause: "DEMO 6.1(c)", sortOrder: 12 },
      { id: `${P}rule13`, ...sig, ruleKey: "demo.signatory.indent", cond: "WORK_INDENT", minValue: "15000", maxValue: "300000", followsBoundarySwitch: true, labelEn: "Appointment letter, quotation band", approverCode: "DEPT_HEAD", clause: "DEMO 6.2", sortOrder: 13 },
    ],
  });
  await db.authorityRuleStep.createMany({
    data: [
      { id: `${P}st30`, authorityRuleId: `${P}rule10`, roleCode: "HOD_CP", act: "R", sequence: 1 },
      { id: `${P}st31`, authorityRuleId: `${P}rule11`, roleCode: "HOD_CP", act: "R", sequence: 1 },
      { id: `${P}st32`, authorityRuleId: `${P}rule12`, roleCode: "HOD_CP", act: "R", sequence: 1 },
    ],
  });

  await db.distributionRecipient.createMany({
    data: [
      { id: `${P}dr1`, organisationId, instrumentKind: "LETTER_OF_ACCEPTANCE", code: "loa_implementing", nameEn: "Implementing department", provenance: "ASSUMED", sortOrder: 1 },
      { id: `${P}dr2`, organisationId, instrumentKind: "LETTER_OF_ACCEPTANCE", code: "loa_finance", nameEn: "Finance department", provenance: "ASSUMED", sortOrder: 2 },
      { id: `${P}dr3`, organisationId, instrumentKind: "LETTER_OF_ACCEPTANCE", code: "loa_construction_board", nameEn: "Construction industry board", provenance: "ASSUMED", sortOrder: 3 },
      { id: `${P}dr4`, organisationId, instrumentKind: "LETTER_OF_ACCEPTANCE", code: "loa_tax", nameEn: "Tax office", provenance: "ASSUMED", sortOrder: 4 },
      { id: `${P}dr5`, organisationId, instrumentKind: "LETTER_OF_ACCEPTANCE", code: "loa_regulator", nameEn: "Utility regulator", onlyWhenRegulated: true, provenance: "ASSUMED", sortOrder: 5 },
      { id: `${P}dr6`, organisationId, instrumentKind: "WORK_INDENT", code: "indent_implementing", nameEn: "Implementing department", provenance: "ASSUMED", sortOrder: 1 },
      { id: `${P}dr7`, organisationId, instrumentKind: "WORK_INDENT", code: "indent_finance", nameEn: "Finance department", provenance: "ASSUMED", sortOrder: 2 },
    ],
  });
  await db.appointmentLetterVariant.createMany({
    data: [
      { id: `${P}alv1`, organisationId, code: "short_form", nameEn: "Short-form appointment letter", templateId: `${P}dt6`, termsBandKey: "demo.terms.short", nonCommencement: "CANCEL_AND_BLACKLIST", provenance: "ASSUMED", sortOrder: 1 },
      { id: `${P}alv2`, organisationId, code: "extended", nameEn: "Extended appointment letter", templateId: `${P}dt7`, termsBandKey: "demo.terms.extended", nonCommencement: "CANCEL_AND_BLACKLIST", provenance: "ASSUMED", sortOrder: 2 },
    ],
  });
  await db.conditionPrecedentKind.createMany({
    data: [
      { id: `${P}cpk1`, organisationId, code: "safe_method", nameEn: "Safe method statement approved", excludesEotReason: true, provenance: "ASSUMED", sortOrder: 1 },
      { id: `${P}cpk2`, organisationId, code: "regulator_permit", nameEn: "Regulator's works permit", provenance: "ASSUMED", sortOrder: 2 },
    ],
  });
  await db.insuranceRequirement.createMany({
    data: [
      { id: `${P}ir1`, organisationId, code: "works", nameEn: "Works insurance", kind: "WORKS", contractTypeCode: "works", tailMonths: 3, tailDays: 14, provenance: "ASSUMED", sortOrder: 1 },
      { id: `${P}ir2`, organisationId, code: "public_liability", nameEn: "Public liability", kind: "PUBLIC_LIABILITY", tailMonths: 3, tailDays: 14, provenance: "ASSUMED", sortOrder: 2 },
      { id: `${P}ir3`, organisationId, code: "workmen", nameEn: "Workmen's compensation", kind: "WORKMENS_COMPENSATION", percent: "10", tailMonths: 3, tailDays: 14, provenance: "ASSUMED", sortOrder: 3 },
    ],
  });
  // Invented and contiguous: no gap, unlike the printed table the tests transcribe.
  await db.liabilityBand.createMany({
    data: [
      { id: `${P}lb1`, organisationId, code: "lb1", maxValue: "50000", limitAmount: "20000", provenance: "ASSUMED", sortOrder: 1 },
      { id: `${P}lb2`, organisationId, code: "lb2", minValue: "50000", maxValue: "500000", limitAmount: "80000", provenance: "ASSUMED", sortOrder: 2 },
      { id: `${P}lb3`, organisationId, code: "lb3", minValue: "500000", maxValue: "2000000", limitAmount: "150000", provenance: "ASSUMED", sortOrder: 3 },
      { id: `${P}lb4`, organisationId, code: "lb4", minValue: "2000000", limitAmount: "250000", provenance: "ASSUMED", sortOrder: 4 },
    ],
  });
  await db.approvedIssuer.createMany({
    data: [
      { id: `${P}iss1`, organisationId, code: "demo_bank", name: "Demo Bank Berhad", kind: "BANK", listSource: "Demo regulator's approved list", listAsAt: day("2026-01-01"), provenance: "ASSUMED", sortOrder: 1 },
      { id: `${P}iss2`, organisationId, code: "contoh_bank", name: "Contoh Bank Berhad", kind: "BANK", listSource: "Demo regulator's approved list", listAsAt: day("2026-01-01"), provenance: "ASSUMED", sortOrder: 2 },
      { id: `${P}iss3`, organisationId, code: "sampel_insurance", name: "Sampel Insurance Berhad", kind: "INSURER", listSource: "Demo regulator's approved list", listAsAt: day("2026-01-01"), provenance: "ASSUMED", sortOrder: 3 },
    ],
  });
  await db.notificationRule.createMany({
    data: [
      { id: `${P}nr4`, organisationId, eventKey: "security.expiring", nameEn: "Security or policy expiring", recipientRoleCodes: ["HOD_CP"], reminderOffsetDays: [60, 30, 7], provenance: "ASSUMED", sortOrder: 4 },
      { id: `${P}nr5`, organisationId, eventKey: "award.indent.expired", nameEn: "Indent expired", recipientRoleCodes: ["HOD_CP", "DEPT_HEAD"], reminderOffsetDays: [], provenance: "ASSUMED", sortOrder: 5 },
    ],
  });

  // 6.11 ruling: the Quotation Committee's quorum (within its two voting seats) and voting
  // rule are invented here, ASSUMED, so the indent awards rest on a real carried decision.
  // 6.10's unset-rule example on this committee is retired on purpose.
  await db.committee.update({ where: { id: `${P}c2` }, data: { quorum: 2, quorumProvenance: "ASSUMED", votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED", notes: "Quorum and voting rule invented for the demo (ASSUMED)." } });

  // ---------------------------------------------------- five approved requisitions
  await db.budgetCode.create({ data: { id: `${P}bcode9`, organisationId, code: "CAP26-050", descriptionEn: "Northern network renewal", type: "Capital", owningUnitCode: "NTH", accountCode: "7400400", holderPersonId: `${P}p9`, effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") } });
  await db.budgetMovement.create({ data: { id: `${P}bm30`, budgetCodeId: `${P}bcode9`, kind: "ORIGINAL", amount: "8000000.00", occurredOn: day("2026-01-01"), reference: "BR26-050" } });
  let balance = 800_000_000n;
  for (const r of REQS) {
    const approvedOn = r.steps[r.steps.length - 1];
    await db.requisition.create({
      data: {
        id: `${P}rq${r.id}`, organisationId, reference: REQ(r.n), origin: "PORTAL", erpRequisitionNo: `XR20260001${r.n + 44}`, erpNoteNo: `RN/2026/01${r.n + 44}`, erpRefSource: "MANUAL", erpRefRecordedAt: day(r.raised),
        requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, title: r.title, justification: r.justification, needStatement: r.need,
        costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode9`, siteCode: "NTH-WKS", placeOfDelivery: "Northern network", dateRequired: day("2027-03-31"),
        estimatedValue: r.value, raisedOn: day(r.raised), fundingRouteCode: "capex", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES",
        status: "SOURCING", commitmentMovementId: `${P}bm${30 + r.id - 19}`,
        lines: { create: [{ id: `${P}rq${r.id}l1`, lineNo: 1, description: r.title, estimatedAmount: r.value }] },
      },
    });
    await db.requisitionEndorsement.createMany({
      data: [
        { id: `${P}en${r.id}a`, requisitionId: `${P}rq${r.id}`, tier: "SECTION", unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: day(r.endorsed) },
        { id: `${P}en${r.id}b`, requisitionId: `${P}rq${r.id}`, tier: "DEPARTMENT", unitCode: "NTH", personId: `${P}p9`, endorsedOn: day(r.endorsed) },
      ],
    });
    const value = BigInt(Math.round(Number(r.value) * 100));
    const fmt = (s: bigint) => `${s / 100n}.${String(s % 100n).padStart(2, "0")}`;
    await db.requisitionBudgetCheck.create({
      data: { id: `${P}bk${r.id}`, requisitionId: `${P}rq${r.id}`, checkedAt: day(r.checked), asAt: day(r.checked), source: "PORTAL_LEDGER", budgetCodeId: `${P}bcode9`, budgetCodeCode: "CAP26-050", requestedAmount: r.value, actualBudget: "8000000.00", balanceAsAt: fmt(balance), approvedAccount: fmt(800_000_000n - balance), approvedAccountProvenance: "ASSUMED", projectedBalance: fmt(balance - value), verdict: "WITHIN" },
    });
    balance -= value;
    await db.requisitionSplitCheck.create({ data: { id: `${P}sp${r.id}`, requisitionId: `${P}rq${r.id}`, checkedAt: day(r.checked), state: "CLEAR", windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, policyProvenance: "ASSUMED", relatedRequisitionIds: [], relatedReferences: [] } });
    await db.budgetMovement.create({ data: { id: `${P}bm${30 + r.id - 19}`, budgetCodeId: `${P}bcode9`, kind: "COMMITMENT", amount: r.value, occurredOn: day(approvedOn), reference: REQ(r.n), description: r.title } });
    await db.approvalInstance.create({
      data: {
        id: `${P}ai${r.id + 20}`, organisationId, matterKind: "REQUISITION", requisitionId: `${P}rq${r.id}`, domain: "requisition", value: r.value,
        authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: r.rule.key, ruleLabel: r.rule.label, ruleClause: r.rule.clause,
        boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null, fundingRouteCode: "capex",
        budgetCheckId: `${P}bk${r.id}`, budgetVerdict: "WITHIN", availabilityCheck: "blocking", splitCheckId: `${P}sp${r.id}`, splitState: "CLEAR",
        checkedAgainstMatrix: true, status: "APPROVED", openedAt: day(r.checked), closedAt: day(approvedOn), commitOnApproval: true, routeCommitsBudget: true,
        steps: {
          create: r.rule.chain.map(([roleCode, roleLabel, act, pid, name], i) => ({
            id: `${P}rs${r.id}_${i + 1}`, sequence: i + 1, roleCode, roleLabel, act, nonDelegable: act === "MR", sourceRuleKey: r.rule.key,
            decision: "DONE", decidedByPersonId: `${P}${pid}`, decidedByName: name, decidedOn: day(r.steps[i]), recordedAt: day(r.steps[i]),
          })),
        },
      },
    });
  }
  await db.numberingSeries.update({ where: { id: `${P}n1` }, data: { nextSerial: 32 } });

  // ------------------------------------------------ the exercises, in preparation
  await db.sourcingExercise.createMany({
    data: EXERCISES.map((x) => ({
      id: `${P}sx${x.n}`, organisationId, reference: SX(x.n), requisitionId: `${P}rq${x.rq}`, title: x.title, estimatedValue: x.value, sourcingMethodCode: x.method,
      status: "DOCUMENTS_IN_PREPARATION" as const, contractBasisCode: "bq", createdAt: day("2026-09-02"),
    })),
  });
  await db.exerciseScopePart.createMany({ data: EXERCISES.map((x) => ({ id: `${P}sx${x.n}p1`, exerciseId: `${P}sx${x.n}`, deliverableKind: x.kind, amount: x.value, description: x.title, sortOrder: 1 })) });
  await db.numberingSeries.update({ where: { id: `${P}n5` }, data: { nextSerial: 15 } });

  // --------------------------------------------------------------- the sittings
  // The Tender Board's award sitting, and the Quotation Committee's. Minuted; their
  // registers are frozen by the loader with the minuting action's own function.
  await db.meeting.createMany({
    data: [
      { id: `${P}mt6`, committeeId: `${P}c1`, reference: "DEMO/SIT/5/2026", meetingDate: day("2026-09-14"), status: "MINUTED", minutedAt: day("2026-09-15"), agenda: "Two awards in the tender band.", minutes: "The Board met with three voting members present and carried both awards." },
      { id: `${P}mt7`, committeeId: `${P}c2`, reference: "DEMO/SQ/1/2026", meetingDate: day("2026-09-11"), status: "MINUTED", minutedAt: day("2026-09-12"), agenda: "Two quotations.", minutes: "The Committee recommended both awards." },
    ],
  });
  await db.numberingSeries.update({ where: { id: `${P}n4` }, data: { nextSerial: 6 } });
  await db.meetingAttendance.createMany({
    data: [
      { id: `${P}at13`, meetingId: `${P}mt6`, personId: `${P}p1`, attended: true },
      { id: `${P}at14`, meetingId: `${P}mt6`, personId: `${P}p2`, attended: true },
      { id: `${P}at15`, meetingId: `${P}mt6`, personId: `${P}p3`, attended: true },
      { id: `${P}at16`, meetingId: `${P}mt6`, personId: `${P}p7`, attended: true },
      { id: `${P}at17`, meetingId: `${P}mt7`, personId: `${P}p2`, attended: true },
      { id: `${P}at18`, meetingId: `${P}mt7`, personId: `${P}p4`, attended: true },
    ],
  });
  const matter = (id: string, meetingId: string, sx: number, subject: string, amount: string, act: "A" | "MR", tabledAt: string, decided: { on: string; quorum: number } | null, sequence: number) => ({
    id: `${P}${id}`, meetingId: `${P}${meetingId}`, sequence, domain: "appointment", subject, matterKind: "EXERCISE" as const, matterRef: SX(sx), exerciseId: `${P}sx${sx}`, amount, act,
    tabledByPersonId: `${P}p3`, tabledAt: day(tabledAt),
    ...(decided ? { outcome: "CARRIED" as const, decisionDate: day(decided.on), quorumRequired: decided.quorum, presentVoters: decided.quorum, recusedCount: 0, votingRule: "SIMPLE_MAJORITY" as const, votingRuleProvenance: "ASSUMED" as const } : {}),
  });
  await db.committeeDecision.createMany({
    data: [
      matter("d8", "mt6", 11, "Award of the trunk main renewal, Zone C", "1650000", "A", "2026-09-10", { on: "2026-09-14", quorum: 3 }, 1),
      matter("d9", "mt6", 12, "Award of the reservoir rehabilitation", "2700000", "A", "2026-09-10", { on: "2026-09-14", quorum: 3 }, 2),
      matter("d11", "mt7", 13, "Quotation: meter chamber upgrades", "180000", "MR", "2026-09-09", { on: "2026-09-11", quorum: 2 }, 1),
      matter("d12", "mt7", 14, "Quotation: valve keys and chamber covers", "36000", "MR", "2026-09-09", { on: "2026-09-11", quorum: 2 }, 2),
      // Tabled at the Board's sitting in progress: not yet decided.
      matter("d10", "mt1", 10, "Award of the pumping station refurbishment", "1240000", "A", "2026-09-25", null, 3),
    ],
  });
  const vote = (id: string, d: string, p: string, on: string) => ({ id: `${P}${id}`, decisionId: `${P}${d}`, personId: `${P}${p}`, choice: "SETUJU" as const, votedAt: day(on), recordedAt: day(on) });
  await db.vote.createMany({
    data: [
      vote("v11", "d8", "p1", "2026-09-14"), vote("v12", "d8", "p2", "2026-09-14"), vote("v13", "d8", "p7", "2026-09-14"),
      vote("v14", "d9", "p1", "2026-09-14"), vote("v15", "d9", "p2", "2026-09-14"), vote("v16", "d9", "p7", "2026-09-14"),
      vote("v17", "d11", "p2", "2026-09-11"), vote("v18", "d11", "p4", "2026-09-11"),
      vote("v19", "d12", "p2", "2026-09-11"), vote("v20", "d12", "p4", "2026-09-11"),
    ],
  });

  // The requisitions' trail, in the shape the requisition actions write it.
  const { diffFields } = await import("../src/lib/audit/diff");
  const { ACT_LABEL } = await import("../src/lib/labels");
  const { TIER_LABEL } = await import("../src/lib/requisition/labels");
  const entries: object[] = [];
  for (const r of REQS) {
    const reqId = `${P}rq${r.id}`;
    const label = `${REQ(r.n)} · ${r.title}`;
    const route = `${REQ(r.n)} · approval route`;
    let n = 0;
    const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", at: string, changes: object[], reason = "") => entries.push({ id: `${reqId}_au${++n}`, organisationId, entity, entityId, entityLabel, action, at: day(at), changes, reason, unattributed: true });
    entry("Requisition", reqId, label, "CREATE", r.raised, diffFields(null, { reference: REQ(r.n), title: r.title, justification: r.justification, needStatement: r.need, requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode9`, siteCode: "NTH-WKS", placeOfDelivery: "Northern network", dateRequired: day("2027-03-31"), estimatedValue: r.value, fundingRouteCode: "capex", contractTypeCode: null, lines: 1, status: "DRAFT" }));
    entry("RequisitionEndorsement", `${P}en${r.id}a`, `${REQ(r.n)} · ${TIER_LABEL.SECTION}`, "CREATE", r.endorsed, diffFields(null, { tier: "SECTION", unit: "Maintenance Section", person: "Lim Kok Seng", endorsedOn: day(r.endorsed), note: "" }));
    entry("RequisitionEndorsement", `${P}en${r.id}b`, `${REQ(r.n)} · ${TIER_LABEL.DEPARTMENT}`, "CREATE", r.endorsed, diffFields(null, { tier: "DEPARTMENT", unit: "Northern Region", person: "Imran Hakim", endorsedOn: day(r.endorsed), note: "" }));
    entry("Requisition", reqId, label, "UPDATE", r.endorsed, diffFields({ status: "DRAFT" }, { status: "ENDORSED" }));
    entry("RequisitionBudgetCheck", `${P}bk${r.id}`, `${REQ(r.n)} · budget check`, "CREATE", r.checked, diffFields(null, { source: "PORTAL_LEDGER", asAt: day(r.checked), budgetCode: "CAP26-050", verdict: "WITHIN", requestedAmount: r.value }));
    entry("ApprovalInstance", `${P}ai${r.id + 20}`, route, "CREATE", r.checked, diffFields(null, { matrix: "Demo limits, issue 1", rule: r.rule.label, route: r.rule.chain.map(([, roleLabel, act]) => `${roleLabel} (${ACT_LABEL[act]?.toLowerCase() ?? "acts"})`).join(" → "), overBudget: false, fundingOverrideApplied: false, splitState: "CLEAR" }));
    entry("Requisition", reqId, label, "UPDATE", r.checked, diffFields({ status: "ENDORSED", sourcingPermitted: null }, { status: "PENDING_APPROVAL", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES" }));
    r.rule.chain.forEach(([, roleLabel, , , name], i) => entry("ApprovalStep", `${P}rs${r.id}_${i + 1}`, `${REQ(r.n)} · ${roleLabel}`, "UPDATE", r.steps[i], diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: name, decidedOn: day(r.steps[i]), recordedOnBehalf: "not signed", underDelegation: null })));
    const last = r.steps[r.steps.length - 1];
    entry("BudgetMovement", `${P}bm${30 + r.id - 19}`, `CAP26-050 · commitment for ${REQ(r.n)}`, "CREATE", last, diffFields(null, { kind: "COMMITMENT", budgetCode: "CAP26-050", reference: REQ(r.n), committedEstimate: r.value, occurredOn: day(last) }));
    entry("ApprovalInstance", `${P}ai${r.id + 20}`, route, "UPDATE", last, diffFields({ status: "PENDING" }, { status: "APPROVED", commitment: "written" }));
    entry("Requisition", reqId, label, "UPDATE", last, diffFields({ status: "PENDING_APPROVAL" }, { status: "APPROVED" }));
    const sx = EXERCISES.find((x) => x.rq === r.id)!;
    entry("Requisition", reqId, label, "UPDATE", "2026-09-08", diffFields({ status: "APPROVED" }, { status: "SOURCING" }), `Exercise ${SX(sx.n)} moved into preparation.`);
  }
  await db.auditEntry.createMany({ data: entries as never });
  return EXERCISES.map((x) => `${P}sx${x.n}`);
}

const BIG_CHAIN = [
  ["DEPT_HEAD", "Head of Department", "P", "p9", "Imran Hakim"],
  ["DIV_HEAD", "Head of Division", "R", "p7", "Gopal Nair"],
  ["FD", "Finance Director", "MR", "p2", "Bala Krishnan"],
  ["CEO", "Chief Executive", "A", "p1", "Aisyah Rahman"],
] as const;
const BIG = { key: "demo.requisition.4", label: "Requisition, above RM250,000", clause: "DEMO 3.1(d)", chain: BIG_CHAIN };
const REQS = [
  { id: 20, n: 27, title: "Pumping station refurbishment, Bukit Demo", value: "1300000.00", raised: "2026-07-01", endorsed: "2026-07-02", checked: "2026-07-03", steps: ["2026-07-06", "2026-07-08", "2026-07-10", "2026-07-14"], rule: BIG, justification: "The station's pumps and switchgear are past their service life.", need: "Reliable supply to the upper zones." },
  { id: 21, n: 28, title: "Trunk main renewal, Zone C", value: "1700000.00", raised: "2026-07-02", endorsed: "2026-07-03", checked: "2026-07-06", steps: ["2026-07-08", "2026-07-10", "2026-07-13", "2026-07-16"], rule: BIG, justification: "Repeated bursts on the Zone C trunk main.", need: "Renew 2.4 km of trunk main." },
  { id: 22, n: 29, title: "Reservoir rehabilitation, Demo Hill", value: "2800000.00", raised: "2026-07-03", endorsed: "2026-07-06", checked: "2026-07-07", steps: ["2026-07-09", "2026-07-13", "2026-07-15", "2026-07-20"], rule: BIG, justification: "The reservoir's roof and lining have failed inspection.", need: "Rehabilitate the 10 ML reservoir." },
  {
    id: 23, n: 30, title: "Meter chamber upgrades, northern zones", value: "200000.00", raised: "2026-07-06", endorsed: "2026-07-07", checked: "2026-07-08", steps: ["2026-07-10", "2026-07-13", "2026-07-15"],
    rule: { key: "demo.requisition.3", label: "Requisition, RM40,000 to RM250,000", clause: "DEMO 3.1(c)", chain: [["DEPT_HEAD", "Head of Department", "P", "p9", "Imran Hakim"], ["DIV_HEAD", "Head of Division", "R", "p7", "Gopal Nair"], ["FD", "Finance Director", "A", "p2", "Bala Krishnan"]] as const },
    justification: "Chambers flood and meters cannot be read.", need: "Raise and seal 120 meter chambers.",
  },
  {
    id: 24, n: 31, title: "Valve keys and chamber covers", value: "40000.00", raised: "2026-07-07", endorsed: "2026-07-08", checked: "2026-07-09", steps: ["2026-07-13", "2026-07-15"],
    rule: { key: "demo.requisition.2", label: "Requisition, RM1,000 to RM40,000", clause: "DEMO 3.1(b)", chain: [["DEPT_HEAD", "Head of Department", "R", "p9", "Imran Hakim"], ["DIV_HEAD", "Head of Division", "A", "p7", "Gopal Nair"]] as const },
    justification: "Crews are short of valve keys and several covers are broken.", need: "Keys and covers for the northern crews.",
  },
] as const;

const EXERCISES = [
  { n: 10, rq: 20, title: "Pumping station refurbishment", value: "1300000.00", method: "open_tender", kind: "MEASURED_CONSTRUCTION" as const },
  { n: 11, rq: 21, title: "Trunk main renewal, Zone C", value: "1700000.00", method: "open_tender", kind: "MEASURED_CONSTRUCTION" as const },
  { n: 12, rq: 22, title: "Reservoir rehabilitation", value: "2800000.00", method: "open_tender", kind: "MEASURED_CONSTRUCTION" as const },
  { n: 13, rq: 23, title: "Meter chamber upgrades", value: "200000.00", method: "open_quotation", kind: "MEASURED_CONSTRUCTION" as const },
  { n: 14, rq: 24, title: "Valve keys and chamber covers", value: "40000.00", method: "open_quotation", kind: "GOODS_DELIVERED" as const },
];

/**
 * The six awards, after the exercises are determined. Rows are written as the actions
 * would have left them; the documents are frozen and the trail written by the same
 * functions the actions use.
 */
export async function loadAwards(db: Db, organisationId: string) {
  const { diffFields } = await import("../src/lib/audit/diff");
  const { awardAuditCreate, awardAuditPair } = await import("../src/lib/award/audit-view");
  const { renderedText } = await import("../src/lib/award/merge");
  const { evaluateAward } = await import("../src/lib/award/evaluate");
  const { awardFacts, loadAward } = await import("../src/lib/award/repo");
  const { requiredInsuranceEnd } = await import("../src/lib/securities/period");

  const aw = (n: number, sx: number, x: object) => ({ id: `${P}aw${n}`, organisationId, reference: AWD(n), exerciseId: `${P}sx${sx}`, ...x });
  const works = { completionUnit: "MONTHS" as const, ladUnit: "per day", termsProvenance: "OBSERVED" as const, retentionPercent: "5", retentionCapPercent: "5", dlpMonths: 12 };
  await db.award.createMany({
    data: [
      aw(6, 10, { status: "CANCELLED", instrumentKind: "LETTER_OF_ACCEPTANCE", cancelReason: "The tenderer withdrew before the award went for approval.", awardeeName: "Sampel Builders Sdn Bhd", awardeeRegistrationNo: "DEMO-0006-X", awardeeAddress: "6 Demo Road, Demo City", awardedValue: "1260000.00", completionPeriod: 18, completionUnit: "MONTHS", createdAt: day("2026-09-09") }),
      aw(1, 10, { status: "PENDING_APPROVAL", instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Demo Civil Works Sdn Bhd", awardeeRegistrationNo: "DEMO-0001-X", awardeeAddress: "1 Demo Road, Demo City", awardedValue: "1240000.00", completionPeriod: 18, startDate: day("2026-11-02"), regulatedActivity: false, bondRequired: true, bondBasis: "CONTRACT_PRICE", bondPercent: "5", bondValidityExtraMonths: 12, bondBasisProvenance: "ASSUMED", ladAmount: "800", ...works, wcBasis: "PERCENT_OF_CONTRACT", createdAt: day("2026-09-22") }),
      aw(2, 11, { status: "APPROVED", instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Contoh Pipeline Sdn Bhd", awardeeRegistrationNo: "DEMO-0002-X", awardeeAddress: "2 Contoh Street, Demo City", awardedValue: "1650000.00", completionPeriod: 20, startDate: day("2026-11-16"), regulatedActivity: true, bondRequired: true, ladAmount: "1000", ...works, wcBasis: "PERCENT_OF_CONTRACT", createdAt: day("2026-09-09") }),
      aw(3, 12, {
        status: "ISSUED", instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Sampel Engineering Sdn Bhd", awardeeRegistrationNo: "DEMO-0003-X", awardeeAddress: "3 Sampel Avenue, Demo City", awardedValue: "2700000.00", completionPeriod: 24, startDate: day("2026-10-15"), regulatedActivity: false,
        bondRequired: true, bondBasis: "ANNUAL_VALUE", bondPercent: "5", bondBasisAmount: "1350000.00", bondValidityExtraMonths: 12, bondBasisProvenance: "OBSERVED", bondBasisNote: "The one-year value is as the award pack states it.", ladAmount: "1500", ...works, wcBasis: "UNCOVERED_WAGES",
        signatoryRoleCode: "CEO", signatoryRoleLabel: "Chief Executive", signatoryRuleKey: "demo.signatory.loa.3", signatoryRuleLabel: "Letter of Acceptance, above RM2.5 million", signatoryPersonId: `${P}p1`, signatoryName: "Aisyah Rahman", signedOn: day("2026-09-17"), issuedAt: day("2026-09-17"), createdAt: day("2026-09-09"),
      }),
      aw(4, 13, {
        status: "ISSUED", instrumentKind: "WORK_INDENT", awardeeName: "Demo Meter Services Sdn Bhd", awardeeRegistrationNo: "DEMO-0004-X", awardeeAddress: "4 Demo Lane, Demo North", awardedValue: "180000.00", completionPeriod: 16, completionUnit: "WEEKS", startDate: day("2026-09-21"), regulatedActivity: false,
        bondRequired: true, bondBasis: "CONTRACT_PRICE", bondPercent: "5", bondValidityExtraMonths: 12, bondBasisProvenance: "ASSUMED", ladAmount: "250", ladUnit: "per day", retentionPercent: "5", retentionCapPercent: "5", dlpMonths: 12, termsProvenance: "ASSUMED", wcBasis: "PERCENT_OF_CONTRACT",
        erpCommitmentNo: "XI202600812", erpCommitmentKind: "INDENT", commitmentRecordedOn: day("2026-09-18"), indentReceivedOn: day("2026-09-18"),
        signatoryRoleCode: "DEPT_HEAD", signatoryRoleLabel: "Head of Department", signatoryRuleKey: "demo.signatory.indent", signatoryRuleLabel: "Appointment letter, quotation band", signatoryPersonId: `${P}p9`, signatoryName: "Imran Hakim", signedOn: day("2026-09-19"), issuedAt: day("2026-09-19"),
        variantId: `${P}alv2`, variantName: "Extended appointment letter", createdAt: day("2026-09-09"),
      }),
      aw(5, 14, {
        status: "ACCEPTED", instrumentKind: "WORK_INDENT", awardeeName: "Contoh Supplies Enterprise", awardeeRegistrationNo: "DEMO-0005-X", awardeeAddress: "5 Contoh Road, Demo North", awardedValue: "36000.00", completionPeriod: 8, completionUnit: "WEEKS", startDate: day("2026-09-21"), commencedOn: day("2026-09-22"), regulatedActivity: false,
        bondRequired: false, bondNotRequiredReason: "Short-form terms: no performance bond is asked below the extended terms band (demo policy).", bondBasisProvenance: "ASSUMED", ladAmount: "100", ladUnit: "per day", dlpMonths: 0, termsProvenance: "ASSUMED", wcBasis: "PERCENT_OF_CONTRACT",
        erpCommitmentNo: "XI202600799", erpCommitmentKind: "INDENT", commitmentRecordedOn: day("2026-09-15"), indentReceivedOn: day("2026-09-15"),
        signatoryRoleCode: "DEPT_HEAD", signatoryRoleLabel: "Head of Department", signatoryRuleKey: "demo.signatory.indent", signatoryRuleLabel: "Appointment letter, quotation band", signatoryPersonId: `${P}p9`, signatoryName: "Imran Hakim", signedOn: day("2026-09-16"), issuedAt: day("2026-09-16"),
        variantId: `${P}alv1`, variantName: "Short-form appointment letter", createdAt: day("2026-09-09"),
      }),
    ] as never,
  });
  // The classification is locked from each award's first submission (FR-MTD-011).
  for (const [sx, on] of [[10, "2026-09-22"], [11, "2026-09-09"], [12, "2026-09-09"], [13, "2026-09-09"], [14, "2026-09-09"]] as const) {
    await db.sourcingExercise.update({ where: { id: `${P}sx${sx}` }, data: { classificationLockedAt: new Date(`${on}T02:00:00Z`) } });
  }

  // The appointment routes, as the submission resolved them and the decisions discharged them.
  const route = (n: number, sx: number, value: string, rule: { key: string; label: string; clause: string }, opened: string, closed: string | null, status: "PENDING" | "APPROVED", steps: object[]) => ({
    id: `${P}ai${n + 50}`, organisationId, matterKind: "EXERCISE" as const, exerciseId: `${P}sx${sx}`, awardId: `${P}aw${n}`, domain: "appointment", value,
    authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: rule.key, ruleLabel: rule.label, ruleClause: rule.clause, boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: true,
    boundaryOperator: "GT" as const, fundingRouteCode: "capex", checkedAgainstMatrix: true, status, openedAt: day(opened), closedAt: closed ? day(closed) : null,
    steps: { create: steps },
  });
  const TENDER = { key: "demo.tender", label: "Tender, above RM300,000", clause: "DEMO 4.2" };
  const QUOTE = { key: "demo.quotation", label: "Quotation, RM15,000 to RM300,000", clause: "DEMO 4.3" };
  const board = (n: number, done: { on: string; d: string } | null) => ({ id: `${P}ap${n}_1`, sequence: 1, roleCode: "TENDER_BOARD", roleLabel: "Tender Board", act: "A" as const, committeeCode: "TENDER_BOARD", nonDelegable: true, sourceRuleKey: "demo.tender", ...(done ? { decision: "DONE" as const, decidedByName: "Tender Board", decidedOn: day(done.on), committeeDecisionId: `${P}${done.d}`, recordedAt: day(done.on) } : {}) });
  const quote = (n: number, d: string, ceo: { received: string; on: string }) => [
    { id: `${P}ap${n}_1`, sequence: 1, roleCode: "QUOTE_CTTE", roleLabel: "Quotation Committee", act: "MR" as const, committeeCode: "QUOTE_CTTE", nonDelegable: true, sourceRuleKey: "demo.quotation", decision: "DONE" as const, decidedByName: "Quotation Committee", decidedOn: day("2026-09-11"), committeeDecisionId: `${P}${d}`, recordedAt: day("2026-09-11") },
    { id: `${P}ap${n}_2`, sequence: 2, roleCode: "CEO", roleLabel: "Chief Executive", act: "A" as const, nonDelegable: true, sourceRuleKey: "demo.quotation", decision: "DONE" as const, decidedByPersonId: `${P}p1`, decidedByName: "Aisyah Rahman", decidedOn: day(ceo.on), receivedOn: day(ceo.received), recordedAt: day(ceo.on) },
  ];
  for (const r of [
    route(1, 10, "1240000.00", TENDER, "2026-09-24", null, "PENDING", [board(1, null)]),
    route(2, 11, "1650000.00", TENDER, "2026-09-09", "2026-09-14", "APPROVED", [board(2, { on: "2026-09-14", d: "d8" })]),
    route(3, 12, "2700000.00", TENDER, "2026-09-09", "2026-09-14", "APPROVED", [board(3, { on: "2026-09-14", d: "d9" })]),
    route(4, 13, "180000.00", QUOTE, "2026-09-09", "2026-09-14", "APPROVED", quote(4, "d11", { received: "2026-09-12", on: "2026-09-14" })),
    route(5, 14, "36000.00", QUOTE, "2026-09-09", "2026-09-14", "APPROVED", quote(5, "d12", { received: "2026-09-13", on: "2026-09-14" })),
  ]) {
    await db.approvalInstance.create({ data: r as never });
  }

  // The contracts: numbered at issue from the series, or the indent's own number.
  await db.contract.createMany({
    data: [
      { id: `${P}con1`, organisationId, number: "DEMO/KP/T/004/2026", numberSource: "SERIES", seriesKey: "contract", numberedOn: day("2026-09-17"), awardId: `${P}aw3`, contractSum: "2700000.00" },
      { id: `${P}con2`, organisationId, number: "XI202600812", numberSource: "INDENT_NUMBER", numberedOn: day("2026-09-19"), awardId: `${P}aw4`, contractSum: "180000.00" },
      { id: `${P}con3`, organisationId, number: "XI202600799", numberSource: "INDENT_NUMBER", numberedOn: day("2026-09-16"), awardId: `${P}aw5`, contractSum: "36000.00" },
    ],
  });
  await db.numberingSeries.update({ where: { id: `${P}n2` }, data: { nextSerial: 5 } });
  await db.caseOwnershipEvent.createMany({
    data: [
      { id: `${P}ce1`, contractId: `${P}con1`, fromUnitCode: "CP-PRE", toUnitCode: "CP-POST", on: day("2026-09-17") },
      { id: `${P}ce2`, contractId: `${P}con2`, fromUnitCode: "CP-PRE", toUnitCode: "CP-POST", on: day("2026-09-19") },
      { id: `${P}ce3`, contractId: `${P}con3`, fromUnitCode: "CP-PRE", toUnitCode: "CP-POST", on: day("2026-09-16") },
    ],
  });
  const copy = (id: string, awardId: string, recipientId: string | null, recipientName: string, sortOrder: number, sent: { method: "REGISTERED_POST" | "COLLECTION" | "BY_HAND"; on: string; ack?: string; ref?: string } | null) => ({
    id: `${P}${id}`, awardId: `${P}${awardId}`, recipientId: recipientId ? `${P}${recipientId}` : null, recipientName, mandatory: true, isAwardee: recipientId == null, sortOrder,
    ...(sent ? { method: sent.method, despatchedOn: day(sent.on), acknowledgedOn: sent.ack ? day(sent.ack) : null, consignmentRef: sent.ref ?? "" } : {}),
  });
  await db.awardDistribution.createMany({
    data: [
      copy("ad1", "aw3", null, "Sampel Engineering Sdn Bhd", 0, { method: "REGISTERED_POST", on: "2026-09-17", ack: "2026-09-19", ref: "RR000000001DM" }),
      copy("ad2", "aw3", "dr1", "Implementing department", 1, { method: "BY_HAND", on: "2026-09-17", ack: "2026-09-17" }),
      copy("ad3", "aw3", "dr2", "Finance department", 2, { method: "BY_HAND", on: "2026-09-17", ack: "2026-09-18" }),
      copy("ad4", "aw3", "dr3", "Construction industry board", 3, { method: "REGISTERED_POST", on: "2026-09-18", ref: "RR000000002DM" }),
      copy("ad5", "aw3", "dr4", "Tax office", 4, null),
      copy("ad6", "aw4", null, "Demo Meter Services Sdn Bhd", 0, { method: "COLLECTION", on: "2026-09-19", ack: "2026-09-19" }),
      copy("ad7", "aw4", "dr6", "Implementing department", 1, { method: "BY_HAND", on: "2026-09-19" }),
      copy("ad8", "aw4", "dr7", "Finance department", 2, null),
      copy("ad9", "aw5", null, "Contoh Supplies Enterprise", 0, { method: "COLLECTION", on: "2026-09-16", ack: "2026-09-16" }),
      copy("ad10", "aw5", "dr6", "Implementing department", 1, { method: "BY_HAND", on: "2026-09-16", ack: "2026-09-16" }),
      copy("ad11", "aw5", "dr7", "Finance department", 2, { method: "BY_HAND", on: "2026-09-17", ack: "2026-09-17" }),
    ],
  });
  // Visibly invented identity card number (6.11 ruling).
  await db.awardReturn.createMany({
    data: [
      { id: `${P}ar3`, awardId: `${P}aw3`, signedLetterReceivedOn: day("2026-09-24"), declarationReceivedOn: day("2026-09-24"), receivedByPersonId: `${P}p4`, whereHeld: "Contract & Procurement strongroom" },
      { id: `${P}ar4`, awardId: `${P}aw4` },
      {
        id: `${P}ar5`, awardId: `${P}aw5`, signedLetterReceivedOn: day("2026-09-21"), receivedByPersonId: `${P}p4`, whereHeld: "Contract & Procurement strongroom", signatoryName: "Lee Mei Ling", icNumber: "000000-00-0005", occupation: "Director",
        address: "5 Contoh Road, Demo North", capacity: "Director, for Contoh Supplies Enterprise", contractorSigned: true, stampAffixed: true, witnessName: "Ahmad bin Demo", witnessSigned: true,
      },
    ],
  });
  await db.awardCondition.createMany({
    data: [
      { id: `${P}acnd1`, awardId: `${P}aw3`, kindId: `${P}cpk1`, kindName: "Safe method statement approved", excludesEot: true, requiredBy: day("2026-10-10") },
      { id: `${P}acnd2`, awardId: `${P}aw3`, kindId: `${P}cpk2`, kindName: "Regulator's works permit", reference: "DEMO/PERMIT/2026/41", requiredBy: day("2026-10-12"), satisfiedOn: day("2026-09-28") },
    ],
  });
  await db.securityInstrument.createMany({
    data: [
      {
        id: `${P}sec1`, contractId: `${P}con1`, kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", issuerId: `${P}iss1`, issuerNameAsWritten: "Demo Bank Berhad", instrumentRef: "DBB/BG/2026/0917", value: "67500.00",
        effectiveFrom: day("2026-09-20"), expiresOn: day("2029-10-31"), status: "VERIFIED", lodgedOn: day("2026-09-22"), verifiedOn: day("2026-09-25"), verifiedByPersonId: `${P}p3`,
        requiredValue: "67500.00", basis: "ANNUAL_VALUE", basisPercent: "5", basisAmount: "1350000.00", basisProvenance: "OBSERVED", requiredUntil: day("2029-10-15"),
      },
      { id: `${P}sec2`, contractId: `${P}con1`, kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", issuerNameAsWritten: "Unlisted Credit Sdn Bhd", instrumentRef: "UC/0042", value: "67500.00", effectiveFrom: day("2026-09-18"), expiresOn: day("2029-10-31"), status: "REJECTED", lodgedOn: day("2026-09-19"), verifiedOn: day("2026-09-20"), verifiedByPersonId: `${P}p3`, rejectedReason: "The issuer is not on the approved list." },
    ],
  });
  const aw5End = requiredInsuranceEnd("2026-09-21", { n: 8, unit: "WEEKS" }, 0, { months: 3, days: 14 });
  const end5 = aw5End.state === "SET" ? aw5End.day : "2027-03-31";
  await db.insurancePolicy.createMany({
    data: [
      { id: `${P}ins1`, contractId: `${P}con1`, kind: "WORKS", issuerId: `${P}iss3`, issuerNameAsWritten: "Sampel Insurance Berhad", policyNo: "SIB/CAR/2026/115", sumInsured: "2750000.00", appendixAmount: "50000.00", periodStart: day("2026-10-15"), periodEnd: day("2030-01-29"), premiumReceiptRef: "SIB/R/88120", lodgedOn: day("2026-09-26") },
      { id: `${P}ins2`, contractId: `${P}con3`, kind: "PUBLIC_LIABILITY", issuerId: `${P}iss3`, issuerNameAsWritten: "Sampel Insurance Berhad", policyNo: "SIB/PL/2026/301", sumInsured: "20000.00", periodStart: day("2026-09-21"), periodEnd: day(end5), status: "VERIFIED", lodgedOn: day("2026-09-18"), verifiedOn: day("2026-09-23"), verifiedByPersonId: `${P}p3`, requirementSnapshot: { name: "Public liability insurance", tailMonths: 3, tailDays: 14, percent: null, dlpMonths: 0, wcBasis: "PERCENT_OF_CONTRACT" } },
      { id: `${P}ins3`, contractId: `${P}con3`, kind: "WORKMENS_COMPENSATION", issuerId: `${P}iss3`, issuerNameAsWritten: "Sampel Insurance Berhad", policyNo: "SIB/WC/2026/302", sumInsured: "3600.00", periodStart: day("2026-09-21"), periodEnd: day(end5), perkesoRegistrationNo: "DEMO-SOCSO-0005", status: "VERIFIED", lodgedOn: day("2026-09-18"), verifiedOn: day("2026-09-23"), verifiedByPersonId: `${P}p3`, requirementSnapshot: { name: "Workmen's compensation", tailMonths: 3, tailDays: 14, percent: "10", dlpMonths: 0, wcBasis: "PERCENT_OF_CONTRACT" } },
    ],
  });

  // The issued documents, frozen by the function the issue uses, with the values it fills.
  const issued: { n: number; number: string; on: string; signer: string }[] = [
    { n: 3, number: "DEMO/KP/T/004/2026", on: "2026-09-17", signer: "Aisyah Rahman" },
    { n: 4, number: "XI202600812", on: "2026-09-19", signer: "Imran Hakim" },
    { n: 5, number: "XI202600799", on: "2026-09-16", signer: "Imran Hakim" },
  ];
  for (const i of issued) {
    const l = await loadAward(`${P}aw${i.n}`);
    if (!l) throw new Error(`Demo award ${i.n} did not load.`);
    const f = await awardFacts(l);
    const ev = evaluateAward(f.facts, { contractNumber: i.number, issueDate: i.on, signatoryName: i.signer });
    let k = 0;
    for (const d of ev.documents) {
      if (d.state !== "OK" || !d.rendered || d.missing.length || d.unknown.length) throw new Error(`Demo award ${i.n}: ${d.kind} would not issue (${d.state}; missing ${d.missing.join(", ")}).`);
      const t = d.template!;
      await db.awardDocument.create({
        data: { id: `${P}adoc${i.n}_${++k}`, awardId: `${P}aw${i.n}`, kind: d.kind, templateId: t.id, templateCode: t.code, templateName: t.nameEn, templateFormCode: t.formCode, templateRevisionDate: t.revisionDate, templateBodyVersion: t.bodyVersion, language: d.language!, version: 1, fields: d.fields, renderedText: renderedText(d.rendered), frozenAt: new Date(`${i.on}T02:00:00.000Z`) },
      });
    }
    const variant = ev.variant?.state === "SELECTED" ? ev.variant.variant : null;
    await db.award.update({
      where: { id: `${P}aw${i.n}` },
      data: {
        issueSnapshot: {
          v: 1, issuedOn: i.on, instrument: l.award.instrumentKind, regime: l.ex.regime, boundaryOperator: l.ex.boundaryOperator,
          policy: { ...f.config.policy, id: undefined, notes: undefined },
          signatory: ev.signatory?.ok ? { rule: ev.signatory.ruleLabel, clause: ev.signatory.clause, office: ev.signatory.roleLabel, recommenders: ev.signatory.recommenders.map((x) => x.roleLabel), delegable: ev.signatory.delegable } : null,
          variant: variant ? { name: variant.nameEn, nonCommencement: variant.nonCommencement } : null,
          terms: f.facts.exercise.terms,
          contractNumber: { number: i.number, source: l.award.instrumentKind === "WORK_INDENT" ? "INDENT_NUMBER" : "SERIES", yearReading: "ASSUMED" },
          recipients: l.award.distributions.map((x) => x.recipientName),
        } as object,
      },
    });
  }

  // The trail, in the shape the award actions write it.
  const rows = await db.award.findMany({ where: { id: { startsWith: `${P}aw` } }, include: { distributions: true, awardReturn: true, contract: { include: { securities: true, policies: true } }, documents: true } });
  const entries: object[] = [];
  for (const a of rows) {
    let n = 0;
    const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", at: Date | string, changes: object[], reason = "") =>
      entries.push({ id: `${a.id}_au${++n}`, organisationId, entity, entityId, entityLabel, action, at: typeof at === "string" ? day(at) : at, changes, reason, unattributed: true });
    const label = `${a.reference} · ${a.awardeeName}`;
    const created = a.createdAt;
    const asCreated = { ...a, status: "DRAFT", signatoryRoleCode: null, signatoryRoleLabel: null, signatoryRuleKey: null, signatoryRuleLabel: null, signatoryPersonId: null, signatoryName: null, signedOn: null, issuedAt: null, erpCommitmentNo: null, erpCommitmentKind: null, commitmentRecordedOn: null, indentReceivedOn: null, variantName: null, commencedOn: null, cancelReason: "" };
    entry("Award", a.id, label, "CREATE", created, awardAuditCreate(asCreated, { exercise: SX(Number(a.exerciseId.replace(`${P}sx`, ""))), instrument: a.instrumentKind }));
    if (a.status === "CANCELLED") {
      entry("Award", a.id, label, "UPDATE", "2026-09-20", diffFields({ status: "DRAFT" }, { status: "CANCELLED", consequence: null }), a.cancelReason);
      continue;
    }
    const inst = await db.approvalInstance.findFirst({ where: { awardId: a.id }, include: { steps: { orderBy: { sequence: "asc" } } } });
    if (!inst) continue;
    entry("ApprovalInstance", inst.id, `${a.reference} · appointment route`, "CREATE", inst.openedAt, diffFields(null, { matrix: inst.matrixLabel, rule: inst.ruleLabel, route: inst.steps.map((s) => `${s.roleLabel} (${s.act === "A" ? "approves" : "mandatory recommendation"})`).join(" → "), fundingOverrideApplied: false, escalated: null }));
    entry("Award", a.id, label, "UPDATE", inst.openedAt, diffFields({ status: "DRAFT" }, { status: "PENDING_APPROVAL" }));
    for (const s of inst.steps.filter((x) => x.decision === "DONE")) {
      entry("ApprovalStep", s.id, `${a.reference} · ${s.roleLabel}`, "UPDATE", s.decidedOn!, s.committeeCode
        ? diffFields({ decision: "PENDING" }, { decision: "DONE", committee: s.decidedByName, sitting: s.committeeCode === "TENDER_BOARD" ? "DEMO/SIT/5/2026" : "DEMO/SQ/1/2026", decidedOn: s.decidedOn, minuted: "yes" })
        : diffFields({ decision: "PENDING", receivedOn: null }, { decision: "DONE", decidedBy: s.decidedByName, decidedOn: s.decidedOn, receivedOn: s.receivedOn, recordedOnBehalf: "not signed", underDelegation: null }));
    }
    if (inst.status !== "APPROVED") continue;
    entry("ApprovalInstance", inst.id, `${a.reference} · appointment route`, "UPDATE", inst.closedAt!, diffFields({ status: "PENDING" }, { status: "APPROVED" }));
    entry("Award", a.id, label, "UPDATE", inst.closedAt!, diffFields({ status: "PENDING_APPROVAL" }, { status: "APPROVED" }));
    if (a.erpCommitmentNo) entry("Award", a.id, label, "UPDATE", a.commitmentRecordedOn!, diffFields({ erpCommitmentNo: null }, { erpCommitmentNo: a.erpCommitmentNo, erpCommitmentKind: a.erpCommitmentKind, commitmentRecordedOn: a.commitmentRecordedOn, indentReceivedOn: a.indentReceivedOn, source: "typed by an officer" }));
    if (!a.issuedAt || !a.contract) continue;
    const c = a.contract;
    entry("Contract", c.id, `${a.reference} · contract ${c.number}`, "CREATE", a.issuedAt, diffFields(null, { number: c.number, numberSource: c.numberSource, numberedOn: c.numberedOn, contractSum: c.contractSum.toString(), yearReading: "issue date, assumed" }));
    entry("CaseOwnershipEvent", `${P}ce${a.id.slice(-1) === "3" ? 1 : a.id.slice(-1) === "4" ? 2 : 3}`, `${a.reference} · case handed over`, "CREATE", a.issuedAt, diffFields(null, { from: "Pre-contract Section", to: "Post-contract Section", on: a.issuedAt }));
    for (const d of a.distributions) entry("AwardDistribution", d.id, `${a.reference} · copy to ${d.recipientName}`, "CREATE", a.issuedAt, diffFields(null, { recipient: d.recipientName, mandatory: d.mandatory, awardee: d.isAwardee }));
    for (const d of a.documents) entry("AwardDocument", d.id, `${a.reference} · ${d.templateName}`, "CREATE", a.issuedAt, diffFields(null, { template: d.templateName, formCode: d.templateFormCode, textVersion: d.templateBodyVersion, language: d.language, frozen: "yes" }));
    if (a.awardReturn) entry("AwardReturn", a.awardReturn.id, `${a.reference} · return`, "CREATE", a.issuedAt, diffFields(null, { opened: "yes" }));
    entry("Award", a.id, label, "UPDATE", a.issuedAt, diffFields({ status: "APPROVED" }, { status: "ISSUED", issuedAt: a.issuedAt, signedBy: a.signatoryName, signedOn: a.signedOn, signatoryOffice: a.signatoryRoleLabel, recordedOnBehalf: "not signed", contractNumber: c.number, underDelegation: null }));
    for (const d of a.distributions.filter((x) => x.despatchedOn)) entry("AwardDistribution", d.id, `${a.reference} · copy to ${d.recipientName}`, "UPDATE", d.despatchedOn!, diffFields({ method: null, consignmentRef: "", despatchedOn: null, acknowledgedOn: null, note: "" }, { method: d.method, consignmentRef: d.consignmentRef, despatchedOn: d.despatchedOn, acknowledgedOn: d.acknowledgedOn, note: d.note }));
    const r = a.awardReturn;
    if (r && (r.signedLetterReceivedOn || r.signatoryName)) {
      const blank = { signedLetterReceivedOn: null, declarationReceivedOn: null, authorisationReceivedOn: null, whereHeld: "", signatoryName: "", icNumber: "", occupation: "", address: "", capacity: "", contractorSigned: null, stampAffixed: null, witnessName: "", witnessSigned: null, receivedBy: null };
      const now = { signedLetterReceivedOn: r.signedLetterReceivedOn, declarationReceivedOn: r.declarationReceivedOn, authorisationReceivedOn: r.authorisationReceivedOn, whereHeld: r.whereHeld, signatoryName: r.signatoryName, icNumber: r.icNumber, occupation: r.occupation, address: r.address, capacity: r.capacity, contractorSigned: r.contractorSigned, stampAffixed: r.stampAffixed, witnessName: r.witnessName, witnessSigned: r.witnessSigned, receivedBy: "Daniel Anak Jelani" };
      const at = r.signedLetterReceivedOn ?? day("2026-09-24");
      entry("AwardReturn", r.id, `${a.reference} · return`, "UPDATE", at, awardAuditPair(blank, now));
      if (a.status === "ACCEPTED") entry("Award", a.id, label, "UPDATE", at, diffFields({ status: "ISSUED" }, { status: "ACCEPTED" }), "The acceptance page is complete.");
    }
    if (a.commencedOn) entry("Award", a.id, label, "UPDATE", a.commencedOn, diffFields({ commencedOn: null }, { commencedOn: a.commencedOn }));
    for (const s of c.securities) {
      const lbl = `${a.reference} · ${s.kind.toLowerCase().replace(/_/g, " ")}`;
      entry("SecurityInstrument", s.id, lbl, "CREATE", s.lodgedOn, awardAuditCreate({ ...s, status: "LODGED", verifiedOn: null, verifiedByPersonId: null, rejectedReason: "", requiredValue: null, basis: null, basisPercent: null, basisAmount: null, basisProvenance: null, requiredUntil: null }, { contract: c.number }));
      if (s.verifiedOn) entry("SecurityInstrument", s.id, lbl, "UPDATE", s.verifiedOn, diffFields({ status: "LODGED" }, { status: s.status, checkedBy: "Chen Wei Ling", checkedOn: s.verifiedOn, recordedOnBehalf: "not signed", requiredValue: s.requiredValue?.toString() }), s.rejectedReason);
    }
    for (const p of c.policies) {
      const lbl = `${a.reference} · ${p.kind.toLowerCase().replace(/_/g, " ")} policy`;
      entry("InsurancePolicy", p.id, lbl, "CREATE", p.lodgedOn, awardAuditCreate({ ...p, status: "LODGED", verifiedOn: null, verifiedByPersonId: null, requirementSnapshot: undefined }, { contract: c.number }));
      if (p.verifiedOn) entry("InsurancePolicy", p.id, lbl, "UPDATE", p.verifiedOn, diffFields({ status: "LODGED" }, { status: p.status, checkedBy: "Chen Wei Ling", checkedOn: p.verifiedOn, recordedOnBehalf: "not signed" }));
    }
  }
  const locks = [[10, "2026-09-22", "DEMO/AWD/0001/2026"], [11, "2026-09-09", "DEMO/AWD/0002/2026"], [12, "2026-09-09", "DEMO/AWD/0003/2026"], [13, "2026-09-09", "DEMO/AWD/0004/2026"], [14, "2026-09-09", "DEMO/AWD/0005/2026"]] as const;
  for (const [sx, on, ref] of locks) {
    const ex = EXERCISES.find((x) => x.n === sx)!;
    entries.push({ id: `${P}sx${sx}_lock`, organisationId, entity: "SourcingExercise", entityId: `${P}sx${sx}`, entityLabel: `${SX(sx)} · ${ex.title}`, action: "UPDATE", at: day(on), changes: diffFields({ classificationLockedAt: null }, { classificationLockedAt: day(on) }), reason: `Award ${ref} sent for approval.`, unattributed: true });
  }
  await db.auditEntry.createMany({ data: entries as never });
}

/**
 * The award's part of the wipe, run before exercises, requisitions, people and
 * templates go. Refuses (listing them) where awards that are not demo data hang off
 * demo rows, unless the dependents are to be removed too.
 *
 * Checked once, before anything is removed (the document store's plan needs the awards
 * it lists, and runs between this check and the awards' removal); `wipeAwards` carries
 * out this same check, never a second one.
 */
export type AwardWipeCheck = Awaited<ReturnType<typeof checkAwards>>;

/// `hangingExerciseIds`: exercises that are not demo data but are removed with it (opened
/// on a demo requisition, naming demo people): their awards go too, or the exercise's
/// removal would meet its award's key after the documents and awards had gone.
/// `screenMade` (carry D4): matters at sittings made through the screens on demo committees,
/// and delegations made through the screens naming demo people, both removed with the demo:
/// an award signed under such a delegation, or routed through a step citing either, goes too.
export async function checkAwards(db: Db, organisationId: string, removeDependents: boolean, hangingExerciseIds: readonly string[], screenMade: { decisionIds: readonly string[]; delegationIds: readonly string[] } = { decisionIds: [], delegationIds: [] }) {
  const demoRef = { startsWith: P };
  const hanging = await db.award.findMany({
    where: {
      organisationId,
      NOT: { id: demoRef },
      OR: [
        { exerciseId: demoRef },
        { exerciseId: { in: [...hangingExerciseIds] } },
        { signatoryPersonId: demoRef },
        { signatoryDelegationId: demoRef },
        { variantId: demoRef },
        { documents: { some: { templateId: demoRef } } },
        { conditions: { some: { kindId: demoRef } } },
        { contract: { OR: [{ securities: { some: { OR: [{ issuerId: demoRef }, { verifiedByPersonId: demoRef }] } } }, { policies: { some: { OR: [{ issuerId: demoRef }, { verifiedByPersonId: demoRef }] } } }] } },
        { awardReturn: { receivedByPersonId: demoRef } },
        // Close-out: a route snapshotted under a demo destination, a choice or a declaration naming a demo person.
        { approvalInstances: { some: { OR: [{ rejectionDestinationId: demoRef }, { rejectionChosenByPersonId: demoRef }, { steps: { some: { declaredByPersonId: demoRef } } }] } } },
        // Carry D4.
        { signatoryDelegationId: { in: [...screenMade.delegationIds] } },
        { approvalInstances: { some: { steps: { some: { OR: [{ committeeDecisionId: { in: [...screenMade.decisionIds] } }, { delegationId: { in: [...screenMade.delegationIds] } }] } } } } },
      ],
    },
    select: { id: true, reference: true, awardeeName: true },
    orderBy: { reference: "asc" },
  });
  const linked = await db.committeeDecision.findMany({ where: { NOT: [{ id: demoRef }, { id: { in: [...screenMade.decisionIds] } }], exerciseId: demoRef }, select: { id: true, subject: true, matterRef: true } });
  const refused = (hanging.length > 0 || linked.length > 0) && !removeDependents;
  return { refused, hanging, linked };
}

/// Print why the awards refuse the wipe, if they do.
export function reportAwardRefusal(check: AwardWipeCheck): boolean {
  if (!check.refused) return false;
  console.error(
    [
      "Refused: these records are not demo data, but point at demo records, so the demo cannot be removed under them:",
      ...check.hanging.map((a) => `  award ${a.reference} · ${a.awardeeName}`),
      ...check.linked.map((m) => `  committee matter ${m.matterRef ?? m.subject} (link to a demo exercise)`),
      "Nothing was removed. Deal with them first, or run the wipe again with --remove-dependents.",
    ].join("\n"),
  );
  return true;
}

export async function wipeAwards(db: Db, organisationId: string, check: AwardWipeCheck): Promise<void> {
  if (check.refused) throw new Error("wipeAwards called with a refused check");
  const demoRef = { startsWith: P };
  const { hanging, linked } = check;
  const awards = await db.award.findMany({
    where: { organisationId, OR: [{ id: demoRef }, { exerciseId: demoRef }, { id: { in: hanging.map((h) => h.id) } }] },
    select: { id: true, reference: true, documents: { select: { id: true } }, distributions: { select: { id: true } }, awardReturn: { select: { id: true } }, conditions: { select: { id: true } }, approvalInstances: { select: { id: true, steps: { select: { id: true } } } }, contract: { select: { id: true, securities: { select: { id: true } }, policies: { select: { id: true } }, ownershipEvents: { select: { id: true } } } } },
  });
  const ids = awards.map((a) => a.id);
  const entityIds = awards.flatMap((a) => [
    a.id, ...a.documents.map((x) => x.id), ...a.distributions.map((x) => x.id), ...(a.awardReturn ? [a.awardReturn.id] : []), ...a.conditions.map((x) => x.id),
    ...a.approvalInstances.flatMap((i) => [i.id, ...i.steps.map((s) => s.id)]),
    ...(a.contract ? [a.contract.id, ...a.contract.securities.map((x) => x.id), ...a.contract.policies.map((x) => x.id), ...a.contract.ownershipEvents.map((x) => x.id)] : []),
  ]);
  const byAward = { awardId: { in: ids } };
  // A successor route (a rejection returned to an earlier step) points at the route it continues.
  await db.approvalStep.updateMany({ where: { instance: byAward, NOT: { carriedFromStepId: null } }, data: { carriedFromStepId: null } });
  await db.approvalInstance.updateMany({ where: { ...byAward, NOT: { supersedesInstanceId: null } }, data: { supersedesInstanceId: null } });
  await db.approvalStep.deleteMany({ where: { instance: byAward } });
  await db.approvalInstance.deleteMany({ where: byAward });
  await db.securityInstrument.deleteMany({ where: { contract: byAward } });
  await db.insurancePolicy.deleteMany({ where: { contract: byAward } });
  await db.caseOwnershipEvent.deleteMany({ where: { contract: byAward } });
  await db.contract.deleteMany({ where: byAward });
  await db.awardDocument.deleteMany({ where: byAward });
  await db.awardDistribution.deleteMany({ where: byAward });
  await db.awardReturn.deleteMany({ where: byAward });
  await db.awardCondition.deleteMany({ where: byAward });
  await db.award.deleteMany({ where: { id: { in: ids } } });
  if (entityIds.length) await db.auditEntry.deleteMany({ where: { organisationId, entityId: { in: entityIds } } });
  if (awards.length) await db.auditEntry.deleteMany({ where: { organisationId, OR: awards.map((a) => ({ entityLabel: { startsWith: `${a.reference} ·` } })) } });
  if (linked.length) await db.committeeDecision.updateMany({ where: { id: { in: linked.map((m) => m.id) } }, data: { exerciseId: null } });
  if (hanging.length) console.log(`Removed ${hanging.length} award(s) that pointed at demo records, with their audit entries.`);

  // The award configuration the demo created.
  const demo = { id: demoRef };
  await db.awardPolicy.deleteMany({ where: demo });
  await db.appointmentLetterVariant.deleteMany({ where: demo });
  await db.distributionRecipient.deleteMany({ where: demo });
  await db.conditionPrecedentKind.deleteMany({ where: demo });
  await db.insuranceRequirement.deleteMany({ where: demo });
  await db.liabilityBand.deleteMany({ where: demo });
  await db.approvedIssuer.deleteMany({ where: demo });
  await db.committeeDecision.updateMany({ where: demo, data: { exerciseId: null } });
}
