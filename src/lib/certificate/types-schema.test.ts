import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BLOCK_KIND_WORDS, CHECK_KIND_WORDS, CONDITION_WORDS, DECISION_WORDS, KIND_WORDS, METHOD_WORDS, OFFICE_RULE_WORDS, STATUS_TONE, STATUS_WORDS, SUBJECT_WORDS } from "./labels";
import { KIND_FIGURE_KEYS } from "./fields";
import { CERTIFICATE_TRANSITIONS } from "./status";
import { CERTIFICATE_KINDS, CERTIFICATE_STATUSES, DELIVERY_METHODS, DISTRIBUTION_CONDITIONS, ROUTING_CHECK_KINDS, ROUTING_SUBJECTS, SIGNATURE_BLOCK_KINDS, SIGNATURE_DECISIONS, SIGNATURE_OFFICE_RULES } from "./types";

/**
 * X-6 and X-8 for the certificate core (6.14 increment 1): the schema's enums, the lib's lists and every map
 * over them agree; the kinds arrived alone in a migration of their own before any table used them; the
 * CERTIFICATE matter kind arrived alone before use; and every owner CHECK the core builds by hand counts
 * exactly the owner keys the schema declares.
 */

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const dir = join(root, "prisma/migrations");
const migrations = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const sqlOf = (m: string) => readFileSync(join(dir, m, "migration.sql"), "utf8");
const statements = (m: string) => sqlOf(m).split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));

function enumValues(name: string): string[] {
  const m = new RegExp(`\\nenum ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!m) throw new Error(`enum ${name} not found`);
  return m[1].split("\n").map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));
}

function latestCheck(name: string): string {
  let found: string | null = null;
  for (const d of migrations) for (const m of sqlOf(d).matchAll(new RegExp(`ADD CONSTRAINT "${name}"\\s*CHECK\\s*([\\s\\S]*?);`, "g"))) found = m[1];
  if (!found) throw new Error(`no CHECK ${name}`);
  return found;
}

function modelBody(name: string): string {
  const m = new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!m) throw new Error(`model ${name} not found`);
  return m[1];
}

describe("the schema's enums are the lib's lists, in order", () => {
  it.each([
    ["CertificateKind", CERTIFICATE_KINDS],
    ["CertificateStatus", CERTIFICATE_STATUSES],
    ["SignatureBlockKind", SIGNATURE_BLOCK_KINDS],
    ["SignatureOfficeRule", SIGNATURE_OFFICE_RULES],
    ["SignatureDecision", SIGNATURE_DECISIONS],
    ["DistributionCondition", DISTRIBUTION_CONDITIONS],
    ["RoutingCheckKind", ROUTING_CHECK_KINDS],
    ["RoutingSubject", ROUTING_SUBJECTS],
    ["DeliveryMethod", DELIVERY_METHODS],
  ] as const)("%s", (name, list) => {
    expect(enumValues(name)).toEqual([...list]);
  });
});

describe("every map is exhaustive (X-8), with both languages", () => {
  const sets: [string, Record<string, unknown>, readonly string[]][] = [
    ["kind", KIND_WORDS, CERTIFICATE_KINDS],
    ["kind's figure keys", KIND_FIGURE_KEYS, CERTIFICATE_KINDS],
    ["status", STATUS_WORDS, CERTIFICATE_STATUSES],
    ["status tone", STATUS_TONE, CERTIFICATE_STATUSES],
    ["transitions", CERTIFICATE_TRANSITIONS, CERTIFICATE_STATUSES],
    ["block kind", BLOCK_KIND_WORDS, SIGNATURE_BLOCK_KINDS],
    ["office rule", OFFICE_RULE_WORDS, SIGNATURE_OFFICE_RULES],
    ["decision", DECISION_WORDS, SIGNATURE_DECISIONS],
    ["condition", CONDITION_WORDS, DISTRIBUTION_CONDITIONS],
    ["check kind", CHECK_KIND_WORDS, ROUTING_CHECK_KINDS],
    ["subject", SUBJECT_WORDS, ROUTING_SUBJECTS],
    ["method", METHOD_WORDS, DELIVERY_METHODS],
  ];
  it.each(sets)("%s", (_n, map, list) => {
    expect(Object.keys(map).sort()).toEqual([...list].sort());
    for (const v of Object.values(map)) if (v && typeof v === "object" && "en" in (v as object)) expect((v as { ms: string }).ms.trim()).not.toBe("");
  });
});

describe("migrations (X-6)", () => {
  it("CertificateKind was created alone, before the migration that made the tables", () => {
    const own = migrations.filter((m) => /CREATE TYPE "CertificateKind"/.test(sqlOf(m)));
    expect(own).toHaveLength(1);
    expect(statements(own[0])).toHaveLength(1);
    const used = migrations.filter((m) => m !== own[0] && sqlOf(m).includes('"CertificateKind"'));
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(own[0] < u).toBe(true);
  });
  it("MatterKind CERTIFICATE arrived alone, before any use", () => {
    const own = migrations.filter((m) => /ALTER TYPE "MatterKind" ADD VALUE 'CERTIFICATE'/.test(sqlOf(m)));
    expect(own).toHaveLength(1);
    expect(statements(own[0])).toHaveLength(1);
    for (const u of migrations.filter((m) => m !== own[0] && sqlOf(m).includes("'CERTIFICATE'"))) expect(own[0] < u).toBe(true);
    expect(enumValues("MatterKind")).toContain("CERTIFICATE");
  });
  it("no migration comment carries a semicolon (the WASM engine splits on every one)", () => {
    for (const m of migrations.filter((x) => x >= "20261003100100")) for (const l of sqlOf(m).split("\n")) if (l.trim().startsWith("--")) expect(l, m).not.toMatch(/;/);
  });
});

describe("owner CHECKs count exactly the schema's owner keys", () => {
  const ownerKeys = (model: string, keys: string[]) => keys.filter((k) => new RegExp(`\\n\\s+${k}\\s+String\\?`).test(`\n${modelBody(model)}`));
  const cols = (def: string) => /num_nonnulls\(([^)]*)\)/.exec(def)![1].split(",").map((c) => c.trim().replace(/"/g, "")).sort();
  it("IssuedCopy: a contract or a certificate", () => {
    expect(cols(latestCheck("IssuedCopy_one_owner"))).toEqual(ownerKeys("IssuedCopy", ["contractId", "certificateId"]).sort());
    expect(cols(latestCheck("IssuedCopy_one_owner"))).toEqual(["certificateId", "contractId"]);
  });
  it("RoutingCheck: a certificate or an award", () => {
    expect(cols(latestCheck("RoutingCheck_one_owner"))).toEqual(ownerKeys("RoutingCheck", ["certificateId", "awardId"]).sort());
    expect(cols(latestCheck("RoutingCheck_one_owner"))).toEqual(["awardId", "certificateId"]);
  });
  it("a CERTIFICATE route names its certificate, and only it does", () => {
    expect(latestCheck("ApprovalInstance_certificate_matter")).toBe(`(("certificateId" IS NOT NULL) = ("matterKind" = 'CERTIFICATE'))`);
  });
  it("a certificate is numbered exactly when issued; one dating block per form", () => {
    expect(latestCheck("Certificate_issued")).toMatch(/"number" IS NOT NULL\) = \("status" = 'ISSUED'\)/);
    expect(migrations.some((m) => /CREATE UNIQUE INDEX "FormSignatureBlock_one_dating_block" ON "FormSignatureBlock"\("templateId"\) WHERE "datesCertificate"/.test(sqlOf(m)))).toBe(true);
  });
});
