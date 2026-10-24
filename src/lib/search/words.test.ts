import { describe, expect, it } from "vitest";

import { CASE_KEYS, SEARCH_FIELDS } from "./fields";
import { exactKeyWhere, likeLiteral, wordsWhere } from "./words";

/** ADR 0044 D2 and ST-1, as the where it builds. What Postgres does with it is `words.db.test.ts`. */

const term = (w: string) => ({ contains: likeLiteral(w), mode: "insensitive" });

describe("wordsWhere", () => {
  it("two words make two AND terms, and every field path appears in each OR", () => {
    const where = wordsWhere("requisition", ["roof", "PROC/1"]) as { AND: { OR: object[] }[] };
    expect(where.AND).toHaveLength(2);
    for (const [i, w] of ["roof", "PROC/1"].entries()) expect(where.AND[i].OR).toEqual(SEARCH_FIELDS.requisition.map((f) => ({ [f]: term(w) })));
  });
  it("a relation path nests: exercise.requisition.erpRequisitionNo", () => {
    const where = wordsWhere("project", ["x"]) as { AND: { OR: object[] }[] };
    expect(where.AND[0].OR).toContainEqual({ exercise: { requisition: { erpRequisitionNo: term("x") } } });
    expect(where.AND[0].OR).toContainEqual({ contract: { number: term("x") } });
    expect(where.AND[0].OR).toHaveLength(SEARCH_FIELDS.project.length);
  });
  it("no words is an empty AND, which matches every row in the caller's scope", () => {
    expect(wordsWhere("supplier", [])).toEqual({ AND: [] });
  });
});

describe("likeLiteral", () => {
  it("escapes the backslash first, then % and _, and leaves other text alone", () => {
    expect(likeLiteral("50%")).toBe("50\\%");
    expect(likeLiteral("a_b")).toBe("a\\_b");
    expect(likeLiteral("a\\%")).toBe("a\\\\\\%");
    expect(likeLiteral("Dato' Abd. Rahman")).toBe("Dato' Abd. Rahman");
  });
});

describe("exactKeyWhere", () => {
  it("is one whole-value, case-insensitive OR over the entity's case keys, wildcards escaped", () => {
    expect(exactKeyWhere("project", "XI_1")).toEqual({ OR: CASE_KEYS.project!.map((k) => (k === "contract.number" ? { contract: { number: { equals: "XI\\_1", mode: "insensitive" } } } : { [k]: { equals: "XI\\_1", mode: "insensitive" } })) });
  });
  it("is null for an entity with no case keys", () => {
    expect(exactKeyWhere("supplier", "x")).toBeNull();
    expect(exactKeyWhere("sitting", "x")).toBeNull();
  });
});
