import { describe, expect, it } from "vitest";

import { WAITING_RULE_TEXT } from "@/lib/approvals/queue";
import { AWARD_STATUS_LABEL, INSTRUMENT_SHORT, INSURANCE_KIND_LABEL, REGISTER_STATUS_LABEL, SECURITY_KIND_LABEL } from "@/lib/award/labels";
import { CASE_STEP_LABEL, CLOSE_OUT_PARKED } from "@/lib/contract/case-steps";
import { CASE_PAGE, CASE_REFUSAL_WORDS, CASES_LIST_WORDS, CASE_STEP_WORDS, AWARD_STATUS_WORDS, INSTRUMENT_SHORT_WORDS, INSURANCE_KIND_WORDS, REGISTER_STATUS_WORDS, SECURITY_KIND_WORDS, CASE_PANEL_TITLE_WORDS, SUBMISSIONS_WORDS } from "@/lib/contract/case-page-words";
import { EMPLOYER_SIGNING_NOT_SET, EMPLOYER_SIGNING_NOT_SET_WHY } from "@/lib/contract/employer-signing";
import { EXERCISE_PHASE_WORDS, EXERCISE_STATUS_WORDS, WAITING_RULE_WORDS } from "@/lib/i18n/catalogues/dashboard";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";
import { PROVENANCE_HINT, PROVENANCE_NOT_SET_HINT } from "@/lib/labels";
import { EXERCISE_STATUS_LABEL } from "@/lib/method/labels";
import { EXERCISE_PHASE_LABEL } from "@/lib/method/phase";
import { ROUTING_STATEMENT } from "@/lib/portal/projects/labels";
import { DELAY_BASIS } from "@/lib/supervision/labels";

import { CONVERTED_CATALOGUES, forReview, untranslated } from "./registry";

/**
 * N1 step 4 (NFR-LNG-001, ADR 0040): the catalogues the Dashboard, Inbox, Contracts list and case page render are registered, drafted and
 * not reviewed, with no code on a screen, and every English in them is the English the screen showed before.
 */

describe("the registered catalogues", () => {
  it("lists every pair with no Malay: a pinned list, expected empty (any entry is a deliberate enOnly, named here)", () => {
    expect(untranslated(CONVERTED_CATALOGUES)).toEqual([]);
  });

  it("holds no code on a screen: no underscore and no all-capitals token in an English or a Malay text", () => {
    const hits = forReview(CONVERTED_CATALOGUES).flatMap((p) => [p.en, p.ms].filter((t) => /_|^[A-Z][A-Z0-9]+$/.test(t)).map((t) => `${p.catalogue}: ${t}`));
    expect(hits).toEqual([]);
  });

  it("says each new catalogue is drafted and not reviewed, and each carried one is carried", () => {
    const review = Object.fromEntries(CONVERTED_CATALOGUES.map((c) => [c.name, c.review]));
    for (const name of ["dates", "coverage", "shell", "components", "dashboard", "inbox", "case-page", "contracts-list"]) {
      expect(review[name], name).toBe("DRAFTED_NOT_REVIEWED");
    }
    for (const name of ["case-list-words", "contract-status", "formation-checks", "sign-in-notices", "submissions", "supervision-acts", "matter-labels"]) {
      expect(review[name], name).toBe("CARRIED_NOT_REVIEWED");
    }
    expect(CONVERTED_CATALOGUES.map((c) => c.name).length).toBe(new Set(CONVERTED_CATALOGUES.map((c) => c.name)).size);
  });

  it("keeps every {placeholder} of the English in the Malay, so a value is never lost", () => {
    const names = (t: string) => [...t.matchAll(/\{([A-Za-z0-9]+)\}/g)].map((m) => m[1]).sort();
    const bad = forReview(CONVERTED_CATALOGUES).filter((p) => JSON.stringify(names(p.en)) !== JSON.stringify(names(p.ms))).map((p) => `${p.catalogue}: ${p.en}`);
    expect(bad).toEqual([]);
  });
});

describe("the English of a converted screen is the English it had", () => {
  it("Dashboard: the waiting rule, the exercise states and the three phases", () => {
    expect(WAITING_RULE_WORDS.en).toBe(WAITING_RULE_TEXT);
    for (const [k, v] of Object.entries(EXERCISE_STATUS_WORDS)) expect(v.en, k).toBe(EXERCISE_STATUS_LABEL[k as keyof typeof EXERCISE_STATUS_LABEL]);
    for (const [k, v] of Object.entries(EXERCISE_PHASE_WORDS)) expect(v.en, k).toBe(EXERCISE_PHASE_LABEL[k as keyof typeof EXERCISE_PHASE_LABEL]);
  });

  it("case page: step names, award states, instruments, securities and the parked close-out", () => {
    for (const [k, v] of Object.entries(CASE_STEP_WORDS)) expect(v.en, k).toBe(CASE_STEP_LABEL[k as keyof typeof CASE_STEP_LABEL]);
    for (const [k, v] of Object.entries(AWARD_STATUS_WORDS)) expect(v.en, k).toBe(AWARD_STATUS_LABEL[k as keyof typeof AWARD_STATUS_LABEL]);
    for (const [k, v] of Object.entries(INSTRUMENT_SHORT_WORDS)) expect(v.en, k).toBe(INSTRUMENT_SHORT[k as keyof typeof INSTRUMENT_SHORT]);
    for (const [k, v] of Object.entries(SECURITY_KIND_WORDS)) expect(v.en, k).toBe(SECURITY_KIND_LABEL[k as keyof typeof SECURITY_KIND_LABEL]);
    for (const [k, v] of Object.entries(INSURANCE_KIND_WORDS)) expect(v.en, k).toBe(INSURANCE_KIND_LABEL[k as keyof typeof INSURANCE_KIND_LABEL]);
    for (const [k, v] of Object.entries(REGISTER_STATUS_WORDS)) expect(v.en, k).toBe(REGISTER_STATUS_LABEL[k as keyof typeof REGISTER_STATUS_LABEL]);
    expect(CASE_REFUSAL_WORDS.closeOutParked.en).toBe(CLOSE_OUT_PARKED);
    expect(CASE_REFUSAL_WORDS.employerSigningNotSet.en).toBe(EMPLOYER_SIGNING_NOT_SET);
    expect(CASE_REFUSAL_WORDS.employerSigningNotSetWhy.en).toBe(EMPLOYER_SIGNING_NOT_SET_WHY);
  });

  it("Contracts list: the delay basis and the routing statement", () => {
    expect(CASES_LIST_WORDS.delayBasis.en).toBe(DELAY_BASIS);
    expect(SUBMISSIONS_WORDS.routingStatement.en).toBe(ROUTING_STATEMENT);
  });

  it("shared components: the provenance words are the ones the badge always had", () => {
    expect(COMPONENT_WORDS.provStatedHint.en).toBe(PROVENANCE_HINT.STATED);
    expect(COMPONENT_WORDS.provObservedHint.en).toBe(PROVENANCE_HINT.OBSERVED);
    expect(COMPONENT_WORDS.provAssumedHint.en).toBe(PROVENANCE_HINT.ASSUMED);
    expect(COMPONENT_WORDS.provNotSetHint.en).toBe(PROVENANCE_NOT_SET_HINT);
  });
});

describe("the case page's words cover what the page draws", () => {
  it("has words for every tab of every stage", async () => {
    const { CASE_TABS } = await import("@/lib/contract/case-tabs");
    const { CASE_TAB_WORDS } = await import("@/lib/contract/case-page-words");
    for (const tabs of Object.values(CASE_TABS)) for (const tab of tabs) expect(CASE_TAB_WORDS[tab], tab).toBeDefined();
  });

  it("has words for every section of the four sectioned tabs (read from the panels' own lists)", async () => {
    const { readFileSync } = await import("node:fs");
    const { CASE_SECTION_WORDS } = await import("@/lib/contract/case-page-words");
    const files: [string, string][] = [
      ["formation", "src/app/projects/[id]/formation-panels.tsx"],
      ["payments", "src/app/projects/[id]/payment-panels.tsx"],
      ["site", "src/app/projects/[id]/supervision-panels.tsx"],
      ["variations", "src/app/projects/[id]/variation-panels.tsx"],
    ];
    let seen = 0;
    for (const [tab, file] of files) {
      const src = readFileSync(file, "utf8");
      const list = src.slice(src.indexOf("_SECTIONS = ["), src.indexOf("] as const", src.indexOf("_SECTIONS = [")));
      for (const m of list.matchAll(/id: "([a-z]+)", label: "([^"]+)"/g)) {
        seen++;
        expect(CASE_SECTION_WORDS[`${tab}.${m[1]}`]?.en, `${tab}.${m[1]}`).toBe(m[2]);
      }
    }
    expect(seen).toBe(Object.keys(CASE_SECTION_WORDS).length);
  });

  it("draws no card heading in a panel as a plain English string", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    // The panels the case page draws: the contract's `*-panel(s).tsx` and every file of the award's own panels (`award/`, drawn through `buildAwardView`).
    const dir = "src/app/projects/[id]";
    const files = [...readdirSync(dir).filter((f) => /panels?\.tsx$/.test(f)), ...readdirSync(`${dir}/award`).filter((f) => f.endsWith(".tsx")).map((f) => `award/${f}`)];
    expect(files.length).toBeGreaterThanOrEqual(16);
    const plain: string[] = [];
    for (const f of files) {
      const src = readFileSync(`${dir}/${f}`, "utf8");
      for (const m of src.matchAll(/<CardHeader\b/g)) {
        const after = src.slice(m.index, m.index + 700);
        const at = after.search(/\btitle=/);
        if (at >= 0 && after[at + "title=".length] === '"') plain.push(`${f}: ${after.slice(at, at + 60)}`);
      }
    }
    expect(plain).toEqual([]);
  });

  it("registers the case page's panel headings", () => {
    expect(Object.keys(CASE_PAGE.words).filter((k) => k.startsWith("panel.")).length).toBe(Object.keys(CASE_PANEL_TITLE_WORDS).length);
  });
});
