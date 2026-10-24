import { beforeAll, describe, expect, it } from "vitest";

import { judgedViewIds } from "./judged-views";
import { db } from "@/lib/db";
import { LIST_EXPORT_MAX_ROWS, parseListQuery, sortKeys } from "@/lib/list-query";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { exerciseCandidates, exerciseListFacts, EXERCISE_VIEWS, listExercises } from "./repo";

/**
 * 7.3, against the scratch database: the exercises list is searched, viewed, sorted and paged by the server over the whole set; a restricted exercise the reader may not see is in no
 * view, count or page; "On the boundary" is judged for the reader before it is paged; and the export's full-set read is bounded.
 */
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const query = (sp: Record<string, string>) => parseListQuery(sp, EXERCISE_VIEWS, sortKeys("exercise"));
let organisationId: string;
let personId: string;
const requisitions: Record<string, { id: string; reference: string }> = {};
const ex: Record<string, string> = {};

const requisitionRow = (org: string, person: string, reference: string) => ({
  organisationId: org, reference, requestingUnitCode: "LX_DEPT", requestingPersonId: person, title: "Parent", justification: "Tests.", needStatement: "None.", costCentreCode: "LX_CC",
  accountCode: "LX_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"), status: "APPROVED" as const,
});
const exerciseRow = (org: string, requisitionId: string, over: Record<string, unknown>) => ({
  organisationId: org, reference: `LX/EX/${randomId()}`, requisitionId, title: "Exercise", estimatedValue: "1000.00", sourcingMethodCode: "M", status: "DRAFT" as const, ...over,
});

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `LX_${randomId()}`, name: "Exercise list test organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
  personId = (await makePerson(organisationId)).id;
  for (const name of ["a", "b"]) {
    const reference = `LX/REQ/${name.toUpperCase()}${randomId()}`;
    requisitions[name] = { id: (await db.requisition.create({ data: requisitionRow(organisationId, personId, reference) })).id, reference };
  }
  // 30 drafts on requisition A (so a later page exists), and the special ones on B.
  await db.sourcingExercise.createMany({ data: Array.from({ length: 30 }, (_, i) => exerciseRow(organisationId, requisitions.a.id, { reference: `LX/EX/${String(i).padStart(3, "0")}`, title: `Draft ${i}`, createdAt: new Date(Date.UTC(2026, 0, 1 + i)) })) });
  const mk = async (name: string, over: Record<string, unknown>) => { ex[name] = (await db.sourcingExercise.create({ data: exerciseRow(organisationId, requisitions.b.id, over) })).id; };
  await mk("hidden", { title: "Hidden pack", status: "DRAFT", onBoundary: true });
  await mk("boundaryA", { title: "Boundary A", status: "ADVERTISED", onBoundary: true });
  await mk("boundaryB", { title: "Boundary B", status: "ADVERTISED", onBoundary: true });
  await mk("cancelledBoundary", { title: "Cancelled", status: "CANCELLED", onBoundary: true });
  await mk("preparing", { title: "In preparation", status: "DOCUMENTS_IN_PREPARATION" });
  const other = (await db.organisation.create({ data: { code: `LX_${randomId()}`, name: "Other", timeZone: "Asia/Kuala_Lumpur" } })).id;
  const otherReq = await db.requisition.create({ data: requisitionRow(other, (await makePerson(other)).id, `LX/REQ/O${randomId()}`) });
  await db.sourcingExercise.create({ data: exerciseRow(other, otherReq.id, { title: "Boundary A", status: "ADVERTISED", onBoundary: true }) });
}, 60_000);

describe("listExercises, server mode", () => {
  it("pages the whole set, the true total, and finds a row from a later page by its title, reference or its requisition's PROC number", async () => {
    const first = await listExercises(organisationId, [], query({}));
    expect(first.rows).toHaveLength(25);
    expect(first.total).toBe(35);
    expect((await listExercises(organisationId, [], query({ page: "9" }))).page).toBe(1);
    // Draft 0 is the oldest: beyond page 0 of the unsearched list.
    expect(first.rows.map((r) => r.title)).not.toContain("Draft 0");
    expect((await listExercises(organisationId, [], query({ q: "LX/EX/000" }))).rows.map((r) => r.title)).toEqual(["Draft 0"]);
    expect((await listExercises(organisationId, [], query({ q: "LX/EX/001" }))).total).toBe(1);
    const byProc = await listExercises(organisationId, [], query({ q: requisitions.a.reference }));
    expect(byProc.total).toBe(30);
    expect(byProc.rows).toHaveLength(25);
  });

  it("views by status and by the pending name route, with the search; the total is the rows' count", async () => {
    expect((await listExercises(organisationId, [], query({ view: "preparing" }))).rows.map((r) => r.id)).toEqual([ex.preparing]);
    const drafts = await listExercises(organisationId, [], query({ view: "drafts", q: "Draft" }));
    expect(drafts.total).toBe(30);
    expect((await listExercises(organisationId, [], query({ view: "published" }))).total).toBe(2);
    expect((await listExercises(organisationId, [], query({ view: "name" }))).total).toBe(0);
  });

  it("leaves a hidden exercise out of every view, count, candidate list and page, even when its id is asked for", async () => {
    const hidden = [ex.hidden];
    expect((await listExercises(organisationId, hidden, query({}))).total).toBe(34);
    expect((await listExercises(organisationId, hidden, query({ q: "Hidden pack" }))).total).toBe(0);
    expect((await listExercises(organisationId, hidden, query({ view: "drafts" }))).total).toBe(30);
    const facts = await exerciseListFacts(organisationId, hidden);
    expect(facts.byStatus.get("DRAFT")).toBe(30);
    expect(facts.onBoundary.map((r) => r.id)).not.toContain(ex.hidden);
    expect((await exerciseCandidates(organisationId, hidden, query({ view: "boundary" }))).map((r) => r.id)).not.toContain(ex.hidden);
    const asked = await listExercises(organisationId, hidden, query({ view: "boundary" }), { ids: [ex.hidden, ex.boundaryA] });
    expect(asked.rows.map((r) => r.id)).toEqual([ex.boundaryA]);
    // Seen by someone who may see it, it is there.
    expect((await listExercises(organisationId, [], query({ q: "Hidden pack" }))).total).toBe(1);
  });

  it("the boundary view lists and counts only the exercises whose estimate the reader is granted, before paging", async () => {
    const candidates = await exerciseCandidates(organisationId, [ex.hidden], query({ view: "boundary" }));
    // Not cancelled, on the boundary, the organisation's own (the other organisation's same-titled one is not here).
    expect(candidates.map((c) => c.id).sort()).toEqual([ex.boundaryA, ex.boundaryB].sort());
    const ids = judgedViewIds("boundary", candidates, { windows: new Map(), today: null, granted: new Set([ex.boundaryB]) });
    const got = await listExercises(organisationId, [ex.hidden], query({ view: "boundary" }), { ids });
    expect(got.rows.map((r) => r.id)).toEqual([ex.boundaryB]);
    expect(got.total).toBe(1);
    // A reader granted none sees none, and a count of zero.
    const none = await listExercises(organisationId, [ex.hidden], query({ view: "boundary" }), { ids: judgedViewIds("boundary", candidates, { windows: new Map(), today: null, granted: new Set() }) });
    expect(none.total).toBe(0);
    expect(none.rows).toEqual([]);
  });

  it("a judged view pages the judged ids in the order given, and the candidates come in the list's order", async () => {
    const ids = [ex.boundaryB, ex.boundaryA];
    const got = await listExercises(organisationId, [], query({ view: "boundary", size: "10" }), { ids });
    expect(got.rows.map((r) => r.id)).toEqual(ids);
    const candidates = await exerciseCandidates(organisationId, [ex.hidden], query({ view: "boundary", sort: "title", dir: "asc" }));
    expect(candidates.map((c) => c.id)).toEqual([ex.boundaryA, ex.boundaryB]);
  });

  it("sorts on the allowed columns and refuses the rest", async () => {
    expect((await listExercises(organisationId, [], query({ sort: "title", dir: "asc" }))).rows[0].title).toBe("Boundary A");
    expect((await listExercises(organisationId, [], query({ sort: "reference", dir: "asc" }))).rows[0].reference).toBe("LX/EX/000");
    expect(query({ sort: "estimatedValue" }).sort).toBeNull();
    expect(query({ sort: "status" }).sort).toBeNull();
    const refused = await listExercises(organisationId, [], query({ sort: "estimatedValue", dir: "asc" }));
    expect(refused.rows.map((r) => r.id)).toEqual((await listExercises(organisationId, [], query({}))).rows.map((r) => r.id));
  });
});

describe("listExercises { all: true }", () => {
  it("returns at most the export cap and one more, under the same where as the page", async () => {
    const org = (await db.organisation.create({ data: { code: `LX_${randomId()}`, name: "Big", timeZone: "Asia/Kuala_Lumpur" } })).id;
    const req = await db.requisition.create({ data: requisitionRow(org, (await makePerson(org)).id, `LX/REQ/BIG${randomId()}`) });
    await db.sourcingExercise.createMany({ data: Array.from({ length: LIST_EXPORT_MAX_ROWS + 3 }, (_, i) => exerciseRow(org, req.id, { reference: `BIG/${String(i).padStart(5, "0")}`, status: i < LIST_EXPORT_MAX_ROWS + 2 ? "DRAFT" : "CANCELLED" })) });
    const q = query({ view: "drafts" });
    const all = await listExercises(org, [], q, { all: true });
    expect(all.rows).toHaveLength(LIST_EXPORT_MAX_ROWS + 1);
    expect(all.total).toBe(LIST_EXPORT_MAX_ROWS + 2);
    expect((await listExercises(org, [], q)).total).toBe(all.total);
    const few = await listExercises(organisationId, [], query({ view: "preparing" }), { all: true });
    expect(few.rows).toHaveLength(1);
  }, 60_000);

  it("the chips count under the facets: with a method filter each chip equals its view's total (I-6)", async () => {
    await db.sourcingExercise.create({ data: exerciseRow(organisationId, requisitions.b.id, { title: "Other method draft", sourcingMethodCode: "M2", status: "DRAFT" }) });
    const facts = await exerciseListFacts(organisationId, [], query({ method: "M2" }));
    expect(facts.byStatus.get("DRAFT")).toBe((await listExercises(organisationId, [], query({ method: "M2", view: "drafts" }))).total);
    expect(facts.byStatus.get("DRAFT")).toBe(1);
    expect(facts.publishedIds).toEqual([]);
    expect((await exerciseListFacts(organisationId, [], query({}))).byStatus.get("DRAFT")).toBe(32);
  });
});
