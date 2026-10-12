/**
 * Demo data for 6.4 increment 1: tender and quotation document assembly (plan §6, as ruled:
 * X-4, X-10, Q-8). Invented throughout: no customer's part list, form or figure. Every
 * configured value is ASSUMED (X-10 d: RSAJ's worked examples stay test-only fixtures), no
 * recorded act is dated after the load day (2026-10-01, X-10 a), and every row passes the
 * checks of its act, judged by the product's own functions as it is written (X-10 c).
 *
 * - Templates demo_dt8–12 with invented bodies naming only the pack's merge fields.
 * - Parts: tender demo_tdp1–14 (any basis, conditions per basis, the bill on a bill basis, a
 *   summary and rates on drawings and specification); quotation demo_tdp15–25 (the
 *   declaration and the bond forms bound in, as FR-DOC-007/008 and the works type ask).
 * - Policy demo_tdpol1 (only where the organisation has none): LAD 0.05% a day, first
 *   certificate the lesser of RM2,500.00 and 5%, insurance two months beyond the defects
 *   period — all invented and ASSUMED; assurance and the restriction stamp left unset.
 * - Methods: tenders assemble a tender pack, quotations and the specialist method a quotation
 *   pack, direct, selective direct, emergency and term contracts none (ASSUMED).
 * - Approval for Tendering rows demo_rule40 (quotations) and demo_rule41 (specialist), domain
 *   tendering_approval, clause "DEMO 4.1": the Head of Contract & Procurement approves; the
 *   core-routing flag decided (not generated: one office decides, with the reason).
 * - demo_sx1 (open quotation, bill): moved into preparation; pack v1 approved through route
 *   demo_ai60, decided by Chen Wei Ling on 28 September; tendering starts 12 October and
 *   closes 29 October at 14:30. Its estimate's lead reads Ready against that closing.
 * - demo_sx5 (open quotation, bill): pack v1 submitted on 29 September through route
 *   demo_ai61b and returned on the 30th ("Drawings missing the valve schedule"); v2 a draft, its Appendix half entered and its
 *   drawings not ready (the carried set taken off).
 * - demo_sx15 (specialist, quotation pack): v1 submitted on 1 October, after its scope was
 *   approved at the Technical Committee's sitting of 30 September; route demo_ai61 pending
 *   at the Head of Contract & Procurement.
 * - demo_sx3 stays a draft (no pack until it is in preparation); demo_sx2, sx4, sx7 and the
 *   award exercises sx10–14 were prepared before document assembly and keep that path.
 *
 * Increment 2 (FR-DOC-005, 006, 009, 010, 011, 014), invented and ASSUMED throughout:
 * - Registration bodies demo_rb1–3 (a companies registry; a contractors board stated with a
 *   grade and category; a supplier register stated with field codes); clause demo_cl1, an
 *   invented integrity clause every agreement carries; permit list demo_tx4 (values
 *   demo_tv9–11), named by the policy, which also words the restriction and its stamp in
 *   invented terms (no customer's wording) and requires the two assurance confirmations.
 * - The notice template names the eligibility fields, the instructions the permit, the
 *   conditions cite the clause.
 * - sx1 and sx15: registrations recorded, the permit chosen, both confirmations recorded on
 *   their packs before submission; sx15 is restricted, so its frozen documents carry the
 *   stamp. sx5: registrations and permit recorded, restriction answered no, and v2 (not
 *   carried) unconfirmed, so its readiness card shows those blocks honestly.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { PURPOSE_LABEL } from "../src/lib/documents/labels";
import { ACT_LABEL } from "../src/lib/labels";
import { formatSen, parseSen } from "../src/lib/money";
import { appendixAudit, packCreatedAudit, packStatusAudit, partAudit, ENTITY } from "../src/lib/tender-docs/audit-view";
import { appendixComplete } from "../src/lib/tender-docs/appendix";
import { formLabel, resolveComposition } from "../src/lib/tender-docs/composition";
import { packFieldValues } from "../src/lib/tender-docs/fields";
import { appendixText, freezePack } from "../src/lib/tender-docs/freeze";
import { PACK_KIND_LABEL } from "../src/lib/tender-docs/labels";
import { blockingOf, submitFaults } from "../src/lib/tender-docs/pack";
import { approvalDatesFault, estimateLeadWarning, RETURN_DECIDED_BY, TENDERING_DOMAIN, tenderingRejectionSnapshot, tenderingRouteForRequester } from "../src/lib/tender-docs/tendering";
import { demoPdf, writeDemoDocs, type DemoDoc } from "./demo-documents";
import { DEMO_ACTOR } from "./demo-actor";
import { demoOrgId } from "./demo-org";

type Db = PrismaClient;
const P = "demo_";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/// An instant, written "2026-09-25T14:00", in UTC as the other demo files write theirs.
const at = (iso: string) => new Date(`${iso}:00.000Z`);

// ------------------------------------------------------------------ configuration

const body = (title: string, lines: string[]) => [title, ...lines].join("\n\n");
const TEMPLATES = [
  { id: `${P}dt8`, code: "demo_notice", nameEn: "Demo notice of invitation", formCode: "DEMO-F-101", bodyEn: body("{{organisation.name}} invites offers for {{exercise.title}} ({{exercise.reference}}).", ["This invitation is part of the {{pack.kind}}, version {{pack.version}}, raised against requisition {{requisition.reference}}.", "Bidders must be registered with {{eligibility.registration}}. Each registration must be active and valid {{eligibility.window}}.", "The contract is let on {{contract.basis}} under {{pack.form}}."]) },
  { id: `${P}dt9`, code: "demo_instructions", nameEn: "Demo instructions to bidders", formCode: "DEMO-F-102", bodyEn: body("Instructions to bidders: {{exercise.title}}", ["Read every part of the {{pack.kind}} before pricing.", "Offers are made on the form bound in this document and returned in the sealed envelope provided.", "The successful bidder obtains the regulator's {{permit.type}} before the works start."]) },
  { id: `${P}dt10`, code: "demo_form_of_offer", nameEn: "Demo form of offer", formCode: "DEMO-F-103", bodyEn: body("Form of offer: {{exercise.reference}}", ["We offer to carry out {{exercise.title}} for the sum stated in our priced bill or schedule, on the terms of {{pack.form}}.", "Signed for and on behalf of the bidder, in the presence of a witness."]) },
  { id: `${P}dt11`, code: "demo_conditions_bq", nameEn: "Demo conditions of contract (bill of quantities)", formCode: "DEMO-F-110", bodyEn: body("Conditions of contract where a bill of quantities forms part of the contract", ["These conditions govern {{contract.type}} work on {{exercise.title}}.", "The Appendix to these conditions states the officers empowered, the insurances, the liquidated damages and the defects liability period.", "{{clause:demo_integrity}}"]) },
  { id: `${P}dt12`, code: "demo_conditions_ds", nameEn: "Demo conditions of contract (drawings and specification)", formCode: "DEMO-F-111", bodyEn: body("Conditions of contract where drawings and specification form part of the contract", ["These conditions govern {{contract.type}} work on {{exercise.title}}.", "The Appendix to these conditions states the officers empowered, the insurances, the liquidated damages and the defects liability period.", "{{clause:demo_integrity}}"]) },
] as const;

type PartRow = { id: string; code: string; packKind: "TENDER" | "QUOTATION"; contractBasisCode?: string; printedNumber: string; sortOrder: number; labelEn: string; role: string; content: "STANDARD" | "BESPOKE" | "MIXED"; source: "TEMPLATE" | "BQ_UNPRICED" | "APPENDIX" | "UPLOAD"; mandatory: boolean; inTableDocument: boolean; templateCode?: string; ownerOrgUnitCode?: string };
const part = (n: number, x: Omit<PartRow, "id">): PartRow => ({ id: `${P}tdp${n}`, ...x });
const PARTS: PartRow[] = [
  part(1, { code: "demo_t_invitation", packKind: "TENDER", printedNumber: "1", sortOrder: 10, labelEn: "Notice of invitation to tender", role: "INVITATION", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: false, templateCode: "demo_notice" }),
  part(2, { code: "demo_t_form", packKind: "TENDER", printedNumber: "2", sortOrder: 20, labelEn: "Form of tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, templateCode: "demo_form_of_offer" }),
  part(3, { code: "demo_t_conditions_bq", packKind: "TENDER", contractBasisCode: "bq", printedNumber: "3", sortOrder: 30, labelEn: "Conditions of contract", role: "CONDITIONS", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, templateCode: "demo_conditions_bq" }),
  part(4, { code: "demo_t_conditions_ds", packKind: "TENDER", contractBasisCode: "ds", printedNumber: "3", sortOrder: 30, labelEn: "Conditions of contract", role: "CONDITIONS", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, templateCode: "demo_conditions_ds" }),
  part(5, { code: "demo_t_appendix", packKind: "TENDER", printedNumber: "3a", sortOrder: 31, labelEn: "Appendix to the conditions of contract", role: "APPENDIX", content: "BESPOKE", source: "APPENDIX", mandatory: true, inTableDocument: true }),
  part(6, { code: "demo_t_loa", packKind: "TENDER", printedNumber: "4", sortOrder: 40, labelEn: "Specimen letter of acceptance", role: "LOA_SPECIMEN", content: "STANDARD", source: "UPLOAD", mandatory: true, inTableDocument: false }),
  part(7, { code: "demo_t_bond", packKind: "TENDER", printedNumber: "5", sortOrder: 50, labelEn: "Performance bond forms", role: "BOND_FORMS", content: "STANDARD", source: "UPLOAD", mandatory: true, inTableDocument: true }),
  part(8, { code: "demo_t_specification", packKind: "TENDER", printedNumber: "6", sortOrder: 60, labelEn: "Specification", role: "SPECIFICATION", content: "MIXED", source: "UPLOAD", mandatory: true, inTableDocument: true, ownerOrgUnitCode: "NTH" }),
  part(9, { code: "demo_t_bq", packKind: "TENDER", contractBasisCode: "bq", printedNumber: "7a", sortOrder: 70, labelEn: "Bill of quantities", role: "BILL_OF_QUANTITIES", content: "BESPOKE", source: "BQ_UNPRICED", mandatory: true, inTableDocument: true }),
  part(10, { code: "demo_t_rates", packKind: "TENDER", contractBasisCode: "ds", printedNumber: "7b", sortOrder: 71, labelEn: "Summary of tender and schedule of rates", role: "SUMMARY_AND_RATES", content: "BESPOKE", source: "UPLOAD", mandatory: true, inTableDocument: true }),
  part(11, { code: "demo_t_registration", packKind: "TENDER", printedNumber: "8", sortOrder: 80, labelEn: "Bidder's registration and background form", role: "REGISTRATION_BACKGROUND", content: "STANDARD", source: "UPLOAD", mandatory: true, inTableDocument: false }),
  part(12, { code: "demo_t_declaration", packKind: "TENDER", printedNumber: "9", sortOrder: 90, labelEn: "Bidder's declaration and letter of authorisation", role: "DECLARATION", content: "STANDARD", source: "UPLOAD", mandatory: true, inTableDocument: false }),
  part(13, { code: "demo_t_drawings", packKind: "TENDER", printedNumber: "10", sortOrder: 100, labelEn: "Drawings", role: "DRAWINGS", content: "BESPOKE", source: "UPLOAD", mandatory: true, inTableDocument: true, ownerOrgUnitCode: "NTH" }),
  part(14, { code: "demo_t_instructions", packKind: "TENDER", printedNumber: "11", sortOrder: 110, labelEn: "Instructions to tenderers", role: "INSTRUCTIONS", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: false, templateCode: "demo_instructions" }),
  part(15, { code: "demo_q_notice", packKind: "QUOTATION", printedNumber: "1", sortOrder: 10, labelEn: "Notice of quotation", role: "INVITATION", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: false, templateCode: "demo_notice" }),
  part(16, { code: "demo_q_instructions", packKind: "QUOTATION", printedNumber: "2", sortOrder: 20, labelEn: "Instructions to bidders", role: "INSTRUCTIONS", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: false, templateCode: "demo_instructions" }),
  part(17, { code: "demo_q_conditions_bq", packKind: "QUOTATION", contractBasisCode: "bq", printedNumber: "3", sortOrder: 30, labelEn: "Conditions of quotation", role: "CONDITIONS", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, templateCode: "demo_conditions_bq" }),
  part(18, { code: "demo_q_appendix", packKind: "QUOTATION", printedNumber: "3a", sortOrder: 31, labelEn: "Appendix to the conditions", role: "APPENDIX", content: "BESPOKE", source: "APPENDIX", mandatory: true, inTableDocument: true }),
  part(19, { code: "demo_q_specification", packKind: "QUOTATION", printedNumber: "4", sortOrder: 40, labelEn: "Specification of works", role: "SPECIFICATION", content: "MIXED", source: "UPLOAD", mandatory: true, inTableDocument: true, ownerOrgUnitCode: "NTH" }),
  part(20, { code: "demo_q_form", packKind: "QUOTATION", printedNumber: "5", sortOrder: 50, labelEn: "Form of quotation", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, templateCode: "demo_form_of_offer" }),
  part(21, { code: "demo_q_bq", packKind: "QUOTATION", contractBasisCode: "bq", printedNumber: "6", sortOrder: 60, labelEn: "Bill of quantities", role: "BILL_OF_QUANTITIES", content: "BESPOKE", source: "BQ_UNPRICED", mandatory: true, inTableDocument: true }),
  part(22, { code: "demo_q_bond", packKind: "QUOTATION", printedNumber: "7", sortOrder: 70, labelEn: "Performance bond forms", role: "BOND_FORMS", content: "STANDARD", source: "UPLOAD", mandatory: true, inTableDocument: true }),
  part(23, { code: "demo_q_declaration", packKind: "QUOTATION", printedNumber: "8", sortOrder: 80, labelEn: "Bidder's declaration and letter of authorisation", role: "DECLARATION", content: "STANDARD", source: "UPLOAD", mandatory: true, inTableDocument: false }),
  part(24, { code: "demo_q_drawings", packKind: "QUOTATION", printedNumber: "9", sortOrder: 90, labelEn: "Drawings", role: "DRAWINGS", content: "BESPOKE", source: "UPLOAD", mandatory: true, inTableDocument: true, ownerOrgUnitCode: "NTH" }),
  part(25, { code: "demo_q_conditions_ds", packKind: "QUOTATION", contractBasisCode: "ds", printedNumber: "3", sortOrder: 30, labelEn: "Conditions of quotation", role: "CONDITIONS", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, templateCode: "demo_conditions_ds" }),
];

/// 6.7 (6.6 ruling): the parts a bidder returns with its bid, invented for the demo and ASSUMED (the
/// customer's list is a go-live question): the form, the priced bill or schedule, the registration
/// form and the declaration. Snapshotted onto each pack part when its pack starts.
const RETURNED_ROLES: readonly string[] = ["FORM_OF_TENDER", "BILL_OF_QUANTITIES", "SUMMARY_AND_RATES", "REGISTRATION_BACKGROUND", "DECLARATION"];

const DEMO_POLICY_ID = `${P}tdpol1`;
const DEMO_POLICY = {
  ladDailyPct: "0.05", ladDailyPctProvenance: "ASSUMED" as const,
  firstCertificateFloor: "2500.00", firstCertificatePct: "5", firstCertificateProvenance: "ASSUMED" as const,
  insuranceExtraMonths: 2, insuranceExtraDays: 0, insuranceExtraProvenance: "ASSUMED" as const,
  governingSource: "Demo policy 6 (invented)",
  notes: "Invented demo values, not a recommendation.",
  // Increment 2: invented wording, never a customer's (6.4 condition).
  restrictionLabelEn: "Restricted to bidders on the demo priority register",
  restrictionStampTextEn: "DEMO RESTRICTED TENDER: PRIORITY REGISTER BIDDERS ONLY",
  restrictionStampTextMs: "TENDER TERHAD DEMO: PEMBIDA DAFTAR KEUTAMAAN SAHAJA",
  restrictionProvenance: "ASSUMED" as const,
  assuranceRequired: true,
  assuranceProvenance: "ASSUMED" as const,
  regulatorPermitTaxonomyCode: "demo_permits",
};

/// Increment 2's configuration (invented, ASSUMED).
const BODIES = [
  { id: `${P}rb1`, code: "demo_companies", labelEn: "the Demo Companies Registry", labelMs: "Pendaftar Syarikat Demo", qualifierLabelEn: null, sortOrder: 1 },
  { id: `${P}rb2`, code: "demo_contractors", labelEn: "the Demo Contractors Board", labelMs: null, qualifierLabelEn: "Grade and category", sortOrder: 2 },
  { id: `${P}rb3`, code: "demo_suppliers", labelEn: "the Demo Supplier Register", labelMs: null, qualifierLabelEn: "Field codes", sortOrder: 3 },
];
const CLAUSE = {
  id: `${P}cl1`, code: "demo_integrity", titleEn: "Demo integrity clause", titleMs: "Klausa integriti demo",
  bodyEn: "Integrity (demo clause). The Contractor shall not offer, give or agree to give any gift or benefit to any officer of the Employer in connection with this Contract. A breach entitles the Employer to end the Contract.",
  bodyMs: "Integriti (klausa demo). Kontraktor tidak boleh menawarkan, memberi atau bersetuju memberi apa-apa hadiah atau faedah kepada mana-mana pegawai Majikan berhubung dengan Kontrak ini.",
  mandatoryInAgreements: true, sortOrder: 1,
};
const PERMITS = { id: `${P}tx4`, code: "demo_permits", nameEn: "Demo regulator permits", values: [{ id: `${P}tv9`, code: "class_1", nameEn: "Demo permit class 1", nameMs: "Permit demo kelas 1" }, { id: `${P}tv10`, code: "class_2", nameEn: "Demo permit class 2", nameMs: "Permit demo kelas 2" }, { id: `${P}tv11`, code: "class_3", nameEn: "Demo permit class 3" }] };

const METHOD_PACKS: Record<string, "TENDER" | "QUOTATION" | "NONE"> = {
  [`${P}sm1`]: "TENDER", [`${P}sm5`]: "TENDER",
  [`${P}sm2`]: "QUOTATION", [`${P}sm6`]: "QUOTATION", [`${P}sm8`]: "QUOTATION",
  [`${P}sm3`]: "NONE", [`${P}sm7`]: "NONE", [`${P}sm9`]: "NONE", [`${P}sm4`]: "NONE",
};

// ------------------------------------------------------------------ the trail

type Entry = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; changes: object[]; reason: string; unattributed: boolean };

export async function loadTenderDocs(db: Db, organisationId: string) {
  const trail: Entry[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason = "") =>
    trail.push({ id: `${P}tdau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });

  // ---- configuration (dated before the first pack: 15 September)
  const configured = at("2026-09-15T09:00");
  await db.documentTemplate.createMany({ data: TEMPLATES.map((t, i) => ({ ...t, organisationId, documentClassId: `${P}dc1`, revisionDate: day("2026-06-01"), bodyVersion: 1, provenance: "ASSUMED" as const, sortOrder: 8 + i, notes: "Invented demo text." })) });
  for (const t of TEMPLATES) entry("DocumentTemplate", t.id, t.nameEn, "CREATE", configured, diffFields(null, { code: t.code, nameEn: t.nameEn, formCode: t.formCode, textVersion: 1, whereItComesFrom: "Assumed" }));
  await db.tenderDocumentPart.createMany({ data: PARTS.map((p) => ({ ...p, organisationId, role: p.role as never, governingSource: "Demo policy 6 (invented)", provenance: "ASSUMED" as const, returnedByBidder: RETURNED_ROLES.includes(p.role), returnedByBidderProvenance: "ASSUMED" as const })) });
  for (const p of PARTS) entry(ENTITY.config, p.id, `Tender document part · ${p.labelEn}`, "CREATE", configured, diffFields(null, { documentPack: PACK_KIND_LABEL[p.packKind], printedNumber: p.printedNumber, labelEn: p.labelEn, returnedByTheBidder: RETURNED_ROLES.includes(p.role) ? "Yes" : "No", whereItComesFrom: "Assumed" }));
  if (!(await db.tenderDocumentPolicy.findUnique({ where: { organisationId } }))) {
    await db.tenderDocumentPolicy.create({ data: { id: DEMO_POLICY_ID, organisationId, ...DEMO_POLICY } });
    entry(ENTITY.policy, DEMO_POLICY_ID, "Tender documents policy", "CREATE", configured, diffFields(null, { ladDailyRate: "0.05%", firstCertificateFloor: "RM2,500.00", firstCertificatePercentage: "5%", insuranceBeyondDefectsPeriod: "2 months 0 days", restrictionAskedAs: DEMO_POLICY.restrictionLabelEn, restrictionStampEn: DEMO_POLICY.restrictionStampTextEn, restrictionStampMs: DEMO_POLICY.restrictionStampTextMs, assuranceRequired: "Yes", regulatorPermitList: PERMITS.nameEn, whereItComesFrom: "Assumed" }));
  }
  // Increment 2: registration bodies, the clause, the permit list (all invented, ASSUMED).
  await db.registrationBody.createMany({ data: BODIES.map((b) => ({ ...b, organisationId, governingSource: "Demo policy 6 (invented)", provenance: "ASSUMED" as const })) });
  for (const b of BODIES) entry("RegistrationBody", b.id, `Registration body · ${b.labelEn}`, "CREATE", configured, diffFields(null, { code: b.code, name: b.labelEn, statedWithIt: b.qualifierLabelEn ?? "Nothing", whereItComesFrom: "Assumed" }));
  await db.clauseText.create({ data: { ...CLAUSE, organisationId, bodyVersion: 1, governingSource: "Demo policy 6 (invented)", provenance: "ASSUMED", createdAt: configured } });
  entry("ClauseText", CLAUSE.id, `Clause · ${CLAUSE.titleEn}`, "CREATE", configured, diffFields(null, { code: CLAUSE.code, title: CLAUSE.titleEn, textVersion: 1, everyAgreementCarriesIt: "Yes", whereItComesFrom: "Assumed" }));
  await db.classificationTaxonomy.create({ data: { id: PERMITS.id, organisationId, code: PERMITS.code, nameEn: PERMITS.nameEn, provenance: "ASSUMED", sortOrder: 9, values: { create: PERMITS.values.map((v, i) => ({ ...v, sortOrder: i + 1 })) } } });
  entry("ClassificationTaxonomy", PERMITS.id, PERMITS.nameEn, "CREATE", configured, diffFields(null, { code: PERMITS.code, name: PERMITS.nameEn, values: PERMITS.values.map((v) => v.nameEn).join(", "), whereItComesFrom: "Assumed" }));
  for (const [id, kind] of Object.entries(METHOD_PACKS)) {
    const m = await db.sourcingMethod.update({ where: { id }, data: { documentPackKind: kind, documentPackKindProvenance: "ASSUMED" }, select: { nameEn: true } });
    entry("SourcingMethod", id, m.nameEn, "UPDATE", configured, diffFields({ documentPack: "Not set" }, { documentPack: PACK_KIND_LABEL[kind], documentPackComesFrom: "Assumed" }));
  }
  // Approval for Tendering (FR-DOC-012): the customer's rows; here the demo's, invented.
  const rule = (id: number, method: string, label: string) => ({
    id: `${P}rule${id}`, authorityMatrixId: `${P}mx1`, ruleKey: `demo.tendering.${method}`, domain: TENDERING_DOMAIN, method, labelEn: label, approverCode: "HOD_CP", clause: "DEMO 4.1", sortOrder: id,
    generateCoreChain: false, coreChainReason: "One office approves the documents for tendering: nothing to generate (demo).",
  });
  await db.authorityRule.createMany({ data: [rule(40, "quotation", "Approval for tendering, quotation"), rule(41, "specialist", "Approval for tendering, specialist or sole source")] });

  // ---- the exercises into preparation, as the 6.3 move writes it
  // Each needs its report form chosen first (works on a bill: works, not design and build), as sx4's was.
  const works = { report: "works" };
  await moveIntoPreparation(db, organisationId, `${P}sx1`, "2026-09-15", works, entry);
  await moveIntoPreparation(db, organisationId, `${P}sx5`, "2026-09-24", works, entry);
  await moveIntoPreparation(db, organisationId, `${P}sx15`, "2026-09-26", works, entry);

  // ---- the files the uploaded parts hold
  const docs: DemoDoc[] = [];
  const file = (n: number, title: string, partId: string, ownerLabel: string, attachedAt: string, extra: Partial<DemoDoc["attachments"][number]> = {}): void => {
    docs.push({
      id: `${P}doc${n}`, title, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL", createdAt: attachedAt,
      versions: [{ id: `${P}doc${n}v1`, n: 1, bytes: demoPdf([title, "Tender document part (demo)."]), mediaType: "application/pdf", filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: attachedAt.slice(0, 10), storedAt: attachedAt }],
      attachments: [{ id: `${P}doc${n}a1`, purpose: "TENDER_PART", owner: { tenderPackPartId: partId }, ownerLabel, versionId: `${P}doc${n}v1`, at: attachedAt, ...extra }],
    });
  };
  const partId = (pack: string, code: string) => `${pack}_${code}`;
  const ownerOf = (ref: string, v: number, printed: string, label: string) => `${ref} · Tender pack v${v} · part ${printed}, ${label}`;
  const uploads = (pack: string, ref: string, v: number, first: number, on: string, drawingsTitle: string) => {
    file(first, `Specification of works, ${ref}`, partId(pack, "demo_q_specification"), ownerOf(ref, v, "4", "Specification of works"), `${on}T10:00`);
    file(first + 1, `Performance bond forms, ${ref}`, partId(pack, "demo_q_bond"), ownerOf(ref, v, "7", "Performance bond forms"), `${on}T10:05`);
    file(first + 2, `Bidder's declaration and letter of authorisation, ${ref}`, partId(pack, "demo_q_declaration"), ownerOf(ref, v, "8", "Bidder's declaration and letter of authorisation"), `${on}T10:10`);
    file(first + 3, drawingsTitle, partId(pack, "demo_q_drawings"), ownerOf(ref, v, "9", "Drawings"), `${on}T10:15`);
  };

  // sx1: started 25 September, submitted that afternoon, approved on the 28th.
  await startPack(db, organisationId, { id: `${P}tpk1`, exerciseId: `${P}sx1`, versionNo: 1, at: at("2026-09-25T09:00") }, entry);
  uploads(`${P}tpk1`, "DEMO/SX/0001/2026", 1, 11, "2026-09-25", "Filter house drawings, DEMO/SX/0001/2026");
  // sx5: v1 started 26 September, submitted the 29th after the estimate was lodged, returned on the 30th.
  await startPack(db, organisationId, { id: `${P}tpk2`, exerciseId: `${P}sx5`, versionNo: 1, at: at("2026-09-26T09:00") }, entry);
  uploads(`${P}tpk2`, "DEMO/SX/0005/2026", 1, 15, "2026-09-26", "Roof and tank fittings drawings, DEMO/SX/0005/2026");
  // sx15: started 28 September, submitted 1 October once its scope was approved.
  await startPack(db, organisationId, { id: `${P}tpk4`, exerciseId: `${P}sx15`, versionNo: 1, at: at("2026-09-28T09:00") }, entry);
  uploads(`${P}tpk4`, "DEMO/SX/0015/2026", 1, 19, "2026-09-28", "FRP tank panel layout, DEMO/SX/0015/2026");
  const docEntry = await writeDemoDocs(db, organisationId, docs, `${P}tdocau`, { id: `${P}p3`, name: "Chen Wei Ling" });
  await docEntry.flush();

  // The Appendices (FR-DOC-004): sx1's and sx15's complete, sx5's v1 complete.
  const completeAppendix = { ladOfficerRoleCode: "HOD_CP", eotOfficerRoleCode: "HOD_CP", terminationOfficerRoleCode: "CEO", warRiskOfficerRoleCode: "CEO", arbitrationOfficerRoleCode: "CEO", pcSumWorksApply: false, tplMinimum: "500000.00", wcMinimum: "250000.00", worksInsuranceUpliftKind: "PERCENT" as const, worksInsuranceUpliftPct: "10", insuranceExcess: "5000.00", ladKind: "PERCENT_OF_SUM_PER_DAY" as const, ladPct: "0.05", sectionalCompletion: false, dlpApplies: true, dlpMonths: 12, firstInterimMinimum: "2500.00", subsequentInterimMinimum: "2500.00", honourCertificateDays: 30 };
  for (const [pack, ref, when] of [[`${P}tpk1`, "DEMO/SX/0001/2026", "2026-09-25T11:00"], [`${P}tpk2`, "DEMO/SX/0005/2026", "2026-09-27T11:00"], [`${P}tpk4`, "DEMO/SX/0015/2026", "2026-09-28T11:00"]] as const) {
    await enterAppendix(db, organisationId, pack, ref, completeAppendix, at(when), entry);
  }
  // Increment 2: each exercise's conditions, recorded the day its pack was started, as the tab's actions write them.
  const reg = (ex: string, ref: string, when: string, rows: { body: string; qualifiers?: string; group: number }[]) => conditionsFor(db, organisationId, ex, ref, rows, at(when), entry);
  await reg(`${P}sx1`, "DEMO/SX/0001/2026", "2026-09-25T10:30", [{ body: "demo_companies", group: 1 }, { body: "demo_contractors", qualifiers: "grade D4, category civil works", group: 2 }, { body: "demo_suppliers", qualifiers: "field code 220101", group: 2 }]);
  await answer(db, organisationId, `${P}sx1`, "DEMO/SX/0001/2026", { restrictedTender: false, regulatedActivity: true, regulatorPermitCode: "class_2" }, at("2026-09-25T10:40"), entry);
  await reg(`${P}sx5`, "DEMO/SX/0005/2026", "2026-09-26T10:30", [{ body: "demo_companies", group: 1 }, { body: "demo_contractors", qualifiers: "grade D3, category mechanical works", group: 2 }]);
  await answer(db, organisationId, `${P}sx5`, "DEMO/SX/0005/2026", { restrictedTender: false, regulatedActivity: true, regulatorPermitCode: "class_1" }, at("2026-09-26T10:40"), entry);
  await reg(`${P}sx15`, "DEMO/SX/0015/2026", "2026-09-28T10:30", [{ body: "demo_companies", group: 1 }, { body: "demo_contractors", qualifiers: "grade D5, category specialist tank works", group: 2 }]);
  await answer(db, organisationId, `${P}sx15`, "DEMO/SX/0015/2026", { restrictedTender: true, regulatedActivity: true, regulatorPermitCode: "class_3" }, at("2026-09-28T10:40"), entry);
  // Assurance (FR-DOC-014): both confirmations on each pack before it went, by named officers.
  for (const [pack, ref, on, when] of [[`${P}tpk1`, "DEMO/SX/0001/2026", "2026-09-25", "2026-09-25T13:00"], [`${P}tpk2`, "DEMO/SX/0005/2026", "2026-09-29", "2026-09-29T11:00"], [`${P}tpk4`, "DEMO/SX/0015/2026", "2026-09-30", "2026-09-30T16:00"]] as const) {
    await confirm(db, organisationId, pack, ref, "NO_AMBIGUITY", `${P}p4`, on, at(when), entry);
    await confirm(db, organisationId, pack, ref, "DRAWINGS_COORDINATED", `${P}p10`, on, at(when), entry);
  }
  // Every part ready, in the afternoon of the day it was started (each its own act).
  for (const [pack, ref, when] of [[`${P}tpk1`, "DEMO/SX/0001/2026", "2026-09-25T12:00"], [`${P}tpk2`, "DEMO/SX/0005/2026", "2026-09-27T12:00"], [`${P}tpk4`, "DEMO/SX/0015/2026", "2026-09-28T12:00"]] as const) {
    await markAllReady(db, organisationId, pack, ref, at(when), entry);
  }

  await submit(db, organisationId, { packId: `${P}tpk1`, routeId: `${P}ai60`, at: at("2026-09-25T15:00"), startOn: "2026-10-12", closingDay: "2026-10-29", closingTime: "14:30" }, entry);
  await decide(db, organisationId, { packId: `${P}tpk1`, decision: "DONE", personId: `${P}p3`, decidedOn: "2026-09-28", at: at("2026-09-28T10:00"), reason: "", dates: { startOn: "2026-10-12", closingDay: "2026-10-29", closingTime: "14:30" } }, entry);

  await submit(db, organisationId, { packId: `${P}tpk2`, routeId: `${P}ai61b`, at: at("2026-09-29T15:00"), startOn: "2026-10-05", closingDay: "2026-10-20", closingTime: "12:00" }, entry);
  await decide(db, organisationId, { packId: `${P}tpk2`, decision: "REJECTED", personId: `${P}p3`, decidedOn: "2026-09-30", at: at("2026-09-30T08:30"), reason: "Drawings missing the valve schedule." }, entry);
  // v2, continuing v1 as startPack writes it: parts, files and Appendix carried.
  await startPack(db, organisationId, { id: `${P}tpk3`, exerciseId: `${P}sx5`, versionNo: 2, at: at("2026-09-30T08:45"), copyFrom: `${P}tpk2` }, entry);
  // The carried drawings lack the valve schedule: taken off and the part reopened, a revised set awaited.
  await reworkDrawings(db, organisationId, `${P}tpk3`, "DEMO/SX/0005/2026", at("2026-09-30T10:30"), entry);
  // The Appendix being revised: liquidated damages restated as an amount a day (not yet entered),
  // and sectional completion now applying, its sections not yet entered. Half filled.
  await reviseAppendix(db, organisationId, `${P}tpk3`, "DEMO/SX/0005/2026", { ladKind: "AMOUNT_PER_DAY", ladPct: null, ladAmount: null, sectionalCompletion: true }, at("2026-09-30T11:00"), entry);

  await submit(db, organisationId, { packId: `${P}tpk4`, routeId: `${P}ai61`, at: at("2026-10-01T09:30"), startOn: "2026-10-08", closingDay: "2026-10-22", closingTime: "12:00" }, entry);

  await db.auditEntry.createMany({ data: trail as never });
}

// ------------------------------------------------------------------ the acts, as the actions write them
// Exported for 6.5's demo (demo-window.ts), which takes its own exercises through the same acts
// before their invitation windows; `confirm` is judged against the day it is given (the load day).

export type Add = (entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason?: string) => void;

/// Move a draft exercise into preparation as moveToPreparation does: the same checks, the decided record, the pack kind.
export async function moveIntoPreparation(db: Db, organisationId: string, id: string, on: string, choices: Record<string, string>, entry: Add) {
  const repo = await import("../src/lib/method/repo");
  const { evaluateExercise } = await import("../src/lib/method/evaluate");
  const { transitionFault } = await import("../src/lib/method/exercise");
  const snap = await import("../src/lib/method/snapshot");
  const { behaviourProfile } = await import("../src/lib/method/profile");
  const { auditPair } = await import("../src/lib/method/audit-view");
  // An ambiguous classification is chosen first, as the Contract type tab records it.
  const first = await repo.loadExercise(await demoOrgId(), id);
  if (!first) throw new Error(`Demo exercise ${id} did not load.`);
  const firstCtx = await repo.evaluationContext(first.org, first.req, first.ex);
  for (const t of evaluateExercise(repo.draftOf(first.ex), firstCtx.ctx!).taxonomies.filter((x) => x.state === "AMBIGUOUS")) {
    const value = choices[t.taxonomyCode];
    if (!value || !t.candidates.includes(value)) throw new Error(`Demo exercise ${id}: no choice for its ambiguous ${t.taxonomyCode}.`);
    const tax = firstCtx.cfg.config.taxonomies.find((x) => x.code === t.taxonomyCode)!;
    const tvId = `${id}tv_${t.taxonomyCode}`;
    await db.exerciseTaxonomyValue.create({ data: { id: tvId, exerciseId: id, taxonomyCode: t.taxonomyCode, valueCode: value, pick: "CHOSEN" } });
    entry("ExerciseTaxonomyValue", tvId, `${first.ex.reference} · ${tax.nameEn}`, "CREATE", at(`${on}T08:30`), diffFields(null, { taxonomy: tax.nameEn, value: tax.values.find((v) => v.code === value)?.nameEn ?? value, pick: "CHOSEN" }));
  }
  const l = (await repo.loadExercise(await demoOrgId(), id))!;
  const { issue, cfg, ctx } = await repo.evaluationContext(l.org, l.req, l.ex);
  if (!issue || !ctx) throw new Error("No issue in force for the demo exercises.");
  const ev = evaluateExercise(repo.draftOf(l.ex), ctx);
  const t = transitionFault(l.ex.status, "DOCUMENTS_IN_PREPARATION", {
    today: on, methodSet: !!ev.method, typeSet: !!ev.type.code && !!ev.type.state, basisSet: !!l.ex.contractBasisCode, proposalRequired: ev.method?.requiresProposal ?? false, proposalState: l.ex.proposalState,
    ambiguousTaxonomies: ev.taxonomies.filter((x) => x.state === "AMBIGUOUS").length, blockingFaults: ev.findings.filter((f) => f.level === "block").length, packKind: ev.method?.documentPackKind ?? null,
  });
  if (t.length) throw new Error(`Demo exercise ${id} cannot move into preparation: ${t.map((f) => f.code).join(", ")}`);
  if (ev.method!.requiresDossier) throw new Error(`Demo exercise ${id}'s method keeps a dossier: number it as the move does before moving it.`);
  const decided = snap.classificationSnapshotOf(ev, cfg.config, l.ex.contractBasisCode, (c) => issue.matrix.roles[c]?.nameEn ?? "", behaviourProfile, {
    reasonName: cfg.config.reasons.find((r) => r.code === l.ex.justificationReasonCode)?.nameEn ?? null,
    appointment: { state: ev.bands.appointment.state, ruleLabel: ev.bands.appointment.ruleLabel },
  });
  if (!decided) throw new Error(`Demo exercise ${id} cannot be decided.`);
  const kind = ev.method!.documentPackKind!;
  const after = { status: "DOCUMENTS_IN_PREPARATION" as const, preparedAt: day(on), classificationSnapshot: decided as object, packKindSnapshot: kind };
  await db.sourcingExercise.update({ where: { id }, data: after });
  if (l.req.status === "APPROVED") {
    // The requisition's first exercise into preparation moves it into sourcing, through its own state machine (C1).
    const { moveRequisition } = await import("../src/lib/requisition/move");
    await moveRequisition(db as never, { id: l.req.id, status: "APPROVED" }, "SOURCING", { today: on });
    entry("Requisition", l.req.id, `${l.req.reference} · ${l.req.title}`, "UPDATE", at(`${on}T09:00`), diffFields({ status: "APPROVED" }, { status: "SOURCING" }), `Exercise ${l.ex.reference} moved into preparation.`);
  }
  entry("SourcingExercise", id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", at(`${on}T09:00`), [...auditPair(l.ex as unknown as Record<string, unknown>, { ...l.ex, ...after, classificationRecorded: "yes" }), ...diffFields({ documentPack: null }, { documentPack: PACK_KIND_LABEL[kind] })]);
}

/// Start a pack as startPack writes it: the composition resolved from configuration on the day, or carried from the returned version.
export async function startPack(db: Db, organisationId: string, p: { id: string; exerciseId: string; versionNo: number; at: Date; copyFrom?: string }, entry: Add) {
  const { loadConfiguredParts, loadTemplates, loadPacks } = await import("../src/lib/tender-docs/repo");
  const { startPackFaults, nextPack } = await import("../src/lib/tender-docs/pack");
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: p.exerciseId }, select: { reference: true, status: true, packKindSnapshot: true, contractBasisCode: true } });
  const onDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(p.at);
  const composition = resolveComposition(await loadConfiguredParts(organisationId), ex.packKindSnapshot!, ex.contractBasisCode, onDay);
  const packs = await loadPacks(p.exerciseId);
  const faults = startPackFaults({ exerciseStatus: ex.status, packKindSnapshot: ex.packKindSnapshot, packs, composition });
  if (faults.length || "fault" in composition) throw new Error(`Demo pack ${p.id} cannot start: ${faults.map((f) => f.code).join(", ")}`);
  const next = nextPack(packs);
  if (next.versionNo !== p.versionNo || (next.copyFrom?.id ?? undefined) !== p.copyFrom) throw new Error(`Demo pack ${p.id} is not the next version as startPack would make it.`);
  const templates = await loadTemplates(organisationId);
  const form = formLabel(composition.parts, (c) => templates.find((t) => t.code === c)?.nameEn ?? null);
  const basis = await db.contractBasis.findFirst({ where: { organisationId, code: ex.contractBasisCode! }, select: { nameEn: true } });
  await db.tenderPack.create({ data: { id: p.id, organisationId, exerciseId: p.exerciseId, versionNo: p.versionNo, status: "DRAFT", packKind: ex.packKindSnapshot!, contractBasisCode: ex.contractBasisCode!, compositionSnapshot: composition.parts as object, formLabelSnapshot: form, copiedFromPackId: p.copyFrom ?? null, createdAt: p.at } });
  entry(ENTITY.pack, p.id, `${ex.reference} · Tender documents v${p.versionNo}`, "CREATE", p.at, packCreatedAudit({ versionNo: p.versionNo, packKind: ex.packKindSnapshot!, basis: basis?.nameEn ?? null, form, parts: composition.parts.length, continues: next.copyFrom?.versionNo ?? null }));
  const was = next.copyFrom;
  for (const c of composition.parts) {
    const prior = was?.parts.find((x) => x.partCode === c.code) ?? null;
    const template = c.source === "TEMPLATE" && c.templateCode ? (templates.find((t) => t.code === c.templateCode) ?? null) : null;
    const id = `${p.id}_${c.code}`;
    const state = prior?.state ?? "NOT_STARTED";
    await db.tenderPackPart.create({ data: { id, organisationId, packId: p.id, partCode: c.code, printedNumber: c.printedNumber, sortOrder: c.sortOrder, labelSnapshot: c.labelEn, labelMsSnapshot: c.labelMs, role: c.role, content: c.content, source: c.source, mandatory: c.mandatory, inTableDocument: c.inTableDocument, returnedByBidder: c.returnedByBidder ?? null, returnedByBidderProvenance: c.returnedByBidderProvenance ?? null, ownerOrgUnitCode: c.ownerOrgUnitCode, templateCode: c.templateCode, templateId: template?.id ?? null, state } });
    entry(ENTITY.part, id, `${ex.reference} · Tender documents v${p.versionNo} · part ${c.printedNumber}`, "CREATE", p.at, partAudit(null, { printedNumber: c.printedNumber, label: c.labelEn, role: c.role, content: c.content, source: c.source, mandatory: c.mandatory, inTableDocument: c.inTableDocument, returnedByBidder: c.returnedByBidder ?? null, state, omittedReason: "", templateName: template?.nameEn ?? null }));
    // A returned version's files go with the part (the attach judged as startPack judges it).
    for (const a of prior?.attachments.filter((x) => x.detachedAt == null) ?? []) {
      const aid = `${id}_a${a.version.versionNo}`;
      await db.documentAttachment.create({ data: { id: aid, organisationId, purpose: "TENDER_PART", versionId: a.versionId, tenderPackPartId: id, attachedAt: p.at } });
      const owner = `${ex.reference} · Tender pack v${p.versionNo} · part ${c.printedNumber}, ${c.labelEn}`;
      entry("DocumentAttachment", aid, `${owner} · ${PURPOSE_LABEL.TENDER_PART}`, "CREATE", p.at, diffFields(null, { purpose: PURPOSE_LABEL.TENDER_PART, document: a.version.document.title, version: a.version.versionNo, fingerprint: a.version.sha256, attachedTo: owner }));
    }
  }
  if (was?.appendix) {
    const { variationLimits, sections, id: _i, packId: _p, createdAt: _c, updatedAt: _u, organisationId: _o, status: _s, ...fields } = was.appendix;
    void _i; void _p; void _c; void _u; void _o; void _s;
    const aid = `${p.id}_appendix`;
    await db.conditionsAppendix.create({ data: { id: aid, organisationId, packId: p.id, ...fields, status: "DRAFT", createdAt: p.at } });
    for (const v of variationLimits) await db.appendixVariationLimit.create({ data: { id: `${aid}_vl${v.sortOrder}`, organisationId, appendixId: aid, roleCode: v.roleCode, committeeCode: v.committeeCode, label: v.label, limit: v.limit, sortOrder: v.sortOrder } });
    for (const s of sections) await db.appendixSection.create({ data: { id: `${aid}_s${s.sortOrder}`, organisationId, appendixId: aid, description: s.description, ladKind: s.ladKind, ladAmount: s.ladAmount, ladPct: s.ladPct, sortOrder: s.sortOrder } });
  } else if (composition.parts.some((c) => c.role === "APPENDIX")) {
    await db.conditionsAppendix.create({ data: { id: `${p.id}_appendix`, organisationId, packId: p.id, status: "DRAFT", createdAt: p.at } });
  }
}

const officeNames = async (db: Db, organisationId: string) => {
  const roles = await db.authorityRole.findMany({ where: { organisationId }, select: { code: true, nameEn: true } });
  return (code: string | null) => (code ? (roles.find((r) => r.code === code)?.nameEn ?? "An office no longer configured") : "Not set");
};

/// Enter the Appendix as saveAppendix and saveVariationLimit write it.
export async function enterAppendix(db: Db, organisationId: string, packId: string, ref: string, v: Record<string, unknown>, when: Date, entry: Add) {
  const { loadPacks, appendixFactsOf } = await import("../src/lib/tender-docs/repo");
  const office = await officeNames(db, organisationId);
  const pack = await db.tenderPack.findUniqueOrThrow({ where: { id: packId }, select: { exerciseId: true, versionNo: true } });
  const aid = `${packId}_appendix`;
  const before = appendixFactsOf((await loadPacks(pack.exerciseId)).find((x) => x.id === packId)!.appendix!);
  const label = (c: unknown) => (typeof c === "string" ? office(c) : null);
  await db.conditionsAppendix.update({ where: { id: aid }, data: { ...v, ladOfficerLabel: label(v.ladOfficerRoleCode), eotOfficerLabel: label(v.eotOfficerRoleCode), terminationOfficerLabel: label(v.terminationOfficerRoleCode), warRiskOfficerLabel: label(v.warRiskOfficerRoleCode), arbitrationOfficerLabel: label(v.arbitrationOfficerRoleCode) } });
  await db.appendixVariationLimit.create({ data: { id: `${aid}_vl1`, organisationId, appendixId: aid, roleCode: "HOD_CP", label: office("HOD_CP"), limit: "20000.00", sortOrder: 1 } });
  const after = appendixFactsOf((await loadPacks(pack.exerciseId)).find((x) => x.id === packId)!.appendix!);
  const status = appendixComplete(after) ? "COMPLETE" : "DRAFT";
  await db.conditionsAppendix.update({ where: { id: aid }, data: { status } });
  entry(ENTITY.appendix, aid, `${ref} · Tender documents v${pack.versionNo} · Appendix`, "UPDATE", when, appendixAudit(before, { ...after, status }, office));
}

/// Mark every part ready, each judged by markReadyFaults as the action judges it.
export async function markAllReady(db: Db, organisationId: string, packId: string, ref: string, when: Date, entry: Add) {
  const { loadPacks, partFactsOf, appendixFactsOf, scopeReadiness } = await import("../src/lib/tender-docs/repo");
  const { markReadyFaults } = await import("../src/lib/tender-docs/pack");
  const pack = await db.tenderPack.findUniqueOrThrow({ where: { id: packId }, select: { exerciseId: true } });
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: pack.exerciseId }, select: { id: true, status: true, sourcingMethodCode: true, contractBasisCode: true } });
  const row = (await loadPacks(pack.exerciseId)).find((x) => x.id === packId)!;
  const scope = await scopeReadiness(organisationId, ex);
  // The clause citations a template may make, as markPartReady reads them (increment 2).
  const { liveClauses } = await import("../src/lib/tender-docs/clauses");
  const { packWhitelist } = await import("../src/lib/tender-docs/fields");
  const { loadClauses } = await import("../src/lib/tender-docs/repo");
  const whitelist = packWhitelist(liveClauses(await loadClauses(organisationId), "2026-10-01"));
  const content = { bqFinalised: scope.bill != null, appendixComplete: row.appendix ? appendixComplete(appendixFactsOf(row.appendix)) : null, whitelist };
  for (const p of row.parts.filter((x) => x.state === "NOT_STARTED")) {
    const f = markReadyFaults(partFactsOf(p), row.status, ex.status, content);
    if (f.length) throw new Error(`Demo part ${p.id} cannot be made ready: ${f.map((x) => x.code).join(", ")}`);
    await db.tenderPackPart.update({ where: { id: p.id }, data: { state: "READY" } });
    const facts = { printedNumber: p.printedNumber, label: p.labelSnapshot, role: p.role, content: p.content, source: p.source, mandatory: p.mandatory, inTableDocument: p.inTableDocument, omittedReason: "", templateName: p.template?.nameEn ?? null };
    entry(ENTITY.part, p.id, `${ref} · Tender documents v${row.versionNo} · part ${p.printedNumber}`, "UPDATE", when, partAudit({ ...facts, state: "NOT_STARTED" }, { ...facts, state: "READY" }));
  }
}

/// Submit as submitPack does: every submission check on the rows as they stand, the freeze, the route.
export async function submit(db: Db, organisationId: string, s: { packId: string; routeId: string; at: Date; startOn: string; closingDay: string; closingTime: string }, entry: Add) {
  const repo = await import("../src/lib/method/repo");
  const { loadRoster, loadDelegations } = await import("../src/lib/people/load");
  const { holdersFor } = await import("../src/lib/requisition/holders");
  const { requesterHolding, tenderingRoutesOf } = await import("../src/lib/method/approval");
  const { pathTo } = await import("../src/lib/organisation/structure");
  const { routeCoreFields, stepOrigin } = await import("../src/lib/authority/core-routing");
  const { boundaryOperatorFor } = await import("../src/lib/authority/resolve");
  const { transitionFault } = await import("../src/lib/method/exercise");
  const { ORGANISATION_CODE } = await import("../src/lib/org");
  const td = await import("../src/lib/tender-docs/repo");
  const pack0 = await db.tenderPack.findUniqueOrThrow({ where: { id: s.packId }, select: { exerciseId: true } });
  const l = (await repo.loadExercise(await demoOrgId(), pack0.exerciseId))!;
  const pack = (await td.loadPacks(l.ex.id)).find((x) => x.id === s.packId)!;
  const subDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(s.at);
  const scope = await td.scopeReadiness(organisationId, l.ex);
  const { issue, ctx, cfg } = await repo.evaluationContext(l.org, l.req, l.ex);
  const method = cfg.config.methods.find((m) => m.code === l.ex.sourcingMethodCode)!;
  const [roster, delegations, units] = [await loadRoster(ORGANISATION_CODE), await loadDelegations(ORGANISATION_CODE), await db.orgUnit.findMany({ where: { organisationId } })];
  const unitPath = pathTo(units as never, l.req.sectionUnitCode || l.req.requestingUnitCode, day(subDay)).reverse().map((u) => u.code);
  const value = parseSen(l.ex.estimatedValue.toString());
  const route = tenderingRouteForRequester(ctx!.funder, method, Number(l.ex.estimatedValue.toString()), requesterHolding((code) => holdersFor(code, unitPath, roster, delegations, subDay), l.req.requestingPersonId, value, (pid) => roster.people.some((p) => p.id === pid && p.isActive && p.isAvailable)));
  const dates = approvalDatesFault({ startOn: s.startOn, closingDay: s.closingDay, closingTime: s.closingTime, timeZone: l.org.timeZone, today: subDay });
  const appendix = pack.appendix ? td.appendixFactsOf(pack.appendix) : null;
  // Increment 2: the conditions as submitPack reads them, on the submission's day.
  const { liveClauses } = await import("../src/lib/tender-docs/clauses");
  const cond = await import("../src/lib/tender-docs/conditions");
  const { packWhitelist } = await import("../src/lib/tender-docs/fields");
  const conditions = await td.loadConditions(organisationId, l.ex, pack.id, subDay);
  const whitelist = packWhitelist(liveClauses(conditions.clauses.clauses, subDay));
  const findings = submitFaults({
    packStatus: pack.status, exerciseStatus: l.ex.status, parts: pack.parts.map(td.partFactsOf), content: { bqFinalised: scope.bill != null, appendixComplete: appendix ? appendixComplete(appendix) : null, whitelist },
    scope: scope.input, appendix, profile: td.profileOf(l.ex.classificationSnapshot), primeCostSums: scope.bill?.primeCostSums ?? null, dates: dates.faults,
    // SR-06, SR-07: the history is written as it was lived, before the notice and the officers were prepared on the exercise; `prisma/demo-officers.ts` names them afterwards.
    officers: [], notice: [],
    route: { issue: !!issue, state: route.tenderingState, refusal: route.refusal, errors: route.warnings.filter((w) => w.level === "err").map((w) => w.messageEn) },
    routeOpen: tenderingRoutesOf(l.ex.approvalInstances).some((i) => i.status === "PENDING"),
    conditions,
  });
  const blocks = blockingOf(findings);
  if (blocks.length) throw new Error(`Demo pack ${s.packId} fails its submission: ${blocks.map((f) => f.code).join(", ")}`);
  const office = await officeNames(db, organisationId);
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true } });
  const basis = await db.contractBasis.findFirst({ where: { organisationId, code: pack.contractBasisCode }, select: { nameEn: true } });
  const type = await db.contractType.findFirst({ where: { organisationId, code: l.ex.contractTypeCode ?? "" }, select: { nameEn: true } });
  const fields = packFieldValues({ organisationName: org.name, exerciseReference: l.ex.reference, exerciseTitle: l.ex.title, requisitionReference: l.req.reference, packKindLabel: PACK_KIND_LABEL[pack.packKind], versionNo: pack.versionNo, formLabel: pack.formLabelSnapshot, basisName: basis?.nameEn ?? null, typeName: type?.nameEn ?? null });
  const window = { startOn: s.startOn, closingDay: s.closingDay };
  const frozen = freezePack({ parts: pack.parts.map((p) => ({ ...td.partFactsOf(p), files: td.pinnedFilesOf(p) })), fields, fieldsByLanguage: cond.conditionFieldValues(conditions, window), whitelist, stamp: cond.conditionStamp(conditions), clauses: liveClauses(conditions.clauses.clauses, subDay), bill: scope.bill ? { versionId: scope.bill.versionId, frozen: scope.bill.frozen } : null, appendix: pack.appendix && appendix ? { id: pack.appendix.id, facts: appendix, text: appendixText(appendix, office) } : null });
  const ref = l.ex.reference;
  for (const [i, d] of frozen.documents.entries()) {
    const id = `${s.packId}_doc${i + 1}`;
    await db.tenderPackDocument.create({ data: { id, organisationId, packId: s.packId, partCode: d.partCode, source: d.source, templateId: d.templateId, templateCode: d.templateCode, templateName: d.templateName, templateFormCode: d.templateFormCode, templateRevisionDate: d.templateRevisionDate ? day(d.templateRevisionDate) : null, templateBodyVersion: d.templateBodyVersion, language: d.language, fields: JSON.parse(JSON.stringify(d.fields, (_k, x) => (typeof x === "bigint" ? x.toString() : x))), renderedText: d.renderedText, frozenAt: s.at } });
    const p = pack.parts.find((x) => x.partCode === d.partCode)!;
    entry(ENTITY.document, id, `${ref} · Tender documents v${pack.versionNo} · part ${p.printedNumber}`, "CREATE", s.at, diffFields(null, { part: `${p.printedNumber}. ${p.labelSnapshot}`, frozenFrom: d.templateName ? `${d.templateName}, text version ${d.templateBodyVersion}` : d.source === "BQ_UNPRICED" ? "The bill of quantities, unpriced" : "The Appendix as entered", language: d.language === "MS" ? "Malay" : "English" }));
  }
  const src = { id: issue!.id, label: issue!.label, matrix: issue!.matrix };
  const rule = src.matrix.rules.find((x) => x.ruleKey === route.ruleKey)!;
  const roleLabel = (code: string) => src.matrix.roles[code]?.nameEn ?? "An office no longer configured";
  await db.approvalInstance.create({
    data: {
      id: s.routeId, organisationId, matterKind: "EXERCISE", exerciseId: l.ex.id, domain: TENDERING_DOMAIN, value: l.ex.estimatedValue, authorityMatrixId: issue!.id, matrixLabel: issue!.label,
      ruleKey: rule.ruleKey, ruleLabel: rule.labelEn, ruleClause: rule.clause, boundaryValue: String(src.matrix.policy.boundaryValue), boundaryInclusive: src.matrix.policy.boundaryInclusive,
      ruleFollowsBoundarySwitch: rule.followsBoundarySwitch, boundaryOperator: boundaryOperatorFor(rule, src.matrix.policy), fundingRouteCode: l.req.fundingRouteCode, fundingOverrideApplied: false,
      checkedAgainstMatrix: true, warnings: route.warnings as object, status: "PENDING", openedAt: day(subDay), createdAt: s.at,
      ...tenderingRejectionSnapshot(s.at), ...routeCoreFields(route.core, s.at),
      steps: { create: route.chain.map((c, i) => ({ id: `${s.routeId}_s${i + 1}`, sequence: i + 1, roleCode: c.roleCode, roleLabel: roleLabel(c.roleCode), act: c.act, committeeCode: c.committeeCode ?? null, nonDelegable: c.nonDelegable, sourceRuleKey: c.sourceRuleKey, chainOrigin: stepOrigin(c) })) },
    },
  });
  entry("ApprovalInstance", s.routeId, `${ref} · approval for tendering`, "CREATE", s.at, diffFields(null, { matrix: issue!.label, rule: rule.labelEn, route: route.chain.map((c) => `${roleLabel(c.roleCode)} (${ACT_LABEL[c.act]?.toLowerCase() ?? "acts"})`).join(" → "), fundingOverrideApplied: false, ifRejected: "Returned for amendment" }));
  // SR-05 (ruling 8): the dates are kept on the exercise as proposed, as Scope and estimate keeps them, until the approving step records them.
  await db.sourcingExercise.update({ where: { id: l.ex.id }, data: { proposedStartOn: day(s.startOn), proposedClosingAt: dates.closingAt } });
  await db.tenderPack.update({ where: { id: s.packId }, data: { status: "SUBMITTED", submittedAt: s.at, frozenAt: s.at, manifest: frozen.manifest as object, faultsSnapshot: [], conditionsSnapshot: cond.conditionsSnapshot(pack.parts.map(td.partFactsOf), conditions, window) as object, bqVersionId: scope.bill?.versionId ?? null, proposedStartOn: day(s.startOn), proposedClosingAt: dates.closingAt, approvalInstanceId: s.routeId } });
  if (pack.appendix) await db.conditionsAppendix.update({ where: { id: pack.appendix.id }, data: { status: "COMPLETE" } });
  entry(ENTITY.pack, s.packId, `${ref} · Tender documents v${pack.versionNo}`, "UPDATE", s.at, packStatusAudit("DRAFT", "SUBMITTED", { proposedStart: s.startOn, proposedClosing: `${s.closingDay}, ${s.closingTime}`, partsFrozen: frozen.documents.length, filesPinned: frozen.manifest.reduce((x, m) => x + m.files.length, 0), warnings: null }));
  const t = transitionFault(l.ex.status, "PENDING_APPROVAL_FOR_TENDERING", { today: subDay, via: "SUBMISSION", packFaults: 0 });
  if (t.length) throw new Error(`Demo exercise ${l.ex.id} cannot move to pending: ${t.map((f) => f.code).join(", ")}`);
  await db.sourcingExercise.update({ where: { id: l.ex.id }, data: { status: "PENDING_APPROVAL_FOR_TENDERING" } });
  entry("SourcingExercise", l.ex.id, `${ref} · ${l.ex.title}`, "UPDATE", s.at, diffFields({ status: l.ex.status }, { status: "PENDING_APPROVAL_FOR_TENDERING" }));
}

/// Decide the route's step as recordTenderingDecision does: 6.1's decider checks; the approving step records the dates.
export async function decide(db: Db, organisationId: string, d: { packId: string; decision: "DONE" | "REJECTED"; personId: string; decidedOn: string; at: Date; reason: string; dates?: { startOn: string; closingDay: string; closingTime: string } }, entry: Add) {
  const repo = await import("../src/lib/method/repo");
  const { loadRoster, loadDelegations } = await import("../src/lib/people/load");
  const { holdersFor, deciderFaults, NO_EARLIER_RECORDERS } = await import("../src/lib/requisition/holders");
  const { pathTo } = await import("../src/lib/organisation/structure");
  const { transitionFault } = await import("../src/lib/method/exercise");
  const { ORGANISATION_CODE } = await import("../src/lib/org");
  const { REJECTION_KIND_LABEL } = await import("../src/lib/authority/rejection-labels");
  const pack = await db.tenderPack.findUniqueOrThrow({ where: { id: d.packId }, include: { approvalInstance: { include: { steps: { orderBy: { sequence: "asc" } } } } } });
  const l = (await repo.loadExercise(await demoOrgId(), pack.exerciseId))!;
  const inst = pack.approvalInstance!;
  const step = inst.steps.find((s) => s.decision === "PENDING")!;
  const [roster, delegations, units] = [await loadRoster(ORGANISATION_CODE), await loadDelegations(ORGANISATION_CODE), await db.orgUnit.findMany({ where: { organisationId } })];
  const unitPath = pathTo(units as never, l.req.sectionUnitCode || l.req.requestingUnitCode, day(d.decidedOn)).reverse().map((u) => u.code);
  const person = await db.person.findUniqueOrThrow({ where: { id: d.personId }, select: { id: true, name: true, isActive: true } });
  const check = deciderFaults(step, {
    today: l.org.today, holders: holdersFor(step.roleCode!, unitPath, roster, delegations, d.decidedOn), declaredConflictIds: [], person, requesterId: l.req.requestingPersonId, endorserIds: [],
    earlier: NO_EARLIER_RECORDERS, otherDeciderIds: [], earlierDone: true, decidedOn: d.decidedOn, openedOn: inst.openedAt.toISOString().slice(0, 10), value: parseSen(l.ex.estimatedValue.toString()),
  });
  if (check.faults.length) throw new Error(`Demo decision on ${inst.id} fails its checks: ${check.faults.join(", ")}`);
  const ref = l.ex.reference;
  await db.approvalStep.update({ where: { id: step.id }, data: { decision: d.decision, decidedByPersonId: person.id, decidedByName: person.name, decidedOn: day(d.decidedOn), delegationId: check.delegationId, reason: d.reason, recordedAt: d.at } });
  entry("ApprovalStep", step.id, `${ref} · ${step.roleLabel}`, "UPDATE", d.at, diffFields({ decision: step.decision }, { decision: d.decision, decidedBy: person.name, decidedOn: day(d.decidedOn), recordedOnBehalf: "not signed", underDelegation: check.delegationId ? "yes" : null }), d.reason);
  if (d.decision === "REJECTED") {
    await db.approvalInstance.update({ where: { id: inst.id }, data: { status: "REJECTED", closedAt: d.at, rejectionApplied: "RETURN_TO_ORIGINATOR", rejectionSource: "CONFIGURED", rejectionReason: d.reason } });
    entry("ApprovalInstance", inst.id, `${ref} · approval for tendering`, "UPDATE", d.at, diffFields({ status: "PENDING" }, { status: "REJECTED", goesTo: REJECTION_KIND_LABEL.RETURN_TO_ORIGINATOR, decidedBy: RETURN_DECIDED_BY }), d.reason);
    await db.tenderPack.update({ where: { id: pack.id }, data: { status: "RETURNED", returnedReason: d.reason, returnedAt: d.at } });
    entry(ENTITY.pack, pack.id, `${ref} · Tender documents v${pack.versionNo}`, "UPDATE", d.at, packStatusAudit("SUBMITTED", "RETURNED", { returnedBecause: d.reason }), d.reason);
    if (transitionFault(l.ex.status, "DOCUMENTS_IN_PREPARATION", { today: d.decidedOn, via: "RETURN" }).length) throw new Error("Demo return refused.");
    await db.sourcingExercise.update({ where: { id: l.ex.id }, data: { status: "DOCUMENTS_IN_PREPARATION" } });
    entry("SourcingExercise", l.ex.id, `${ref} · ${l.ex.title}`, "UPDATE", d.at, diffFields({ status: l.ex.status }, { status: "DOCUMENTS_IN_PREPARATION" }), `Tender documents returned for amendment: ${d.reason}`);
    return;
  }
  const dates = approvalDatesFault({ ...d.dates!, timeZone: l.org.timeZone, today: d.decidedOn });
  if (dates.faults.length) throw new Error(`Demo approval dates fail: ${dates.faults.map((f) => f.code).join(", ")}`);
  const { readConditionsSnapshot } = await import("../src/lib/tender-docs/conditions");
  const { frozenWindowFault } = await import("../src/lib/tender-docs/tendering");
  if (frozenWindowFault(readConditionsSnapshot(pack.conditionsSnapshot)?.windowStated ?? null, d.dates!)) throw new Error("Demo approval dates differ from those the frozen notice states.");
  await db.approvalInstance.update({ where: { id: inst.id }, data: { status: "APPROVED", closedAt: d.at } });
  entry("ApprovalInstance", inst.id, `${ref} · approval for tendering`, "UPDATE", d.at, diffFields({ status: "PENDING" }, { status: "APPROVED" }));
  await db.tenderPack.update({ where: { id: pack.id }, data: { status: "APPROVED", approvedStartOn: day(d.dates!.startOn), approvedClosingAt: dates.closingAt, approvedAt: day(d.decidedOn) } });
  entry(ENTITY.pack, pack.id, `${ref} · Tender documents v${pack.versionNo}`, "UPDATE", d.at, packStatusAudit("SUBMITTED", "APPROVED", { approvedStart: d.dates!.startOn, approvedClosing: `${d.dates!.closingDay}, ${d.dates!.closingTime}` }));
  if (transitionFault(l.ex.status, "APPROVED_FOR_TENDERING", { today: d.decidedOn, via: "APPROVAL", datesSet: true }).length) throw new Error("Demo approval refused.");
  await db.sourcingExercise.update({ where: { id: l.ex.id }, data: { status: "APPROVED_FOR_TENDERING", tenderingStartOn: day(d.dates!.startOn), closingAt: dates.closingAt, approvedForTenderingAt: day(d.decidedOn) } });
  entry("SourcingExercise", l.ex.id, `${ref} · ${l.ex.title}`, "UPDATE", d.at, diffFields({ status: l.ex.status, tenderingStarts: null, closing: null }, { status: "APPROVED_FOR_TENDERING", tenderingStarts: d.dates!.startOn, closing: `${d.dates!.closingDay}, ${d.dates!.closingTime}` }));
}

/// Take the drawings' carried file off and reopen the part, as detachDocument and reopenPart write it.
async function reworkDrawings(db: Db, organisationId: string, packId: string, ref: string, when: Date, entry: Add) {
  const partId = `${packId}_demo_q_drawings`;
  const part = await db.tenderPackPart.findUniqueOrThrow({ where: { id: partId }, include: { attachments: { include: { version: { include: { document: { select: { title: true } } } } } }, pack: { select: { versionNo: true } } } });
  const reason = "Missing the valve schedule; a revised set is awaited from the department.";
  for (const a of part.attachments.filter((x) => x.detachedAt == null)) {
    await db.documentAttachment.update({ where: { id: a.id }, data: { detachedAt: when, detachReason: reason } });
    entry("DocumentAttachment", a.id, `${ref} · Tender pack v${part.pack.versionNo} · part ${part.printedNumber}, ${part.labelSnapshot} · ${PURPOSE_LABEL.TENDER_PART}`, "UPDATE", when, diffFields({ purpose: PURPOSE_LABEL.TENDER_PART, document: a.version.document.title, attached: "yes" }, { purpose: PURPOSE_LABEL.TENDER_PART, document: a.version.document.title, attached: "no", detachedBecause: reason }), reason);
  }
  await db.tenderPackPart.update({ where: { id: partId }, data: { state: "NOT_STARTED" } });
  const facts = { printedNumber: part.printedNumber, label: part.labelSnapshot, role: part.role, content: part.content, source: part.source, mandatory: part.mandatory, inTableDocument: part.inTableDocument, omittedReason: "", templateName: null };
  entry(ENTITY.part, partId, `${ref} · Tender documents v${part.pack.versionNo} · part ${part.printedNumber}`, "UPDATE", when, partAudit({ ...facts, state: "READY" }, { ...facts, state: "NOT_STARTED" }));
}

/// Change some of the Appendix's fields, as saveAppendix writes it (status following the rule).
async function reviseAppendix(db: Db, organisationId: string, packId: string, ref: string, v: Record<string, unknown>, when: Date, entry: Add) {
  const { loadPacks, appendixFactsOf } = await import("../src/lib/tender-docs/repo");
  const office = await officeNames(db, organisationId);
  const pack = await db.tenderPack.findUniqueOrThrow({ where: { id: packId }, select: { exerciseId: true, versionNo: true } });
  const aid = `${packId}_appendix`;
  const before = appendixFactsOf((await loadPacks(pack.exerciseId)).find((x) => x.id === packId)!.appendix!);
  await db.conditionsAppendix.update({ where: { id: aid }, data: v });
  const after = appendixFactsOf((await loadPacks(pack.exerciseId)).find((x) => x.id === packId)!.appendix!);
  const status = appendixComplete(after) ? "COMPLETE" : "DRAFT";
  await db.conditionsAppendix.update({ where: { id: aid }, data: { status } });
  entry(ENTITY.appendix, aid, `${ref} · Tender documents v${pack.versionNo} · Appendix`, "UPDATE", when, appendixAudit(before, { ...after, status }, office));
}

// ------------------------------------------------------------------ increment 2: the acts, as the tab's actions write them

/// Record the registrations bidders must hold, each judged by requirementFaults as addRequirement judges it.
export async function conditionsFor(db: Db, organisationId: string, exerciseId: string, ref: string, rows: { body: string; qualifiers?: string; group: number }[], when: Date, entry: Add) {
  const { requirementFaults } = await import("../src/lib/tender-docs/eligibility");
  const { loadRegistrationBodies } = await import("../src/lib/tender-docs/repo");
  const bodies = await loadRegistrationBodies(organisationId);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(when);
  for (const [i, r] of rows.entries()) {
    const f = requirementFaults({ bodyCode: r.body, qualifiers: r.qualifiers ?? "", alternativeGroup: r.group }, bodies, day);
    if (f.length) throw new Error(`Demo requirement on ${exerciseId} refused: ${f.map((x) => x.code).join(", ")}`);
    const b = bodies.find((x) => x.code === r.body)!;
    const id = `${exerciseId}_rq${i + 1}`;
    await db.exerciseRegistrationRequirement.create({ data: { id, organisationId, exerciseId, bodyCode: b.code, bodyLabelSnapshot: b.labelEn, qualifierLabelSnapshot: b.qualifierLabelEn, qualifiers: r.qualifiers ?? "", alternativeGroup: r.group, sortOrder: i, createdAt: when } });
    entry("ExerciseRegistrationRequirement", id, `${ref} · Registration required · ${b.labelEn}`, "CREATE", when, diffFields(null, { registrationBody: b.labelEn, requiredWithIt: r.qualifiers || null, alternativeGroup: `Group ${r.group}` }));
  }
}

/// Answer the restriction and the regulator permit, as saveRestriction and savePermit write them.
export async function answer(db: Db, organisationId: string, exerciseId: string, ref: string, a: { restrictedTender: boolean | null; regulatedActivity: boolean | null; regulatorPermitCode: string | null }, when: Date, entry: Add) {
  const { permitSaveFaults, permitLabel } = await import("../src/lib/tender-docs/permit");
  const { loadPermitList } = await import("../src/lib/tender-docs/repo");
  const { yesNoNotSet } = await import("../src/lib/tender-docs/labels");
  const list = await loadPermitList(organisationId, "demo_permits", "2026-10-01");
  if (permitSaveFaults(a.regulatedActivity, a.regulatorPermitCode, list).length) throw new Error(`Demo permit on ${exerciseId} refused.`);
  const ex = await db.sourcingExercise.update({ where: { id: exerciseId }, data: a, select: { title: true } });
  const label = `${ref} · ${ex.title}`;
  if (a.restrictedTender != null) entry("SourcingExercise", exerciseId, label, "UPDATE", when, diffFields({ restrictedTender: "Not set" }, { restrictedTender: yesNoNotSet(a.restrictedTender) }));
  entry("SourcingExercise", exerciseId, label, "UPDATE", when, diffFields({ needsRegulatorPermit: "Not set", permitType: null }, { needsRegulatorPermit: yesNoNotSet(a.regulatedActivity), permitType: a.regulatedActivity ? permitLabel(true, a.regulatorPermitCode, list) : null }));
}

/// Record an assurance confirmation, judged by confirmFaults as recordAssurance judges it.
export async function confirm(db: Db, organisationId: string, packId: string, ref: string, kind: "NO_AMBIGUITY" | "DRAWINGS_COORDINATED", personId: string, on: string, when: Date, entry: Add, today = "2026-10-01") {
  const { confirmFaults } = await import("../src/lib/tender-docs/assurance");
  const { ASSURANCE_KIND_LABEL } = await import("../src/lib/tender-docs/conditions-labels");
  const { loadPacks, partFactsOf, loadConfirmations } = await import("../src/lib/tender-docs/repo");
  const pack = await db.tenderPack.findUniqueOrThrow({ where: { id: packId }, select: { exerciseId: true, versionNo: true, createdAt: true, exercise: { select: { status: true } } } });
  const row = (await loadPacks(pack.exerciseId)).find((p) => p.id === packId)!;
  const person = await db.person.findUniqueOrThrow({ where: { id: personId }, select: { name: true, isActive: true } });
  const started = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(pack.createdAt);
  const f = confirmFaults({ packStatus: row.status, exerciseStatus: pack.exercise.status, kind, parts: row.parts.map(partFactsOf), existing: await loadConfirmations(packId), person, confirmedOn: on, today, packStartedOn: started });
  if (f.length) throw new Error(`Demo confirmation on ${packId} refused: ${f.map((x) => x.code).join(", ")}`);
  const id = `${packId}_as_${kind === "NO_AMBIGUITY" ? 1 : 2}`;
  await db.packAssurance.create({ data: { id, organisationId, packId, kind, personId, confirmedOn: day(on), recordedAt: when } });
  entry("PackAssurance", id, `${ref} · Tender documents v${pack.versionNo} · ${ASSURANCE_KIND_LABEL[kind]}`, "CREATE", when, diffFields(null, { confirmation: ASSURANCE_KIND_LABEL[kind], confirmedBy: person.name, confirmedOn: on, recordedOnBehalf: "not signed" }));
}

// ------------------------------------------------------------------ the after-load check (X-10 c)

/**
 * Every 6.4 row as the product reads it, once everything is loaded: sx1 approved with its
 * dates on the exercise and frozen on the pack, its estimate's lead Ready against the
 * closing; sx5 back in preparation with v1 returned and v2 a draft whose drawings are not
 * ready; sx15 pending at the Head of Contract & Procurement; nothing dated after the load day.
 */
export async function checkTenderDocs(db: Db) {
  const { loadScopePolicy } = await import("../src/lib/scope/repo");
  const { scopeReadiness } = await import("../src/lib/tender-docs/repo");
  const fail = (what: string) => {
    throw new Error(`Demo 6.4: ${what}`);
  };
  const sx1 = await db.sourcingExercise.findUniqueOrThrow({ where: { id: `${P}sx1` }, select: { id: true, organisationId: true, status: true, closingAt: true, tenderingStartOn: true, sourcingMethodCode: true, contractBasisCode: true } });
  const p1 = await db.tenderPack.findUniqueOrThrow({ where: { id: `${P}tpk1` } });
  if (sx1.status !== "APPROVED_FOR_TENDERING" || p1.status !== "APPROVED") fail("sx1 is not approved for tendering.");
  if (sx1.closingAt?.getTime() !== p1.approvedClosingAt?.getTime() || sx1.tenderingStartOn?.getTime() !== p1.approvedStartOn?.getTime()) fail("sx1's dates are not those frozen on its pack (X-2).");
  const org = await db.organisation.findUniqueOrThrow({ where: { id: sx1.organisationId }, select: { timeZone: true } });
  const scope = await scopeReadiness(sx1.organisationId, sx1);
  const lead = estimateLeadWarning(scope.lastEstimateVersionOn, sx1.closingAt, await loadScopePolicy(sx1.organisationId), org.timeZone);
  if (lead.state !== "READY") fail(`sx1's estimate lead reads ${lead.state}, not Ready.`);
  const sx5 = await db.tenderPack.findMany({ where: { exerciseId: `${P}sx5` }, orderBy: { versionNo: "asc" }, include: { parts: true } });
  if (sx5.map((p) => p.status).join() !== "RETURNED,DRAFT") fail("sx5's packs are not v1 returned and v2 a draft.");
  if (sx5[1].parts.find((p) => p.partCode === "demo_q_drawings")?.state !== "NOT_STARTED") fail("sx5 v2's drawings should not be ready.");
  const v2 = await db.conditionsAppendix.findUniqueOrThrow({ where: { packId: `${P}tpk3` }, select: { status: true } });
  if (v2.status !== "DRAFT") fail("sx5 v2's Appendix should be half entered.");
  const sx15 = await db.tenderPack.findUniqueOrThrow({ where: { id: `${P}tpk4` }, include: { approvalInstance: { include: { steps: true } } } });
  if (sx15.status !== "SUBMITTED" || sx15.approvalInstance?.status !== "PENDING" || sx15.approvalInstance.steps[0]?.roleCode !== "HOD_CP") fail("sx15 is not pending at the Head of Contract & Procurement.");
  // Increment 2: what each pack froze, and what the draft still lacks.
  const { readConditionsSnapshot } = await import("../src/lib/tender-docs/conditions");
  const snap1 = readConditionsSnapshot(p1.conditionsSnapshot);
  if (!snap1?.windowStated || snap1.windowStated.startOn !== "2026-10-12" || snap1.windowStated.closingDay !== "2026-10-29") fail("sx1's frozen notice does not state the approved window.");
  if (snap1?.assurance.confirmations.length !== 2) fail("sx1 was not frozen with both assurance confirmations.");
  const notice1 = await db.tenderPackDocument.findFirstOrThrow({ where: { packId: `${P}tpk1`, partCode: "demo_q_notice" } });
  if (!notice1.renderedText.includes("valid from 12 October 2026 to 29 October 2026")) fail("sx1's frozen notice does not state the validity window.");
  const docs15 = await db.tenderPackDocument.findMany({ where: { packId: `${P}tpk4` } });
  if (!docs15.length || docs15.some((d) => !d.renderedText.startsWith(DEMO_POLICY.restrictionStampTextEn))) fail("sx15 is restricted and not every generated document carries the stamp.");
  if (await db.packAssurance.count({ where: { packId: `${P}tpk3` } })) fail("sx5 v2 should not carry v1's confirmations.");
  const loadDay = new Date("2026-10-01T23:59:59+08:00");
  const late = await db.auditEntry.count({ where: { id: { startsWith: `${P}td` }, at: { gt: loadDay } } });
  if (late) fail(`${late} trail entries are dated after the load day (X-10 a).`);
}

/// The figures the demo states, for its own words (never a customer's).
export const DEMO_TENDER_FIGURES = { lad: "0.05%", firstCertificate: formatSen(parseSen("2500.00")) };
