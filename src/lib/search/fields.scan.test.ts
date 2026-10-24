import { describe, expect, it } from "vitest";

import { readModels, SENSITIVE_MODEL, walkPath, type SchemaModels } from "@/lib/scan/schema";
import { SULIT_FIELDS } from "@/lib/sulit-fields";

import { CASE_KEYS, SEARCH_FIELDS, SEARCH_MODEL, type SearchEntity } from "./fields";

/**
 * ADR 0044 D1: search reads identifiers and titles only. Each `SEARCH_FIELDS` path is walked through the schema, so the scan
 * judges what the path really reaches, not its spelling: no SULIT field, no creditor or bank table or column, no evaluation,
 * opening, bid, sealing or estimate model anywhere on the path, no Malay name (English only), and only to-one hops ending in a text
 * column (`wordsWhere` nests a filter, valid for to-one only).
 */

const SULIT = new Set(SULIT_FIELDS.map((f) => f.field));

function searchPathFaults(models: SchemaModels, from: string, path: string): string[] {
  const w = walkPath(models, from, path);
  if (!w.ok) return [w.why];
  const leaf = w.leaf.name;
  return [
    ...w.models.filter((m) => SENSITIVE_MODEL.test(m)).map((m) => `reaches ${m}`),
    ...(SULIT.has(leaf) ? ["a SULIT field"] : []),
    ...(/Ms$/.test(leaf) ? ["a Malay field"] : []),
    ...(/bank|creditor/i.test(leaf) ? ["a creditor or bank column"] : []),
    ...(w.leaf.type !== "String" || w.leaf.list ? [`not a text column (${w.leaf.type})`] : []),
  ];
}

const models = readModels();
const entities = Object.keys(SEARCH_FIELDS) as SearchEntity[];

describe("what a search may match (ADR 0044 D1)", () => {
  it.each(entities.flatMap((e) => SEARCH_FIELDS[e].map((p) => [e, p] as const)))("%s.%s is an identifier or a title", (e, path) => {
    expect(searchPathFaults(models, SEARCH_MODEL[e], path)).toEqual([]);
  });
  it("every case key is also a search field", () => {
    for (const e of entities) for (const k of CASE_KEYS[e] ?? []) expect(SEARCH_FIELDS[e], `${e}.${k}`).toContain(k);
  });
  it("the scan has teeth: planted paths are refused, each for its own reason", () => {
    expect(searchPathFaults(models, "Requisition", "estimatedValue")).toEqual(expect.arrayContaining(["a SULIT field"]));
    expect(searchPathFaults(models, "Committee", "nameMs")).toEqual(["a Malay field"]);
    expect(searchPathFaults(models, "SourcingExercise", "requisition.estimatedValue")).toEqual(expect.arrayContaining(["a SULIT field", "not a text column (Decimal)"]));
    expect(searchPathFaults(models, "Requisition", "exercises.reference")[0]).toMatch(/to-many/);
    expect(searchPathFaults(models, "Award", "exercise")[0]).toMatch(/relation, not a column/);
    expect(searchPathFaults(models, "Award", "nope")[0]).toMatch(/no field/);
    expect(SENSITIVE_MODEL.test("Evaluation") && SENSITIVE_MODEL.test("BidEnvelope") && SENSITIVE_MODEL.test("CreditorProfile") && SENSITIVE_MODEL.test("OpeningSitting")).toBe(true);
    expect(SENSITIVE_MODEL.test("OpeningPosition") || SENSITIVE_MODEL.test("Award") || SENSITIVE_MODEL.test("Meeting")).toBe(false);
  });
});
