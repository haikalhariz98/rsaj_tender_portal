import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { inDelayIds, type DelayReading } from "./delay";
import { DELAY_BASIS } from "./labels";

const ROOT = path.join(__dirname, "../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("review 14: the In Delay view is judged over the whole set, then paged", () => {
  it("picks the In Delay readings only", () => {
    const m = new Map<string, DelayReading>([
      ["a", { state: "IN_DELAY", why: "LAPSED", dateForCompletion: "2026-10-01", actualPct: null }],
      ["b", { state: "ON_TRACK", day: "2026-10-02", actualPct: "5", plannedPct: "5", policyPct: "75" }],
      ["c", { state: "NOT_SET" }],
      ["d", { state: "IN_DELAY", why: "BEHIND", day: "2026-10-02", actualPct: "0.5", plannedPct: "1", policyPct: "75" }],
    ]);
    expect(inDelayIds(m)).toEqual(["a", "d"]);
  });
  it("the page reads every possessed contract, then lists within those ids (never filters one page)", () => {
    const p = read("src/app/projects/page.tsx");
    expect(p).toMatch(/await inDelayContractIds\(org0\.id, today\)/);
    expect(p).toMatch(/listContracts\(page, delayView \? delayIds : null\)/);
    expect(p).not.toMatch(/\{ id: "delay", label: "In Delay" \}/);
    const l = read("src/lib/contract/load.ts");
    expect(l).toMatch(/const listed = only \? \{ \.\.\.where, id: \{ in: \[\.\.\.only\] \} \} : where;/);
    expect(l).toMatch(/db\.contract\.count\(\{ where: listed \}\)/);
    const s = read("src/lib/supervision/load.ts");
    expect(s).toMatch(/where: \{ organisationId, possession: \{ isNot: null \} \}/);
  });
});

describe("BD-613-12 ruling: the In Delay reading is tagged ASSUMED wherever shown", () => {
  it("the contract's On site and Progress cards, and the Projects list", () => {
    const panels = read("src/app/projects/[id]/supervision-panels.tsx");
    expect(panels).toMatch(/function DelayTag[\s\S]*?<ProvenanceBadge value="ASSUMED" \/>/);
    expect(panels).toMatch(/function DelayDetail[\s\S]*?<ProvenanceBadge value="ASSUMED" \/>/);
    expect(panels.match(/delayWords\(v\.delay\)/g)?.length).toBe(2);
    expect(panels).toMatch(/actions=\{d \? <DelayTag d=\{d\} \/> : undefined\}/);
    expect(panels).toMatch(/subtitle=\{d \? <DelayDetail d=\{d\} lead \/>/);
    expect(panels).not.toMatch(/\{d\.title\.en\}<\/Badge> : undefined/);
    const list = read("src/app/projects/page.tsx");
    expect(list).toMatch(/"In Delay \(assumed reading\)"/);
    expect(DELAY_BASIS).toMatch(/straight line/);
  });
});

describe("BD-613-11 ruling: a superior officer is recorded as named, the reporting line not checked", () => {
  it("the endorsement card and its form say so", () => {
    expect(read("src/app/projects/[id]/supervision-panels.tsx")).toMatch(/A superior officer is recorded as named: the reporting line is not checked\./);
    expect(read("src/app/projects/[id]/supervision-editors.tsx")).toMatch(/A superior officer is recorded as named: the reporting line is not checked/);
  });
});
