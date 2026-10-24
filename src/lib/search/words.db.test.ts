import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { exactKeyWhere, wordsWhere } from "./words";

/**
 * ADR 0044 D2 and ST-1 against Postgres: a search word is matched case-insensitively as a substring, and LIKE's wildcards in it are
 * literal. Plan 7.1 left open whether Prisma 7's `contains` escapes `%` and `_`; this file decided it: with `likeLiteral` switched
 * off, `50%` found "500 works", `a_b` found "axb", and the exact key `WD/REQ_1` (insensitive `equals`, also ILIKE) found `WD/REQx1`.
 * So `words.ts` escapes. Positive controls sit beside each refusal, so a double escape (which would break a literal match) fails too.
 */

const run = randomId();
let organisationId = "";
const titles = {
  pct: `50% works ${run}`,
  five: `500 works ${run}`,
  under: `a_b fittings ${run}`,
  x: `axb fittings ${run}`,
  slash: `back\\slash ${run}`,
  // NFR-LNG-004: a Malay name with honorifics and an apostrophe, as an organisation's officer would type it.
  malay: `Bekalan untuk Dato' Sri Haji Abd. Rahman bin Ismail ${run}`,
};
const refs = { under: `WD/REQ_1/${run}`, x: `WD/REQx1/${run}` };

async function requisition(title: string, reference = `WD/${randomId()}`, requestingPersonId: string) {
  await db.requisition.create({
    data: {
      organisationId, reference, requestingUnitCode: `WD_UNIT_${run}`, requestingPersonId, title,
      justification: "For the search word tests.", needStatement: "None.", costCentreCode: "WD_CC", accountCode: "WD_AC", placeOfDelivery: "Nowhere",
      dateRequired: new Date("2026-12-31T00:00:00Z"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01T00:00:00Z"),
    },
  });
}

const found = async (words: string[]) =>
  (await db.requisition.findMany({ where: { AND: [{ organisationId }, wordsWhere("requisition", words)] }, select: { title: true } })).map((r) => r.title).sort();
const exact = async (q: string) =>
  (await db.requisition.findMany({ where: { AND: [{ organisationId }, exactKeyWhere("requisition", q)!] }, select: { reference: true } })).map((r) => r.reference);

beforeAll(async () => {
  const org = await db.organisation.upsert({ where: { code: "P7_SEARCH_WORDS" }, update: {}, create: { code: "P7_SEARCH_WORDS", name: "Search words test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  const person = (await makePerson(organisationId, `Requester ${run}`)).id;
  await requisition(titles.pct, undefined, person);
  await requisition(titles.five, undefined, person);
  await requisition(titles.under, refs.under, person);
  await requisition(titles.x, refs.x, person);
  await requisition(titles.slash, undefined, person);
  await requisition(titles.malay, undefined, person);
});

describe("LIKE wildcards in a word are literal (plan 7.1)", () => {
  it("50% finds '50% works' and not '500 works'", async () => {
    expect(await found(["50%", run])).toEqual([titles.pct]);
  });
  it("a_b finds 'a_b' and not 'axb'", async () => {
    expect(await found(["a_b", run])).toEqual([titles.under]);
  });
  it("a backslash is literal too", async () => {
    expect(await found(["back\\slash", run])).toEqual([titles.slash]);
    expect(await found(["backslash", run])).toEqual([]);
  });
  it("an exact case key is whole-value and case-insensitive, with `_` literal", async () => {
    expect(await exact(refs.under.toLowerCase())).toEqual([refs.under]);
    expect(await exact(`WD/REQ_1`)).toEqual([]);
  });
});

describe("every word must match, in any order and any case (ST-1)", () => {
  it("two words both present find the row; one absent finds nothing", async () => {
    expect(await found(["works", run])).toEqual([titles.pct, titles.five].sort());
    expect(await found(["works", "fittings", run])).toEqual([]);
  });
  it("no words: the fragment matches every row in scope", async () => {
    expect((await found([])).filter((t) => t.endsWith(run))).toHaveLength(Object.keys(titles).length);
  });
  it("a Malay name with honorifics and an apostrophe (NFR-LNG-004), out of order and in capitals", async () => {
    expect(await found(["RAHMAN", "dato'", run])).toEqual([titles.malay]);
    expect(await found(["abd.", "BIN", "ismail", "haji", run])).toEqual([titles.malay]);
    // No alias or spelling variant is matched (FR-CRT-011 stays open): "Abdul" is not "Abd.".
    expect(await found(["abdul", run])).toEqual([]);
  });
});
