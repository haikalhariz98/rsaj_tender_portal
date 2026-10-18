import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AWARD_TAB_IDS, CASE_TABS, HISTORY_TAB, awardTabToCase, caseTabToStep, parseCaseStepKey, stageTab, type CaseTabStep } from "./case-tabs";

/// The tab ids a page's `tabs` list declares today: each entry opens with `{ id: "…",` or `id: "…",` on its own line.
const tabIdsOf = (page: string) => [...readFileSync(join(process.cwd(), page), "utf8").matchAll(/^\s*\{?\s*id: "([a-z-]+)",/gm)].map((m) => m[1]);

// The contract page's eleven tabs, as persisted `?tab=` links carry them (F0-5).
const CONTRACT_TAB_IDS = ["overview", "formation", "baseline", "team", "site", "payments", "variations", "securities", "documents", "submissions", "history"];

describe("the tab ids are today's (scanned from the pages)", () => {
  // Until C9 turns /awards/[id] into a redirect, its tabs list is the source.
  it("/awards/[id] has exactly the ten AWARD_TAB_IDS", () => {
    expect(new Set(tabIdsOf("src/app/awards/[id]/page.tsx"))).toEqual(new Set(AWARD_TAB_IDS));
    expect(AWARD_TAB_IDS).toHaveLength(10);
  });
  // C-2 (wave C step C5): /projects/[id] is the case page. It lists no tab ids of its own: it draws CASE_TABS' (and History), so the
  // eleven tabs the contract page had are all still reachable, each under its stage.
  it("/projects/[id] draws its tabs from CASE_TABS, and every tab the contract page had is in a stage or is History", () => {
    expect(readFileSync(join(process.cwd(), "src/app/projects/[id]/page.tsx"), "utf8")).toMatch(/const stageTabs = stage === "close-out" \? \[\] : CASE_TABS\[stage\];/);
    const staged = new Set<string>([...Object.values(CASE_TABS).flat(), HISTORY_TAB]);
    for (const id of CONTRACT_TAB_IDS) expect(staged.has(id), id).toBe(true);
  });
});

describe("awardTabToCase (C-6)", () => {
  const want: Record<string, ReturnType<typeof awardTabToCase>> = {
    overview: { stage: "award", tab: "overview" },
    approval: { stage: "award", tab: "approval" },
    instrument: { stage: "award", tab: "instrument" },
    distribution: { stage: "award", tab: "distribution" },
    return: { stage: "award", tab: "return" },
    routing: { stage: "award", tab: "routing" },
    conditions: { stage: "before-signing", tab: "conditions" },
    securities: { stage: "before-signing", tab: "securities" },
    notices: { exercise: "notices" },
    history: { tab: "history" },
  };
  it("the table names every award tab, once", () => {
    expect(Object.keys(want).sort()).toEqual([...AWARD_TAB_IDS].sort());
  });
  for (const id of AWARD_TAB_IDS) {
    it(`${id} maps`, () => {
      const got = awardTabToCase(id);
      expect(got).toEqual(want[id]);
      // a staged tab is one its stage lists
      if ("stage" in got && got.stage) expect(CASE_TABS[got.stage as CaseTabStep]).toContain(got.tab);
    });
  }
  it("an unknown tab, or none, names nothing (the default step)", () => {
    expect(awardTabToCase(undefined)).toEqual({});
    expect(awardTabToCase("no-such-tab")).toEqual({});
    expect(awardTabToCase("toString")).toEqual({});
    expect(awardTabToCase("")).toEqual({});
  });
});

describe("caseTabToStep (F0-5)", () => {
  it("overview: Project on a contract (F-1), Award on an award-only case", () => {
    expect(caseTabToStep("overview", true)).toEqual({ stage: "project", tab: "overview" });
    expect(caseTabToStep("overview", false)).toEqual({ stage: "award", tab: "overview" });
  });
  it("securities: Before signing, on either id", () => {
    expect(caseTabToStep("securities", true)).toEqual({ stage: "before-signing", tab: "securities" });
    expect(caseTabToStep("securities", false)).toEqual({ stage: "before-signing", tab: "securities" });
  });
  it("history: case level", () => {
    for (const c of [true, false]) expect(caseTabToStep(HISTORY_TAB, c)).toEqual({ history: true });
  });
  it("an unknown tab, or none: null", () => {
    for (const c of [true, false]) {
      expect(caseTabToStep(undefined, c)).toBeNull();
      expect(caseTabToStep("no-such-tab", c)).toBeNull();
      expect(caseTabToStep("notices", c)).toBeNull();
      expect(caseTabToStep("close-out", c)).toBeNull();
    }
  });
  for (const id of CONTRACT_TAB_IDS) {
    for (const hasContract of [true, false]) {
      it(`every contract-page link resolves: ${id}, contract ${hasContract}`, () => {
        const got = caseTabToStep(id, hasContract);
        expect(got).not.toBeNull();
        if (got && "stage" in got) {
          expect(got.tab).toBe(id);
          expect(CASE_TABS[got.stage]).toContain(id);
        }
      });
    }
  }
  it("every tab but overview sits under one stage only", () => {
    const all = Object.values(CASE_TABS).flat();
    const twice = all.filter((t, i) => all.indexOf(t) !== i);
    expect(twice).toEqual(["overview"]);
  });
});

describe("stageTab: a ?stage= with a tab not its own opens its first tab (F0-5)", () => {
  it("its own tab stays", () => expect(stageTab("signing", "baseline")).toBe("baseline"));
  it("another stage's tab: the first", () => expect(stageTab("signing", "payments")).toBe("formation"));
  it("none: the first", () => expect(stageTab("project", undefined)).toBe("overview"));
  it("each stage's first tab", () => {
    expect((Object.keys(CASE_TABS) as CaseTabStep[]).map((s) => stageTab(s, undefined))).toEqual(["overview", "conditions", "formation", "overview"]);
  });
});

describe("parseCaseStepKey", () => {
  it("the five keys", () => {
    for (const k of ["award", "before-signing", "signing", "project", "close-out"]) expect(parseCaseStepKey(k)).toBe(k);
  });
  it("anything else", () => {
    for (const k of [undefined, "", "Award", "history", "overview"]) expect(parseCaseStepKey(k)).toBeUndefined();
  });
});
