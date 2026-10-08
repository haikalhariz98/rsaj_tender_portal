import { describe, expect, it } from "vitest";

import { STAFF_FIXTURE, actModule } from "@/lib/test-support/staff";

import { actFormFromJson } from "./act-begin";
import { AttributionRefused } from "./attribution-store";
import type { PermissionKey, StaffActor } from "./types";

/**
 * `beginAct`, whole but for its three fakes (the organisation's switch, the password, the write): the actor is the signed-in person, a person a form names
 * is read only as the attested person of an act recorded from paper, a signature asks the password, and nothing is written until the act's transaction
 * calls `write` (ADR 0034 D12, Phase 2b, F1).
 */

const ME = STAFF_FIXTURE.personId;
const BOSS = "person_boss";
const actor = (over: Partial<StaffActor> = {}): StaffActor => ({ ...STAFF_FIXTURE, ...over });
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const tx = {} as never;

// A slot that is the actor's own (not signature-class, not paper), a decision that may come from paper, and a signature.
const OWN = "ApprovalInstance.submittedBy";
const PAPER = "Requisition.requestingPerson";
const SIGNATURE = "ApprovalStep.decidedBy";
const OPTS = { personField: "personId" };

describe("the actor is the signed-in person", () => {
  it("is the actor of an ordinary act, whatever person the form names", async () => {
    const { module: m } = actModule();
    const begun = await m.beginAct(actor(), form({ personId: BOSS }), OWN, OPTS);
    expect(begun.ok && begun.act.subjectPersonId).toBe(ME);
    expect(begun.ok && begun.act.recorderId).toBeNull();
    expect(begun.ok && begun.act.intent.mode).toBe("SIGNED");
  });

  it("does not believe a form that names another person without saying the act is recorded from paper", async () => {
    const { module: m } = actModule();
    const begun = await m.beginAct(actor(), form({ personId: BOSS }), PAPER, OPTS);
    expect(begun.ok && begun.act.subjectPersonId).toBe(ME);
  });

  it("refuses to record an act that is the actor's own for someone else", async () => {
    const { module: m } = actModule();
    const begun = await m.beginAct(actor(), form({ personId: BOSS, "personId:onBehalf": "on", "personId:paperReference": "Minute 4" }), OWN, OPTS);
    expect(begun.ok).toBe(false);
    expect(!begun.ok && begun.state.errors?.["personId:onBehalf"]).toMatch(/signed-in person's own/);
  });
});

describe("an act recorded from paper", () => {
  it("is attributed to the person it is recorded for, and the recorder is the actor: both are judged by the separation of duties", async () => {
    const { module: m, written } = actModule();
    const begun = await m.beginAct(actor(), form({ personId: BOSS, "personId:onBehalf": "on", "personId:paperReference": "Memo 12/2026" }), PAPER, OPTS);
    if (!begun.ok) throw new Error(JSON.stringify(begun.state));
    expect(begun.act.subjectPersonId).toBe(BOSS);
    expect(begun.act.recorderId).toBe(ME);
    expect(begun.act.people.sort()).toEqual([BOSS, ME].sort());
    await begun.act.write(tx, "rq1");
    expect(written).toEqual([expect.objectContaining({ entity: "Requisition", slot: "requestingPerson", subjectPersonId: BOSS, mode: "RECORDED_ON_BEHALF", paperReference: "Memo 12/2026" })]);
  });

  it("needs the paper's reference or the reason, and a person other than the actor", async () => {
    const { module: m } = actModule();
    const noPaper = await m.beginAct(actor(), form({ personId: BOSS, "personId:onBehalf": "on" }), PAPER, OPTS);
    expect(!noPaper.ok && noPaper.state.errors?.["personId:paperReference"]).toMatch(/paper it came from or the reason/);
    const reasonOnly = await m.beginAct(actor(), form({ personId: BOSS, "personId:onBehalf": "on", "personId:reason": "Away on leave" }), PAPER, OPTS);
    expect(reasonOnly.ok).toBe(true);
    const self = await m.beginAct(actor(), form({ personId: ME, "personId:onBehalf": "on", "personId:reason": "x" }), PAPER, OPTS);
    expect(!self.ok && self.state.errors?.personId).toMatch(/for another person/);
    const none = await m.beginAct(actor(), form({ "personId:onBehalf": "on", "personId:reason": "x" }), PAPER, OPTS);
    expect(!none.ok && none.state.errors?.personId).toMatch(/Name the person/);
  });

  it("is, for a person the form names (namesSubject), the actor's own when they name themselves and from paper when they name another", async () => {
    const { module: m } = actModule();
    const own = await m.beginAct(actor(), form({ personId: ME }), PAPER, { ...OPTS, namesSubject: true });
    expect(own.ok && own.act.intent.mode).toBe("SIGNED");
    const other = await m.beginAct(actor(), form({ personId: BOSS }), PAPER, { ...OPTS, namesSubject: true });
    expect(!other.ok && other.state.errors?.["personId:paperReference"]).toBeTruthy();
    const withPaper = await m.beginAct(actor(), form({ personId: BOSS, "personId:paperReference": "Letter" }), PAPER, { ...OPTS, namesSubject: true });
    expect(withPaper.ok && withPaper.act.subjectPersonId).toBe(BOSS);
  });
});

describe("a signature", () => {
  it("asks for the password every time, and refuses an empty one before anything is written", async () => {
    const { module: m, written } = actModule();
    const begun = await m.beginAct(actor(), form({}), SIGNATURE, { ...OPTS, document: { entity: "Requisition", id: "rq1" } });
    expect(!begun.ok && begun.state.errors?.["personId:password"]).toMatch(/Enter it to sign/);
    expect(written).toEqual([]);
  });

  it("is refused a wrong password in the password's own field, and the refusal is the password check's own", async () => {
    const { module: m } = actModule({ stepUp: async () => ({ ok: false as const, message: "That is not your password." }) });
    const begun = await m.beginAct(actor(), form({ "personId:password": "wrong" }), SIGNATURE, { ...OPTS, document: { entity: "Requisition", id: "rq1" } });
    expect(!begun.ok && begun.state.errors).toEqual({ "personId:password": "That is not your password." });
  });

  it("is signed by the actor, stamped with the password's time, and records the document it signs and the office held", async () => {
    const at = new Date("2026-10-07T04:00:00Z");
    const { module: m, written } = actModule({ stepUp: async () => ({ ok: true as const, at }) });
    const begun = await m.beginAct(actor(), form({ "personId:password": "right", personId: BOSS }), SIGNATURE, { ...OPTS, document: { entity: "Requisition", id: "rq1" } });
    if (!begun.ok) throw new Error(JSON.stringify(begun.state));
    expect(begun.act.subjectPersonId).toBe(ME);
    expect(begun.act.stepUpAt).toEqual(at);
    await begun.act.write(tx, "step1", { roleCode: "KETUA_JABATAN" });
    expect(written).toEqual([expect.objectContaining({ entity: "ApprovalStep", slot: "decidedBy", subjectPersonId: ME, mode: "SIGNED", roleCode: "KETUA_JABATAN", document: { entity: "Requisition", id: "rq1" } })]);
  });

  it("recorded from paper is refused while the organisation's switch is unset, and says so", async () => {
    const { module: m } = actModule({ paperSignatureRecording: null });
    const withPermission = actor({ permissions: new Set<PermissionKey>(["acts.recordOnBehalf"]) });
    const begun = await m.beginAct(withPermission, form({ personId: BOSS, "personId:onBehalf": "on", "personId:paperReference": "Minute 9" }), SIGNATURE, { ...OPTS, document: { entity: "Requisition", id: "rq1" } });
    expect(!begun.ok && begun.state.message).toMatch(/not set/i);
  });

  it("recorded from paper is refused to an officer who does not hold the permission, and allowed to one who does once the switch is on", async () => {
    const { module: m } = actModule({ paperSignatureRecording: "ALLOWED" });
    const doc = { ...OPTS, document: { entity: "Requisition", id: "rq1" } };
    const paper = form({ personId: BOSS, "personId:onBehalf": "on", "personId:paperReference": "Minute 9" });
    const without = await m.beginAct(actor(), paper, SIGNATURE, doc);
    expect(without.ok).toBe(false);
    const withPermission = await m.beginAct(actor({ permissions: new Set<PermissionKey>(["acts.recordOnBehalf"]) }), paper, SIGNATURE, doc);
    expect(withPermission.ok && withPermission.act.intent.mode).toBe("RECORDED_ON_BEHALF");
    // Recorded from paper it is not signed: no password is asked.
    expect(withPermission.ok && withPermission.act.stepUpAt).toBeNull();
  });
});

describe("the day of an act, and back-dating it", () => {
  const dated = { personField: "personId", dateField: "decidedOn", document: { entity: "Requisition", id: "rq1" } };

  it("dates a signed act today by the organisation's clock, which is injected: 22:00 UTC on the 6th is already the 7th in Kuala Lumpur", async () => {
    const { module: m } = actModule({ now: new Date("2026-10-06T22:00:00Z") });
    const begun = await m.beginAct(actor(), form({ "personId:password": "x" }), SIGNATURE, dated);
    expect(begun.ok && begun.act.day).toBe("2026-10-07");
  });

  it("refuses a day after today, and a signed act dated earlier without saying that it is back-dated", async () => {
    const { module: m } = actModule({ now: new Date("2026-10-07T04:00:00Z") });
    const future = await m.beginAct(actor(), form({ "personId:password": "x", decidedOn: "2026-10-09" }), SIGNATURE, dated);
    expect(!future.ok && future.state.errors?.decidedOn).toMatch(/after today/);
    const earlier = await m.beginAct(actor(), form({ "personId:password": "x", decidedOn: "2026-10-01" }), SIGNATURE, dated);
    expect(!earlier.ok && earlier.state.errors?.decidedOn).toMatch(/back-dated/);
  });

  it("records a back-dated signature as an exception with its reason and an authoriser other than the recorder, and writes them", async () => {
    const { module: m, written } = actModule({ now: new Date("2026-10-07T04:00:00Z") });
    const f = form({ "personId:password": "x", decidedOn: "2026-10-01", "personId:backdate": "on", "personId:backdateReason": "The sheet was lost and found again", "personId:backdateAuthorisedBy": BOSS });
    const begun = await m.beginAct(actor(), f, SIGNATURE, dated);
    if (!begun.ok) throw new Error(JSON.stringify(begun.state));
    expect(begun.act.day).toBe("2026-10-01");
    await begun.act.write(tx, "step1");
    expect(written).toEqual([expect.objectContaining({ mode: "SIGNED" })]);
  });

  it("refuses back-dating with no reason, no authoriser, or the recorder as the authoriser", async () => {
    const { module: m } = actModule({ now: new Date("2026-10-07T04:00:00Z") });
    const base = { "personId:password": "x", decidedOn: "2026-10-01", "personId:backdate": "on" };
    const noReason = await m.beginAct(actor(), form({ ...base, "personId:backdateAuthorisedBy": BOSS }), SIGNATURE, dated);
    expect(!noReason.ok && noReason.state.errors?.["personId:backdateReason"]).toBeTruthy();
    const noAuthoriser = await m.beginAct(actor(), form({ ...base, "personId:backdateReason": "Late" }), SIGNATURE, dated);
    expect(!noAuthoriser.ok && noAuthoriser.state.errors?.["personId:backdateAuthorisedBy"]).toBeTruthy();
    const self = await m.beginAct(actor(), form({ ...base, "personId:backdateReason": "Late", "personId:backdateAuthorisedBy": ME }), SIGNATURE, dated);
    expect(!self.ok && self.state.errors?.["personId:backdateAuthorisedBy"]).toMatch(/someone other than/);
  });

  it("leaves the day of an ordinary act to the officer who reports it (a check done last week), and only after today is refused", async () => {
    const { module: m } = actModule({ now: new Date("2026-10-07T04:00:00Z") });
    const last = await m.beginAct(actor(), form({ checkedOn: "2026-09-30" }), OWN, { personField: "personId", dateField: "checkedOn" });
    expect(last.ok && last.act.day).toBe("2026-09-30");
    const future = await m.beginAct(actor(), form({ checkedOn: "2026-10-08" }), OWN, { personField: "personId", dateField: "checkedOn" });
    expect(future.ok).toBe(false);
  });
});

describe("a loader run, where nobody is signed in", () => {
  it("names the person its data says, and is recorded by the system by its label, never as a person", async () => {
    const { module: m, written } = actModule();
    const loader = actor({ personId: "", sessionId: "", system: { label: "demo loader" } });
    const begun = await m.beginAct(loader, form({ personId: BOSS }), SIGNATURE, OPTS);
    if (!begun.ok) throw new Error(JSON.stringify(begun.state));
    expect(begun.act.subjectPersonId).toBe(BOSS);
    expect(begun.act.recorderId).toBeNull();
    await begun.act.write(tx, "step1", { document: { entity: "Requisition", id: "rq1" } });
    expect(written).toEqual([expect.objectContaining({ subjectPersonId: BOSS, mode: "RECORDED_ON_BEHALF", reason: "demo loader" })]);
  });

  it("is refused where its data names nobody", async () => {
    const { module: m } = actModule();
    const loader = actor({ personId: "", sessionId: "", system: { label: "demo loader" } });
    const begun = await m.beginAct(loader, form({}), OWN, OPTS);
    expect(begun.ok).toBe(false);
  });
});

describe("one act, two slots", () => {
  it("fills a second slot with the same person the same way, and refuses a signature as the second (one password signs one act)", async () => {
    const { module: m, written } = actModule();
    const begun = await m.beginAct(actor(), form({}), "ApprovalInstance.submittedBy", OPTS);
    if (!begun.ok) throw new Error(JSON.stringify(begun.state));
    await begun.act.write(tx, "inst1");
    await begun.act.writeAlso(tx, "VariationApproval.sentBy", "appr1");
    expect(written.map((w) => `${w.entity}.${w.slot}`)).toEqual(["ApprovalInstance.submittedBy", "VariationApproval.sentBy"]);
    await expect(begun.act.writeAlso(tx, SIGNATURE, "step1")).rejects.toThrow(/asks its own password/);
  });

  it("refuses to record a second slot from paper that cannot be", async () => {
    const { module: m } = actModule();
    const begun = await m.beginAct(actor(), form({ personId: BOSS, "personId:onBehalf": "on", "personId:reason": "Away" }), PAPER, OPTS);
    if (!begun.ok) throw new Error(JSON.stringify(begun.state));
    await expect(begun.act.writeAlso(tx, "ApprovalInstance.submittedBy", "inst1")).rejects.toThrow(/cannot be recorded for someone else/);
    // Refused as the form's own message, never a crash (review of Phase 2b): the action's frame turns it into a state.
    await expect(begun.act.writeAlso(tx, "ApprovalInstance.submittedBy", "inst1")).rejects.toBeInstanceOf(AttributionRefused);
  });
});

describe("a request body", () => {
  it("is read only as the member the act is recorded for, under its own key, never as the actor", async () => {
    const { module: m } = actModule();
    const asked = await m.beginActFrom(actor(), actFormFromJson({ personId: BOSS, choice: "SETUJU" }, { personKey: "onBehalfOf" }), "Vote.person", { personField: "onBehalfOf" });
    expect(asked.ok && asked.act.subjectPersonId).toBe(ME);
    const forMember = await m.beginActFrom(actor(), actFormFromJson({ onBehalfOf: BOSS, reason: "The member's signed sheet" }, { personKey: "onBehalfOf" }), "Vote.person", { personField: "onBehalfOf" });
    expect(forMember.ok && forMember.act.subjectPersonId).toBe(BOSS);
    expect(forMember.ok && forMember.act.recorderId).toBe(ME);
    const noPaper = await m.beginActFrom(actor(), actFormFromJson({ onBehalfOf: BOSS }, { personKey: "onBehalfOf" }), "Vote.person", { personField: "onBehalfOf" });
    expect(noPaper.ok).toBe(false);
  });
});

describe("a signature recorded from paper writes its consequence too (review of Phase 2b: it used to crash with a 500)", () => {
  const paperForm = form({ personId: BOSS, "personId:onBehalf": "on", "personId:paperReference": "Minute 9" });
  const holder = () => actor({ permissions: new Set<PermissionKey>(["acts.recordOnBehalf"]) });
  const doc = { ...OPTS, document: { entity: "Opening", id: "op1" } };

  // Changed deliberately in Phase 3d (the product owner's ruling of 2026-10-07 on the 2b review, FR-OPN-003): the authorisation that opens a main box was recorded from paper for a
  // member here; it is now each member's own, signed in with their own password, and a paper record of one is refused. The box event it writes is the member's own too.
  it("the second authorisation that opens a main box is the member's own, signed with their password, and writes the box event for the same person", async () => {
    const { module: m, written } = actModule();
    const begun = await m.beginAct(actor(), form({ "personId:password": "x" }), "OpeningAuthorisation.person", doc);
    if (!begun.ok) throw new Error(JSON.stringify(begun.state));
    expect(begun.act.intent.mode).toBe("SIGNED");
    expect(begun.act.recorderId).toBeNull();
    await begun.act.write(tx, "auth2");
    await begun.act.writeAlso(tx, "BoxEvent.person", "ev1");
    expect(written.map((w) => `${w.entity}.${w.slot}:${w.mode}:${w.subjectPersonId}`)).toEqual([`OpeningAuthorisation.person:SIGNED:${ME}`, `BoxEvent.person:SIGNED:${ME}`]);
  });

  it("an authorisation is refused when it is recorded for a member from paper, even for a holder of the permission with the switch allowed, and when it names another member without saying so", async () => {
    const { module: m } = actModule({ paperSignatureRecording: "ALLOWED" });
    const refused = await m.beginAct(holder(), paperForm, "OpeningAuthorisation.person", doc);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.state.errors?.["personId:onBehalf"]).toMatch(/signed-in person's own/);
    // A form that names another member without the paper switch is not believed: the act is the signed-in person's own.
    const named = await m.beginAct(actor(), form({ personId: BOSS, "personId:password": "x" }), "OpeningAuthorisation.person", doc);
    expect(named.ok && named.act.subjectPersonId).toBe(ME);
  });

  it("the last step of a registration route, recorded from paper, writes the application's decision the same way", async () => {
    const { module: m, written } = actModule({ paperSignatureRecording: "ALLOWED" });
    const begun = await m.beginAct(holder(), paperForm, SIGNATURE, { ...OPTS, document: { entity: "SupplierApplication", id: "app1" } });
    if (!begun.ok) throw new Error(JSON.stringify(begun.state));
    await begun.act.write(tx, "step9");
    await begun.act.writeAlso(tx, "ApplicationDecision.decidedBy", "dec1");
    expect(written.map((w) => `${w.entity}.${w.slot}:${w.mode}`)).toEqual(["ApprovalStep.decidedBy:RECORDED_ON_BEHALF", "ApplicationDecision.decidedBy:RECORDED_ON_BEHALF"]);
  });

  it("the officer's own acts beside them are still never recorded for someone else: the lock of the box and a resubmission request", async () => {
    const { module: m } = actModule();
    for (const key of ["BoxEvent.person", "ApplicationDecision.decidedBy"]) {
      const begun = await m.beginAct(actor(), paperForm, key, { ...OPTS, onBehalf: false });
      expect(begun.ok, key).toBe(false);
    }
  });
});

// NFR-SEC-004, the product owner's sweep of 2026-10-07, applied in Phase 3d: administration is kept apart from every transactional, approval and certification
// capability, so `beginAct` refuses an administrator account at every slot but the administrator's own configuration acts.
describe("an administrator account does no transactional act (NFR-SEC-004)", () => {
  const admin = () => actor({ isAdministrator: true });
  const holderOfPermissions = () => actor({ isAdministrator: true, permissions: new Set<PermissionKey>(["acts.recordOnBehalf"]) });

  it("is refused an ordinary act that attributes a person, in words, before anything is asked or written", async () => {
    const { module: m, written } = actModule();
    for (const key of [OWN, PAPER, "EvaluationScore.scoredBy", "CommitteeDecision.tabledBy", "BidEnvelope.receivedBy", "SpecPanelVerification.person", "PendingDeduction.person"]) {
      const begun = await m.beginAct(admin(), form({ personId: ME }), key, OPTS);
      expect(begun.ok, key).toBe(false);
      expect(!begun.ok && begun.state.message, key).toMatch(/administrator/);
      expect(!begun.ok && begun.state.message, key).toMatch(/kept apart from transactions/);
    }
    expect(written).toEqual([]);
  });

  it("is refused a signature, signed or recorded from paper, and the password is never asked of it", async () => {
    const stepUps: string[] = [];
    const { module: m } = actModule({
      paperSignatureRecording: "ALLOWED",
      stepUp: async (_a, password) => {
        stepUps.push(password);
        return { ok: true as const, at: new Date("2026-10-07T04:00:00Z") };
      },
    });
    const signed = await m.beginAct(admin(), form({ personId: ME, password: "x" }), SIGNATURE, OPTS);
    expect(signed.ok).toBe(false);
    const paper = await m.beginAct(holderOfPermissions(), form({ personId: BOSS, "personId:onBehalf": "on", "personId:paperReference": "Minute 9" }), SIGNATURE, OPTS);
    expect(paper.ok).toBe(false);
    expect(stepUps).toEqual([]);
  });

  it("is refused on a JSON body too (the committee's vote route)", async () => {
    const { module: m } = actModule();
    const begun = await m.beginActFrom(admin(), actFormFromJson({}, { personKey: "onBehalfOf" }), "Vote.person", { personField: "onBehalfOf" });
    expect(begun.ok).toBe(false);
  });

  it("may do the acts that are the administrator's own configuration acts, each named in the registry with its reason", async () => {
    const { module: m } = actModule();
    for (const key of ["ConfigurationChange.proposedBy", "Delegation.fromPerson"]) {
      const begun = await m.beginAct(admin(), form({ personId: ME }), key, { ...OPTS, namesSubject: key === "Delegation.fromPerson" });
      expect(begun.ok, key).toBe(true);
    }
  });

  it("is not refused to a person who is not an administrator, and a loader run is not an account", async () => {
    const { module: m } = actModule();
    expect((await m.beginAct(actor(), form({}), OWN, OPTS)).ok).toBe(true);
    expect((await m.beginAct(actor({ isAdministrator: true, system: { label: "demo loader" } }), form({ personId: BOSS }), OWN, OPTS)).ok).toBe(true);
  });
});

// Phase 3d: "FR-EST-005: panel verifications are signed" and "FR-APR-009: signed" (the conflict declaration). Each is the signer's own sign-in with their own password, never recorded
// for someone else from paper, and refused to an administrator account.
describe("a panel verification and a conflict declaration are signed (FR-EST-005, FR-APR-009)", () => {
  const KEYS = [
    { key: "SpecPanelVerification.person", doc: { entity: "SpecificationPanel", id: "pan1" } },
    { key: "ApprovalStep.declaredBy", doc: { entity: "Requisition", id: "req1" } },
  ];

  it("asks the signer's password, and signs as them, against the exact record", async () => {
    for (const { key, doc } of KEYS) {
      const asked: string[] = [];
      const { module: m, written } = actModule({
        stepUp: async (_a, password) => {
          asked.push(password);
          return { ok: true as const, at: new Date("2026-10-07T04:00:00Z") };
        },
      });
      const without = await m.beginAct(actor(), form({}), key, { ...OPTS, document: doc });
      expect(without.ok, key).toBe(false);
      expect(!without.ok && without.state.errors?.["personId:password"], key).toMatch(/signed with your password/);
      expect(asked, key).toEqual([]);
      const begun = await m.beginAct(actor(), form({ "personId:password": "secret" }), key, { ...OPTS, document: doc });
      if (!begun.ok) throw new Error(JSON.stringify(begun.state));
      expect(begun.act.intent.mode).toBe("SIGNED");
      expect(begun.act.recorderId).toBeNull();
      expect(asked).toEqual(["secret"]);
      await begun.act.write(tx, "row1", { roleCode: "OFFICE" });
      expect(written.map((w) => `${w.entity}.${w.slot}:${w.mode}:${w.subjectPersonId}:${w.document?.entity}:${w.roleCode}`), key).toEqual([`${key}:SIGNED:${ME}:${doc.entity}:OFFICE`]);
    }
  });

  it("is never recorded for someone else from paper, even by a holder of the permission with the paper switch allowed", async () => {
    for (const { key, doc } of KEYS) {
      const { module: m } = actModule({ paperSignatureRecording: "ALLOWED" });
      const paper = form({ personId: BOSS, "personId:onBehalf": "on", "personId:paperReference": "Minute 9" });
      const begun = await m.beginAct(actor({ permissions: new Set<PermissionKey>(["acts.recordOnBehalf"]) }), paper, key, { ...OPTS, document: doc });
      expect(begun.ok, key).toBe(false);
      expect(!begun.ok && begun.state.errors?.["personId:onBehalf"], key).toMatch(/signed-in person's own/);
    }
  });

  it("is refused to an administrator account, before the password is asked", async () => {
    for (const { key, doc } of KEYS) {
      const asked: string[] = [];
      const { module: m } = actModule({
        stepUp: async (_a, password) => {
          asked.push(password);
          return { ok: true as const, at: new Date() };
        },
      });
      const begun = await m.beginAct(actor({ isAdministrator: true }), form({ "personId:password": "secret" }), key, { ...OPTS, document: doc });
      expect(begun.ok, key).toBe(false);
      expect(asked, key).toEqual([]);
    }
  });
});
