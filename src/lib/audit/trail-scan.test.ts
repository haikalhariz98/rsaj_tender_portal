import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * Phase 1d (ADR 0034 D11, ruling O-1, OD-9): the trail is append-only in the database (triggers, and no UPDATE, DELETE or TRUNCATE for
 * the app's login), so no code may try to change or remove it: such code could only fail at run time. This scan finds it first.
 *
 * Scope: `src/`, `prisma/` and `scripts/`, tests excluded (the database tests attempt exactly these writes, to see them refused).
 * Banned on AuditEntry, SignInEvent, SignInEventDetail, DocumentAccessEvent (and SulitAccessEvent when 3a adds it): every client verb but
 * create, createMany and the reads, and raw UPDATE, DELETE FROM or TRUNCATE naming the table. An upsert is banned too: ON CONFLICT DO
 * UPDATE needs the UPDATE privilege even when it only inserts. On DocumentVersion: delete and upsert anywhere, and update only in the
 * withdrawal action, the one change the trigger lets through. On BlobContent (the stored bytes, Phase 1d review): update and upsert
 * anywhere, and raw UPDATE or TRUNCATE. A delete stays allowed (an orphan may be cleared), and so do INSERT ... ON CONFLICT DO NOTHING
 * (the store's put) and createMany with skipDuplicates, which need only INSERT. Blind spots (declared): a delegate reached through a
 * variable not named after its model, and raw SQL assembled from pieces.
 */

const ROOT = path.join(__dirname, "../../..");
const APPEND_ONLY = ["auditEntry", "signInEvent", "signInEventDetail", "documentAccessEvent", "sulitAccessEvent"];
const TABLES = ["AuditEntry", "SignInEvent", "SignInEventDetail", "DocumentAccessEvent", "SulitAccessEvent", "DocumentVersion"];
/// Changed by nobody, but an orphan may be deleted: so UPDATE and TRUNCATE only.
const KEPT_CONTENT = ["BlobContent"];
const ALLOWED_VERBS = "create|createMany|createManyAndReturn|findUnique|findFirst|findMany|findUniqueOrThrow|findFirstOrThrow|count|aggregate|groupBy|fields";
/// The withdrawal (OD-9): sets withdrawnAt and withdrawnReason once, which the trigger allows.
const VERSION_WITHDRAWAL = "src/app/documents/actions.ts";

export function trailWrites(src: string): string[] {
  const text = lex(src, { only: "comments" });
  const found: string[] = [];
  for (const model of APPEND_ONLY) {
    for (const m of text.matchAll(new RegExp(`\\b${model}\\s*\\??\\.\\s*(\\w+)\\b`, "g"))) {
      if (!new RegExp(`^(?:${ALLOWED_VERBS})$`).test(m[1])) found.push(`${model}.${m[1]}`);
    }
  }
  for (const m of text.matchAll(/\bdocumentVersion\s*\??\.\s*(delete|deleteMany|upsert|update|updateMany|updateManyAndReturn)\b/g)) found.push(`documentVersion.${m[1]}`);
  for (const m of text.matchAll(new RegExp(`\\b(UPDATE|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?)\\s+(?:ONLY\\s+)?"(${TABLES.join("|")})"`, "gi"))) found.push(`raw ${m[1].toUpperCase().replace(/\s+/g, " ")} "${m[2]}"`);
  for (const m of text.matchAll(/\bblobContent\s*\??\.\s*(update|updateMany|updateManyAndReturn|upsert)\b/g)) found.push(`blobContent.${m[1]}`);
  for (const m of text.matchAll(new RegExp(`\\b(UPDATE|TRUNCATE(?:\\s+TABLE)?)\\s+(?:ONLY\\s+)?"(${KEPT_CONTENT.join("|")})"`, "gi"))) found.push(`raw ${m[1].toUpperCase().replace(/\s+/g, " ")} "${m[2]}"`);
  return found;
}

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    if (rel === "src/generated" || rel === "prisma/migrations") return [];
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [rel] : [];
  });
}

describe("nothing tries to change or remove the trail (Phase 1d)", () => {
  it("no file in src, prisma or scripts updates, deletes, upserts or truncates an append-only table, or a document version except by withdrawing it, or rewrites stored bytes", () => {
    const offenders: string[] = [];
    for (const f of [...files("src"), ...files("prisma"), ...files("scripts")]) {
      const writes = trailWrites(readFileSync(path.join(ROOT, f), "utf8")).filter((w) => !(f === VERSION_WITHDRAWAL && w === "documentVersion.update"));
      if (writes.length > 0) offenders.push(`${f}: ${writes.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the withdrawal is still the one update of a document version, and it sets only the two columns", () => {
    const src = lex(readFileSync(path.join(ROOT, VERSION_WITHDRAWAL), "utf8"), { only: "comments" });
    const updates = [...src.matchAll(/documentVersion\.update\(\{[^]*?data:\s*(\{[^}]*\})/g)].map((m) => m[1]);
    expect(updates).toEqual(["{ withdrawnAt: new Date(), withdrawnReason: reason }"]);
  });

  it("the demo's wipe is retired: it refuses before it reaches the database, and nothing named wipe is left to call", () => {
    const demo = lex(readFileSync(path.join(ROOT, "prisma/demo.ts"), "utf8"), { only: "comments" });
    expect(demo).toMatch(/if \(mode === "wipe"\) \{\s*console\.error\(DEMO_WIPE_RETIRED\);\s*process\.exit\(1\);\s*\}/);
    const loaders = [...files("prisma")].filter((f) => /prisma\/demo/.test(f));
    expect(loaders.filter((f) => /\bfunction wipe\w*\s*\(/.test(readFileSync(path.join(ROOT, f), "utf8")))).toEqual([]);
  });

  it("finds what it is meant to find", () => {
    // Joined from pieces so this file does not itself read as a call to src/lib/audit/export.test.ts's FR-APR-015 scan.
    const call = (delegate: string, verb: string) => `await db.${delegate}.${verb}` + "({ where: {} })";
    expect(trailWrites(call("auditEntry", "deleteMany"))).toEqual(["auditEntry.deleteMany"]);
    expect(trailWrites("await tx.signInEventDetail.upsert({})")).toEqual(["signInEventDetail.upsert"]);
    expect(trailWrites("await tx.signInEvent?.update({})")).toEqual(["signInEvent.update"]);
    expect(trailWrites('await tx.$executeRawUnsafe(`DELETE FROM "AuditEntry" WHERE id = $1`, id)')).toEqual(['raw DELETE FROM "AuditEntry"']);
    expect(trailWrites('sql`TRUNCATE TABLE "SignInEvent"`')).toEqual(['raw TRUNCATE TABLE "SignInEvent"']);
    expect(trailWrites("await db.documentVersion.deleteMany({})")).toEqual(["documentVersion.deleteMany"]);
    expect(trailWrites("await tx.auditEntry.create({ data }); await db.auditEntry.findMany({}); await db.documentVersion.findFirst({})")).toEqual([]);
    expect(trailWrites(`// ${call("auditEntry", "deleteMany")} in a comment is not code`)).toEqual([]);
  });

  it("every read of stored bytes is checked against its fingerprint before it is used", () => {
    // The store's get() returns the bytes as stored; each caller hashes them and refuses a mismatch, logging DIGEST_MISMATCH apart from
    // BYTES_MISSING. That is why get() does not hash them a second time (Phase 1d review): this holds every caller to it.
    const reads: string[] = [];
    const unchecked: string[] = [];
    let calls = 0;
    for (const f of files("src")) {
      const text = lex(readFileSync(path.join(ROOT, f), "utf8"), { only: "comments" });
      calls += [...text.matchAll(/\bstore\.get\(/g)].length;
      for (const m of text.matchAll(/const (\w+) = await [\w.]*store\.get\(/g)) {
        reads.push(f);
        const after = text.slice(m.index, m.index + 400);
        if (!new RegExp(`sha256Hex\\(${m[1]}\\)\\s*(?:!==|===)`).test(after)) unchecked.push(`${f}: ${m[1]}`);
      }
    }
    expect(reads.length).toBeGreaterThanOrEqual(3);
    // A read in any other shape (not bound to a name first) is not judged above, so it fails here instead.
    expect(calls).toBe(reads.length);
    expect(unchecked).toEqual([]);
  });

  it("finds a rewrite of stored bytes, and lets the store's insert, a skip-duplicates load and an orphan delete through", () => {
    expect(trailWrites("await tx.blobContent.update({ where, data: { bytes } })")).toEqual(["blobContent.update"]);
    expect(trailWrites("await db.blobContent?.upsert({})")).toEqual(["blobContent.upsert"]);
    expect(trailWrites('await tx.$executeRawUnsafe(`UPDATE "BlobContent" SET bytes = $1`, b)')).toEqual(['raw UPDATE "BlobContent"']);
    expect(trailWrites('sql`TRUNCATE TABLE "BlobContent"`')).toEqual(['raw TRUNCATE TABLE "BlobContent"']);
    // What the code does today, and must go on being allowed to do.
    expect(trailWrites('await tx.$executeRawUnsafe(`INSERT INTO "BlobContent" ("sha256") VALUES ($1) ON CONFLICT ("organisationId", "sha256") DO NOTHING`, s)')).toEqual([]);
    expect(trailWrites("await db.blobContent.createMany({ data, skipDuplicates: true })")).toEqual([]);
    expect(trailWrites('await db.blobContent.delete({ where }); await db.$executeRaw`DELETE FROM "BlobContent" WHERE false`')).toEqual([]);
  });
});
