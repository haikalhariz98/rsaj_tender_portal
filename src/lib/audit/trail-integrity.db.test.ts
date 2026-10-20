import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit/record";
import { applyAppRole } from "../../../scripts/db-role-apply";
import { readRuntimeRole } from "@/lib/auth/runtime-role-store";
import { recordSignInEvent } from "@/lib/auth/events";
import { db } from "@/lib/db";
import { randomId, SETTINGS, setPolicy, testOrganisation } from "@/lib/test-db/auth-fixtures";

/**
 * Phase 1d security tests (ADR 0034 D11, ruling O-1, OD-9): the trail cannot be changed or removed, by the app's own login (its grants)
 * or by the owner (the triggers, which have no bypass), and an organisation with a trail cannot be deleted.
 *
 * The app's login is played by a role of this file's own (`perolehan_app_test`, NOLOGIN) given exactly the grants `scripts/db-roles.ts`
 * gives the real one, through the same function, and reached with SET LOCAL ROLE: the role is cluster-wide, and the real
 * `perolehan_app`'s password belongs to whoever runs `db:roles`, never to a test. The owner is the scratch connection itself (here a
 * superuser, the strongest case). Each refusal is told apart by its SQLSTATE: 42501 a missing privilege, PA001 to PA003 the triggers,
 * 23503 the foreign key (RESTRICT, read from the catalogue).
 */

const TEST_ROLE = "perolehan_app_test";
type Tx = Prisma.TransactionClient;

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

const asApp = <T>(fn: (tx: Tx) => Promise<T>) =>
  db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${TEST_ROLE}`);
    return fn(tx);
  });
const asOwner = <T>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn);

let organisationId = "";
let auditId = "";
let eventId = "";

beforeAll(async () => {
  const applied = await db.$transaction((tx) => applyAppRole(tx, { role: TEST_ROLE, password: null }));
  expect(applied.ok).toBe(true);
  organisationId = (await testOrganisation()).id;
  await setPolicy(organisationId, SETTINGS);
  const label = `trail test ${randomId()}`;
  await db.$transaction((tx) => writeAudit(tx, { actor: { kind: "SYSTEM", label: "trail integrity test" }, organisationId, entity: "Organisation", entityId: organisationId, entityLabel: label }, "UPDATE", []));
  auditId = (await db.auditEntry.findFirstOrThrow({ where: { organisationId, entityLabel: label }, select: { id: true } })).id;
  const at = new Date();
  await recordSignInEvent(db, { organisationId, kind: "FAILED", request: { sourceAddress: "198.51.100.7", userAgent: "vitest" }, at });
  eventId = (await db.signInEvent.findFirstOrThrow({ where: { organisationId, at }, select: { id: true } })).id;
});

afterAll(async () => {
  await setPolicy(organisationId, SETTINGS);
});

describe("the app's login cannot change or remove the trail (grants)", () => {
  const append = [
    ["AuditEntry", `"id" = $1`, () => auditId],
    ["SignInEvent", `"id" = $1`, () => eventId],
    ["SignInEventDetail", `"eventId" = $1`, () => eventId],
  ] as const;

  for (const [table, where, id] of append) {
    it(`UPDATE, DELETE and TRUNCATE on ${table} are refused for want of the privilege`, async () => {
      const column = table === "SignInEventDetail" ? `"userAgent"` : table === "AuditEntry" ? `"reason"` : `"kind"`;
      expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "${table}" SET ${column} = ${column} WHERE ${where}`, id())))).toBe("42501");
      expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE ${where}`, id())))).toBe("42501");
      expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`TRUNCATE "${table}" CASCADE`)))).toBe("42501");
    });
  }

  it("UPDATE, DELETE and TRUNCATE on DocumentAccessEvent are refused too (grants only: it has no trigger)", async () => {
    const access = await db.documentAccessEvent.create({ data: { organisationId, kind: "REFUSED", reasonCode: "TEST" } });
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "DocumentAccessEvent" SET "reasonCode" = 'x' WHERE "id" = $1`, access.id)))).toBe("42501");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`DELETE FROM "DocumentAccessEvent" WHERE "id" = $1`, access.id)))).toBe("42501");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`TRUNCATE "DocumentAccessEvent"`)))).toBe("42501");
  });

  it("still reads and adds to the trail, and writes an ordinary table: the role is not simply shut out", async () => {
    await asApp(async (tx) => {
      await writeAudit(tx, { actor: { kind: "SYSTEM", label: "trail integrity test" }, organisationId, entity: "Organisation", entityId: organisationId, entityLabel: "as the app" }, "UPDATE", []);
      await recordSignInEvent(tx, { organisationId, kind: "FAILED", request: { sourceAddress: null, userAgent: "vitest" }, at: new Date() });
      expect(await tx.auditEntry.count({ where: { organisationId } })).toBeGreaterThan(0);
      await tx.organisation.update({ where: { id: organisationId }, data: { name: "Auth test organisation" } });
    });
  });

  it("cannot read or write Prisma's migrations table", async () => {
    expect(await refusal(asApp((tx) => tx.$queryRawUnsafe(`SELECT count(*) FROM "_prisma_migrations"`)))).toBe("42501");
  });

  it("is neither superuser nor owner, and holds no right it should not, as the runtime check reads it", async () => {
    const facts = await asApp((tx) => readRuntimeRole(tx));
    // Phase 1d review: the check also reads the grants now (withheldHeld), and the script's grants must leave that empty.
    // N6 (ruling 20ch): the check also reads whether the login can SELECT the estimate's figure, and the script's grants must leave that false.
    expect(facts).toEqual({ name: TEST_ROLE, isSuperuser: false, ownsSchemaObjects: false, withheldHeld: [], temporaryHeld: false, estimateFigureReadable: false });
    const owner = await readRuntimeRole(db);
    expect(owner.isSuperuser || owner.ownsSchemaObjects).toBe(true);
  });
});

describe("the triggers refuse the owner as well (no bypass)", () => {
  it("UPDATE, DELETE and TRUNCATE on AuditEntry and SignInEvent", async () => {
    // Raw SQL, not the client's update and delete: src/lib/audit/export.test.ts (FR-APR-015) holds every file under src/ to never call those.
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`UPDATE "AuditEntry" SET "reason" = 'rewritten' WHERE "id" = $1`, auditId)))).toBe("PA001");
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`DELETE FROM "AuditEntry" WHERE "id" = $1`, auditId)))).toBe("PA001");
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`TRUNCATE "AuditEntry"`)))).toBe("PA001");
    expect(await refusal(asOwner((tx) => tx.signInEvent.update({ where: { id: eventId }, data: { kind: "SIGNED_IN" } })))).toBe("PA001");
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`DELETE FROM "SignInEvent" WHERE "id" = $1`, eventId)))).toBe("PA001");
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`TRUNCATE "SignInEvent" CASCADE`)))).toBe("PA001");
  });

  it("still fires with session_replication_role set to replica", async () => {
    const replica = (sql: string, ...values: unknown[]) =>
      asOwner(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
        return tx.$executeRawUnsafe(sql, ...values);
      });
    expect(await refusal(replica(`DELETE FROM "AuditEntry" WHERE "id" = $1`, auditId))).toBe("PA001");
    expect(await refusal(replica(`DELETE FROM "SignInEventDetail" WHERE "eventId" = $1`, eventId))).toBe("PA002");
  });

  it("the audit row and the sign-in event are still there, unchanged", async () => {
    expect(await db.auditEntry.findUnique({ where: { id: auditId }, select: { reason: true } })).toEqual({ reason: "" });
    expect((await db.signInEvent.findUnique({ where: { id: eventId }, select: { kind: true } }))?.kind).toBe("FAILED");
  });
});

describe("the sign-in address (ruling O-1)", () => {
  const oldEvent = async (daysAgo: number, inOrganisation = organisationId) => {
    const at = new Date(Date.now() - daysAgo * 86_400_000 - 60_000);
    await recordSignInEvent(db, { organisationId: inOrganisation, kind: "FAILED", request: { sourceAddress: "198.51.100.8", userAgent: `vitest ${randomId()}` }, at });
    return (await db.signInEvent.findFirstOrThrow({ where: { organisationId: inOrganisation, at }, select: { id: true } })).id;
  };
  const deleteDetail = (id: string) => asOwner((tx) => tx.$executeRawUnsafe(`DELETE FROM "SignInEventDetail" WHERE "eventId" = $1`, id));

  it("is never updated, by anyone", async () => {
    expect(await refusal(asOwner((tx) => tx.signInEventDetail.update({ where: { eventId }, data: { sourceAddress: null } })))).toBe("PA001");
  });

  it("is never truncated, by anyone", async () => {
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`TRUNCATE "SignInEventDetail"`)))).toBe("PA001");
  });

  it("while the retention period is unset, no delete is allowed, however old the row", async () => {
    await setPolicy(organisationId, { ...SETTINGS, signInDetailRetentionDays: null });
    const old = await oldEvent(400);
    expect(await refusal(deleteDetail(old))).toBe("PA002");
  });

  it("with no security policy at all, no delete is allowed", async () => {
    const other = await db.organisation.upsert({ where: { code: "TRAIL_NO_POLICY" }, update: {}, create: { code: "TRAIL_NO_POLICY", name: "Trail test, no policy" } });
    await setPolicy(other.id, null);
    expect(await refusal(deleteDetail(await oldEvent(400, other.id)))).toBe("PA002");
  });

  it("once set, a row younger than the period is kept and one older may be removed, by the owner only", async () => {
    await setPolicy(organisationId, { ...SETTINGS, signInDetailRetentionDays: 1 });
    const recent = await oldEvent(0);
    expect(await refusal(deleteDetail(recent))).toBe("PA002");

    const expired = await oldEvent(2);
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`DELETE FROM "SignInEventDetail" WHERE "eventId" = $1`, expired)))).toBe("42501");
    expect(await deleteDetail(expired)).toBe(1);
    // The event itself stays: only the personal data went.
    expect(await db.signInEvent.findUnique({ where: { id: expired }, include: { detail: true } })).toMatchObject({ id: expired, detail: null });
  });
});

describe("an organisation with a trail cannot be deleted", () => {
  it("is refused by the foreign key's RESTRICT, before any cascade reaches the trail", async () => {
    const org = await db.organisation.upsert({ where: { code: "TRAIL_RESTRICT" }, update: {}, create: { code: "TRAIL_RESTRICT", name: "Trail test, restrict" } });
    if ((await db.auditEntry.count({ where: { organisationId: org.id } })) === 0) {
      await db.$transaction((tx) => writeAudit(tx, { actor: { kind: "SYSTEM", label: "trail integrity test" }, organisationId: org.id, entity: "Organisation", entityId: org.id, entityLabel: "restrict test" }, "CREATE", []));
    }
    let message = "";
    const state = await refusal(
      db.organisation.delete({ where: { id: org.id } }).catch((error: unknown) => {
        message = String(error);
        throw error;
      }),
    );
    // Postgres reports a RESTRICT refusal as 23503 (foreign_key_violation), as it does NO ACTION. What matters is that it is not the trigger's
    // PA001: under CASCADE the delete would have reached the trail and been stopped there. The catalogue says which action the key has.
    expect(state).toBe("23503");
    expect(message).toMatch(/AuditEntry_organisationId_fkey/);
    const [key] = await db.$queryRawUnsafe<{ action: string }[]>(`SELECT confdeltype::text AS action FROM pg_constraint WHERE conname = 'AuditEntry_organisationId_fkey'`);
    expect(key.action).toBe("r");
    expect(await db.organisation.findUnique({ where: { id: org.id }, select: { id: true } })).not.toBeNull();
  });
});

/// A version over bytes of its own, for the OD-9 tests.
async function version() {
  const person = await db.person.create({ data: { organisationId, name: `Recorder ${randomId()}` } });
  const documentClass = await db.documentClass.create({ data: { organisationId, code: `TRAIL_${randomId()}`, nameEn: "Trail test class" } });
  const document = await db.document.create({ data: { organisationId, title: "Trail test document", documentClassId: documentClass.id, retentionSnapshot: {} } });
  const sha256 = randomBytes(32).toString("hex");
  await db.blobContent.create({ data: { organisationId, sha256, byteSize: BigInt(4), bytes: new Uint8Array([1, 2, 3, 4]) } });
  return db.documentVersion.create({ data: { organisationId, documentId: document.id, versionNo: 1, sha256, byteSize: BigInt(4), mediaType: "application/pdf", originalFilename: "t.pdf", recordedByPersonId: person.id } });
}

describe("a stored document version (OD-9)", () => {
  it("is never deleted or truncated, by anyone", async () => {
    const v = await version();
    expect(await refusal(asOwner((tx) => tx.documentVersion.delete({ where: { id: v.id } })))).toBe("PA003");
    expect(await refusal(asApp((tx) => tx.documentVersion.delete({ where: { id: v.id } })))).toBe("PA003");
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`TRUNCATE "DocumentVersion" CASCADE`)))).toBe("PA003");
  });

  it("has no content change: not its note, its name, or its bytes' reference", async () => {
    const v = await version();
    expect(await refusal(asOwner((tx) => tx.documentVersion.update({ where: { id: v.id }, data: { note: "edited" } })))).toBe("PA003");
    expect(await refusal(asOwner((tx) => tx.documentVersion.update({ where: { id: v.id }, data: { originalFilename: "other.pdf" } })))).toBe("PA003");
    expect(await refusal(asOwner((tx) => tx.documentVersion.update({ where: { id: v.id }, data: { withdrawnAt: new Date(), withdrawnReason: "x", note: "and an edit" } })))).toBe("PA003");
  });

  it("is withdrawn once, with a reason, by the app's own login; not without a reason, and not twice", async () => {
    const v = await version();
    expect(await refusal(asApp((tx) => tx.documentVersion.update({ where: { id: v.id }, data: { withdrawnAt: new Date() } })))).toBe("PA003");
    expect(await refusal(asApp((tx) => tx.documentVersion.update({ where: { id: v.id }, data: { withdrawnAt: new Date(), withdrawnReason: "Superseded by the signed copy" } })))).toBeNull();
    expect(await refusal(asOwner((tx) => tx.documentVersion.update({ where: { id: v.id }, data: { withdrawnAt: new Date(), withdrawnReason: "again" } })))).toBe("PA003");
    expect(await refusal(asOwner((tx) => tx.documentVersion.update({ where: { id: v.id }, data: { withdrawnAt: null, withdrawnReason: "" } })))).toBe("PA003");
  });
});

describe("stored document bytes (OD-9, Phase 1d review)", () => {
  const blob = async () => {
    const sha256 = randomBytes(32).toString("hex");
    await db.blobContent.create({ data: { organisationId, sha256, byteSize: BigInt(4), bytes: new Uint8Array([5, 6, 7, 8]) } });
    return sha256;
  };
  const rewrite = (sha256: string) => `UPDATE "BlobContent" SET "bytes" = decode('00', 'hex') WHERE "organisationId" = '${organisationId}' AND "sha256" = '${sha256}'`;

  it("are never rewritten: the app lacks the privilege, and the trigger refuses the owner, under replica too", async () => {
    const sha256 = await blob();
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(rewrite(sha256))))).toBe("42501");
    expect(await refusal(asOwner((tx) => tx.$executeRawUnsafe(rewrite(sha256))))).toBe("PA004");
    expect(await refusal(asOwner(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
      return tx.$executeRawUnsafe(rewrite(sha256));
    }))).toBe("PA004");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`TRUNCATE "BlobContent" CASCADE`)))).toBe("42501");
    const kept = await db.blobContent.findUniqueOrThrow({ where: { organisationId_sha256: { organisationId, sha256 } }, select: { bytes: true } });
    expect([...kept.bytes]).toEqual([5, 6, 7, 8]);
  });

  it("are never truncated by the owner either (whichever trigger on the cascade answers first, nothing goes)", async () => {
    const sha256 = await blob();
    expect(["PA003", "PA004"]).toContain(await refusal(asOwner((tx) => tx.$executeRawUnsafe(`TRUNCATE "BlobContent" CASCADE`))));
    expect(await db.blobContent.count({ where: { organisationId, sha256 } })).toBe(1);
  });

  it("an orphan may be deleted by the app; bytes a version points at may not (the foreign key)", async () => {
    const orphan = await blob();
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`DELETE FROM "BlobContent" WHERE "organisationId" = $1 AND "sha256" = $2`, organisationId, orphan)))).toBeNull();
    const held = await version();
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`DELETE FROM "BlobContent" WHERE "organisationId" = $1 AND "sha256" = $2`, organisationId, held.sha256)))).toBe("23503");
  });
});
