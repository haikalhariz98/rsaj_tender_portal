import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { actFieldNames } from "./act-field-names";
import { attributeAct } from "./attribution-store";
import { loadAttributions } from "./attribution-read";
import { createStaffSession, readStaffSession } from "./session-store";
import { hashToken } from "./token";

/**
 * The named authoriser confirms a back-dated signature (NFR-AUD-006, ruling item 9, Phase 5a), against the scratch database, through the real action: the act that back-dates
 * tells the person named, they confirm it as a signature of their own with their password, only they can, once, and the database refuses the same things for any login.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, staffForAct: async (act: string) => ((await import("@/lib/test-support/staff")).actorModule(who.actor).staffForAct(act as never)) };
});
vi.mock("@/app/_auth/act", async () => {
  const begin = await import("@/lib/auth/act-begin");
  const { attributeAct: attribute } = await import("@/lib/auth/attribution-store");
  const { confirmStaffPassword } = await import("@/lib/auth/identity");
  const deps: import("@/lib/auth/act-begin").ActDeps = {
    now: () => new Date(),
    paperSignatureRecording: async () => null,
    stepUp: async (actor, password) => {
      const r = await confirmStaffPassword(actor, password, { sourceAddress: null, userAgent: "vitest" });
      return r.ok ? r : { ok: false, message: r.kind };
    },
    attribute,
  };
  return {
    beginAct: (actor: StaffActor, data: FormData, key: string, o: Parameters<typeof begin.beginActWith>[4]) => begin.beginActWith(deps, actor, data, key, o),
    attributionRefusalState: begin.attributionRefusalState,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { confirmBackdatingAction } from "@/app/inbox/actions";

let organisationId = "";
beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `BD_${randomId()}`, name: "Back-dating", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
});

async function signedIn(admin = false, org = () => organisationId) {
  const person = await makeAccount(org(), { admin });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId: org(), accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...person, actor: read.actor as StaffActor };
}
type Person = Awaited<ReturnType<typeof signedIn>>;
const as = (p: Person) => {
  who.actor = p.actor;
};
const form = (fields: Record<string, string>, password?: string) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (password) f.set(actFieldNames("personId").password, password);
  return f;
};
const state = { ok: false } as const;

/// A back-dated signature as the act that makes one writes it: the signer's password asked, the day it is dated, and the person named.
async function aBackdatedSignature(signer: Person, authoriser: Person, org = organisationId) {
  const at = new Date();
  await db.staffSession.update({ where: { id: signer.actor.sessionId }, data: { stepUpAt: at } });
  const entityId = `step_${randomId()}`;
  const row = await db.$transaction((tx) =>
    attributeAct(tx, {
      actor: { ...signer.actor, organisationId: org },
      entity: "ApprovalStep",
      entityId,
      slot: "decidedBy",
      subject: { kind: "PERSON", personId: signer.person.id },
      mode: "SIGNED",
      stepUpAt: at,
      paperReference: "",
      reason: "",
      document: { entity: "Requisition", id: `req_${randomId()}` },
      effectiveOn: "2026-09-30",
      backdate: { reason: "The meeting was on the 30th", authorisedByPersonId: authoriser.person.id },
    }),
  );
  return { row, entityId };
}
const confirmationOf = (attributionId: string) => db.backdateConfirmation.findUnique({ where: { attributionId } });
const stepUps = (accountId: string) => db.signInEvent.count({ where: { staffAccountId: accountId, kind: { in: ["STEP_UP_OK", "STEP_UP_FAILED"] } } });

describe("the act that back-dates tells the person named", () => {
  it("writes one notice to them, with the two days and the reason, and none to the signer", async () => {
    const signer = await signedIn();
    const boss = await signedIn();
    const { row } = await aBackdatedSignature(signer, boss);
    const notices = await db.staffNotice.findMany({ where: { subjectEntity: "ActAttribution", subjectId: row.id } });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ recipientPersonId: boss.person.id, kind: "BACKDATE_TO_CONFIRM", href: `/inbox/${row.id}`, raisedByPersonId: signer.person.id });
    expect(notices[0].body).toContain("2026-09-30");
    expect(notices[0].body).toContain("The meeting was on the 30th");
  });
});

describe("confirming", () => {
  it("is the named person's own signature: the password, the exact act it confirms, one row, and the signature reads as confirmed", async () => {
    const signer = await signedIn();
    const boss = await signedIn();
    const { row, entityId } = await aBackdatedSignature(signer, boss);
    const before = await loadAttributions(db, organisationId, [{ entity: "ApprovalStep", slot: "decidedBy", ids: [entityId] }]);
    expect(before.read({ entity: "ApprovalStep", id: entityId, slot: "decidedBy" }, signer.person.name).en).toContain("not confirmed");
    as(boss);
    expect(await confirmBackdatingAction(state, form({ attributionId: row.id }, boss.password))).toMatchObject({ ok: true });
    const confirmation = await confirmationOf(row.id);
    expect(confirmation).toMatchObject({ confirmedByPersonId: boss.person.id, organisationId });
    // The confirmation is a signature of its own: SIGNED by the named person, naming the attribution it confirms.
    const signature = await db.actAttribution.findFirstOrThrow({ where: { entity: "BackdateConfirmation", entityId: confirmation!.id, slot: "confirmedBy" } });
    expect(signature).toMatchObject({ mode: "SIGNED", subjectPersonId: boss.person.id, recordedByPersonId: boss.person.id, documentEntity: "ActAttribution", documentId: row.id });
    expect(signature.stepUpAt).not.toBeNull();
    const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "BackdateConfirmation", entityId: confirmation!.id } });
    expect(audit).toMatchObject({ actorPersonId: boss.person.id, action: "CREATE" });
    const after = await loadAttributions(db, organisationId, [{ entity: "ApprovalStep", slot: "decidedBy", ids: [entityId] }]);
    expect(after.read({ entity: "ApprovalStep", id: entityId, slot: "decidedBy" }, signer.person.name).en).toMatch(new RegExp(`${boss.person.name} confirmed it on \\d{4}-\\d{2}-\\d{2}`));
  });

  it("is refused to anyone but the person named, before the password is asked, and to an administrator account", async () => {
    const signer = await signedIn();
    const boss = await signedIn();
    const other = await signedIn();
    const admin = await signedIn(true);
    const { row } = await aBackdatedSignature(signer, boss);
    for (const p of [signer, other, admin]) {
      as(p);
      const before = await stepUps(p.account.id);
      expect(await confirmBackdatingAction(state, form({ attributionId: row.id }, p.password)), p.loginName).toMatchObject({ ok: false });
      expect(await stepUps(p.account.id), `${p.loginName} spent no password`).toBe(before);
    }
    expect(await confirmationOf(row.id)).toBeNull();
  });

  it("is refused with a wrong password, counted, and written nowhere; and is done once", async () => {
    const signer = await signedIn();
    const boss = await signedIn();
    const { row } = await aBackdatedSignature(signer, boss);
    as(boss);
    expect(await confirmBackdatingAction(state, form({ attributionId: row.id }, "not the password"))).toMatchObject({ ok: false });
    expect(await db.signInEvent.count({ where: { staffAccountId: boss.account.id, kind: "STEP_UP_FAILED" } })).toBe(1);
    expect(await confirmationOf(row.id)).toBeNull();
    expect(await confirmBackdatingAction(state, form({ attributionId: row.id }, boss.password))).toMatchObject({ ok: true });
    expect(await confirmBackdatingAction(state, form({ attributionId: row.id }, boss.password))).toMatchObject({ ok: false, message: expect.stringContaining("already confirmed") });
    expect(await db.backdateConfirmation.count({ where: { attributionId: row.id } })).toBe(1);
  });

  it("confirmed twice at the same moment is one confirmation, and the other is told in words, not an error", async () => {
    const signer = await signedIn();
    const boss = await signedIn();
    const { row } = await aBackdatedSignature(signer, boss);
    as(boss);
    const results = await Promise.all([confirmBackdatingAction(state, form({ attributionId: row.id }, boss.password)), confirmBackdatingAction(state, form({ attributionId: row.id }, boss.password))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)?.message).toBeTruthy();
    expect(await db.backdateConfirmation.count({ where: { attributionId: row.id } })).toBe(1);
  });

  it("reads an act of another organisation as not there", async () => {
    const other = await db.organisation.create({ data: { code: `BD_${randomId()}`, name: "Another", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(other.id, SETTINGS);
    const signer = await signedIn(false, () => other.id);
    const boss = await signedIn(false, () => other.id);
    const { row } = await aBackdatedSignature(signer, boss, other.id);
    const mine = await signedIn();
    as(mine);
    expect(await confirmBackdatingAction(state, form({ attributionId: row.id }, mine.password))).toMatchObject({ ok: false, message: expect.stringContaining("not back-dated") });
  });
});

describe("the database holds the same rule, whatever writes it", () => {
  const code = (e: unknown) => {
    const cause = (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } } }).meta?.driverAdapterError?.cause;
    return cause?.originalCode ?? cause?.code ?? String(e);
  };
  const attempt = (work: Promise<unknown>) => work.then(() => null, code);

  it("refuses a confirmation by anyone but the person named, for an act that was not back-dated, and any change or removal afterwards", async () => {
    const signer = await signedIn();
    const boss = await signedIn();
    const other = await signedIn();
    const { row } = await aBackdatedSignature(signer, boss);
    expect(await attempt(db.backdateConfirmation.create({ data: { organisationId, attributionId: row.id, confirmedByPersonId: other.person.id } }))).toBe("PA006");
    expect(await attempt(db.backdateConfirmation.create({ data: { organisationId, attributionId: row.id, confirmedByPersonId: signer.person.id } }))).toBe("PA006");
    const plain = await db.actAttribution.create({ data: { organisationId, entity: "ApprovalStep", entityId: `step_${randomId()}`, slot: "decidedBy", subjectPersonId: signer.person.id, recordedByPersonId: signer.person.id, mode: "SIGNED" } });
    expect(await attempt(db.backdateConfirmation.create({ data: { organisationId, attributionId: plain.id, confirmedByPersonId: boss.person.id } }))).toBe("PA006");
    const made = await db.backdateConfirmation.create({ data: { organisationId, attributionId: row.id, confirmedByPersonId: boss.person.id } });
    expect(await attempt(db.backdateConfirmation.create({ data: { organisationId, attributionId: row.id, confirmedByPersonId: boss.person.id } }))).toBe("23505");
    expect(await attempt(db.backdateConfirmation.update({ where: { id: made.id }, data: { confirmedAt: new Date(0) } }))).toBe("PA006");
    expect(await attempt(db.backdateConfirmation.delete({ where: { id: made.id } }))).toBe("PA006");
  });
});
