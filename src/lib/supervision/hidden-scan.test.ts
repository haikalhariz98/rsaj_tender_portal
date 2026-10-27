import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

import { hiddenNote } from "./labels";
import { SUPERVISION_ACTS } from "./types";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * FR-SUP-002–004 (Phase 3d): acts outside a representative's delegated scope are hidden from them, mapped from the session. The rule is `hiddenActsFor` (tested in
 * `authority.test.ts`); this holds the screens to it: the pages that offer the acts ask it (`hiddenFor`, which adds the acts no letter can give) for the signed-in person (never for a person named in a form), and each drawer that
 * opens a supervision act is left off when its act is hidden. A drawer added for an act without being listed here is a drawer a delegate sees outside their letter.
 */

const read = (rel: string) => readFileSync(path.join(process.cwd(), ...rel.split("/")), "utf8");
const CONTRACT = "src/app/projects/[id]";

describe("the pages ask for the acts hidden from the signed-in representative", () => {
  for (const file of [`${CONTRACT}/page.tsx`, `${CONTRACT}/variations/[variationId]/page.tsx`]) {
    it(`${file} asks hiddenActsFor for the actor's own person, and not for a system run`, () => {
      const text = read(file);
      expect(text).toMatch(/hiddenFor\(actor\.personId,/);
      expect(text).toMatch(/!actor\.system/);
      expect(text).not.toMatch(/hiddenFor\(\s*(?!actor\.personId)/);
      expect(text, "the pages use hiddenFor, which adds the acts no letter can give").not.toMatch(/hiddenActsFor\(/);
    });
  }
});

describe("each drawer that opens a supervision act is left off when its act is hidden", () => {
  const SITES: [string, string, string][] = [
    [`${CONTRACT}/supervision-panels.tsx`, "ScrutinyDrawer", "PROGRAMME_SCRUTINY"],
    [`${CONTRACT}/supervision-panels.tsx`, "ProgressDrawer", "PROGRESS"],
    [`${CONTRACT}/supervision-panels.tsx`, "DiaryEntryDrawer", "DIARY"],
    [`${CONTRACT}/supervision-panels.tsx`, "ObservationDrawer", "OBSERVATION"],
    [`${CONTRACT}/payment-panels.tsx`, "OpenValuationDrawer", "VALUATION"],
    [`${CONTRACT}/variation-panels.tsx`, "VariationRecordDrawer", "VARIATION_APPLICATION"],
    [`${CONTRACT}/variation-panels.tsx`, "AdjustmentDrawer", "VALUATION"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "VariationRecordDrawer", "VARIATION_APPLICATION"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "InstructionDrawer", "INSTRUCTION"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "DayworkDrawer", "VALUATION"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "MeasurementDrawer", "VALUATION"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "OrderDrawer", "VALUATION"],
    // Review fix: the S.O.'s support of work commenced is an INSTRUCTION act (`recordCommencement` judges the supporter and the recorder on it), and was left on the screen.
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "CommenceDrawer", "INSTRUCTION"],
    // Review fix: the acts no letter can give. The S.O.'s own acts are refused to every representative, the Principal Representative's or the S.O.'s to every one who is not a Principal Representative.
    [`${CONTRACT}/supervision-panels.tsx`, "PossessionDrawer", "PRINCIPAL_OR_SO"],
    [`${CONTRACT}/supervision-panels.tsx`, "DecideProgrammeDrawer", "PRINCIPAL_OR_SO"],
    [`${CONTRACT}/supervision-panels.tsx`, "DirectionDrawer", "PRINCIPAL_OR_SO"],
    [`${CONTRACT}/supervision-panels.tsx`, "MeetingDrawer", "SO_ONLY"],
    [`${CONTRACT}/supervision-panels.tsx`, "EarlyActionDrawer", "SO_ONLY"],
    [`${CONTRACT}/supervision-panels.tsx`, "SelfHelpDrawer", "SO_ONLY"],
    [`${CONTRACT}/payment-panels.tsx`, "OpeningDrawer", "PRINCIPAL_OR_SO"],
    [`${CONTRACT}/payment-panels.tsx`, "CalendarDrawer", "PRINCIPAL_OR_SO"],
    [`${CONTRACT}/payment-panels.tsx`, "ReleaseDrawer", "PRINCIPAL_OR_SO"],
    [`${CONTRACT}/payment-panels.tsx`, "AdvanceDrawer", "PRINCIPAL_OR_SO"],
    [`${CONTRACT}/payment-panels.tsx`, "WarningDrawer", "SO_ONLY"],
    [`${CONTRACT}/payment-panels.tsx`, "NonCompletionDrawer", "SO_ONLY"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "SoDecisionDrawer", "SO_ONLY"],
  ];
  for (const [file, drawer, act] of SITES) {
    it(`${drawer} in ${file.split("/").slice(-2).join("/")} is gated on ${act}`, () => {
      const text = read(file);
      const at = text.indexOf(`<${drawer}`);
      expect(at, `${drawer} is rendered`).toBeGreaterThan(0);
      // The gate stands in the statement that renders the drawer: within the 300 characters before its first use that is not a list item of another drawer.
      expect(text.slice(Math.max(0, at - 300), at)).toContain(`hidden.includes("${act}")`);
    });
  }
});

// The same Must is a server rule and not only a screen: the officer who records an act is judged beside the Person it is recorded for (`recorderFault`), in every place a
// supervision act's capacity is judged for recording. A `recordedFor` handed a bare person would judge the S.O. and never the recorder.
describe("every place that judges a recorded supervision act asks for the recorder too", () => {
  const FILES = [`${CONTRACT}/supervision-actions.ts`, `${CONTRACT}/payment-actions.ts`, `${CONTRACT}/variation-actions.ts`, "src/lib/matter/act.ts"];

  for (const file of FILES) {
    it(`${file}: recordedFor takes whom and who records, asks recorderFault, and no call hands it a bare person`, () => {
      const text = read(file);
      expect(text).toMatch(/function recordedFor\(c: (?:Ctx|ActCtx), (?:s: SupervisionRows, )?who: ActWho,/);
      // The recorder is judged on the act's day and on the day it is recorded (`recorderFaultToday`, review fix): the act's day is the form's, so back-dating cannot make them no representative.
      expect(text).toMatch(/recorderFaultToday\(c\.l, s, who\.recorderId, need, on, so\?\.office \?\? null, c\.today, c\.tx\)/);
      expect(text, "judged on the act's day alone").not.toMatch(/recorderFault\(/);
      expect(text, "a call that names the person alone").not.toMatch(/recordedFor\(c, (?:s, )?[\w.]*(?:PersonId|\.id)/);
    });
  }

  it("the callers in the time actions pass the prepared act, not its person", () => {
    const text = read(`${CONTRACT}/time-actions.ts`);
    const calls = [...text.matchAll(/recordedFor\(c, ([^,]+),/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(3);
    expect(calls.every((a) => a === "act")).toBe(true);
  });

  it("recording the S.O.'s support of work commenced, and a variation's originator, ask the recorder too", () => {
    const text = read(`${CONTRACT}/variation-actions.ts`);
    expect(text).toMatch(/recorderFaultToday\(c\.l, s, act\.recorderId, \{ act: "INSTRUCTION" \}, on, so\?\.office \?\? null, c\.today, c\.tx\)/);
    expect(text).toMatch(/recorderId: recorder !== more\.originatorPersonId \? recorder : null/);
    expect(text).toMatch(/judgeRecord\(c, origin, fields, more, actor\.system \? null : actor\.personId\)/);
  });
});

/// The actions that ask a need and have no drawer on any screen yet (none since Phase 2 close-out stage A drew the time and damages drawers). Named, so
/// that building the drawer makes the derivation fail until the drawer is gated, and so that a new action without a drawer is noticed.
const KNOWN_NO_DRAWER: string[] = [
];

// Review fix: the list above is kept by hand, and a drawer missing from it is one a delegate sees outside their letter (the S.O.'s "commenced pending approval" drawer was). So the list is
// also DERIVED: every action that asks a need of whom it records (`{ act: "X" }`, `{ soOnly: true }`, `{ principalOrSo: true }`) is found, the drawer that submits it is found by its
// `action={...}`, and each place that drawer is rendered must be gated on that need. A new action or drawer that is not gated fails here without anyone remembering to list it.
describe("every drawer of an action that asks a need of whom it records is gated on that need (derived, not listed)", () => {
  const ACTION_FILES = [`${CONTRACT}/supervision-actions.ts`, `${CONTRACT}/payment-actions.ts`, `${CONTRACT}/variation-actions.ts`, `${CONTRACT}/time-actions.ts`, `${CONTRACT}/matter-actions.ts`, `${CONTRACT}/damages-actions.ts`];
  const EDITOR_FILES = [`${CONTRACT}/supervision-editors.tsx`, `${CONTRACT}/payment-editors.tsx`, `${CONTRACT}/variation-editors.tsx`, `${CONTRACT}/editors.tsx`, `${CONTRACT}/time-editors.tsx`];
  const SCREEN_FILES = [`${CONTRACT}/supervision-panels.tsx`, `${CONTRACT}/payment-panels.tsx`, `${CONTRACT}/variation-panels.tsx`, `${CONTRACT}/formation-panels.tsx`, `${CONTRACT}/page.tsx`, `${CONTRACT}/variations/[variationId]/page.tsx`, `${CONTRACT}/time-panels.tsx`, `${CONTRACT}/eot/[claimId]/page.tsx`];

  /// An action whose need is asked and which is not gated on a screen, with the reason. Each is checked to be still true, so that it cannot go stale.
  const NOT_GATED: Record<string, string> = {
    "endorseDiary:SO_ONLY": "The endorsement is the officer's or the contractor's agent's, by role: only the S.O.'s own endorsement asks the S.O., so the drawer stays for every representative and the action refuses the one role.",
  };

  /// The needs an exported action asks: the key a screen gates on.
  const needsOf = (file: string): { action: string; key: string }[] => {
    const src = read(file);
    const m = lex(src);
    const out: { action: string; key: string }[] = [];
    for (const sp of spans(m)) {
      if (!new RegExp(String.raw`export\s+async\s+function\s+${sp.name}\b`).test(src)) continue;
      const body = src.slice(sp.from, sp.to);
      const keys = new Set<string>();
      for (const x of body.matchAll(/\{ act: "([A-Z_]+)" \}/g)) if ((SUPERVISION_ACTS as readonly string[]).includes(x[1])) keys.add(x[1]);
      if (/\{ soOnly: true \}/.test(body)) keys.add("SO_ONLY");
      if (/\{ principalOrSo: true \}/.test(body)) keys.add("PRINCIPAL_OR_SO");
      for (const key of keys) out.push({ action: sp.name, key });
    }
    return out;
  };

  /// The drawers (exported components) whose form submits the action.
  const drawersOf = (action: string): string[] => {
    const out: string[] = [];
    for (const f of EDITOR_FILES) {
      const src = read(f);
      const m = lex(src);
      for (const sp of spans(m)) {
        if (!new RegExp(String.raw`export\s+function\s+${sp.name}\b`).test(src)) continue;
        if (new RegExp(String.raw`action=\{${action}\}`).test(src.slice(sp.from, sp.to))) out.push(sp.name);
      }
    }
    return out;
  };

  const NEEDS = ACTION_FILES.flatMap(needsOf);

  it("finds the needs the actions ask (self-test: the known ones)", () => {
    const has = (action: string, key: string) => NEEDS.some((n) => n.action === action && n.key === key);
    expect(has("recordCommencement", "INSTRUCTION")).toBe(true);
    expect(has("recordPossession", "PRINCIPAL_OR_SO")).toBe(true);
    expect(has("recordEarlyAction", "SO_ONLY")).toBe(true);
    expect(has("recordDiaryEntry", "DIARY")).toBe(true);
    expect(NEEDS.length).toBeGreaterThan(25);
  });

  it("each drawer found for an action is rendered behind the gate of every need the action asks", () => {
    const ungated: string[] = [];
    const orphans: string[] = [];
    for (const { action, key } of NEEDS) {
      if (NOT_GATED[`${action}:${key}`]) continue;
      const drawers = drawersOf(action);
      if (drawers.length === 0) {
        orphans.push(`${action}:${key}`);
        continue;
      }
      for (const d of drawers) {
        let sites = 0;
        for (const f of SCREEN_FILES) {
          const text = read(f);
          for (const at of [...text.matchAll(new RegExp(String.raw`<${d}\b`, "g"))].map((x) => x.index!)) {
            sites++;
            if (!text.slice(Math.max(0, at - 300), at).includes(`hidden.includes("${key}")`)) ungated.push(`${action}:${key} -> <${d}> in ${f.split("/").slice(-2).join("/")}`);
          }
        }
        if (sites === 0) orphans.push(`${action}:${key} -> ${d} is rendered nowhere`);
      }
    }
    expect(ungated, "a drawer a representative is offered although the server refuses it").toEqual([]);
    expect(orphans.sort()).toEqual(KNOWN_NO_DRAWER);
  });

  it("each exception is still an action that asks that need", () => {
    for (const key of Object.keys(NOT_GATED)) {
      const [action, need] = key.split(":");
      expect(NEEDS.some((n) => n.action === action && n.key === need), key).toBe(true);
      expect(NOT_GATED[key].length, key).toBeGreaterThan(40);
    }
  });
});

// Review fix: what is left off is said on every screen that leaves something off, not only on Site, so a reader on Payments or Variations can tell "not offered to you" from "not possible".
describe("a representative is told what is left off, on every screen that leaves something off", () => {
  it("the Site, Payments and Variations panels and a variation's page render the note", () => {
    expect(read(`${CONTRACT}/supervision-panels.tsx`)).toMatch(/<WithHiddenNote hidden=\{hidden\}>/);
    expect(read(`${CONTRACT}/payment-panels.tsx`)).toMatch(/<WithHiddenNote hidden=\{hidden\}>/);
    expect(read(`${CONTRACT}/variation-panels.tsx`)).toMatch(/<WithHiddenNote hidden=\{hidden\}>/);
    expect(read(`${CONTRACT}/variations/[variationId]/page.tsx`)).toMatch(/<HiddenNote hidden=\{hidden\} \/>/);
  });

  it("says nothing where nothing is hidden, and names what is, never by a code", () => {
    expect(hiddenNote([])).toBeNull();
    const n = hiddenNote(["OBSERVATION", "SO_ONLY", "PRINCIPAL_OR_SO"])!;
    expect(n.body.en.length).toBeGreaterThan(40);
    expect(n.title.en.length).toBeGreaterThan(10);
    expect(n.body.en).not.toMatch(/OBSERVATION|SO_ONLY|PRINCIPAL_OR_SO/);
    expect(n.body.en).toMatch(/compliance observations/);
    expect(n.body.en).toMatch(/S\.O\.'s own/);
    expect(n.body.en).toMatch(/Principal Representative/);
    // Only the needs: no letter is named when the letter is not the reason. Shortened per note 0005, founder 2026-10-19; the meaning is unchanged.
    expect(hiddenNote(["SO_ONLY"])!.body.en).not.toMatch(/delegation letter/);
    expect(hiddenNote(["DIARY", "PROGRESS"])!.body.en).toMatch(/Not in your delegation letter: keep and attest the site diary; record progress\./);
  });
});
