/**
 * Demo: 6.14 increment 2 (printed-form fidelity, typing corrections and terms), through the product's own acts.
 *
 * Invented and ASSUMED throughout: no customer's form, label, misprint or glossary. Every row is written by the
 * Configuration › Templates and Routing sheets acts (prisma/demo-acts.ts, BD-613-70), at an instant before demo_con13's
 * story begins, so the certificates the story raises afterwards pin and freeze what is set here:
 *
 * - the demo interim certificate's form (demo_dt30) prints on 2 pages with three printed fields under their own label
 *   pairs: the contract number and the certificate number filled by the portal, the remarks left for the pen;
 * - the interim routing sheet type (demo_hrt1) names a printed sheet (demo_dt3) whose labels for the received and
 *   approved days and the days taken are invented ("Date in (registry)" …), so every interim sheet started after
 *   shows them beside the portal's words;
 * - a term "so" (Superintending Officer · Pegawai Penguasa, also written "S.O." and "P.P."), so a search of the
 *   documents register for "S.O." also finds the issued delegation letters that say "Superintending Officer";
 * - the demo letter of delegation (demo_dt31) revised to cite that term, its heading printed with an invented misprint
 *   ("LETTER OF DELEGATON"), and a typing correction of it on that form only: the drafts on demo_con3 (demo_hct3,
 *   demo_wlt1) preview "LETTER OF DELEGATION" and say one correction was applied, the form code and revision unchanged.
 *
 * Sub-prefixes (grepped free; the wipe matches each exactly): demo_hff printed fields, demo_htc corrections, demo_htf the
 * forms a correction names, demo_htm terms, demo_hta aliases.
 */

import type { PrismaClient } from "../src/generated/prisma/client";

import { act } from "./demo-acts";

type Db = PrismaClient;
const P = "demo_";
const WHEN = "2026-05-20T09:00";
const at = (min: number) => `2026-05-20T09:${String(min).padStart(2, "0")}`;
const NOTE = "Invented for the demo (6.14 increment 2).";

export async function configureFidelityDemo(db: Db) {
  const forms = await import("../src/app/configuration/templates/form-actions");
  const glossary = await import("../src/app/configuration/templates/glossary-actions");
  const templates = await import("../src/app/configuration/templates/actions");
  const sheets = await import("../src/app/configuration/routing-sheets/actions");

  // The term first: a template's text may cite only a term in the glossary.
  await act(WHEN, "add the term so", glossary.saveTerm, { code: "so", canonicalEn: "Superintending Officer", canonicalMs: "Pegawai Penguasa", aliases: "S.O.\nP.P.", provenance: "ASSUMED", notes: NOTE });

  // The demo letter of delegation's text revised: it cites the term, and its heading carries an invented misprint.
  const dt31 = await db.documentTemplate.findUniqueOrThrow({ where: { id: `${P}dt31` } });
  const letter = ["{{organisation.name}}", "LETTER OF DELEGATON", "Letter of delegation under contract {{contract.number}} ({{contract.title}}) with {{contractor.name}}.", "The powers named in the schedule are delegated by the {{term:so}} as it states (demo text, invented).", "Dated {{certificate.date}}."].join("\n\n");
  await act(at(1), "revise the demo letter of delegation's text", templates.saveTemplate, {
    id: dt31.id,
    nameEn: dt31.nameEn,
    nameMs: dt31.nameMs,
    formCode: dt31.formCode,
    revisionDate: dt31.revisionDate ? dt31.revisionDate.toISOString().slice(0, 10) : null,
    bilingual: dt31.bilingual ? "on" : null,
    documentClassId: dt31.documentClassId,
    provenance: dt31.provenance,
    notes: dt31.notes,
    sortOrder: String(dt31.sortOrder),
    bodyEn: letter,
    bodyMs: dt31.bodyMs,
    primaryLanguage: dt31.primaryLanguage,
  });
  await act(at(2), "correct the misprint on the demo letter of delegation", glossary.saveCorrection, { fromText: "DELEGATON", toText: "DELEGATION", templateIds: `${P}dt31`, provenance: "ASSUMED", notes: `${NOTE} The misprint is invented so the correction shows.` });

  // Printed pages.
  for (const [n, [id, pages]] of ([[`${P}dt30`, "2"], [`${P}dt31`, "1"], [`${P}dt3`, "1"]] as const).entries()) await act(at(3 + n), `pages of ${id}`, forms.savePageCount, { templateId: id, pageCount: pages });

  // The interim certificate's printed fields.
  const field = (templateId: string, key: string, labelEn: string, labelMs: string, value: string | null, sortOrder: number) => ({ templateId, key, labelEn, labelMs, filled: value ? "PORTAL" : "HAND", computedKey: value, sortOrder: String(sortOrder), provenance: "ASSUMED", notes: NOTE });
  await act(at(10), "printed field: contract number", forms.savePrintedField, field(`${P}dt30`, "contract_no", "Contract No.", "No. Kontrak", "contract.number", 1));
  await act(at(11), "printed field: certificate number", forms.savePrintedField, field(`${P}dt30`, "certificate_no", "Certificate No.", "No. Perakuan", "certificate.number", 2));
  await act(at(12), "printed field: remarks", forms.savePrintedField, field(`${P}dt30`, "remarks", "Remarks", "Catatan", null, 3));

  // The interim routing sheet type names its printed sheet, whose labels are invented.
  const t = await db.routingSheetType.findUniqueOrThrow({ where: { id: `${P}hrt1` } });
  await act(at(20), "the interim sheet names its printed sheet", sheets.saveRoutingType, {
    id: t.id,
    labelEn: t.labelEn,
    labelMs: t.labelMs,
    subject: t.subject,
    certificateKind: t.certificateKind,
    templateId: `${P}dt3`,
    upperEdgeInclusive: t.upperEdgeInclusive == null ? null : t.upperEdgeInclusive ? "upper" : "lower",
    provenance: t.provenance,
    notes: t.notes,
    sortOrder: String(t.sortOrder),
  });
  await act(at(21), "printed sheet: date in", forms.savePrintedField, field(`${P}dt3`, "date_in", "Date in (registry)", "Tarikh masuk (pendaftaran)", "sheet.received", 1));
  await act(at(22), "printed sheet: date out", forms.savePrintedField, field(`${P}dt3`, "date_out", "Date out (approved)", "Tarikh keluar (diluluskan)", "sheet.approved", 2));
  await act(at(23), "printed sheet: days taken", forms.savePrintedField, field(`${P}dt3`, "days_taken", "Days taken", "Hari diambil", "sheet.elapsed", 3));
}

/// Read back what the story froze: an issued interim's printed fields and its sheet's printed labels.
export async function checkFidelityDemo(db: Db) {
  const fail = (m: string) => {
    throw new Error(`Demo check (6.14 increment 2): ${m}`);
  };
  const dt30 = await db.documentTemplate.findUniqueOrThrow({ where: { id: `${P}dt30` }, include: { printedFields: true } });
  if (dt30.pageCount !== 2 || dt30.printedFields.length !== 3) fail("demo_dt30 has not its 2 pages and 3 printed fields");
  const issued = await db.certificate.findFirst({ where: { contractId: `${P}con13`, kind: "INTERIM_PAYMENT", status: "ISSUED" }, orderBy: { issuedAt: "asc" }, select: { number: true, issueSnapshot: true, routingSnapshot: true } });
  if (!issued) fail("demo_con13 has no issued interim certificate");
  const snap = issued!.issueSnapshot as { printed?: { key: string; valueEn: string | null }[]; form?: { pageCount?: number | null } };
  if (snap.printed?.length !== 3 || snap.form?.pageCount !== 2) fail(`${issued!.number} did not freeze the printed form`);
  if (snap.printed?.find((p) => p.key === "certificate_no")?.valueEn !== issued!.number) fail(`${issued!.number}'s printed certificate number is not its own`);
  const sheet = issued!.routingSnapshot as { printedForm?: { labels?: Record<string, { en: string }> } | null };
  if (sheet.printedForm?.labels?.["sheet.received"]?.en !== "Date in (registry)") fail(`${issued!.number}'s routing sheet did not freeze its printed labels`);
  const correction = await db.textCorrection.findFirst({ where: { id: { startsWith: `${P}htc` } }, include: { forms: true } });
  if (!correction || correction.forms.length !== 1) fail("the demo's typing correction is missing");
}

export async function wipeFidelityConfig(db: Db) {
  const sub = (s: string) => ({ id: { startsWith: `${P}${s}` } });
  await db.textCorrectionForm.deleteMany({ where: sub("htf") });
  await db.textCorrection.deleteMany({ where: sub("htc") });
  await db.termAlias.deleteMany({ where: sub("hta") });
  await db.term.deleteMany({ where: sub("htm") });
  await db.formField.deleteMany({ where: sub("hff") });
}
