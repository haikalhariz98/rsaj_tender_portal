import { createHash, randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

/**
 * Wave C step C11 (Award and Contract Requirements v2, C-3 and AC-20; design note 0004): the rules that must stay, and the walk from "Start the award" to "Active on site",
 * through the real server actions as the case page posts them. It is NOT a test of the scratch database: it is run, as a child process, by
 * `src/lib/contract/case-walk.db.test.ts` against a THROWAWAY database that test made and loaded with the demonstration, after `demo:accounts` gave the demonstration's
 * people their accounts (`vitest.case-walk.config.mts`; run on its own it does nothing). Only the request is stood in for: who is signed in, the cookies, the cache and the
 * redirect. The actions, the locks, the gates, the triggers and the SQL are the product's.
 *
 * Every field name below is one the case page's drawer posts (`scripts/case-walk-harness.ts` is read by `src/lib/contract/case-walk-fields.test.ts`, which holds each name
 * against the drawer's source). The demonstration's organisation is the synthetic one the loader makes (rule: no customer's limits in a test).
 */

const who = vi.hoisted(() => ({ actor: null as unknown, redirected: null as string | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const { administrationConflict } = await import("@/lib/auth/administration-conflict");
  const { confirmStaffPassword } = await import("@/lib/auth/identity");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    currentStaffOrNull: async () => who.actor,
    toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff,
    staffForAct: async (act: import("@/lib/auth/administration-conflict").AdministratorAct) => {
      const actor = who.actor as import("@/lib/auth/types").StaffActor;
      const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: actor.isAdministrator });
      return fault ? { ok: false as const, state: { ok: false as const, message: fault.en } } : { ok: true as const, actor };
    },
    stepUp: async (actor: import("@/lib/auth/types").StaffActor, password: string) => {
      const r = await confirmStaffPassword(actor, password, { sourceAddress: null, userAgent: "harness" });
      return r.ok ? r : { ok: false as const, message: "That password is not right." };
    },
  };
});
vi.mock("@/app/_auth/cookies", () => ({ refuseForeignPost: async () => null, currentRequestFacts: async () => ({ sourceAddress: null, userAgent: "harness" }) }));
vi.mock("@/app/_auth/act", async () => {
  const begin = await import("@/lib/auth/act-begin");
  const { attributeAct } = await import("@/lib/auth/attribution-store");
  const { confirmStaffPassword } = await import("@/lib/auth/identity");
  const deps: import("@/lib/auth/act-begin").ActDeps = {
    now: () => new Date(),
    paperSignatureRecording: async () => null,
    stepUp: async (actor, password) => {
      const r = await confirmStaffPassword(actor, password, { sourceAddress: null, userAgent: "harness" });
      return r.ok ? r : { ok: false, message: r.kind };
    },
    attribute: attributeAct,
  };
  return {
    beginAct: (actor: import("@/lib/auth/types").StaffActor, data: FormData, key: string, o: Parameters<typeof begin.beginActWith>[4]) => begin.beginActWith(deps, actor, data, key, o),
    beginActFrom: (actor: import("@/lib/auth/types").StaffActor, f: import("@/lib/auth/act-input").ActForm, key: string, o: Parameters<typeof begin.beginActFromWith>[4]) => begin.beginActFromWith(deps, actor, f, key, o),
    actFormFromJson: begin.actFormFromJson,
    attributionRefusalState: begin.attributionRefusalState,
  };
});
vi.mock("@/app/_auth/route", () => ({
  refusalResponse: (code: string) => Response.json({ ok: false, code }, { status: 401 }),
  staffRoute: async () => (who.actor ? { ok: true as const, actor: who.actor } : { ok: false as const, response: Response.json({ ok: false, code: "NOT_SIGNED_IN" }, { status: 401 }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    who.redirected = to;
    return undefined as never;
  },
  notFound: () => undefined as never,
}));

import { actFieldNames } from "@/lib/auth/act-field-names";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import type { StaffActor } from "@/lib/auth/types";
import { caseStage } from "@/lib/contract/case-stage";
import type { ContractStatus } from "@/lib/contract/types";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { dayIn, dayPlus, storedDay } from "@/lib/dates";
import { evaluateAward } from "@/lib/award/evaluate";
import { awardFacts, loadAward } from "@/lib/award/repo";
import { completionDay } from "@/lib/securities/period";
import { db } from "@/lib/db";

import { POST as castVote } from "@/app/api/committees/decisions/[id]/votes/route";
import { changeStatus, recordAttendance, recordOutcome, scheduleSitting } from "@/app/committees/actions";
import { addRate, completeCheck, decideLegal, recordContractorSignature, recordReconciliation, recordRsajSignature, recordStamping, saveBaselineEntry, startPreparation, submitLegal } from "@/app/projects/[id]/actions";
import { recordPossession } from "@/app/projects/[id]/supervision-actions";
import { attachDocument } from "@/app/documents/actions";
import { addCondition, cancelAward, createAward, decideAppointmentStep, issueAward, lodgePolicy, lodgeSecurity, recordCommencement, recordCommitment, recordDespatch, recordReturn, reviewPolicy, reviewSecurity, satisfyCondition, submitAward, updateAwardDetails, updateAwardTerms } from "@/app/awards/actions";

const PASSWORD_FIELD = actFieldNames("personId").password;
const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD ?? "";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const message = (r: { message?: string; errors?: Record<string, string> }) => r.message ?? JSON.stringify(r.errors);
const FIRST = { ok: false } as const;

/// The organisation's day, as its acts reckon it (never the UTC day): the demonstration's organisation keeps one zone.
const orgToday = () => dayIn(new Date(), process.env.DEMO_ORG_ZONE ?? "Asia/Kuala_Lumpur");
/// The work starts a fortnight from the day the walk runs, so no date in the walk belongs to a calendar day.
const startDay = () => dayPlus(orgToday(), 14);
const walk = { awardId: "", contractId: "" };
/// A scan already stored (the upload route's job, not under test): a document and its one version, ready to be attached by the attach drawer's act.
async function storedScan(title: string): Promise<string> {
  const person = (who.actor as StaffActor).personId;
  const doc = await db.document.create({ data: { organisationId: (who.actor as StaffActor).organisationId, title, documentClassId: "demo_dc1", classificationSnapshot: "INTERNAL", retentionSnapshot: {} } });
  const bytes = Buffer.from(`${title} ${randomBytes(8).toString("hex")}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const organisationId = (who.actor as StaffActor).organisationId;
  await db.blobContent.create({ data: { organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes } });
  const v = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "text/plain", originalFilename: `${title}.txt`, recordedByPersonId: person } });
  return v.id;
}
/// Where the case stands for the case list and the dashboard (AC-17), read from the stored rows.
async function stageOf() {
  const a = await db.award.findUniqueOrThrow({ where: { id: walk.awardId }, include: { contract: { select: { status: true } } } });
  return caseStage({ award: { status: a.status as AwardStatus, instrumentKind: a.instrumentKind as InstrumentKind }, contract: a.contract ? { status: a.contract.status as ContractStatus } : null, commencement: { commencedOn: a.commencedOn ? a.commencedOn.toISOString().slice(0, 10) : null } });
}
const sessions = new Map<string, StaffActor>();
async function signIn(personId: string): Promise<StaffActor> {
  const cached = sessions.get(personId);
  if (cached) return cached;
  const account = await db.staffAccount.findFirstOrThrow({ where: { personId } });
  const person = await db.person.findUniqueOrThrow({ where: { id: personId } });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId: person.organisationId, accountId: account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: { sourceAddress: null, userAgent: "harness" }, now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`the session did not read: ${read.reason}`);
  sessions.set(personId, read.actor as StaffActor);
  return read.actor as StaffActor;
}
/// Signs in as a person. `sulit`: the organisation has granted this person `sulit.read.organisation` (a decision the demonstration leaves undecided: configuration, not the product, says who reads SULIT across it).
const as = async (personId: string, o: { sulit?: boolean } = {}) => {
  const actor = await signIn(personId);
  who.actor = o.sulit ? { ...actor, permissions: new Set([...actor.permissions, "sulit.read.organisation" as const]) } : actor;
};

/// A refusal: the act answered not-ok, and says so in words (a message, or a message beside a field). Returns the words.
function refusal(r: unknown): string {
  const x = r as { ok?: boolean; message?: string; errors?: Record<string, string> } | undefined;
  expect(x?.ok, "the act should have refused").toBe(false);
  return message(x as never);
}
const ok = (r: unknown, label = "") => expect(r, `${label} ${message(r as never)}`.trim()).toMatchObject({ ok: true });

/**
 * A committee sits and carries the appointment for an award that has been sent for approval: the sitting is scheduled with the waiting step ticked (which tables it), started,
 * attended, voted on by each voter signed in as themselves through the votes route, and decided by the Secretariat. This is the committee screen's own work, not the case page's;
 * the case page only shows its result (the step discharged).
 */
async function committeeCarries(o: { awardId: string; exerciseId: string; committeeId: string; present: string[]; secretary: string }) {
  await as(o.secretary);
  const today = orgToday();
  const step = await db.approvalStep.findFirstOrThrow({ where: { instance: { awardId: o.awardId, status: "PENDING" }, committeeCode: { not: null }, decision: "PENDING" }, orderBy: { sequence: "asc" } });
  ok(await scheduleSitting(FIRST, form({ committeeId: o.committeeId, meetingDate: today, agenda: "The walk's appointment.", items: step.id, tabledByPersonId: o.secretary, [actFieldNames("tabledByPersonId").password]: PASSWORD })), "schedule");
  const tabled = await db.committeeDecision.findFirstOrThrow({ where: { exerciseId: o.exerciseId, outcome: "PENDING", withdrawnAt: null, meeting: { committeeId: o.committeeId } }, include: { meeting: true } });
  ok(await changeStatus(FIRST, form({ meetingId: tabled.meeting.id, to: "IN_PROGRESS" })), "start the sitting");
  for (const p of o.present) ok(await recordAttendance(FIRST, form({ meetingId: tabled.meeting.id, personId: p, attended: "yes" })), `attendance of ${p}`);
  for (const p of o.present) {
    await as(p);
    const res = await castVote(
      new Request(`http://localhost/api/committees/decisions/${tabled.id}/votes`, { method: "POST", body: JSON.stringify({ choice: "SETUJU", votedAt: today, password: PASSWORD }), headers: { "content-type": "application/json" } }),
      { params: Promise.resolve({ id: tabled.id }) } as never,
    );
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
  }
  await as(o.secretary);
  ok(await recordOutcome(FIRST, form({ decisionId: tabled.id, outcome: "CARRIED" })), "outcome");
}

/** A work indent awarded on the quotation exercise, approved by the Quotation Committee and the Chief Executive, with its indent number received `receivedDaysAgo` days ago. */
async function approvedIndent(o: { startOn: string; indentNo: string; receivedDaysAgo: number }): Promise<string> {
  await as("demo_p3");
  // The demonstration's indent on this exercise has been issued and nothing has come back: cancelled (with its contract), so the exercise is free for the walk's own.
  const standing = await db.award.findFirst({ where: { exerciseId: "demo_sx13", status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "ACCEPTED"] } } });
  if (standing && standing.id === "demo_aw4") ok(await cancelAward(FIRST, form({ id: standing.id, reason: "Cancelled so the walk can award this exercise itself." })), "cancel the demonstration's indent");
  who.redirected = null;
  const out = await createAward(FIRST, form({ exerciseId: "demo_sx13", awardeeName: "Walk Services Sdn Bhd", awardeeRegistrationNo: "WALK-0002-X", awardeeAddress: "2 Walk Lane", awardedValue: "180000.00", completionPeriod: "8", completionUnit: "WEEKS", startDate: o.startOn }));
  expect(out === undefined ? "redirected" : message(out as never), "createAward (indent)").toBe("redirected");
  const award = await db.award.findFirstOrThrow({ where: { exerciseId: "demo_sx13", status: "DRAFT" } });
  ok(
    await updateAwardTerms(FIRST, form({ id: award.id, startDate: o.startOn, regulatedActivity: "no", bondRequired: "no", bondNotRequiredReason: "Short-form terms, no bond asked.", bondBasisProvenance: "ASSUMED", ladAmount: "100", ladUnit: "per day", dlpMonths: "0", retentionPercent: "5", retentionCapPercent: "5", termsProvenance: "ASSUMED", wcBasis: "PERCENT_OF_CONTRACT" })),
    "terms (indent)",
  );
  ok(await submitAward(FIRST, form({ id: award.id, [PASSWORD_FIELD]: PASSWORD })), "submit (indent)");
  await committeeCarries({ awardId: award.id, exerciseId: "demo_sx13", committeeId: "demo_c2", present: ["demo_p2", "demo_p4"], secretary: "demo_p3" });
  await as("demo_p1");
  const ceo = await db.approvalStep.findFirstOrThrow({ where: { instance: { awardId: award.id, status: "PENDING" }, decision: "PENDING" }, orderBy: { sequence: "asc" } });
  ok(await decideAppointmentStep(FIRST, form({ id: award.id, stepId: ceo.id, decision: "DONE", decidedOn: orgToday(), receivedOn: orgToday(), personId: "demo_p1", [PASSWORD_FIELD]: PASSWORD })), "the Chief Executive's step");
  expect((await db.award.findUniqueOrThrow({ where: { id: award.id } })).status).toBe("APPROVED");
  await as("demo_p3");
  ok(await recordCommitment(FIRST, form({ id: award.id, erpCommitmentNo: o.indentNo, erpCommitmentKind: "INDENT", receivedOn: dayPlus(orgToday(), -o.receivedDaysAgo) })), "the indent number");
  return award.id;
}

describe.skipIf(!PASSWORD)("the award case, from Start the award to Active on site (run by case-walk.db.test.ts)", () => {
  it("Start the award lands on the new case's Award stage, as a draft on the exercise", async () => {
    await as("demo_p3");
    ok(await cancelAward(FIRST, form({ id: "demo_aw1", reason: "Cancelled so the walk can start its own award on this exercise." })), "cancel the demonstration's award");
    who.redirected = null;
    const out = await createAward(
      FIRST,
      form({ exerciseId: "demo_sx10", awardeeName: "Walk Builders Sdn Bhd", awardeeRegistrationNo: "WALK-0001-X", awardeeAddress: "1 Walk Road", awardedValue: "1240000.00", completionPeriod: "18", completionUnit: "MONTHS", startDate: startDay() }),
    );
    expect(out === undefined ? "redirected" : message(out as never), "createAward").toBe("redirected");
    const award = await db.award.findFirstOrThrow({ where: { exerciseId: "demo_sx10", status: "DRAFT" } });
    expect(who.redirected).toBe(`/projects/${award.id}?stage=award`);
    expect(await db.contract.count({ where: { awardId: award.id } })).toBe(0);
    walk.awardId = award.id;
  });

  it("sets the terms and sends the award for approval", async () => {
    ok(await updateAwardTerms(FIRST, form({ id: walk.awardId, startDate: startDay(), regulatedActivity: "no", bondRequired: "yes", bondBasis: "CONTRACT_PRICE", bondPercent: "5", bondValidityExtraMonths: "12", bondBasisProvenance: "ASSUMED", ladAmount: "800", ladUnit: "per day", retentionPercent: "5", retentionCapPercent: "5", dlpMonths: "12", termsProvenance: "ASSUMED", wcBasis: "PERCENT_OF_CONTRACT" })), "terms");
    ok(await submitAward(FIRST, form({ id: walk.awardId, [PASSWORD_FIELD]: PASSWORD })), "submit");
    expect((await db.award.findUniqueOrThrow({ where: { id: walk.awardId } })).status).toBe("PENDING_APPROVAL");
  });

  it("FR-AWD-001: issue is refused to an award not yet approved, and no Contract is made (pending, and a draft)", async () => {
    await as("demo_p2");
    const before = await db.contract.count();
    const signed = { signatoryPersonId: "demo_p2", signedOn: orgToday(), [actFieldNames("signatoryPersonId").password]: PASSWORD };
    expect(refusal(await issueAward(FIRST, form({ id: walk.awardId, ...signed })))).toMatch(/Not issued/);
    // The demonstration's draft award, on another exercise.
    expect(refusal(await issueAward(FIRST, form({ id: "demo_aw7", ...signed })))).toMatch(/Not issued/);
    expect(await db.contract.count()).toBe(before);
    expect((await db.award.findUniqueOrThrow({ where: { id: walk.awardId } })).status).toBe("PENDING_APPROVAL");
    expect((await db.award.findUniqueOrThrow({ where: { id: "demo_aw7" } })).status).toBe("DRAFT");
  });

  it("FR-AWD-001: the Tender Board sits and carries it, and its decision approves the award", async () => {
    await as("demo_p3");
    // The demonstration's earlier matter on this exercise was tabled at a sitting still open, for the award just cancelled: deferred, with its note, so this award's own route is tabled afresh.
    ok(await recordOutcome(FIRST, form({ decisionId: "demo_d10", outcome: "DEFERRED", outcomeNote: "Tabled for the award cancelled at the start of the walk." })), "defer the earlier matter");
    await committeeCarries({ awardId: walk.awardId, exerciseId: "demo_sx10", committeeId: "demo_c1", present: ["demo_p1", "demo_p2", "demo_p7"], secretary: "demo_p3" });
    expect((await db.award.findUniqueOrThrow({ where: { id: walk.awardId } })).status).toBe("APPROVED");
    expect(await stageOf()).toEqual({ kind: "LIVE", stage: "AWARDING" });
  });

  it("FR-AWD-002: only the signatory the matrix names can sign the letter; the Chief Executive and an officer with no office are refused", async () => {
    const before = await db.contract.count({ where: { awardId: walk.awardId } });
    for (const p of ["demo_p1", "demo_p3"]) {
      await as(p);
      refusal(await issueAward(FIRST, form({ id: walk.awardId, signatoryPersonId: p, signedOn: orgToday(), [actFieldNames("signatoryPersonId").password]: PASSWORD })));
    }
    expect(await db.contract.count({ where: { awardId: walk.awardId } })).toBe(before);
    expect((await db.award.findUniqueOrThrow({ where: { id: walk.awardId } })).status).toBe("APPROVED");
  });

  it("FR-CON-002 and FR-CON-001: issue makes the contract with its number from the series, and hands the case from the pre-contract section to the post-contract section", async () => {
    await as("demo_p2");
    expect(await db.contract.count({ where: { awardId: walk.awardId } })).toBe(0);
    const total = await db.contract.count();
    ok(await issueAward(FIRST, form({ id: walk.awardId, signatoryPersonId: "demo_p2", signedOn: orgToday(), [actFieldNames("signatoryPersonId").password]: PASSWORD })), "issue");
    expect(await db.contract.count()).toBe(total + 1);
    const contract = await db.contract.findFirstOrThrow({ where: { awardId: walk.awardId } });
    walk.contractId = contract.id;
    expect(contract.numberSource).toBe("SERIES");
    expect(contract.number).toMatch(/^DEMO\/KP\/T\/\d{3}\/\d{4}$/);
    expect((await db.award.findUniqueOrThrow({ where: { id: walk.awardId } })).status).toBe("ISSUED");
    const handover = await db.caseOwnershipEvent.findFirstOrThrow({ where: { contractId: contract.id } });
    expect([handover.fromUnitCode, handover.toUnitCode]).toEqual(["CP-PRE", "CP-POST"]);
  });

  it("FR-AWD-014: a condition precedent is added from the configured kinds, copies its no-extension flag, and is met on a day", async () => {
    await as("demo_p3");
    ok(await addCondition(FIRST, form({ id: walk.awardId, kindId: "demo_cpk1", reference: "WALK-SWMS", requiredBy: startDay(), note: "" })), "add");
    const condition = await db.awardCondition.findFirstOrThrow({ where: { awardId: walk.awardId } });
    expect(condition.excludesEot).toBe(true);
    expect(condition.satisfiedOn).toBeNull();
    ok(await satisfyCondition(FIRST, form({ id: walk.awardId, conditionId: condition.id, satisfiedOn: orgToday() })), "satisfy");
    expect((await db.awardCondition.findUniqueOrThrow({ where: { id: condition.id } })).satisfiedOn).not.toBeNull();
  });

  it("FR-AWD-005 and FR-AWD-004: a despatch needs its method and reference and cannot be acknowledged before it went; each copy sent is logged with its own audit row", async () => {
    await as("demo_p3");
    const today = orgToday();
    const rows = await db.awardDistribution.findMany({ where: { awardId: walk.awardId }, orderBy: { sortOrder: "asc" } });
    expect(rows.length).toBeGreaterThan(1);
    // Registered post names its consignment; an acknowledgement cannot be before the despatch.
    expect(JSON.stringify(await recordDespatch(FIRST, form({ id: walk.awardId, distributionId: rows[0].id, method: "REGISTERED_POST", despatchedOn: today, note: "" })))).toContain("consignmentRef");
    expect(JSON.stringify(await recordDespatch(FIRST, form({ id: walk.awardId, distributionId: rows[0].id, method: "BY_HAND", despatchedOn: today, acknowledgedOn: dayPlus(today, -1), note: "" })))).toContain("acknowledgedOn");
    expect(await db.awardDistribution.count({ where: { awardId: walk.awardId, despatchedOn: { not: null } } })).toBe(0);
    for (const row of rows) ok(await recordDespatch(FIRST, form({ id: walk.awardId, distributionId: row.id, method: "BY_HAND", despatchedOn: today, acknowledgedOn: today, note: "" })), `copy to ${row.recipientName}`);
    expect(await db.awardDistribution.count({ where: { awardId: walk.awardId, despatchedOn: null } })).toBe(0);
    for (const row of rows) expect(await db.auditEntry.count({ where: { entity: "AwardDistribution", entityId: row.id, action: "UPDATE" } }), row.recipientName).toBe(1);
  });

  it("FR-AWD-008: the contractor's identity-card number is SULIT; an officer it is closed to cannot record the return, and nothing is written", async () => {
    await as("demo_p9");
    const words = refusal(await recordReturn(FIRST, form({ id: walk.awardId, signedLetterReceivedOn: orgToday(), signatoryName: "Walk Director", icNumber: "900101-14-5678", [PASSWORD_FIELD]: PASSWORD })));
    expect(words).toMatch(/SULIT/);
    const ret = await db.awardReturn.findFirstOrThrow({ where: { awardId: walk.awardId } });
    expect(ret.icNumber).toBe("");
    expect(ret.signedLetterReceivedOn).toBeNull();
  });

  it("FR-AWD-003 and FR-AWD-008: the return is recorded, and the award is accepted only once every paper received has its scan", async () => {
    await as("demo_p3");
    const today = orgToday();
    ok(
      await recordReturn(
        FIRST,
        form({
          id: walk.awardId, signedLetterReceivedOn: today, declarationReceivedOn: today, authorisationReceivedOn: today, whereHeld: "Procurement registry", signatoryName: "Walk Director", icNumber: "900101-14-5678",
          occupation: "Director", address: "1 Walk Road", capacity: "Director", contractorSigned: "yes", stampAffixed: "yes", witnessName: "Walk Witness", witnessSigned: "yes", [PASSWORD_FIELD]: PASSWORD,
        }),
      ),
      "return",
    );
    expect((await db.award.findUniqueOrThrow({ where: { id: walk.awardId } })).status).toBe("ISSUED");
    const purposes = ["SIGNED_LETTER", "DECLARATION", "AUTHORISATION"] as const;
    for (const [i, purpose] of purposes.entries()) {
      ok(await attachDocument(FIRST, form({ ownerKind: "award", ownerId: walk.awardId, purpose, versionId: await storedScan(`Walk ${purpose}`) })), `scan ${purpose}`);
      expect((await db.award.findUniqueOrThrow({ where: { id: walk.awardId } })).status, `after ${purpose}`).toBe(i === purposes.length - 1 ? "ACCEPTED" : "ISSUED");
    }
    expect(await stageOf()).toEqual({ kind: "LIVE", stage: "SIGNING" });
  });

  it("FR-AWD-012 (AC-21): a bond cannot be lodged before the letter is issued; an undersized bond is refused at verification and rejected with its reason; the right bond is verified", async () => {
    await as("demo_p3");
    const today = orgToday();
    const issuer = await db.approvedIssuer.findFirstOrThrow({ where: { organisationId: (who.actor as StaffActor).organisationId } });
    const expiry = completionDay(startDay(), 36, "MONTHS");
    const bond = (id: string, ref: string, value: string) => form({ id, kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", issuerId: issuer.id, issuerNameAsWritten: issuer.name, instrumentRef: ref, value, effectiveFrom: today, expiresOn: expiry, lodgedOn: today });
    // The demonstration's approved award has no contract yet.
    expect(refusal(await lodgeSecurity(FIRST, bond("demo_aw2", "WALK-BG-EARLY", "82500.00")))).toMatch(/contract/i);
    ok(await lodgeSecurity(FIRST, bond(walk.awardId, "WALK-BG-SMALL", "1000.00")), "lodge the small bond");
    const small = await db.securityInstrument.findFirstOrThrow({ where: { contractId: walk.contractId, instrumentRef: "WALK-BG-SMALL" } });
    await as("demo_p5");
    expect(refusal(await reviewSecurity(FIRST, form({ id: walk.awardId, securityId: small.id, outcome: "VERIFIED", on: today, personId: "demo_p5", [PASSWORD_FIELD]: PASSWORD })))).toMatch(/Not verified/);
    expect((await db.securityInstrument.findUniqueOrThrow({ where: { id: small.id } })).status).toBe("LODGED");
    ok(await reviewSecurity(FIRST, form({ id: walk.awardId, securityId: small.id, outcome: "REJECTED", reason: "Below the bond the award requires.", on: today, personId: "demo_p5", [PASSWORD_FIELD]: PASSWORD })), "reject");
    await as("demo_p3");
    ok(await lodgeSecurity(FIRST, bond(walk.awardId, "WALK-BG-001", "62000.00")), "lodge the bond");
    const good = await db.securityInstrument.findFirstOrThrow({ where: { contractId: walk.contractId, instrumentRef: "WALK-BG-001" } });
    await as("demo_p5");
    ok(await reviewSecurity(FIRST, form({ id: walk.awardId, securityId: good.id, outcome: "VERIFIED", on: today, personId: "demo_p5", [PASSWORD_FIELD]: PASSWORD })), "verify");
    expect((await db.securityInstrument.findUniqueOrThrow({ where: { id: good.id } })).status).toBe("VERIFIED");
  });

  it("starts preparing the contract", async () => {
    await as("demo_p3");
    ok(await startPreparation(FIRST, form({ id: walk.contractId })), "start");
    expect((await db.contract.findUniqueOrThrow({ where: { id: walk.contractId } })).status).toBe("IN_PREPARATION");
  });

  it("completes the formation checks and reconciliations, and sends the contract to the legal office", async () => {
    await as("demo_p3", { sulit: true });
    const today = orgToday();
    const checks = await db.formationCheck.findMany({ where: { contractId: walk.contractId } });
    for (const c of checks) {
      if (c.kind === "FRONT_LOADING") ok(await addRate(FIRST, form({ id: walk.contractId, checkId: c.id, itemRef: "A1", description: "Earthworks", tenderedRate: "90.00", estimateRate: "100.00" })), "rate");
      ok(await completeCheck(FIRST, form({ id: walk.contractId, checkId: c.id, completedOn: today, note: "Checked in the walk.", personId: "demo_p3", [PASSWORD_FIELD]: PASSWORD })), c.kind);
    }
    for (const comparison of ["TENDER_DOCUMENT", "TENDER_TABLE_DOCUMENT", "DRAWINGS"]) {
      ok(await recordReconciliation(FIRST, form({ id: walk.contractId, comparison, outcome: "MATCHES", checkedOn: today, note: "", personId: "demo_p3", [PASSWORD_FIELD]: PASSWORD })), comparison);
    }
    ok(await attachDocument(FIRST, form({ ownerKind: "contract", ownerId: walk.contractId, purpose: "LEGAL_SUBMISSION", versionId: await storedScan("Walk legal submission") })), "legal submission");
    ok(await submitLegal(FIRST, form({ id: walk.contractId, personId: "demo_p3", [PASSWORD_FIELD]: PASSWORD })), "submit to legal");
    expect((await db.contract.findUniqueOrThrow({ where: { id: walk.contractId } })).status).toBe("PENDING_LEGAL_ENDORSEMENT");
  });

  it("the legal office endorses the contract", async () => {
    await as("demo_p5");
    ok(await decideLegal(FIRST, form({ id: walk.contractId, decision: "ENDORSED", decidedOn: orgToday(), comments: "Endorsed in the walk.", reviewerPersonId: "demo_p5", [actFieldNames("reviewerPersonId").password]: PASSWORD })), "endorse");
    expect((await db.contract.findUniqueOrThrow({ where: { id: walk.contractId } })).status).toBe("LEGALLY_ENDORSED");
  });

  it("FR-AWD-013: an undersized policy is refused at verification and rejected with its reason; the three required policies are verified", async () => {
    const today = orgToday();
    await as("demo_p3");
    const issuer = await db.approvedIssuer.findFirstOrThrow({ where: { organisationId: (who.actor as StaffActor).organisationId } });
    const base = { issuerId: issuer.id, issuerNameAsWritten: issuer.name, periodStart: today, periodEnd: completionDay(startDay(), 48, "MONTHS"), lodgedOn: today };
    ok(await lodgePolicy(FIRST, form({ id: walk.awardId, kind: "WORKS", sumInsured: "100.00", policyNo: "WALK-WORKS-SMALL", ...base })), "lodge the small policy");
    const small = await db.insurancePolicy.findFirstOrThrow({ where: { contractId: walk.contractId, policyNo: "WALK-WORKS-SMALL" } });
    await as("demo_p5");
    expect(refusal(await reviewPolicy(FIRST, form({ id: walk.awardId, policyId: small.id, outcome: "VERIFIED", on: today, personId: "demo_p5", [PASSWORD_FIELD]: PASSWORD })))).toMatch(/Not verified/);
    ok(await reviewPolicy(FIRST, form({ id: walk.awardId, policyId: small.id, outcome: "REJECTED", reason: "Below the sum the contract needs.", on: today, personId: "demo_p5", [PASSWORD_FIELD]: PASSWORD })), "reject");
    const policies: Record<string, string>[] = [
      { kind: "WORKS", sumInsured: "1240000.00" },
      { kind: "PUBLIC_LIABILITY", sumInsured: "150000.00" },
      { kind: "WORKMENS_COMPENSATION", sumInsured: "124000.00", premiumReceiptRef: "WALK-PR-1", perkesoRegistrationNo: "WALK-PK-1" },
    ];
    for (const p of policies) {
      await as("demo_p3");
      ok(await lodgePolicy(FIRST, form({ id: walk.awardId, policyNo: `WALK-${p.kind}`, ...base, ...p })), `lodge ${p.kind}`);
      const row = await db.insurancePolicy.findFirstOrThrow({ where: { contractId: walk.contractId, policyNo: `WALK-${p.kind}` } });
      await as("demo_p5");
      ok(await reviewPolicy(FIRST, form({ id: walk.awardId, policyId: row.id, outcome: "VERIFIED", on: today, personId: "demo_p5", [PASSWORD_FIELD]: PASSWORD })), `verify ${p.kind}`);
    }
  });

  it("enters the baseline values the award does not state", async () => {
    await as("demo_p3", { sulit: true });
    const groups: Record<string, Record<string, string>> = {
      sums: { pcSums: "0.00", provisionalSums: "50000.00" },
      honourDays: { days: "30" },
      subsequentInterim: { amount: "50000.00" },
      sectional: { sectionalApplies: "no" },
    };
    for (const [group, fields] of Object.entries(groups)) ok(await saveBaselineEntry(FIRST, form({ id: walk.contractId, group, provenance: "ASSUMED", note: "Entered in the walk.", ...fields })), group);
  });

  it("the contractor signs, then the employer's signatory signs, and the contract is executed", async () => {
    await as("demo_p3", { sulit: true });
    ok(await attachDocument(FIRST, form({ ownerKind: "contract", ownerId: walk.contractId, purpose: "COMPANY_RESOLUTION", versionId: await storedScan("Walk company resolution") })), "resolution");
    ok(await recordContractorSignature(FIRST, form({ id: walk.contractId, name: "Walk Director", icNumber: "900101-14-5678", capacity: "Director", signedOn: orgToday(), witnessName: "Walk Witness", witnessIcNumber: "880202-10-1234" })), "contractor");
    await as("demo_p1");
    ok(await recordRsajSignature(FIRST, form({ id: walk.contractId, personId: "demo_p1", [PASSWORD_FIELD]: PASSWORD })), "employer");
    expect((await db.contract.findUniqueOrThrow({ where: { id: walk.contractId } })).status).toBe("EXECUTED");
  });

  it("records the stamping, then possession of site, and the case is on site", async () => {
    await as("demo_p3");
    const today = orgToday();
    ok(await recordStamping(FIRST, form({ id: walk.contractId, stampedOn: today, stampingRef: "WALK-STAMP-001" })), "stamp");
    expect((await db.contract.findUniqueOrThrow({ where: { id: walk.contractId } })).status).toBe("STAMPED");
    expect(await stageOf()).toEqual({ kind: "LIVE", stage: "SIGNING" });
    await as("demo_p2");
    ok(await recordPossession(FIRST, form({ id: walk.contractId, possessionOn: today, note: "Site handed over in the walk.", personId: "demo_p2", [PASSWORD_FIELD]: PASSWORD })), "possession");
    expect((await db.contract.findUniqueOrThrow({ where: { id: walk.contractId } })).status).toBe("ACTIVE");
    expect(await stageOf()).toEqual({ kind: "LIVE", stage: "ON_SITE" });
  });
});

describe.skipIf(!PASSWORD)("a work indent: expiry, the contract number, and late commencement (run by case-walk.db.test.ts)", () => {
  const indent = { awardId: "" };

  it("FR-AWD-006: an indent received 15 days ago (14 days' validity) has expired, and issue is refused with no Contract made", async () => {
    indent.awardId = await approvedIndent({ startOn: dayPlus(orgToday(), -8), indentNo: "XI202699001", receivedDaysAgo: 15 });
    await as("demo_p9");
    const total = await db.contract.count();
    const words = refusal(await issueAward(FIRST, form({ id: indent.awardId, signatoryPersonId: "demo_p9", signedOn: orgToday(), [actFieldNames("signatoryPersonId").password]: PASSWORD })));
    expect(words).toMatch(/Not issued/);
    expect(words).toMatch(/expired/i);
    // Expiry is the only thing in the way: the terms, the approvals and the number are all in order.
    expect(words).not.toMatch(/retention|not recorded/i);
    expect(await db.contract.count()).toBe(total);
  });

  it("FR-AWD-006 and FR-CON-002: received exactly 14 days ago it is valid that day; issue makes the contract numbered by the indent's own number", async () => {
    await as("demo_p3");
    ok(await cancelAward(FIRST, form({ id: indent.awardId, reason: "Re-awarded with the indent number received on its last valid day." })), "cancel the expired indent");
    indent.awardId = await approvedIndent({ startOn: dayPlus(orgToday(), -8), indentNo: "XI202699002", receivedDaysAgo: 14 });
    await as("demo_p9");
    ok(await issueAward(FIRST, form({ id: indent.awardId, signatoryPersonId: "demo_p9", signedOn: orgToday(), [actFieldNames("signatoryPersonId").password]: PASSWORD })), "issue");
    const contract = await db.contract.findFirstOrThrow({ where: { awardId: indent.awardId } });
    expect(contract.number).toBe("XI202699002");
    expect(contract.numberSource).toBe("INDENT_NUMBER");
  });

  it("FR-AWD-009: commencement that is late past the grace period is shown with its consequence, and recording it moves the case on site", async () => {
    await as("demo_p3");
    const actor = who.actor as StaffActor;
    const read = async () => {
      const l = (await loadAward(actor.organisationId, indent.awardId))!;
      return evaluateAward((await awardFacts(l)).facts);
    };
    const late = await read();
    expect(late.commencement).toMatchObject({ state: "LATE" });
    expect(late.consequence).not.toBeNull();
    const award = await db.award.findUniqueOrThrow({ where: { id: indent.awardId } });
    expect(award.commencedOn).toBeNull();
    ok(await recordCommencement(FIRST, form({ id: indent.awardId, commencedOn: orgToday() })), "commencement");
    expect((await read()).commencement).not.toMatchObject({ state: "LATE" });
    const a = await db.award.findUniqueOrThrow({ where: { id: indent.awardId }, include: { contract: { select: { status: true } } } });
    expect(caseStage({ award: { status: a.status as AwardStatus, instrumentKind: a.instrumentKind as InstrumentKind }, contract: { status: a.contract!.status as ContractStatus }, commencement: { commencedOn: storedDay(a.commencedOn!) } })).toEqual({ kind: "LIVE", stage: "ON_SITE" });
  });
});

describe.skipIf(!PASSWORD)("the evaluation's recommendation is SULIT (run by case-walk.db.test.ts)", () => {
  it("FR-EVL-014: an officer the recommendation is closed to cannot open, change or send the award judged against it, and the refusal is logged; one the organisation has granted can", async () => {
    // The demonstration's draft award stands on an evaluated exercise; nobody is named on it.
    const draft = await db.award.findUniqueOrThrow({ where: { id: "demo_aw7" } });
    const details = () => form({ id: draft.id, awardeeName: draft.awardeeName, awardeeRegistrationNo: draft.awardeeRegistrationNo, awardeeAddress: draft.awardeeAddress, awardedValue: draft.awardedValue.toString(), completionPeriod: String(draft.completionPeriod), completionUnit: draft.completionUnit });
    const refused = () => db.sulitAccessEvent.count({ where: { scope: "evaluation", entityId: draft.exerciseId, outcome: "WITHHELD", actorPersonId: "demo_p9" } });
    await as("demo_p9");
    const before = await refused();
    expect(refusal(await updateAwardDetails(FIRST, details()))).toMatch(/SULIT/);
    expect(refusal(await submitAward(FIRST, form({ id: draft.id, [PASSWORD_FIELD]: PASSWORD })))).toMatch(/SULIT/);
    expect(await refused()).toBe(before + 2);
    expect((await db.award.findUniqueOrThrow({ where: { id: draft.id } })).updatedAt).toEqual(draft.updatedAt);
    // The same officer, once the organisation has granted the organisation-wide reading: the edit goes through.
    await as("demo_p9", { sulit: true });
    ok(await updateAwardDetails(FIRST, details()), "the granted officer's edit");
  });
});
