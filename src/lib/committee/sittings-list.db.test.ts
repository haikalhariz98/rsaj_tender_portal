import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { LIST_EXPORT_MAX_ROWS, parseListQuery, sortKeys } from "@/lib/list-query";
import { randomId } from "@/lib/test-db/auth-fixtures";

import { listSittings, SITTING_VIEWS } from "./sittings";

/**
 * 7.4, against the scratch database: the sittings list is searched, viewed, sorted and paged by the server over the whole set (a sitting on a later page is found
 * from the first), and `total` is the count under the same where as the rows. A sitting is found by its reference and its committee's name, and by nothing a
 * matter holds (ST-3, FR-MTD-007).
 */
const run = randomId();
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const query = (sp: Record<string, string> = {}) => parseListQuery(sp, SITTING_VIEWS, sortKeys("sitting"));
const ref = (n: number) => `SIT/${run}/${String(n).padStart(3, "0")}`;
const SECRET = `zebra${run}`;
let scope: { organisationId: string; organisationCode: string };
let otherScope: { organisationId: string; organisationCode: string };

beforeAll(async () => {
  const code = `SITL_${run}`;
  const org = await db.organisation.create({ data: { code, name: "Sittings list organisation", timeZone: "Asia/Kuala_Lumpur" } });
  scope = { organisationId: org.id, organisationCode: code };
  const otherOrg = await db.organisation.create({ data: { code: `SITL_O_${run}`, name: "Other", timeZone: "Asia/Kuala_Lumpur" } });
  otherScope = { organisationId: otherOrg.id, organisationCode: otherOrg.code };
  const board = await db.committee.create({ data: { organisationId: org.id, code: `TB_${run}`, nameEn: `Tender Board ${run}`, mandate: "Tests.", governingSource: "None." } });
  const panel = await db.committee.create({ data: { organisationId: org.id, code: `VP_${run}`, nameEn: `Variation Panel ${run}`, mandate: "Tests.", governingSource: "None." } });
  // 60 sittings, one a day, 000 the oldest; every fourth is the panel's. Every tenth is in progress, every seventh scheduled.
  for (let n = 0; n < 60; n++) {
    const m = await db.meeting.create({
      data: { committeeId: n % 4 === 0 ? panel.id : board.id, reference: ref(n), meetingDate: day(`2026-${n < 30 ? "08" : "09"}-${String((n % 30) + 1).padStart(2, "0")}`), status: n % 10 === 0 ? "IN_PROGRESS" : n % 7 === 0 ? "SCHEDULED" : "MINUTED" },
    });
    // A matter's title is not a search field.
    if (n === 5) await db.committeeDecision.create({ data: { meetingId: m.id, domain: "requisition", subject: `Matter ${SECRET}` } });
  }
  // Another organisation's sitting with the same committee name.
  const c = await db.committee.create({ data: { organisationId: otherOrg.id, code: `TB_${run}`, nameEn: `Tender Board ${run}`, mandate: "Tests.", governingSource: "None." } });
  await db.meeting.create({ data: { committeeId: c.id, reference: `SIT/OTHER/${run}`, meetingDate: day("2026-10-01") } });
}, 120_000);

describe("listSittings, server mode", () => {
  it("pages the whole set, newest first: the true total, a page past the end is the last, no row twice", async () => {
    const first = await listSittings(scope, query());
    expect(first.sittings).toHaveLength(25);
    expect(first.total).toBe(60);
    expect(first.sittings[0].meetingDate.getTime()).toBeGreaterThanOrEqual(first.sittings[24].meetingDate.getTime());
    const past = await listSittings(scope, query({ page: "99" }));
    expect(past.page).toBe(2);
    expect(past.sittings).toHaveLength(10);
    const seen = new Set<string>();
    for (const page of ["0", "1", "2"]) for (const s of (await listSittings(scope, query({ page }))).sittings) seen.add(s.id);
    expect(seen.size).toBe(60);
  });

  it("finds a sitting that sits on a later page from the first, by its reference or its committee's name", async () => {
    const oldest = ref(0);
    expect((await listSittings(scope, query())).sittings.map((s) => s.reference)).not.toContain(oldest);
    const byRef = await listSittings(scope, query({ q: oldest }));
    expect(byRef.sittings.map((s) => s.reference)).toEqual([oldest]);
    expect(byRef.total).toBe(1);
    const byCommittee = await listSittings(scope, query({ q: `variation panel ${run}` }));
    expect(byCommittee.total).toBe(15);
    expect(byCommittee.sittings.every((s) => s.committeeName === `Variation Panel ${run}`)).toBe(true);
    // Both words must match: a reference and the other committee's name find nothing.
    expect((await listSittings(scope, query({ q: `${ref(0)} Tender Board` }))).total).toBe(0);
  });

  it("nothing a matter holds is searched", async () => {
    expect((await listSittings(scope, query({ q: SECRET }))).total).toBe(0);
  });

  it("views are the sitting's status over the whole set; the total of a view is its rows; the header counts stay over the whole set", async () => {
    const upcoming = await listSittings(scope, query({ view: "upcoming", size: "10" }));
    expect(upcoming.sittings.every((s) => s.status === "SCHEDULED")).toBe(true);
    expect(upcoming.total).toBe(upcoming.counts.upcoming);
    const awaiting = await listSittings(scope, query({ view: "awaiting", size: "10" }));
    expect(awaiting.total).toBe(6);
    expect(awaiting.counts).toEqual((await listSittings(scope, query())).counts);
    const both = await listSittings(scope, query({ view: "awaiting", q: ref(30) }));
    expect(both.sittings.map((s) => s.reference)).toEqual([ref(30)]);
    expect((await listSittings(scope, query({ view: "upcoming", q: ref(30) }))).total).toBe(0);
  });

  it("is the organisation's own: another organisation's sitting with the same committee name is not found", async () => {
    expect((await listSittings(scope, query({ q: `SIT/OTHER/${run}` }))).total).toBe(0);
    expect((await listSittings(otherScope, query({ q: `Tender Board ${run}` }))).total).toBe(1);
  });

  it("sorts before paging on the allowed columns; a column outside the set is the default order; the page boundary neither repeats nor drops a sitting", async () => {
    expect((await listSittings(scope, query({ sort: "reference", dir: "asc" }))).sittings[0].reference).toBe(ref(0));
    expect((await listSittings(scope, query({ sort: "reference" }))).sittings[0].reference).toBe(ref(59));
    const byName = await listSittings(scope, query({ sort: "name", dir: "asc", size: "50" }));
    expect(byName.sittings[0].committeeName).toBe(`Tender Board ${run}`);
    const newest = await listSittings(scope, query());
    expect(query({ sort: "matters" }).sort).toBeNull();
    expect((await listSittings(scope, query({ sort: "matters", dir: "asc" }))).sittings.map((s) => s.id)).toEqual(newest.sittings.map((s) => s.id));
    const seen = new Set<string>();
    for (const page of ["0", "1", "2"]) for (const s of (await listSittings(scope, query({ sort: "date", page }))).sittings) seen.add(s.id);
    expect(seen.size).toBe(60);
  });

  it("{ all: true } reads from the first row, up to the cap and one more, under the same where", async () => {
    const all = await listSittings(scope, query({ view: "awaiting", size: "10" }), { all: true });
    expect(all.sittings).toHaveLength(6);
    expect(all.total).toBe(6);
    expect(all.sittings.length).toBeLessThanOrEqual(LIST_EXPORT_MAX_ROWS + 1);
  });
});
