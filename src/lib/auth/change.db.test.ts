import { randomBytes } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { ensureAdministrator, facts, makeAccount, randomId, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { redeemOneTimeCode } from "./account-store";
import { beginActWith, type ActDeps } from "./act-begin";
import { actFieldNames } from "./act-field-names";
import { attributeAct } from "./attribution-store";
import { decideChange, proposeChange, type ChangeAct } from "./change-store";
import { loadChangesView } from "./changes-view";
import { type ChangeKind } from "./configuration-change";
import { authenticateStaff, confirmStaffPassword } from "./identity";
import { randomPassword } from "@/lib/test-db/auth-fixtures";
import { createStaffSession, readStaffSession } from "./session-store";
import { hashToken } from "./token";
import { ONE_PERSON_REASON } from "./two-person";
import type { PermissionKey, StaffActor } from "./types";

/**
 * Two-person change against the scratch database (ADR 0034 D15, Phase 2c): what a second person does to what a first proposed, under the locks, with the
 * database holding the same rules the code does. The password is the real one (`confirmStaffPassword`) and the attribution the real one (`attributeAct`): only
 * the request is stood in for.
 */

let organisationId: string;

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
});
beforeEach(async () => {
  await setPolicy(organisationId, SETTINGS);
  await ensureAdministrator(organisationId);
});

const deps: ActDeps = {
  now: () => new Date(),
  paperSignatureRecording: async () => null,
  stepUp: async (actor, password) => {
    const r = await confirmStaffPassword(actor, password, facts());
    return r.ok ? r : { ok: false, message: r.kind };
  },
  attribute: attributeAct,
};

type Who = Awaited<ReturnType<typeof signedIn>>;

/// A person with a session, in any organisation: the session is made as a sign-in makes it (only the sign-in's own checks, which are the deployment's organisation, are skipped).
async function signedIn(opts: { admin?: boolean; org?: string } = {}) {
  const org = opts.org ?? organisationId;
  const who = await makeAccount(org, { admin: opts.admin ?? false });
  const token = await openSession(org, who.account.id);
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...who, token, actor: read.actor as StaffActor };
}
async function openSession(org: string, accountId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId: org, accountId, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  return token;
}
const administrator = (org?: string) => signedIn({ admin: true, org });

/// The act of a change, begun the way the server begins it: the signature of a decision asks the real password.
async function actFor(who: Who, key: "ConfigurationChange.proposedBy" | "ConfigurationChange.decidedBy", changeId?: string, password = who.password): Promise<ChangeAct> {
  const form = new FormData();
  form.set(actFieldNames("personId").password, password);
  const begun = await beginActWith(deps, who.actor, form, key, { personField: "personId", ...(changeId ? { document: { entity: "ConfigurationChange", id: changeId } } : {}) });
  if (!begun.ok) throw new Error(`the act was refused: ${JSON.stringify(begun.state)}`);
  return begun.act;
}

async function propose(who: Who, kind: ChangeKind, payload: unknown, reason = "A reason it is proposed", passwordConfirmed = true) {
  return proposeChange(who.actor, await actFor(who, "ConfigurationChange.proposedBy"), { kind, payload, reason, passwordConfirmed });
}
async function decide(who: Who, changeId: string, decision: "APPLY" | "DECLINE" | "WITHDRAW", reason = "", password?: string) {
  return decideChange(who.actor, await actFor(who, "ConfigurationChange.decidedBy", changeId, password), { changeId, decision, reason }, facts());
}
const proposed = async (who: Who, kind: ChangeKind, payload: unknown) => {
  const r = await propose(who, kind, payload);
  if (!r.ok || r.applied) throw new Error(`not proposed: ${JSON.stringify(r)}`);
  return r.changeId;
};
const rowOf = (id: string) => db.configurationChange.findUniqueOrThrow({ where: { id } });
const idle = async () => (await db.securityPolicy.findUniqueOrThrow({ where: { organisationId } })).staffIdleMinutes;

function sqlState(error: unknown): string {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } }).meta?.driverAdapterError?.cause;
  return cause?.originalCode ?? cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
}
async function refusal(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return sqlState(error);
  }
}

describe("proposing a change", () => {
  it("is written with who proposed it, what the proposer saw, and its audit row and attribution, in one transaction", async () => {
    const a = await administrator();
    const id = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    expect(await rowOf(id)).toMatchObject({ kind: "SECURITY_POLICY", status: "PROPOSED", proposedByPersonId: a.person.id, decidedByPersonId: null, payload: { changes: { staffIdleMinutes: 20 } }, before: { staffIdleMinutes: 30 }, reason: "A reason it is proposed" });
    const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "ConfigurationChange", entityId: id } });
    expect(audit).toMatchObject({ action: "CREATE", actorKind: "STAFF", actorPersonId: a.person.id, unattributed: false });
    expect(JSON.stringify(audit.changes)).toContain("30 minutes");
    expect(JSON.stringify(audit.changes)).toContain("20 minutes");
    expect(await db.actAttribution.findFirstOrThrow({ where: { entity: "ConfigurationChange", entityId: id, slot: "proposedBy" } })).toMatchObject({ subjectPersonId: a.person.id, recordedByPersonId: a.person.id, mode: "SIGNED" });
    // Nothing is applied by proposing.
    expect(await idle()).toBe(30);
  });

  it("is refused to a person who does not hold the kind's permission, and writes nothing", async () => {
    const officer = await signedIn();
    const before = await db.configurationChange.count({ where: { organisationId } });
    expect(await propose(officer, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } })).toMatchObject({ ok: false, kind: "FAULTS", faults: [{ code: "NOT_PERMITTED" }] });
    expect(await db.configurationChange.count({ where: { organisationId } })).toBe(before);
  });

  it("is refused for a payload that does not fit, with the field named, and for one that changes nothing, and for a reason that is blank", async () => {
    const a = await administrator();
    expect(await propose(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: "soon" } })).toMatchObject({ ok: false, fields: [{ field: "staffIdleMinutes", code: "NOT_A_NUMBER" }] });
    expect(await propose(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 30 } })).toMatchObject({ ok: false, faults: [{ code: "NO_CHANGE" }] });
    // 600 minutes idle is above the longest a session may last (480): the rule of the settings, said before it waits for anyone.
    expect(await propose(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 600 } })).toMatchObject({ ok: false, faults: [{ code: "POLICY_FAULT" }] });
    expect(await propose(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } }, "   ")).toMatchObject({ ok: false, faults: [{ code: "REASON_REQUIRED" }] });
  });

  it("is refused where the organisation has no sign-in settings to change", async () => {
    const a = await administrator();
    await setPolicy(organisationId, null);
    expect(await propose(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } })).toMatchObject({ ok: false, faults: [{ code: "NO_POLICY" }] });
  });
});

describe("one eligible person only: nothing fakes an approval", () => {
  async function aloneIn() {
    const org = await db.organisation.create({ data: { code: `CHG_${randomId()}`, name: "Alone", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(org.id, SETTINGS);
    return { org, only: await administrator(org.id) };
  }

  it("a change nobody else could decide is refused when it is proposed, and the words say a second person is needed", async () => {
    const { org, only } = await aloneIn();
    const outcome = await propose(only, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    expect(outcome).toMatchObject({ ok: false, kind: "FAULTS", faults: [{ code: "SECOND_PERSON_NEEDED" }] });
    expect(outcome.ok ? "" : outcome.faults[0].en).toMatch(/second person is needed/);
    expect(await db.configurationChange.count({ where: { organisationId: org.id } })).toBe(0);
  });

  it("once a second person holds the permission it can be proposed, and decided only by them", async () => {
    const { org, only } = await aloneIn();
    const second = await administrator(org.id);
    const id = await proposed(only, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    expect(await decide(only, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "PROPOSER_IS_DECIDER" }] });
    expect(await decide(second, id, "APPLY")).toMatchObject({ ok: true, status: "APPLIED" });
    expect((await db.securityPolicy.findUniqueOrThrow({ where: { organisationId: org.id } })).staffIdleMinutes).toBe(20);
  });

  it("a person who left no longer counts: their account's person must be active", async () => {
    const { org, only } = await aloneIn();
    const gone = await administrator(org.id);
    await db.person.update({ where: { id: gone.person.id }, data: { isActive: false } });
    expect(await propose(only, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } })).toMatchObject({ ok: false, faults: [{ code: "SECOND_PERSON_NEEDED" }] });
  });
});

describe("a checker who is the maker is refused", () => {
  it("by Person, in the code and in the database", async () => {
    const a = await administrator();
    const b = await administrator();
    const id = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    expect(await decide(a, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "PROPOSER_IS_DECIDER" }] });
    expect(await decide(a, id, "DECLINE", "no")).toMatchObject({ ok: false, faults: [{ code: "PROPOSER_IS_DECIDER" }] });
    expect((await rowOf(id)).status).toBe("PROPOSED");
    expect(await idle()).toBe(30);
    // The database holds it too: the proposer is never the decider of an applied, declined or stale change, whatever wrote the row.
    for (const status of ["APPLIED", "DECLINED", "STALE"]) {
      expect(await refusal(db.configurationChange.update({ where: { id }, data: { status: status as "APPLIED", decidedByPersonId: a.person.id, decidedAt: new Date() } })), status).toBe("23514");
    }
    expect((await rowOf(id)).status).toBe("PROPOSED");
    expect(b.person.id).not.toBe(a.person.id);
  });

  it("one Person cannot hold two accounts, so the maker cannot be a different account of the same Person", async () => {
    const a = await administrator();
    const name = `dup.${randomId()}`;
    const second = await refusal(db.staffAccount.create({ data: { organisationId, personId: a.person.id, loginName: name, loginKey: name, passwordHash: "x", passwordChangedAt: new Date(), status: "ACTIVE" } }));
    expect(second).toBe("23505");
  });

  it("a person who does not hold the permission cannot decide, and nobody is asked for a password first", async () => {
    const a = await administrator();
    const officer = await signedIn();
    const id = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    expect(await decide(officer, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "NOT_PERMITTED" }] });
    expect((await rowOf(id)).status).toBe("PROPOSED");
  });
});

describe("applying, declining and withdrawing", () => {
  it("applying writes the change, its audit rows (the decider as actor) and the decider's signed attribution naming the change", async () => {
    const a = await administrator();
    const b = await administrator();
    const id = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20, staffAbsoluteMinutes: 400 } });
    expect(await decide(b, id, "APPLY", "agreed")).toMatchObject({ ok: true, status: "APPLIED" });
    expect(await db.securityPolicy.findUniqueOrThrow({ where: { organisationId } })).toMatchObject({ staffIdleMinutes: 20, staffAbsoluteMinutes: 400 });
    expect(await rowOf(id)).toMatchObject({ status: "APPLIED", decidedByPersonId: b.person.id, decisionReason: "agreed" });
    const policyAudit = await db.auditEntry.findFirstOrThrow({ where: { entity: "SecurityPolicy", organisationId, actorPersonId: b.person.id }, orderBy: { at: "desc" } });
    expect(policyAudit).toMatchObject({ action: "UPDATE", actorKind: "STAFF" });
    expect(JSON.stringify(policyAudit.changes)).toContain("20 minutes");
    expect(JSON.stringify(policyAudit.changes)).not.toContain("staffIdleMinutes");
    const decision = await db.actAttribution.findFirstOrThrow({ where: { entity: "ConfigurationChange", entityId: id, slot: "decidedBy" } });
    expect(decision).toMatchObject({ mode: "SIGNED", subjectPersonId: b.person.id, recordedByPersonId: b.person.id, documentEntity: "ConfigurationChange", documentId: id });
    expect(decision.stepUpAt).not.toBeNull();
  });

  it("declining changes nothing and needs the reason; the proposer withdraws their own and nobody else's", async () => {
    const a = await administrator();
    const b = await administrator();
    const declined = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    expect(await decide(b, declined, "DECLINE", "")).toMatchObject({ ok: false, faults: [{ code: "REASON_REQUIRED" }] });
    expect(await decide(b, declined, "DECLINE", "too short")).toMatchObject({ ok: true, status: "DECLINED" });
    expect(await rowOf(declined)).toMatchObject({ status: "DECLINED", decidedByPersonId: b.person.id, decisionReason: "too short" });

    const own = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 25 } });
    expect(await decide(b, own, "WITHDRAW")).toMatchObject({ ok: false, faults: [{ code: "NOT_THE_PROPOSER" }] });
    expect(await decide(a, own, "WITHDRAW")).toMatchObject({ ok: true, status: "WITHDRAWN" });
    expect(await rowOf(own)).toMatchObject({ status: "WITHDRAWN", decidedByPersonId: a.person.id });
    expect(await idle()).toBe(30);
  });

  it("is refused without the right password, which counts towards the lock, and nothing is applied or written", async () => {
    const a = await administrator();
    const b = await administrator();
    const id = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    await expect(decide(b, id, "APPLY", "", randomPassword())).rejects.toThrow(/password|WRONG|refused/i);
    expect((await rowOf(id)).status).toBe("PROPOSED");
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: b.account.id } })).toMatchObject({ failedAttempts: 1 });
    expect(await db.signInEvent.count({ where: { staffAccountId: b.account.id, kind: "STEP_UP_FAILED" } })).toBe(1);
  });

  it("is final: a decided change is not decided again, and the database refuses every later write to it", async () => {
    const a = await administrator();
    const b = await administrator();
    const c = await administrator();
    const id = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: true });
    for (const decision of ["APPLY", "DECLINE", "WITHDRAW"] as const) {
      expect(await decide(decision === "WITHDRAW" ? a : c, id, decision, "again"), decision).toMatchObject({ ok: false, faults: [{ code: "NOT_PROPOSED" }] });
    }
    expect(await idle()).toBe(20);
    // Every way round the code: back to proposed, to another decision, another payload, another proposer, or gone.
    expect(await refusal(db.configurationChange.update({ where: { id }, data: { status: "PROPOSED", decidedByPersonId: null, decidedAt: null } }))).toBe("PA004");
    expect(await refusal(db.configurationChange.update({ where: { id }, data: { status: "DECLINED" } }))).toBe("PA004");
    expect(await refusal(db.configurationChange.update({ where: { id }, data: { decisionReason: "rewritten" } }))).toBe("PA004");
    expect(await refusal(db.configurationChange.delete({ where: { id } }))).toBe("PA004");
    expect(await refusal(db.$executeRawUnsafe(`TRUNCATE TABLE "ConfigurationChange" CASCADE`))).toBe("PA004");
    expect((await rowOf(id)).status).toBe("APPLIED");
  });

  it("while it is proposed, the database lets only the decision be written: not the payload, the snapshot or the proposer", async () => {
    const a = await administrator();
    const b = await administrator();
    const id = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    expect(await refusal(db.configurationChange.update({ where: { id }, data: { payload: { changes: { staffIdleMinutes: 5 } } } }))).toBe("PA004");
    expect(await refusal(db.configurationChange.update({ where: { id }, data: { before: { staffIdleMinutes: 99 } } }))).toBe("PA004");
    expect(await refusal(db.configurationChange.update({ where: { id }, data: { proposedByPersonId: b.person.id } }))).toBe("PA004");
    expect(await refusal(db.configurationChange.update({ where: { id }, data: { reason: "other" } }))).toBe("PA004");
    expect(await refusal(db.configurationChange.update({ where: { id }, data: { decisionReason: "no status moved" } }))).toBe("PA004");
    expect((await rowOf(id)).payload).toEqual({ changes: { staffIdleMinutes: 20 } });
  });
});

describe("propose and apply interleaved, in both orders, including STALE", () => {
  for (const [name, order] of [
    ["the first proposed is applied first", "AB"],
    ["the second proposed is applied first", "BA"],
  ] as const) {
    it(`${name}: the one applied second is STALE, writes nothing, and says so`, async () => {
      const a = await administrator();
      const b = await administrator();
      const c = await administrator();
      const first = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 40 } });
      const second = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 50 } });
      const [x, y] = order === "AB" ? [first, second] : [second, first];
      const xValue = x === first ? 40 : 50;
      expect(await decide(b, x, "APPLY")).toMatchObject({ ok: true, status: "APPLIED" });
      const stale = await decide(c, y, "APPLY");
      expect(stale).toMatchObject({ ok: false, kind: "STALE" });
      expect(await idle()).toBe(xValue);
      expect(await rowOf(y)).toMatchObject({ status: "STALE", decidedByPersonId: c.person.id });
      // The decision is kept with its attribution and its audit row.
      expect(await db.actAttribution.count({ where: { entity: "ConfigurationChange", entityId: y, slot: "decidedBy" } })).toBe(1);
      expect(JSON.stringify((await db.auditEntry.findFirstOrThrow({ where: { entity: "ConfigurationChange", entityId: y, action: "UPDATE" } })).changes)).toContain("Out of date");
      // A stale change is final too, and proposing it again, against what stands now, works.
      expect(await decide(b, y, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "NOT_PROPOSED" }] });
      const again = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 45 } });
      expect((await rowOf(again)).before).toEqual({ staffIdleMinutes: xValue });
      expect(await decide(b, again, "APPLY")).toMatchObject({ ok: true });
      expect(await idle()).toBe(45);
    });
  }

  it("a proposal made after another is applied sees what that left, and a change to another setting is not stale", async () => {
    const a = await administrator();
    const b = await administrator();
    const idleChange = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 40 } });
    const lockChange = await proposed(a, "SECURITY_POLICY", { changes: { lockoutMinutes: 20 } });
    expect(await decide(b, idleChange, "APPLY")).toMatchObject({ ok: true });
    expect(await decide(b, lockChange, "APPLY")).toMatchObject({ ok: true });
    expect(await db.securityPolicy.findUniqueOrThrow({ where: { organisationId } })).toMatchObject({ staffIdleMinutes: 40, lockoutMinutes: 20 });
  });

  it("two decided at the same moment: exactly one is applied and the other is STALE, whichever the database serves first", async () => {
    for (let round = 0; round < 4; round++) {
      await setPolicy(organisationId, SETTINGS);
      const a = await administrator();
      const b = await administrator();
      const c = await administrator();
      const one = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 40 } });
      const two = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 50 } });
      const results = await Promise.all(round % 2 === 0 ? [decide(b, one, "APPLY"), decide(c, two, "APPLY")] : [decide(c, two, "APPLY"), decide(b, one, "APPLY")]);
      expect(results.filter((r) => r.ok), `round ${round}`).toHaveLength(1);
      expect(results.filter((r) => !r.ok && r.kind === "STALE"), `round ${round}`).toHaveLength(1);
      const statuses = [(await rowOf(one)).status, (await rowOf(two)).status].sort();
      expect(statuses).toEqual(["APPLIED", "STALE"]);
      expect([40, 50]).toContain(await idle());
    }
  });

  it("two decisions of the same change at once: one wins, the other finds it decided", async () => {
    const a = await administrator();
    const b = await administrator();
    const c = await administrator();
    const id = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 40 } });
    const results = await Promise.all([decide(b, id, "APPLY"), decide(c, id, "DECLINE", "no")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.kind === "FAULTS" && r.faults[0].code === "NOT_PROPOSED")).toHaveLength(1);
    expect(await db.actAttribution.count({ where: { entity: "ConfigurationChange", entityId: id, slot: "decidedBy" } })).toBe(1);
  });

  it("a change whose rules no longer allow it stays proposed, so it can still be declined", async () => {
    const a = await administrator();
    const b = await administrator();
    // 400 idle is allowed alone; once the longest a session may last (a setting the change does not name, so it is not stale) is lowered below it, it is not.
    const idleChange = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 400 } });
    await db.securityPolicy.update({ where: { organisationId }, data: { staffAbsoluteMinutes: 300 } });
    expect(await decide(b, idleChange, "APPLY")).toMatchObject({ ok: false, kind: "FAULTS", faults: [{ code: "POLICY_FAULT" }] });
    expect((await rowOf(idleChange)).status).toBe("PROPOSED");
    expect(await idle()).toBe(30);
    expect(await decide(b, idleChange, "DECLINE", "it no longer fits")).toMatchObject({ ok: true, status: "DECLINED" });
  });
});

describe("a role's permissions", () => {
  async function aRole() {
    const code = `CH_${randomId()}`;
    await db.authorityRole.create({ data: { organisationId, code, nameEn: `Change role ${code}`, nameMs: "Peranan" } });
    return code;
  }

  it("granting, withholding and leaving undecided each write the decision, or take the row away, and read in words", async () => {
    const a = await administrator();
    const b = await administrator();
    const roleCode = await aRole();
    const grant = (decision: string) => ({ permissionKey: "configuration.issue", roleCode, decision });
    const stored = () => db.rolePermission.findMany({ where: { organisationId, roleCode } });

    expect(await decide(b, await proposed(a, "PERMISSION_GRANT", grant("GRANTED")), "APPLY")).toMatchObject({ ok: true });
    expect(await stored()).toMatchObject([{ permissionKey: "configuration.issue", decision: "GRANTED" }]);
    expect(await decide(b, await proposed(a, "PERMISSION_GRANT", grant("WITHHELD")), "APPLY")).toMatchObject({ ok: true });
    expect(await stored()).toMatchObject([{ decision: "WITHHELD" }]);
    expect(await decide(b, await proposed(a, "PERMISSION_GRANT", grant("UNDECIDED")), "APPLY")).toMatchObject({ ok: true });
    expect(await stored()).toEqual([]);

    const audits = await db.auditEntry.findMany({ where: { entity: "RolePermission", organisationId, entityLabel: { contains: roleCode } }, orderBy: { at: "asc" } });
    expect(audits.map((x) => x.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
    expect(JSON.stringify(audits.map((x) => x.changes))).toContain("Granted");
    expect(JSON.stringify(audits.map((x) => x.changes))).not.toContain("GRANTED");
  });

  it("is refused for a role that is not there, for a committee, for a key no role may hold, and for what already stands", async () => {
    const a = await administrator();
    const roleCode = await aRole();
    const committee = `CM_${randomId()}`;
    await db.authorityRole.create({ data: { organisationId, code: committee, nameEn: "A committee", nameMs: "Jawatankuasa", isCommittee: true } });
    expect(await propose(a, "PERMISSION_GRANT", { permissionKey: "configuration.issue", roleCode: "NO_SUCH_ROLE", decision: "GRANTED" })).toMatchObject({ ok: false, faults: [{ code: "NO_SUCH_ROLE" }] });
    expect(await propose(a, "PERMISSION_GRANT", { permissionKey: "configuration.issue", roleCode: committee, decision: "GRANTED" })).toMatchObject({ ok: false, faults: [{ code: "NO_SUCH_ROLE" }] });
    expect(await propose(a, "PERMISSION_GRANT", { permissionKey: "accounts.manage", roleCode, decision: "GRANTED" })).toMatchObject({ ok: false, fields: [{ code: "NOT_GRANTABLE" }] });
    expect(await propose(a, "PERMISSION_GRANT", { permissionKey: "configuration.issue", roleCode, decision: "UNDECIDED" })).toMatchObject({ ok: false, faults: [{ code: "NO_CHANGE" }] });
  });

  it("a role granted a permission carries it to a person who holds that office, on the next request", async () => {
    const a = await administrator();
    const b = await administrator();
    const roleCode = await aRole();
    const officer = await signedIn();
    await db.roleAssignment.create({ data: { personId: officer.person.id, roleCode, effectiveFrom: new Date("2020-01-01") } });
    const read = async () => {
      const r = await readStaffSession(officer.token, { sourceAddress: null });
      if (!r.ok) throw new Error("read failed");
      return r.actor.permissions as ReadonlySet<PermissionKey>;
    };
    expect((await read()).has("audit.read")).toBe(false);
    expect(await decide(b, await proposed(a, "PERMISSION_GRANT", { permissionKey: "audit.read", roleCode, decision: "GRANTED" }), "APPLY")).toMatchObject({ ok: true });
    expect((await read()).has("audit.read")).toBe(true);
  });
});

describe("administrators", () => {
  it("making one applies the flag, ends the account's sessions, and is refused for a person who holds an office, seat or delegation", async () => {
    const a = await administrator();
    const b = await administrator();
    const target = await signedIn();
    const id = await proposed(a, "ADMINISTRATOR_GRANT", { accountId: target.account.id });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: true, status: "APPLIED" });
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: target.account.id } })).toMatchObject({ isAdministrator: true });
    expect((await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(target.token) } })).revokedReason).toBe("ACCOUNT_CHANGED");
    expect(await readStaffSession(target.token, { sourceAddress: null })).toMatchObject({ ok: false });

    // An administrator holding an office is refused: said when it is proposed.
    const holder = await signedIn();
    await db.roleAssignment.create({ data: { personId: holder.person.id, roleCode: "TEST_OFFICE", effectiveFrom: new Date("2020-01-01") } });
    const refused = await propose(a, "ADMINISTRATOR_GRANT", { accountId: holder.account.id });
    expect(refused).toMatchObject({ ok: false, kind: "FAULTS" });
    expect(refused.ok ? "" : refused.faults.map((f) => f.en).join(" ")).toMatch(/office|seat|delegation/);
  });

  it("an office given after the proposal is seen at the decision, under the Person's lock: the change is refused and stays proposed", async () => {
    const a = await administrator();
    const b = await administrator();
    const target = await signedIn();
    const id = await proposed(a, "ADMINISTRATOR_GRANT", { accountId: target.account.id });
    await db.roleAssignment.create({ data: { personId: target.person.id, roleCode: "TEST_OFFICE", effectiveFrom: new Date("2020-01-01") } });
    const outcome = await decide(b, id, "APPLY");
    expect(outcome).toMatchObject({ ok: false, kind: "FAULTS" });
    expect((await rowOf(id)).status).toBe("PROPOSED");
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: target.account.id } })).isAdministrator).toBe(false);
    // It can still be declined.
    expect(await decide(b, id, "DECLINE", "they hold an office")).toMatchObject({ ok: true, status: "DECLINED" });
  });

  it("taking it away ends the account's sessions, and is refused for the only active administrator", async () => {
    const org = await db.organisation.create({ data: { code: `CHG_${randomId()}`, name: "Admins", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(org.id, SETTINGS);
    const a = await administrator(org.id);
    const b = await administrator(org.id);
    const id = await proposed(a, "ADMINISTRATOR_REVOKE", { accountId: b.account.id });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: true });
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: b.account.id } })).isAdministrator).toBe(false);
    expect(await readStaffSession(b.token, { sourceAddress: null })).toMatchObject({ ok: false });
    // a is now the only active administrator, and nobody else could decide anything.
    expect(await propose(a, "ADMINISTRATOR_REVOKE", { accountId: a.account.id })).toMatchObject({ ok: false });
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: a.account.id } })).isAdministrator).toBe(true);
  });
});

describe("a code for an office holder's account", () => {
  async function officeHolder() {
    const who = await signedIn();
    await db.roleAssignment.create({ data: { personId: who.person.id, roleCode: "TEST_OFFICE", effectiveFrom: new Date("2020-01-01") } });
    return who;
  }

  it("is made by a second person, who is the one shown it; the proposer never sees it, and only its hash is kept", async () => {
    const a = await administrator();
    const b = await administrator();
    const target = await officeHolder();
    const id = await proposed(a, "ACCOUNT_CODE", { accountId: target.account.id, purpose: "RESET" });
    expect(await db.oneTimeCode.count({ where: { staffAccountId: target.account.id } })).toBe(0);
    expect(await decide(a, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "PROPOSER_IS_DECIDER" }] });
    expect(await db.oneTimeCode.count({ where: { staffAccountId: target.account.id } })).toBe(0);

    const applied = await decide(b, id, "APPLY");
    if (!applied.ok || !applied.code) throw new Error(`not applied: ${JSON.stringify(applied)}`);
    expect(applied.code.code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}-[0-9A-Z]{2}$/);
    const stored = await db.oneTimeCode.findFirstOrThrow({ where: { staffAccountId: target.account.id } });
    expect(stored).toMatchObject({ purpose: "RESET", issuedByPersonId: b.person.id, usedAt: null });
    const everywhere = JSON.stringify([stored, await rowOf(id), await db.auditEntry.findMany({ where: { organisationId, at: { gte: stored.createdAt } } })]);
    expect(everywhere).not.toContain(applied.code.code.replace(/-/g, ""));
    expect(everywhere).not.toContain(applied.code.code);
  });

  it("a reset ends the target's sessions, and the code then sets a password of their own", async () => {
    const a = await administrator();
    const b = await administrator();
    const target = await officeHolder();
    const secondToken = await openSession(organisationId, target.account.id);
    const applied = await decide(b, await proposed(a, "ACCOUNT_CODE", { accountId: target.account.id, purpose: "RESET" }), "APPLY");
    if (!applied.ok || !applied.code) throw new Error("not applied");
    for (const token of [target.token, secondToken]) expect(await readStaffSession(token, { sourceAddress: null }), "the target's session").toMatchObject({ ok: false });
    expect((await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(target.token) } })).revokedReason).toBe("ADMINISTRATOR");
    const fresh = randomPassword();
    expect(await redeemOneTimeCode({ loginName: target.loginName, code: applied.code.code, password: fresh }, facts())).toEqual({ ok: true });
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: target.account.id } })).toMatchObject({ resetNoticePending: true });
    expect((await authenticateStaff({ loginName: target.loginName, password: fresh }, facts(), null)).ok).toBe(true);
    expect((await authenticateStaff({ loginName: target.loginName, password: target.password }, facts(), null)).ok).toBe(false);
  });

  it("an activation code for an office holder who has not yet signed in is made the same way", async () => {
    const a = await administrator();
    const b = await administrator();
    // Waiting to be activated: an account with no session yet.
    const waiting = await makeAccount(organisationId, { status: "PENDING_ACTIVATION" });
    await db.roleAssignment.create({ data: { personId: waiting.person.id, roleCode: "TEST_OFFICE", effectiveFrom: new Date("2020-01-01") } });
    const target = { account: waiting.account };
    const applied = await decide(b, await proposed(a, "ACCOUNT_CODE", { accountId: target.account.id, purpose: "ACTIVATION" }), "APPLY");
    expect(applied).toMatchObject({ ok: true, code: { purpose: "ACTIVATION" } });
  });

  // Review of Phase 2c: an administrator's account is reset by two people, never one. A proposal for it is judged like an office holder's.
  it("is made for an administrator's account by a second administrator, and never by the account's own Person", async () => {
    const a = await administrator();
    const b = await administrator();
    const c = await administrator();
    const id = await proposed(a, "ACCOUNT_CODE", { accountId: b.account.id, purpose: "RESET" });
    expect(await decide(a, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "PROPOSER_IS_DECIDER" }] });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "OWN_ACCOUNT" }] });
    const applied = await decide(c, id, "APPLY");
    expect(applied).toMatchObject({ ok: true, code: { purpose: "RESET" } });
    expect(await db.oneTimeCode.findFirstOrThrow({ where: { staffAccountId: b.account.id } })).toMatchObject({ issuedByPersonId: c.person.id });
  });

  it("with only two administrators it is refused, and says a second person is needed: one cannot reset the other", async () => {
    const org = await db.organisation.create({ data: { code: `CHG_${randomId()}`, name: "Two administrators", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(org.id, SETTINGS);
    const a = await administrator(org.id);
    const b = await administrator(org.id);
    expect(await propose(a, "ACCOUNT_CODE", { accountId: b.account.id, purpose: "RESET" })).toMatchObject({ ok: false, faults: [{ code: "SECOND_PERSON_NEEDED" }] });
    expect(await db.configurationChange.count({ where: { organisationId: org.id } })).toBe(0);
  });

  it("an administrator made or unmade between the proposal and the decision makes it stale, and nothing is issued", async () => {
    const a = await administrator();
    const b = await administrator();
    const target = await administrator();
    const id = await proposed(a, "ACCOUNT_CODE", { accountId: target.account.id, purpose: "RESET" });
    await db.staffAccount.update({ where: { id: target.account.id }, data: { isAdministrator: false } });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: false, kind: "STALE" });
    expect(await db.oneTimeCode.count({ where: { staffAccountId: target.account.id } })).toBe(0);
  });

  // Review of Phase 2c: this said NO_OFFICE_HELD. The code is now refused for anyone who is neither an administrator nor has ever held anything.
  it("is a change for an administrator or an office holder: for anyone else it is refused and says to issue it directly", async () => {
    const a = await administrator();
    const plain = await signedIn();
    expect(await propose(a, "ACCOUNT_CODE", { accountId: plain.account.id, purpose: "RESET" })).toMatchObject({ ok: false, faults: [{ code: "NO_SECOND_PERSON_NEEDED" }] });
  });

  it("nobody proposes one for their own account, and the account's own Person never decides it", async () => {
    const a = await administrator();
    const b = await administrator();
    // An administrator whose Person holds an office is what a database from before the rule may hold (written past it here).
    const odd = await administrator();
    await db.roleAssignment.create({ data: { personId: odd.person.id, roleCode: "TEST_OFFICE", effectiveFrom: new Date("2020-01-01") } });
    expect(await propose(odd, "ACCOUNT_CODE", { accountId: odd.account.id, purpose: "RESET" })).toMatchObject({ ok: false, faults: [{ code: "OWN_ACCOUNT" }] });
    const id = await proposed(a, "ACCOUNT_CODE", { accountId: odd.account.id, purpose: "RESET" });
    expect(await decide(odd, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "OWN_ACCOUNT" }] });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: true });
  });

  it("is refused while the code's validity is unset, when proposed and when applied, and writes no code", async () => {
    const a = await administrator();
    const b = await administrator();
    const target = await officeHolder();
    const id = await proposed(a, "ACCOUNT_CODE", { accountId: target.account.id, purpose: "RESET" });
    await setPolicy(organisationId, { ...SETTINGS, resetCodeValidityMinutes: null });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "POLICY_NOT_SET" }] });
    expect(await propose(a, "ACCOUNT_CODE", { accountId: target.account.id, purpose: "RESET" })).toMatchObject({ ok: false, faults: [{ code: "POLICY_NOT_SET" }] });
    expect(await db.oneTimeCode.count({ where: { staffAccountId: target.account.id } })).toBe(0);
    expect((await rowOf(id)).status).toBe("PROPOSED");
  });

  it("a foreign organisation's change reads as gone: another organisation's administrator cannot decide it", async () => {
    const a = await administrator();
    const id = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    const other = await db.organisation.create({ data: { code: `CHG_${randomId()}`, name: "Another", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(other.id, SETTINGS);
    const outsider = await administrator(other.id);
    const outsiderB = await administrator(other.id);
    void outsiderB;
    expect(await decide(outsider, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "NO_SUCH_CHANGE" }] });
    expect((await rowOf(id)).status).toBe("PROPOSED");
    expect(await idle()).toBe(30);
  });
});

// Review of Phase 2c: the queue was read by every signed-in member of staff. A change names who is being made an administrator, whose account is getting a code,
// the settings that keep password guessing out, and the reason, which for a code records how identity was checked.
describe("who reads the queue", () => {
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  it("each person reads the kinds whose permission they hold, and what they proposed themselves, and nothing else", async () => {
    const a = await administrator();
    const b = await administrator();
    const policyChange = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 21 } });
    const target = await signedIn();
    await db.roleAssignment.create({ data: { personId: target.person.id, roleCode: "TEST_OFFICE", effectiveFrom: new Date("2020-01-01") } });
    const codeChange = await proposed(a, "ACCOUNT_CODE", { accountId: target.account.id, purpose: "RESET" });

    // An administrator holds every permission a kind asks for and reads all of them.
    expect(ids((await loadChangesView(b.actor)).waiting)).toEqual(expect.arrayContaining([policyChange, codeChange]));
    // Someone who holds only the permission to grant permissions to roles reads neither, and not the reason a code was proposed.
    const grantOnly = { ...b.actor, permissions: new Set<PermissionKey>(["permissions.grant"]) };
    const seen = await loadChangesView(grantOnly);
    expect(ids(seen.waiting)).not.toContain(policyChange);
    expect(ids(seen.waiting)).not.toContain(codeChange);
    expect([...seen.waiting, ...seen.decided].filter((r) => r.kind !== "PERMISSION_GRANT" && !r.isYours)).toEqual([]);
    // One who holds the permission of a single kind reads that kind only.
    const accountsOnly = { ...b.actor, permissions: new Set<PermissionKey>(["accounts.manage"]) };
    expect(ids((await loadChangesView(accountsOnly)).waiting)).toContain(codeChange);
    expect(ids((await loadChangesView(accountsOnly)).waiting)).not.toContain(policyChange);
    // A member of staff who holds none reads none of it, whatever they ask of the loader.
    const officer = await signedIn();
    const none = await loadChangesView(officer.actor);
    expect(none.waiting).toEqual([]);
    expect(none.decided).toEqual([]);
    // What a person proposed themselves they still read, and withdraw, even where they no longer hold the permission.
    const own = await proposed(b, "SECURITY_POLICY", { changes: { staffIdleMinutes: 22 } });
    expect(ids((await loadChangesView({ ...b.actor, permissions: new Set<PermissionKey>() })).waiting)).toEqual([own]);
    // A decided change is cut the same way.
    expect(await decide(b, policyChange, "DECLINE", "not now")).toMatchObject({ ok: true });
    expect(ids((await loadChangesView(grantOnly)).decided)).not.toContain(policyChange);
    expect(ids((await loadChangesView(b.actor)).decided)).toContain(policyChange);
  });
});

describe("with the two-person switch off (ADR 0043 D3)", () => {
  beforeEach(async () => {
    await db.securityPolicy.update({ where: { organisationId }, data: { twoPersonChanges: false } });
  });
  const rows = () => db.configurationChange.count({ where: { organisationId } });
  const switchIsOn = async () => (await db.securityPolicy.findUniqueOrThrow({ where: { organisationId } })).twoPersonChanges;

  it("applies a setting at once, with no change row, and every audit row carries the reason and the person", async () => {
    const a = await administrator();
    const before = await rows();
    expect(await propose(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } })).toEqual({ ok: true, applied: true });
    expect(await idle()).toBe(20);
    expect(await rows()).toBe(before);
    const audit = await db.auditEntry.findMany({ where: { entity: "SecurityPolicy", organisationId, actorPersonId: a.person.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0].reason).toContain(ONE_PERSON_REASON);
    expect(audit[0].reason).toContain("A reason it is proposed");
  });

  it("refuses an at-once save whose password was not confirmed, for every covered kind, and changes nothing (step 4.8 M2)", async () => {
    const a = await administrator();
    const target = await signedIn();
    const holder = await signedIn();
    await db.roleAssignment.create({ data: { personId: holder.person.id, roleCode: "TEST_OFFICE", effectiveFrom: new Date("2020-01-01") } });
    const attempts: [ChangeKind, unknown][] = [
      ["SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } }],
      ["ADMINISTRATOR_GRANT", { accountId: target.account.id }],
      ["ACCOUNT_CODE", { accountId: holder.account.id, purpose: "RESET" }],
    ];
    for (const [kind, payload] of attempts) expect(await propose(a, kind, payload, "A reason it is proposed", false), kind).toMatchObject({ ok: false, faults: [{ code: "PASSWORD_REQUIRED" }] });
    expect(await idle()).toBe(30);
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: target.account.id } })).toMatchObject({ isAdministrator: false });
    expect(await db.oneTimeCode.count({ where: { staffAccountId: holder.account.id } })).toBe(0);
  });

  it("still refuses what the rules refuse, and a blank reason, and writes nothing", async () => {
    const a = await administrator();
    expect(await propose(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 30 } })).toMatchObject({ ok: false, faults: [{ code: "NO_CHANGE" }] });
    expect(await propose(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } }, " ")).toMatchObject({ ok: false, faults: [{ code: "REASON_REQUIRED" }] });
    expect(await idle()).toBe(30);
  });

  it("one administrator alone changes a setting", async () => {
    const org = await db.organisation.create({ data: { code: `CHG_${randomId()}`, name: "Alone", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(org.id, SETTINGS);
    await db.securityPolicy.update({ where: { organisationId: org.id }, data: { twoPersonChanges: false } });
    const only = await administrator(org.id);
    expect(await propose(only, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } })).toEqual({ ok: true, applied: true });
    expect(await db.configurationChange.count({ where: { organisationId: org.id } })).toBe(0);
  });

  it("makes an administrator at once", async () => {
    const a = await administrator();
    const target = await signedIn();
    expect(await propose(a, "ADMINISTRATOR_GRANT", { accountId: target.account.id })).toEqual({ ok: true, applied: true });
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: target.account.id } })).toMatchObject({ isAdministrator: true });
  });

  it("makes a code at once, shown to the one who asked, and never their own", async () => {
    const a = await administrator();
    const target = await signedIn();
    await db.roleAssignment.create({ data: { personId: target.person.id, roleCode: "TEST_OFFICE", effectiveFrom: new Date("2020-01-01") } });
    const r = await propose(a, "ACCOUNT_CODE", { accountId: target.account.id, purpose: "RESET" });
    if (!r.ok || !r.applied || !r.code) throw new Error(`not made: ${JSON.stringify(r)}`);
    expect(await db.oneTimeCode.findFirstOrThrow({ where: { staffAccountId: target.account.id } })).toMatchObject({ issuedByPersonId: a.person.id, usedAt: null });
    expect(await propose(a, "ACCOUNT_CODE", { accountId: a.account.id, purpose: "RESET" })).toMatchObject({ ok: false, faults: [{ code: "OWN_ACCOUNT" }] });
  });

  it("turning it on is saved at once; turning it off, while on, is a proposal a second person decides", async () => {
    const a = await administrator();
    const b = await administrator();
    expect(await propose(a, "SECURITY_POLICY", { changes: { twoPersonChanges: "ON" } })).toEqual({ ok: true, applied: true });
    expect(await switchIsOn()).toBe(true);
    const id = await proposed(a, "SECURITY_POLICY", { changes: { twoPersonChanges: "OFF" } });
    expect(await switchIsOn()).toBe(true);
    expect(await decide(a, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "PROPOSER_IS_DECIDER" }] });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: true, status: "APPLIED" });
    expect(await switchIsOn()).toBe(false);
  });

  it("a change proposed while it was on stays waiting, and is decided by a second person after it goes off", async () => {
    await db.securityPolicy.update({ where: { organisationId }, data: { twoPersonChanges: true } });
    const a = await administrator();
    const b = await administrator();
    const id = await proposed(a, "SECURITY_POLICY", { changes: { staffIdleMinutes: 20 } });
    await db.securityPolicy.update({ where: { organisationId }, data: { twoPersonChanges: false } });
    expect((await rowOf(id)).status).toBe("PROPOSED");
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: true, status: "APPLIED" });
    expect(await idle()).toBe(20);
  });
});
