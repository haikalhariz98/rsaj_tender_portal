import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { loadInbox } from "@/lib/inbox/store";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { raiseCaseClockNotices } from "./clock-notices";

/// FR-AWD-006 and FR-AWD-009 (C13): reading a late case twice writes one notice per recipient, and a restricted exercise's notice is hidden from those not named on it.
let organisationId = "";
let requester = "";
let head = "";
let outsider = "";
const unitCode = `U_${randomId()}`;

beforeAll(async () => {
  organisationId = (await db.organisation.upsert({ where: { code: "C13_CLOCK_TEST" }, update: {}, create: { code: "C13_CLOCK_TEST", name: "Clock notices test", timeZone: "Asia/Kuala_Lumpur" } })).id;
  requester = (await makePerson(organisationId)).id;
  head = (await makePerson(organisationId)).id;
  outsider = (await makePerson(organisationId)).id;
  await db.orgUnit.create({ data: { organisationId, code: unitCode, nameEn: "Requesting unit", kind: "DEPARTMENT", headPersonId: head, effectiveFrom: new Date("2020-01-01") } });
});

const input = (awardId: string, exerciseId: string) => ({
  organisationId, awardId, awardLabel: "AWD-C13", exerciseId, requesterId: requester, requestingUnitCode: unitCode, on: new Date("2026-10-18"), contractId: null, href: `/projects/${awardId}`,
  clocks: [{ kind: "INDENT_EXPIRED" as const, day: "2026-10-01", dayWords: "1 Oct 2026" }, { kind: "COMMENCEMENT_LATE" as const, day: "2026-10-05", dayWords: "5 Oct 2026" }],
});

describe("the clock notices against a database", () => {
  it("reading twice writes one notice per recipient and clock", async () => {
    const awardId = `award_${randomId()}`;
    expect(await raiseCaseClockNotices(input(awardId, "ex_open"))).toBe(4);
    expect(await raiseCaseClockNotices(input(awardId, "ex_open"))).toBe(0);
    expect(await db.staffNotice.count({ where: { subjectId: awardId } })).toBe(4);
    expect((await loadInbox(db, { organisationId, personId: head }, [])).filter((n) => n.href === `/projects/${awardId}`).map((n) => n.kind).sort()).toEqual(["COMMENCEMENT_LATE", "INDENT_EXPIRED"]);
    expect(await loadInbox(db, { organisationId, personId: outsider }, [])).toEqual([]);
  });

  it("a restricted exercise's notice is left out for someone not named on it", async () => {
    const awardId = `award_${randomId()}`;
    await raiseCaseClockNotices(input(awardId, "ex_restricted"));
    const seen = (hidden: string[]) => loadInbox(db, { organisationId, personId: requester }, hidden).then((r) => r.filter((n) => n.href === `/projects/${awardId}`).length);
    expect(await seen([])).toBe(2);
    expect(await seen(["ex_restricted"])).toBe(0);
  });
});
