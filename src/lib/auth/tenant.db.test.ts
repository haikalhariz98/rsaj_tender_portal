// Phase 5b (the plan's 5b line, decisions log 2026-10-09): the editors of Configuration, Users and roles are proposals now (`actions.ts`), and run in `core.ts` when a second person applies the change.
// This file tests the editors themselves, so it calls `core.ts`; `src/app/configuration/changes/stage.db.test.ts` and `src/lib/auth/edit.db.test.ts` hold the propose-then-apply path.
import { createHash, randomBytes } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdministratorAct } from "@/lib/auth/administration-conflict";
import type { PermissionKey, StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";

/**
 * The cross-organisation suite (ADR 0034 D10, sign-in programme Phase 1c): organisation B's signed-in person, given organisation A's ids,
 * is refused, and A is left exactly as it was. Each act is asked twice as B: once with A's record and once with an id that exists nowhere,
 * and the two answers must be the same, so another organisation's record is indistinguishable from one that does not exist ("no longer
 * exists"). The loaders the pages read through are asked as A (who sees the record: the fixture is real) and as B (who sees nothing).
 *
 * What it covers is listed in `COVERED` below, and the decisions log records it. It does not yet cover every action: until it does, the
 * supported deployment is one organisation per database (ADR 0034 D10's go-live condition).
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const { administrationConflict } = await import("@/lib/auth/administration-conflict");
  const base = actorModule();
  return {
    ...base,
    currentStaffOrNull: async () => who.actor,
    requireStaff: async () => {
      if (!who.actor) throw new Error("no actor set");
      return who.actor;
    },
    // The two wrappers an action asks first (Phase 2a and its review), judged on whoever is signed in as the real ones are.
    staffForAct: async (act: AdministratorAct) => {
      if (!who.actor) throw new Error("no actor set");
      const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: who.actor.isAdministrator });
      return fault ? { ok: false as const, state: { ok: false as const, message: fault.en } } : { ok: true as const, actor: who.actor };
    },
    staffForPermission: async (key: PermissionKey) => {
      if (!who.actor) throw new Error("no actor set");
      return who.actor.permissions.has(key) ? { ok: true as const, actor: who.actor } : { ok: false as const, state: { ok: false as const, message: `Not permitted: ${key}` } };
    },
  };
});
vi.mock("@/app/_auth/route", async () => ({
  refusalResponse: (code: string) => Response.json({ ok: false, code }, { status: 403 }),
  staffRoute: async () => (who.actor ? { ok: true as const, actor: who.actor } : { ok: false as const, response: Response.json({}, { status: 401 }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirected to ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));

// ------------------------------------------------------------------ the fixture

/**
 * Two organisations for the cross-organisation suite (this suite, ADR 0034 D10). It lives in the test file, where the source scans that list every writer of a table do not count it. Organisation A holds one record of
 * each kind the suite reaches for; organisation B holds only the person who asks. Every row has a stable id and is made only if it is not
 * there yet, so the suite can be run again on the same scratch database, and nothing is ever deleted: the audit trail's rows that name these
 * organisations are permanent from Phase 1d, as the scratch database's other test organisations already are.
 */

const TENANT_A = "TENANT_A";
const TENANT_B = "TENANT_B";

/// Organisation A's records, by stable id.
const A = {
  person: "tna_person",
  requisition: "tna_req",
  exercise: "tna_ex",
  participant: "tna_part",
  bqVersion: "tna_bq",
  award: "tna_award",
  contract: "tna_contract",
  committee: "tna_committee",
  member: "tna_member",
  meeting: "tna_meeting",
  decision: "tna_decision",
  route: "tna_route",
  step: "tna_step",
  assignment: "tna_assignment",
  supplier: "tna_supplier",
  matrix: "tna_matrix",
  rule: "tna_rule",
  ruleStep: "tna_rulestep",
  documentClass: "tna_docclass",
  document: "tna_document",
  version: "tna_version",
} as const;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function organisation(code: string) {
  return db.organisation.upsert({ where: { code }, update: {}, create: { code, name: `Tenant test organisation ${code.slice(-1)}`, timeZone: "Asia/Kuala_Lumpur" } });
}

/// Make each row once (by its id); an existing row is left as it is.
async function once<T>(find: () => Promise<T | null>, make: () => Promise<T>): Promise<T> {
  return (await find()) ?? make();
}

async function tenantFixture() {
  const a = await organisation(TENANT_A);
  const b = await organisation(TENANT_B);
  const orgA = a.id;

  await once(() => db.person.findUnique({ where: { id: A.person } }), () => db.person.create({ data: { id: A.person, organisationId: orgA, name: "Tenant A Officer" } }));
  const bPerson = await once(() => db.person.findUnique({ where: { id: "tnb_person" } }), () => db.person.create({ data: { id: "tnb_person", organisationId: b.id, name: "Tenant B Officer" } }));

  await once(
    () => db.requisition.findUnique({ where: { id: A.requisition } }),
    () =>
      db.requisition.create({
        data: {
          id: A.requisition, organisationId: orgA, reference: "TNA/REQ/1", requestingUnitCode: "TNA_UNIT", requestingPersonId: A.person, title: "Tenant A requisition",
          justification: "For the cross-organisation suite.", needStatement: "None.", costCentreCode: "TNA_CC", accountCode: "TNA_AC", placeOfDelivery: "Nowhere",
          dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"),
        },
      }),
  );
  await once(
    () => db.sourcingExercise.findUnique({ where: { id: A.exercise } }),
    () => db.sourcingExercise.create({ data: { id: A.exercise, organisationId: orgA, reference: "TNA/EX/1", requisitionId: A.requisition, title: "Tenant A exercise", estimatedValue: "1000.00", sourcingMethodCode: "TNA_METHOD" } }),
  );
  await once(() => db.exerciseParticipant.findUnique({ where: { id: A.participant } }), () => db.exerciseParticipant.create({ data: { id: A.participant, exerciseId: A.exercise, personId: A.person } }));
  await once(() => db.bqVersion.findUnique({ where: { id: A.bqVersion } }), () => db.bqVersion.create({ data: { id: A.bqVersion, organisationId: orgA, exerciseId: A.exercise, versionNo: 1 } }));
  await once(
    () => db.award.findUnique({ where: { id: A.award } }),
    () => db.award.create({ data: { id: A.award, organisationId: orgA, reference: "TNA/AW/1", exerciseId: A.exercise, instrumentKind: "WORK_INDENT", awardeeName: "Tenant A Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS" } }),
  );
  await once(
    () => db.contract.findUnique({ where: { id: A.contract } }),
    () => db.contract.create({ data: { id: A.contract, organisationId: orgA, number: "TNA/CON/1", numberSource: "SERIES", numberedOn: day("2026-10-02"), awardId: A.award, contractSum: "1000.00" } }),
  );

  await once(
    () => db.committee.findUnique({ where: { id: A.committee } }),
    () => db.committee.create({ data: { id: A.committee, organisationId: orgA, code: "TNA_COMMITTEE", nameEn: "Tenant A committee", mandate: "Tests.", governingSource: "None." } }),
  );
  await once(() => db.committeeMember.findUnique({ where: { id: A.member } }), () => db.committeeMember.create({ data: { id: A.member, committeeId: A.committee, personId: A.person, effectiveFrom: day("2026-01-01") } }));
  await once(() => db.meeting.findUnique({ where: { id: A.meeting } }), () => db.meeting.create({ data: { id: A.meeting, committeeId: A.committee, reference: "TNA/MT/1", meetingDate: day("2026-10-05") } }));
  await once(() => db.committeeDecision.findUnique({ where: { id: A.decision } }), () => db.committeeDecision.create({ data: { id: A.decision, meetingId: A.meeting, domain: "requisition", subject: "Tenant A matter" } }));

  await once(
    () => db.approvalInstance.findUnique({ where: { id: A.route } }),
    () => db.approvalInstance.create({ data: { id: A.route, organisationId: orgA, matterKind: "REQUISITION", domain: "requisition", requisitionId: A.requisition, value: "1000.00", openedAt: new Date("2026-10-03T02:00:00Z") } }),
  );
  await once(() => db.approvalStep.findUnique({ where: { id: A.step } }), () => db.approvalStep.create({ data: { id: A.step, instanceId: A.route, sequence: 1, roleLabel: "Tenant A office", act: "A" } }));
  await once(() => db.roleAssignment.findUnique({ where: { id: A.assignment } }), () => db.roleAssignment.create({ data: { id: A.assignment, personId: A.person, roleCode: "TNA_OFFICE", effectiveFrom: day("2026-01-01") } }));

  await once(
    () => db.supplier.findUnique({ where: { id: A.supplier } }),
    () =>
      db.supplier.create({
        data: { id: A.supplier, organisationId: orgA, reference: "TNA/V/1", registeredName: "Tenant A Supplier Sdn Bhd", registrationNo: "TNA-1", registrationNoKey: "TNA1", entityTypeCode: "TNA_TYPE", countryCode: "my", registeredAddress: "Nowhere", companyEmail: "tenant-a@example.invalid" },
      }),
  );

  await once(
    () => db.authorityMatrix.findUnique({ where: { id: A.matrix } }),
    () => db.authorityMatrix.create({ data: { id: A.matrix, organisationId: orgA, label: "Tenant A draft", effectiveFrom: day("2027-01-01"), boundaryValue: "0.00", quotationFloor: "0.00", tenderFloor: "0.00", requisitionBoundary: "0.00" } }),
  );
  await once(() => db.authorityRule.findUnique({ where: { id: A.rule } }), () => db.authorityRule.create({ data: { id: A.rule, authorityMatrixId: A.matrix, ruleKey: "tna_rule", domain: "requisition", labelEn: "Tenant A rule", clause: "1" } }));
  await once(() => db.authorityRuleStep.findUnique({ where: { id: A.ruleStep } }), () => db.authorityRuleStep.create({ data: { id: A.ruleStep, authorityRuleId: A.rule, roleCode: "TNA_OFFICE", act: "R" } }));

  const bytes = Buffer.from("tenant A's document");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await once(() => db.documentClass.findUnique({ where: { id: A.documentClass } }), () => db.documentClass.create({ data: { id: A.documentClass, organisationId: orgA, code: "TNA_CLASS", nameEn: "Tenant A class" } }));
  await once(() => db.document.findUnique({ where: { id: A.document } }), () => db.document.create({ data: { id: A.document, organisationId: orgA, title: "Tenant A document", documentClassId: A.documentClass, retentionSnapshot: {} } }));
  await once(() => db.blobContent.findUnique({ where: { organisationId_sha256: { organisationId: orgA, sha256 } } }), () => db.blobContent.create({ data: { organisationId: orgA, sha256, byteSize: BigInt(bytes.length), bytes } }));
  await once(
    () => db.documentVersion.findUnique({ where: { id: A.version } }),
    () => db.documentVersion.create({ data: { id: A.version, organisationId: orgA, documentId: A.document, versionNo: 1, sha256, byteSize: BigInt(bytes.length), mediaType: "text/plain", originalFilename: "tenant-a.txt", recordedByPersonId: A.person } }),
  );

  return { a, b, actorA: actorOf(a, A.person, "Tenant A Officer"), actorB: actorOf(b, bPerson.id, bPerson.name) };
}

function actorOf(org: { id: string; code: string; timeZone: string | null }, personId: string, personName: string): StaffActor {
  return {
    kind: "STAFF",
    accountId: "",
    sessionId: "",
    personId,
    personName,
    jobTitle: null,
    // Not an administrator, with the permission to draft configuration (review of Phase 2a): an administrator is refused the acts of an office holder
    // (the approval step this test escalates), and a configuration editor is refused without the permission, before either reaches the isolation
    // check this test is about. Each of these actions would otherwise refuse before ever being asked about organisation B.
    isAdministrator: false,
    organisationId: org.id,
    organisationCode: org.code,
    organisationTimeZone: org.timeZone,
    offices: [],
    permissions: new Set<PermissionKey>(["configuration.draft", "configuration.issue"]),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: null,
    mustChangePassword: false,
  };
}

/// What organisation A's records look like now: the trail's length and each record's own state. A refusal leaves both as they were.
async function snapshotA(organisationId: string) {
  const [audits, req, ex, part, award, contract, meeting, decision, step, assignment, member, supplier, matrix, ruleStep, version] = await Promise.all([
    db.auditEntry.count({ where: { organisationId } }),
    db.requisition.findUnique({ where: { id: A.requisition } }),
    db.sourcingExercise.findUnique({ where: { id: A.exercise } }),
    db.exerciseParticipant.findUnique({ where: { id: A.participant } }),
    db.award.findUnique({ where: { id: A.award } }),
    db.contract.findUnique({ where: { id: A.contract } }),
    db.meeting.findUnique({ where: { id: A.meeting } }),
    db.committeeDecision.findUnique({ where: { id: A.decision } }),
    db.approvalStep.findUnique({ where: { id: A.step } }),
    db.roleAssignment.findUnique({ where: { id: A.assignment } }),
    db.committeeMember.findUnique({ where: { id: A.member } }),
    db.supplier.findUnique({ where: { id: A.supplier } }),
    db.authorityMatrix.findUnique({ where: { id: A.matrix } }),
    db.authorityRuleStep.findUnique({ where: { id: A.ruleStep } }),
    db.documentVersion.findUnique({ where: { id: A.version } }),
  ]);
  return JSON.stringify({ audits, req, ex, part, award, contract, meeting, decision, step, assignment, member, supplier, matrix, ruleStep, version }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

// ------------------------------------------------------------------ the suite

let fx: Awaited<ReturnType<typeof tenantFixture>>;

beforeAll(async () => {
  fx = await tenantFixture();
});
beforeEach(() => {
  who.actor = fx.actorB;
});

const missing = () => `tnx_${randomBytes(6).toString("hex")}`;
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

/// Asks the act as organisation B with A's id and with an id that exists nowhere: the same refusal, and A unchanged.
async function refusedAsIfMissing(act: (id: string) => Promise<unknown>, id: string) {
  const before = await snapshotA(fx.a.id);
  const withA = await act(id);
  const withNothing = await act(missing());
  expect(withA).toEqual(withNothing);
  expect(withA).toMatchObject({ ok: false });
  expect(await snapshotA(fx.a.id)).toBe(before);
  return withA;
}

/// The acts and readers this suite covers. Recorded in the decisions log; anything not here is not yet proven isolated.
export const COVERED = [
  "requisitions/actions cancelRequisition (withLockedRequisition)",
  "sourcing/actions removeParticipant (withLockedRequisitionForSourcing; ExerciseParticipant)",
  "sourcing/[id]/scope/actions startBq (withLockedExerciseScope)",
  "awards/actions cancelAward (withLockedAward)",
  "projects/[id]/actions recordBriefing (withLockedContract)",
  "committees/actions changeStatus (withLockedSitting)",
  "committees/actions withdrawMatter (CommitteeDecision through its sitting's committee)",
  "suppliers/actions setErpVendorCode (withLockedSupplier)",
  "documents/actions withdrawVersion (DocumentVersion)",
  "approvals/actions escalateStep (ApprovalStep through its route)",
  "configuration/users/actions endAssignment (RoleAssignment through its person)",
  "configuration/committees/actions vacateSeat (CommitteeMember through its committee)",
  "configuration/approval-matrix/actions discardDraft (AuthorityMatrix)",
  "configuration/approval-matrix/actions removeRecommender (AuthorityRuleStep through its rule's issue)",
  "api/committees/decisions/[id]/votes POST",
  "api/documents/versions/[id] GET",
  "api/authority/resolve GET (org= naming another organisation)",
  "loaders: loadRequisition, loadExercise, loadAward, loadContract, loadSupplier, loadSitting, readOwner, documentDrawer, windowColumns, tablingAmount, listRequisitions",
] as const;

describe("organisation B's person, given organisation A's ids, is refused as if they did not exist, and A is unchanged", () => {
  it("cancels no requisition of A's", async () => {
    const { cancelRequisition } = await import("@/app/requisitions/actions");
    const r = await refusedAsIfMissing((id) => cancelRequisition({ ok: false }, form({ id, reason: "Cross-organisation test." })), A.requisition);
    expect(r).toMatchObject({ message: "That requisition no longer exists." });
  });

  it("removes no participant from an exercise of A's, nor A's participant from any", async () => {
    const { removeParticipant } = await import("@/app/sourcing/actions");
    await refusedAsIfMissing((id) => removeParticipant({ ok: false }, form({ id, participantId: A.participant, reason: "Cross-organisation test." })), A.exercise);
  });

  it("starts no bill of quantities on an exercise of A's", async () => {
    const { startBq } = await import("@/app/sourcing/[id]/scope/actions");
    await refusedAsIfMissing((id) => startBq({ ok: false }, form({ exerciseId: id })), A.exercise);
  });

  it("cancels no award of A's", async () => {
    const { cancelAward } = await import("@/app/awards/actions");
    const r = await refusedAsIfMissing((id) => cancelAward({ ok: false }, form({ id, reason: "Cross-organisation test." })), A.award);
    expect(r).toMatchObject({ message: "That award no longer exists." });
  });

  it("records no briefing on a contract of A's", async () => {
    const { recordBriefing } = await import("@/app/projects/[id]/actions");
    const r = await refusedAsIfMissing((id) => recordBriefing({ ok: false }, form({ id, heldOn: "2026-10-05", contractorAttendees: "Someone", note: "" })), A.contract);
    expect(r).toMatchObject({ message: "That contract no longer exists." });
  });

  it("changes no sitting of A's", async () => {
    const { changeStatus } = await import("@/app/committees/actions");
    const r = await refusedAsIfMissing((id) => changeStatus({ ok: false }, form({ meetingId: id, to: "IN_PROGRESS", reason: "Cross-organisation test." })), A.meeting);
    expect(r).toMatchObject({ message: "That sitting no longer exists." });
  });

  it("withdraws no matter of A's", async () => {
    const { withdrawMatter } = await import("@/app/committees/actions");
    await refusedAsIfMissing((id) => withdrawMatter({ ok: false }, form({ decisionId: id, reason: "Cross-organisation test." })), A.decision);
  });

  it("sets no vendor code on a supplier of A's", async () => {
    const { setErpVendorCode } = await import("@/app/suppliers/actions");
    await refusedAsIfMissing((id) => setErpVendorCode({ ok: false }, form({ supplierId: id, erpVendorCode: "TNB1", reason: "Cross-organisation test." })), A.supplier);
  });

  it("withdraws no document version of A's", async () => {
    const { withdrawVersion } = await import("@/app/documents/actions");
    await refusedAsIfMissing((id) => withdrawVersion({ ok: false }, form({ versionId: id, reason: "Cross-organisation test." })), A.version);
  });

  it("escalates no approval step of A's", async () => {
    const { escalateStep } = await import("@/app/approvals/actions");
    const r = await refusedAsIfMissing((id) => escalateStep({ ok: false }, form({ stepId: id, kind: "NO_AVAILABLE_HOLDER", reason: "Cross-organisation test." })), A.step);
    expect(r).toMatchObject({ message: "That step no longer exists." });
  });

  it("ends no office assignment of A's", async () => {
    const { endAssignment } = await import("@/app/configuration/users/core");
    const r = await refusedAsIfMissing((id) => endAssignment({ ok: false }, form({ id, effectiveTo: "2026-10-06", reason: "Cross-organisation test." })), A.assignment);
    expect(r).toMatchObject({ message: "That assignment no longer exists." });
  });

  it("vacates no committee seat of A's", async () => {
    const { vacateSeat } = await import("@/app/configuration/committees/core");
    const r = await refusedAsIfMissing((id) => vacateSeat({ ok: false }, form({ id, reason: "Cross-organisation test." })), A.member);
    expect(r).toMatchObject({ message: "That seat no longer exists." });
  });

  it("discards no draft approval matrix of A's", async () => {
    const { discardDraft } = await import("@/app/configuration/approval-matrix/actions");
    const r = await refusedAsIfMissing((id) => discardDraft({ ok: false }, form({ id, reason: "Cross-organisation test." })), A.matrix);
    expect(r).toMatchObject({ message: "That draft no longer exists." });
  });

  it("removes no recommender from a rule of A's", async () => {
    const { removeRecommender } = await import("@/app/configuration/approval-matrix/actions");
    const r = await refusedAsIfMissing((id) => removeRecommender({ ok: false }, form({ id, reason: "Cross-organisation test." })), A.ruleStep);
    expect(r).toMatchObject({ message: "That step no longer exists." });
  });
});

describe("the route handlers answer organisation B's person as if A's records did not exist", () => {
  it("records no vote on a matter of A's", async () => {
    const { POST } = await import("@/app/api/committees/decisions/[id]/votes/route");
    const before = await snapshotA(fx.a.id);
    const ask = async (id: string) => {
      // Product owner's ruling, 2026-10-07: the old `personId` key is refused with a 400, so this asks for A's person through `onBehalfOf`, the key that now carries it.
      const res = await POST(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ onBehalfOf: A.person, choice: "FOR", votedAt: "2026-10-05" }) }), { params: Promise.resolve({ id }) } as never);
      return { status: res.status, body: await res.json() };
    };
    const withA = await ask(A.decision);
    expect(withA).toEqual(await ask(missing()));
    expect(withA.status).toBe(404);
    expect(await snapshotA(fx.a.id)).toBe(before);
  });

  it("downloads no document version of A's", async () => {
    const { GET } = await import("@/app/api/documents/versions/[id]/route");
    const ask = async (id: string) => {
      const res = await GET(new Request("http://localhost/api", { headers: { "sec-fetch-site": "same-origin" } }) as never, { params: Promise.resolve({ id }) } as never);
      return { status: res.status, body: await res.text() };
    };
    const withA = await ask(A.version);
    expect(withA).toEqual(await ask(missing()));
    expect(withA.status).toBe(404);
  });

  it("resolves no route against A's approval matrix, even when the query names A", async () => {
    const { GET } = await import("@/app/api/authority/resolve/route");
    const res = await GET(new Request(`http://localhost/api/authority/resolve?domain=requisition&value=100&org=${encodeURIComponent(fx.a.code)}`));
    expect(res.status).toBe(404);
  });
});

describe("the loaders the pages read through return A's records to A and nothing to B", () => {
  it("requisition, exercise, award, contract, supplier, sitting", async () => {
    const [{ loadRequisition }, { loadExercise }, { loadAward }, { loadContract }, { loadSupplier }, { loadSitting }] = await Promise.all([
      import("@/lib/requisition/repo"),
      import("@/lib/method/repo"),
      import("@/lib/award/repo"),
      import("@/lib/contract/repo"),
      import("@/lib/suppliers/repo"),
      import("@/lib/committee/sittings"),
    ]);
    const asA = fx.actorA;
    const asB = fx.actorB;
    expect((await loadRequisition(asA.organisationId, A.requisition))?.req.id).toBe(A.requisition);
    expect(await loadRequisition(asB.organisationId, A.requisition)).toBeNull();
    expect((await loadExercise(asA.organisationId, A.exercise))?.ex.id).toBe(A.exercise);
    expect(await loadExercise(asB.organisationId, A.exercise)).toBeNull();
    expect((await loadAward(asA.organisationId, A.award))?.award.id).toBe(A.award);
    expect(await loadAward(asB.organisationId, A.award)).toBeNull();
    expect((await loadContract(asA.organisationId, A.contract))?.contract.id).toBe(A.contract);
    expect(await loadContract(asB.organisationId, A.contract)).toBeNull();
    expect((await loadSupplier(asA.organisationId, A.supplier, []))?.supplier.id).toBe(A.supplier);
    expect(await loadSupplier(asB.organisationId, A.supplier, [])).toBeNull();
    expect((await loadSitting(asA, A.meeting))?.meeting.id).toBe(A.meeting);
    expect(await loadSitting(asB, A.meeting)).toBeNull();
  });

  // Phase 1c review: a certificate and an award letter name as their issuer the name the loaders carry (`l.org.name`), which is the
  // organisation's own row, never the deployment's ORGANISATION_NAME.
  it("an award's and a contract's issuer is the organisation's own name", async () => {
    const [{ loadAward }, { loadContract }, { ORGANISATION_NAME }] = await Promise.all([import("@/lib/award/repo"), import("@/lib/contract/repo"), import("@/lib/org")]);
    const own = (await db.organisation.findUniqueOrThrow({ where: { id: fx.actorA.organisationId }, select: { name: true } })).name;
    expect(own).not.toBe(ORGANISATION_NAME);
    expect((await loadAward(fx.actorA.organisationId, A.award))?.org.name).toBe(own);
    expect((await loadContract(fx.actorA.organisationId, A.contract))?.org.name).toBe(own);
  });

  it("documents: an owner's facts and a document's drawer", async () => {
    const { readOwner, documentDrawer } = await import("@/lib/documents/read");
    expect(await readOwner(fx.actorA.organisationId, { kind: "exercise", id: A.exercise })).not.toBeNull();
    expect(await readOwner(fx.actorB.organisationId, { kind: "exercise", id: A.exercise })).toBeNull();
    expect(await documentDrawer(fx.actorA.organisationId, A.document, false)).not.toBeNull();
    expect(await documentDrawer(fx.actorB.organisationId, A.document, false)).toBeNull();
  });

  it("the sourcing list's columns, a tabling link's amount and the requisition list", async () => {
    const [{ windowColumns }, { tablingAmount }, { listRequisitions, REQUISITION_VIEWS }, { parseListQuery, sortKeys }] = await Promise.all([import("@/lib/window/read"), import("@/lib/committee/repo"), import("@/lib/requisition/repo"), import("@/lib/list-query")]);
    expect([...(await windowColumns(fx.actorA.organisationId, [A.exercise])).keys()]).toEqual([A.exercise]);
    expect([...(await windowColumns(fx.actorB.organisationId, [A.exercise])).keys()]).toEqual([]);
    expect(await tablingAmount(fx.actorA.organisationId, { kind: "requisition", id: A.requisition }, [])).toBe("1000");
    expect(await tablingAmount(fx.actorB.organisationId, { kind: "requisition", id: A.requisition }, [])).toBeNull();
    expect((await listRequisitions(fx.actorB.organisationId, parseListQuery({}, REQUISITION_VIEWS, sortKeys("requisition")))).rows.map((r) => r.id)).not.toContain(A.requisition);
  });
});
