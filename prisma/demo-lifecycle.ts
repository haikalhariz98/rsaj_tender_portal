/**
 * Part A's demo, as one contract's life (6.13 Part A step 5). Invented throughout, ASSUMED; no RSAJ figure, office,
 * form, clause or period (the variation bands, the committee, the clocks, the release share and every figure here
 * are invented, never a customer's).
 *
 * demo_con13 is a works contract past its date for completion, told from its requisition to its third interim
 * certificate:
 * - Before the contract (written as the award's own demo writes them, the acts of those modules not being the point
 *   here): requisition demo_rq41 approved on demo_ai131, exercise demo_sx22 determined by 6.3's own functions, the
 *   Tender Board's award at sitting demo_mt20 (matter demo_d60, its votes demo_vt60_*), appointment route demo_ai132,
 *   award demo_aw13 (numbered from the award series) issued and returned, its bond, guarantee and policies verified, contract
 *   demo_con13 numbered DEMO/KP/T/005/2026.
 * - From its formation on, every step is the product's own act (prisma/demo-acts.ts), called with the form its
 *   drawer posts at the instant the story says, each refusing as it would on the screen: formation, legal review,
 *   both signatures (the S.O. resolved by the employer's), stamping; possession, the programme, progress, the
 *   as-built records; the valuation calendar, the advance with its recoupment, interim certificates 1–3 each sent on
 *   its route, checked on its routing sheet, decided and signed; the warning letter, its posting, the Certificate of
 *   Non-Completion; the first release of retention; variation VO/1 through the Variation Orders Committee
 *   (demo_c8, sitting DEMO/VOC/1/2026) with its application, instruction, measured items and order; the exempt
 *   variation VO/2 against the provisional sum; the adjustment of the contract sum with a price fluctuation line;
 *   variation VO/3 commenced pending its approval, tabled at the committee's next sitting. On demo_con3, a variation
 *   waiting at a person's step on /approvals.
 * - Configuration (rows, by demo id): the committee and its office (demo_c8, demo_r14, demo_m70–72); the variation and
 *   adjustment rows on the demo matrix (demo_rule65–76, steps demo_st44–49; the non-completion sheet demo_vrt1, its checks demo_vrc1–2 and target demo_vtg1); six forms (demo_dt40–45, blocks demo_vsb*,
 *   recipients demo_vfd*) and their kind settings (demo_vks1–6); three clocks (demo_vck1–3); the variations' series
 *   (demo_n8) and valuation clause (demo_cl2); the works type's adjustment triggers; and on the demo's own post-award
 *   controls only (demo_wpa1): the percentage's basis and base, the schedule forms, the first release share.
 * - Ids the acts make carry the sub-prefixes in demo-acts.ts (demo_l*, demo_v*); everything above was grepped free in
 *   prisma/*.ts and every plan's claims; the wipe matches each exactly.
 */

import type { PrismaClient } from "../src/generated/prisma/client";

import { act, actRoute, claimNumbered } from "./demo-acts";
import { demoPdf, writeDemoDocs, type DemoDoc } from "./demo-documents";
import { DEMO_ACTOR } from "./demo-actor";
import { putSeries, raiseSeries } from "./demo-series";
import { demoOrgId, demoScope } from "./demo-org";

type Db = PrismaClient;
const P = "demo_";
const CON = `${P}con13`;
const AW = `${P}aw13`;
const SX = `${P}sx22`;
const RQ = `${P}rq41`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const people = {
  aisyah: { id: `${P}p1`, name: "Aisyah Rahman" },
  bala: { id: `${P}p2`, name: "Bala Krishnan" },
  chen: { id: `${P}p3`, name: "Chen Wei Ling" },
  daniel: { id: `${P}p4`, name: "Daniel Anak Jelani" },
  eng: { id: `${P}p5`, name: "Eng Siew Mei" },
  gopal: { id: `${P}p7`, name: "Gopal Nair" },
};
const AWARDEE = { name: "Syarikat Contoh Pembinaan Sdn Bhd", reg: "DEMO-0013-X", address: "13 Contoh Industrial Park, Demo North" };
const TITLE = "Raw water main renewal, Sungai Demo";
const REQ_REF = "DEMO/REQ/0043/2026";
const SX_REF = "DEMO/SX/0022/2026";
/// Numbered from the award series when the award is made (loadLifecycleAward), in the order the story makes it.
let AWD_REF = "";
const CON_NO = "DEMO/KP/T/005/2026";

// ------------------------------------------------------------------ configuration

const body = (title: string) => ["{{organisation.name}}", `${title} · {{certificate.number}}`, "Contract {{contract.number}} with {{contractor.name}} (demo text, invented).", "Dated {{certificate.date}}."].join("\n\n");

/// The committee, the matrix rows, the forms, the clocks, the series and the controls. After the payment demo's.
export async function configureLifecycleDemo(db: Db, organisationId: string) {
  const mx = `${P}mx1`;
  // The Variation Orders Committee: a recommending committee, its rules invented (ASSUMED).
  await db.authorityRole.create({ data: { id: `${P}r14`, organisationId, code: "VOC", nameEn: "Variation Orders Committee", nameMs: "Jawatankuasa Perubahan Kerja", isCommittee: true, workspace: "Internal", authorityLevel: "Committee", sortOrder: 14 } });
  await db.committee.create({
    data: {
      id: `${P}c8`, organisationId, code: "VOC", nameEn: "Variation Orders Committee", nameMs: "Jawatankuasa Perubahan Kerja", mandate: "Recommends variations in the tender regime before they are approved.", governingSource: "Demo constitution cl. 9",
      action: "RECOMMENDS", quorum: 2, quorumProvenance: "ASSUMED", compositionProvenance: "ASSUMED", votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED", secretariatRoleCode: "HOD_CP", notes: "Invented for the demo (quorum and voting rule ASSUMED).",
    },
  });
  const from = day("2024-01-01");
  await db.committeeMember.createMany({
    data: [
      { id: `${P}m70`, committeeId: `${P}c8`, seatRoleCode: "FD", position: "CHAIRMAN", provenance: "ASSUMED", effectiveFrom: from },
      { id: `${P}m71`, committeeId: `${P}c8`, personId: `${P}p7`, position: "MEMBER", provenance: "ASSUMED", effectiveFrom: from },
      { id: `${P}m72`, committeeId: `${P}c8`, personId: `${P}p3`, position: "SECRETARY", provenance: "ASSUMED", effectiveFrom: from },
    ],
  });

  // The variation and adjustment rows (invented bands; every edge follows the switch).
  const r = (n: number, x: { domain: string; ruleKey: string; labelEn: string; clause: string } & Record<string, unknown>) => ({ id: `${P}rule${n}`, authorityMatrixId: mx, followsBoundarySwitch: true, sortOrder: n, ...x });
  await db.authorityRule.createMany({
    data: [
      r(65, { domain: "vo", ruleKey: "demo.vo.tender.5", method: "tender", pctMax: "5", committeeCode: "VOC", committeeAct: "MR", approverCode: "HOD_CP", labelEn: "Variation, tender, up to 5% of the contract sum", clause: "DEMO 8.1(a)" }),
      r(66, { domain: "vo", ruleKey: "demo.vo.tender.10", method: "tender", pctMin: "5", pctMax: "10", committeeCode: "VOC", committeeAct: "MR", approverCode: "FD", labelEn: "Variation, tender, above 5% up to 10%", clause: "DEMO 8.1(b)" }),
      r(67, { domain: "vo", ruleKey: "demo.vo.tender.high", method: "tender", pctMin: "10", committeeCode: "VOC", committeeAct: "MR", approverCode: "CEO", labelEn: "Variation, tender, above 10%", clause: "DEMO 8.1(c)" }),
      r(68, { domain: "vo", ruleKey: "demo.vo.quotation.5", method: "quotation", pctMax: "5", approverCode: "HOD_CP", labelEn: "Variation, quotation, up to 5%", clause: "DEMO 8.2(a)" }),
      r(69, { domain: "vo", ruleKey: "demo.vo.quotation.high", method: "quotation", pctMin: "5", approverCode: "FD", labelEn: "Variation, quotation, above 5%", clause: "DEMO 8.2(b)" }),
      r(70, { domain: "vo_increase", ruleKey: "demo.vo.increase.tender", method: "tender", committeeCode: "VOC", committeeAct: "MR", approverCode: "FD", labelEn: "Increase of an approved variation, tender", clause: "DEMO 8.3(a)" }),
      r(71, { domain: "vo_increase", ruleKey: "demo.vo.increase.quotation", method: "quotation", approverCode: "FD", labelEn: "Increase of an approved variation, quotation", clause: "DEMO 8.3(b)" }),
      r(72, { domain: "vo_agreed_rate", ruleKey: "demo.vo.agreed_rate", approverCode: "FD", labelEn: "Rates not in the contract", clause: "DEMO 8.4" }),
      r(73, { domain: "remeasurement", ruleKey: "demo.remeasure.30", method: "tender", pctMax: "30", approverCode: "HOD_CP", labelEn: "Re-measurement of provisional quantities, up to 30%", clause: "DEMO 8.5(a)" }),
      r(74, { domain: "remeasurement", ruleKey: "demo.remeasure.high", method: "tender", pctMin: "30", committeeCode: "TENDER_BOARD", committeeAct: "A", approverCode: "TENDER_BOARD", nonDelegable: true, labelEn: "Re-measurement of provisional quantities, above 30%", clause: "DEMO 8.5(b)" }),
      r(75, { domain: "sum_adjustment", ruleKey: "demo.sum_adjustment", approverCode: "FD", labelEn: "Adjustment of the contract sum", clause: "DEMO 8.6" }),
      r(76, { domain: "non_completion", ruleKey: "demo.non_completion", approverCode: "CEO", labelEn: "Certificate of Non-Completion", clause: "DEMO 8.7" }),
    ],
  });
  // The committee's mandatory recommendation is a step beneath the approver (a committee's step, FR-VAR-010).
  await db.authorityRuleStep.createMany({
    data: [
      { id: `${P}st44`, authorityRuleId: `${P}rule75`, roleCode: "HOD_CP", act: "R", sequence: 1 },
      { id: `${P}st45`, authorityRuleId: `${P}rule65`, roleCode: "VOC", act: "MR", sequence: 1 },
      { id: `${P}st46`, authorityRuleId: `${P}rule66`, roleCode: "VOC", act: "MR", sequence: 1 },
      { id: `${P}st47`, authorityRuleId: `${P}rule67`, roleCode: "VOC", act: "MR", sequence: 1 },
      { id: `${P}st48`, authorityRuleId: `${P}rule70`, roleCode: "VOC", act: "MR", sequence: 1 },
      { id: `${P}st49`, authorityRuleId: `${P}rule76`, roleCode: "FD", act: "R", sequence: 1 },
    ],
  });

  // Six forms, each invented: bilingual names, an English body, blocks and recipients.
  const base = { organisationId, provenance: "ASSUMED" as const, documentClassId: `${P}dc2`, bodyVersion: 1, revisionDate: day("2025-06-01") };
  await db.documentTemplate.createMany({
    data: [
      { id: `${P}dt40`, ...base, code: "demo_lad_warning", nameEn: "Demo warning of liquidated damages", nameMs: "Amaran ganti rugi tertentu demo", formCode: "DEMO-V-01", bodyEn: body("Warning of the intention to impose liquidated damages"), sortOrder: 40 },
      { id: `${P}dt41`, ...base, code: "demo_non_completion", nameEn: "Demo certificate of non-completion", nameMs: "Perakuan kerja tidak siap demo", formCode: "DEMO-V-02", bodyEn: body("Certificate of Non-Completion"), sortOrder: 41 },
      { id: `${P}dt42`, ...base, code: "demo_variation_application", nameEn: "Demo variation application", nameMs: "Permohonan perubahan kerja demo", formCode: "DEMO-V-03", bodyEn: body("Application for a variation"), sortOrder: 42 },
      { id: `${P}dt43`, ...base, code: "demo_so_instruction", nameEn: "Demo S.O.'s instruction", nameMs: "Arahan P.P. demo", formCode: "DEMO-V-04", bodyEn: body("The S.O.'s instruction"), sortOrder: 43 },
      { id: `${P}dt44`, ...base, code: "demo_variation_order_certificate", nameEn: "Demo Variation Order Certificate", nameMs: "Perakuan perubahan kerja demo", formCode: "DEMO-V-05", bodyEn: body("Variation Order Certificate"), sortOrder: 44 },
      { id: `${P}dt45`, ...base, code: "demo_sum_adjustment", nameEn: "Demo adjustment of the contract sum", nameMs: "Pelarasan harga kontrak demo", formCode: "DEMO-V-06", bodyEn: body("Certificate of Adjustment of Contract Sum"), sortOrder: 45 },
    ],
  });
  type BlockIn = { blockOrder: number; blockKind: "RECOMMENDING" | "AUTHORISING" | "CONTRACTOR" | "WITNESS"; labelEn: string; labelMs: string; officeRule: "NAMED_OFFICE" | "SO" | "CONTRACTOR" | "WITNESS"; officeCode?: string | null; delegable: boolean; carriesDecision?: boolean; datesCertificate?: boolean; refusalAllowed?: boolean };
  let sb = 0;
  const block = (templateId: string, b: BlockIn) => ({ id: `${P}vsb${++sb}`, organisationId, templateId, provenance: "ASSUMED" as const, notes: "Invented for the demo.", officeCode: null, ...b });
  const so = (templateId: string, order = 1) => block(templateId, { blockOrder: order, blockKind: "AUTHORISING", labelEn: "Superintending Officer", labelMs: "Pegawai Penguasa", officeRule: "SO", delegable: false, datesCertificate: true });
  const recommended = (templateId: string) => block(templateId, { blockOrder: 1, blockKind: "RECOMMENDING", labelEn: "Recommended by", labelMs: "Disyorkan oleh", officeRule: "NAMED_OFFICE", officeCode: "HOD_CP", delegable: true, carriesDecision: true });
  const contractor = (templateId: string, order: number) => block(templateId, { blockOrder: order, blockKind: "CONTRACTOR", labelEn: "Received by the contractor", labelMs: "Diterima oleh kontraktor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true });
  await db.formSignatureBlock.createMany({
    data: [
      so(`${P}dt40`), so(`${P}dt41`), so(`${P}dt42`), so(`${P}dt43`),
      recommended(`${P}dt44`), so(`${P}dt44`, 2), contractor(`${P}dt44`, 3),
      recommended(`${P}dt45`), so(`${P}dt45`, 2), contractor(`${P}dt45`, 3),
    ],
  });
  let fd = 0;
  const rows = (templateId: string) => [
    { id: `${P}vfd${++fd}`, organisationId, templateId, recipientCode: "demo_contractor", labelEn: "The contractor (original)", labelMs: "Kontraktor (asal)", mandatory: true, ackRequired: true, condition: "NONE" as const, isOriginal: true, sortOrder: 1, provenance: "ASSUMED" as const, notes: "Invented for the demo." },
    { id: `${P}vfd${++fd}`, organisationId, templateId, recipientCode: "demo_file", labelEn: "Contract file (demo)", labelMs: "Fail kontrak (demo)", mandatory: true, ackRequired: false, condition: "NONE" as const, isOriginal: false, sortOrder: 2, provenance: "ASSUMED" as const, notes: "Invented for the demo." },
  ];
  await db.formDistribution.createMany({ data: [`${P}dt40`, `${P}dt41`, `${P}dt42`, `${P}dt43`, `${P}dt44`, `${P}dt45`].flatMap(rows) });
  // The Certificate of Non-Completion's routing sheet (its review chain is enforced on the sheet): two checks, 14 days.
  await db.routingSheetType.create({ data: { id: `${P}vrt1`, organisationId, code: "demo_non_completion_sheet", labelEn: "Demo non-completion routing sheet", labelMs: "Helaian penghalaan perakuan kerja tidak siap demo", subject: "CERTIFICATE", certificateKind: "NON_COMPLETION", templateId: null, upperEdgeInclusive: null, provenance: "ASSUMED", notes: "Invented: 14 days.", sortOrder: 4 } });
  await db.routingCheckDef.createMany({
    data: [
      { id: `${P}vrc1`, organisationId, typeId: `${P}vrt1`, order: 1, kind: "ENDORSED", labelEn: "Endorsed by the section", labelMs: "Disahkan oleh seksyen", officeCode: "SEC_PRE", targetDays: null },
      { id: `${P}vrc2`, organisationId, typeId: `${P}vrt1`, order: 2, kind: "CHECKED", labelEn: "Checked by contracts", labelMs: "Disemak oleh kontrak", officeCode: "HOD_CP", targetDays: null },
    ],
  });
  await db.routingTarget.create({ data: { id: `${P}vtg1`, organisationId, typeId: `${P}vrt1`, targetDays: 14, provenance: "ASSUMED", notes: "Invented." } });
  const ks = (n: number, kind: string, templateId: string, routingTypeId: string | null = null) => ({ id: `${P}vks${n}`, organisationId, kind: kind as never, templateId, routingTypeId, provenance: "ASSUMED" as const, notes: "Invented for the demo." });
  await db.certificateKindSetting.createMany({
    data: [ks(1, "LAD_WARNING", `${P}dt40`), ks(2, "NON_COMPLETION", `${P}dt41`, `${P}vrt1`), ks(3, "VARIATION_APPLICATION", `${P}dt42`), ks(4, "SO_INSTRUCTION", `${P}dt43`), ks(5, "VARIATION", `${P}dt44`), ks(6, "SUM_ADJUSTMENT", `${P}dt45`)],
  });
  await db.contractClockRule.createMany({
    data: [
      { id: `${P}vck1`, organisationId, clock: "ORAL_CONFIRM", length: 7, unit: "DAYS", provenance: "ASSUMED", notes: "Invented for the demo." },
      { id: `${P}vck2`, organisationId, clock: "ORAL_OBJECTION", length: 7, unit: "DAYS", provenance: "ASSUMED", notes: "Invented for the demo." },
      { id: `${P}vck3`, organisationId, clock: "DAYWORK_SUBSTANTIATION", length: 7, unit: "DAYS", provenance: "ASSUMED", notes: "Invented for the demo." },
    ],
  });
  await putSeries(db, { id: `${P}n8`, organisationId, key: "variation", nameEn: "Variations", pattern: "DEMO/VO/{SERIAL}/{YEAR}", padding: 3, resetOn: "CALENDAR_YEAR", nextSerial: 1, serialPeriod: "2026", provenance: "ASSUMED" });
  await db.clauseText.create({ data: { id: `${P}cl2`, organisationId, code: "demo_valuation_of_variations", titleEn: "Valuation of variations (demo)", titleMs: "Penilaian perubahan kerja (demo)", bodyEn: "Variations are valued at the contract's rates where they apply, at rates derived from them where they do not, and otherwise at fair rates (invented demo text).", provenance: "ASSUMED", sortOrder: 2,
    // Ruling 4 (2026-10-06): set, or no pack could be submitted after this loads (a live clause's "mandatory" unset refuses every submission). ASSUMED.
    mandatoryInAgreements: false, notes: "Invented for the demo: not every agreement need carry it." } });
  // The works type provides for these adjustments (invented, ASSUMED on the demo's own type row).
  await db.contractType.update({ where: { id: `${P}ct1` }, data: { sumAdjustmentTriggers: ["VARIATION", "PC_AND_PROVISIONAL_SUMS", "PRICE_FLUCTUATION", "REMEASUREMENT"] } });
  await db.contractType.update({ where: { id: `${P}ct3` }, data: { sumAdjustmentTriggers: ["VARIATION"] } });
  // Only the demo's own controls row (OD-A2: the demo reads this variation over the original sum, ASSUMED).
  await db.postAwardPolicy.updateMany({
    where: { id: `${P}wpa1`, organisationId },
    data: { variationPctBasis: "THIS_VARIATION", variationBase: "ORIGINAL", variationProvenance: "ASSUMED", scheduleFormAgreedRate: "BOTH", scheduleFormNoAgreedRate: "MEASURED", scheduleFormProvenance: "ASSUMED", firstReleasePct: "50", firstReleaseProvenance: "ASSUMED" },
  });
}

// ------------------------------------------------------------------ before the contract (rows, as 6.1–6.11's demos write them)

/// The requisition and the exercise, before the exercises are determined (by 6.3's own functions, in demo.ts).
export async function loadLifecycleSetup(db: Db, organisationId: string): Promise<string[]> {
  const value = "520000.00";
  // Its own capital code, so the other demos' budget room is untouched.
  await db.budgetCode.create({ data: { id: `${P}bcode20`, organisationId, code: "CAP26-061", descriptionEn: "Raw water main renewal", type: "Capital", owningUnitCode: "NTH", accountCode: "7400400", holderPersonId: `${P}p9`, effectiveFrom: day("2026-01-01"), effectiveTo: day("2027-01-01") } });
  await db.budgetMovement.create({ data: { id: `${P}bm71`, budgetCodeId: `${P}bcode20`, kind: "ORIGINAL", amount: "600000.00", occurredOn: day("2026-01-01"), reference: "BR26-061" } });
  await db.requisition.create({
    data: {
      id: RQ, organisationId, reference: REQ_REF, origin: "PORTAL", erpRequisitionNo: "XR2026000413", erpNoteNo: "RN/2026/0413", erpRefSource: "MANUAL", erpRefRecordedAt: day("2026-04-06"),
      requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, title: TITLE, justification: "The raw water main between the intake and the treatment works bursts repeatedly.", needStatement: "Renew 1.9 km of the raw water main.",
      costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode20`, siteCode: "NTH-WKS", placeOfDelivery: "Sungai Demo intake", dateRequired: day("2026-12-31"),
      estimatedValue: value, raisedOn: day("2026-04-06"), fundingRouteCode: "capex", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES",
      status: "SOURCING", commitmentMovementId: `${P}bm70`, createdAt: day("2026-04-06"),
      lines: { create: [{ id: `${RQ}l1`, lineNo: 1, description: TITLE, estimatedAmount: value }] },
    },
  });
  await db.requisitionEndorsement.createMany({
    data: [
      { id: `${P}en41a`, requisitionId: RQ, tier: "SECTION", unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: day("2026-04-07") },
      { id: `${P}en41b`, requisitionId: RQ, tier: "DEPARTMENT", unitCode: "NTH", personId: `${P}p9`, endorsedOn: day("2026-04-07") },
    ],
  });
  await db.requisitionBudgetCheck.create({ data: { id: `${P}bk41`, requisitionId: RQ, checkedAt: day("2026-04-08"), asAt: day("2026-04-08"), source: "PORTAL_LEDGER", budgetCodeId: `${P}bcode20`, budgetCodeCode: "CAP26-061", requestedAmount: value, actualBudget: "600000.00", balanceAsAt: "600000.00", approvedAccount: "0.00", approvedAccountProvenance: "ASSUMED", projectedBalance: "80000.00", verdict: "WITHIN" } });
  await db.requisitionSplitCheck.create({ data: { id: `${P}sp41`, requisitionId: RQ, checkedAt: day("2026-04-08"), state: "CLEAR", windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, policyProvenance: "ASSUMED", relatedRequisitionIds: [], relatedReferences: [] } });
  await db.budgetMovement.create({ data: { id: `${P}bm70`, budgetCodeId: `${P}bcode20`, kind: "COMMITMENT", amount: value, occurredOn: day("2026-04-16"), reference: REQ_REF, description: TITLE } });
  const chain = [["DEPT_HEAD", "Head of Department", "P", "p9", "Imran Hakim", "2026-04-09"], ["DIV_HEAD", "Head of Division", "R", "p7", "Gopal Nair", "2026-04-10"], ["FD", "Finance Director", "MR", "p2", "Bala Krishnan", "2026-04-14"], ["CEO", "Chief Executive", "A", "p1", "Aisyah Rahman", "2026-04-16"]] as const;
  await db.approvalInstance.create({
    data: {
      id: `${P}ai131`, organisationId, matterKind: "REQUISITION", requisitionId: RQ, domain: "requisition", value,
      authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: "demo.requisition.4", ruleLabel: "Requisition, above RM250,000", ruleClause: "DEMO 3.1(d)",
      boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null, fundingRouteCode: "capex",
      budgetCheckId: `${P}bk41`, budgetVerdict: "WITHIN", availabilityCheck: "blocking", splitCheckId: `${P}sp41`, splitState: "CLEAR",
      checkedAgainstMatrix: true, status: "APPROVED", openedAt: day("2026-04-08"), closedAt: day("2026-04-16"), createdAt: day("2026-04-08"), commitOnApproval: true, routeCommitsBudget: true,
      steps: { create: chain.map(([roleCode, roleLabel, a, pid, name, on], i) => ({ id: `${P}as131_${i + 1}`, sequence: i + 1, roleCode, roleLabel, act: a, nonDelegable: a === "MR", sourceRuleKey: "demo.requisition.4", decision: "DONE", decidedByPersonId: `${P}${pid}`, decidedByName: name, decidedOn: day(on), recordedAt: day(on) })) },
    },
  });
  await db.sourcingExercise.create({ data: { id: SX, organisationId, specPanelUsed: true, onScreenBillUsed: true, saleMode: "COUNTER", submissionChannel: "PAPER", reference: SX_REF, requisitionId: RQ, title: TITLE, estimatedValue: value, sourcingMethodCode: "open_tender", status: "DOCUMENTS_IN_PREPARATION", contractBasisCode: "bq", createdAt: day("2026-04-20") } });
  await db.exerciseScopePart.create({ data: { id: `${SX}p1`, exerciseId: SX, deliverableKind: "MEASURED_CONSTRUCTION", amount: value, description: TITLE, sortOrder: 1 } });
  // The series move past what the demo took (never back).
  for (const [id, next] of [[`${P}n1`, 44], [`${P}n5`, 23], [`${P}n2`, 6]] as const) await raiseSeries(db, id, next);

  // Its trail, in the requisition actions' shape.
  const { diffFields } = await import("../src/lib/audit/diff");
  const { ACT_LABEL } = await import("../src/lib/labels");
  const { TIER_LABEL } = await import("../src/lib/requisition/labels");
  const label = `${REQ_REF} · ${TITLE}`;
  const route = `${REQ_REF} · approval route`;
  let n = 0;
  const entries: object[] = [];
  const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", on: string, changes: object[], reason = "") => entries.push({ id: `${RQ}_au${++n}`, organisationId, entity, entityId, entityLabel, action, at: day(on), changes, reason, ...DEMO_ACTOR });
  entry("Requisition", RQ, label, "CREATE", "2026-04-06", diffFields(null, { reference: REQ_REF, title: TITLE, requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", estimatedValue: value, fundingRouteCode: "capex", lines: 1, status: "DRAFT" }));
  entry("RequisitionEndorsement", `${P}en41a`, `${REQ_REF} · ${TIER_LABEL.SECTION}`, "CREATE", "2026-04-07", diffFields(null, { tier: "SECTION", unit: "Maintenance Section", person: "Lim Kok Seng", endorsedOn: day("2026-04-07") }));
  entry("RequisitionEndorsement", `${P}en41b`, `${REQ_REF} · ${TIER_LABEL.DEPARTMENT}`, "CREATE", "2026-04-07", diffFields(null, { tier: "DEPARTMENT", unit: "Northern Region", person: "Imran Hakim", endorsedOn: day("2026-04-07") }));
  entry("Requisition", RQ, label, "UPDATE", "2026-04-07", diffFields({ status: "DRAFT" }, { status: "ENDORSED" }));
  entry("RequisitionBudgetCheck", `${P}bk41`, `${REQ_REF} · budget check`, "CREATE", "2026-04-08", diffFields(null, { source: "PORTAL_LEDGER", asAt: day("2026-04-08"), budgetCode: "CAP26-061", verdict: "WITHIN", requestedAmount: value }));
  entry("ApprovalInstance", `${P}ai131`, route, "CREATE", "2026-04-08", diffFields(null, { matrix: "Demo limits, issue 1", rule: "Requisition, above RM250,000", route: chain.map(([, roleLabel, a]) => `${roleLabel} (${ACT_LABEL[a]?.toLowerCase() ?? "acts"})`).join(" → "), overBudget: false, fundingOverrideApplied: false, splitState: "CLEAR" }));
  entry("Requisition", RQ, label, "UPDATE", "2026-04-08", diffFields({ status: "ENDORSED" }, { status: "PENDING_APPROVAL", sourcingPermitted: true, fundingPosture: "PROCURES" }));
  chain.forEach(([, roleLabel, , , name, on], i) => entry("ApprovalStep", `${P}as131_${i + 1}`, `${REQ_REF} · ${roleLabel}`, "UPDATE", on, diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: name, decidedOn: day(on), recordedOnBehalf: "not signed" })));
  entry("BudgetMovement", `${P}bm70`, `CAP26-061 · commitment for ${REQ_REF}`, "CREATE", "2026-04-16", diffFields(null, { kind: "COMMITMENT", budgetCode: "CAP26-061", reference: REQ_REF, committedEstimate: value, occurredOn: day("2026-04-16") }));
  entry("ApprovalInstance", `${P}ai131`, route, "UPDATE", "2026-04-16", diffFields({ status: "PENDING" }, { status: "APPROVED", commitment: "written" }));
  entry("Requisition", RQ, label, "UPDATE", "2026-04-16", diffFields({ status: "PENDING_APPROVAL" }, { status: "APPROVED" }));
  entry("Requisition", RQ, label, "UPDATE", "2026-04-21", diffFields({ status: "APPROVED" }, { status: "SOURCING" }), `Exercise ${SX_REF} moved into preparation.`);
  await db.auditEntry.createMany({ data: entries as never });
  return [SX];
}

/// The day the exercise moved into preparation (demo.ts's determination dates it).
export const LIFECYCLE_PREPARED: Readonly<Record<string, string>> = { [SX]: "2026-04-21" };

/// The Tender Board's award, the award issued and returned, its securities, and the contract numbered. After 6.11's awards.
export async function loadLifecycleAward(db: Db, organisationId: string): Promise<string[]> {
  const { diffFields } = await import("../src/lib/audit/diff");
  const { awardAuditCreate } = await import("../src/lib/award/audit-view");
  const { policyLabel, securityLabel } = await import("../src/lib/audit/entity-labels");
  const { renderedText } = await import("../src/lib/award/merge");
  const { evaluateAward } = await import("../src/lib/award/evaluate");
  const { awardFacts, loadAward } = await import("../src/lib/award/repo");
  const value = "480000.00";

  // The Tender Board's sitting, minuted (its register frozen and its trail written by demo.ts, as for 6.11's).
  await db.meeting.create({ data: { id: `${P}mt20`, committeeId: `${P}c1`, reference: "DEMO/SIT/1/2026", meetingDate: day("2026-05-14"), status: "MINUTED", minutedAt: day("2026-05-15"), agenda: "One award in the tender band.", minutes: "The Board met with three voting members present and carried the award of the raw water main renewal." } });
  await db.meetingAttendance.createMany({ data: ["p1", "p2", "p3", "p7"].map((p, i) => ({ id: `${P}at60_${i + 1}`, meetingId: `${P}mt20`, personId: `${P}${p}`, attended: true })) });
  await db.committeeDecision.create({
    data: { id: `${P}d60`, meetingId: `${P}mt20`, sequence: 1, domain: "appointment", subject: `Award of the ${TITLE.toLowerCase()}`, matterKind: "EXERCISE", matterRef: SX_REF, exerciseId: SX, amount: "480000", act: "A", tabledByPersonId: `${P}p3`, tabledAt: day("2026-05-11"), outcome: "CARRIED", decisionDate: day("2026-05-14"), quorumRequired: 3, presentVoters: 3, recusedCount: 0, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED" },
  });
  await db.vote.createMany({ data: ["p1", "p2", "p7"].map((p, i) => ({ id: `${P}vt60_${i + 1}`, decisionId: `${P}d60`, personId: `${P}${p}`, choice: "SETUJU" as const, votedAt: day("2026-05-14"), recordedAt: day("2026-05-14") })) });
  claimNumbered("Meeting", 20);
  claimNumbered("CommitteeDecision", 60);

  // The award's reference from the award series, as the award is made (never typed): the register stays continuous.
  const { issueReference } = await import("../src/lib/numbering/issue");
  AWD_REF = await db.$transaction((tx) => issueReference(tx as never, organisationId, "award", day("2026-05-08")));
  await db.award.create({
    data: {
      id: AW, organisationId, reference: AWD_REF, exerciseId: SX, status: "APPROVED", instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: AWARDEE.name, awardeeRegistrationNo: AWARDEE.reg, awardeeAddress: AWARDEE.address,
      awardedValue: value, completionPeriod: 10, completionUnit: "WEEKS", startDate: day("2026-06-22"), regulatedActivity: false,
      bondRequired: true, bondBasis: "CONTRACT_PRICE", bondPercent: "5", bondValidityExtraMonths: 12, bondBasisProvenance: "ASSUMED",
      ladAmount: "300", ladUnit: "per day", retentionPercent: "5", retentionCapPercent: "5", dlpMonths: 12, termsProvenance: "ASSUMED", wcBasis: "PERCENT_OF_CONTRACT",
      worksSumInsured: "480000.00", liabilitySumInsured: "80000.00", wcSumInsured: "48000.00", createdAt: day("2026-05-08"),
    },
  });
  await db.sourcingExercise.update({ where: { id: SX }, data: { classificationLockedAt: new Date("2026-05-11T02:00:00Z") } });
  await db.approvalInstance.create({
    data: {
      id: `${P}ai132`, organisationId, matterKind: "EXERCISE", exerciseId: SX, awardId: AW, domain: "appointment", value,
      authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: "demo.tender", ruleLabel: "Tender, above RM300,000", ruleClause: "DEMO 4.2", boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: true,
      boundaryOperator: "GT", fundingRouteCode: "capex", checkedAgainstMatrix: true, status: "APPROVED", openedAt: day("2026-05-11"), closedAt: day("2026-05-14"), createdAt: day("2026-05-11"),
      steps: { create: [{ id: `${P}as132_1`, sequence: 1, roleCode: "TENDER_BOARD", roleLabel: "Tender Board", act: "A", committeeCode: "TENDER_BOARD", nonDelegable: true, sourceRuleKey: "demo.tender", decision: "DONE", decidedByName: "Tender Board", decidedOn: day("2026-05-14"), committeeDecisionId: `${P}d60`, recordedAt: day("2026-05-14") }] },
    },
  });
  claimNumbered("ApprovalInstance", 132);

  // Who signs, as the issue resolves it (the award's own evaluation), then issued on 18 May.
  const issuedOn = "2026-05-18";
  const pre = await evaluateAward((await awardFacts((await loadAward(await demoOrgId(), AW))!)).facts, { contractNumber: CON_NO, issueDate: issuedOn, signatoryName: people.gopal.name });
  const sig = pre.signatory;
  if (!sig?.ok || sig.roleCode !== "DIV_HEAD") throw new Error(`demo aw13: the Letter of Acceptance's signatory did not resolve to the Head of Division (${JSON.stringify(sig)})`);
  await db.award.update({ where: { id: AW }, data: { status: "ISSUED", signatoryRoleCode: sig.roleCode, signatoryRoleLabel: sig.roleLabel, signatoryRuleKey: sig.ruleKey, signatoryRuleLabel: sig.ruleLabel, signatoryPersonId: people.gopal.id, signatoryName: people.gopal.name, signedOn: day(issuedOn), issuedAt: day(issuedOn) } });
  await db.contract.create({ data: { id: CON, organisationId, number: CON_NO, numberSource: "SERIES", seriesKey: "contract", numberedOn: day(issuedOn), awardId: AW, contractSum: value, createdAt: day(issuedOn) } });
  await db.caseOwnershipEvent.create({ data: { id: `${P}ce13`, contractId: CON, fromUnitCode: "CP-PRE", toUnitCode: "CP-POST", on: day(issuedOn) } });
  await db.awardDistribution.createMany({
    data: [
      { id: `${P}ad13_0`, awardId: AW, recipientId: null, recipientName: AWARDEE.name, mandatory: true, isAwardee: true, sortOrder: 0, method: "REGISTERED_POST", despatchedOn: day(issuedOn), acknowledgedOn: day("2026-05-20"), consignmentRef: "RR000000013DM" },
      { id: `${P}ad13_1`, awardId: AW, recipientId: `${P}dr1`, recipientName: "Implementing department", mandatory: true, isAwardee: false, sortOrder: 1, method: "BY_HAND", despatchedOn: day(issuedOn), acknowledgedOn: day(issuedOn) },
      { id: `${P}ad13_2`, awardId: AW, recipientId: `${P}dr2`, recipientName: "Finance department", mandatory: true, isAwardee: false, sortOrder: 2, method: "BY_HAND", despatchedOn: day(issuedOn), acknowledgedOn: day("2026-05-19") },
      { id: `${P}ad13_3`, awardId: AW, recipientId: `${P}dr3`, recipientName: "Construction industry board", mandatory: true, isAwardee: false, sortOrder: 3, method: "REGISTERED_POST", despatchedOn: day("2026-05-19"), consignmentRef: "RR000000014DM" },
      { id: `${P}ad13_4`, awardId: AW, recipientId: `${P}dr4`, recipientName: "Tax office", mandatory: true, isAwardee: false, sortOrder: 4, method: "REGISTERED_POST", despatchedOn: day("2026-05-19"), consignmentRef: "RR000000015DM" },
    ],
  });
  await db.awardReturn.create({ data: { id: `${P}ar13`, awardId: AW, signedLetterReceivedOn: day("2026-05-22"), declarationReceivedOn: day("2026-05-22"), authorisationReceivedOn: day("2026-05-22"), receivedByPersonId: `${P}p4`, whereHeld: "Contract & Procurement strongroom" } });
  // The return's scans, each bound to its item (NFR-SIG-002).
  const scans: DemoDoc[] = (["SIGNED_LETTER", "DECLARATION", "AUTHORISATION"] as const).map((purpose, i) => ({
    id: `${P}ldocr${i + 1}`, title: `${["Signed Letter of Acceptance", "Successful bidder's declaration", "Letter of authorisation"][i]}, ${AWD_REF}`, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL", createdAt: "2026-05-22T03:00",
    versions: [{ id: `${P}ldocr${i + 1}v1`, n: 1, bytes: demoPdf([`Return scan (demo): ${purpose.toLowerCase().replace(/_/g, " ")}`, AWD_REF, AWARDEE.name]), mediaType: "application/pdf", filename: `return-${i + 1}.pdf`, receivedOn: "2026-05-22", storedAt: "2026-05-22T03:00" }],
    attachments: [{ id: `${P}ldocr${i + 1}a1`, purpose, owner: { awardId: AW }, ownerLabel: AWD_REF, versionId: `${P}ldocr${i + 1}v1`, at: "2026-05-22T03:05" }],
  }));
  await (await writeDemoDocs(db, organisationId, scans, `${P}ldocrau`, people.daniel)).flush();
  // The bond, the advance payment guarantee and the three policies, lodged and verified.
  await db.securityInstrument.createMany({
    data: [
      { id: `${P}sec13`, contractId: CON, kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", issuerId: `${P}iss1`, issuerNameAsWritten: "Demo Bank Berhad", instrumentRef: "DBB/BG/2026/0513", value: "24000.00", effectiveFrom: day("2026-05-25"), expiresOn: day("2027-12-31"), status: "VERIFIED", lodgedOn: day("2026-05-26"), verifiedOn: day("2026-05-27"), verifiedByPersonId: `${P}p3`, requiredValue: "24000.00", basis: "CONTRACT_PRICE", basisPercent: "5", basisProvenance: "ASSUMED", requiredUntil: day("2027-11-30"), createdAt: day("2026-05-26") },
      { id: `${P}sec14`, contractId: CON, kind: "ADVANCE_PAYMENT_GUARANTEE", form: "BANK_GUARANTEE", issuerId: `${P}iss2`, issuerNameAsWritten: "Contoh Bank Berhad", instrumentRef: "CBB/APG/2026/0621", value: "48000.00", effectiveFrom: day("2026-06-20"), expiresOn: day("2027-06-30"), status: "VERIFIED", lodgedOn: day("2026-06-22"), verifiedOn: day("2026-06-23"), verifiedByPersonId: `${P}p3`, createdAt: day("2026-06-22") },
    ],
  });
  const req = (name: string, percent: string | null) => ({ name, tailMonths: 3, tailDays: 14, percent, dlpMonths: 12, wcBasis: "PERCENT_OF_CONTRACT" });
  await db.insurancePolicy.createMany({
    data: [
      { id: `${P}ins13`, contractId: CON, kind: "WORKS", issuerId: `${P}iss3`, issuerNameAsWritten: "Sampel Insurance Berhad", policyNo: "SIB/CAR/2026/513", sumInsured: "480000.00", periodStart: day("2026-06-01"), periodEnd: day("2027-12-31"), premiumReceiptRef: "SIB/R/90513", status: "VERIFIED", lodgedOn: day("2026-05-26"), verifiedOn: day("2026-05-27"), verifiedByPersonId: `${P}p3`, requirementSnapshot: req("Works insurance", null), createdAt: day("2026-05-26") },
      { id: `${P}ins14`, contractId: CON, kind: "PUBLIC_LIABILITY", issuerId: `${P}iss3`, issuerNameAsWritten: "Sampel Insurance Berhad", policyNo: "SIB/PL/2026/514", sumInsured: "80000.00", periodStart: day("2026-06-01"), periodEnd: day("2027-12-31"), premiumReceiptRef: "SIB/R/90514", status: "VERIFIED", lodgedOn: day("2026-05-26"), verifiedOn: day("2026-05-27"), verifiedByPersonId: `${P}p3`, requirementSnapshot: req("Public liability", null), createdAt: day("2026-05-26") },
      { id: `${P}ins15`, contractId: CON, kind: "WORKMENS_COMPENSATION", issuerId: `${P}iss3`, issuerNameAsWritten: "Sampel Insurance Berhad", policyNo: "SIB/WC/2026/515", sumInsured: "48000.00", periodStart: day("2026-06-01"), periodEnd: day("2027-12-31"), perkesoRegistrationNo: "DEMO-SOCSO-0013", premiumReceiptRef: "SIB/R/90515", status: "VERIFIED", lodgedOn: day("2026-05-26"), verifiedOn: day("2026-05-27"), verifiedByPersonId: `${P}p3`, requirementSnapshot: req("Workmen's compensation", "10"), createdAt: day("2026-05-26") },
    ],
  });

  // The issued documents, frozen by the function the issue uses.
  const l = (await loadAward(await demoOrgId(), AW))!;
  const f = await awardFacts(l);
  const ev = evaluateAward(f.facts, { contractNumber: CON_NO, issueDate: issuedOn, signatoryName: people.gopal.name });
  let k = 0;
  for (const d of ev.documents) {
    if (d.state !== "OK" || !d.rendered || d.missing.length || d.unknown.length) throw new Error(`Demo award 13: ${d.kind} would not issue (${d.state}; missing ${d.missing.join(", ")}).`);
    const t = d.template!;
    await db.awardDocument.create({ data: { id: `${P}adoc13_${++k}`, awardId: AW, kind: d.kind, templateId: t.id, templateCode: t.code, templateName: t.nameEn, templateFormCode: t.formCode, templateRevisionDate: t.revisionDate, templateBodyVersion: t.bodyVersion, language: d.language!, version: 1, fields: d.fields, renderedText: renderedText(d.rendered), frozenAt: new Date(`${issuedOn}T02:00:00.000Z`) } });
  }
  await db.award.update({
    where: { id: AW },
    data: {
      issueSnapshot: {
        v: 1, issuedOn, instrument: l.award.instrumentKind, regime: l.ex.regime, boundaryOperator: l.ex.boundaryOperator,
        policy: { ...f.config.policy, id: undefined, notes: undefined },
        signatory: ev.signatory?.ok ? { rule: ev.signatory.ruleLabel, clause: ev.signatory.clause, office: ev.signatory.roleLabel, recommenders: ev.signatory.recommenders.map((x) => x.roleLabel), delegable: ev.signatory.delegable } : null,
        variant: null, terms: f.facts.exercise.terms, contractNumber: { number: CON_NO, source: "SERIES", yearReading: "ASSUMED" },
        recipients: l.award.distributions.map((x) => x.recipientName),
      } as object,
    },
  });

  // The award's trail, in the award actions' shape.
  const a = (await db.award.findUniqueOrThrow({ where: { id: AW }, include: { distributions: true, awardReturn: true, documents: true, contract: { include: { securities: true, policies: true } } } }))!;
  const entries: object[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", when: Date | string, changes: object[], reason = "") => entries.push({ id: `${AW}_au${++n}`, organisationId, entity, entityId, entityLabel, action, at: typeof when === "string" ? day(when) : when, changes, reason, ...DEMO_ACTOR });
  const label = `${AWD_REF} · ${AWARDEE.name}`;
  entry("Award", AW, label, "CREATE", "2026-05-08", awardAuditCreate({ ...a, status: "DRAFT", signatoryRoleCode: null, signatoryRoleLabel: null, signatoryRuleKey: null, signatoryRuleLabel: null, signatoryPersonId: null, signatoryName: null, signedOn: null, issuedAt: null }, { exercise: SX_REF, instrument: a.instrumentKind }));
  entry("ApprovalInstance", `${P}ai132`, `${AWD_REF} · appointment route`, "CREATE", "2026-05-11", diffFields(null, { matrix: "Demo limits, issue 1", rule: "Tender, above RM300,000", route: "Tender Board (approves)", fundingOverrideApplied: false, escalated: null }));
  entry("Award", AW, label, "UPDATE", "2026-05-11", diffFields({ status: "DRAFT" }, { status: "PENDING_APPROVAL" }));
  entry("ApprovalStep", `${P}as132_1`, `${AWD_REF} · Tender Board`, "UPDATE", "2026-05-14", diffFields({ decision: "PENDING" }, { decision: "DONE", committee: "Tender Board", sitting: "DEMO/SIT/1/2026", decidedOn: day("2026-05-14"), minuted: "yes" }));
  entry("ApprovalInstance", `${P}ai132`, `${AWD_REF} · appointment route`, "UPDATE", "2026-05-14", diffFields({ status: "PENDING" }, { status: "APPROVED" }));
  entry("Award", AW, label, "UPDATE", "2026-05-14", diffFields({ status: "PENDING_APPROVAL" }, { status: "APPROVED" }));
  entry("Contract", CON, `${AWD_REF} · contract ${CON_NO}`, "CREATE", issuedOn, diffFields(null, { number: CON_NO, numberSource: "SERIES", numberedOn: day(issuedOn), contractSum: value, yearReading: "issue date, assumed" }));
  entry("CaseOwnershipEvent", `${P}ce13`, `${AWD_REF} · case handed over`, "CREATE", issuedOn, diffFields(null, { from: "Pre-contract Section", to: "Post-contract Section", on: day(issuedOn) }));
  for (const d of a.distributions) entry("AwardDistribution", d.id, `${AWD_REF} · copy to ${d.recipientName}`, "CREATE", issuedOn, diffFields(null, { recipient: d.recipientName, mandatory: d.mandatory, awardee: d.isAwardee }));
  for (const d of a.documents) entry("AwardDocument", d.id, `${AWD_REF} · ${d.templateName}`, "CREATE", issuedOn, diffFields(null, { template: d.templateName, formCode: d.templateFormCode, textVersion: d.templateBodyVersion, language: d.language, frozen: "yes" }));
  entry("Award", AW, label, "UPDATE", issuedOn, diffFields({ status: "APPROVED" }, { status: "ISSUED", issuedAt: day(issuedOn), signedBy: people.gopal.name, signedOn: day(issuedOn), signatoryOffice: sig.roleLabel, recordedOnBehalf: "not signed", contractNumber: CON_NO, underDelegation: null }));
  for (const d of a.distributions) entry("AwardDistribution", d.id, `${AWD_REF} · copy to ${d.recipientName}`, "UPDATE", d.despatchedOn!, diffFields({ method: null, despatchedOn: null, acknowledgedOn: null }, { method: d.method, consignmentRef: d.consignmentRef, despatchedOn: d.despatchedOn, acknowledgedOn: d.acknowledgedOn }));
  entry("AwardReturn", `${P}ar13`, `${AWD_REF} · return`, "UPDATE", "2026-05-22", diffFields({ signedLetterReceivedOn: null, declarationReceivedOn: null, authorisationReceivedOn: null }, { signedLetterReceivedOn: day("2026-05-22"), declarationReceivedOn: day("2026-05-22"), authorisationReceivedOn: day("2026-05-22"), whereHeld: "Contract & Procurement strongroom", receivedBy: people.daniel.name }));
  for (const s of a.contract!.securities) {
    const lbl = securityLabel(AWD_REF, s.kind);
    entry("SecurityInstrument", s.id, lbl, "CREATE", s.lodgedOn, awardAuditCreate({ ...s, status: "LODGED", verifiedOn: null, verifiedByPersonId: null, rejectedReason: "", requiredValue: null, basis: null, basisPercent: null, basisAmount: null, basisProvenance: null, requiredUntil: null }, { contract: CON_NO }));
    entry("SecurityInstrument", s.id, lbl, "UPDATE", s.verifiedOn!, diffFields({ status: "LODGED" }, { status: s.status, checkedBy: people.chen.name, checkedOn: s.verifiedOn, recordedOnBehalf: "not signed", requiredValue: s.requiredValue?.toString() }));
  }
  for (const p of a.contract!.policies) {
    const lbl = policyLabel(AWD_REF, p.kind);
    entry("InsurancePolicy", p.id, lbl, "CREATE", p.lodgedOn, awardAuditCreate({ ...p, status: "LODGED", verifiedOn: null, verifiedByPersonId: null, requirementSnapshot: undefined }, { contract: CON_NO }));
    entry("InsurancePolicy", p.id, lbl, "UPDATE", p.verifiedOn!, diffFields({ status: "LODGED" }, { status: p.status, checkedBy: people.chen.name, checkedOn: p.verifiedOn, recordedOnBehalf: "not signed" }));
  }
  entries.push({ id: `${SX}_lock`, organisationId, entity: "SourcingExercise", entityId: SX, entityLabel: `${SX_REF} · ${TITLE}`, action: "UPDATE", at: day("2026-05-11"), changes: diffFields({ classificationLockedAt: null }, { classificationLockedAt: day("2026-05-11") }), reason: `Award ${AWD_REF} sent for approval.`, ...DEMO_ACTOR });
  await db.auditEntry.createMany({ data: entries as never });
  return [`${P}mt20`];
}

// ------------------------------------------------------------------ the contract's life, through its acts

/// Every act from formation on (after the payment demo's, on the configuration above).
export async function loadLifecycleDemo(db: Db, organisationId: string) {
  // BD-613-44: a payment certificate issues only to a contractor whose bank details an officer has checked, and only to the supplier its award names on the register. So the awardee is put on
  // the register with such details (the supplier series exists by now), and the award is linked to it as an officer links one (`linkAwardToSupplier`), before the first certificate is signed.
  const { createRegisteredContractor } = await import("./demo-contractor");
  const contractorId = await createRegisteredContractor(db, organisationId, { key: "ctr13", name: AWARDEE.name, registrationNo: AWARDEE.reg, address: AWARDEE.address, registeredOn: "2026-04-15" });
  const award = await db.award.findUniqueOrThrow({ where: { id: AW }, select: { reference: true, vendorId: true } });
  if (award.vendorId) throw new Error(`demo ${AW}: it already names a supplier`);
  await db.award.update({ where: { id: AW }, data: { vendorId: contractorId } });
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: contractorId }, select: { reference: true, registeredName: true } });
  await db.auditEntry.create({
    data: {
      id: `${contractorId}_au_link`, organisationId, entity: "Award", entityId: AW, entityLabel: `${award.reference} · Awardee's supplier`, action: "UPDATE", at: new Date("2026-06-01T02:00:00.000Z"), reason: "",
      changes: [{ field: "supplier", before: null, after: `${supplier.reference} · ${supplier.registeredName}` }, { field: "linkedBy", before: null, after: "the demo loader, as an officer links an award with no party" }], unattributed: false, actorKind: "SYSTEM", actorSystemLabel: "demo loader",
    } as never,
  });
  const A = {
    contract: await import("../src/app/projects/[id]/actions"),
    supervision: await import("../src/app/projects/[id]/supervision-actions"),
    payment: await import("../src/app/projects/[id]/payment-actions"),
    variation: await import("../src/app/projects/[id]/variation-actions"),
    certificate: await import("../src/app/projects/[id]/certificates/[certId]/actions"),
    committee: await import("../src/app/committees/actions"),
  };
  const id = CON;

  // ------------------------------------------------ the documents the acts need on file
  let docN = 0;
  /// `on`: another owner than the contract (an instruction's sketch, FR-VAR-015), with how the trail names it.
  const doc = async (title: string, purpose: DemoDoc["attachments"][number]["purpose"], when: string, lines: string[], on?: { owner: DemoDoc["attachments"][number]["owner"]; label: string }) => {
    const k = ++docN;
    const d: DemoDoc = { id: `${P}ldoc${k}`, title, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL", createdAt: when, versions: [{ id: `${P}ldoc${k}v1`, n: 1, bytes: demoPdf(lines), mediaType: "application/pdf", filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: when.slice(0, 10), storedAt: when }], attachments: [{ id: `${P}ldoc${k}a1`, purpose, owner: on?.owner ?? { contractId: id }, ownerLabel: on?.label ?? `Contract ${CON_NO} · ${AWARDEE.name}`, versionId: `${P}ldoc${k}v1`, at: when }] };
    await (await writeDemoDocs(db, organisationId, [d], `${P}ldocau${k}_`, people.chen)).flush();
  };

  // ------------------------------------------------ formation, legal review, signatures (FR-CON-003–011)
  const formation = async () => {
    await act("2026-05-25T09:00", "start preparation", A.contract.startPreparation, { id });
    const c0 = await db.contract.findUniqueOrThrow({ where: { id }, include: { checks: true } });
    for (const [n, cmp] of (["TENDER_DOCUMENT", "TENDER_TABLE_DOCUMENT", "DRAWINGS"] as const).entries()) await act(`2026-05-26T1${n}:00`, `reconciliation ${cmp}`, A.contract.recordReconciliation, { id, comparison: cmp, outcome: "MATCHES", personId: people.daniel.id, checkedOn: "2026-05-26" });
    const front = c0.checks.find((k) => k.kind === "FRONT_LOADING");
    if (front) {
      await act("2026-05-27T09:00", "rate 1.1", A.contract.addRate, { id, checkId: front.id, itemRef: "1.1", description: "Mobilisation and site establishment", tenderedRate: "9500.00", estimateRate: "8000.00" });
      await act("2026-05-27T09:05", "rate 4.3", A.contract.addRate, { id, checkId: front.id, itemRef: "4.3", description: "Air valve chamber complete", tenderedRate: "9850.00", estimateRate: "9400.00" });
    }
    for (const k of c0.checks) await act("2026-05-27T10:00", `check ${k.kind}`, A.contract.completeCheck, { id, checkId: k.id, personId: people.daniel.id, completedOn: "2026-05-27", note: k.kind === "ARITHMETIC" ? "No arithmetical error found." : k.kind === "FRONT_LOADING" ? "Mobilisation within the ratio; no adjustment." : "" });
    // What nothing else states, keyed at baseline (OD-5 A), as con3's were.
    await act("2026-05-27T11:00", "baseline sums", A.contract.saveBaselineEntry, { id, group: "sums", provenance: "ASSUMED", note: "From the priced bill: no prime cost sum, one provisional sum for road reinstatement (demo).", pcSums: "0.00", provisionalSums: "10000.00" });
    await act("2026-05-27T11:05", "baseline subsequent interim", A.contract.saveBaselineEntry, { id, group: "subsequentInterim", provenance: "ASSUMED", note: "Invented for the demo.", amount: "10000.00" });
    await act("2026-05-27T11:10", "baseline sections", A.contract.saveBaselineEntry, { id, group: "sectional", provenance: "ASSUMED", note: "One section only (demo).", sectionalApplies: "no" });
    await act("2026-05-28T09:00", "confirm baseline", A.contract.confirmBaseline, { id });
    // Legal review: the Contract Document sent, endorsed at the first iteration.
    await doc(`Contract Document for legal review, ${CON_NO}`, "LEGAL_SUBMISSION", "2026-05-28T02:00", ["Contract Document for legal review (demo)", CON_NO, "Conditions, the signed Letter of Acceptance and the bill."]);
    await act("2026-05-28T11:00", "legal submission", A.contract.submitLegal, { id, personId: people.daniel.id });
    await act("2026-06-02T10:00", "legal decision", A.contract.decideLegal, { id, decision: "ENDORSED", reviewerPersonId: people.chen.id, decidedOn: "2026-06-02", comments: "" });
    // The company resolution, the contractor's signature and its witness, then the employer's (the S.O. resolved).
    await doc(`Company resolution, ${AWARDEE.name}`, "COMPANY_RESOLUTION", "2026-06-03T02:00", ["Board resolution (demo)", AWARDEE.name, "A director signs for the company."]);
    await act("2026-06-04T10:00", "contractor's signature", A.contract.recordContractorSignature, { id, name: "Tan Mei Hua", icNumber: "000000-00-0013", capacity: "Director", signedOn: "2026-06-04", witnessName: "Ahmad bin Contoh", witnessIcNumber: "000000-00-0014" });
    await act("2026-06-05T10:00", "employer's signature", A.contract.recordRsajSignature, { id, personId: people.aisyah.id });
    await act("2026-06-05T11:00", "integrity briefing", A.contract.recordBriefing, { id, heldOn: "2026-06-05", participantIds: [people.aisyah.id, people.daniel.id], contractorAttendees: "Tan Mei Hua", note: "The action on a breach of the anti-corruption clause was explained (demo)." });
    await doc(`Stamping certificate, ${CON_NO}`, "STAMPING_CERTIFICATE", "2026-06-08T03:00", ["Stamping certificate (demo)", CON_NO, "Reference DEMO-STAMP-2026-0013."]);
    await act("2026-06-08T11:00", "stamping", A.contract.recordStamping, { id, stampedOn: "2026-06-08", stampingRef: "DEMO-STAMP-2026-0013" });
  };
  await formation();

  // ------------------------------------------------ a certificate through its route, its sheet and its signatures
  const holderOf: Record<string, { id: string; name: string }> = { HOD_CP: people.chen, FD: people.bala, CEO: people.aisyah, SEC_PRE: people.eng };
  const certificate = (certId: string) => db.certificate.findUniqueOrThrow({ where: { id: certId }, include: { approvalInstances: { include: { steps: { orderBy: { sequence: "asc" } } }, orderBy: { createdAt: "asc" } }, routingChecks: true, signatures: true, copies: true } });
  const latestCert = async (kind: string) => (await db.certificate.findFirstOrThrow({ where: { contractId: id, kind: kind as never }, orderBy: [{ openedAt: "desc" }, { id: "desc" }] })).id;
  /// Send it for approval (the sender named), its sheet's DATE (1) and checks, then each person's step decided in turn.
  const approve = async (certId: string, o: { on: string; sendAt?: string; sheet?: boolean; decided: string[] }) => {
    const h = o.sendAt ?? "09";
    await act(`${o.on}T${h}:00`, `${certId} sent for approval`, A.certificate.sendCertificateForApproval, { certId, personId: people.eng.id });
    if (o.sheet) {
      await act(`${o.on}T${h}:10`, `${certId} received`, A.certificate.recordCertificateReceived, { certId, receivedOn: o.on });
      await act(`${o.on}T${h}:20`, `${certId} checked`, A.certificate.recordCertificateCheck, { certId, defOrder: "1", personId: people.eng.id, on: o.on, note: "" });
      await act(`${o.on}T${h}:30`, `${certId} verified`, A.certificate.recordCertificateCheck, { certId, defOrder: "2", personId: people.chen.id, on: o.on, note: "" });
    }
    const c = await certificate(certId);
    const route = c.approvalInstances.at(-1)!;
    for (const [i, st] of route.steps.entries()) {
      const who = holderOf[st.roleCode ?? ""];
      if (!who) throw new Error(`demo ${certId}: no demo holder for ${st.roleCode}`);
      const on = o.decided[i] ?? o.decided.at(-1)!;
      await act(`${on}T1${5 + i}:00`, `${certId} step ${st.sequence} (${st.roleCode})`, A.certificate.decideCertificateRouteStep, { certId, stepId: st.id, decision: "DONE", personId: who.id, decidedOn: on, receivedOn: on, reason: "" });
    }
  };
  type Sign = { order: number; person?: { id: string }; name?: string; ic?: string; decision?: "SUPPORTED"; on: string };
  /// To signing, then each block in order; the last issues it. Copies despatched and the original acknowledged.
  const sign = async (certId: string, toSigningOn: string, blocks: Sign[], despatch?: string) => {
    await act(`${toSigningOn}T17:00`, `${certId} to signing`, A.certificate.sendCertificateToSigning, { certId });
    for (const [i, b] of blocks.entries()) await act(`${b.on}T17:${String(10 + i * 5)}`, `${certId} block ${b.order}`, A.certificate.recordCertificateSignature, { certId, blockOrder: String(b.order), personBlock: b.person ? "yes" : "no", personId: b.person?.id, name: b.name, icNumber: b.ic, signedOn: b.person ? undefined : b.on, decision: b.decision });
    if (!despatch) return;
    const c = await certificate(certId);
    if (c.status !== "ISSUED") throw new Error(`demo ${certId}: not issued after its last block (${c.status})`);
    for (const cp of c.copies.filter((x) => x.mandatory)) await act(`${despatch}T17:45`, `${certId} copy ${cp.copyNo}`, A.certificate.despatchCertificateCopy, { certId, copyId: cp.id, method: "BY_HAND", despatchedOn: despatch });
    const original = c.copies.find((x) => x.isOriginal && x.ackRequired);
    if (original) await act(`${despatch}T17:50`, `${certId} acknowledged`, A.certificate.acknowledgeCertificateCopy, { certId, copyId: original.id, acknowledgedOn: despatch });
  };
  const interimBlocks = (on: string): Sign[] => [
    { order: 1, person: people.chen, decision: "SUPPORTED", on },
    { order: 2, person: people.bala, on },
    { order: 3, name: "Tan Mei Hua", ic: "000000-00-0013", on },
    { order: 4, name: "Ahmad bin Contoh", on },
  ];
  const soBlock = (on: string): Sign[] => [{ order: 1, person: people.bala, on }];

  // The story, in the order it happened: every act below runs after every act dated before it, so each reads the
  // contract as it stood that day.
  const S = A.supervision;
  const Y = A.payment;
  const V = A.variation;
  const C = A.committee;
  const progress = (d: string, pct: string, note: string) => act(`${d}T08:00`, `progress ${d}`, S.recordProgress, { id, personId: people.bala.id, day: d, actualPct: pct, note });
  const pay = (cert: string, on: string, batch: string) => act(`${on}T10:00`, `paid ${cert}`, A.certificate.recordCertificatePayment, { certId: cert, batchNo: batch, paidOn: on, personId: people.eng.id, note: "" });
  /// An interim valuation on the calendar day, valued jointly and raised, then sent on its route and its sheet.
  const valuation = async (n: number, on: string, mainWorks: string, note: string) => {
    await act(`${on}T09:00`, `valuation ${n} opened`, Y.openInterimValuation, { id, trigger: "VALUATION_DATE", valuationDate: on, personId: people.bala.id });
    const v = (await db.interimValuation.findFirstOrThrow({ where: { contractId: id, valuationDate: day(on) } })).id;
    await act(`${on}T10:00`, `valuation ${n} main works`, Y.recordMainWorks, { id, valuationId: v, mainWorks, note });
    await act(`${on}T11:00`, `valuation ${n} joint`, Y.recordJointValuation, { id, valuationId: v, jointOn: on, participants: `${people.bala.name} (Superintending Officer)\nThe contractor's site agent`, valuationMethod: "Measured jointly on site against the bill of quantities (demo).", contractorAnswer: "AGREED", dissent: "" });
    await act(`${on}T12:00`, `valuation ${n} raised`, Y.raiseInterimCertificate, { id, valuationId: v });
    return (await db.interimValuation.findUniqueOrThrow({ where: { id: v } })).certificateId!;
  };
  const record = async (on: string, f: { description: string; reason: string; estimate: string; exemption?: string }) => {
    await act(`${on}T09:00`, `variation recorded: ${f.description}`, V.recordVariation, { id, origin: "DEPARTMENT", originatorPersonId: people.daniel.id, description: f.description, reason: f.reason, estimate: f.estimate, exemption: f.exemption, periodImplication: "no", agreedRateExists: "no", funderConsentRequired: "no", reviewedByPersonId: people.bala.id, reviewedOn: on, reviewNote: "Reviewed on site against the drawings (demo)." });
    return (await db.variation.findFirstOrThrow({ where: { contractId: id, description: f.description } })).id;
  };
  /// Its instruction raised and signed by the S.O. (dated by the signature).
  const instruct = async (variationId: string, on: string, description: string) => {
    await act(`${on}T10:00`, `instruction ${variationId}`, V.raiseInstruction, { id, variationId, instructionDescription: description, personId: people.bala.id });
    await sign(await latestCert("SO_INSTRUCTION"), on, soBlock(on), on);
  };
  const measure = async (variationId: string, on: string, heading: string, items: { ref: string; description: string; qty: string; unit: string; rate: string; bq: string; covered?: boolean; records?: string }[]) => {
    for (const [i, m] of items.entries()) await act(`${on}T1${i}:00`, `measurement ${m.ref}`, V.addMeasurement, { id, variationId, heading, itemRef: m.ref, description: m.description, rateSource: "CONTRACT_RATE", bqItemRef: m.bq, quantity: m.qty, unit: m.unit, baseRate: m.rate, direction: "ADDITION", measuredOn: on, coveredUp: m.covered ? "yes" : "no", recordsNote: m.records ?? "", personId: people.bala.id });
  };
  /// Its Variation Order Certificate raised; returns its certificate and its order row.
  const raiseOrder = async (variationId: string, on: string, description: string) => {
    await act(`${on}T09:00`, `order ${variationId}`, V.raiseVariationOrder, { id, variationId, orderDescription: description, valuationClauseId: `${P}cl2`, personId: people.bala.id });
    const cert = await latestCert("VARIATION");
    return { cert, order: (await db.variationCertificate.findFirstOrThrow({ where: { certificateId: cert } })).id };
  };
  const threeBlocks = (on: string): Sign[] => [{ order: 1, person: people.chen, decision: "SUPPORTED", on }, { order: 2, person: people.bala, on }, { order: 3, name: "Tan Mei Hua", ic: "000000-00-0013", on }];

  // June: possession, the programme, the valuation calendar, the advance.
  await act("2026-06-22T09:00", "possession", S.recordPossession, { id, possessionOn: "2026-06-22", personId: people.bala.id, note: "Site handed over at the intake gate (demo)." });
  await act("2026-06-23T09:00", "programme submitted", S.submitProgramme, { id, kind: "WORK_PROGRAMME", submittedOn: "2026-06-23", points: "2026-06-22 | 0\n2026-07-31 | 45\n2026-08-31 | 100", note: "" });
  await act("2026-06-23T11:00", "valuation calendar", Y.recordValuationCalendar, { id, dayOfMonth: "30", agreedOn: "2026-06-23", agreedWith: "The contractor's site agent (demo)", personId: people.bala.id, note: "Agreed at the start-up meeting (demo).", reason: "" });
  const programmeId = (await db.workProgramme.findFirstOrThrow({ where: { contractId: id } })).id;
  await act("2026-06-24T09:00", "programme scrutinised", S.scrutiniseProgramme, { id, programmeId, personId: people.bala.id, on: "2026-06-24", reasonable: "yes", note: "" });
  await act("2026-06-24T10:00", "programme approved", S.decideProgramme, { id, programmeId, personId: people.bala.id, on: "2026-06-24", decision: "APPROVED", note: "" });
  await act("2026-06-25T09:00", "advance applied for", Y.applyAdvancePayment, { id, advanceFor: "MAIN", amount: "48000.00", securityId: `${P}sec14`, schedule: "1 | 24000.00\n2 | 24000.00", personId: people.bala.id, note: "Ten per cent of the contract sum, against the guarantee (demo)." });
  const advance = await latestCert("ADVANCE_PAYMENT");
  await approve(advance, { on: "2026-06-25", decided: ["2026-06-26", "2026-06-29"] });
  await sign(advance, "2026-06-29", interimBlocks("2026-06-30"), "2026-06-30");

  // July: the exempt variation instructed; the air valves through the committee, approved, instructed; interim 1 raised.
  const psText = "Reinstatement of the district road crossing at chainage 0+350";
  const ps = await record("2026-07-01", { description: psText, reason: "Expended against the provisional sum for road reinstatement in the bill (demo).", estimate: "6500.00", exemption: "PROVISIONAL_SUM" });
  await act("2026-07-02T09:00", "submit (exempt)", V.submitVariation, { id, variationId: ps });
  await instruct(ps, "2026-07-03", psText);
  const avText = "Two additional air valve chambers at chainages 1+200 and 1+850";
  const av = await record("2026-07-06", { description: avText, reason: "Air was trapped at two high points on the commissioning run; the drawings provided no relief there (demo).", estimate: "21000.00" });
  await pay(advance, "2026-07-06", "PV/2026/0613");
  await act("2026-07-07T09:00", "submit", V.submitVariation, { id, variationId: av });
  await act("2026-07-08T09:00", "S.O. supports", V.decideVariation, { id, variationId: av, soDecision: "SUPPORTED", soDecisionNote: "Needed before the main is commissioned (demo).", decidedOn: "2026-07-08", personId: people.bala.id });
  await act("2026-07-08T11:00", "sent for prior approval", V.sendVariationForApproval, { id, variationId: av, event: "PRIOR", personId: people.eng.id });
  // The committee's sitting, run through its own acts.
  await act("2026-07-08T15:00", "VOC sitting scheduled", C.scheduleSitting, { committeeId: `${P}c8`, meetingDate: "2026-07-15", agenda: "Variations recommended in the tender regime.", reference: "DEMO/VOC/1/2026" });
  const voc1 = (await db.meeting.findFirstOrThrow({ where: { committeeId: `${P}c8`, reference: "DEMO/VOC/1/2026" } })).id;
  await act("2026-07-09T10:00", "tabled at the VOC", V.tableVariationMatter, { id, variationId: av, purpose: "STEP", meetingId: voc1, tabledByPersonId: people.chen.id });
  await act("2026-07-15T09:00", "VOC sitting opened", C.changeStatus, { meetingId: voc1, to: "IN_PROGRESS" });
  for (const p of [people.bala, people.gopal, people.chen]) await act("2026-07-15T09:05", `attendance ${p.name}`, C.recordAttendance, { meetingId: voc1, personId: p.id, attended: "yes" });
  const matter = (await db.committeeDecision.findFirstOrThrow({ where: { meetingId: voc1, variationId: av } })).id;
  const { POST: vote } = await import("../src/app/api/committees/decisions/[id]/votes/route");
  for (const p of [people.bala, people.gopal]) await actRoute("2026-07-15T09:30", `vote ${p.name}`, () => vote(new Request("http://demo/api", { method: "POST", body: JSON.stringify({ onBehalfOf: p.id, choice: "SETUJU", votedAt: "2026-07-15" }) }), { params: Promise.resolve({ id: matter }) } as never));
  await act("2026-07-15T10:00", "VOC outcome", C.recordOutcome, { decisionId: matter, outcome: "CARRIED", outcomeNote: "" });
  await act("2026-07-15T11:00", "VOC minutes", C.saveMinutes, { meetingId: voc1, minutes: "The Committee recommended the two additional air valve chambers (demo)." });
  await act("2026-07-16T09:00", "VOC minuted", C.changeStatus, { meetingId: voc1, to: "MINUTED" });
  const r1 = (await db.variationApproval.findFirstOrThrow({ where: { variationId: av, event: "PRIOR" }, include: { approvalInstance: { include: { steps: { orderBy: { sequence: "asc" } } } } } })).approvalInstance;
  // Since b431b86 (founder, 2026-10-05) the carried outcome cites the step itself; cited by hand only where it did not.
  const vocStep = r1.steps.find((x) => x.committeeCode === "VOC")!;
  if (vocStep.decision === "PENDING") await act("2026-07-16T10:00", "VOC cited", V.citeVariationCommittee, { id, variationId: av, stepId: vocStep.id, committeeDecisionId: matter });
  for (const st of r1.steps.filter((x) => !x.committeeCode)) await act("2026-07-17T10:00", `approved by ${st.roleCode}`, V.decideVariationApprovalStep, { id, variationId: av, stepId: st.id, decision: "DONE", personId: holderOf[st.roleCode ?? ""].id, decidedOn: "2026-07-17", receivedOn: "2026-07-16", reason: "" });
  await sign((await db.variation.findUniqueOrThrow({ where: { id: av } })).applicationCertificateId!, "2026-07-17", soBlock("2026-07-17"), "2026-07-17");
  await instruct(av, "2026-07-20", avText);
  // FR-VAR-015: the chambers' sketch, attached to the S.O.'s Instruction through the document store.
  const avIns = await db.variationInstruction.findFirstOrThrow({ where: { variationId: av }, include: { certificate: { select: { number: true } }, variation: { select: { reference: true } } } });
  await doc("Air valve chambers at chainages 1+200 and 1+850, sketch", "INSTRUCTION_SKETCH", "2026-07-20T03:00", ["Sketch (demo)", "Air valve chambers at chainages 1+200 and 1+850", "Plan and section, not to scale."], { owner: { variationInstructionId: avIns.id }, label: `Contract ${CON_NO} · variation ${avIns.variation.reference} · the S.O.'s instruction ${avIns.certificate.number}` });
  await measure(ps, "2026-07-27", psText, [
    { ref: "PS1", description: "Premix reinstatement, 50 mm, including base", qty: "84.000", unit: "m2", rate: "62.50", bq: "6.1", records: "Measured with the district engineer's representative (demo)." },
    { ref: "PS2", description: "Road markings renewed", qty: "1.000", unit: "item", rate: "1120.00", bq: "6.4" },
  ]);
  await progress("2026-07-30", "40", "Main laid from the intake to chainage 0+800 (demo).");
  const ic1 = await valuation(1, "2026-07-30", "150000.00", "Main laid from the intake to chainage 0+800 (demo).");
  await approve(ic1, { on: "2026-07-30", sendAt: "13", sheet: true, decided: ["2026-07-31", "2026-08-03"] });

  // August: interim 1 issued; the exempt variation's order; the air valves measured, the daywork, their order; the warning.
  await sign(ic1, "2026-08-03", interimBlocks("2026-08-04"), "2026-08-04");
  const psOrder = await raiseOrder(ps, "2026-08-05", psText);
  await sign(psOrder.cert, "2026-08-06", threeBlocks("2026-08-06"), "2026-08-06");
  await measure(av, "2026-08-12", avText, [
    { ref: "A1", description: "Air valve chamber complete, 150 mm double orifice valve", qty: "2.000", unit: "nr", rate: "9850.00", bq: "4.3", records: "Both chambers measured before backfilling (demo)." },
    { ref: "A2", description: "Excavation in rock for the chambers", qty: "6.500", unit: "m3", rate: "150.00", bq: "3.2", covered: true, records: "Levels taken before the chambers were cast; photographs on file (demo)." },
  ]);
  const dw = { id, variationId: av, workedOn: "2026-08-13", description: "Excavator and two labourers, four hours, clearing a collapsed trench side at chainage 1+850 (demo).", agreedOn: "2026-08-13", agreedWith: "The contractor's site agent", personId: people.bala.id };
  await act("2026-08-13T17:00", "daywork", V.recordDaywork, dw);
  await pay(ic1, "2026-08-14", "PV/2026/0807");
  // Its substantiation received five days later, within the clock frozen when it was recorded.
  await act("2026-08-18T10:00", "daywork substantiated", V.recordDaywork, { ...dw, dayworkId: (await db.dayworkRecord.findFirstOrThrow({ where: { variationId: av } })).id, substantiationReceivedOn: "2026-08-18" });
  const avOrder = await raiseOrder(av, "2026-08-24", avText);
  await act("2026-08-24T14:00", "warning letter", Y.raiseLadWarning, { id, eotClause: "Clause 43 (demo)", ladClause: "Clause 40 (demo)", extendedCompletion: "2026-08-31", personId: people.bala.id });
  const warning = await latestCert("LAD_WARNING");
  await sign(warning, "2026-08-25", soBlock("2026-08-25"));
  await sign(avOrder.cert, "2026-08-26", threeBlocks("2026-08-26"), "2026-08-26");
  await act("2026-08-26T18:00", "warning posted", Y.recordWarningPost, { id, warningId: (await db.ladWarning.findFirstOrThrow({ where: { contractId: id } })).id, consignmentRef: "RR000000021DM", postedOn: "2026-08-26" });
  await progress("2026-08-30", "82", "Main laid to chainage 1+600; testing begun (demo).");
  const ic2 = await valuation(2, "2026-08-30", "330000.00", "Main laid to chainage 1+600 and pressure-tested (demo).");
  await approve(ic2, { on: "2026-08-30", sendAt: "13", sheet: true, decided: ["2026-08-31", "2026-09-01"] });

  // September: interim 2 issued; past completion, the Certificate of Non-Completion; the adjustment of the contract
  // sum; a variation commenced pending its approval; the as-built records and the first release; interim 3 raised.
  await sign(ic2, "2026-09-01", interimBlocks("2026-09-02"), "2026-09-02");
  const pack = { pack_STUDY: "The programme and the site records studied: the delay is the contractor's (demo).", pack_PROGRESS: "Progress 82% on 30 August against 100% planned (demo).", pack_EMPLOYER_DELAY: "No delay by the employer recorded (demo).", pack_PAYMENTS: "Interim certificates 1 and 2 certified within the period (demo)." };
  await act("2026-09-03T10:00", "non-completion decision", Y.recordNonCompletion, { id, decisionOutcome: "LAD_APPLIES", decisionReason: "The works were not complete on the date for completion and no extension of time was applied for (demo).", scope: "WHOLE", eotClause: "Clause 43 (demo)", ladClause: "Clause 40 (demo)", insuranceExpiry: "2027-12-31", expectedCompletion: "2026-10-31", windowFrom: "2026-09-01", personId: people.bala.id, ...pack });
  const cnc = await latestCert("NON_COMPLETION");
  await approve(cnc, { on: "2026-09-03", sendAt: "13", sheet: true, decided: ["2026-09-03", "2026-09-04"] });
  await sign(cnc, "2026-09-04", soBlock("2026-09-04"), "2026-09-04");
  await act("2026-09-08T10:00", "adjustment raised", V.raiseSumAdjustment, {
    id, personId: people.bala.id, orderIds: `${avOrder.order}\n${psOrder.order}`,
    other1Amount: "3240.00", other1Trigger: "PRICE_FLUCTUATION", other1Direction: "ADDITION", other1Reference: "PF-1", other1Description: "Price adjustment on ductile iron pipe", other1Basis: "The pipe supplier's index moved 4.5% between tender and delivery, applied to the pipe's value in the bill under the contract's fluctuation clause (demo; no formula engine, the basis written).",
    other2Amount: "10000.00", other2Trigger: "PC_AND_PROVISIONAL_SUMS", other2Direction: "OMISSION", other2Reference: "PS-1", other2Description: "Provisional sum for road reinstatement omitted", other2Basis: "The provisional sum in the bill is omitted; what was expended against it is the exempt variation's order (demo).",
  });
  const adjustment = await latestCert("SUM_ADJUSTMENT");
  await approve(adjustment, { on: "2026-09-09", decided: ["2026-09-09", "2026-09-10"] });
  await pay(ic2, "2026-09-11", "PV/2026/0905");
  await sign(adjustment, "2026-09-10", threeBlocks("2026-09-11"), "2026-09-11");
  const wvText = "Additional washout valve at chainage 1+400";
  const wv = await record("2026-09-14", { description: wvText, reason: "The low point at chainage 1+400 cannot be drained for commissioning without one (demo).", estimate: "15800.00" });
  await act("2026-09-15T09:00", "submit", V.submitVariation, { id, variationId: wv });
  await act("2026-09-16T09:00", "S.O. supports", V.decideVariation, { id, variationId: wv, soDecision: "SUPPORTED", soDecisionNote: "", decidedOn: "2026-09-16", personId: people.bala.id });
  await act("2026-09-17T09:00", "commenced pending approval", V.recordCommencement, { id, variationId: wv, commencedOn: "2026-09-17", personId: people.bala.id, note: "Started so the main can be drained for its final test (demo)." });
  await act("2026-09-18T09:00", "sent for prior approval", V.sendVariationForApproval, { id, variationId: wv, event: "PRIOR", personId: people.eng.id });
  await act("2026-09-21T09:00", "VOC sitting 2 scheduled", C.scheduleSitting, { committeeId: `${P}c8`, meetingDate: "2026-10-14", agenda: "Variations recommended in the tender regime.", reference: "DEMO/VOC/2/2026" });
  const voc2 = (await db.meeting.findFirstOrThrow({ where: { committeeId: `${P}c8`, reference: "DEMO/VOC/2/2026" } })).id;
  await act("2026-09-22T10:00", "tabled at the VOC", V.tableVariationMatter, { id, variationId: wv, purpose: "STEP", meetingId: voc2, tabledByPersonId: people.chen.id });
  await doc(`As-built drawings, ${CON_NO}`, "AS_BUILT", "2026-09-23T03:00", ["As-built drawings (demo)", CON_NO, "The raw water main as laid, chainage 0+000 to 1+900."]);
  await act("2026-09-24T10:00", "as-built handed over", S.handOverRecords, { id, recordsSet: "AS_BUILT", on: "2026-09-24", toLabel: "Operations, Northern Region (demo)", receivedByName: "Lim Kok Seng", personId: people.bala.id, note: "As-built drawings of the main as laid (demo)." });
  await act("2026-09-25T10:00", "first release of retention", Y.releaseRetention, { id, release: "RELEASED_FIRST", releasedOn: "2026-09-25", personId: people.bala.id, note: "On the as-built drawings (demo)." });
  await progress("2026-09-30", "94", "Main laid and tested; reinstatement and the washout valve outstanding (demo).");
  const ic3 = await valuation(3, "2026-09-30", "452000.00", "Main laid and tested; the variations' work included (demo).");
  await approve(ic3, { on: "2026-09-30", sendAt: "13", sheet: true, decided: ["2026-10-01", "2026-10-01"] });

  // October: interim 3 issued, its damages line and the release in it.
  await sign(ic3, "2026-10-01", interimBlocks("2026-10-02"), "2026-10-02");
  void organisationId;
}

/// A variation on demo_con3 (the quotation regime), waiting at a person's step on /approvals. After con3's own demos.
export async function loadLifecycleCon3(db: Db) {
  const V = await import("../src/app/projects/[id]/variation-actions");
  const id = `${P}con3`;
  const description = "Twenty additional valve keys for the southern crews";
  await act("2026-10-02T14:00", "con3 variation recorded", V.recordVariation, { id, origin: "DEPARTMENT", originatorPersonId: people.daniel.id, description, reason: "The southern crews were added after the order was placed (demo).", estimate: "2400.00", periodImplication: "no", agreedRateExists: "no", funderConsentRequired: "no", reviewedByPersonId: people.chen.id, reviewedOn: "2026-10-02", reviewNote: "" });
  const v = (await db.variation.findFirstOrThrow({ where: { contractId: id, description } })).id;
  await act("2026-10-02T15:00", "con3 submit", V.submitVariation, { id, variationId: v });
  await act("2026-10-02T16:00", "con3 S.O. supports", V.decideVariation, { id, variationId: v, soDecision: "SUPPORTED", soDecisionNote: "", decidedOn: "2026-10-02", personId: people.chen.id });
  await act("2026-10-03T09:00", "con3 sent for prior approval", V.sendVariationForApproval, { id, variationId: v, event: "PRIOR", personId: people.eng.id });
}

/// Read back after the load, through the product's own readings (X-10): where each record stands, and the figures.
export async function checkLifecycleDemo(db: Db) {
  const { loadContract } = await import("../src/lib/contract/repo");
  const { loadPayment, issuedInterims, liveDecisionOf } = await import("../src/lib/payment/load");
  const { loadSupervision, delayOn } = await import("../src/lib/supervision/load");
  const { latestVersion } = await import("../src/lib/contract/baseline");
  const { baselineRows, valuesOf } = await import("../src/lib/contract/load");
  const { loadVariations, factsOf, loadAdjustments, issuedAdjustments } = await import("../src/lib/variation/load");
  const { stageOf, commencedPending, approvedValue } = await import("../src/lib/variation/application");
  const { readComputedSnapshot } = await import("../src/lib/certificate/snapshot");
  const { loadWorklist } = await import("../src/lib/approvals/load");
  const fail = (what: string) => {
    throw new Error(`demo check (demo_con13): ${what}`);
  };
  const l = (await loadContract(await demoOrgId(), CON))!;
  if (l.contract.status !== "ACTIVE") fail(`expected ACTIVE, read ${l.contract.status}`);
  const s = await loadSupervision(CON);
  if (s.soAssignments.length !== 1 || s.soAssignments[0].roleCode !== "FD") fail("the S.O. is not the Finance Director's office, resolved once");
  const latest = latestVersion(baselineRows(l.contract).versions)!;
  const completion = valuesOf(latest).dateForCompletion;
  if (completion !== "2026-08-31") fail(`date for completion ${completion}, not 2026-08-31`);
  const d = delayOn(s, { today: "2026-10-02", dateForCompletion: completion, policyPct: "75", status: l.contract.status });
  if (d.state !== "IN_DELAY") fail(`not In Delay on 2 Oct (${d.state})`);
  // Payments: three interims issued from their valuations, the advance recouped on 1 and 2, the damages decided.
  const p = await loadPayment(CON);
  const issued = issuedInterims(p);
  if (issued.map((x) => x.sequence).join() !== "1,2,3") fail(`interims issued ${issued.map((x) => x.sequence).join()}`);
  const ic3 = readComputedSnapshot((await db.certificate.findUniqueOrThrow({ where: { id: issued[2].certificateId } })).computedSnapshot)!;
  const { applyOverrides } = await import("../src/lib/certificate/override");
  const figures = applyOverrides(ic3, []);
  const line = (k: string) => [...figures.lines, ...figures.totals].find((x) => x.key === k)?.value ?? null;
  const want: Record<string, string> = { netAdjustment: "20285.00", ladDays: "30", ladAmount: "9000.00", retentionReleased: "8250.00", retentionMain: "14350.00", recommended: "115150.00" };
  for (const [k, v] of Object.entries(want)) if (line(k) !== v) fail(`interim 3's ${k} reads ${line(k)}, not ${v}`);
  if (p.advancePayments.length !== 1 || p.advancePayments[0].certificate.status !== "ISSUED") fail("the advance is not issued");
  if (liveDecisionOf(p)?.outcome !== "LAD_APPLIES") fail("no non-completion decision applying damages");
  if (p.retentionReleases.length !== 1 || p.retentionReleases[0].kind !== "RELEASED_FIRST") fail("the first release is not recorded");
  // Variations: the exempt one and the committee's certified, the third commenced pending; the adjustment issued.
  const vs = (await loadVariations(CON)).map(factsOf);
  const stages = vs.map((v) => stageOf(v)).join();
  if (stages !== "CERTIFIED,CERTIFIED,AWAITING_APPROVAL") fail(`variation stages ${stages}`);
  if (approvedValue(vs[1]) !== 2_100_000n) fail("the air valves' approved value is not RM21,000.00");
  if (!commencedPending(vs[2])) fail("the washout valve does not read commenced pending approval");
  const adj = issuedAdjustments(await loadAdjustments(CON));
  if (adj.length !== 1 || adj[0].net !== 2_028_500n) fail(`the adjustment of the contract sum reads ${adj.map((a) => a.net).join()}`);
  // demo_con3: its variation waits at the Finance Director's step on Approvals.
  const w = await loadWorklist(await demoScope(), []);
  const rows = JSON.stringify(w);
  if (!rows.includes("/variations/")) fail("no variation's step on the Approvals worklist");
}
