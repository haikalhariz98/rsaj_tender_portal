import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ATTACHMENT_PURPOSES, OWNER_COLUMN, OWNER_KINDS, PURPOSE_OWNER } from "./types";

/**
 * X-6: every migration that adds an attachment owner rebuilds the owner CHECKs from the
 * full owner list. This compares three things that must say the same: the owner keys on
 * DocumentAttachment in schema.prisma, the latest `DocumentAttachment_one_owner` and
 * `DocumentAttachment_purpose_owner` definitions across the migration folders (in the order
 * they apply), and the lib's OWNER_COLUMN / PURPOSE_OWNER. An owner added in one place only
 * fails here.
 */

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migrationsDir = join(root, "prisma/migrations");
const migrations = readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

function modelBody(name: string): string {
  const m = new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!m) throw new Error(`model ${name} not found`);
  return m[1];
}

/// The last definition of a constraint, across the migrations in the order they apply.
function latestCheck(name: string): string {
  let found: string | null = null;
  for (const dir of migrations) {
    const sql = readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8");
    const re = new RegExp(`ADD CONSTRAINT "${name}"\\s*CHECK\\s*([\\s\\S]*?);`, "g");
    for (const m of sql.matchAll(re)) found = m[1];
  }
  if (!found) throw new Error(`no CHECK ${name} in the migrations`);
  return found;
}

describe("attachment owners: schema, CHECK and lib agree (X-6)", () => {
  const body = modelBody("DocumentAttachment");
  // Every nullable key with a relation, other than the version it pins, is an owner.
  const schemaOwners = [...body.matchAll(/^\s*\w+\s+\w+\?\s+@relation\(fields: \[(\w+)\]/gm)].map((m) => m[1]).sort();

  it("the schema's owner keys are the lib's owner columns", () => {
    expect(schemaOwners).toEqual([...Object.values(OWNER_COLUMN)].sort());
    expect(OWNER_KINDS.map((k) => OWNER_COLUMN[k]).sort()).toEqual(schemaOwners);
  });

  it("one_owner counts exactly those keys", () => {
    const def = latestCheck("DocumentAttachment_one_owner");
    const m = /num_nonnulls\(([^)]*)\)\s*=\s*1/.exec(def);
    expect(m, def).not.toBeNull();
    const cols = m![1].split(",").map((c) => c.trim().replace(/"/g, "")).sort();
    expect(cols).toEqual(schemaOwners);
  });

  it("purpose_owner pairs every purpose with its owner's key, as PURPOSE_OWNER does", () => {
    const def = latestCheck("DocumentAttachment_purpose_owner");
    const pairs = new Map<string, string>();
    for (const arm of def.matchAll(/\("purpose"\s*(=|IN)\s*(\([^)]*\)|'[A-Z_]+')\s*AND\s*"(\w+)"\s+IS NOT NULL\)/g)) {
      for (const p of arm[2].matchAll(/'([A-Z_]+)'/g)) pairs.set(p[1], arm[3]);
    }
    expect([...pairs.keys()].sort()).toEqual([...ATTACHMENT_PURPOSES].sort());
    for (const p of ATTACHMENT_PURPOSES) expect(pairs.get(p), p).toBe(OWNER_COLUMN[PURPOSE_OWNER[p]]);
  });

  it("the schema's AttachmentPurpose enum is the lib's list", () => {
    const m = /\nenum AttachmentPurpose \{([\s\S]*?)\n\}/.exec(schema);
    const values = m![1].split("\n").map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));
    expect(values).toEqual([...ATTACHMENT_PURPOSES]);
  });
});

describe("6.2 Q-3: the bill version is an owner, everywhere at once", () => {
  it("bqVersionId is counted by one_owner and BQ_IMPORT_SOURCE pairs with it", () => {
    const one = latestCheck("DocumentAttachment_one_owner");
    expect(one).toMatch(/"bqVersionId"/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose"\s*=\s*'BQ_IMPORT_SOURCE'\s*AND\s*"bqVersionId"\s+IS NOT NULL\)/);
    expect(OWNER_COLUMN.bqVersion).toBe("bqVersionId");
    expect(PURPOSE_OWNER.BQ_IMPORT_SOURCE).toBe("bqVersion");
  });
});
