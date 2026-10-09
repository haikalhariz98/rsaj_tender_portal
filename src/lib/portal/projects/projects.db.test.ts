import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AttributionRefused } from "@/lib/auth/attribution-store";
import { authenticateSupplier, confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { readSupplierSession } from "@/lib/auth/supplier-session-store";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";
import { dayPlus, todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

import { loadBoard } from "./announcement-store";
import { signContractorBlock } from "./certificate-store";
import { loadProjectContext } from "./context-store";
import { attestDiaryAsAgent, disputeDiaryAsAgent } from "./diary-store";
import { loadMyContracts } from "./list-store";
import { loadReviewQueue } from "./review-store";
import { sendSubmission } from "./submission-store";
import { ProjectRefused } from "./types";
import { certificatesTab, diaryTab, overviewTab, submissionsTab } from "./workspace-store";

/**
 * My Projects against a real database (Phase 4e): a contractor holds only the contracts whose award names it; a submission is written as the session's supplier, routed to the S.O. office in
 * force with its due day from the service level as set (and none where it is not), the office's holders told; a statutory declaration, the agent's attestation and the contractor's block on a
 * certificate are each signed with the password asked again (a stale or missing entry writes nothing); a disagreement escalates the entry; what is not the contractor's reads as not found,
 * alike for an id that exists nowhere; and the announcements board shows the standing announcements in order.
 */

let organisationId: string;
let orgCode: string;
let officerId: string;
let soRole: string;
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date | string) => new Date(`${typeof d === "string" ? d : d.toISOString().slice(0, 10)}T00:00:00.000Z`);
let today: string;

interface Holder {
  actor: SupplierActor;
  supplierId: string;
  accountId: string;
  loginName: string;
  password: string;
}

/// A supplier with a live account, signed in, as the actor the portal reads from its session.
async function supplier(): Promise<Holder> {
  const s = await makeSupplierAccount(organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
  const signedIn = await authenticateSupplier({ loginName: s.loginName, password: s.password }, facts(), null);
  if (!signedIn.ok) throw new Error("sign-in failed");
  const read = await readSupplierSession(signedIn.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session failed");
  return { actor: read.actor, supplierId: s.supplier.id, accountId: s.account!.id, loginName: s.loginName, password: s.password };
}

/// The password asked again for this act, as the handler asks it, and the moment that signs.
async function stepUp(h: Holder): Promise<Date> {
  const asked = await confirmSupplierPassword(h.actor, h.password, facts());
  if (!asked.ok) throw new Error(`step-up failed: ${asked.kind}`);
  return asked.at;
}

/// A contract whose award names the supplier (or nobody), with its S.O. assignment, as the office records one.
async function contract(o: { vendorId: string | null; awardStatus?: "ISSUED" | "ACCEPTED" | "DRAFT" | "CANCELLED"; status?: "ACTIVE" | "CANCELLED" | "STAMPED"; so?: boolean }) {
  const run = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `PRJ/RQ/${run}`, requestingUnitCode: "PRJ_DEPT", requestingPersonId: officerId, title: "Project requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "PRJ_CC", accountCode: "PRJ_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "100000.00", raisedOn: D(at(-30)) },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `PRJ/EX/${run}`, requisitionId: requisition.id, title: `Pipe replacement ${run}`, estimatedValue: "100000.00", sourcingMethodCode: "PRJ_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `PRJ/AW/${run}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: o.awardStatus ?? "ISSUED", vendorId: o.vendorId } });
  const c = await db.contract.create({ data: { organisationId, number: `PRJ/CON/${run}`, numberSource: "SERIES", numberedOn: D(at(-20)), awardId: award.id, contractSum: "100000.00", status: o.status ?? "ACTIVE" } });
  if (o.so !== false) {
    await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: soRole, roleLabel: "Superintending Officer (test)", reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "100000.00", warnings: [], effectiveOn: D(at(-20)), recordedAt: at(-20) } });
  }
  return { id: c.id, awardId: award.id, exerciseId: exercise.id };
}

const refusedWith = async (p: Promise<unknown>, code: string, status?: number) => {
  const e = await p.then(() => null, (x) => x);
  expect(e, `expected a refusal with ${code}`).toBeInstanceOf(ProjectRefused);
  expect((e as ProjectRefused).faults.map((f) => f.code), code).toContain(code);
  if (status) expect((e as ProjectRefused).status).toBe(status);
};

beforeAll(async () => {
  const org = await testOrganisation();
  organisationId = org.id;
  orgCode = org.code;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  await db.organisation.update({ where: { id: organisationId }, data: { timeZone: "Asia/Kuala_Lumpur" } });
  today = todayIn(new Date(), "Asia/Kuala_Lumpur")!;
  officerId = (await makePerson(organisationId, `S.O. ${randomId()}`)).id;
  soRole = `PRJ_SO_${randomId()}`;
  await db.roleAssignment.create({ data: { personId: officerId, roleCode: soRole, effectiveFrom: D("2020-01-01") } });
  void orgCode;
});

afterAll(async () => {
  await db.contractorSubmissionSetting.deleteMany({ where: { organisationId } });
});

describe("which contracts a contractor holds", () => {
  it("lists the contracts whose award names the supplier and stands, and nothing of another contractor's, a draft award's or a cancelled award's", async () => {
    const mine = await supplier();
    const other = await supplier();
    const held = await contract({ vendorId: mine.supplierId });
    const theirs = await contract({ vendorId: other.supplierId });
    const draft = await contract({ vendorId: mine.supplierId, awardStatus: "DRAFT" });
    const cancelled = await contract({ vendorId: mine.supplierId, awardStatus: "CANCELLED", status: "CANCELLED" });
    const unlinked = await contract({ vendorId: null });
    const ids = (await loadMyContracts(db, mine.actor)).map((r) => r.id);
    expect(ids).toContain(held.id);
    for (const id of [theirs.id, draft.id, cancelled.id, unlinked.id]) expect(ids).not.toContain(id);
    expect(await loadProjectContext(db, mine.actor, held.id)).toMatchObject({ contract: { id: held.id } });
    for (const id of [theirs.id, draft.id, unlinked.id, "nonexistent-id-0001"]) expect(await loadProjectContext(db, mine.actor, id), id).toBeNull();
  });

  it("another organisation's contract reads as not found", async () => {
    const mine = await supplier();
    const other = await db.organisation.create({ data: { code: `OTHER_${randomId()}`, name: "Another organisation" } });
    const p = await makePerson(other.id);
    const rq = await db.requisition.create({ data: { organisationId: other.id, reference: `OTH/R/${randomId()}`, requestingUnitCode: "X", requestingPersonId: p.id, title: "x", justification: "x", needStatement: "x", costCentreCode: "X", accountCode: "X", placeOfDelivery: "x", dateRequired: D(at(10)), estimatedValue: "1.00", raisedOn: D(at(-1)) } });
    const ex = await db.sourcingExercise.create({ data: { organisationId: other.id, reference: `OTH/${randomId()}`, requisitionId: rq.id, title: "Theirs", estimatedValue: "1.00", sourcingMethodCode: "X", status: "EVALUATED" } });
    const aw = await db.award.create({ data: { organisationId: other.id, reference: `OTH/AW/${randomId()}`, exerciseId: ex.id, instrumentKind: "WORK_INDENT", awardeeName: "x", awardedValue: "1.00", completionPeriod: 1, completionUnit: "DAYS", status: "ISSUED", vendorId: mine.supplierId } });
    const c = await db.contract.create({ data: { organisationId: other.id, number: `OTH/CON/${randomId()}`, numberSource: "SERIES", numberedOn: D(at(-1)), awardId: aw.id, contractSum: "1.00", status: "ACTIVE" } });
    expect(await loadProjectContext(db, mine.actor, c.id)).toBeNull();
    await refusedWith(sendSubmission(mine.actor, { contractId: c.id, kind: "WORK_PROGRAMME", title: "x", body: "y", amount: "", aboutDay: "", lines: [], stepUpAt: null }), "NOT_FOUND", 404);
  });
});

describe("a contractor's submission", () => {
  it("is written as the session's supplier with the server's day, routed to the S.O. office with the holders told, frozen with its lines, and audited; no service level means no due day, said", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const sent = await sendSubmission(h.actor, {
      contractId: c.id,
      kind: "MATERIALS_ON_SITE",
      title: "  Materials on site, September ",
      body: "Pipes and fittings delivered to chainage 1+200.",
      amount: "",
      aboutDay: today,
      lines: [{ description: "DI pipe 300 mm", quantity: "40 m", location: "Chainage 1+200", value: "18000.00" }],
      stepUpAt: null,
    });
    const row = await db.contractorSubmission.findUniqueOrThrow({ where: { id: sent.submissionId }, include: { lines: true } });
    expect(row).toMatchObject({ supplierId: h.supplierId, submittedBySupplierAccountId: h.accountId, kind: "MATERIALS_ON_SITE", title: "Materials on site, September", routedToRoleCode: soRole, routedToRoleLabel: "Superintending Officer (test)", serviceLevelDays: null, dueOn: null, outcome: null, signedAt: null, amount: null });
    expect(row.lines).toHaveLength(1);
    expect(row.lines[0]!.value.toString()).toBe("18000");
    expect(sent).toMatchObject({ routedTo: "Superintending Officer (test)", dueOn: null });
    const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "ContractorSubmission", entityId: row.id }, orderBy: { at: "desc" } });
    expect(audit).toMatchObject({ action: "CREATE", actorSupplierAccountId: h.accountId });
    // The S.O. office's holder is told once, in the portal, with no amount; a second identical act would not tell twice (the key).
    const notices = await db.staffNotice.findMany({ where: { subjectEntity: "ContractorSubmission", subjectId: row.id } });
    expect(notices.map((n) => [n.recipientPersonId, n.kind])).toEqual([[officerId, "CONTRACTOR_SUBMISSION"]]);
    expect(notices[0]!.body).toContain("No service level is set");
    expect(notices[0]!.body).not.toContain("18000");
    // The contractor reads it back with its state, and the officers' queue shows it waiting with the service level not set.
    const tab = await submissionsTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    expect(tab.rows.find((r) => r.id === row.id)).toMatchObject({ service: { state: "NOT_SET" }, routedTo: "Superintending Officer (test)", lines: [{ value: formatMoney(18_000_00n) }] });
    const queue = await loadReviewQueue(db, organisationId, today);
    expect(queue.rows.find((r) => r.id === row.id)).toMatchObject({ outcome: null, contractor: "A Contractor", service: { state: "NOT_SET" } });
    expect(queue.unsetKinds).toContain("MATERIALS_ON_SITE");
  });

  it("takes the due day from the kind's service level as it stands when sent (calendar days), and a claim carries its amount", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    await db.contractorSubmissionSetting.upsert({ where: { organisationId_kind: { organisationId, kind: "INTERIM_CLAIM" } }, update: { serviceLevelDays: 7, provenance: "ASSUMED" }, create: { organisationId, kind: "INTERIM_CLAIM", serviceLevelDays: 7, provenance: "ASSUMED" } });
    const sent = await sendSubmission(h.actor, { contractId: c.id, kind: "INTERIM_CLAIM", title: "Claim 1", body: "Work to date.", amount: "12500.50", aboutDay: today, lines: [], stepUpAt: null });
    expect(sent.dueOn).toBe(dayPlus(today, 7));
    const row = await db.contractorSubmission.findUniqueOrThrow({ where: { id: sent.submissionId } });
    expect(row.serviceLevelDays).toBe(7);
    expect(row.amount?.toString()).toBe("12500.5");
    expect((await db.staffNotice.findFirst({ where: { subjectEntity: "ContractorSubmission", subjectId: row.id } }))?.body).toContain("due to be answered by");
    await db.contractorSubmissionSetting.update({ where: { organisationId_kind: { organisationId, kind: "INTERIM_CLAIM" } }, data: { serviceLevelDays: null, provenance: null } });
  });

  it("is routed to nobody, and says so, where the contract has no Superintending Officer", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId, so: false });
    const sent = await sendSubmission(h.actor, { contractId: c.id, kind: "DEFECTS_RECTIFIED", title: "Defects made good", body: "Items 1 to 4 of the schedule.", amount: "", aboutDay: "", lines: [], stepUpAt: null });
    expect(sent.routedTo).toBeNull();
    expect(await db.staffNotice.count({ where: { subjectEntity: "ContractorSubmission", subjectId: sent.submissionId } })).toBe(0);
    expect((await overviewTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!)).facts.soOffice).toBeNull();
  });

  it("is refused, with nothing written, on another contractor's contract, on a cancelled one, and for fields the kind does not take", async () => {
    const h = await supplier();
    const other = await supplier();
    const theirs = await contract({ vendorId: other.supplierId });
    const cancelled = await contract({ vendorId: h.supplierId, status: "CANCELLED" });
    const mine = await contract({ vendorId: h.supplierId });
    const base = { kind: "WORK_PROGRAMME" as const, title: "Revision 2", body: "Resequenced.", amount: "", aboutDay: "", lines: [], stepUpAt: null };
    await refusedWith(sendSubmission(h.actor, { ...base, contractId: theirs.id }), "NOT_FOUND", 404);
    await refusedWith(sendSubmission(h.actor, { ...base, contractId: cancelled.id }), "CONTRACT_NOT_ACTIVE");
    await refusedWith(sendSubmission(h.actor, { ...base, contractId: mine.id, title: " " }), "TITLE_REQUIRED");
    await refusedWith(sendSubmission(h.actor, { ...base, contractId: mine.id, amount: "1.00" }), "AMOUNT_NOT_ON_KIND");
    expect(await db.contractorSubmission.count({ where: { supplierId: h.supplierId } })).toBe(0);
  });

  it("a statutory declaration is signed with the password asked again: without it nothing is written, with it the attribution names the submission", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const declaration = { contractId: c.id, kind: "STATUTORY_DECLARATION" as const, title: "Statutory declaration", body: "I declare that all sums due to sub-contractors have been paid.", amount: "", aboutDay: "", lines: [] };
    await refusedWith(sendSubmission(h.actor, { ...declaration, stepUpAt: null }), "PASSWORD_REQUIRED");
    // A stale moment (not the session's) is refused by the attribution and the submission rolls back with it.
    await expect(sendSubmission(h.actor, { ...declaration, stepUpAt: new Date(Date.now() - 60_000) })).rejects.toBeInstanceOf(AttributionRefused);
    expect(await db.contractorSubmission.count({ where: { supplierId: h.supplierId } })).toBe(0);
    const at = await stepUp(h);
    const sent = await sendSubmission(h.actor, { ...declaration, stepUpAt: at });
    const row = await db.contractorSubmission.findUniqueOrThrow({ where: { id: sent.submissionId } });
    expect(row.signedAt?.getTime()).toBe(at.getTime());
    const attribution = await db.actAttribution.findFirstOrThrow({ where: { entity: "ContractorSubmission", entityId: row.id, slot: "submittedBy" } });
    expect(attribution).toMatchObject({ subjectSupplierAccountId: h.accountId, mode: "SIGNED", documentEntity: "ContractorSubmission", documentId: row.id });
    expect(attribution.stepUpAt?.getTime()).toBe(at.getTime());
  });
});

describe("the site diary (FR-SUP-007)", () => {
  const entry = (contractId: string, day: string) => db.siteDiaryEntry.create({ data: { organisationId, contractId, day: D(day), weather: "Fine", entry: "Pipe laying, chainage 1+200 to 1+260.", officerPersonId: officerId, officerAttestedOn: D(day), recordedAt: new Date(), recordedOn: D(day) } });

  it("the agent attests with the password asked again, once, from the portal; a stale moment writes nothing", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const e = await entry(c.id, today);
    await expect(attestDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, stepUpAt: null })).rejects.toBeInstanceOf(AttributionRefused);
    expect((await db.siteDiaryEntry.findUniqueOrThrow({ where: { id: e.id } })).agentAttestedOn).toBeNull();
    const at = await stepUp(h);
    const done = await attestDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, stepUpAt: at });
    expect(done.day).toBe(today);
    const row = await db.siteDiaryEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(row).toMatchObject({ agentName: h.actor.displayName, agentAttestedBySupplierAccountId: h.accountId });
    expect(row.agentAttestedOn?.toISOString().slice(0, 10)).toBe(today);
    expect(row.agentAttestedAt).not.toBeNull();
    const attribution = await db.actAttribution.findFirstOrThrow({ where: { entity: "SiteDiaryEntry", entityId: e.id, slot: "agentAttestedBy" } });
    expect(attribution).toMatchObject({ subjectSupplierAccountId: h.accountId, mode: "SIGNED", documentEntity: "SiteDiaryEntry", documentId: e.id });
    // Once: a second attestation is refused, however fresh the password.
    await refusedWith(attestDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, stepUpAt: await stepUp(h) }), "ALREADY_ATTESTED");
    const tab = await diaryTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    expect(tab.rows.find((r) => r.id === e.id)).toMatchObject({ state: "COMPLETE", signedFromPortal: true, canAttest: false });
    // The list counts no entry left to attest.
    expect((await loadMyContracts(db, h.actor)).find((r) => r.id === c.id)?.toAttest).toBe(0);
  });

  it("a disagreement is recorded once, escalates the entry to the S.O. and names the account; an entry of another contractor's contract is not found", async () => {
    const h = await supplier();
    const other = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const theirs = await contract({ vendorId: other.supplierId });
    const e = await entry(c.id, dayPlus(today, -1));
    const foreign = await entry(theirs.id, today);
    await refusedWith(disputeDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, disagreement: " " }), "DISAGREEMENT_REQUIRED");
    await disputeDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, disagreement: "Work stopped at noon for rain, not at three." });
    const row = await db.siteDiaryEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(row).toMatchObject({ disagreement: "Work stopped at noon for rain, not at three.", disputedBySupplierAccountId: h.accountId });
    expect(row.escalatedOn?.toISOString().slice(0, 10)).toBe(today);
    await refusedWith(disputeDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, disagreement: "Again." }), "ALREADY_DISPUTED");
    await refusedWith(disputeDiaryAsAgent(h.actor, { contractId: theirs.id, entryId: foreign.id, disagreement: "x" }), "NOT_FOUND", 404);
    await refusedWith(disputeDiaryAsAgent(h.actor, { contractId: c.id, entryId: foreign.id, disagreement: "x" }), "ENTRY_NOT_FOUND", 404);
    await refusedWith(attestDiaryAsAgent(h.actor, { contractId: c.id, entryId: "nonexistent-id-0001", stepUpAt: await stepUp(h) }), "ENTRY_NOT_FOUND", 404);
    expect((await db.siteDiaryEntry.findUniqueOrThrow({ where: { id: foreign.id } })).disagreement).toBe("");
  });
});

describe("the contractor's block on a certificate (FR-VAR-022)", () => {
  const BLOCKS = [
    { blockOrder: 1, blockKind: "RECOMMENDING", labelEn: "Recommending officer", labelMs: null, datesCertificate: false, officeRule: "NAMED_OFFICE", officeCode: "PRJ_RO", delegable: false, carriesDecision: false, refusalAllowed: false },
    { blockOrder: 2, blockKind: "CONTRACTOR", labelEn: "Contractor", labelMs: null, datesCertificate: false, officeRule: "CONTRACTOR", officeCode: null, delegable: false, carriesDecision: false, refusalAllowed: true },
    { blockOrder: 3, blockKind: "WITNESS", labelEn: "Witness", labelMs: null, datesCertificate: false, officeRule: "WITNESS", officeCode: null, delegable: false, carriesDecision: false, refusalAllowed: false },
  ];
  async function certificate(contractId: string, o: { kind?: "VARIATION" | "SUM_ADJUSTMENT" | "INTERIM_PAYMENT"; firstSigned?: boolean; status?: "SIGNING" | "ISSUED" } = {}) {
    const baseline = (await db.contractBaseline.findFirst({ where: { contractId, version: 1 }, select: { id: true } })) ?? (await db.contractBaseline.create({ data: { organisationId, contractId, version: 1, reason: "EXECUTED", contractSum: "100000.00", completionPeriod: 90, completionUnit: "DAYS", entered: {}, snapshot: {}, recordedAt: at(-10), recordedOn: D(at(-10)) }, select: { id: true } }));
    const template = await db.documentTemplate.create({ data: { organisationId, code: `PRJ_FORM_${randomId()}`, nameEn: "Variation Order Certificate (test)", formCode: "VO-660" } });
    const revision = { templateId: template.id, code: template.code, nameEn: template.nameEn, nameMs: null, formCode: "VO-660", revisionDate: null, bodyVersion: 1, bodyEn: "Body", bodyMs: null, blocks: BLOCKS, distribution: [], pinnedOn: dayPlus(today, -2) };
    const cert = await db.certificate.create({ data: { organisationId, contractId, kind: o.kind ?? "VARIATION", status: o.status ?? "SIGNING", templateId: template.id, templateRevision: revision, pinnedAt: at(-2), baselineId: baseline.id, openedAt: at(-3), openedOn: D(at(-3)) } });
    if (o.firstSigned !== false) await db.certificateSignature.create({ data: { organisationId, certificateId: cert.id, blockOrder: 1, blockKind: "RECOMMENDING", blockLabel: "Recommending officer", personId: officerId, name: "The officer", signedOn: D(at(-1)), recordedAt: at(-1) } });
    return cert.id;
  }

  it("is signed with the password asked again, from the portal, and named on the signature and its attribution", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const certId = await certificate(c.id);
    await expect(signContractorBlock(h.actor, { contractId: c.id, certificateId: certId, action: "sign", note: "", stepUpAt: null })).rejects.toBeInstanceOf(AttributionRefused);
    expect(await db.certificateSignature.count({ where: { certificateId: certId, blockOrder: 2 } })).toBe(0);
    const done = await signContractorBlock(h.actor, { contractId: c.id, certificateId: certId, action: "sign", note: "", stepUpAt: await stepUp(h) });
    expect(done.blockOrder).toBe(2);
    const sig = await db.certificateSignature.findFirstOrThrow({ where: { certificateId: certId, blockOrder: 2 } });
    expect(sig).toMatchObject({ name: h.actor.displayName, refused: false, signedBySupplierAccountId: h.accountId, personId: null });
    expect(sig.signedOn.toISOString().slice(0, 10)).toBe(today);
    const attribution = await db.actAttribution.findFirstOrThrow({ where: { entity: "CertificateSignature", entityId: sig.id, slot: "signedBySupplierAccount" } });
    expect(attribution).toMatchObject({ subjectSupplierAccountId: h.accountId, mode: "SIGNED", documentEntity: "Certificate", documentId: certId });
    // The witness block is still open: the certificate is not issued by the contractor's signature.
    expect((await db.certificate.findUniqueOrThrow({ where: { id: certId } })).status).toBe("SIGNING");
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: certId, action: "sign", note: "", stepUpAt: await stepUp(h) }), "BLOCK_SIGNED");
    const tab = await certificatesTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    expect(tab.rows.find((r) => r.id === certId)).toMatchObject({ recorded: { fromPortal: true, refused: false }, block: { state: "NOT_OFFERED", why: "SIGNED" } });
  });

  it("a dispute is the refusal the form allows, with its reason; the block is offered only in order, on the two kinds, and only on the contractor's own contract", async () => {
    const h = await supplier();
    const other = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const theirs = await contract({ vendorId: other.supplierId });
    const disputed = await certificate(c.id, { kind: "SUM_ADJUSTMENT" });
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: disputed, action: "dispute", note: "", stepUpAt: await stepUp(h) }), "REFUSAL_NOTE_REQUIRED");
    await signContractorBlock(h.actor, { contractId: c.id, certificateId: disputed, action: "dispute", note: "The omission is overstated.", stepUpAt: await stepUp(h) });
    expect(await db.certificateSignature.findFirstOrThrow({ where: { certificateId: disputed, blockOrder: 2 } })).toMatchObject({ refused: true, refusalNote: "The omission is overstated.", signedBySupplierAccountId: h.accountId });
    const notNext = await certificate(c.id, { firstSigned: false });
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: notNext, action: "sign", note: "", stepUpAt: await stepUp(h) }), "BLOCK_NOT_NEXT");
    const interim = await certificate(c.id, { kind: "INTERIM_PAYMENT" });
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: interim, action: "sign", note: "", stepUpAt: await stepUp(h) }), "NO_CONTRACTOR_BLOCK");
    const foreign = await certificate(theirs.id);
    await refusedWith(signContractorBlock(h.actor, { contractId: theirs.id, certificateId: foreign, action: "sign", note: "", stepUpAt: await stepUp(h) }), "NOT_FOUND", 404);
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: foreign, action: "sign", note: "", stepUpAt: await stepUp(h) }), "NOT_FOUND", 404);
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: "nonexistent-id-0001", action: "sign", note: "", stepUpAt: await stepUp(h) }), "NOT_FOUND", 404);
    expect(await db.certificateSignature.count({ where: { certificateId: { in: [notNext, interim, foreign] }, blockOrder: 2 } })).toBe(0);
    // The list counts the one certificate whose block is next.
    const row = (await loadMyContracts(db, h.actor)).find((r) => r.id === c.id)!;
    expect(row.toSign).toBe(0);
  });
});

describe("the announcements board", () => {
  it("shows the standing announcements pinned first, then newest first, and never a withdrawn one; the officers' register shows all", async () => {
    const h = await supplier();
    const publisher = await makePerson(organisationId, `Publisher ${randomId()}`);
    const mk = (title: string, o: { pinned?: boolean; withdrawn?: boolean; daysAgo: number }) =>
      db.announcement.create({ data: { organisationId, category: "NOTICE", title, body: "Body.", pinned: o.pinned ?? false, publishedOn: D(at(-o.daysAgo)), publishedAt: at(-o.daysAgo), publishedByPersonId: publisher.id, ...(o.withdrawn ? { withdrawnAt: new Date(), withdrawnByPersonId: publisher.id, withdrawReason: "Superseded." } : {}) } });
    const run = randomId();
    const old = await mk(`Old ${run}`, { daysAgo: 30 });
    const pinned = await mk(`Pinned ${run}`, { pinned: true, daysAgo: 40 });
    const fresh = await mk(`Fresh ${run}`, { daysAgo: 1 });
    const gone = await mk(`Gone ${run}`, { withdrawn: true, daysAgo: 2 });
    const board = (await loadBoard(db, h.actor.organisationId, "Asia/Kuala_Lumpur")).filter((a) => a.title.endsWith(run)).map((a) => a.id);
    expect(board).toEqual([pinned.id, fresh.id, old.id]);
    const all = (await loadBoard(db, organisationId, "Asia/Kuala_Lumpur", { withdrawn: true })).map((a) => a.id);
    expect(all).toContain(gone.id);
    // Withdrawn whole, by CHECK: an instant without the person is refused.
    await expect(db.announcement.update({ where: { id: old.id }, data: { withdrawnAt: new Date() } })).rejects.toThrow(/Announcement_withdrawn_whole|constraint/i);
  });
});
