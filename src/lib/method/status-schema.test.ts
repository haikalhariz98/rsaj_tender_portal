import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXERCISE_TRANSITIONS } from "./exercise";
import { EXERCISE_STATUS_LABEL, EXERCISE_STATUS_ORDER, EXERCISE_STATUS_TONE } from "./labels";
import { EXERCISE_STATUSES } from "./types";

/**
 * X-6 and X-8: the exercise's states are one list. The schema's enum, the lib's list and
 * every map over them agree, and each state 6.4 added arrived in a migration of its own,
 * holding that value and nothing else, before any migration used it.
 */

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const dir = join(root, "prisma/migrations");
const migrations = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const sqlOf = (m: string) => readFileSync(join(dir, m, "migration.sql"), "utf8");
const statements = (m: string) => sqlOf(m).split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));

describe("ExerciseStatus: schema, lib and maps agree", () => {
  it("the schema's enum is the lib's list, in order", () => {
    const m = /\nenum ExerciseStatus \{([\s\S]*?)\n\}/.exec(schema);
    const values = m![1].split("\n").map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));
    expect(values).toEqual([...EXERCISE_STATUSES]);
  });

  it("every map names every state", () => {
    for (const map of [EXERCISE_STATUS_LABEL, EXERCISE_STATUS_TONE, EXERCISE_TRANSITIONS]) expect(Object.keys(map).sort()).toEqual([...EXERCISE_STATUSES].sort());
    expect([...EXERCISE_STATUS_ORDER].sort()).toEqual([...EXERCISE_STATUSES].sort());
  });

  it.each(["PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING"])("%s arrived alone in its own migration, before any use", (value) => {
    const own = migrations.filter((m) => new RegExp(`ALTER TYPE "ExerciseStatus" ADD VALUE '${value}'`).test(sqlOf(m)));
    expect(own).toHaveLength(1);
    expect(statements(own[0])).toHaveLength(1);
    const used = migrations.filter((m) => m !== own[0] && sqlOf(m).includes(`'${value}'`));
    for (const u of used) expect(own[0] < u).toBe(true);
  });
});
