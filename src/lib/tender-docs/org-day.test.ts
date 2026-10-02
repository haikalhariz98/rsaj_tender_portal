import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dayOf } from "@/lib/dates";

import { confirmFaults } from "./assurance";

/**
 * Phase 2 close-out, 68-C5 grep: the day a pack started (its createdAt, an instant) bounds an
 * assurance confirmation (DAY_BEFORE_PACK). It is the organisation's day, and with no zone set there is
 * no day to judge by: refused in the time-zone-not-set wording, never the UTC day as before.
 */

const KL = "Asia/Kuala_Lumpur";
const createdAt = new Date("2026-09-24T23:30:00Z"); // 07:30 on 25 September in Kuala Lumpur
const base = { packStatus: "DRAFT" as const, exerciseStatus: "DOCUMENTS_IN_PREPARATION" as const, kind: "NO_AMBIGUITY" as const, parts: [{ role: "DRAWINGS" as const, state: "READY" as const }], existing: [], person: { isActive: true }, today: "2026-10-01" };

describe("the pack's started day bounds a confirmation (68-C5)", () => {
  it("a pack started at 07:30 in Kuala Lumpur started that local day: a confirmation the UTC day before is refused", () => {
    const started = dayOf(createdAt, KL);
    expect(started).toBe("2026-09-25");
    expect(confirmFaults({ ...base, confirmedOn: "2026-09-24", packStartedOn: started }).map((f) => f.code)).toEqual(["DAY_BEFORE_PACK"]);
    expect(confirmFaults({ ...base, confirmedOn: "2026-09-25", packStartedOn: started })).toEqual([]);
  });

  it("with no zone set nothing is judged on UTC's day: refused as time zone not set", () => {
    expect(confirmFaults({ ...base, confirmedOn: "2026-09-25", packStartedOn: dayOf(createdAt, null) }).map((f) => f.code)).toEqual(["TIME_ZONE_NOT_SET"]);
  });

  it("the act and the Conditions read take the started day with dayOf, with no UTC fallback (source scan)", () => {
    const act = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/documents/conditions-actions.ts"), "utf8");
    const read = readFileSync(join(process.cwd(), "src/lib/tender-docs/read-conditions.ts"), "utf8");
    expect(act).toMatch(/const startedOn = dayOf\(pack\.createdAt, l\.org\.timeZone\);/);
    expect(read).toMatch(/const startedOn = draft \? dayOf\(draft\.createdAt, org\.timeZone\) : null;/);
    for (const src of [act, read]) expect(src).not.toMatch(/createdAt\.toISOString\(\)\.slice\(0, 10\)|storedDay\(\w+\.createdAt\)/);
  });
});
