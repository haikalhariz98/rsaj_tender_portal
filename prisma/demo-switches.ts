/**
 * Demo data for Sourcing Requirements v2 SR-08, SR-09 and SR-11 (rulings 12 to 14, ADR 0035). Invented throughout. The demo writes these directly only inside demo:load on a fresh
 * database (rulings G2 and 12c); a customer's own settings arrive through Configuration, by two people.
 *
 * - The organisation's two scope switches are both OFF: a new exercise opened in the demo pins "no specification panel" and "the bill is an uploaded Excel file".
 *   The demonstration's own exercises were authored under the earlier behaviour, with their panels and bills, so they are pinned to use both (as the migration
 *   backfilled every exercise that already existed): they keep working as they did, and their panels and bills stay where they are.
 * - Any exercise whose pin is still not set takes the setting, as an officer would by taking it (none is, on a fresh load).
 * - The prescribed bill of quantities workbook is the template file of the bill part of each pack kind: a small .xlsx, generated here.
 * - The upload rules of the demonstration accept workbooks and Word documents, where they are the demonstration's own.
 */

import { createHash } from "node:crypto";

import ExcelJS from "exceljs";

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { versionCreated, documentCreated, filed } from "../src/lib/documents/audit-view";
import { DOCX_TYPE, XLSX_TYPE } from "../src/lib/documents/media";
import { STAGED_FOR_TEMPLATE_FILE } from "../src/lib/documents/staged-for";
import { DEMO_ACTOR } from "./demo-actor";
import { DEMO_POLICY_ID } from "./demo-documents";
import { DEMO_PREFIX as P } from "./demo-sign-in";

type Db = PrismaClient;

/// The payment methods the demonstration's simulator offers (SR-10, ruling 17). Invented; a customer lists its own.
export const DEMO_PAYMENT_METHODS = ["Online banking (FPX)", "Credit or debit card", "E-wallet"] as const;

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/// The prescribed workbook an officer fills in with the bill's sections and quantities. Invented.
export async function demoBqWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Demo";
  const ws = wb.addWorksheet("Bill of quantities");
  ws.addRow(["DEMO — invented template, not a real record"]);
  ws.addRow([]);
  ws.addRow(["Section", "Section title", "Item", "Description", "Unit", "Quantity"]);
  ws.addRow([1, "Preliminaries", "1.1", "Site establishment", "item", 1]);
  ws.getRow(3).font = { bold: true };
  ws.columns = [{ width: 10 }, { width: 24 }, { width: 8 }, { width: 44 }, { width: 8 }, { width: 10 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Configuration rows: written only by `demo:load` on a fresh database (ruling 12c, 2026-10-12; G2). There is no standalone mode (`demo:switches` is retired). All the writes are one
 * transaction, so a failure leaves none of them, and the pins it takes are the demonstration's own exercises (`demo_` ids) and no other.
 */
export async function loadScopeSwitchesDemo(db: Db, organisationId: string, now = new Date()) {
  const bytes = await demoBqWorkbook();
  return (db as PrismaClient).$transaction((tx) => writeScopeSwitches(tx as unknown as Db, organisationId, now, bytes), { timeout: 120_000, maxWait: 30_000 });
}

async function writeScopeSwitches(db: Db, organisationId: string, now: Date, bytes: Buffer) {
  const trail: Record<string, unknown>[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", changes: object[], reason = "") =>
    trail.push({ id: `${P}swau${++n}`, organisationId, entity, entityId, entityLabel, action, at: now, changes, reason, ...DEMO_ACTOR });

  // The upload rules the demonstration set accept the two Office types.
  const store = await db.documentStorePolicy.findUnique({ where: { organisationId } });
  if (store && store.id === DEMO_POLICY_ID) {
    const want = [XLSX_TYPE, DOCX_TYPE].filter((t) => !store.allowedMediaTypes.includes(t));
    if (want.length) {
      await db.documentStorePolicy.update({ where: { id: store.id }, data: { allowedMediaTypes: [...store.allowedMediaTypes, ...want] } });
      entry("DocumentStorePolicy", store.id, "Upload rules", "UPDATE", diffFields({ allowedTypes: store.allowedMediaTypes.join(", ") }, { allowedTypes: [...store.allowedMediaTypes, ...want].join(", ") }));
    }
  }

  // The organisation's setting: both off, only where it is not set.
  const words = (v: boolean | null) => (v == null ? "Not set" : v ? "Used" : "Not used");
  const policy = await db.scopePolicy.findUnique({ where: { organisationId } });
  const next = { specPanelUsed: policy?.specPanelUsed ?? false, onScreenBillUsed: policy?.onScreenBillUsed ?? false };
  if (!policy || policy.specPanelUsed == null || policy.onScreenBillUsed == null) {
    const row = policy
      ? await db.scopePolicy.update({ where: { organisationId }, data: next })
      : await db.scopePolicy.create({ data: { id: `${P}scopepolicy`, organisationId, ...next } });
    entry("ScopePolicy", row.id, "Scope and estimate policy", policy ? "UPDATE" : "CREATE", diffFields(policy ? { specificationPanel: words(policy.specPanelUsed), onScreenBill: words(policy.onScreenBillUsed) } : null, { specificationPanel: words(next.specPanelUsed), onScreenBill: words(next.onScreenBillUsed) }), "Demonstration setting: no specification panel, and the bill of quantities is an uploaded Excel file.");
  }

  // SR-10 (rulings 16 and 17, as amended by the founder on 2026-10-09): how documents are sold, the online release of the documents, and the payment simulator with the methods it offers, set on the
  // window policy where they are not set. The organisation sells at the counter (every demonstration exercise was authored that way), so an exercise made after the load pins the counter; the one
  // exercise below is the demonstration's online sale. The simulator is a demonstration: it must be switched off before go-live (backlog).
  // Only the demonstration's own policy row (as the upload rules above): a customer's own window policy is never given a payment simulator by a load.
  const wpRow = await db.windowPolicy.findUnique({ where: { organisationId } });
  const wp = wpRow && wpRow.id === `${P}wp1` ? wpRow : null;
  if (wp && (wp.documentSaleMode == null || wp.electronicDocumentRelease == null || wp.paymentSimulatorOn == null || wp.simulatedPaymentMethods.length === 0)) {
    const to = {
      documentSaleMode: wp.documentSaleMode ?? ("COUNTER" as const),
      electronicDocumentRelease: wp.electronicDocumentRelease ?? true,
      electronicReleaseProvenance: wp.electronicReleaseProvenance ?? ("ASSUMED" as const),
      paymentSimulatorOn: wp.paymentSimulatorOn ?? true,
      simulatedPaymentMethods: wp.simulatedPaymentMethods.length ? wp.simulatedPaymentMethods : [...DEMO_PAYMENT_METHODS],
    };
    await db.windowPolicy.update({ where: { organisationId }, data: to });
    const sale = (m: string | null) => (m === "ONLINE" ? "Online, through the supplier portal" : m === "COUNTER" ? "At the counter" : "Not set");
    const onOff = (v: boolean | null) => (v == null ? "Not set" : v ? "On" : "Off");
    entry(
      "WindowPolicy",
      wp.id,
      "Invitation controls · policy",
      "UPDATE",
      diffFields(
        { howDocumentsAreSold: sale(wp.documentSaleMode), onlineRelease: onOff(wp.electronicDocumentRelease), paymentSimulator: onOff(wp.paymentSimulatorOn), paymentMethodsOffered: wp.simulatedPaymentMethods.join(", ") || "Not set" },
        { howDocumentsAreSold: sale(to.documentSaleMode), onlineRelease: onOff(to.electronicDocumentRelease), paymentSimulator: `${onOff(to.paymentSimulatorOn)} (a demonstration, not a payment provider)`, paymentMethodsOffered: to.simulatedPaymentMethods.join(", ") },
      ),
      "Demonstration setting: documents are sold at the counter; one exercise is sold online, paid on the simulator. Switch the simulator off before go-live.",
    );
  }
  // The demonstration's online exercise: DEMO/SX/0018/2026 was authored, with its sales and its notice, before the sale mode existed, and is pinned to the counter like the rest. For the demonstration it is the
  // one sold online, so the supplier portal shows Buy documents and the payment simulator on it. A demonstration exception, written here and nowhere else (a customer's exercise is pinned when it is made, G1).
  const online = await db.sourcingExercise.findFirst({ where: { organisationId, id: `${P}sx18`, saleMode: "COUNTER" }, select: { id: true, reference: true, title: true } });
  if (online) {
    await db.sourcingExercise.update({ where: { id: online.id }, data: { saleMode: "ONLINE" } });
    entry("SourcingExercise", online.id, `${online.reference} · ${online.title}`, "UPDATE", diffFields({ howDocumentsAreSold: "At the counter" }, { howDocumentsAreSold: "Online, through the supplier portal" }), "Demonstration setting: the exercise the online purchase and the payment simulator are shown on.");
  }

  // One of the demonstration's own exercises whose pin is still not set takes the setting (never another exercise).
  const unpinned = await db.sourcingExercise.findMany({ where: { organisationId, id: { startsWith: P }, OR: [{ specPanelUsed: null }, { onScreenBillUsed: null }] }, select: { id: true, reference: true, title: true, specPanelUsed: true, onScreenBillUsed: true } });
  for (const ex of unpinned) {
    const to = { specPanelUsed: ex.specPanelUsed ?? next.specPanelUsed, onScreenBillUsed: ex.onScreenBillUsed ?? next.onScreenBillUsed };
    await db.sourcingExercise.update({ where: { id: ex.id }, data: to });
    entry("SourcingExercise", ex.id, `${ex.reference} · ${ex.title}`, "UPDATE", diffFields({ specificationPanel: words(ex.specPanelUsed), onScreenBill: words(ex.onScreenBillUsed) }, { specificationPanel: words(to.specPanelUsed), onScreenBill: words(to.onScreenBillUsed) }), "Took the organisation's setting");
  }

  // The prescribed workbook, as the template file of the bill part of each pack kind.
  const parts = await db.tenderDocumentPart.findMany({ where: { organisationId, source: "BQ_UNPRICED", templateFileVersionId: null, code: { startsWith: P } }, select: { id: true, code: true, labelEn: true } });
  let templateSet = 0;
  if (parts.length) {
    const classRow = await db.documentClass.findFirst({ where: { id: `${P}dc1`, organisationId }, select: { id: true, nameEn: true, classification: true } });
    if (!classRow) throw new Error("Demo template file: the demonstration's document class is missing.");
    const docId = `${P}bqtemplate`;
    const versionId = `${docId}v1`;
    const title = "Prescribed bill of quantities workbook (demonstration)";
    const filename = "bill-of-quantities-template.xlsx";
    await db.blobContent.createMany({ data: [{ organisationId, sha256: sha(bytes), byteSize: BigInt(bytes.length), bytes: new Uint8Array(bytes), storedAt: now }], skipDuplicates: true });
    const retention = (await db.documentClass.findUniqueOrThrow({ where: { id: classRow.id }, select: { retentionMonths: true, retentionTrigger: true, disposalMethod: true, disposalAuthorityRoleCode: true, nameEn: true, provenance: true } }));
    await db.document.create({
      data: { id: docId, organisationId, title, documentClassId: classRow.id, classificationSnapshot: classRow.classification, retentionSnapshot: JSON.parse(JSON.stringify({ retentionMonths: retention.retentionMonths, retentionTrigger: retention.retentionTrigger, disposalMethod: retention.disposalMethod, disposalAuthorityRoleCode: retention.disposalAuthorityRoleCode, className: retention.nameEn, provenance: retention.provenance })), status: "FILED", stagedFor: STAGED_FOR_TEMPLATE_FILE, createdAt: now, filedAt: now },
    });
    await db.documentVersion.create({ data: { id: versionId, organisationId, documentId: docId, versionNo: 1, sha256: sha(bytes), byteSize: BigInt(bytes.length), mediaType: XLSX_TYPE, originalFilename: filename, recordedByPersonId: `${P}p3`, storedAt: now } });
    entry("Document", docId, `Document · ${title}`, "CREATE", documentCreated({ title, className: classRow.nameEn, classification: classRow.classification, status: "STAGED" }));
    entry("DocumentVersion", versionId, `Document · ${title} · version 1`, "CREATE", versionCreated({ versionNo: 1, sha256: sha(bytes), byteSize: BigInt(bytes.length), mediaType: XLSX_TYPE, originalFilename: filename, receivedOn: null, recordedBy: "Chen Wei Ling", note: "" }));
    entry("Document", docId, `Document · ${title}`, "UPDATE", filed());
    for (const p of parts) {
      await db.tenderDocumentPart.update({ where: { id: p.id }, data: { templateFileVersionId: versionId } });
      entry("TenderDocumentPart", p.id, `Tender document part · ${p.labelEn}`, "UPDATE", diffFields({ templateFile: "No template set" }, { templateFile: `${filename}, version 1` }), "Demonstration template file");
      templateSet++;
    }
  }
  if (trail.length) await db.auditEntry.createMany({ data: trail as never });
  return { policySet: !policy || policy.specPanelUsed == null || policy.onScreenBillUsed == null, pinned: unpinned.length, templateSet };
}
