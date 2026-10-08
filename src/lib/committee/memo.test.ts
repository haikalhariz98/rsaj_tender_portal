import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NOT_CARRIED_EVENT_KEY } from "./labels";
import { MEMO_STATES, memoPlan, memoWords } from "./memo";

const holders: Record<string, string[]> = { HOD: ["amir"], FD: ["chen", "amir"], EMPTY: [] };
const holdersOf = (code: string) => holders[code] ?? [];

describe("the not-approved memo (FR-CTE-009): who is told is the organisation's choice, never the product's", () => {
  it("is issued to the holders of the offices the rule names, once each", () => {
    expect(memoPlan({ isActive: true, recipientRoleCodes: ["HOD", "FD"] }, holdersOf)).toEqual({ state: "ISSUED", recipientIds: ["amir", "chen"] });
  });

  it("is not issued where no rule is set, and nobody is picked in its place", () => {
    expect(memoPlan(null, holdersOf)).toEqual({ state: "NO_RULE" });
    expect(memoWords("NO_RULE", 0).text).toMatch(/no notification rule is set/);
    expect(memoWords("NO_RULE", 0).text).toMatch(/Configuration, Notifications/);
  });

  it("is not issued where the rule is switched off: that records that nobody is to be told", () => {
    expect(memoPlan({ isActive: false, recipientRoleCodes: ["HOD"] }, holdersOf)).toEqual({ state: "RULE_OFF" });
  });

  it("is not issued where nobody holds the offices named, and says so", () => {
    expect(memoPlan({ isActive: true, recipientRoleCodes: ["EMPTY"] }, holdersOf)).toEqual({ state: "NO_ONE_HOLDS" });
    expect(memoPlan({ isActive: true, recipientRoleCodes: [] }, holdersOf)).toEqual({ state: "NO_ONE_HOLDS" });
  });

  it("is not issued where the organisation's time zone is not set, and says that rather than that nobody holds the office", () => {
    expect(memoPlan({ isActive: true, recipientRoleCodes: ["HOD"] }, holdersOf, false)).toEqual({ state: "NO_TIME_ZONE" });
    expect(memoWords("NO_TIME_ZONE", 0).text).toMatch(/time zone is not set/);
    expect(memoWords("NO_TIME_ZONE", 0).text).not.toMatch(/nobody holds/);
    // The rule's own off and unset states still come first: with no rule nobody was to be told, whatever the zone.
    expect(memoPlan(null, holdersOf, false)).toEqual({ state: "NO_RULE" });
    expect(memoPlan({ isActive: false, recipientRoleCodes: ["HOD"] }, holdersOf, false)).toEqual({ state: "RULE_OFF" });
  });

  it("says in words what was recorded, and that nothing was sent by email", () => {
    expect(memoWords("ISSUED", 2).text).toContain("2 people");
    expect(memoWords("ISSUED", 1).text).toContain("1 person");
    expect(memoWords("ISSUED", 2).text).toContain("not sent — email is not connected (INT-09)");
    expect(memoWords(null, 0).text).toMatch(/before memos were issued/);
  });
});

describe("the closed list of memo states", () => {
  it("is the list the database CHECK names", () => {
    // The CHECK is replaced, not edited, by each migration that adds a state (the applied ones are never rewritten): the latest migration that names it is the one in force.
    // 2026-10-10 (Phase 3c review): NO_TIME_ZONE was added in 20261010090000_not_carried_memo_no_time_zone, so this reads the newest file naming the CHECK. The assertion is unchanged.
    const dir = path.join(process.cwd(), "prisma/migrations");
    const naming = readdirSync(dir)
      .filter((d) => d !== "migration_lock.toml")
      .sort()
      .map((d) => readFileSync(path.join(dir, d, "migration.sql"), "utf8"))
      .filter((sql) => /ADD CONSTRAINT "CommitteeDecision_memo_state_known"/.test(sql.replace(/^--.*$/gm, "")));
    const sql = naming[naming.length - 1] ?? "";
    const check = /ADD CONSTRAINT "CommitteeDecision_memo_state_known" CHECK \(\("memoState" IS NULL OR "memoState" IN \(([^)]*)\)\)/.exec(sql.replace(/^--.*$/gm, ""));
    expect(check, "the CHECK is in a migration").toBeTruthy();
    expect([...check![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...MEMO_STATES].sort());
  });

  it("is raised for the event the notification screen already configures", () => {
    expect(NOT_CARRIED_EVENT_KEY).toBe("committee_matter_not_carried");
  });
});
