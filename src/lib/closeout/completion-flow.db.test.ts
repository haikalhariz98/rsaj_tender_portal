import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { dayPlus } from "@/lib/dates";
import { db } from "@/lib/db";
import { ProjectRefused } from "@/lib/portal/projects/types";
import { addMonths } from "@/lib/securities/period";
import { makeSupplierAccount, randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, today, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Close-out stage B through its acts against Postgres (plan closeout-plan.md B3, B4; ADR 0047): a CPC with its lines raises, signs and issues
 * (its lines frozen, the contract PRACTICALLY_COMPLETE, the DLP frozen on it); the list is then fixed by trigger; the contractor marks a line
 * rectified from the portal (another contractor's line is not found, a reported line is not reported again, the S.O.'s holders are told, the
 * audit names the supplier account); an officer returns it and then accepts it; the Schedule of Defects freezes the line still open; the line is
 * withdrawn with its reason; the CMGD is refused WORK_WOULD_BE_STRANDED while an extension-of-time route is pending and issues once it is closed
 * (every line frozen with its end state, the contract MAKING_GOOD_COMPLETE); the performance bond is then returned, once, naming the CMGD.
 * Each certificate's route is written as it stands once approved (the route's own acts are tested with the matrix elsewhere).
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  return actModule({ now: new Date() }).module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { acceptDefect, addCpcDefect, raiseDefectSchedule, raiseMakingGood, raisePracticalCompletion, removeCpcDefect, reportDefect, returnDefect, returnSecurity, withdrawDefect } from "@/app/projects/[id]/closeout-actions";
import { recordCertificateSignature, sendCertificateToSigning } from "@/app/projects/[id]/certificates/[certId]/actions";
import { reportRectifiedAsContractor } from "@/lib/portal/projects/defect-store";

let o: TestOrg;
const as = <T>(personId: string, fn: () => Promise<T>): Promise<T> => {
  h.who = o.staff(personId);
  return fn();
};

async function kindForm(kind: "PRACTICAL_COMPLETION" | "SCHEDULE_OF_DEFECTS" | "MAKING_GOOD_DEFECTS") {
  const templateId = (await db.documentTemplate.create({ data: { organisationId: o.organisationId, code: `${kind.toLowerCase()}_${randomId()}`, nameEn: `${kind} (test)`, formCode: kind.slice(0, 6), bodyEn: "Certificate {{certificate.number}} for contract {{contract.number}}.", bodyVersion: 1 } })).id;
  await db.formSignatureBlock.createMany({
    data: [
      { organisationId: o.organisationId, templateId, blockOrder: 1, blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "SO", delegable: false, datesCertificate: true },
      { organisationId: o.organisationId, templateId, blockOrder: 2, blockKind: "CONTRACTOR", labelEn: "Received by the contractor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true },
    ],
  });
  await db.formDistribution.create({ data: { organisationId: o.organisationId, templateId, recipientCode: "contractor", labelEn: "The contractor (original)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: true, sortOrder: 1, provenance: "ASSUMED" } });
  await db.certificateKindSetting.create({ data: { organisationId: o.organisationId, kind, templateId, routingTypeId: null, provenance: "ASSUMED" } });
}

/// The certificate's route approved (as its own acts leave it), sent to signing, the S.O.'s block signed, then the contractor's on paper: issued.
async function issue(certId: string, domain: string | null) {
  if (domain) await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CERTIFICATE", certificateId: certId, domain, status: "APPROVED", openedAt: new Date() } });
  const sent = await as(o.so, () => sendCertificateToSigning({ ok: false }, form({ certId })));
  expect(sent.ok, sent.message).toBe(true);
  const so = await as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "1", personBlock: "yes", personId: o.so, "personId:password": "any" })));
  expect(so.ok, so.message).toBe(true);
  return as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "2", personBlock: "no", name: "Tan Mei Hua", icNumber: "000000-00-0013", signedOn: today() })));
}

let k: TestContract;
let supplier: SupplierActor;
let stranger: SupplierActor;
const actorOf = async (): Promise<SupplierActor> => {
  const s = await makeSupplierAccount(o.organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(dayPlus(today(), -500)) } });
  return { kind: "SUPPLIER", accountId: s.account!.id, sessionId: `ses_${randomId()}`, contactId: s.contact.id, displayName: s.contact.name, supplierId: s.supplier.id, supplierName: s.supplier.registeredName, loginName: s.loginName, organisationId: o.organisationId, organisationTimeZone: "Asia/Kuala_Lumpur", stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: "203.0.113.9", mustChangePassword: false, resetNoticePending: false };
};
const linesOf = async () => db.defectItem.findMany({ where: { contractId: k.contractId }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] });
const status = async () => (await db.contract.findUniqueOrThrow({ where: { id: k.contractId } })).status;

beforeAll(async () => {
  o = await contractOrg("CLO");
  for (const kind of ["PRACTICAL_COMPLETION", "SCHEDULE_OF_DEFECTS", "MAKING_GOOD_DEFECTS"] as const) await kindForm(kind);
  await db.postAwardPolicy.create({ data: { organisationId: o.organisationId, retentionBalanceReleaseAt: "MAKING_GOOD", retentionBalanceReleaseProvenance: "ASSUMED", performanceBondReleaseAt: "MAKING_GOOD", performanceBondReleaseProvenance: "ASSUMED" } });
  // Completed 60 days ago, with a one-month defects liability period that ended about 30 days ago.
  k = await activeContract(o, { dueIn: -60, dlpMonths: 1 });
  supplier = await actorOf();
  stranger = await actorOf();
  const c = await db.contract.findUniqueOrThrow({ where: { id: k.contractId }, select: { awardId: true } });
  await db.award.update({ where: { id: c.awardId }, data: { vendorId: supplier.supplierId } });
  await db.securityInstrument.create({ data: { contractId: k.contractId, kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", instrumentRef: "BG-CLO-1", value: "25000.00", effectiveFrom: D(dayPlus(today(), -400)), status: "VERIFIED", lodgedOn: D(dayPlus(today(), -400)) } });
});

describe("close-out stage B through its acts", () => {
  let cpcId = "";

  it("raises the CPC with its DLP frozen, and its list changes only while it is a draft", async () => {
    const r = await as(o.so, () => raisePracticalCompletion({ ok: false }, form({ id: k.contractId, completionDate: k.due, possessionTakenOn: k.due, inspectedOn: dayPlus(k.due, 1), testReasons: "The works are complete save the defects listed.", attendeeIds: o.so, otherAttendees: "Tan Mei Hua (contractor)" })));
    expect(r.ok, r.message).toBe(true);
    const pc = await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k.contractId } });
    cpcId = pc.certificateId;
    expect(pc.dlpStart?.toISOString().slice(0, 10)).toBe(k.due);
    expect(pc.dlpEnd?.toISOString().slice(0, 10)).toBe(addMonths(k.due, 1));
    expect(pc.attendees.length).toBe(2);
    const again = await as(o.so, () => raisePracticalCompletion({ ok: false }, form({ id: k.contractId, completionDate: k.due, possessionTakenOn: k.due, inspectedOn: k.due, testReasons: "Again." })));
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/already raised/);
    for (const description of ["Leaking roof, block A", "Cracked tiles, ground floor", "Loose handrail"]) expect((await as(o.so, () => addCpcDefect({ ok: false }, form({ id: k.contractId, description, location: "Site", dueOn: dayPlus(k.due, 14) })))).ok).toBe(true);
    const third = (await linesOf())[2];
    // F6 (code review of close-out stage B): a line on a draft CPC is not acted on, by an officer or by the contractor.
    const early = await as(o.so, () => acceptDefect({ ok: false }, form({ id: k.contractId, defectId: third.id, on: today() })));
    expect(early.ok).toBe(false);
    expect(early.message).toMatch(/practical completion certificate is not issued yet/);
    await expect(reportRectifiedAsContractor(supplier, { contractId: k.contractId, defectId: third.id, note: "", evidenceDocumentId: null })).rejects.toMatchObject({ status: 404 });
    expect((await as(o.so, () => removeCpcDefect({ ok: false }, form({ id: k.contractId, defectId: third.id })))).ok).toBe(true);
    expect((await linesOf()).length).toBe(2);
  });

  it("issues: its lines frozen, the contract practically complete; the list is then fixed by trigger", async () => {
    const r = await issue(cpcId, "practical_completion");
    expect(r.ok, r.message).toBe(true);
    expect(await status()).toBe("PRACTICALLY_COMPLETE");
    const pc = await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k.contractId } });
    expect((pc.frozenLines as unknown[]).length).toBe(2);
    const add = await as(o.so, () => addCpcDefect({ ok: false }, form({ id: k.contractId, description: "Late", dueOn: dayPlus(k.due, 14) })));
    expect(add.ok).toBe(false);
    await expect(db.defectItem.create({ data: { organisationId: o.organisationId, contractId: k.contractId, source: "PRACTICAL_COMPLETION", practicalCompletionId: pc.id, description: "Behind its back", dueOn: D(k.due), reportedByPersonId: o.so, recordedAt: new Date() } })).rejects.toThrow(/only while the certificate is a draft/);
    const line = (await linesOf())[0];
    await expect(db.defectItem.update({ where: { id: line.id }, data: { description: "changed" } })).rejects.toThrow(/never changed/);
  });

  it("the contractor marks a line rectified; another contractor cannot; it is not reported twice; the S.O. is told; the audit names the account", async () => {
    const [first] = await linesOf();
    await expect(reportRectifiedAsContractor(stranger, { contractId: k.contractId, defectId: first.id, note: "", evidenceDocumentId: null })).rejects.toMatchObject({ status: 404 });
    const done = await reportRectifiedAsContractor(supplier, { contractId: k.contractId, defectId: first.id, note: "Membrane replaced.", evidenceDocumentId: null });
    const ev = await db.defectEvent.findUniqueOrThrow({ where: { id: done.eventId } });
    expect(ev.supplierAccountId).toBe(supplier.accountId);
    expect(ev.personId).toBeNull();
    const again = reportRectifiedAsContractor(supplier, { contractId: k.contractId, defectId: first.id, note: "", evidenceDocumentId: null });
    await expect(again).rejects.toBeInstanceOf(ProjectRefused);
    await expect(again).rejects.toMatchObject({ faults: [{ code: "DEFECT_NOT_OPEN" }] });
    expect(await db.staffNotice.count({ where: { organisationId: o.organisationId, kind: "DEFECT_RECTIFIED", recipientPersonId: o.so, subjectId: ev.id } })).toBe(1);
    const a = await db.auditEntry.findFirstOrThrow({ where: { organisationId: o.organisationId, entity: "DefectEvent", entityId: ev.id } });
    expect(a.actorSupplierAccountId).toBe(supplier.accountId);
    await expect(db.defectEvent.update({ where: { id: ev.id }, data: { note: "x" } })).rejects.toThrow();
  });

  it("an officer returns it with a note (open again), the contractor reports it again, and it is accepted", async () => {
    const [first] = await linesOf();
    expect((await as(o.so, () => returnDefect({ ok: false }, form({ id: k.contractId, defectId: first.id, on: today(), note: "" })))).ok).toBe(false);
    expect((await as(o.so, () => returnDefect({ ok: false }, form({ id: k.contractId, defectId: first.id, on: today(), note: "Still leaks at the parapet." })))).ok).toBe(true);
    await reportRectifiedAsContractor(supplier, { contractId: k.contractId, defectId: first.id, note: "Parapet resealed.", evidenceDocumentId: null });
    const ok = await as(o.so, () => acceptDefect({ ok: false }, form({ id: k.contractId, defectId: first.id, on: today() })));
    expect(ok.ok, ok.message).toBe(true);
  });

  it("the CMGD is refused while a line is open; the Schedule of Defects freezes the line still open; then no line is added", async () => {
    const refused = await as(o.so, () => raiseMakingGood({ ok: false }, form({ id: k.contractId, madeGoodOn: today(), finalInspectionOn: today() })));
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/1 defect is neither made good nor withdrawn/);
    const r = await as(o.so, () => raiseDefectSchedule({ ok: false }, form({ id: k.contractId, rectifyBy: dayPlus(today(), 14) })));
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toMatch(/longest period a schedule may give is not set/);
    const s = await db.defectSchedule.findFirstOrThrow({ where: { contractId: k.contractId } });
    expect((await issue(s.certificateId, null)).ok).toBe(true);
    const frozen = (await db.defectSchedule.findUniqueOrThrow({ where: { id: s.id } })).frozenLines as { description: string }[];
    expect(frozen.map((l) => l.description)).toEqual(["Cracked tiles, ground floor"]);
    const late = await as(o.so, () => reportDefect({ ok: false }, form({ id: k.contractId, description: "New crack", observedOn: dayPlus(k.due, 5), dueOn: dayPlus(today(), 7) })));
    expect(late.ok).toBe(false);
    expect(late.message).toMatch(/Schedule of Defects is issued/);
  });

  it("both orders: the CMGD's issue is refused while an extension-of-time route is pending, naming it, and issues once it is closed", async () => {
    const [, second] = await linesOf();
    expect((await as(o.so, () => withdrawDefect({ ok: false }, form({ id: k.contractId, defectId: second.id, on: today(), note: "Contractor wound up: to be made good by others." })))).ok).toBe(true);
    const r = await as(o.so, () => raiseMakingGood({ ok: false }, form({ id: k.contractId, madeGoodOn: today(), finalInspectionOn: today() })));
    expect(r.ok, r.message).toBe(true);
    const mg = await db.makingGood.findFirstOrThrow({ where: { contractId: k.contractId }, include: { certificate: true } });
    const snap = mg.snapshot as { performanceBond: { value: string; reference: string } | null };
    expect(snap.performanceBond).toEqual({ value: "25000.00", reference: "BG-CLO-1" });
    const matter = await db.contractMatter.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "EOT", reference: `CM/EOT/${randomId()}`, personId: o.so, recordedAt: new Date() } });
    await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CONTRACT", contractMatterId: matter.id, domain: "eot", status: "PENDING", openedAt: new Date() } });
    const stranded = await issue(mg.certificateId, "making_good");
    expect(stranded.ok).toBe(false);
    expect(stranded.message).toMatch(new RegExp(`Finish or close first: .*${matter.reference}`));
    expect(await status()).toBe("PRACTICALLY_COMPLETE");
    await db.contractMatter.update({ where: { id: matter.id }, data: { closedAt: new Date(), closeReason: "Withdrawn by the contractor." } });
    // F5 / money test 9 (code review of close-out stage B): an interim issued between the raise and the issue moves the retention balance the CMGD
    // prints, so the issue is refused by name; once it is gone the figures match again.
    const ipc = await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "INTERIM_PAYMENT", status: "ISSUED", baselineId: k.baselineId, number: `IPC/${randomId()}`, sequence: 1, issuedAt: new Date(), certificateDate: D(today()), openedAt: new Date(), openedOn: D(today()), issueSnapshot: { figures: { lines: [{ key: "retentionMain", value: "5000.00" }, { key: "retentionNsc", value: "0.00" }, { key: "retentionNs", value: "0.00" }], totals: [] } } } });
    const val = await db.interimValuation.create({ data: { organisationId: o.organisationId, contractId: k.contractId, trigger: "VALUATION_DATE", valuationDate: D(today()), status: "RAISED", personId: o.so, certificateId: ipc.id, judgedUnder: { version: 1, sequence: 1, released: { MAIN: "0.00", NSC: "0.00", NS: "0.00" }, recoupments: [] }, recordedAt: new Date(), recordedOn: D(today()) } });
    const moved = await as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId: mg.certificateId, blockOrder: "2", personBlock: "no", name: "Tan Mei Hua", icNumber: "000000-00-0013", signedOn: today() })));
    expect(moved.ok).toBe(false);
    expect(moved.message).toMatch(/What it prints has changed since it was raised \(the retention balance held\)/);
    expect(await status()).toBe("PRACTICALLY_COMPLETE");
    await db.interimValuation.delete({ where: { id: val.id } });
    await db.certificate.delete({ where: { id: ipc.id } });
    const done = await as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId: mg.certificateId, blockOrder: "2", personBlock: "no", name: "Tan Mei Hua", icNumber: "000000-00-0013", signedOn: today() })));
    expect(done.ok, done.message).toBe(true);
    expect(await status()).toBe("MAKING_GOOD_COMPLETE");
    const lines = (await db.makingGood.findUniqueOrThrow({ where: { id: mg.id } })).frozenLines as { state: string; reason: string | null }[];
    expect(lines.map((l) => l.state)).toEqual(["MADE_GOOD", "WITHDRAWN"]);
    expect(lines[1].reason).toMatch(/made good by others/);
  });

  it("returns the performance bond once, at the CMGD, naming it", async () => {
    const bond = await db.securityInstrument.findFirstOrThrow({ where: { contractId: k.contractId } });
    const r = await as(o.so, () => returnSecurity({ ok: false }, form({ id: k.contractId, securityId: bond.id, returnedOn: today(), officialReceiptRef: "", note: "" })));
    expect(r.ok, r.message).toBe(true);
    const rel = await db.securityRelease.findUniqueOrThrow({ where: { securityId: bond.id } });
    expect(rel.trigger).toBe("MAKING_GOOD");
    expect(rel.certificateId).toBe((await db.makingGood.findFirstOrThrow({ where: { contractId: k.contractId } })).certificateId);
    const twice = await as(o.so, () => returnSecurity({ ok: false }, form({ id: k.contractId, securityId: bond.id, returnedOn: today(), officialReceiptRef: "", note: "" })));
    expect(twice.ok).toBe(false);
    expect(twice.message).toMatch(/Already returned/);
  });
});

// F6 (code review of close-out stage B): a CPC line with an event written before the fix is kept, with a named refusal rather than a foreign-key error.
describe("a CPC line with history", () => {
  it("is not removed from the draft's list", async () => {
    const k2 = await activeContract(o, { dueIn: -10 });
    expect((await as(o.so, () => raisePracticalCompletion({ ok: false }, form({ id: k2.contractId, completionDate: k2.due, possessionTakenOn: k2.due, inspectedOn: k2.due, testReasons: "Complete." })))).ok).toBe(true);
    expect((await as(o.so, () => addCpcDefect({ ok: false }, form({ id: k2.contractId, description: "Scratched door", dueOn: dayPlus(k2.due, 7) })))).ok).toBe(true);
    const line = await db.defectItem.findFirstOrThrow({ where: { contractId: k2.contractId } });
    await db.defectEvent.create({ data: { organisationId: o.organisationId, defectId: line.id, kind: "REPORTED_RECTIFIED", on: D(today()), note: "Before F6.", personId: o.so, recordedAt: new Date() } });
    const kept = await as(o.so, () => removeCpcDefect({ ok: false }, form({ id: k2.contractId, defectId: line.id })));
    expect(kept.ok).toBe(false);
    expect(kept.message).toMatch(/already recorded against this defect/);
    // Ruling 3: only a line reported during the period carries the day it was observed (CHECK).
    await expect(db.defectItem.create({ data: { organisationId: o.organisationId, contractId: k2.contractId, source: "PRACTICAL_COMPLETION", practicalCompletionId: line.practicalCompletionId, description: "Observed?", dueOn: D(k2.due), observedOn: D(k2.due), reportedByPersonId: o.so, recordedAt: new Date() } })).rejects.toThrow(/DefectItem_observed_on/);
  });
});

// Money test 10 (code review of close-out stage B): an interim in progress does not hold the CPC's issue back. Valuation is allowed once practically
// complete (ACT_STATUS), so nothing is stranded, and the interim is finished after the CPC.
describe("the CPC's issue against an interim in progress", () => {
  it("issues, and the interim stays in draft to be finished", async () => {
    const k3 = await activeContract(o, { dueIn: -10 });
    expect((await as(o.so, () => raisePracticalCompletion({ ok: false }, form({ id: k3.contractId, completionDate: k3.due, possessionTakenOn: k3.due, inspectedOn: k3.due, testReasons: "Complete." })))).ok).toBe(true);
    const ipc = await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k3.contractId, kind: "INTERIM_PAYMENT", status: "DRAFT", baselineId: k3.baselineId, openedAt: new Date(), openedOn: D(today()) } });
    const pc = await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k3.contractId } });
    const r = await issue(pc.certificateId, "practical_completion");
    expect(r.ok, r.message).toBe(true);
    expect((await db.contract.findUniqueOrThrow({ where: { id: k3.contractId } })).status).toBe("PRACTICALLY_COMPLETE");
    expect((await db.certificate.findUniqueOrThrow({ where: { id: ipc.id } })).status).toBe("DRAFT");
  });
});

