import { readFileSync } from "node:fs";
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

  it("says in words what was recorded, and that nothing was sent by email", () => {
    expect(memoWords("ISSUED", 2).text).toContain("2 people");
    expect(memoWords("ISSUED", 1).text).toContain("1 person");
    expect(memoWords("ISSUED", 2).text).toContain("not sent — email is not connected (INT-09)");
    expect(memoWords(null, 0).text).toMatch(/before memos were issued/);
  });
});

describe("the closed list of memo states", () => {
  it("is the list the database CHECK names", () => {
    const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261009110000_not_carried_memo_state/migration.sql"), "utf8");
    const check = /CommitteeDecision_memo_state_known" CHECK \(\("memoState" IS NULL OR "memoState" IN \(([^)]*)\)\)/.exec(sql);
    expect(check, "the CHECK is in the migration").toBeTruthy();
    expect([...check![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...MEMO_STATES].sort());
  });

  it("is raised for the event the notification screen already configures", () => {
    expect(NOT_CARRIED_EVENT_KEY).toBe("committee_matter_not_carried");
  });
});
