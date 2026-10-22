import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { decidingDelegates as fromQueue } from "@/lib/approvals/queue";

import { decidingDelegates, someoneCanAct } from "./absence";

/**
 * One shared test of "able to act" (product owner, 2026-10-08, ruling on log line 1790): `someoneCanAct` applies the same ceiling and holder-only checks as
 * `decidingDelegates`, so the worklist, My steps and the sweep share one reading. A step shown as decidable when nobody can decide it is a gap shown as finished.
 */

const RM = (n: number) => BigInt(n) * 100n;
const delegate = (personId: string, valueCeiling: string | null) => ({ personId, delegation: { valueCeiling } });
const office = (holderIds: string[], delegates: ReturnType<typeof delegate>[]) => ({ holderIds, delegates });
const only = (...ids: string[]) => (p: string) => ids.includes(p);

describe("someoneCanAct judges a step, as the decision rule does", () => {
  it("a holder who is available can act, whatever the delegates are", () => {
    expect(someoneCanAct(office(["h"], []), only("h"), { nonDelegable: true }, RM(1))).toBe(true);
    expect(someoneCanAct(office(["h"], [delegate("d", "1.00")]), only("h"), {}, RM(10_000))).toBe(true);
  });

  it("an available delegate whose ceiling is below the route's value cannot act, so the step is stuck, not 'someone can'", () => {
    const o = office(["away"], [delegate("capped", "50000.00")]);
    expect(someoneCanAct(o, only("capped"), {}, RM(2_000_000))).toBe(false);
    expect(someoneCanAct(o, only("capped"), {}, RM(50_000))).toBe(true);
    expect(someoneCanAct(o, only("capped"), {}, RM(50_001))).toBe(false);
  });

  it("an available delegate cannot act on a step only the holder may decide", () => {
    const o = office(["away"], [delegate("free", null)]);
    expect(someoneCanAct(o, only("free"), { nonDelegable: true }, RM(1))).toBe(false);
    expect(someoneCanAct(o, only("free"), { nonDelegable: false }, RM(1))).toBe(true);
  });

  it("a delegate with no ceiling, or a route with no known value, is not limited", () => {
    expect(someoneCanAct(office([], [delegate("free", null)]), only("free"), {}, RM(9_999_999))).toBe(true);
    expect(someoneCanAct(office([], [delegate("capped", "1.00")]), only("capped"), {}, null)).toBe(true);
  });

  it("a delegate who is away does not count, and a vacant office has nobody", () => {
    expect(someoneCanAct(office([], [delegate("gone", null)]), only(), {}, RM(1))).toBe(false);
    expect(someoneCanAct(office([], []), () => true, {}, RM(1))).toBe(false);
  });

  it("is the very delegate list My steps shows (one function, re-exported)", () => {
    expect(fromQueue).toBe(decidingDelegates);
  });
});

describe("the worklist and the sweep ask it with the step and the route's value", () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), ...p.split("/")), "utf8");
  it("load.ts (nobody able to act) and escalateOne (holderAvailable) both pass the step and the value, from the one helper", () => {
    const load = read("src/lib/approvals/load.ts");
    expect(load).toMatch(/someoneCanAct\(h, available, stepOfRoute\.get\(routeId\) \?\? \{\}, valueOfRoute\.get\(routeId\)\)/);
    expect(load).toMatch(/ceilingValue\(r, supplierMatter\(r\)\)/);
    const acts = read("src/app/approvals/actions.ts");
    // ADR 0041 D5 (registration step 4): a whole online application's route is a supplier matter too, routed on no value.
    expect(acts).toMatch(/someoneCanAct\(holders, available, step, ceilingValue\(inst, supplierId != null \|\| permissionId != null \|\| portalId != null\)\)/);
  });
});
