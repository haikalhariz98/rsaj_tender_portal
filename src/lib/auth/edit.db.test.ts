import { randomBytes } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { ensureAdministrator, facts, makeAccount, randomId, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { beginActWith, type ActDeps } from "./act-begin";
import { actFieldNames } from "./act-field-names";
import { attributeAct } from "./attribution-store";
import type { ChangeAct } from "./change-store";
import { loadChangesView } from "./changes-view";
import { auditActorOfStaff } from "./audit-actor";
import { decideEdit, formOf, proposeEdit, type EditOperation, type EditRegistry, type EditRunResult } from "./edit-store";
import { confirmStaffPassword } from "./identity";
import { createStaffSession, readStaffSession } from "./session-store";
import { hashToken } from "./token";
import type { StaffActor } from "./types";

/**
 * An editor's save, held for a second person, against the scratch database (Phase 5). The editors of the product need a request (cookies), so a small editor of the
 * test's own stands in: it writes a row and its audit entry through `db` and `writeAudit`, exactly as a Configuration editor does, and the machinery is what is under
 * test: the rehearsal that leaves nothing, the apply that is one transaction with the decision, the staleness, the refusals and the administrator kept from some editors.
 */

let organisationId: string;
beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
});
beforeEach(async () => {
  await setPolicy(organisationId, SETTINGS);
  await ensureAdministrator(organisationId);
  await db.numberingSeries.deleteMany({ where: { organisationId, key: { startsWith: "edit_" } } });
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

async function signedIn(opts: { admin?: boolean; org?: string } = {}) {
  const org = opts.org ?? organisationId;
  const who = await makeAccount(org, { admin: opts.admin ?? false });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId: org, accountId: who.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...who, token, actor: read.actor as StaffActor };
}
const administrator = () => signedIn({ admin: true });

/// An office holder who holds the given permissions through a role the organisation granted them to, as a real office holder does.
async function officer(...keys: ("configuration.draft" | "configuration.issue" | "corrections.decide")[]) {
  return officerIn(organisationId, ...keys);
}
async function officerIn(org: string, ...keys: ("configuration.draft" | "configuration.issue" | "corrections.decide")[]) {
  const roleCode = `ED_${randomId()}`;
  await db.authorityRole.create({ data: { organisationId: org, code: roleCode, nameEn: `Edit role ${roleCode}`, nameMs: "Peranan" } });
  for (const permissionKey of keys) await db.rolePermission.create({ data: { organisationId: org, permissionKey, roleCode, decision: "GRANTED" } });
  const who = await signedIn({ org });
  await db.roleAssignment.create({ data: { personId: who.person.id, roleCode, effectiveFrom: new Date("2020-01-01") } });
  const read = await readStaffSession(who.token, { sourceAddress: null });
  if (!read.ok) throw new Error("re-read failed");
  return { ...who, actor: read.actor as StaffActor };
}

async function actFor(who: Who, key: "ConfigurationChange.proposedBy" | "ConfigurationChange.decidedBy", changeId?: string): Promise<ChangeAct> {
  const form = new FormData();
  form.set(actFieldNames("personId").password, who.password);
  const begun = await beginActWith(deps, who.actor, form, key, { personField: "personId", ...(changeId ? { document: { entity: "ConfigurationChange", id: changeId } } : {}) });
  if (!begun.ok) throw new Error(`the act was refused: ${JSON.stringify(begun.state)}`);
  return begun.act;
}

// --------------------------------------------------------------------------------------------- the test's own editors

/// The editors the registry holds in this test. Each reads its posted form as a real one does, and writes through `db` and `writeAudit`.
const ops: Record<string, EditOperation & { run: (data: FormData, actor: StaffActor) => Promise<EditRunResult> }> = {};
let actorForRun: StaffActor;
let calls: string[] = [];

function editor(key: string, over: Partial<EditOperation>, run: (data: FormData, actor: StaffActor) => Promise<EditRunResult>) {
  ops[key] = { key, kind: "CONFIGURATION_EDIT", label: `Test: ${key}`, administratorMay: true, proposePermission: "configuration.draft", decidePermission: "configuration.issue", ...over, run };
}

const seriesKey = (data: FormData) => String(data.get("key") ?? "");
const audit = (actor: StaffActor, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", changes: { field: string; before: string | null; after: string | null }[], reason: string) =>
  writeAudit(db, { organisationId, entity: "NumberingSeries", entityId, entityLabel, reason, actor: auditActorOfStaff(actor) }, action, changes);

editor("test.saveSeries", {}, async (data, actor) => {
  calls.push("saveSeries");
  const key = seriesKey(data);
  const pattern = String(data.get("pattern") ?? "");
  if (!pattern) return { ok: false, errors: { pattern: "Enter a pattern." } };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx) => {
    const found = await tx.numberingSeries.findFirst({ where: { organisationId, key } });
    if (!found) {
      const row = await tx.numberingSeries.create({ data: { organisationId, key, nameEn: key, pattern, padding: 3, resetOn: "NEVER" } });
      await audit(actor, row.id, key, "CREATE", [{ field: "pattern", before: null, after: pattern }], reason);
      return { ok: true };
    }
    if (found.pattern === pattern) return { ok: true };
    await tx.numberingSeries.update({ where: { id: found.id }, data: { pattern } });
    await audit(actor, found.id, key, "UPDATE", [{ field: "pattern", before: found.pattern, after: pattern }], reason);
    return { ok: true };
  });
});

/// Writes, then fails: the whole of what it wrote must go.
editor("test.writeThenThrow", {}, async (data, actor) => {
  const key = seriesKey(data);
  const row = await db.numberingSeries.create({ data: { organisationId, key, nameEn: key, pattern: "boom", padding: 3, resetOn: "NEVER" } });
  await audit(actor, row.id, key, "CREATE", [{ field: "pattern", before: null, after: "boom" }], "");
  throw new Error("the editor failed after writing");
});

/// Writes, then refuses in the way an editor does: returns a refusal. What it wrote must go as well.
editor("test.writeThenRefuse", {}, async (data, actor) => {
  const key = seriesKey(data);
  const row = await db.numberingSeries.create({ data: { organisationId, key, nameEn: key, pattern: "refused", padding: 3, resetOn: "NEVER" } });
  await audit(actor, row.id, key, "CREATE", [{ field: "pattern", before: null, after: "refused" }], "");
  return { ok: false, message: "That series is not allowed." };
});

/// A transaction of its own in which a unique key is broken and the error caught, as an editor that answers a clash does; what follows must still work.
editor("test.catchesAClash", {}, async (data, actor) => {
  const key = seriesKey(data);
  await db.numberingSeries.create({ data: { organisationId, key, nameEn: key, pattern: "first", padding: 3, resetOn: "NEVER" } });
  try {
    await db.$transaction(async (tx) => {
      await tx.numberingSeries.create({ data: { organisationId, key: `${key}_inner`, nameEn: "inner", pattern: "inner", padding: 3, resetOn: "NEVER" } });
      await tx.numberingSeries.create({ data: { organisationId, key, nameEn: key, pattern: "clash", padding: 3, resetOn: "NEVER" } });
    });
  } catch {
    // The clash is caught: the inner transaction undoes only its own writes.
  }
  const inner = await db.numberingSeries.count({ where: { organisationId, key: `${key}_inner` } });
  const row = await db.numberingSeries.findFirstOrThrow({ where: { organisationId, key } });
  await audit(actor, row.id, key, "CREATE", [{ field: "pattern", before: null, after: `first (inner rows kept: ${inner})` }], "");
  return { ok: true };
});

editor("test.sulitReach", { administratorMay: false }, async (data, actor) => {
  const key = seriesKey(data);
  const row = await db.numberingSeries.create({ data: { organisationId, key, nameEn: key, pattern: "sulit", padding: 3, resetOn: "NEVER" } });
  await audit(actor, row.id, key, "CREATE", [{ field: "pattern", before: null, after: "sulit" }], "");
  return { ok: true };
});

editor("test.nothing", {}, async () => ({ ok: true }));

/// A correction of the record: anyone the editor lets do the act proposes it, and a holder of `corrections.decide` (granted by the organisation, never through the flag) decides it.
editor("test.correction", { kind: "BASELINE_CORRECTION", administratorMay: false, proposePermission: null, decidePermission: "corrections.decide" }, async (data, actor) => {
  const key = seriesKey(data);
  const row = await db.numberingSeries.create({ data: { organisationId, key, nameEn: key, pattern: "corrected", padding: 3, resetOn: "NEVER" } });
  await audit(actor, row.id, key, "CREATE", [{ field: "pattern", before: null, after: "corrected" }], "");
  return { ok: true };
});

const registry: EditRegistry = {
  find: (key) => ops[key] ?? null,
  run: async (key, data) => {
    const op = ops[key];
    if (!op) return { ok: false, message: "unknown" };
    // The editor reads who is acting from the request, as a real one does: here, the person who proposed or decided.
    return op.run(data, actorForRun);
  },
};

const fields = (key: string, pattern = "AB/{SERIAL}"): [string, string][] => [["key", key], ["pattern", pattern]];
async function propose(who: Who, operation: string, f: [string, string][], reason = "Because the numbering changed") {
  actorForRun = who.actor;
  return proposeEdit(who.actor, await actFor(who, "ConfigurationChange.proposedBy"), registry, { operation, fields: f, reason });
}
async function decide(who: Who, changeId: string, decision: "APPLY" | "DECLINE" | "WITHDRAW", reason = "") {
  actorForRun = who.actor;
  return decideEdit(who.actor, await actFor(who, "ConfigurationChange.decidedBy", changeId), registry, { changeId, decision, reason });
}
async function proposed(who: Who, operation: string, f: [string, string][]) {
  const r = await propose(who, operation, f);
  if (!r.ok) throw new Error(`not proposed: ${JSON.stringify(r)}`);
  return r.changeId;
}
const series = (key: string) => db.numberingSeries.findFirst({ where: { organisationId, key } });
const rowOf = (id: string) => db.configurationChange.findUniqueOrThrow({ where: { id } });
const key = () => `edit_${randomId()}`;

describe("proposing an editor's save", () => {
  it("rehearses the editor, leaves nothing it wrote, and keeps what it would write for the second person", async () => {
    const a = await administrator();
    await administrator();
    const k = key();
    const auditsBefore = await db.auditEntry.count({ where: { organisationId, entity: "NumberingSeries" } });
    calls = [];
    const id = await proposed(a, "test.saveSeries", fields(k));
    expect(calls).toEqual(["saveSeries"]);
    expect(await series(k)).toBeNull();
    expect(await db.auditEntry.count({ where: { organisationId, entity: "NumberingSeries" } })).toBe(auditsBefore);
    const row = await rowOf(id);
    expect(row).toMatchObject({ kind: "CONFIGURATION_EDIT", status: "PROPOSED", proposedByPersonId: a.person.id, decidedByPersonId: null, reason: "Because the numbering changed" });
    expect(row.payload).toMatchObject({ operation: "test.saveSeries" });
    expect(row.before).toMatchObject({ rows: [{ entity: "NumberingSeries", action: "CREATE", changes: [{ field: "pattern", before: null, after: "AB/{SERIAL}" }] }] });
    const trail = await db.auditEntry.findFirstOrThrow({ where: { entity: "ConfigurationChange", entityId: id } });
    expect(trail).toMatchObject({ action: "CREATE", actorPersonId: a.person.id });
    expect(JSON.stringify(trail.changes)).toContain("AB/{SERIAL}");
    expect(await db.actAttribution.findFirstOrThrow({ where: { entity: "ConfigurationChange", entityId: id, slot: "proposedBy" } })).toMatchObject({ subjectPersonId: a.person.id, mode: "SIGNED" });
  });

  it("never stores a password or an act's attribution field", async () => {
    const a = await administrator();
    await administrator();
    const id = await proposed(a, "test.saveSeries", fields(key()));
    const stored = JSON.stringify((await rowOf(id)).payload);
    expect(stored).not.toContain(a.password);
    expect(stored).not.toMatch(/password/i);
  });

  it("tells the proposer, in the editor's own words and beside its own fields, what the editor refuses, and writes nothing", async () => {
    const a = await administrator();
    await administrator();
    const before = await db.configurationChange.count({ where: { organisationId } });
    expect(await propose(a, "test.saveSeries", [["key", key()], ["pattern", ""]])).toMatchObject({ ok: false, kind: "EDITOR", result: { errors: { pattern: "Enter a pattern." } } });
    expect(await propose(a, "test.writeThenRefuse", fields(key()))).toMatchObject({ ok: false, kind: "EDITOR", result: { message: "That series is not allowed." } });
    expect(await db.configurationChange.count({ where: { organisationId } })).toBe(before);
    expect(await db.numberingSeries.count({ where: { organisationId, key: { startsWith: "edit_" } } })).toBe(0);
  });

  it("is refused for an editor that would write nothing, for one the registry does not know, and for the same proposal twice", async () => {
    const a = await administrator();
    await administrator();
    expect(await propose(a, "test.nothing", [])).toMatchObject({ ok: false, kind: "FAULTS", faults: [{ code: "NO_CHANGE" }] });
    expect(await propose(a, "test.nowhere", [])).toMatchObject({ ok: false, kind: "FAULTS", faults: [{ code: "UNKNOWN_EDITOR" }] });
    const k = key();
    await proposed(a, "test.saveSeries", fields(k));
    expect(await propose(a, "test.saveSeries", fields(k))).toMatchObject({ ok: false, faults: [{ code: "ALREADY_PROPOSED" }] });
  });

  it("is refused to a person who does not hold the drafting permission, and to a payload that does not fit", async () => {
    await administrator();
    const issuer = await officer("configuration.issue");
    expect(await propose(issuer, "test.saveSeries", fields(key()))).toMatchObject({ ok: false, faults: [{ code: "NOT_PERMITTED" }] });
    const a = await administrator();
    expect(await propose(a, "test.saveSeries", [["personId:password", "x"]])).toMatchObject({ ok: false, kind: "FAULTS" });
  });

  it("is refused where nobody else could decide it: the product never fakes a second approval", async () => {
    const org = await db.organisation.create({ data: { code: `ED_${randomId()}`, name: "Alone", timeZone: "Asia/Kuala_Lumpur" } });
    const who = await makeAccount(org.id, { admin: true });
    const token = randomBytes(32).toString("base64url");
    await createStaffSession(db, { organisationId: org.id, accountId: who.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
    await setPolicy(org.id, SETTINGS);
    const read = await readStaffSession(token, { sourceAddress: null });
    if (!read.ok) throw new Error("no session");
    const alone: Who = { ...who, token, actor: read.actor as StaffActor };
    expect(await propose(alone, "test.saveSeries", fields(key()))).toMatchObject({ ok: false, faults: [{ code: "SECOND_PERSON_NEEDED" }] });
  });
});

describe("a second person applies it", () => {
  it("runs the editor for real, in the decision's transaction, as the second person, and nothing else is changed", async () => {
    const a = await administrator();
    const b = await administrator();
    const k = key();
    const id = await proposed(a, "test.saveSeries", fields(k));
    expect(await decide(b, id, "APPLY", "Looks right")).toMatchObject({ ok: true, status: "APPLIED" });
    expect(await series(k)).toMatchObject({ pattern: "AB/{SERIAL}" });
    const written = await db.auditEntry.findFirstOrThrow({ where: { entity: "NumberingSeries", entityLabel: k } });
    // The editor recorded the second person as the actor, and the proposer's reason with who proposed it.
    expect(written).toMatchObject({ actorPersonId: b.person.id });
    expect(written.reason).toContain("Because the numbering changed");
    expect(written.reason).toContain(a.person.name);
    expect(await rowOf(id)).toMatchObject({ status: "APPLIED", decidedByPersonId: b.person.id, decisionReason: "Looks right" });
    expect(await db.actAttribution.findFirstOrThrow({ where: { entity: "ConfigurationChange", entityId: id, slot: "decidedBy" } })).toMatchObject({ subjectPersonId: b.person.id });
  });

  it("is the decision of a holder of the issuing permission through a role, not only an administrator", async () => {
    const a = await administrator();
    const issuer = await officer("configuration.issue");
    const k = key();
    const id = await proposed(a, "test.saveSeries", fields(k));
    expect(await decide(issuer, id, "APPLY")).toMatchObject({ ok: true });
    expect(await series(k)).not.toBeNull();
  });

  it("is refused to the proposer, to a holder of the drafting permission only, and to a person who holds neither", async () => {
    const a = await administrator();
    await administrator();
    const maker = await officer("configuration.draft");
    const nobody = await officer();
    const k = key();
    const id = await proposed(a, "test.saveSeries", fields(k));
    expect(await decide(a, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "PROPOSER_IS_DECIDER" }] });
    expect(await decide(maker, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "NOT_PERMITTED" }] });
    expect(await decide(nobody, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "NOT_PERMITTED" }] });
    expect(await series(k)).toBeNull();
    expect(await rowOf(id)).toMatchObject({ status: "PROPOSED" });
  });

  it("is final: a decided change is decided once", async () => {
    const a = await administrator();
    const b = await administrator();
    const id = await proposed(a, "test.saveSeries", fields(key()));
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: true });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "NOT_PROPOSED" }] });
    expect(await decide(b, id, "DECLINE", "too late")).toMatchObject({ ok: false });
    expect(await decide(a, id, "WITHDRAW")).toMatchObject({ ok: false, faults: [{ code: "NOT_PROPOSED" }] });
  });

  it("is STALE, written and applying nothing, when the world moved after it was proposed", async () => {
    const a = await administrator();
    const b = await administrator();
    const k = key();
    await db.numberingSeries.create({ data: { organisationId, key: k, nameEn: k, pattern: "OLD/{SERIAL}", padding: 3, resetOn: "NEVER" } });
    const id = await proposed(a, "test.saveSeries", fields(k, "NEW/{SERIAL}"));
    // Someone else changes the same series before the second person decides.
    await db.numberingSeries.update({ where: { id: (await series(k))!.id }, data: { pattern: "MOVED/{SERIAL}" } });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: false, kind: "STALE" });
    expect(await series(k)).toMatchObject({ pattern: "MOVED/{SERIAL}" });
    expect(await rowOf(id)).toMatchObject({ status: "STALE", decidedByPersonId: b.person.id });
    // The editor's own audit row was undone with its write.
    expect(await db.auditEntry.count({ where: { entity: "NumberingSeries", entityLabel: k } })).toBe(0);
    // And a stale change stays stale: it is proposed again against the values as they now are.
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "NOT_PROPOSED" }] });
  });

  it("is STALE too when the world moved so that the editor now writes nothing, or something else", async () => {
    const a = await administrator();
    const b = await administrator();
    const k = key();
    const id = await proposed(a, "test.saveSeries", fields(k));
    // The series now exists with that very pattern: the editor would write nothing.
    await db.numberingSeries.create({ data: { organisationId, key: k, nameEn: k, pattern: "AB/{SERIAL}", padding: 3, resetOn: "NEVER" } });
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: false, kind: "STALE" });
    expect(await rowOf(id)).toMatchObject({ status: "STALE" });
  });

  it("leaves it proposed, with the editor's words and none of its writes, when the editor refuses the values as they now stand", async () => {
    const a = await administrator();
    const b = await administrator();
    const k = key();
    // Rehearsed while the editor was content (it is replaced by one that refuses once the change is waiting).
    const id = await proposed(a, "test.saveSeries", fields(k));
    const original = ops["test.saveSeries"];
    editor("test.saveSeries", {}, async (data, actor) => {
      const row = await db.numberingSeries.create({ data: { organisationId, key: seriesKey(data), nameEn: "x", pattern: "half", padding: 3, resetOn: "NEVER" } });
      await audit(actor, row.id, seriesKey(data), "CREATE", [{ field: "pattern", before: null, after: "half" }], "");
      return { ok: false, message: "A series with that key now exists." };
    });
    try {
      expect(await decide(b, id, "APPLY")).toMatchObject({ ok: false, kind: "EDITOR", result: { message: "A series with that key now exists." } });
    } finally {
      ops["test.saveSeries"] = original;
    }
    expect(await series(k)).toBeNull();
    expect(await db.auditEntry.count({ where: { entity: "NumberingSeries", entityLabel: k } })).toBe(0);
    expect(await rowOf(id)).toMatchObject({ status: "PROPOSED", decidedByPersonId: null });
    // It can still be declined, and then it is final.
    expect(await decide(b, id, "DECLINE", "Not wanted")).toMatchObject({ ok: true, status: "DECLINED" });
  });

  it("undoes the whole decision when the editor fails part-way, so that nothing is half applied", async () => {
    const a = await administrator();
    const b = await administrator();
    const k = key();
    // The rehearsal of an editor that throws never gets as far as a change.
    await expect(propose(a, "test.writeThenThrow", fields(k))).rejects.toThrow("the editor failed after writing");
    expect(await series(k)).toBeNull();
    // Applied: the editor is swapped for one that throws only when applied.
    const id = await proposed(a, "test.saveSeries", fields(k));
    const original = ops["test.saveSeries"];
    editor("test.saveSeries", {}, async (data, actor) => {
      const row = await db.numberingSeries.create({ data: { organisationId, key: seriesKey(data), nameEn: "x", pattern: "AB/{SERIAL}", padding: 3, resetOn: "NEVER" } });
      await audit(actor, row.id, seriesKey(data), "CREATE", [{ field: "pattern", before: null, after: "AB/{SERIAL}" }], "");
      throw new Error("failed after writing, at the decision");
    });
    try {
      await expect(decide(b, id, "APPLY")).rejects.toThrow("failed after writing");
    } finally {
      ops["test.saveSeries"] = original;
    }
    expect(await series(k)).toBeNull();
    expect(await db.auditEntry.count({ where: { entity: "NumberingSeries", entityLabel: k } })).toBe(0);
    expect(await rowOf(id)).toMatchObject({ status: "PROPOSED" });
  });

  it("lets an editor catch a clash in a transaction of its own: only that transaction's writes go", async () => {
    const a = await administrator();
    const b = await administrator();
    const k = key();
    const id = await proposed(a, "test.catchesAClash", [["key", k]]);
    expect(await series(k)).toBeNull();
    expect(await decide(b, id, "APPLY")).toMatchObject({ ok: true });
    expect(await series(k)).toMatchObject({ pattern: "first" });
    expect(await series(`${k}_inner`)).toBeNull();
    expect(JSON.stringify((await rowOf(id)).before)).toContain("inner rows kept: 0");
  });
});

describe("declining and withdrawing", () => {
  it("lets the proposer alone withdraw it, and a second person decline it with a reason, and nothing is written", async () => {
    const a = await administrator();
    const b = await administrator();
    const k = key();
    const first = await proposed(a, "test.saveSeries", fields(k));
    expect(await decide(b, first, "WITHDRAW")).toMatchObject({ ok: false, faults: [{ code: "NOT_THE_PROPOSER" }] });
    expect(await decide(a, first, "WITHDRAW")).toMatchObject({ ok: true, status: "WITHDRAWN" });
    const second = await proposed(a, "test.saveSeries", fields(k, "OTHER/{SERIAL}"));
    expect(await decide(b, second, "DECLINE", "")).toMatchObject({ ok: false, faults: [{ code: "REASON_REQUIRED" }] });
    expect(await decide(b, second, "DECLINE", "Not this pattern")).toMatchObject({ ok: true, status: "DECLINED" });
    expect(await series(k)).toBeNull();
    expect(await rowOf(second)).toMatchObject({ status: "DECLINED", decisionReason: "Not this pattern" });
  });

  it("is refused to a person who cannot decide it before the editor is looked at, and the database holds the same rule", async () => {
    const a = await administrator();
    const id = await proposed(a, "test.saveSeries", fields(key()));
    await expect(db.configurationChange.update({ where: { id }, data: { status: "APPLIED", decidedByPersonId: a.person.id, decidedAt: new Date() } })).rejects.toThrow();
  });
});

describe("an administrator is kept from some editors", () => {
  it("does not propose one, does not decide one, and is not counted among those it waits for", async () => {
    const a = await administrator();
    const holder = await officer("configuration.draft", "configuration.issue");
    const other = await officer("configuration.draft", "configuration.issue");
    expect(await propose(a, "test.sulitReach", fields(key()))).toMatchObject({ ok: false, faults: [{ code: "ADMINISTRATOR_REFUSED" }] });
    const k = key();
    const id = await proposed(holder, "test.sulitReach", fields(k));
    // The administrator holds the issuing permission, but not for this editor.
    expect(await decide(a, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "ADMINISTRATOR_REFUSED" }] });
    expect(await series(k)).toBeNull();
    const view = await loadChangesView(other.actor, new Date(), registry);
    const row = view.waiting.find((r) => r.id === id)!;
    expect(row.canDecide).toBe(true);
    expect(row.waitingFor).not.toContain(a.person.name);
    expect(await decide(other, id, "APPLY")).toMatchObject({ ok: true });
    expect(await series(k)).not.toBeNull();
  });

  it("makes an editor with no non-administrator checker unproposable: a second person is needed", async () => {
    // A fresh organisation: the shared one holds officers from the other tests. Its only checker is an administrator, who is kept from this editor.
    const org = await db.organisation.create({ data: { code: `ED_${randomId()}`, name: "Kept from", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(org.id, SETTINGS);
    await signedIn({ admin: true, org: org.id });
    const holder = await officerIn(org.id, "configuration.draft");
    expect(await propose(holder, "test.sulitReach", fields(key()))).toMatchObject({ ok: false, faults: [{ code: "SECOND_PERSON_NEEDED" }] });
    // The same editor that an administrator is not kept from is proposable, as the administrator would decide it.
    expect(await propose(holder, "test.saveSeries", fields(key()))).toMatchObject({ ok: true });
  });
});

describe("a correction of the record has its own checker", () => {
  it("is proposed by an officer who holds no configuration permission, and decided only by a holder of the permission to decide corrections", async () => {
    const maker = await officer();
    const checker = await officer("corrections.decide");
    const holder = await officer("configuration.draft", "configuration.issue");
    const a = await administrator();
    const k = key();
    const id = await proposed(maker, "test.correction", [["key", k]]);
    expect(await rowOf(id)).toMatchObject({ kind: "BASELINE_CORRECTION", status: "PROPOSED" });
    // Neither the permission to issue configuration, nor the administrator flag, decides a correction.
    expect(await decide(holder, id, "APPLY")).toMatchObject({ ok: false, faults: [{ code: "NOT_PERMITTED" }] });
    expect(await decide(a, id, "APPLY")).toMatchObject({ ok: false });
    expect(await series(k)).toBeNull();
    expect(await decide(checker, id, "APPLY")).toMatchObject({ ok: true });
    expect(await series(k)).toMatchObject({ pattern: "corrected" });
    const view = await loadChangesView(checker.actor, new Date(), registry);
    expect(view.decided.find((r) => r.id === id)).toMatchObject({ kind: "BASELINE_CORRECTION", status: "APPLIED" });
  });

  it("says the organisation must grant the permission first where nobody else holds it, and is not proposed by an administrator account", async () => {
    const org = await db.organisation.create({ data: { code: `ED_${randomId()}`, name: "No checker", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(org.id, SETTINGS);
    await signedIn({ admin: true, org: org.id });
    const maker = await officerIn(org.id);
    const out = await propose(maker, "test.correction", [["key", key()]]);
    expect(out).toMatchObject({ ok: false, faults: [{ code: "SECOND_PERSON_NEEDED", en: expect.stringContaining("grant the permission to decide corrections") }] });
    const a = await administrator();
    expect(await propose(a, "test.correction", [["key", key()]])).toMatchObject({ ok: false, faults: [{ code: "ADMINISTRATOR_REFUSED" }] });
  });

  it("is read in the queue by the checker, and is waited for by the holders of the permission only", async () => {
    const maker = await officer();
    const checker = await officer("corrections.decide");
    const bystander = await officer();
    const id = await proposed(maker, "test.correction", [["key", key()]]);
    const row = (await loadChangesView(checker.actor, new Date(), registry)).waiting.find((r) => r.id === id)!;
    expect(row).toMatchObject({ canDecide: true, isYours: false });
    expect(row.waitingFor).toContain(checker.person.name);
    expect((await loadChangesView(bystander.actor, new Date(), registry)).waiting.find((r) => r.id === id)).toBeUndefined();
  });
});

describe("the queue", () => {
  it("lists a waiting save in the trail's words to a maker and a checker, with its age and who it waits for, and not to a person who holds neither", async () => {
    const a = await administrator();
    const b = await administrator();
    const k = key();
    const id = await proposed(a, "test.saveSeries", fields(k));
    const mine = (await loadChangesView(a.actor, new Date(), registry)).waiting.find((r) => r.id === id)!;
    expect(mine).toMatchObject({ kind: "CONFIGURATION_EDIT", title: "Test: test.saveSeries", subject: k, isYours: true, canDecide: false, proposedBy: a.person.name, makesCode: false });
    expect(mine.lines).toEqual([{ label: `${k} (added) · Pattern`, before: null, after: "AB/{SERIAL}" }]);
    const theirs = (await loadChangesView(b.actor, new Date(), registry)).waiting.find((r) => r.id === id)!;
    expect(theirs).toMatchObject({ isYours: false, canDecide: true });
    expect(theirs.waitingFor).toContain(b.person.name);
    const nobody = await officer();
    expect((await loadChangesView(nobody.actor, new Date(), registry)).waiting.find((r) => r.id === id)).toBeUndefined();
  });

  it("shows the editor's form back as it was posted (a reason is the change's own)", async () => {
    const data = formOf({ operation: "test.saveSeries", fields: [["key", "k"], ["reason", "posted"], ["f", { file: { name: "a.txt", type: "text/plain", size: 2, base64: "aGk=" } }]] }, "the change's reason");
    expect(data.get("key")).toBe("k");
    expect(data.get("reason")).toBe("the change's reason");
    expect((data.get("f") as File).name).toBe("a.txt");
    expect(await (data.get("f") as File).text()).toBe("hi");
  });
});
