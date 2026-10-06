import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import type { Tx } from "@/lib/audit/record";

import { lockDelegation, LOCKED_DELEGATION_SELECT } from "./lock";

/**
 * BD-DS-16 as ruled (2026-10-01): both delegation attach paths — `saveDelegation`
 * (src/app/configuration/users/actions.ts) and the generic attach behind the shared panel
 * (src/app/documents/actions.ts, through `withLockedOwner` in src/lib/documents/owners.ts)
 * — run `attachFault` on data read under the Delegation row lock. Proved two ways: the one
 * helper both use takes the lock before it reads (behaviour, on a recording client), and
 * a scan of both paths' source that fails if either reads the delegation another way.
 */

type ReadArgs = { where: Record<string, unknown>; select: Record<string, unknown> };
type Call = { kind: "lock"; sql: string; values: unknown[] } | { kind: "read"; args: ReadArgs };

function recordingClient(row: unknown, opts: { lockFails?: boolean } = {}) {
  const calls: Call[] = [];
  const tx = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ kind: "lock", sql: strings.join("?"), values });
      return opts.lockFails ? Promise.reject(new Error("lock timeout")) : Promise.resolve([]);
    },
    delegation: {
      findFirst: (args: ReadArgs) => {
        calls.push({ kind: "read", args });
        return Promise.resolve(row);
      },
    },
  };
  return { calls, tx: tx as unknown as Tx };
}

const ROW = {
  id: "dg3",
  organisationId: "org1",
  toPersonId: "p4",
  effectiveTo: new Date("2026-10-16T00:00:00.000Z"),
  capabilityCodes: ["run_sourcing"],
  holderRecommendation: "Recommended before her leave.",
  recommendationTextOnlyAtLanding: true,
  fromPerson: { name: "Puan Aminah" },
  toPerson: { name: "Encik Rahman" },
  attachments: [
    { detachedAt: null, version: { withdrawnAt: null } },
    { detachedAt: new Date("2026-09-30T00:00:00.000Z"), version: { withdrawnAt: null } },
    { detachedAt: null, version: { withdrawnAt: new Date("2026-09-30T00:00:00.000Z") } },
  ],
};

describe("lockDelegation: the lock, then the read", () => {
  it("takes FOR UPDATE on the Delegation row before reading it", async () => {
    const { calls, tx } = recordingClient(ROW);
    await lockDelegation(tx, "dg3", "org1");
    expect(calls.map((c) => c.kind)).toEqual(["lock", "read"]);
    const lock = calls[0] as Extract<Call, { kind: "lock" }>;
    expect(lock.sql).toMatch(/FROM "Delegation" WHERE id = \? FOR UPDATE/);
    expect(lock.values).toEqual(["dg3"]);
  });

  it("reads only within the organisation, with the terms, the mark and every recommendation attachment", async () => {
    const { calls, tx } = recordingClient(ROW);
    await lockDelegation(tx, "dg3", "org1");
    const read = calls[1] as Extract<Call, { kind: "read" }>;
    expect(read.args.where).toEqual({ id: "dg3", organisationId: "org1" });
    expect(read.args.select).toBe(LOCKED_DELEGATION_SELECT);
    for (const k of ["fromPersonId", "roleCode", "toPersonId", "effectiveFrom", "effectiveTo", "capabilityCodes", "holderRecommendation", "recommendationTextOnlyAtLanding"]) expect(LOCKED_DELEGATION_SELECT, k).toHaveProperty(k, true);
    // Every attachment of the purpose, live or not: "no longer attached" needs the ones that are not.
    expect(LOCKED_DELEGATION_SELECT.attachments.where).toEqual({ purpose: "HOLDER_RECOMMENDATION" });
  });

  it("counts live and ever-made recommendation attachments from what it read", async () => {
    const { tx } = recordingClient(ROW);
    const d = await lockDelegation(tx, "dg3", "org1");
    expect(d).toMatchObject({ id: "dg3", liveAttachments: 1, everAttachments: 3, recommendationTextOnlyAtLanding: true, effectiveTo: ROW.effectiveTo });
    expect(d).not.toHaveProperty("attachments");
  });

  it("reads nothing if the lock is not taken", async () => {
    const { calls, tx } = recordingClient(ROW, { lockFails: true });
    await expect(lockDelegation(tx, "dg3", "org1")).rejects.toThrow("lock timeout");
    expect(calls.map((c) => c.kind)).toEqual(["lock"]);
  });

  it("null where the delegation is not in the organisation", async () => {
    const { tx } = recordingClient(null);
    expect(await lockDelegation(tx, "dg3", "org1")).toBeNull();
  });
});

describe("both delegation attach paths judge on what lockDelegation read (source scan)", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  /// The text of a function, from its declaration to the next top-level declaration.
  const body = (text: string, decl: string) => {
    const at = text.indexOf(decl);
    expect(at, decl).toBeGreaterThan(-1);
    const next = text.slice(at + decl.length).search(/\n(?:export )?(?:async )?(?:function|class|const) /);
    return text.slice(at, next < 0 ? undefined : at + decl.length + next);
  };

  it("the generic attach: withLockedOwner's delegation case locks through lockDelegation and builds its facts from that read", () => {
    const owners = src("src/lib/documents/owners.ts");
    const delegationCase = owners.slice(owners.indexOf('case "delegation":'), owners.indexOf("/// Which owner an attachment belongs to."));
    expect(delegationCase).toMatch(/const d = await lockDelegation\(tx, ref\.id, org\.id\);/);
    expect(delegationCase).toMatch(/delegationFacts\(d, today\)/);
    expect(delegationCase).not.toMatch(/tx\.delegation\.|db\.delegation\.|FOR UPDATE/);
    // And attachDocument judges attachFault on those facts, inside the owner's lock.
    const attach = body(src("src/app/documents/actions.ts"), "export async function attachDocument(");
    expect(attach).toMatch(/return inOwner\(toAuditActor\(actor\), ref, async \(tx, o\) => \{/); // Phase 1b: who acted is the first argument
    expect(attach).toMatch(/attachFault\(\{ purpose, owner: o\.facts,/);
  });

  it("saveDelegation: lock first, every read in the transaction, faultsIn on the locked row", () => {
    const actions = src("src/app/configuration/users/actions.ts");
    const save = body(actions, "export async function saveDelegation(");
    const tx = save.indexOf("db.$transaction(async (tx) => {");
    const lock = save.indexOf("lockDelegation(tx, id, orgId)");
    const judged = save.indexOf("faultsIn(");
    expect(tx).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(tx);
    expect(judged).toBeGreaterThan(lock);
    // Nothing that feeds the decision is read outside the transaction.
    expect(save).not.toMatch(/\bdb\.(delegation|capability|roleAssignment|authorityRule|person)\./);
    expect(save).toMatch(/recordedBeforeAttachments: standsOnTextBeforeAttachments\(stored, v\)/);
    expect(save).toMatch(/recommendationAttached: \(stored\?\.liveAttachments \?\? 0\) > 0/);
  });

  it("saveDelegation's attach: attachRecommendation reads the delegation through lockDelegation before attachFault", () => {
    const attach = body(src("src/app/configuration/users/actions.ts"), "async function attachRecommendation(");
    const lock = attach.indexOf("const d = await lockDelegation(tx, delegationId, orgId);");
    expect(lock).toBeGreaterThan(-1);
    expect(attach.indexOf("attachFault(")).toBeGreaterThan(lock);
    expect(attach).toMatch(/owner: delegationFacts\(d,/);
    expect(attach).not.toMatch(/tx\.delegation\.find/);
  });
});

describe("the legacy mark is never written by the application (source scan)", () => {
  const ROOT = process.cwd();
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      const rel = relative(ROOT, p).replace(/\\/g, "/");
      if (statSync(p).isDirectory()) return rel === "src/generated" ? [] : files(p);
      return /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n) ? [rel] : [];
    });

  /// Every `.delegation.<write>(...)` call, with its whole argument text.
  const writes = (text: string) => {
    const out: string[] = [];
    const re = /\.delegation\.(create|createMany|update|updateMany|upsert)\(/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < text.length && depth > 0; i++) depth += text[i] === "(" ? 1 : text[i] === ")" ? -1 : 0;
      out.push(text.slice(m.index, i));
    }
    return out;
  };

  it("no delegation write in src/ names it, or spreads a row read with it", () => {
    let seen = 0;
    for (const f of files(join(ROOT, "src"))) {
      const text = readFileSync(join(ROOT, f), "utf8");
      expect(text, f).not.toMatch(/"recommendationTextOnlyAtLanding"/); // raw SQL
      for (const w of writes(text)) {
        seen++;
        expect(w, f).not.toMatch(/recommendationTextOnlyAtLanding/);
        expect(w, f).not.toMatch(/\.\.\.(stored|locked|before|row|d)\b/);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(2); // saveDelegation's create and update
  });
});
