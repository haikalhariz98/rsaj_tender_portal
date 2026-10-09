import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { Tx } from "@/lib/audit/record";

import { attachFault, repinFault, type OwnerFacts } from "./attach";
import { lockVersion, LOCKED_VERSION_SELECT, shareDocumentClass, type LockedVersion } from "./lock";

/**
 * Review 2026-10-01, must-fix 1: an attach read the version before it locked the
 * document, so a version withdrawn while the attach waited for the lock could still be
 * pinned. The order now: read only the document id, lock the document, re-read the
 * version, judge that read. Proved on a recording client that withdraws the version
 * "concurrently" — after the first read, before the lock is granted — and by a scan of
 * the three attach paths' source.
 */

type Call = { kind: "lock"; sql: string; values: unknown[] } | { kind: "read"; select: Record<string, unknown>; where: Record<string, unknown> };

const WITHDRAWN = new Date("2026-10-01T03:00:00.000Z");
const LIVE: LockedVersion = { id: "v2", documentId: "doc1", versionNo: 2, sha256: "a".repeat(64), withdrawnAt: null };

/// A client whose version is withdrawn by another transaction while this one waits for the lock.
function racingClient(opts: { withdrawnWhileWaiting?: boolean; lockFails?: boolean; goneAfterLock?: boolean; missing?: boolean } = {}) {
  const calls: Call[] = [];
  let row: LockedVersion | null = opts.missing ? null : { ...LIVE };
  const tx = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ kind: "lock", sql: strings.join("?"), values });
      if (opts.lockFails) return Promise.reject(new Error("lock timeout"));
      // The withdrawal held the document's lock and committed; ours is granted after it.
      if (opts.withdrawnWhileWaiting && row) row = { ...row, withdrawnAt: WITHDRAWN };
      if (opts.goneAfterLock) row = null;
      return Promise.resolve([]);
    },
    documentVersion: {
      findFirst: (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
        calls.push({ kind: "read", select: args.select, where: args.where });
        if (!row) return Promise.resolve(null);
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(args.select)) out[k] = (row as unknown as Record<string, unknown>)[k];
        return Promise.resolve(out);
      },
    },
  };
  return { calls, tx: tx as unknown as Tx };
}

const MINUTED: OwnerFacts = { kind: "meeting", status: "MINUTED" };

describe("lockVersion: the document id, the lock, then the version judged", () => {
  it("reads only the document id first, locks that document FOR UPDATE, then reads the judged fields", async () => {
    const { calls, tx } = racingClient();
    await lockVersion(tx, "v2", "org1");
    expect(calls.map((c) => c.kind)).toEqual(["read", "lock", "read"]);
    const [first, lock, second] = calls as [Extract<Call, { kind: "read" }>, Extract<Call, { kind: "lock" }>, Extract<Call, { kind: "read" }>];
    expect(first.select).toEqual({ documentId: true });
    expect(first.where).toEqual({ id: "v2", organisationId: "org1" });
    expect(lock.sql).toMatch(/FROM "Document" WHERE id = \? FOR UPDATE/);
    expect(lock.values).toEqual(["doc1"]);
    expect(second.where).toEqual({ id: "v2", organisationId: "org1" });
    expect(second.select).toBe(LOCKED_VERSION_SELECT);
    for (const k of ["id", "documentId", "versionNo", "sha256", "withdrawnAt"]) expect(LOCKED_VERSION_SELECT, k).toHaveProperty(k, true);
  });

  it("a version withdrawn while the attach waited for the lock is returned withdrawn, and attachFault refuses it", async () => {
    const { tx } = racingClient({ withdrawnWhileWaiting: true });
    const v = await lockVersion(tx, "v2", "org1");
    expect(v?.withdrawnAt).toEqual(WITHDRAWN);
    const faults = attachFault({ purpose: "SIGNED_MINUTES", owner: MINUTED, version: v!, documentClass: { classification: "INTERNAL" }, documentClassification: "INTERNAL", alreadyAttached: false });
    expect(faults.map((f) => f.code)).toContain("VERSION_WITHDRAWN");
  });

  it("not withdrawn, the same attach is not refused for it", async () => {
    const { tx } = racingClient();
    const v = await lockVersion(tx, "v2", "org1");
    const faults = attachFault({ purpose: "SIGNED_MINUTES", owner: MINUTED, version: v!, documentClass: { classification: "INTERNAL" }, documentClassification: "INTERNAL", alreadyAttached: false });
    expect(faults).toEqual([]);
  });

  it("the same race on a new version: repinFault refuses the version withdrawn while waiting", async () => {
    const { tx } = racingClient({ withdrawnWhileWaiting: true });
    const to = await lockVersion(tx, "v2", "org1");
    const faults = repinFault({ purpose: "SIGNED_MINUTES", owner: MINUTED, reason: "Rescanned", attachment: { detachedAt: null, versionId: "v1", documentId: "doc1" }, to: to! });
    expect(faults.map((f) => f.code)).toContain("VERSION_WITHDRAWN");
  });

  it("reads nothing more if the lock is not taken", async () => {
    const { calls, tx } = racingClient({ lockFails: true });
    await expect(lockVersion(tx, "v2", "org1")).rejects.toThrow("lock timeout");
    expect(calls.map((c) => c.kind)).toEqual(["read", "lock"]);
  });

  it("null where the version is not in the organisation, before or after the lock", async () => {
    const missing = racingClient({ missing: true });
    expect(await lockVersion(missing.tx, "v2", "org1")).toBeNull();
    expect(missing.calls.map((c) => c.kind)).toEqual(["read"]);
    expect(await lockVersion(racingClient({ goneAfterLock: true }).tx, "v2", "org1")).toBeNull();
  });
});

describe("every attach path judges the version read after the document's lock (source scan)", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const body = (text: string, decl: string) => {
    const at = text.indexOf(decl);
    expect(at, decl).toBeGreaterThan(-1);
    const next = text.slice(at + decl.length).search(/\n(?:export )?(?:async )?(?:function|class|const) /);
    return text.slice(at, next < 0 ? undefined : at + decl.length + next);
  };

  it("attachDocument takes its version from lockVersion and reads no version itself", () => {
    const attach = body(src("src/app/documents/actions.ts"), "export async function attachDocument(");
    const locked = attach.indexOf("const v = await lockVersion(tx, versionId, o.organisationId);");
    expect(locked).toBeGreaterThan(-1);
    expect(attach.indexOf("attachFault(")).toBeGreaterThan(locked);
    expect(attach).not.toMatch(/tx\.documentVersion\./);
  });

  it("attachRecommendation (saveDelegation's attach) takes its version from lockVersion", () => {
    const attach = body(src("src/app/configuration/users/core.ts"), "async function attachRecommendation(");
    const locked = attach.indexOf("const v = await lockVersion(tx, versionId, orgId);");
    expect(locked).toBeGreaterThan(-1);
    expect(attach.indexOf("attachFault(")).toBeGreaterThan(locked);
    expect(attach).not.toMatch(/tx\.documentVersion\./);
  });

  it("attachNewVersion locks the pinned document before it reads the version to move to", () => {
    const repin = body(src("src/app/documents/actions.ts"), "export async function attachNewVersion(");
    const lock = repin.indexOf("await lockDocument(tx, a.version.documentId);");
    const read = repin.indexOf("const to = await tx.documentVersion.findFirst(");
    expect(lock).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(lock);
    expect(repin.indexOf("repinFault(")).toBeGreaterThan(read);
    // Only the one version read, and it carries what repinFault judges.
    expect(repin.match(/tx\.documentVersion\./g)).toHaveLength(1);
    expect(repin).toMatch(/select: \{ \.\.\.LOCKED_VERSION_SELECT,/);
  });
});

describe("storeUpload holds the class before reading it (review carry 8)", () => {
  it("shareDocumentClass takes FOR SHARE on the class row, within the organisation", async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const tx = { $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => (calls.push({ sql: strings.join("?"), values }), Promise.resolve([])) } as unknown as Tx;
    await shareDocumentClass(tx, "dc1", "org1");
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/FROM "DocumentClass" WHERE id = \? AND "organisationId" = \? FOR SHARE/);
    expect(calls[0].values).toEqual(["dc1", "org1"]);
  });
  it("storeUpload takes it before its one read of the class (source scan)", () => {
    const text = readFileSync(join(process.cwd(), "src/lib/documents/service.ts"), "utf8");
    const store = text.slice(text.indexOf("export async function storeUpload("));
    const share = store.indexOf("await shareDocumentClass(tx, i.documentClassId, i.org.id);");
    const read = store.indexOf("tx.documentClass.findFirst(");
    expect(share).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(share);
    expect(store.match(/tx\.documentClass\.find/g)).toHaveLength(1);
  });
});
