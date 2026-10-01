/**
 * TEST FIXTURE ONLY — never seeded, never imported outside a test (Q-8, CO-9/C5
 * precedent; a source scan in composition.test.ts holds it). RSAJ's part lists as the
 * corpus prints them, for the spec's worked examples: SK001 7.3.1(a),(b) as reconciled
 * by FR-DOC-001 (twelve entries, 7.3.4 the operative text, so the drawings-and-
 * specification pack takes 7b and no bill), and OM/P/005 §3.2's nine quotation parts
 * (FR-DOC-013). At go-live these are RSAJ's customer seed, STATED, alongside its
 * Approval for Tendering matrix rows.
 */

import type { ConfiguredPart } from "./types";

const part = (x: Partial<ConfiguredPart> & Pick<ConfiguredPart, "code" | "packKind" | "printedNumber" | "sortOrder" | "labelEn" | "role" | "content" | "source">): ConfiguredPart => ({
  contractBasisCode: null,
  labelMs: null,
  mandatory: true,
  inTableDocument: false,
  ownerOrgUnitCode: null,
  templateCode: null,
  governingSource: "SK001 7.3.1, 7.3.4",
  provenance: "STATED",
  retiredOn: null,
  ...x,
});

export const SK001_TENDER_PARTS: readonly ConfiguredPart[] = [
  part({ code: "t01", packKind: "TENDER", printedNumber: "1", sortOrder: 10, labelEn: "Letter of Invitation to Tender or Notice of Offer", role: "INVITATION", content: "STANDARD", source: "TEMPLATE", templateCode: "notice" }),
  part({ code: "t02", packKind: "TENDER", printedNumber: "2", sortOrder: 20, labelEn: "Form of Tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", templateCode: "form_of_tender", inTableDocument: true }),
  part({ code: "t03bq", packKind: "TENDER", contractBasisCode: "bq", printedNumber: "3", sortOrder: 30, labelEn: "Articles of Agreement and Conditions of Contract", role: "CONDITIONS", content: "STANDARD", source: "TEMPLATE", templateCode: "jkr203a", inTableDocument: true }),
  part({ code: "t03ds", packKind: "TENDER", contractBasisCode: "ds", printedNumber: "3", sortOrder: 30, labelEn: "Articles of Agreement and Conditions of Contract", role: "CONDITIONS", content: "STANDARD", source: "TEMPLATE", templateCode: "jkr203", inTableDocument: true }),
  part({ code: "t03a", packKind: "TENDER", printedNumber: "3a", sortOrder: 31, labelEn: "Appendix to the Conditions of Contract", role: "APPENDIX", content: "BESPOKE", source: "APPENDIX", inTableDocument: true }),
  part({ code: "t04", packKind: "TENDER", printedNumber: "4", sortOrder: 40, labelEn: "Letter of Acceptance of Tender (specimen)", role: "LOA_SPECIMEN", content: "STANDARD", source: "TEMPLATE", templateCode: "loa_specimen" }),
  part({ code: "t05", packKind: "TENDER", printedNumber: "5", sortOrder: 50, labelEn: "Bank Guarantee or Insurance form for the Performance Bond", role: "BOND_FORMS", content: "STANDARD", source: "TEMPLATE", templateCode: "bond_forms", inTableDocument: true, governingSource: "SK001 7.3.4(f)(i)" }),
  part({ code: "t06", packKind: "TENDER", printedNumber: "6", sortOrder: 60, labelEn: "Specification", role: "SPECIFICATION", content: "MIXED", source: "UPLOAD", inTableDocument: true }),
  part({ code: "t07a", packKind: "TENDER", contractBasisCode: "bq", printedNumber: "7a", sortOrder: 70, labelEn: "Bills of Quantities", role: "BILL_OF_QUANTITIES", content: "BESPOKE", source: "BQ_UNPRICED", inTableDocument: true }),
  part({ code: "t07b", packKind: "TENDER", contractBasisCode: "ds", printedNumber: "7b", sortOrder: 71, labelEn: "Summary of Tender and Schedule of Rates", role: "SUMMARY_AND_RATES", content: "BESPOKE", source: "UPLOAD", inTableDocument: true }),
  part({ code: "t08", packKind: "TENDER", printedNumber: "8", sortOrder: 80, labelEn: "Tenderer's Registration Background Form", role: "REGISTRATION_BACKGROUND", content: "STANDARD", source: "TEMPLATE", templateCode: "registration_background" }),
  part({ code: "t09", packKind: "TENDER", printedNumber: "9", sortOrder: 90, labelEn: "Bidder's Declaration Letter with Letter of Authorisation", role: "DECLARATION", content: "STANDARD", source: "TEMPLATE", templateCode: "declaration", governingSource: "SK001 7.3.4(j)" }),
  part({ code: "t10", packKind: "TENDER", printedNumber: "10", sortOrder: 100, labelEn: "Drawings", role: "DRAWINGS", content: "BESPOKE", source: "UPLOAD", inTableDocument: true }),
  part({ code: "t11", packKind: "TENDER", printedNumber: "11", sortOrder: 110, labelEn: "Instructions to Tenderers", role: "INSTRUCTIONS", content: "STANDARD", source: "TEMPLATE", templateCode: "instructions" }),
];

const q = (x: Parameters<typeof part>[0]) => part({ governingSource: "OM/P/005 §3.2", ...x });

export const OMP005_QUOTATION_PARTS: readonly ConfiguredPart[] = [
  q({ code: "q1", packKind: "QUOTATION", printedNumber: "1", sortOrder: 10, labelEn: "Kenyataan Sebutharga", role: "INVITATION", content: "STANDARD", source: "TEMPLATE", templateCode: "q_notice" }),
  q({ code: "q2", packKind: "QUOTATION", printedNumber: "2", sortOrder: 20, labelEn: "Corrigendum", role: "OTHER", content: "BESPOKE", source: "UPLOAD", mandatory: false }),
  q({ code: "q3", packKind: "QUOTATION", printedNumber: "3", sortOrder: 30, labelEn: "Arahan kepada Penender", role: "INSTRUCTIONS", content: "STANDARD", source: "TEMPLATE", templateCode: "q_instructions" }),
  q({ code: "q4", packKind: "QUOTATION", printedNumber: "4", sortOrder: 40, labelEn: "Syarat-syarat Sebutharga Untuk Kerja", role: "CONDITIONS", content: "STANDARD", source: "TEMPLATE", templateCode: "q_conditions" }),
  q({ code: "q5", packKind: "QUOTATION", printedNumber: "5", sortOrder: 50, labelEn: "Penentu Kerja", role: "SPECIFICATION", content: "MIXED", source: "UPLOAD" }),
  q({ code: "q6", packKind: "QUOTATION", printedNumber: "6", sortOrder: 60, labelEn: "Borang Sebutharga", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", templateCode: "q_form" }),
  q({ code: "q7", packKind: "QUOTATION", contractBasisCode: "bq", printedNumber: "7", sortOrder: 70, labelEn: "Bill of Quantities", role: "BILL_OF_QUANTITIES", content: "BESPOKE", source: "BQ_UNPRICED" }),
  q({ code: "q8", packKind: "QUOTATION", printedNumber: "8", sortOrder: 80, labelEn: "Latar Belakang Penender", role: "REGISTRATION_BACKGROUND", content: "STANDARD", source: "TEMPLATE", templateCode: "q_background" }),
  q({ code: "q9", packKind: "QUOTATION", printedNumber: "9", sortOrder: 90, labelEn: "Lukisan", role: "DRAWINGS", content: "BESPOKE", source: "UPLOAD" }),
];

/// The forms the conditions parts name, as the corpus names them (FR-DOC-002).
export const SK001_TEMPLATE_NAMES: Readonly<Record<string, string>> = {
  jkr203a: "JKR 203A: Standard Form of Contract to Be Used Where Bills of Quantities Form Part of the Contract",
  jkr203: "JKR 203: Standard Form of Contract to Be Used Where Drawings and Specification Form Part of the Contract",
  q_conditions: "Syarat-syarat Sebutharga Untuk Kerja",
};
