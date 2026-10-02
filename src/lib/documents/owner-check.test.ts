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

describe("6.4: the tender pack part is an owner, everywhere at once (X-6)", () => {
  it("tenderPackPartId is counted by one_owner and TENDER_PART pairs with it", () => {
    expect(latestCheck("DocumentAttachment_one_owner")).toMatch(/"tenderPackPartId"/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose"\s*=\s*'TENDER_PART'\s*AND\s*"tenderPackPartId"\s+IS NOT NULL\)/);
    expect(OWNER_COLUMN.tenderPackPart).toBe("tenderPackPartId");
    expect(PURPOSE_OWNER.TENDER_PART).toBe("tenderPackPart");
  });

  it("the purpose arrived in its own migration, before the migration that rebuilt the CHECKs with it", () => {
    const own = migrations.filter((d) => /ALTER TYPE "AttachmentPurpose" ADD VALUE 'TENDER_PART'/.test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => /'TENDER_PART' AND "tenderPackPartId"/.test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    expect(own[0] < used[0]).toBe(true);
    // Its own migration holds the value and nothing else.
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });
});

describe("6.5: the addendum is an owner, and the window's purposes pair with theirs, everywhere at once (X-6)", () => {
  it("addendumId is counted by one_owner and ADDENDUM_SIGNED pairs with it", () => {
    expect(latestCheck("DocumentAttachment_one_owner")).toMatch(/"addendumId"/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose"\s*=\s*'ADDENDUM_SIGNED'\s*AND\s*"addendumId"\s+IS NOT NULL\)/);
    expect(OWNER_COLUMN.addendum).toBe("addendumId");
    expect(PURPOSE_OWNER.ADDENDUM_SIGNED).toBe("addendum");
  });

  it("a publication's proof and an attendance sheet are the exercise's", () => {
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/'PUBLICATION_PROOF', 'ATTENDANCE_SHEET'\) AND "exerciseId" IS NOT NULL/);
    expect(PURPOSE_OWNER.PUBLICATION_PROOF).toBe("exercise");
    expect(PURPOSE_OWNER.ATTENDANCE_SHEET).toBe("exercise");
  });

  it.each(["ADDENDUM_SIGNED", "PUBLICATION_PROOF", "ATTENDANCE_SHEET"])("%s arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", (value) => {
    const own = migrations.filter((d) => new RegExp(`ALTER TYPE "AttachmentPurpose" ADD VALUE '${value}'`).test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes(`'${value}'`));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(own[0] < u).toBe(true);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });
});

describe("6.6: the bid withdrawal and the validity extension are owners, everywhere at once (X-6)", () => {
  it("bidWithdrawalId and validityExtensionId are counted by one_owner, and their purposes pair with them", () => {
    const one = latestCheck("DocumentAttachment_one_owner");
    expect(one).toMatch(/"bidWithdrawalId"/);
    expect(one).toMatch(/"validityExtensionId"/);
    const purpose = latestCheck("DocumentAttachment_purpose_owner");
    expect(purpose).toMatch(/\("purpose"\s*=\s*'WITHDRAWAL_LETTER'\s*AND\s*"bidWithdrawalId"\s+IS NOT NULL\)/);
    expect(purpose).toMatch(/\("purpose"\s*=\s*'VALIDITY_CONSENT'\s*AND\s*"validityExtensionId"\s+IS NOT NULL\)/);
    expect(OWNER_COLUMN.bidWithdrawal).toBe("bidWithdrawalId");
    expect(OWNER_COLUMN.validityExtension).toBe("validityExtensionId");
    expect(PURPOSE_OWNER.WITHDRAWAL_LETTER).toBe("bidWithdrawal");
    expect(PURPOSE_OWNER.VALIDITY_CONSENT).toBe("validityExtension");
  });

  it.each(["WITHDRAWAL_LETTER", "VALIDITY_CONSENT"])("%s arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", (value) => {
    const own = migrations.filter((d) => new RegExp(`ALTER TYPE "AttachmentPurpose" ADD VALUE '${value}'`).test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes(`'${value}'`));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(own[0] < u).toBe(true);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });

  it("only a LATE_TENDER matter names an envelope (CHECK)", () => {
    expect(latestCheck("CommitteeDecision_bid_envelope_late")).toMatch(/"bidEnvelopeId" IS NULL OR "matterKind" = 'LATE_TENDER'/);
  });
});

describe("6.7: the opening is an owner, everywhere at once (X-6)", () => {
  it("openingId is counted by one_owner and SIGNED_SCHEDULE pairs with it", () => {
    expect(latestCheck("DocumentAttachment_one_owner")).toMatch(/"openingId"/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose"\s*=\s*'SIGNED_SCHEDULE'\s*AND\s*"openingId"\s+IS NOT NULL\)/);
    expect(OWNER_COLUMN.opening).toBe("openingId");
    expect(PURPOSE_OWNER.SIGNED_SCHEDULE).toBe("opening");
  });

  it("the purpose arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", () => {
    const own = migrations.filter((d) => /ALTER TYPE "AttachmentPurpose" ADD VALUE 'SIGNED_SCHEDULE'/.test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes("'SIGNED_SCHEDULE'"));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(own[0] < u).toBe(true);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });
});
