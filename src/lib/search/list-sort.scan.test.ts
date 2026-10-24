import { describe, expect, it } from "vitest";

import { LIST_SORTS } from "@/lib/list-query";
import { readModels, SENSITIVE_MODEL, walkPath, type SchemaModels } from "@/lib/scan/schema";
import { SULIT_FIELDS } from "@/lib/sulit-fields";

import { SEARCH_MODEL, type SearchEntity } from "./fields";

/**
 * ST-7: a server list sorts only on its own set of stored columns (reference, title or name, main date). An order discloses the
 * value it sorts on, so no SULIT, money or AC-18-withheld column may be in a set (NFR-SEC-001, FR-EVL-014). Each path is walked
 * through the schema: to-one hops only, ending in a text or date column; no SULIT field, no money (a Decimal or BigInt column, or a
 * value, amount, price or estimate name), no sensitive model on the way, and no project path through its exercise, which a reader
 * who sees the case as contract stages only is not shown (AC-18).
 */

const SULIT = new Set(SULIT_FIELDS.map((f) => f.field));
const MONEY_NAME = /value|amount|price|estimate|sum|total|figure|sen$/i;

function sortPathFaults(models: SchemaModels, entity: SearchEntity, path: string): string[] {
  const w = walkPath(models, SEARCH_MODEL[entity], path);
  if (!w.ok) return [w.why];
  const leaf = w.leaf;
  return [
    ...w.models.filter((m) => SENSITIVE_MODEL.test(m)).map((m) => `reaches ${m}`),
    ...(SULIT.has(leaf.name) ? ["a SULIT field"] : []),
    ...(/Decimal|BigInt/.test(leaf.type) || MONEY_NAME.test(leaf.name) ? ["money"] : []),
    ...(entity === "project" && path.split(".")[0] === "exercise" ? ["withheld from a contract-stages reader (AC-18)"] : []),
    ...(/Ms$/.test(leaf.name) ? ["a Malay field"] : []),
    ...(leaf.type !== "String" && leaf.type !== "DateTime" ? [`not a text or date column (${leaf.type})`] : []),
  ];
}

const models = readModels();
const entities = Object.keys(LIST_SORTS) as SearchEntity[];

describe("what a server list may sort on (ST-7)", () => {
  it.each(entities.flatMap((e) => Object.entries(LIST_SORTS[e].keys).map(([k, p]) => [e, k, p] as const)))("%s sorts on %s (%s), a stored column that discloses nothing", (e, _key, path) => {
    expect(sortPathFaults(models, e, path)).toEqual([]);
  });
  it("each list's default date is a column in its own set, and a DateTime", () => {
    for (const e of entities) {
      expect(Object.values(LIST_SORTS[e].keys), e).toContain(LIST_SORTS[e].date);
      const w = walkPath(models, SEARCH_MODEL[e], LIST_SORTS[e].date);
      expect(w.ok && w.leaf.type, e).toBe("DateTime");
    }
  });
  it("the scan has teeth: planted columns are refused, each for its own reason", () => {
    expect(sortPathFaults(models, "requisition", "estimatedValue")).toEqual(expect.arrayContaining(["a SULIT field", "money"]));
    expect(sortPathFaults(models, "project", "exercise.title")).toEqual(["withheld from a contract-stages reader (AC-18)"]);
    expect(sortPathFaults(models, "requisition", "status")).toEqual(["not a text or date column (RequisitionStatus)"]);
    expect(sortPathFaults(models, "exercise", "requisition.estimatedValue")).toEqual(expect.arrayContaining(["a SULIT field", "money"]));
    expect(sortPathFaults(models, "requisition", "exercises.title")[0]).toMatch(/to-many/);
  });
});
