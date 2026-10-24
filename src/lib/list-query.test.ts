import { describe, expect, it } from "vitest";

import { LIST_SORTS, listHref, listOrderBy, parseListQuery, Q_MAX, sortKeys } from "./list-query";

/** ADR 0044 D5 and ST-6, ST-7: a list's query read from its address, and written back. */

const VIEWS = ["pending", "drafts"] as const;
const SORTS = sortKeys("requisition");
const parse = (sp: Record<string, string | string[] | undefined>) => parseListQuery(sp, VIEWS, SORTS);

describe("parseListQuery", () => {
  it("an empty address is page 0 of 25, all views, the default sort", () => {
    expect(parse({})).toEqual({ q: null, words: [], view: null, page: 0, size: 25, sort: null, dir: "desc" });
  });
  it("a bad page is 0: negative, letters, exponent, fraction, too big to be exact", () => {
    for (const page of ["-1", "abc", "1e9", "1.5", "", "99999999999999999999"]) expect(parse({ page }).page, page).toBe(0);
    expect(parse({ page: "3" }).page).toBe(3);
  });
  it("an unknown view is null; a known one is kept", () => {
    expect(parse({ view: "over" }).view).toBeNull();
    expect(parse({ view: "constructor" }).view).toBeNull();
    expect(parse({ view: "drafts" }).view).toBe("drafts");
  });
  it("a size outside 10, 25 and 50 is 25; old ?page=n links with no size read as 25 (ST-6)", () => {
    for (const size of ["5", "100", "25.0", "abc"]) expect(parse({ size }).size, size).toBe(25);
    expect(parse({ size: "10" }).size).toBe(10);
    expect(parse({ size: "50" }).size).toBe(50);
    expect(parse({ page: "2" })).toMatchObject({ page: 2, size: 25 });
  });
  it("q is trimmed and its inner whitespace collapsed into words", () => {
    expect(parse({ q: "  PROC/2026   roof\tworks " })).toMatchObject({ q: "PROC/2026 roof works", words: ["PROC/2026", "roof", "works"] });
  });
  it("q shorter than 2 or longer than 100 characters is null", () => {
    expect(parse({ q: " a " })).toMatchObject({ q: null, words: [] });
    expect(parse({ q: "x".repeat(Q_MAX + 1) }).q).toBeNull();
    expect(parse({ q: "x".repeat(Q_MAX) }).q).toHaveLength(Q_MAX);
    expect(parse({ q: "ab" }).q).toBe("ab");
  });
  it("wildcards stay in the words as typed: words.ts makes them literal", () => {
    expect(parse({ q: "50% a_b" }).words).toEqual(["50%", "a_b"]);
  });
  it("a repeated parameter reads as its first value", () => {
    expect(parse({ q: ["roof", "x"], view: ["drafts", "pending"], page: ["2", "9"], size: ["10", "50"], sort: ["title", "date"], dir: ["asc", "desc"] })).toEqual({ q: "roof", words: ["roof"], view: "drafts", page: 2, size: 10, sort: "title", dir: "asc" });
  });
  it("sort is only one of the list's own keys, and dir is asc or desc (ST-7)", () => {
    expect(parse({ sort: "estimatedValue" }).sort).toBeNull();
    expect(parse({ sort: "constructor" }).sort).toBeNull();
    expect(parse({ sort: "reference", dir: "sideways" })).toMatchObject({ sort: "reference", dir: "desc" });
    expect(parseListQuery({ sort: "title" }, VIEWS).sort).toBeNull(); // a list with no sort set sorts on nothing
  });
});

describe("listHref", () => {
  it("drops empty and default parts", () => {
    expect(listHref("/requisitions", {})).toBe("/requisitions");
    expect(listHref("/requisitions", { q: null, view: null, sort: null, dir: "desc", page: 0, size: 25 })).toBe("/requisitions");
    expect(listHref("/requisitions", { dir: "asc" })).toBe("/requisitions"); // a direction with no column says nothing
  });
  it("keeps q across pages, and encodes what a search can hold", () => {
    expect(listHref("/requisitions", { q: "50% & Dato'", page: 2 })).toBe("/requisitions?q=50%25+%26+Dato%27&page=2");
    expect(listHref("/requisitions", { q: "roof", view: "pending", sort: "title", dir: "asc", page: 1, size: 50 })).toBe("/requisitions?q=roof&view=pending&sort=title&dir=asc&page=1&size=50");
  });
  it("keeps a query the base already holds (the suppliers tab, the securities view)", () => {
    expect(listHref("/suppliers?tab=applications", { q: "acme", page: 1 })).toBe("/suppliers?tab=applications&q=acme&page=1");
    expect(listHref("/suppliers?tab=applications", {})).toBe("/suppliers?tab=applications");
  });
  it("round-trips: what it writes, parseListQuery reads back", () => {
    const cases = [
      { q: "Dato' Sri 50%", view: "pending", sort: "title", dir: "asc", page: 3, size: 10 },
      { q: null, view: null, sort: "date", dir: "desc", page: 0, size: 50 },
      { q: "PROC/2026/0001", view: "drafts", sort: null, dir: "desc", page: 7, size: 25 },
    ] as const;
    for (const c of cases) {
      const href = listHref("/requisitions", c);
      const sp = Object.fromEntries(new URL(href, "http://x").searchParams);
      expect(parse(sp), href).toMatchObject(c);
    }
  });
});

describe("listOrderBy (ST-7)", () => {
  it("default: the list's main date newest first, then id", () => {
    expect(listOrderBy("requisition", { sort: null, dir: "asc" })).toEqual([{ raisedOn: "desc" }, { id: "desc" }]);
    expect(listOrderBy("sitting", { sort: null, dir: "desc" })).toEqual([{ meetingDate: "desc" }, { id: "desc" }]);
  });
  it("the applications queue is the one exception: oldest first, then id, until a column is chosen", () => {
    expect(listOrderBy("application", { sort: null, dir: "desc" })).toEqual([{ receivedOn: "asc" }, { id: "asc" }]);
    expect(listOrderBy("application", { sort: "date", dir: "desc" })).toEqual([{ receivedOn: "desc" }, { id: "desc" }]);
  });
  it("a chosen column, then id, both in the chosen direction; a relation path nests", () => {
    expect(listOrderBy("exercise", { sort: "title", dir: "asc" })).toEqual([{ title: "asc" }, { id: "asc" }]);
    expect(listOrderBy("sitting", { sort: "name", dir: "desc" })).toEqual([{ committee: { nameEn: "desc" } }, { id: "desc" }]);
  });
  it("a key outside the set, even an Object prototype name, is the default", () => {
    for (const sort of ["estimatedValue", "constructor", "toString"]) expect(listOrderBy("supplier", { sort, dir: "asc" })).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });
  it("every list has reference and date keys (an application has no reference of its own: its applicant's name and its date)", () => {
    for (const e of Object.keys(LIST_SORTS) as (keyof typeof LIST_SORTS)[]) expect(sortKeys(e)).toEqual(expect.arrayContaining([e === "application" ? "name" : "reference", "date"]));
  });
});
