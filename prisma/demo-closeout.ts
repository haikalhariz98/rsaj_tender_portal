/**
 * Completion demo (Phase 2 close-out stage B6; plan closeout-plan.md §8 B6). Invented throughout, ASSUMED; no RSAJ figure, office, form or period.
 *
 * demo_con13 (DEMO/KP/T/005/2026), its date for completion moved to 30 Oct 2026 by the time demo, completes on 26 Oct 2026. Through the product's
 * own acts (prisma/demo-acts.ts), on the demo clock, on 28 Oct:
 * - the damages window closed at the completion date, as the CPC asks;
 * - the certificate of practical completion raised by the S.O. (joint inspection on 27 Oct), with two defects listed; sent for approval on the demo
 *   matrix and approved by the Finance Director (the contract's S.O. office); signed by the S.O. and the contractor, which issues it: the contract is
 *   practically complete and its twelve-month defects liability period (from the award's terms) runs to 25 Oct 2027;
 * - the washout valve cover reported rectified by the contractor (recorded from its letter) and accepted; the road reinstatement reported, returned
 *   with a note, reported again and accepted.
 * The Schedule of Defects, the certificate of making good defects, the retention balance and the bond's return wait for the end of the period: the
 * demo does not move its contract's terms to show them (the database tests take a short period through every act).
 *
 * Configuration, invented and audited as the demo loader, written only by a fresh `demo:load` (rulings 12c, 20z): the CPC's demo form with an SO
 * authorising block and the contractor's (demo_zst1, blocks demo_zsb1–2, copies demo_zsd1–2) and its kind setting (demo_zsk1), one
 * `practical_completion` row on the demo matrix approved by the Finance Director (demo_zsr1), and the demo's release switches (ASSUMED). Acts' rows
 * take the sub-prefixes in demo-acts.ts (demo_zpc, zdi, zde). Ids grepped free.
 *
 * Stage D (close-out stage D): one demo contractor performance form for the "works" contract type (demo_zvf1, criteria demo_zvk1–5, grades
 * demo_zvb1–5), issued, invented and ASSUMED (RSAJ's seven CPD/SA-F0n workbooks are not in the repo, RSAJ question 39). Written only by the fresh
 * load's configuration, like the rest. demo_con13's report opens at its CMGD in Oct 2027, told by stage C's demo (prisma/demo-close.ts), which verifies it by a second person. `npm run demo:closeout` adds the acts to a loaded database only
 * where the configuration is already there; otherwise it refuses, naming what is missing.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { act } from "./demo-acts";
import { DEMO_ACTOR } from "./demo-actor";

type Db = PrismaClient;
const P = "demo_";
const CON = `${P}con13`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const people = { bala: `${P}p2`, eng: `${P}p5` };
const SOURCE = "Invented for the demo.";

async function configure(db: Db, organisationId: string) {
  const at = new Date("2026-10-04T01:00:00.000Z");
  let n = 0;
  const audit = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", changes: { field: string; before: null; after: string }[]) =>
    db.auditEntry.create({ data: { id: `${P}zsau${++n}`, organisationId, entity, entityId, entityLabel, action, at, changes, reason: "Demo completion configuration (invented, ASSUMED).", ...DEMO_ACTOR } as never });
  await db.documentTemplate.create({ data: { id: `${P}zst1`, organisationId, code: "demo_practical_completion", nameEn: "Demo certificate of practical completion", formCode: "DEMO-C-01", documentClassId: `${P}dc2`, bodyVersion: 1, revisionDate: day("2025-06-01"), provenance: "ASSUMED", notes: SOURCE, sortOrder: 47, bodyEn: ["{{organisation.name}}", "Certificate of practical completion · {{certificate.number}}", "Contract {{contract.number}} with {{contractor.name}} (demo text, invented).", "Dated {{certificate.date}}."].join("\n\n") } });
  await db.formSignatureBlock.createMany({
    data: [
      { id: `${P}zsb1`, organisationId, templateId: `${P}zst1`, blockOrder: 1, blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "SO", delegable: false, datesCertificate: true, provenance: "ASSUMED", notes: SOURCE },
      { id: `${P}zsb2`, organisationId, templateId: `${P}zst1`, blockOrder: 2, blockKind: "CONTRACTOR", labelEn: "Received by the contractor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true, provenance: "ASSUMED", notes: SOURCE },
    ],
  });
  await db.formDistribution.createMany({
    data: [
      { id: `${P}zsd1`, organisationId, templateId: `${P}zst1`, recipientCode: "demo_contractor", labelEn: "The contractor (original)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: true, sortOrder: 1, provenance: "ASSUMED", notes: SOURCE },
      { id: `${P}zsd2`, organisationId, templateId: `${P}zst1`, recipientCode: "demo_file", labelEn: "Contract file (demo)", mandatory: true, ackRequired: false, condition: "NONE", isOriginal: false, sortOrder: 2, provenance: "ASSUMED", notes: SOURCE },
    ],
  });
  await audit("DocumentTemplate", `${P}zst1`, "Template · Demo certificate of practical completion", "CREATE", [{ field: "blocks", before: null, after: "Superintending Officer (authorising, dates it); the contractor" }]);
  await db.certificateKindSetting.create({ data: { id: `${P}zsk1`, organisationId, kind: "PRACTICAL_COMPLETION", templateId: `${P}zst1`, routingTypeId: null, provenance: "ASSUMED", notes: SOURCE } });
  await audit("CertificateKindSetting", `${P}zsk1`, "Post-award controls · Practical completion", "CREATE", [{ field: "form", before: null, after: "Demo certificate of practical completion" }]);
  await db.authorityRule.create({ data: { id: `${P}zsr1`, authorityMatrixId: `${P}mx1`, domain: "practical_completion", ruleKey: "demo.practical_completion", labelEn: "Practical completion (demo)", approverCode: "FD", clause: "DEMO 9.4", sortOrder: 94 } });
  await audit("AuthorityRule", `${P}zsr1`, "Demo limits, issue 1 · practical completion (demo)", "CREATE", [{ field: "approver", before: null, after: "Finance Director (demo)" }]);
  // Stage D: a demo performance form for works contracts, issued (invented weights, scale and grades, ASSUMED). Inserted issued, as a loader writes history.
  await db.performanceForm.create({ data: { id: `${P}zvf1`, organisationId, nameEn: "Demo works performance", contractTypeCode: "works", scaleMax: 5, status: "ISSUED", version: 1, issuedAt: at, issuedByPersonId: `${P}p2`, provenance: "ASSUMED", source: SOURCE } });
  await db.performanceCriterion.createMany({
    data: [
      ["Quality of work", "0.3000"],
      ["Progress against the programme", "0.2500"],
      ["Site safety and health", "0.2000"],
      ["Site management", "0.1500"],
      ["Cooperation", "0.1000"],
    ].map(([labelEn, weight], i) => ({ id: `${P}zvk${i + 1}`, organisationId, formId: `${P}zvf1`, sortOrder: i + 1, labelEn, guideEn: "", weight })),
  });
  await db.performanceGradeBand.createMany({ data: [["E", "0"], ["D", "40"], ["C", "50"], ["B", "60"], ["A", "80"]].map(([label, lowerPct], i) => ({ id: `${P}zvb${i + 1}`, organisationId, formId: `${P}zvf1`, label, lowerPct, sortOrder: i })) });
  await audit("PerformanceForm", `${P}zvf1`, "Performance form Demo works performance, version 1", "CREATE", [{ field: "form", before: null, after: "Demo works performance: five criteria, scores 1 to 5, grades A to E (invented)" }]);
  const policy = await db.postAwardPolicy.findFirst({ where: { id: `${P}wpa1`, organisationId }, select: { id: true, retentionBalanceReleaseAt: true, performanceBondReleaseAt: true } });
  if (policy && policy.retentionBalanceReleaseAt == null && policy.performanceBondReleaseAt == null) {
    await db.postAwardPolicy.update({ where: { id: policy.id }, data: { retentionBalanceReleaseAt: "MAKING_GOOD", retentionBalanceReleaseProvenance: "ASSUMED", performanceBondReleaseAt: "MAKING_GOOD", performanceBondReleaseProvenance: "ASSUMED" } });
    await audit("PostAwardPolicy", policy.id, "Post-award controls", "UPDATE", [{ field: "retentionBalanceReleased", before: null, after: "At the certificate of making good defects" }, { field: "performanceBondReturned", before: null, after: "At the certificate of making good defects" }]);
  }
}

/// `configure`: only the fresh `demo:load` writes the configuration (rulings 12c, 20z: none on a loaded database).
export async function loadCloseoutDemo(db: Db, organisationId: string, opts: { configure: boolean }): Promise<{ notes: string[] }> {
  if (!(await db.contract.findUnique({ where: { id: CON }, select: { id: true } }))) return { notes: ["demo_con13 is not loaded: the completion demo is skipped"] };
  if (await db.practicalCompletion.findFirst({ where: { contractId: CON }, select: { id: true } })) return { notes: [] };
  const configured = !!(await db.certificateKindSetting.findUnique({ where: { id: `${P}zsk1` }, select: { id: true } }));
  if (!configured && !opts.configure) throw new Error("demo completion: the completion configuration (the CPC's form and setting, the practical_completion row, the release switches) is not on this database, and no configuration is written on a loaded database. Load a fresh demo, or set them under Settings.");
  if (!configured) await configure(db, organisationId);
  const Y = await import("../src/app/projects/[id]/payment-actions");
  const K = await import("../src/app/projects/[id]/closeout-actions");
  const C = await import("../src/app/projects/[id]/certificates/[certId]/actions");
  const id = CON;
  const decision = await db.nonCompletion.findFirst({ where: { contractId: id, outcome: "LAD_APPLIES", windowUntil: null }, orderBy: { recordedAt: "desc" }, select: { id: true } });
  if (decision) await act("2026-10-28T08:30", "damages window closed", Y.closeLadWindow, { id, decisionId: decision.id, windowUntil: "2026-10-26", reason: "Practically complete on 26 Oct 2026 (demo)." });
  await act("2026-10-28T09:00", "CPC raised", K.raisePracticalCompletion, { id, completionDate: "2026-10-26", possessionTakenOn: "2026-10-26", inspectedOn: "2026-10-27", attendeeIds: people.bala, otherAttendees: "Tan Mei Hua (the contractor's site agent)", testReasons: "The mains are commissioned and the road reinstated; the two items listed do not stop the works being used (demo).", personId: people.bala });
  const pc = await db.practicalCompletion.findFirstOrThrow({ where: { contractId: id } });
  const lines = [
    { description: "Washout valve chamber cover missing at chainage 1+650", location: "Chainage 1+650", dueOn: "2026-11-09" },
    { description: "Road reinstatement settled along the trench", location: "Chainage 1+400 to 1+460", dueOn: "2026-11-16" },
  ];
  for (const [i, l] of lines.entries()) await act(`2026-10-28T09:1${i}`, `CPC defect ${i + 1}`, K.addCpcDefect, { id, ...l, personId: people.bala });
  const certId = pc.certificateId;
  await act("2026-10-28T10:00", "CPC sent for approval", C.sendCertificateForApproval, { certId, personId: people.eng });
  const route = await db.approvalInstance.findFirstOrThrow({ where: { certificateId: certId }, include: { steps: { orderBy: { sequence: "asc" } } }, orderBy: { openedAt: "desc" } });
  for (const st of route.steps) await act("2026-10-28T11:00", `CPC step ${st.sequence}`, C.decideCertificateRouteStep, { certId, stepId: st.id, decision: "DONE", personId: people.bala, decidedOn: "2026-10-28", receivedOn: "2026-10-28", reason: "" });
  await act("2026-10-28T11:30", "CPC to signing", C.sendCertificateToSigning, { certId });
  await act("2026-10-28T12:00", "CPC S.O.'s block", C.recordCertificateSignature, { certId, blockOrder: "1", personBlock: "yes", personId: people.bala });
  await act("2026-10-28T12:10", "CPC contractor's block", C.recordCertificateSignature, { certId, blockOrder: "2", personBlock: "no", name: "Tan Mei Hua", icNumber: "000000-00-0013", signedOn: "2026-10-28" });
  const issued = await db.certificate.findUniqueOrThrow({ where: { id: certId }, include: { copies: true } });
  if (issued.status !== "ISSUED") throw new Error(`demo completion: the CPC is ${issued.status}, not issued`);
  for (const cp of issued.copies.filter((x) => x.mandatory)) await act("2026-10-28T13:00", `CPC copy ${cp.copyNo}`, C.despatchCertificateCopy, { certId, copyId: cp.id, method: "BY_HAND", despatchedOn: "2026-10-28" });
  const [cover, road] = await db.defectItem.findMany({ where: { practicalCompletionId: pc.id }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] });
  await act("2026-10-28T15:00", "cover reported rectified", K.reportDefectRectified, { id, defectId: cover.id, on: "2026-10-28", note: "Cover fitted (the contractor's letter of 28 Oct, demo).", personId: people.bala });
  await act("2026-10-28T15:30", "cover accepted", K.acceptDefect, { id, defectId: cover.id, on: "2026-10-28", note: "", personId: people.bala });
  await act("2026-10-28T16:00", "road reported rectified", K.reportDefectRectified, { id, defectId: road.id, on: "2026-10-28", note: "Trench topped up (the contractor's letter, demo).", personId: people.bala });
  await act("2026-10-28T16:30", "road returned", K.returnDefect, { id, defectId: road.id, on: "2026-10-28", note: "Settlement remains at the kerb line (demo).", personId: people.bala });
  await act("2026-10-28T17:00", "road reported again", K.reportDefectRectified, { id, defectId: road.id, on: "2026-10-28", note: "Kerb line relaid (the contractor's letter, demo).", personId: people.bala });
  await act("2026-10-28T17:30", "road accepted", K.acceptDefect, { id, defectId: road.id, on: "2026-10-28", note: "", personId: people.bala });
  return { notes: ["demo_con13 practically complete on 26 Oct 2026, its two defects made good (one after a return)"] };
}

/// Read back through the product's own readings (X-10): the CPC issued with its two lines frozen, the contract practically complete, the DLP frozen,
/// both lines made good.
export async function checkCloseoutDemo(db: Db) {
  const { loadCloseout, defectFactsOf } = await import("../src/lib/closeout/load");
  const { defectState } = await import("../src/lib/closeout/defects");
  const fail = (what: string) => {
    throw new Error(`demo check (completion, demo_con13): ${what}`);
  };
  const c = await db.contract.findUniqueOrThrow({ where: { id: CON }, select: { status: true } });
  if (c.status !== "PRACTICALLY_COMPLETE") fail(`the contract is ${c.status}, not practically complete`);
  const rows = await loadCloseout(CON, db as never);
  if (rows.cpc?.certificate.status !== "ISSUED") fail("the CPC is not issued");
  if (((rows.cpc!.frozenLines as unknown[]) ?? []).length !== 2) fail("the CPC does not hold its two lines");
  if (!rows.cpc!.dlpEnd || rows.cpc!.dlpEnd.toISOString().slice(0, 10) !== "2027-10-26") fail(`the DLP ends ${rows.cpc!.dlpEnd?.toISOString().slice(0, 10)}, not 2027-10-26 (exclusive)`);
  const states = defectFactsOf(rows).map((d) => defectState(d.events).state);
  if (states.join(",") !== "MADE_GOOD,MADE_GOOD") fail(`the lines read ${states.join(",")}`);
}
