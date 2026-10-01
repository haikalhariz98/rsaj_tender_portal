import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import { approvalDatesFault } from "@/lib/tender-docs/tendering";

import { actionResult, versionContext, versionFaults } from "./estimate";
import { scopeFaultText } from "./labels";

/**
 * X-1 (6.4, Q-4 A): once the approval for tendering records the closing, an estimate is
 * neither prepared nor amended at or after it. The estimate actions read the closing from
 * the exercise row they hold locked (`versionContext(l, now)`); end to end here, from the
 * closing the approving step records to the refusal the officer reads, and by a scan that
 * the actions and the tab take the closing from the exercise, never `null`.
 */

const TZ = "Asia/Kuala_Lumpur";
// The approving step records 29 October, 14:30 (X-2).
const { closingAt } = approvalDatesFault({ startOn: "2026-10-12", closingDay: "2026-10-29", closingTime: "14:30", timeZone: TZ, today: "2026-10-01" });
// The exercise as the action holds it under its lock, once approved for tendering.
const locked = { ex: { closingAt, status: "APPROVED_FOR_TENDERING" as const }, org: { timeZone: TZ } };
const amend = (now: Date) => actionResult(versionFaults({ value: parseSen("148600.00"), personId: "p1", reason: "Re-measured" }, { state: "LODGED", preparerPersonId: "p1" }, versionContext(locked, now)));
const prepare = (now: Date) => actionResult(versionFaults({ value: parseSen("148600.00"), personId: "p1", reason: "" }, null, versionContext(locked, now)));
/// What the action hands the officer: codes only, as fixed sentences (refuseCodes).
const refusal = (r: ReturnType<typeof amend>) => (r.ok ? null : `Nothing was saved: ${r.codes.map((c) => scopeFaultText(c as Parameters<typeof scopeFaultText>[0])).join(" ")}`);

describe("X-1: the recorded closing binds the estimate", () => {
  it("one minute before the closing, an amendment is taken", () => {
    expect(amend(new Date("2026-10-29T06:29:00Z"))).toEqual({ ok: true });
  });
  it("at the closing instant (14:30:00 local), and after it, an amendment is refused, saying why", () => {
    for (const now of [new Date("2026-10-29T06:30:00Z"), new Date("2026-11-02T01:00:00Z")]) {
      const r = amend(now);
      expect(r).toEqual({ ok: false, codes: ["AFTER_CLOSING"] });
      expect(refusal(r)).toBe(`Nothing was saved: ${scopeFaultText("AFTER_CLOSING")}`);
      // Never the figure or the reason (ADR 0012).
      expect(refusal(r)).not.toMatch(/148,?600|Re-measured/);
    }
    expect(prepare(new Date("2026-10-29T06:30:00Z"))).toEqual({ ok: false, codes: ["AFTER_CLOSING"] });
  });
  it("before tendering is approved there is no closing: it says so and does not block", () => {
    const open = { ex: { closingAt: null, status: "DOCUMENTS_IN_PREPARATION" as const }, org: { timeZone: TZ } };
    const f = versionFaults({ value: parseSen("1.00"), personId: "p1", reason: "" }, null, versionContext(open, new Date("2027-01-01T00:00:00Z")));
    expect(f.map((x) => [x.code, x.level])).toEqual([["CLOSING_NOT_SET", "info"]]);
  });
});

describe("the estimate actions and tab take the closing from the exercise (source scan)", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("both version-making actions judge under versionContext(l, …), and none passes a null closing", () => {
    const actions = src("src/app/sourcing/[id]/scope/actions.ts");
    expect(actions.match(/versionFaults\([^;]*versionContext\(l, new Date\(\)\)\)/g)?.length).toBe(2);
    expect(actions.match(/versionFaults\(/g)?.length).toBe(2);
    expect(actions).not.toMatch(/closingAt:\s*null/);
  });
  it("the estimate tab reads the exercise's closing", () => {
    const read = src("src/lib/scope/read.ts");
    expect(read).toMatch(/const closingAt: Date \| null = ex\.closingAt;/);
    expect(read).toMatch(/closingAt: true/);
  });
});
