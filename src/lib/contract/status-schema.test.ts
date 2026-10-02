import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTRACT_STATUS_LABEL } from "@/lib/award/labels";

import { CONTRACT_STATUS_WORDS, PHASE_TONE, PHASE_WORDS } from "./labels";
import { CONTRACT_PHASES, CONTRACT_TRANSITIONS } from "./status";
import { CONTRACT_STATUSES } from "./types";

/**
 * X-6 and X-8 for the contract (6.12): the schema's ContractStatus, the lib's list and every map over
 * them agree, and each state 6.12 adds arrived alone in a migration of its own, before any migration
 * used it.
 */

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const dir = join(root, "prisma/migrations");
const migrations = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const sqlOf = (m: string) => readFileSync(join(dir, m, "migration.sql"), "utf8");
const statements = (m: string) => sqlOf(m).split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));

describe("ContractStatus: schema, lib and maps agree", () => {
  it("the schema's enum is the lib's list, in order", () => {
    const m = /\nenum ContractStatus \{([\s\S]*?)\n\}/.exec(schema);
    const values = m![1].split("\n").map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));
    expect(values).toEqual([...CONTRACT_STATUSES]);
  });

  it("every map names every state (the award's label map too)", () => {
    for (const map of [CONTRACT_STATUS_WORDS, CONTRACT_TRANSITIONS, CONTRACT_STATUS_LABEL]) expect(Object.keys(map).sort()).toEqual([...CONTRACT_STATUSES].sort());
    for (const map of [PHASE_WORDS, PHASE_TONE]) expect(Object.keys(map).sort()).toEqual([...CONTRACT_PHASES].sort());
    expect(CONTRACT_PHASES.filter((p) => !(CONTRACT_STATUSES as readonly string[]).includes(p)).sort()).toEqual(["AWAITING_CONDITIONS", "READY_TO_SIGN"]);
  });

  it.each(["IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED", "EXECUTED", "STAMPED", "ACTIVE"])("%s arrived alone in its own migration, before any use", (value) => {
    const own = migrations.filter((m) => new RegExp(`ALTER TYPE "ContractStatus" ADD VALUE '${value}'`).test(sqlOf(m)));
    expect(own).toHaveLength(1);
    expect(statements(own[0])).toHaveLength(1);
    const used = migrations.filter((m) => m !== own[0] && sqlOf(m).includes(`'${value}'`));
    for (const u of used) expect(own[0] < u).toBe(true);
  });

  it("the derived phases are never stored", () => {
    expect(schema).not.toMatch(/\n\s+AWAITING_CONDITIONS\n/);
    expect(schema).not.toMatch(/\n\s+READY_TO_SIGN\n/);
  });
});
