/**
 * Time demo (Phase 2 close-out stage A5; plan closeout-plan.md §8 A5). Invented throughout, ASSUMED; no RSAJ figure, office, form, clause or period.
 *
 * demo_con13 (DEMO/KP/T/005/2026), past its date for completion of 31 Aug 2026 and charged damages on interim 3, is given an extension of time through
 * the product's own acts (prisma/demo-acts.ts), each on the demo clock:
 * - 5 Oct, the contractor's delay notice (the district council's road closure permit issued late);
 * - 6 Oct, the claim (60 days, no financial impact); 7 Oct, answered; 8 Oct, two reasons (45 and 15 days, consecutive);
 * - 9 Oct, determined entitled by the S.O.; 12 Oct, sent for approval on the demo matrix; 14 Oct, approved by the CEO;
 * - 15 Oct, the EOT certificate raised (60 days granted); 16 Oct, signed in the S.O.'s authorising block (ruling 23: the demo form's block is the
 *   S.O.'s) and by the contractor, which issues it: the date for completion moves to 30 Oct 2026 and the damages decision is superseded;
 * - 27 Oct, interim valuation 4 on the contractor's claim, raised: on or before the new date, nothing is charged and interim 3's damages are credited.
 *
 * Configuration, invented and audited as the demo loader, each written only where absent: the contract matters' numbering series (demo_tsn1), three
 * `eot` rows on the demo matrix approved by the CEO (demo_tsr1–3), the EOT form with an SO authorising block and the contractor's (demo_tst1, blocks
 * demo_tsb1–2, copies demo_tsd1–2) and its kind setting (demo_tsk1), and the demo's own post-award controls' waiver timing and accrual alert (ASSUMED).
 * Acts' rows take the sub-prefixes in demo-acts.ts (demo_tdn, tcm, tec, tcn, ter, tex). Ids grepped free. Applied alone by `npm run demo:time`, and at the
 * end of a full load; a second run writes nothing. Only the full load writes the configuration: on a loaded database `demo:time` refuses where it is missing.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { act } from "./demo-acts";
import { DEMO_ACTOR } from "./demo-actor";
import { putSeries } from "./demo-series";

type Db = PrismaClient;
const P = "demo_";
const CON = `${P}con13`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const people = { aisyah: `${P}p1`, bala: `${P}p2` };
const SOURCE = "Invented for the demo.";

async function configure(db: Db, organisationId: string) {
  const at = new Date("2026-10-04T01:00:00.000Z");
  let n = 0;
  const audit = (entity: string, entityId: string, entityLabel: string, changes: { field: string; before: null; after: string }[]) =>
    db.auditEntry.create({ data: { id: `${P}tsau${++n}`, organisationId, entity, entityId, entityLabel, action: "CREATE", at, changes, reason: "Demo time configuration (invented, ASSUMED).", ...DEMO_ACTOR } as never });
  if (await putSeries(db, { id: `${P}tsn1`, organisationId, key: "contract_matter", nameEn: "Contract matters", pattern: "DEMO/CM/{SERIAL}/{YEAR}", padding: 3, resetOn: "CALENDAR_YEAR", nextSerial: 1, serialPeriod: "2026", provenance: "ASSUMED", notes: SOURCE })) await audit("NumberingSeries", `${P}tsn1`, "Numbering · Contract matters", [{ field: "pattern", before: null, after: "DEMO/CM/{SERIAL}/{YEAR}" }]);
  const rule = (k: number, cond: string, label: string) => ({ id: `${P}tsr${k}`, authorityMatrixId: `${P}mx1`, domain: "eot", cond, ruleKey: `demo.eot.${cond}`, labelEn: label, approverCode: "CEO", clause: `DEMO 9.${k}`, sortOrder: 90 + k });
  await db.authorityRule.createMany({
    data: [rule(1, "no_financial_impact", "Extension of time, no financial impact"), rule(2, "financial_authority", "Extension of time, financial impact from an authority's requirement"), rule(3, "financial_not_authority", "Extension of time, other financial impact")],
  });
  for (const k of [1, 2, 3]) await audit("AuthorityRule", `${P}tsr${k}`, `Demo limits, issue 1 · extension of time (demo ${k})`, [{ field: "approver", before: null, after: "Chief Executive Officer (demo)" }]);
  await db.documentTemplate.create({ data: { id: `${P}tst1`, organisationId, code: "demo_extension_of_time", nameEn: "Demo certificate of extension of time", formCode: "DEMO-T-01", documentClassId: `${P}dc2`, bodyVersion: 1, revisionDate: day("2025-06-01"), provenance: "ASSUMED", notes: SOURCE, sortOrder: 46, bodyEn: ["{{organisation.name}}", "Certificate of extension of time · {{certificate.number}}", "Contract {{contract.number}} with {{contractor.name}} (demo text, invented).", "Dated {{certificate.date}}."].join("\n\n") } });
  await db.formSignatureBlock.createMany({
    data: [
      // Ruling 23: the authorising block is the S.O.'s (office rule SO), and it dates the certificate.
      { id: `${P}tsb1`, organisationId, templateId: `${P}tst1`, blockOrder: 1, blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "SO", delegable: false, datesCertificate: true, provenance: "ASSUMED", notes: SOURCE },
      { id: `${P}tsb2`, organisationId, templateId: `${P}tst1`, blockOrder: 2, blockKind: "CONTRACTOR", labelEn: "Received by the contractor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true, provenance: "ASSUMED", notes: SOURCE },
    ],
  });
  await db.formDistribution.createMany({
    data: [
      { id: `${P}tsd1`, organisationId, templateId: `${P}tst1`, recipientCode: "demo_contractor", labelEn: "The contractor (original)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: true, sortOrder: 1, provenance: "ASSUMED", notes: SOURCE },
      { id: `${P}tsd2`, organisationId, templateId: `${P}tst1`, recipientCode: "demo_file", labelEn: "Contract file (demo)", mandatory: true, ackRequired: false, condition: "NONE", isOriginal: false, sortOrder: 2, provenance: "ASSUMED", notes: SOURCE },
    ],
  });
  await audit("DocumentTemplate", `${P}tst1`, "Template · Demo certificate of extension of time", [{ field: "blocks", before: null, after: "Superintending Officer (authorising, dates it); the contractor" }]);
  await db.certificateKindSetting.create({ data: { id: `${P}tsk1`, organisationId, kind: "EOT", templateId: `${P}tst1`, routingTypeId: null, provenance: "ASSUMED", notes: SOURCE } });
  await audit("CertificateKindSetting", `${P}tsk1`, "Post-award controls · Extension of time", [{ field: "form", before: null, after: "Demo certificate of extension of time" }]);
  const policy = await db.postAwardPolicy.findFirst({ where: { id: `${P}wpa1`, organisationId }, select: { id: true, ladWaiverApplication: true, ladAntiOppressionDays: true } });
  if (policy && policy.ladWaiverApplication == null && policy.ladAntiOppressionDays == null) {
    await db.postAwardPolicy.update({ where: { id: policy.id }, data: { ladWaiverApplication: "NEXT_CERTIFICATE", ladWaiverProvenance: "ASSUMED", ladAntiOppressionDays: 90, ladAntiOppressionProvenance: "ASSUMED" } });
    await db.auditEntry.create({ data: { id: `${P}tsau${++n}`, organisationId, entity: "PostAwardPolicy", entityId: policy.id, entityLabel: "Post-award controls", action: "UPDATE", at, changes: [{ field: "waiverApplied", before: null, after: "On the next interim certificate" }, { field: "damagesAlertAfterDays", before: null, after: "90" }], reason: "Demo time configuration (invented, ASSUMED).", ...DEMO_ACTOR } as never });
  }
}

/// The works type (demo_ct1) offers an extension of time (FR-MTD-012): set only where unset, audited as the demo loader.
async function worksTypeOffersEot(db: Db, organisationId: string) {
  const t = await db.contractType.findFirst({ where: { id: `${P}ct1`, organisationId }, select: { id: true, nameEn: true, eotInstrumentKind: true } });
  if (!t || t.eotInstrumentKind != null) return;
  await db.contractType.update({ where: { id: t.id }, data: { eotInstrumentKind: "EXTENSION_OF_TIME" } });
  await db.auditEntry.create({ data: { id: `${P}tsau_ct1`, organisationId, entity: "ContractType", entityId: t.id, entityLabel: `Contract type · ${t.nameEn}`, action: "UPDATE", at: new Date("2026-10-04T01:00:00.000Z"), changes: [{ field: "timeInstrument", before: null, after: "Extension of time" }], reason: "Demo time configuration (invented, ASSUMED).", ...DEMO_ACTOR } as never });
}

/// `configure`: only the fresh `demo:load` writes the configuration (rulings 12c, 20z: none on a loaded database); `demo:time` on a loaded database
/// refuses, naming what is missing, where it is not there.
export async function loadTimeDemo(db: Db, organisationId: string, opts: { configure: boolean }): Promise<{ notes: string[] }> {
  if (!(await db.contract.findUnique({ where: { id: CON }, select: { id: true } }))) return { notes: ["demo_con13 is not loaded: the time demo is skipped"] };
  if (await db.eotClaim.findFirst({ where: { contractId: CON }, select: { id: true } })) return { notes: [] };
  const configured = !!(await db.certificateKindSetting.findUnique({ where: { id: `${P}tsk1` }, select: { id: true } }));
  if (!configured && !opts.configure) throw new Error("demo time: the time configuration (the contract-matter series, the eot rows, the EOT form and its setting) is not on this database, and no configuration is written on a loaded database. Load a fresh demo, or set them under Settings.");
  if (!configured) await configure(db, organisationId);
  if (opts.configure) await worksTypeOffersEot(db, organisationId);
  const T = await import("../src/app/projects/[id]/time-actions");
  const M = await import("../src/app/projects/[id]/matter-actions");
  const C = await import("../src/app/projects/[id]/certificates/[certId]/actions");
  const Y = await import("../src/app/projects/[id]/payment-actions");
  const id = CON;
  const cause = "The district council issued the road closure permit for chainages 1+400 to 1+900 seven weeks late (demo).";
  if (!(await db.delayNotice.findFirst({ where: { contractId: id, cause }, select: { id: true } }))) await act("2026-10-05T10:00", "delay notice", T.recordDelayNotice, { id, path: "CONTRACTOR_NOTICE", cause, occurredOn: "2026-07-20", receivedOn: "2026-10-05", personId: people.bala, note: "Received by hand at the site office (demo)." });
  const notice = await db.delayNotice.findFirstOrThrow({ where: { contractId: id }, orderBy: { recordedAt: "desc" } });
  const programme = await db.workProgramme.findFirstOrThrow({ where: { contractId: id, decision: "APPROVED" }, orderBy: { revision: "desc" } });
  await act("2026-10-06T10:00", "EOT claim", T.openEotClaim, { id, noticeId: notice.id, scope: "WHOLE", groundClause: "Clause 43(e) (demo)", cause, programmeId: programme.id, proposedDays: "60", financialImpact: "NONE", personId: people.bala });
  const claim = await db.eotClaim.findFirstOrThrow({ where: { contractId: id }, orderBy: { recordedAt: "desc" } });
  const pack = {
    pack_CALCULATION: "The permit's delay set against the approved programme, by bar chart (demo).",
    pack_EMPLOYER_DELAY: "The council's permit was the employer's to obtain; it is now issued (demo).",
    pack_LOSS_EXPENSE: "No loss and expense is claimed (demo).",
    pack_PROGRESS: "94% complete on 30 September; reinstatement and the washout valve outstanding (demo).",
    pack_COMPLETION: "It can complete by the proposed date (demo).",
  };
  await act("2026-10-07T10:00", "EOT claim answered", T.answerEotClaim, { id, claimId: claim.id, actualDelayDays: "60", canComplete: "yes", ...pack, personId: people.bala });
  await act("2026-10-08T10:00", "reason 1", T.addEotReason, { id, claimId: claim.id, clause: "Clause 43(e) (demo)", reason: "The road closure permit was issued late.", delayFrom: "2026-07-20", delayUntil: "2026-09-03", extensionDays: "45", concurrency: "CONSECUTIVE" });
  await act("2026-10-08T10:10", "reason 2", T.addEotReason, { id, claimId: claim.id, clause: "Clause 43(f) (demo)", reason: "The water authority's diversion of its main at chainage 1+650.", delayFrom: "2026-09-03", delayUntil: "2026-09-18", extensionDays: "15", concurrency: "CONSECUTIVE" });
  await act("2026-10-09T10:00", "determined", T.determineEotClaim, { id, claimId: claim.id, entitlement: "ENTITLED", entitlementReason: "The permit and the diversion were the employer's and an authority's to deliver, and delayed the critical path (demo).", bestEndeavours: "FULL", personId: people.bala });
  await act("2026-10-12T10:00", "EOT sent", T.sendEotClaim, { id, claimId: claim.id, personId: people.bala });
  const matter = await db.contractMatter.findUniqueOrThrow({ where: { id: claim.matterId }, include: { routes: { include: { steps: { orderBy: { sequence: "asc" } } }, orderBy: { openedAt: "desc" } } } });
  for (const st of matter.routes[0].steps) await act("2026-10-14T15:00", `EOT step ${st.sequence}`, M.decideContractMatterStep, { id, matterId: matter.id, stepId: st.id, decision: "DONE", personId: people.aisyah, decidedOn: "2026-10-14", receivedOn: "2026-10-13", reason: "" });
  await act("2026-10-15T10:00", "EOT certificate raised", T.raiseEotCertificate, { id, claimId: claim.id, grantedDays: "60", unextendedNote: "", personId: people.bala });
  const ext = await db.extensionOfTime.findFirstOrThrow({ where: { claimId: claim.id }, include: { certificate: true } });
  const certId = ext.certificateId;
  await act("2026-10-15T15:00", "EOT to signing", C.sendCertificateToSigning, { certId });
  await act("2026-10-16T10:00", "EOT S.O.'s block", C.recordCertificateSignature, { certId, blockOrder: "1", personBlock: "yes", personId: people.bala });
  await act("2026-10-16T11:00", "EOT contractor's block", C.recordCertificateSignature, { certId, blockOrder: "2", personBlock: "no", name: "Tan Mei Hua", icNumber: "000000-00-0013", signedOn: "2026-10-16" });
  const issued = await db.certificate.findUniqueOrThrow({ where: { id: certId }, include: { copies: true } });
  if (issued.status !== "ISSUED") throw new Error(`demo time: the EOT certificate is ${issued.status}, not issued`);
  for (const cp of issued.copies.filter((x) => x.mandatory)) await act("2026-10-16T15:00", `EOT copy ${cp.copyNo}`, C.despatchCertificateCopy, { certId, copyId: cp.id, method: "BY_HAND", despatchedOn: "2026-10-16" });
  const original = issued.copies.find((x) => x.isOriginal && x.ackRequired);
  if (original) await act("2026-10-16T15:10", "EOT acknowledged", C.acknowledgeCertificateCopy, { certId, copyId: original.id, acknowledgedOn: "2026-10-16" });
  // The next interim, on the contractor's claim, on or before the new date: nothing charged, interim 3's damages credited.
  await act("2026-10-27T09:00", "valuation 4 opened", Y.openInterimValuation, { id, trigger: "CLAIM", claimReceivedOn: "2026-10-26", valuationDate: "2026-10-27", personId: people.bala });
  const v = (await db.interimValuation.findFirstOrThrow({ where: { contractId: id, status: "OPEN" } })).id;
  const note = "Reinstatement complete; the washout valve outstanding (demo).";
  await act("2026-10-27T10:00", "valuation 4 main works", Y.recordMainWorks, { id, valuationId: v, mainWorks: "470000.00", note });
  await act("2026-10-27T11:00", "valuation 4 joint", Y.recordJointValuation, { id, valuationId: v, jointOn: "2026-10-27", participants: "Bala Krishnan (Superintending Officer)\nThe contractor's site agent", valuationMethod: "Measured jointly on site against the bill of quantities (demo).", contractorAnswer: "AGREED", dissent: "" });
  await act("2026-10-27T12:00", "valuation 4 raised", Y.raiseInterimCertificate, { id, valuationId: v });
  return { notes: ["the extension of time on demo_con13 (60 days to 30 Oct 2026) and interim valuation 4 raised with its credit"] };
}

/// Read back through the product's own readings (X-10): the new date, the superseded decision, the certificate issued, and interim 4's credit.
export async function checkTimeDemo(db: Db) {
  const { loadContract } = await import("../src/lib/contract/repo");
  const { latestVersion } = await import("../src/lib/contract/baseline");
  const { baselineRows, valuesOf } = await import("../src/lib/contract/load");
  const { readComputedSnapshot } = await import("../src/lib/certificate/snapshot");
  const { demoOrgId } = await import("./demo-org");
  const fail = (what: string) => {
    throw new Error(`demo check (time, demo_con13): ${what}`);
  };
  const l = (await loadContract(await demoOrgId(), CON))!;
  const latest = latestVersion(baselineRows(l.contract).versions)!;
  if (latest.reason !== "EXTENSION_OF_TIME" || valuesOf(latest).dateForCompletion !== "2026-10-30") fail(`latest version ${latest.reason} to ${valuesOf(latest).dateForCompletion}, not EXTENSION_OF_TIME to 2026-10-30`);
  const ext = await db.extensionOfTime.findFirstOrThrow({ where: { claim: { contractId: CON } }, include: { certificate: true } });
  if (ext.certificate.status !== "ISSUED" || ext.baselineId !== latest.id) fail("the EOT certificate is not issued with its version");
  const decision = await db.nonCompletion.findFirstOrThrow({ where: { contractId: CON, outcome: "LAD_APPLIES" }, orderBy: { recordedAt: "desc" } });
  if (decision.supersededByEotId !== ext.id) fail("the damages decision is not superseded by the extension");
  const v4 = await db.interimValuation.findFirstOrThrow({ where: { contractId: CON, status: "RAISED" }, include: { certificate: true }, orderBy: { valuationDate: "desc" } });
  const snap = readComputedSnapshot(v4.certificate!.computedSnapshot)!;
  const credit = snap.lines.find((x) => x.key === "ladCredit")?.value ?? null;
  if (credit !== "9000.00") fail(`interim 4's damages credit reads ${credit}, not 9000.00`);
}
