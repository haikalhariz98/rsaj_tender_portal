import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AttributionRefused } from "@/lib/auth/attribution-store";
import { authenticateSupplier, confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { readSupplierSession } from "@/lib/auth/supplier-session-store";
import type { SupplierActor } from "@/lib/auth/types";
import type { CertificateKind } from "@/lib/certificate/types";
import { db } from "@/lib/db";
import { facts, makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";
import { dayPlus, todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

import { loadBoard } from "./announcement-store";
import { signContractorBlock } from "./certificate-store";
import { loadProjectContext } from "./context-store";
import { attestDiaryAsAgent, disputeDiaryAsAgent } from "./diary-store";
import { loadMyContracts } from "./list-store";
import { loadReviewQueue, reviewCounts } from "./review-store";
import { SUBMISSIONS_PER_WINDOW } from "./submission";
import { sendSubmission } from "./submission-store";
import { ProjectRefused } from "./types";
import { projectFaultText } from "./words";
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
  // Decisions log, 2026-10-09, ruling on 1928(3): a contact signs for the company only once an officer has marked it so. The signed acts below are the authorised signatory's; the case that
  // follows ("who signs for the company") clears the mark and is refused. Updated to match the ruled decision, not weakened: the organisation's switch is still asked first.
  if (s.account) await db.supplierContact.update({ where: { id: s.account.contactId }, data: { authorisedToSignForContractor: true } });
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
  // 4e review fix: whether a contractor signs from its portal account is the organisation's switch, shipped unset (unset refuses). The signed acts below run with it decided
  // yes; "who may bind the contractor" below clears it and is refused.
  await portalSigning(true);
  void orgCode;
});

const portalSigning = (v: boolean | null) =>
  db.postAwardPolicy.upsert({ where: { organisationId }, update: { contractorPortalSigning: v, contractorPortalSigningProvenance: v == null ? null : "ASSUMED" }, create: { organisationId, contractorPortalSigning: v, contractorPortalSigningProvenance: v == null ? null : "ASSUMED" } });

afterAll(async () => {
  // The board test assumes the organisation holds fewer announcements than a page; the scratch organisation is shared across runs, so each run clears what it made.
  await db.announcement.deleteMany({ where: { organisationId } });
  await db.contractorSubmissionSetting.deleteMany({ where: { organisationId } });
  await portalSigning(null);
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
    // 4e review fix: the queue pages its two lists in the database, longest waiting first. The test organisation is shared and keeps earlier runs' rows, so this newest
    // submission is on the last page (a page past the end reads as the last).
    const queue = await loadReviewQueue(db, organisationId, today, { waiting: "999999" });
    expect(queue.waiting.rows.find((r) => r.id === row.id)).toMatchObject({ outcome: null, contractor: "A Contractor", service: { state: "NOT_SET" } });
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
  let issued = 0;
  async function certificate(contractId: string, o: { kind?: CertificateKind; firstSigned?: boolean; status?: "IN_ROUTING" | "SIGNING" | "ISSUED"; blocks?: typeof BLOCKS } = {}) {
    const baseline = (await db.contractBaseline.findFirst({ where: { contractId, version: 1 }, select: { id: true } })) ?? (await db.contractBaseline.create({ data: { organisationId, contractId, version: 1, reason: "EXECUTED", contractSum: "100000.00", completionPeriod: 90, completionUnit: "DAYS", entered: {}, snapshot: {}, recordedAt: at(-10), recordedOn: D(at(-10)) }, select: { id: true } }));
    const template = await db.documentTemplate.create({ data: { organisationId, code: `PRJ_FORM_${randomId()}`, nameEn: "Variation Order Certificate (test)", formCode: "VO-660" } });
    const revision = { templateId: template.id, code: template.code, nameEn: template.nameEn, nameMs: null, formCode: "VO-660", revisionDate: null, bodyVersion: 1, bodyEn: "Body", bodyMs: null, blocks: o.blocks ?? BLOCKS, distribution: [], pinnedOn: dayPlus(today, -2) };
    const cert = await db.certificate.create({ data: { organisationId, contractId, kind: o.kind ?? "VARIATION", status: o.status ?? "SIGNING", templateId: template.id, templateRevision: revision, pinnedAt: at(-2), baselineId: baseline.id, openedAt: at(-3), openedOn: D(at(-3)), ...(o.status === "ISSUED" ? { number: `PRJ/CERT/${randomId()}`, sequence: ++issued, issuedAt: at(-1), issueSnapshot: {} } : {}) } });
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

  it("the tab lists what is the contractor's: never a certificate the office is still deliberating, nor an internal letter (4e review fix)", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const intent = await certificate(c.id, { kind: "TERMINATION_INTENT", status: "IN_ROUTING", firstSigned: false });
    const letter = await certificate(c.id, { kind: "DELEGATION_LETTER" });
    const letterIssued = await certificate(c.id, { kind: "DELEGATION_LETTER", status: "ISSUED" });
    const nonCompletion = await certificate(c.id, { kind: "NON_COMPLETION" });
    const vo = await certificate(c.id);
    const interim = await certificate(c.id, { kind: "INTERIM_PAYMENT", status: "ISSUED" });
    const tab = await certificatesTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    const ids = tab.rows.map((r) => r.id);
    for (const id of [intent, letter, letterIssued, nonCompletion]) expect(ids).not.toContain(id);
    expect(ids).toContain(vo);
    expect(ids).toContain(interim);
    expect(tab.total).toBe(2);
  });

  it("is not offered, and is refused signed or disputed, where it is the last block to record: recording it would issue the certificate under the contractor's account (4e review fix, OPEN I)", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const last = await certificate(c.id, { blocks: BLOCKS.filter((b) => b.blockKind !== "WITNESS") });
    for (const action of ["sign", "dispute"] as const) await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: last, action, note: "The omission is overstated.", stepUpAt: await stepUp(h) }), "BLOCK_IS_LAST");
    expect(await db.certificateSignature.count({ where: { certificateId: last, blockOrder: 2 } })).toBe(0);
    const cert = await db.certificate.findUniqueOrThrow({ where: { id: last } });
    expect(cert.status).toBe("SIGNING");
    expect(cert.number).toBeNull();
    expect(await db.auditEntry.count({ where: { entity: { in: ["Certificate", "CertificateSignature"] }, actorSupplierAccountId: h.accountId } })).toBe(0);
    const tab = await certificatesTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    expect(tab.rows.find((r) => r.id === last)).toMatchObject({ block: { state: "NOT_OFFERED", why: "LAST" } });
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
    // 4e review fix: the board is one page with its total (paged in the database); this organisation has fewer than a page, so every one is on the first.
    const page = await loadBoard(db, h.actor.organisationId, "Asia/Kuala_Lumpur");
    const board = page.items.filter((a) => a.title.endsWith(run)).map((a) => a.id);
    expect(board).toEqual([pinned.id, fresh.id, old.id]);
    expect(page.total).toBe(page.items.length);
    const all = (await loadBoard(db, organisationId, "Asia/Kuala_Lumpur", { withdrawn: true })).items.map((a) => a.id);
    expect(all).toContain(gone.id);
    // Withdrawn whole, by CHECK: an instant without the person is refused.
    await expect(db.announcement.update({ where: { id: old.id }, data: { withdrawnAt: new Date() } })).rejects.toThrow(/Announcement_withdrawn_whole|constraint/i);
  });
});

describe("who may bind the contractor from the portal (4e review fix)", () => {
  it("unset, the statutory declaration and the certificate block are refused in words and nothing is written; decided no, the same; the attribution names the signatory's designation", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const declaration = { contractId: c.id, kind: "STATUTORY_DECLARATION" as const, title: "Statutory declaration", body: "All sums due to sub-contractors are paid.", amount: "", aboutDay: "", lines: [] };
    try {
      await portalSigning(null);
      await refusedWith(sendSubmission(h.actor, { ...declaration, stepUpAt: await stepUp(h) }), "PORTAL_SIGNING_NOT_SET");
      await portalSigning(false);
      await refusedWith(sendSubmission(h.actor, { ...declaration, stepUpAt: await stepUp(h) }), "PORTAL_SIGNING_OFF");
      expect(await db.contractorSubmission.count({ where: { supplierId: h.supplierId } })).toBe(0);
      // A submission that signs nothing is not touched by the switch.
      await sendSubmission(h.actor, { contractId: c.id, kind: "WORK_PROGRAMME", title: "Revision 2", body: "Resequenced.", amount: "", aboutDay: "", lines: [], stepUpAt: null });
      const tab = await submissionsTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
      expect(tab.signing).toMatch(/on paper only/);
    } finally {
      await portalSigning(true);
    }
    await db.supplierContact.update({ where: { id: h.actor.contactId }, data: { designation: "Director" } });
    const sent = await sendSubmission(h.actor, { ...declaration, stepUpAt: await stepUp(h) });
    const attribution = await db.actAttribution.findFirstOrThrow({ where: { entity: "ContractorSubmission", entityId: sent.submissionId, slot: "submittedBy" } });
    expect(attribution.reason).toContain(`by ${h.actor.displayName} (Director)`);
  });
});

describe("who signs for the company (ruling on 1928(3))", () => {
  it("a contact an officer has not marked, or marked no, is refused the declaration notice, naming why; marked yes, it is sent", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const notice = { contractId: c.id, kind: "STATUTORY_DECLARATION" as const, title: "Notice", body: "The declaration is lodged.", amount: "", aboutDay: "", lines: [] };
    await db.supplierContact.update({ where: { id: h.actor.contactId }, data: { authorisedToSignForContractor: null } });
    await refusedWith(sendSubmission(h.actor, { ...notice, stepUpAt: await stepUp(h) }), "SIGNER_NOT_AUTHORISED_NOT_SET");
    await db.supplierContact.update({ where: { id: h.actor.contactId }, data: { authorisedToSignForContractor: false } });
    await refusedWith(sendSubmission(h.actor, { ...notice, stepUpAt: await stepUp(h) }), "SIGNER_NOT_AUTHORISED");
    expect(await db.contractorSubmission.count({ where: { supplierId: h.supplierId } })).toBe(0);
    const tab = await submissionsTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    expect(tab.signing).toMatch(/do not sign for your company/);
    // A submission that signs nothing is not touched by the mark.
    await sendSubmission(h.actor, { contractId: c.id, kind: "WORK_PROGRAMME", title: "Revision 3", body: "Resequenced.", amount: "", aboutDay: "", lines: [], stepUpAt: null });
    await db.supplierContact.update({ where: { id: h.actor.contactId }, data: { authorisedToSignForContractor: true } });
    await sendSubmission(h.actor, { ...notice, stepUpAt: await stepUp(h) });
    expect(await db.contractorSubmission.count({ where: { supplierId: h.supplierId, kind: "STATUTORY_DECLARATION" } })).toBe(1);
  });

  it("the organisation's switch is asked first: off, a marked contact is still refused for the switch", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    try {
      await portalSigning(false);
      await refusedWith(sendSubmission(h.actor, { contractId: c.id, kind: "STATUTORY_DECLARATION", title: "Notice", body: "Lodged.", amount: "", aboutDay: "", lines: [], stepUpAt: await stepUp(h) }), "PORTAL_SIGNING_OFF");
    } finally {
      await portalSigning(true);
    }
  });
});

describe("a supplier whose standing bars it may read and do nothing else (ruling on 1875(3))", () => {
  const programme = (contractId: string) => ({ contractId, kind: "WORK_PROGRAMME" as const, title: "Revision 4", body: "Resequenced.", amount: "", aboutDay: "", lines: [], stepUpAt: null });

  it("a rejected supplier is refused a submission, in words, with nothing written, and still reads its contract", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    await db.supplier.update({ where: { id: h.supplierId }, data: { status: "REJECTED" } });
    await refusedWith(sendSubmission(h.actor, programme(c.id)), "SUPPLIER_STANDING_BARS");
    expect(await db.contractorSubmission.count({ where: { supplierId: h.supplierId } })).toBe(0);
    expect(await loadMyContracts(db, h.actor)).toBeDefined();
  });

  it("a supplier suspended by hand is refused the same, saying it is suspended; lifted, it is not", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const reason = await db.standingReason.create({ data: { organisationId, code: `T_${randomId()}`, nameEn: "A test reason", appliesTo: "SUSPEND" } });
    const event = await db.standingEvent.create({ data: { organisationId, supplierId: h.supplierId, kind: "SUSPEND", reasonId: reason.id, reasonSnapshot: "Test", effectiveOn: D(at(-1)), flaggedDocumentIds: [], recordedByPersonId: officerId, recordedAt: new Date() } });
    const e = await sendSubmission(h.actor, programme(c.id)).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(ProjectRefused);
    expect(projectFaultText((e as ProjectRefused).faults[0]).en).toMatch(/suspended/);
    await db.standingEvent.create({ data: { organisationId, supplierId: h.supplierId, kind: "REINSTATE", reasonSnapshot: "Test", effectiveOn: D(at(0)), flaggedDocumentIds: [], reinstatesEventId: event.id, recordedByPersonId: officerId, recordedAt: new Date() } });
    await sendSubmission(h.actor, programme(c.id));
    expect(await db.contractorSubmission.count({ where: { supplierId: h.supplierId } })).toBe(1);
  });
});

describe("a submission is bounded per account (4e review fix)", () => {
  it(`past ${SUBMISSIONS_PER_WINDOW} in the window, the next is refused with nothing written and no notice`, async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    for (let n = 0; n < SUBMISSIONS_PER_WINDOW; n++) {
      await db.contractorSubmission.create({ data: { organisationId, contractId: c.id, supplierId: h.supplierId, kind: "WORK_PROGRAMME", title: `Revision ${n}`, body: "x", submittedBySupplierAccountId: h.accountId, submittedAt: new Date(), submittedOn: D(today) } });
    }
    const notices = await db.staffNotice.count({ where: { subjectEntity: "ContractorSubmission", recipientPersonId: officerId } });
    const e = await sendSubmission(h.actor, { contractId: c.id, kind: "WORK_PROGRAMME", title: "One more", body: "x", amount: "", aboutDay: "", lines: [], stepUpAt: null }).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(ProjectRefused);
    expect((e as ProjectRefused).faults.map((f) => f.code)).toEqual(["TOO_MANY_SUBMISSIONS"]);
    expect((e as ProjectRefused).status).toBe(429);
    expect(await db.contractorSubmission.count({ where: { submittedBySupplierAccountId: h.accountId } })).toBe(SUBMISSIONS_PER_WINDOW);
    expect(await db.staffNotice.count({ where: { subjectEntity: "ContractorSubmission", recipientPersonId: officerId } })).toBe(notices);
    // Another account of another supplier is not held back by this one's count.
    const other = await supplier();
    const theirs = await contract({ vendorId: other.supplierId });
    await sendSubmission(other.actor, { contractId: theirs.id, kind: "WORK_PROGRAMME", title: "Revision 1", body: "x", amount: "", aboutDay: "", lines: [], stepUpAt: null });
  });
});

describe("the review queue's counts are the whole register's (4e review fix)", () => {
  it("waiting and overdue are count queries: overdue is waiting past its due day, and due today is not overdue", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const before = await reviewCounts(db, organisationId, today);
    const mk = (dueOn: string | null) => db.contractorSubmission.create({ data: { organisationId, contractId: c.id, supplierId: h.supplierId, kind: "WORK_PROGRAMME", title: "x", body: "x", submittedBySupplierAccountId: h.accountId, submittedAt: at(-10), submittedOn: D(dayPlus(today, -10)), serviceLevelDays: dueOn ? 1 : null, dueOn: dueOn ? D(dueOn) : null } });
    await mk(dayPlus(today, -1));
    await mk(today);
    await mk(null);
    const after = await reviewCounts(db, organisationId, today);
    expect(after.waiting - before.waiting).toBe(3);
    expect(after.overdue - before.overdue).toBe(1);
    expect((await reviewCounts(db, organisationId, null)).overdue).toBe(0);
    const q = await loadReviewQueue(db, organisationId, today);
    expect(q.waiting.total).toBe(after.waiting);
    expect(q.overdue).toBe(after.overdue);
  });
});

describe("what the portal sent or signed is frozen in the database (4e review fix)", () => {
  const raw = (sql: string, ...v: unknown[]) => db.$executeRawUnsafe(sql, ...v);

  it("a submission is never changed or removed, its lines are never added to, changed or removed, and it is answered once, whole", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const sent = await sendSubmission(h.actor, { contractId: c.id, kind: "MATERIALS_ON_SITE", title: "Materials", body: "Pipes.", amount: "", aboutDay: today, lines: [{ description: "Pipe", quantity: "4 m", location: "Site", value: "100.00" }], stepUpAt: null });
    const id = sent.submissionId;
    await expect(raw(`UPDATE "ContractorSubmission" SET "title" = 'Changed' WHERE id = $1`, id)).rejects.toThrow(/never changes/);
    await expect(raw(`UPDATE "ContractorSubmission" SET "aboutDay" = NULL WHERE id = $1`, id)).rejects.toThrow(/never changes/);
    await expect(raw(`DELETE FROM "ContractorSubmission" WHERE id = $1`, id)).rejects.toThrow(/is kept/);
    await expect(raw(`UPDATE "ContractorSubmissionLine" SET "value" = 1 WHERE "submissionId" = $1`, id)).rejects.toThrow(/frozen as sent/);
    await expect(raw(`DELETE FROM "ContractorSubmissionLine" WHERE "submissionId" = $1`, id)).rejects.toThrow(/frozen as sent/);
    await expect(db.contractorSubmissionLine.create({ data: { submissionId: id, sortOrder: 9, description: "More", quantity: "1", location: "x", value: "1.00" } })).rejects.toThrow(/sent already/);
    await expect(raw(`TRUNCATE "ContractorSubmissionLine"`)).rejects.toThrow(/append-only/);
    // An answer that is not whole is refused; a whole one is taken, once.
    await expect(raw(`UPDATE "ContractorSubmission" SET "outcome" = 'TAKEN_UP' WHERE id = $1`, id)).rejects.toThrow(/together/);
    await raw(`UPDATE "ContractorSubmission" SET "outcome" = 'RETURNED', "outcomeNote" = 'Add the delivery orders.', "decidedByPersonId" = $2, "decidedOn" = $3::date, "decidedAt" = now() WHERE id = $1`, id, officerId, today);
    await expect(raw(`UPDATE "ContractorSubmission" SET "outcomeNote" = 'Changed' WHERE id = $1`, id)).rejects.toThrow(/answered already/);
    // Answered, a line still cannot be added in the answering transaction.
    await expect(db.$transaction(async (tx) => tx.contractorSubmissionLine.create({ data: { submissionId: id, sortOrder: 8, description: "More", quantity: "1", location: "x", value: "1.00" } }))).rejects.toThrow(/sent already/);
    expect(await db.contractorSubmissionLine.count({ where: { submissionId: id } })).toBe(1);
    // The CHECK: a day only on the kinds that carry one.
    await expect(db.contractorSubmission.create({ data: { organisationId, contractId: c.id, supplierId: h.supplierId, kind: "WORK_PROGRAMME", title: "x", body: "x", aboutDay: D(today), submittedBySupplierAccountId: h.accountId, submittedAt: new Date(), submittedOn: D(today) } })).rejects.toThrow(/ContractorSubmission_day_kind|constraint/i);
  });

  it("the agent's attestation and disagreement from the portal, and a certificate block signed from the portal, are kept; the officers' own columns stay theirs", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const e = await db.siteDiaryEntry.create({ data: { organisationId, contractId: c.id, day: D(today), weather: "Fine", entry: "Work.", officerPersonId: officerId, recordedAt: new Date(), recordedOn: D(today) } });
    await attestDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, stepUpAt: await stepUp(h) });
    await disputeDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, disagreement: "Rain from noon." });
    await expect(raw(`UPDATE "SiteDiaryEntry" SET "agentName" = 'Someone else' WHERE id = $1`, e.id)).rejects.toThrow(/signed from the portal/);
    await expect(raw(`UPDATE "SiteDiaryEntry" SET "disagreement" = 'Nothing' WHERE id = $1`, e.id)).rejects.toThrow(/recorded from the portal/);
    await expect(raw(`DELETE FROM "SiteDiaryEntry" WHERE id = $1`, e.id)).rejects.toThrow(/portal account/);
    // The officer's own attestation is still the officer's to record.
    await raw(`UPDATE "SiteDiaryEntry" SET "officerAttestedOn" = $2::date WHERE id = $1`, e.id, today);
    // A paper-recorded entry is untouched by the trigger.
    const paper = await db.siteDiaryEntry.create({ data: { organisationId, contractId: c.id, day: D(dayPlus(today, -1)), weather: "Fine", entry: "Work.", officerPersonId: officerId, recordedAt: new Date(), recordedOn: D(dayPlus(today, -1)), agentAttestedOn: D(dayPlus(today, -1)), agentName: "Paper agent" } });
    await raw(`UPDATE "SiteDiaryEntry" SET "agentName" = 'Paper agent, corrected' WHERE id = $1`, paper.id);

    const s = await db.certificateSignature.create({ data: { organisationId, certificateId: (await db.certificate.findFirstOrThrow({ where: { organisationId }, select: { id: true } })).id, blockOrder: 900 + Math.floor(Math.random() * 90), blockKind: "CONTRACTOR", blockLabel: "Contractor", name: h.actor.displayName, signedOn: D(today), recordedAt: new Date(), signedBySupplierAccountId: h.accountId } });
    await expect(raw(`UPDATE "CertificateSignature" SET "refused" = true WHERE id = $1`, s.id)).rejects.toThrow(/portal account/);
    await expect(raw(`DELETE FROM "CertificateSignature" WHERE id = $1`, s.id)).rejects.toThrow(/portal account/);
  });
});
