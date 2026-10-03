import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as L from "./labels";
import * as T from "./types";

/** Every payment list equals the schema's enum, in order, and every word map covers it (X-8), EN and MS. */

const ROOT = path.join(__dirname, "../../..");
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const values = (name: string) => {
  const m = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  if (!m) throw new Error(`enum ${name} not found`);
  return m[1].split("\n").map((l) => l.replace(/\/\/\/.*$/, "").trim()).filter(Boolean);
};

const PAIRS: [string, readonly string[], Readonly<Record<string, { en: string; ms: string }>>][] = [
  ["ValuationTrigger", T.VALUATION_TRIGGERS, L.TRIGGER_WORDS],
  ["ContractorAnswer", T.CONTRACTOR_ANSWERS, L.ANSWER_WORDS],
  ["ValuationStatus", T.VALUATION_STATUSES, L.VALUATION_STATUS_WORDS],
  ["KeyedDeductionKind", T.KEYED_DEDUCTION_KINDS, L.DEDUCTION_WORDS],
  ["RetentionReleaseKind", T.RETENTION_RELEASES, L.RELEASE_WORDS],
  ["AdvanceParty", T.ADVANCE_PARTIES, L.ADVANCE_PARTY_WORDS],
  ["PaymentRouteFigure", T.PAYMENT_ROUTE_FIGURES, L.ROUTE_FIGURE_WORDS],
  ["WaterfallRemainder", T.WATERFALL_REMAINDERS, L.REMAINDER_WORDS],
  ["NonCompletionOutcome", T.NON_COMPLETION_OUTCOMES, L.OUTCOME_WORDS],
  ["NonCompletionScope", T.NON_COMPLETION_SCOPES, L.SCOPE_WORDS],
  ["ContractClock", T.CONTRACT_CLOCKS, L.CLOCK_WORDS],
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
  it("the pack items, the tiers and the material verdicts each have words", () => {
    for (const k of T.PACK_ITEMS) expect(L.PACK_WORDS[k].ms.length).toBeGreaterThan(0);
    for (const k of T.RETENTION_TIERS) expect(L.TIER_WORDS[k].ms.length).toBeGreaterThan(0);
    expect(Object.keys(L.MATERIAL_VERDICT_WORDS).sort()).toEqual(["ELIGIBLE", "NOT_ANSWERED", "NOT_PART_OF_WORKS", "NOT_PROTECTED", "TEMPORARY", "TOO_EARLY"]);
  });
});

describe("every refusal the payment and damages rules can give is worded", () => {
  it("no code falls through to 'Refused', in the rules or in the acts", () => {
    const files = [
      ...readdirSync(path.join(ROOT, "src/lib/payment")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "labels.ts" && f !== "types.ts").map((f) => `src/lib/payment/${f}`),
      ...readdirSync(path.join(ROOT, "src/lib/lad")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => `src/lib/lad/${f}`),
      ...["src/app/projects/[id]/payment-actions.ts", "src/lib/payment/route-open.ts", "src/lib/payment/at-issue.ts"].filter((f) => { try { readFileSync(path.join(ROOT, f)); return true; } catch { return false; } }),
    ];
    const src = files.map((f) => readFileSync(path.join(ROOT, f), "utf8")).join("\n");
    const codes = new Set([...src.matchAll(/code: "([A-Z][A-Z_]{3,})"/g), ...src.matchAll(/one\("([A-Z][A-Z_]{3,})"/g), ...src.matchAll(/\bf\("([A-Z][A-Z_]{3,})"/g), ...src.matchAll(/\badd\("([A-Z][A-Z_]{3,})"/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(60);
    const missing = [...codes].filter((c) => L.paymentFaultWords({ code: c, level: "block", data: {} }).en === "Refused.");
    expect(missing).toEqual([]);
  });
});
