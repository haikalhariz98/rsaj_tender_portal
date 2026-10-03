import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as L from "./labels";
import * as T from "./types";

/** Every variation list equals the schema's enum, in order, and every word map covers it (X-8), EN and MS. */

const ROOT = path.join(__dirname, "../../..");
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const values = (name: string) => {
  const m = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  if (!m) throw new Error(`enum ${name} not found`);
  return m[1].split("\n").map((l) => l.replace(/\/\/\/.*$/, "").trim()).filter(Boolean);
};

const PAIRS: [string, readonly string[], Readonly<Record<string, { en: string; ms: string }>>][] = [
  ["VariationPctBasis", T.VARIATION_PCT_BASES, L.BASIS_WORDS],
  ["VariationBase", T.VARIATION_BASES, L.BASE_WORDS],
  ["VariationScheduleForm", T.SCHEDULE_FORMS, L.SCHEDULE_FORM_WORDS],
  ["VariationOrigin", T.VARIATION_ORIGINS, L.ORIGIN_WORDS],
  ["VariationExemption", T.VARIATION_EXEMPTIONS, L.EXEMPTION_WORDS],
  ["VariationStatus", T.VARIATION_STATUSES, L.STATUS_WORDS],
  ["VariationEvent", T.VARIATION_EVENTS, L.EVENT_WORDS],
  ["VariationRateSource", T.RATE_SOURCES, L.RATE_SOURCE_WORDS],
  ["AdjustmentDirection", T.ADJUSTMENT_DIRECTIONS, L.DIRECTION_WORDS],
  ["AdjustmentSection", T.ADJUSTMENT_SECTIONS, L.SECTION_WORDS],
  ["SumAdjustmentTrigger", T.ADJUSTMENT_TRIGGERS, L.TRIGGER_WORDS],
  ["SignatureDecision", T.SO_DECISIONS, L.SO_DECISION_WORDS],
];

describe("the vocabulary matches the schema, and every value has its words", () => {
  for (const [name, list, words] of PAIRS) {
    it(name, () => {
      expect([...list]).toEqual(values(name));
      expect(Object.keys(words).sort()).toEqual([...list].sort());
      for (const k of list) {
        expect(words[k].en.length, k).toBeGreaterThan(0);
        expect(words[k].ms.length, k).toBeGreaterThan(0);
      }
    });
  }
  it("every stage has its words and its tone, every consent state its words", () => {
    const stages = ["DRAFT", "WITH_SO", "TO_SEND", "AWAITING_APPROVAL", "REFUSED_AWAITING_CHOICE", "APPROVED", "EXEMPT", "INSTRUCTED", "CERTIFIED", "CLOSED"];
    expect(Object.keys(L.STAGE_WORDS).sort()).toEqual([...stages].sort());
    expect(Object.keys(L.STAGE_TONE).sort()).toEqual([...stages].sort());
    expect(Object.keys(L.CONSENT_WORDS).sort()).toEqual(["CARRIED", "NONE", "NOT_CARRIED", "PENDING"]);
  });
});

describe("every refusal the variation and adjustment rules can give is worded", () => {
  it("no code falls through to the default, in the rules or in the acts", () => {
    const lib = (dir: string) => readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "labels.ts" && f !== "types.ts").map((f) => `${dir}/${f}`);
    const files = [...lib("src/lib/variation"), ...lib("src/lib/adjustment"), ...["src/app/projects/[id]/variation-actions.ts"].filter((f) => { try { readFileSync(path.join(ROOT, f)); return true; } catch { return false; } })];
    const src = files.map((f) => readFileSync(path.join(ROOT, f), "utf8")).join("\n");
    const codes = new Set([...src.matchAll(/code: "([A-Z][A-Z_]{3,})"/g), ...src.matchAll(/\bf\("([A-Z][A-Z_]{3,})"/g), ...src.matchAll(/\bone\("([A-Z][A-Z_]{3,})"/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(60);
    const fallthrough = L.variationFaultWords({ code: "__NONE__", level: "block" }).en;
    for (const code of codes) expect(L.variationFaultWords({ code, level: "block", data: {} }).en, code).not.toBe(fallthrough);
  });
});
