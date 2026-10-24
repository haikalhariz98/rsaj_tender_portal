import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { parseListQuery, sortKeys } from "@/lib/list-query";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { listRequisitions, REQUISITION_VIEWS } from "./repo";

/**
 * 7.3, against the scratch database: the requisitions list is searched, viewed, sorted and paged by the server over the whole set (a row on a later page is found from the
 * first), and `total` is the count under the same where as the rows.
 */
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const query = (sp: Record<string, string>) => parseListQuery(sp, REQUISITION_VIEWS, sortKeys("requisition"));
let organisationId: string;
let personId: string;
const ref = (n: number) => `LST/REQ/${String(n).padStart(4, "0")}`;

const requisition = (over: Record<string, unknown>) => ({
  organisationId, reference: `LST/REQ/${randomId()}`, requestingUnitCode: "LST_DEPT", requestingPersonId: personId, title: "Listed", justification: "Tests.", needStatement: "None.", costCentreCode: "LST_CC",
  accountCode: "LST_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"), status: "APPROVED" as const, ...over,
});

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `LST_${randomId()}`, name: "List test organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
  personId = (await makePerson(organisationId)).id;
  // 60 requisitions, one a day, the dearest oldest: 0000 is the oldest, 0059 the newest. Every tenth is pending, every seventh a draft.
  await db.requisition.createMany({
    data: Array.from({ length: 60 }, (_, i) =>
      requisition({ reference: ref(i), title: i === 3 ? "Oldest chairs" : `Item ${i}`, erpRequisitionNo: `ERP-${1000 + i}`, raisedOn: day(`2026-08-${String(1 + Math.floor(i / 3)).padStart(2, "0")}`), status: i % 10 === 0 ? "PENDING_APPROVAL" : i % 7 === 0 ? "DRAFT" : "APPROVED" })),
  });
  // Another organisation's, with the same words.
  const other = (await db.organisation.create({ data: { code: `LST_${randomId()}`, name: "Other", timeZone: "Asia/Kuala_Lumpur" } })).id;
  await db.requisition.create({ data: { ...requisition({ reference: "LST/REQ/OTHER", title: "Oldest chairs" }), organisationId: other, requestingPersonId: (await makePerson(other)).id } });
}, 60_000);

describe("listRequisitions, server mode", () => {
  it("pages the whole set: 25 a page, the true total, a page past the end is the last", async () => {
    const first = await listRequisitions(organisationId, query({}));
    expect(first.rows).toHaveLength(25);
    expect(first.total).toBe(60);
    const third = await listRequisitions(organisationId, query({ page: "2" }));
    expect(third.rows).toHaveLength(10);
    const past = await listRequisitions(organisationId, query({ page: "99" }));
    expect(past.page).toBe(2);
    expect(past.rows.map((r) => r.id)).toEqual(third.rows.map((r) => r.id));
    expect(new Set([...first.rows, ...(await listRequisitions(organisationId, query({ page: "1" }))).rows, ...third.rows].map((r) => r.id)).size).toBe(60);
  });

  it("finds a requisition that sits on a later page from the first, by its PROC number, its finance number or its title", async () => {
    const byRef = await listRequisitions(organisationId, query({ q: ref(0) }));
    expect(byRef.rows.map((r) => r.reference)).toEqual([ref(0)]);
    expect(byRef.total).toBe(1);
    expect((await listRequisitions(organisationId, query({ q: "ERP-1000" }))).rows.map((r) => r.reference)).toEqual([ref(0)]);
    expect((await listRequisitions(organisationId, query({ q: "oldest chairs" }))).rows.map((r) => r.reference)).toEqual([ref(3)]);
    // The oldest is beyond page 0 of the unsearched list: it is found because the server searches the set.
    expect((await listRequisitions(organisationId, query({}))).rows.map((r) => r.reference)).not.toContain(ref(0));
  });

  it("the pending view and the search together; the total is the count of the rows that match", async () => {
    const pending = await listRequisitions(organisationId, query({ view: "pending" }));
    expect(pending.rows.every((r) => r.status === "PENDING_APPROVAL")).toBe(true);
    expect(pending.total).toBe(6);
    const both = await listRequisitions(organisationId, query({ view: "pending", q: "Item 50" }));
    expect(both.rows.map((r) => r.reference)).toEqual([ref(50)]);
    expect(both.total).toBe(1);
    const drafts = await listRequisitions(organisationId, query({ view: "drafts" }));
    expect(drafts.rows.every((r) => r.status === "DRAFT")).toBe(true);
    expect(drafts.total).toBe(drafts.rows.length);
    // Counts stay over the whole set, whatever the view.
    expect(pending.counts).toEqual((await listRequisitions(organisationId, query({}))).counts);
    expect(pending.counts.pending).toBe(6);
  });

  it("is the organisation's own: another organisation's row with the same words is not found", async () => {
    expect((await listRequisitions(organisationId, query({ q: "LST/REQ/OTHER" }))).total).toBe(0);
  });

  it("sorts before paging, on the allowed columns; newest first by default; a column outside the set is refused", async () => {
    const asc = await listRequisitions(organisationId, query({ sort: "reference", dir: "asc" }));
    expect(asc.rows[0].reference).toBe(ref(0));
    const desc = await listRequisitions(organisationId, query({ sort: "reference" }));
    expect(desc.rows[0].reference).toBe(ref(59));
    const newest = await listRequisitions(organisationId, query({}));
    expect(newest.rows[0].raisedOn.getTime()).toBeGreaterThanOrEqual(newest.rows[24].raisedOn.getTime());
    // An order discloses the value it sorts on: a money column is not in the set, so asking for it is the default order.
    expect(query({ sort: "estimatedValue" }).sort).toBeNull();
    expect((await listRequisitions(organisationId, query({ sort: "estimatedValue", dir: "asc" }))).rows.map((r) => r.id)).toEqual(newest.rows.map((r) => r.id));
    // The page boundary neither repeats nor drops a row of one date.
    const seen = new Set<string>();
    for (const page of ["0", "1", "2"]) for (const r of (await listRequisitions(organisationId, query({ sort: "title", page }))).rows) seen.add(r.id);
    expect(seen.size).toBe(60);
  });

  it("{ all: true } reads from the first row, up to the cap and one more, under the same where", async () => {
    const all = await listRequisitions(organisationId, query({ view: "pending", size: "10" }), { all: true });
    expect(all.rows).toHaveLength(6);
    expect(all.total).toBe(6);
  });
});
