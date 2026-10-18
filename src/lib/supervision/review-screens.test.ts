import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assumedDelayIds, inDelayIds, restsOnStraightLine, type DelayReading } from "./delay";
import { DELAY_BASIS, delayWords } from "./labels";

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
    // Phase 1c (ADR 0034 D10): the list is the signed-in person's organisation's; paging and the view are as pinned.
    // AC-17 (C9): the list is the case list; its In Delay view is `listCases`' "delay" view, which takes the same contracts' ids from
    // inDelayContractIds over the whole organisation and keys them to awards, then pages (case-load.ts, tested in case-load.db.test.ts).
    expect(p).toMatch(/listCases\(actor\.organisationId, hidden, \{ view: rowView, page, delayIds, commencedContractIds: /);
    expect(read("src/lib/contract/case-load.ts")).toMatch(/inDelayContractIds\(org\.id, org\.today\)/);
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
    // As ruled by the 6.13A residual review: the Projects list uses the shared ProvenanceBadge (through the
    // DataList chip's provenance), and only on a reading that rests on the straight line.
    // AC-17 (C9): the chip is built in the case row (cx is the row context).
    const list = read("src/app/projects/page.tsx");
    expect(list).toMatch(/\{ text: "In Delay", tone: "err", \.\.\.\(cx\.delayAssumed\.has\(c\.id\) \? \{ provenance: "ASSUMED" as const \} : \{\}\) \}/);
    expect(list).toMatch(/<ProvenanceBadge value="ASSUMED" \/>/);
    expect(list).not.toMatch(/assumed reading|\(assumed\)/);
    expect(DELAY_BASIS).toMatch(/straight line/);
  });
});

describe("BD-613-11 ruling: a superior officer is recorded as named, the reporting line not checked", () => {
  it("the endorsement card and its form say so", () => {
    expect(read("src/app/projects/[id]/supervision-panels.tsx")).toMatch(/A superior officer is recorded as named: the reporting line is not checked\./);
    expect(read("src/app/projects/[id]/supervision-editors.tsx")).toMatch(/A superior officer is recorded as named: the reporting line is not checked/);
  });
});

describe("6.13A residual: ASSUMED only on a reading that rests on the straight-line assumption", () => {
  const readings: [string, DelayReading, boolean][] = [
    ["behind", { state: "IN_DELAY", why: "BEHIND", day: "2026-10-02", actualPct: "0.5", plannedPct: "1", policyPct: "75" }, true],
    ["on track", { state: "ON_TRACK", day: "2026-10-02", actualPct: "5", plannedPct: "5", policyPct: "75" }, true],
    ["lapsed", { state: "IN_DELAY", why: "LAPSED", dateForCompletion: "2026-10-01", actualPct: null }, false],
    ["not set", { state: "NOT_SET" }, false],
    ["not possessed", { state: "NOT_JUDGED", why: "NOT_POSSESSED" }, false],
    ["no programme", { state: "NOT_JUDGED", why: "NO_PROGRAMME" }, false],
    ["no progress", { state: "NOT_JUDGED", why: "NO_PROGRESS" }, false],
    ["before the programme", { state: "NOT_JUDGED", why: "BEFORE_PROGRAMME" }, false],
  ];
  it("every reading state, one by one", () => {
    for (const [name, r, assumed] of readings) {
      expect(restsOnStraightLine(r), name).toBe(assumed);
      expect(delayWords(r).assumed, name).toBe(assumed);
    }
  });
  it("the Projects list tags only the In Delay readings that rest on it", () => {
    expect(assumedDelayIds(new Map(readings.map(([n, r]) => [n, r])))).toEqual(["behind"]);
  });
  it("the contract's cards render the tag and the basis only where the reading is assumed", () => {
    const panels = read("src/app/projects/[id]/supervision-panels.tsx");
    expect(panels).toMatch(/function DelayTag[\s\S]*?\{d\.assumed && <ProvenanceBadge value="ASSUMED" \/>\}/);
    expect(panels).toMatch(/function DelayDetail[\s\S]*?\{d\.assumed && \([\s\S]*?<ProvenanceBadge value="ASSUMED" \/>\s*\{DELAY_BASIS\}/);
    expect(panels.match(/<ProvenanceBadge value="ASSUMED" \/>/g)?.length).toBe(2);
  });
});
