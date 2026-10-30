import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AWARD_TAB_IDS, CASE_TABS, FOLDED_TABS, HISTORY_TAB, WORK_TAB, awardTabToCase, caseTabToStep, parseCaseStepKey, stageStrip, stageTab, type CaseTabStep } from "./case-tabs";


// The contract page's eleven tabs, as persisted `?tab=` links carry them (F0-5).
const CONTRACT_TAB_IDS = ["overview", "formation", "baseline", "team", "site", "payments", "variations", "securities", "documents", "submissions", "history"];

describe("the tab ids are today's (scanned from the pages)", () => {
  // AC-23 (C9): /awards/[id] is a redirect and lists no tabs, so AWARD_TAB_IDS is the record of the ten it had. Every one of them
  // still goes somewhere: a stage and tab of the case, History, or the exercise's notices.
  it("the ten tab ids /awards/[id] had all still resolve", () => {
    expect(AWARD_TAB_IDS).toHaveLength(10);
    for (const id of AWARD_TAB_IDS) {
      const at = awardTabToCase(id);
      expect(Object.keys(at).length, id).toBeGreaterThan(0);
    }
  });
  // C-2 (wave C step C5): /projects/[id] is the case page. It lists no tab ids of its own: it draws CASE_TABS' (and History), so the
  // eleven tabs the contract page had are all still reachable, each under its stage.
  it("/projects/[id] draws its tabs from CASE_TABS (through stageStrip, which only adds Work), and every tab the contract page had is in a stage or is History", () => {
    // Phase 2 close-out stage B (flagged, faithful): every stage draws its tabs, close-out included.
    expect(readFileSync(join(process.cwd(), "src/app/projects/[id]/page.tsx"), "utf8")).toMatch(/\.\.\.stageStrip\(stage\)\.map\(/);
    const staged = new Set<string>([...Object.values(CASE_TABS).flat(), HISTORY_TAB]);
    // WS-5 (flagged, faithful): "documents" (Certificates) folded into Documents, so it is reached through FOLDED_TABS, not a stage's list.
    for (const id of CONTRACT_TAB_IDS) expect(staged.has(id) || Object.hasOwn(FOLDED_TABS, id), id).toBe(true);
  });
});

describe("the Project stage's Time tab (Phase 2 close-out stage A, additive)", () => {
  it("sits after Variations, and a stage-less ?tab=time opens it in the Project stage", () => {
    expect(CASE_TABS.project.indexOf("time")).toBe(CASE_TABS.project.indexOf("variations") + 1);
    expect(caseTabToStep("time", true)).toEqual({ stage: "project", tab: "time" });
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
          expect(got.tab).toBe(id in FOLDED_TABS ? FOLDED_TABS[id].tab : id);
          expect(CASE_TABS[got.stage]).toContain(got.tab);
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
    expect((Object.keys(CASE_TABS) as CaseTabStep[]).map((s) => stageTab(s, undefined))).toEqual(["overview", "conditions", "formation", "overview", "completion"]);
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

describe("the Close-out stage's tabs (Phase 2 close-out stage B, plan §3.2)", () => {
  // Changed for stage D (flagged): Close ("closure") joins for the contractor performance card; stage C adds the final account before it.
  it("are Completion, Defects and Close, each reached from a stage-less link", () => {
    // Changed for stage C (flagged, faithful to §3.2): the Final account tab before Close.
    expect(CASE_TABS["close-out"]).toEqual(["completion", "defects", "final-account", "closure"]);
    for (const tab of ["completion", "defects", "final-account", "closure"]) for (const c of [true, false]) expect(caseTabToStep(tab, c)).toEqual({ stage: "close-out", tab });
    expect(stageTab("close-out", undefined)).toBe("completion");
  });
});

// Workspace 3a step 5 (flagged stricter: new cases only; no existing expectation changed).
describe("the Work tab (case-level, drawn in two strips)", () => {
  it("is after Overview in the Project strip and last, before History, in the Close-out strip; no other strip has it", () => {
    expect(stageStrip("project").slice(0, 2)).toEqual(["overview", WORK_TAB]);
    expect(stageStrip("close-out").at(-1)).toBe(WORK_TAB);
    for (const s of ["award", "before-signing", "signing"] as const) expect(stageStrip(s)).toEqual(CASE_TABS[s]);
  });
  it("is not in CASE_TABS, so the old addresses and the one-stage rule are unchanged", () => {
    expect(Object.values(CASE_TABS).flat()).not.toContain(WORK_TAB);
  });
  it("a stage-less ?tab=work is case-level on a contract and nothing before one", () => {
    expect(caseTabToStep(WORK_TAB, true)).toEqual({ work: true });
    expect(caseTabToStep(WORK_TAB, false)).toBeNull();
  });
});

// Workspace 3b-ii step 11 (flagged stricter: new cases; the two expectations above changed only where "documents" moved).
describe("the Certificates tab folded into Documents (WS-5)", () => {
  it("the Project strip has no Certificates tab; Documents (submissions) holds the section", () => {
    expect(stageStrip("project")).not.toContain("documents");
    expect(stageStrip("project")).toContain("submissions");
  });
  it("every old address lands on the folded place: stage-less, with the stage, either id", () => {
    const at = { stage: "project", tab: "submissions", section: "certificates" };
    for (const c of [true, false]) expect(caseTabToStep("documents", c)).toEqual(at);
  });
  it("WRS-7: the page scrolls the named section into view, and the card carries that id", () => {
    const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8").replace(/\r\n/g, "\n");
    expect(read("src/app/projects/[id]/page.tsx")).toContain("{view.section && <ScrollToSection id={view.section} />}");
    expect(read("src/app/projects/[id]/documents-panel.tsx")).toContain('id="certificates"');
  });
  it("the stored notice href forms resolve", () => {
    expect(caseTabToStep("submissions", true)).toEqual({ stage: "project", tab: "submissions" });
  });
});
