/**
 * Close demo (Phase 2 close-out stage C6; plan closeout-plan.md §8 C6, and stage D's D4, moved here: the closed contract carries a verified performance
 * report made by two people). Invented throughout, ASSUMED; no RSAJ figure, office, form or period.
 *
 * demo_con13's defects liability period runs a full twelve months from 26 Oct 2026 (stage B's demo, prisma/demo-closeout.ts), so the rest of its life is told
 * on the demo clock from November 2026 to November 2027, through the product's own acts (prisma/demo-acts.ts):
 * - November 2026: interim 3 paid; interim 4 (raised by the time demo) approved, issued and paid;
 * - October 2027: the final defects inspection, then the certificate of making good defects, approved by the Finance Director (the S.O.'s office) and
 *   signed by the S.O. and the contractor: the contract's making good is complete;
 * - November 2027: the retention balance released, the performance bond and the advance payment guarantee returned; the contractor performance report
 *   opened and scored by the S.O. and verified by Finance's officer; the contractor's statutory declaration (its rows as the portal's upload writes them)
 *   taken up by the S.O.; the final account raised by the S.O., the declaration linked, Finance's payments confirmed; the final certificate sent on
 *   `final_payment`, recommended by the Head of Contract & Procurement, accepted by the contractor and witnessed, issued by the S.O., paid; then closed.
 * Its dates are later than the real day the demo is loaded: that is the price of a full defects liability period, and the screens show them as recorded.
 *
 * Configuration, invented and ASSUMED, written only by a fresh load (rulings 12c, 20z): the CMGD's form (demo_zst2, blocks demo_zsb3–4, copies
 * demo_zsd3–4) and the final certificate's (demo_zst3, blocks demo_zsb5–8, copies demo_zsd5–6), their kind settings (demo_zsk2–3), the `making_good` and
 * `final_payment` rows on the demo matrix approved by the Finance Director (demo_zsr2–3), and the final account's previous-payments setting
 * (BEFORE_DEDUCTIONS). Acts' rows take the sub-prefixes in demo-acts.ts (demo_zmg, zrs, zpr, zps, zfa, zfl, zfp, zcc, zpd). Ids grepped free.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { act } from "./demo-acts";
import { DEMO_ACTOR } from "./demo-actor";

type Db = PrismaClient;
const P = "demo_";
const CON = `${P}con13`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const people = { aisyah: `${P}p1`, bala: `${P}p2`, chen: `${P}p3`, eng: `${P}p5` };
const SOURCE = "Invented for the demo.";

async function configure(db: Db, organisationId: string) {
  const at = new Date("2026-10-04T01:00:00.000Z");
  let n = 100;
  const audit = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", changes: { field: string; before: null; after: string }[]) =>
    db.auditEntry.create({ data: { id: `${P}zsau${++n}`, organisationId, entity, entityId, entityLabel, action, at, changes, reason: "Demo close configuration (invented, ASSUMED).", ...DEMO_ACTOR } as never });
  const body = (title: string) => ["{{organisation.name}}", `${title} · {{certificate.number}}`, "Contract {{contract.number}} with {{contractor.name}} (demo text, invented).", "Dated {{certificate.date}}."].join("\n\n");
  await db.documentTemplate.createMany({
    data: [
      { id: `${P}zst2`, organisationId, code: "demo_making_good", nameEn: "Demo certificate of making good defects", formCode: "DEMO-C-03", documentClassId: `${P}dc2`, bodyVersion: 1, revisionDate: day("2025-06-01"), provenance: "ASSUMED", notes: SOURCE, sortOrder: 48, bodyEn: body("Certificate of making good defects") },
      { id: `${P}zst3`, organisationId, code: "demo_final", nameEn: "Demo final certificate", formCode: "DEMO-C-04", documentClassId: `${P}dc2`, bodyVersion: 1, revisionDate: day("2025-06-01"), provenance: "ASSUMED", notes: SOURCE, sortOrder: 49, bodyEn: body("Final certificate") },
    ],
  });
  const b = (k: number, templateId: string, blockOrder: number, x: Record<string, unknown>) => ({ id: `${P}zsb${k}`, organisationId, templateId, blockOrder, provenance: "ASSUMED" as const, notes: SOURCE, ...x });
  await db.formSignatureBlock.createMany({
    data: [
      b(3, `${P}zst2`, 1, { blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "SO", delegable: false, datesCertificate: true }),
      b(4, `${P}zst2`, 2, { blockKind: "CONTRACTOR", labelEn: "Received by the contractor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true }),
      // CO-9: recommended, the contractor's acceptance with its witness, then the S.O., who dates it.
      b(5, `${P}zst3`, 1, { blockKind: "RECOMMENDING", labelEn: "Recommended by", officeRule: "NAMED_OFFICE", officeCode: "HOD_CP", delegable: true, carriesDecision: true }),
      b(6, `${P}zst3`, 2, { blockKind: "CONTRACTOR", labelEn: "Accepted by the contractor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true }),
      b(7, `${P}zst3`, 3, { blockKind: "WITNESS", labelEn: "Witness to the contractor", officeRule: "WITNESS", delegable: true }),
      b(8, `${P}zst3`, 4, { blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "SO", delegable: false, datesCertificate: true }),
    ] as never,
  });
  const d = (k: number, templateId: string, original: boolean) => ({ id: `${P}zsd${k}`, organisationId, templateId, recipientCode: original ? "demo_contractor" : "demo_file", labelEn: original ? "The contractor (original)" : "Contract file (demo)", mandatory: true, ackRequired: original, condition: "NONE" as const, isOriginal: original, sortOrder: original ? 1 : 2, provenance: "ASSUMED" as const, notes: SOURCE });
  await db.formDistribution.createMany({ data: [d(3, `${P}zst2`, true), d(4, `${P}zst2`, false), d(5, `${P}zst3`, true), d(6, `${P}zst3`, false)] });
  await audit("DocumentTemplate", `${P}zst2`, "Template · Demo certificate of making good defects", "CREATE", [{ field: "blocks", before: null, after: "Superintending Officer (authorising, dates it); the contractor" }]);
  await audit("DocumentTemplate", `${P}zst3`, "Template · Demo final certificate", "CREATE", [{ field: "blocks", before: null, after: "Recommended by the Head of Contract & Procurement; the contractor's acceptance and its witness; the Superintending Officer (dates it)" }]);
  await db.certificateKindSetting.createMany({
    data: [
      { id: `${P}zsk2`, organisationId, kind: "MAKING_GOOD_DEFECTS", templateId: `${P}zst2`, routingTypeId: null, provenance: "ASSUMED", notes: SOURCE },
      { id: `${P}zsk3`, organisationId, kind: "FINAL", templateId: `${P}zst3`, routingTypeId: null, provenance: "ASSUMED", notes: SOURCE },
    ],
  });
  await audit("CertificateKindSetting", `${P}zsk2`, "Post-award controls · Making good of defects", "CREATE", [{ field: "form", before: null, after: "Demo certificate of making good defects" }]);
  await audit("CertificateKindSetting", `${P}zsk3`, "Post-award controls · Final certificate", "CREATE", [{ field: "form", before: null, after: "Demo final certificate" }]);
  await db.authorityRule.createMany({
    data: [
      { id: `${P}zsr2`, authorityMatrixId: `${P}mx1`, domain: "making_good", ruleKey: "demo.making_good", labelEn: "Making good of defects (demo)", approverCode: "FD", clause: "DEMO 9.5", sortOrder: 95 },
      { id: `${P}zsr3`, authorityMatrixId: `${P}mx1`, domain: "final_payment", ruleKey: "demo.final_payment", labelEn: "Final certificate (demo)", approverCode: "FD", clause: "DEMO 9.6", sortOrder: 96 },
    ],
  });
  await audit("AuthorityRule", `${P}zsr2`, "Demo limits, issue 1 · making good of defects (demo)", "CREATE", [{ field: "approver", before: null, after: "Finance Director (demo)" }]);
  await audit("AuthorityRule", `${P}zsr3`, "Demo limits, issue 1 · final certificate (demo)", "CREATE", [{ field: "approver", before: null, after: "Finance Director (demo)" }]);
  const policy = await db.postAwardPolicy.findFirst({ where: { id: `${P}wpa1`, organisationId }, select: { id: true, finalPreviousBasis: true } });
  if (policy && policy.finalPreviousBasis == null) {
    await db.postAwardPolicy.update({ where: { id: policy.id }, data: { finalPreviousBasis: "BEFORE_DEDUCTIONS", finalAccountProvenance: "ASSUMED" } });
    await audit("PostAwardPolicy", policy.id, "Post-award controls", "UPDATE", [{ field: "finalAccountPreviousPayments", before: null, after: "Before their deductions" }]);
  }
}

/// `configure`: only the fresh `demo:load` writes the configuration (rulings 12c, 20z: none on a loaded database).
export async function loadCloseDemo(db: Db, organisationId: string, opts: { configure: boolean }): Promise<{ notes: string[] }> {
  const c = await db.contract.findUnique({ where: { id: CON }, select: { status: true, awardId: true } });
  if (!c) return { notes: ["demo_con13 is not loaded: the close demo is skipped"] };
  if (c.status === "CLOSED") return { notes: [] };
  if (c.status !== "PRACTICALLY_COMPLETE") throw new Error(`demo close: demo_con13 is ${c.status}, not practically complete; nothing is written.`);
  const configured = !!(await db.certificateKindSetting.findUnique({ where: { id: `${P}zsk3` }, select: { id: true } }));
  if (!configured && !opts.configure) throw new Error("demo close: the close configuration (the CMGD's and the final certificate's forms and settings, the making_good and final_payment rows) is not on this database, and no configuration is written on a loaded database. Load a fresh demo, or set them under Settings.");
  if (!configured) await configure(db, organisationId);
  const Y = await import("../src/app/projects/[id]/payment-actions");
  const K = await import("../src/app/projects/[id]/closeout-actions");
  const C = await import("../src/app/projects/[id]/certificates/[certId]/actions");
  const R = await import("../src/app/projects/[id]/performance-actions");
  const F = await import("../src/app/projects/[id]/final-actions");
  const { demoPdf, writeDemoDocs } = await import("./demo-documents");
  const id = CON;
  const holder: Record<string, string> = { HOD_CP: people.chen, FD: people.bala, CEO: people.aisyah, SEC_PRE: people.eng };
  const cert = (certId: string) => db.certificate.findUniqueOrThrow({ where: { id: certId }, include: { approvalInstances: { include: { steps: { orderBy: { sequence: "asc" } } }, orderBy: { createdAt: "asc" } }, copies: true } });
  /// Sent on its route by Finance's officer, its sheet (if any) received and checked, each step decided by its office's demo holder.
  const approve = async (certId: string, on: string, decidedOn: string) => {
    await act(`${on}T09:00`, `${certId} sent`, C.sendCertificateForApproval, { certId, personId: people.eng });
    if ((await cert(certId)).routingTypeId) {
      await act(`${on}T09:10`, `${certId} received`, C.recordCertificateReceived, { certId, receivedOn: on });
      await act(`${on}T09:20`, `${certId} checked`, C.recordCertificateCheck, { certId, defOrder: "1", personId: people.eng, on, note: "" });
      await act(`${on}T09:30`, `${certId} verified`, C.recordCertificateCheck, { certId, defOrder: "2", personId: people.chen, on, note: "" });
    }
    const route = (await cert(certId)).approvalInstances.at(-1)!;
    for (const [i, st] of route.steps.entries()) {
      const who = holder[st.roleCode ?? ""];
      if (!who) throw new Error(`demo close ${certId}: no demo holder for ${st.roleCode}`);
      await act(`${decidedOn}T1${5 + i}:00`, `${certId} step ${st.sequence}`, C.decideCertificateRouteStep, { certId, stepId: st.id, decision: "DONE", personId: who, decidedOn, receivedOn: decidedOn, reason: "" });
    }
  };
  type Block = { order: number; person?: string; name?: string; ic?: string; decision?: "SUPPORTED"; on: string };
  /// To signing, each block in order (the last issues it), the copies despatched and the original acknowledged.
  const sign = async (certId: string, on: string, blocks: Block[]) => {
    await act(`${on}T16:00`, `${certId} to signing`, C.sendCertificateToSigning, { certId });
    for (const [i, x] of blocks.entries()) await act(`${x.on}T16:${String(10 + i * 5)}`, `${certId} block ${x.order}`, C.recordCertificateSignature, { certId, blockOrder: String(x.order), personBlock: x.person ? "yes" : "no", personId: x.person, name: x.name, icNumber: x.ic, signedOn: x.person ? undefined : x.on, decision: x.decision });
    const issued = await cert(certId);
    if (issued.status !== "ISSUED") throw new Error(`demo close ${certId}: ${issued.status} after its last block, not issued`);
    const last = blocks.at(-1)!.on;
    for (const cp of issued.copies.filter((x) => x.mandatory)) await act(`${last}T17:00`, `${certId} copy ${cp.copyNo}`, C.despatchCertificateCopy, { certId, copyId: cp.id, method: "BY_HAND", despatchedOn: last });
    const original = issued.copies.find((x) => x.isOriginal && x.ackRequired);
    if (original) await act(`${last}T17:10`, `${certId} acknowledged`, C.acknowledgeCertificateCopy, { certId, copyId: original.id, acknowledgedOn: last });
  };
  const pay = (certId: string, on: string, batch: string) => act(`${on}T10:00`, `paid ${certId}`, C.recordCertificatePayment, { certId, batchNo: batch, paidOn: on, personId: people.eng, note: "" });
  const contractor = { name: "Tan Mei Hua", ic: "000000-00-0013" };

  // November 2026: interim 3 paid; interim 4 (raised by the time demo) approved, issued and paid.
  const interims = await db.interimValuation.findMany({ where: { contractId: id }, include: { certificate: { include: { financePayment: { select: { id: true } } } } }, orderBy: { valuationDate: "asc" } });
  for (const v of interims) if (v.certificate?.status === "ISSUED" && !v.certificate.financePayment) await pay(v.certificate.id, "2026-11-02", `PV/2026/11${String(v.certificate.sequence ?? 0).padStart(2, "0")}`);
  const ic4 = interims.find((v) => v.certificate?.status === "DRAFT")?.certificate?.id;
  if (ic4) {
    await approve(ic4, "2026-11-03", "2026-11-04");
    await sign(ic4, "2026-11-04", [{ order: 1, person: people.chen, decision: "SUPPORTED", on: "2026-11-05" }, { order: 2, person: people.bala, on: "2026-11-05" }, { order: 3, name: contractor.name, ic: contractor.ic, on: "2026-11-05" }, { order: 4, name: "Ahmad bin Contoh", on: "2026-11-05" }]);
    await pay(ic4, "2026-11-16", "PV/2026/1104");
  }

  // October 2027: the period ended on 25 Oct; the final defects inspection, then the certificate of making good defects.
  await act("2027-10-27T09:00", "CMGD raised", K.raiseMakingGood, { id, madeGoodOn: "2026-10-28", finalInspectionOn: "2027-10-26", personId: people.bala });
  const mg = await db.makingGood.findFirstOrThrow({ where: { contractId: id }, orderBy: { recordedAt: "desc" } });
  await approve(mg.certificateId, "2027-10-27", "2027-10-28");
  await sign(mg.certificateId, "2027-10-28", [{ order: 1, person: people.bala, on: "2027-10-29" }, { order: 2, name: contractor.name, ic: contractor.ic, on: "2027-10-29" }]);

  // What the CMGD authorises: the retention balance and the performance bond; and the advance payment guarantee, its advance recouped.
  await act("2027-11-01T10:00", "retention balance released", Y.releaseRetention, { id, release: "RELEASED_BALANCE", releasedOn: "2027-11-01", personId: people.bala, note: "At the certificate of making good defects (demo)." });
  for (const [k, securityId] of [`${P}sec13`, `${P}sec14`].entries()) await act(`2027-11-01T1${1 + k}:00`, `security ${securityId} returned`, K.returnSecurity, { id, securityId, returnedOn: "2027-11-01", officialReceiptRef: "", note: "Returned to the issuing bank by registered post (demo).", personId: people.bala });

  // The contractor performance report: opened and scored by the S.O., verified by Finance's officer, a second person.
  await act("2027-11-02T09:00", "performance report opened", R.openPerformanceReport, { id, personId: people.bala });
  await act("2027-11-02T10:00", "performance scored", R.savePerformanceScores, { id, score_1: "4", note_1: "Workmanship consistent along the main (demo).", score_2: "3", note_2: "Late on the reinstatement (demo).", score_3: "5", note_3: "", score_4: "3", note_4: "", score_5: "3", note_5: "" });
  await act("2027-11-02T11:00", "performance assessed", R.assessPerformanceReport, { id, personId: people.bala });
  await act("2027-11-03T10:00", "performance verified", R.verifyPerformanceReport, { id, personId: people.eng });

  // The contractor's statutory declaration, sent in the portal (its rows as the portal's upload writes them), taken up by the S.O.
  const award = await db.award.findUniqueOrThrow({ where: { id: c.awardId }, select: { vendorId: true, awardeeName: true } });
  const account = award.vendorId ? await db.supplierAccount.findFirst({ where: { supplierId: award.vendorId, organisationId }, orderBy: { id: "asc" }, select: { id: true } }) : null;
  if (!account) throw new Error("demo close: demo_con13's contractor has no portal account, so its statutory declaration cannot be sent");
  const docId = `${P}zsdc1`;
  const versionId = `${P}zsdc1v1`;
  const sentAt = new Date("2027-11-03T01:00:00.000Z");
  await db.projectDocument.create({ data: { id: docId, organisationId, contractId: id, title: "Statutory declaration for the final account", note: "", side: "CONTRACTOR", kind: "STATUTORY_DECLARATION", createdBySupplierAccountId: account.id, createdAt: sentAt } });
  await db.projectDocumentVersion.create({ data: { id: versionId, organisationId, documentId: docId, number: 1, note: "Declared before a Commissioner for Oaths (demo).", uploadedBySupplierAccountId: account.id, uploadedAt: sentAt, uploadedOn: day("2027-11-03"), noApproversAtUpload: true } });
  const files = await writeDemoDocs(
    db,
    organisationId,
    [{ id: `${P}zsdf1`, title: "statutory-declaration", classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL", createdAt: "2027-11-03T01:00", stagedFor: "project-document", versions: [{ id: `${P}zsdf1v1`, n: 1, bytes: demoPdf(["Statutory declaration (demo)", award.awardeeName, "Every subcontractor, supplier and worker is paid (invented)."]), mediaType: "application/pdf", filename: "statutory-declaration.pdf", receivedOn: "2027-11-03", storedAt: "2027-11-03T01:00" }], attachments: [{ id: `${P}zsdf1a`, purpose: "PROJECT_DOCUMENT_FILE", owner: { projectDocumentVersionId: versionId }, ownerLabel: "Statutory declaration for the final account, version 1", versionId: `${P}zsdf1v1`, at: "2027-11-03T01:00" }] }] as never,
    `${P}zsdf_au`,
    { supplierAccountId: account.id, name: award.awardeeName },
  );
  await files.flush();
  // The mark is the S.O.'s own act on the signed-in person's authority, which a loader has none of: written as its row and trail, as the Project workspace demo writes its decisions.
  const takenAt = new Date("2027-11-03T06:00:00.000Z");
  await db.projectDocumentDecision.create({ data: { id: `${P}zpd1`, organisationId, versionId, outcome: "TAKEN_UP", remarks: "", decidedByPersonId: people.bala, decidedAt: takenAt, decidedOn: day("2027-11-03") } });
  await db.auditEntry.create({ data: { id: `${P}zsau120`, organisationId, entity: "ProjectDocumentDecision", entityId: `${P}zpd1`, entityLabel: `Contract ${(await db.contract.findUniqueOrThrow({ where: { id }, select: { number: true } })).number} · ${award.awardeeName} · Statutory declaration for the final account · Version 1`, action: "CREATE", at: takenAt, changes: [{ field: "mark", before: null, after: "Taken up" }, { field: "decidedBy", before: null, after: "Bala Krishnan" }], reason: "", ...DEMO_ACTOR } as never });

  // The final account: raised by the S.O., the declaration linked, Finance's payments confirmed; its certificate on its route, signed and paid; then closed.
  await act("2027-11-08T09:00", "final account raised", F.raiseFinalAccount, { id, personId: people.bala });
  await act("2027-11-08T10:00", "declaration linked", F.linkDeclaration, { id, documentId: docId });
  const { loadPayment } = await import("../src/lib/payment/load");
  const { financePaidOf } = await import("../src/lib/closeout/final-load");
  const { senToDecimalString } = await import("../src/lib/money");
  await act("2027-11-08T11:00", "Finance's payments confirmed", F.confirmFinalPayments, { id, total: senToDecimalString(financePaidOf(await loadPayment(id, db as never))), personId: people.eng });
  const fa = await db.finalAccount.findFirstOrThrow({ where: { contractId: id }, orderBy: { recordedAt: "desc" } });
  await approve(fa.certificateId, "2027-11-09", "2027-11-10");
  await sign(fa.certificateId, "2027-11-10", [
    { order: 1, person: people.chen, decision: "SUPPORTED", on: "2027-11-11" },
    { order: 2, name: contractor.name, ic: contractor.ic, on: "2027-11-11" },
    { order: 3, name: "Ahmad bin Contoh", ic: "000000-00-0014", on: "2027-11-11" },
    { order: 4, person: people.bala, on: "2027-11-12" },
  ]);
  await pay(fa.certificateId, "2027-11-19", "PV/2027/1119");
  await act("2027-11-22T10:00", "contract closed", F.closeContract, { id, personId: people.bala });
  return { notes: ["demo_con13 made good, its final account paid and the contract closed (Nov 2027 on the demo clock), its performance report verified by a second person"] };
}

/// Read back (X-10): the contract closed once, the final certificate issued and paid, the report verified by someone other than its assessor.
export async function checkCloseDemo(db: Db) {
  const fail = (what: string) => {
    throw new Error(`demo check (close, demo_con13): ${what}`);
  };
  const c = await db.contract.findUniqueOrThrow({ where: { id: CON }, select: { status: true } });
  if (c.status !== "CLOSED") fail(`the contract is ${c.status}, not closed`);
  if ((await db.contractClosure.count({ where: { contractId: CON } })) !== 1) fail("the contract is not closed exactly once");
  const fa = await db.finalAccount.findFirst({ where: { contractId: CON }, include: { certificate: { include: { financePayment: { select: { id: true } } } } }, orderBy: { recordedAt: "desc" } });
  if (fa?.certificate.status !== "ISSUED" || !fa.certificate.financePayment) fail("the final certificate is not issued and paid");
  const r = await db.performanceReport.findUnique({ where: { contractId: CON }, select: { assessedByPersonId: true, verifiedByPersonId: true } });
  if (!r?.verifiedByPersonId || !r.assessedByPersonId || r.verifiedByPersonId === r.assessedByPersonId) fail("the performance report is not verified by a second person");
}
