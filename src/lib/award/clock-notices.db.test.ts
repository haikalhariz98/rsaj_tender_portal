import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { loadInboxPage } from "@/lib/inbox/store";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { CLOCK_EVENT_KEY } from "@/lib/inbox/clock-plan";

import { loadClockPlan, raiseCaseClockNotices } from "./clock-notices";

/// FR-AWD-006 and FR-AWD-009 (C13, AC-42): reading a late case twice writes one notice per recipient, the recipients are the requester and the holders of the offices the organisation's
/// notification rule names (not unit heads), and a restricted exercise's notice is hidden from those not named on it.
let organisationId = "";
let requester = "";
let holder = "";
let unitHead = "";
let outsider = "";
const run = randomId();
// A new organisation each run, so no rule from an earlier run is read as this run's.
const ORG_CODE = `C13_CLOCK_${run}`;
const unitCode = `U_${run}`;
const OFFICE = `OFF_${run}`;
const EMPTY_OFFICE = `EMPTY_${run}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: ORG_CODE, name: "Clock notices test", timeZone: "Asia/Kuala_Lumpur" } })).id;
  requester = (await makePerson(organisationId)).id;
  holder = (await makePerson(organisationId)).id;
  unitHead = (await makePerson(organisationId)).id;
  outsider = (await makePerson(organisationId)).id;
  await db.orgUnit.create({ data: { organisationId, code: unitCode, nameEn: "Requesting unit", kind: "DEPARTMENT", headPersonId: unitHead, effectiveFrom: day("2020-01-01") } });
  for (const code of [OFFICE, EMPTY_OFFICE]) await db.authorityRole.create({ data: { organisationId, code, nameEn: `Office ${code}`, nameMs: `Pejabat ${code}` } });
  await db.roleAssignment.create({ data: { personId: holder, roleCode: OFFICE, scope: unitCode, effectiveFrom: day("2020-01-01") } });
});

const rule = (eventKey: string, over: { isActive?: boolean; offices?: string[] } = {}) =>
  db.notificationRule.upsert({
    where: { organisationId_eventKey: { organisationId, eventKey } },
    update: { isActive: over.isActive ?? true, recipientRoleCodes: over.offices ?? [OFFICE] },
    create: { organisationId, eventKey, nameEn: `Rule ${eventKey}`, recipientRoleCodes: over.offices ?? [OFFICE], reminderOffsetDays: [], isActive: over.isActive ?? true },
  });
const plan = (kind: "INDENT_EXPIRED" | "COMMENCEMENT_LATE", today: string | null = "2026-10-18") =>
  loadClockPlan({ organisationId, organisationCode: ORG_CODE, requestingUnitCode: unitCode, requesterId: requester, today, kind });

const input = (awardId: string, exerciseId: string, recipientIds: string[]) => ({
  organisationId, awardId, awardLabel: "AWD-C13", exerciseId, href: `/projects/${awardId}`,
  clocks: [{ kind: "INDENT_EXPIRED" as const, day: "2026-10-01", dayWords: "1 Oct 2026", recipientIds }, { kind: "COMMENCEMENT_LATE" as const, day: "2026-10-05", dayWords: "5 Oct 2026", recipientIds }],
});

describe("the clock plan against a database (AC-42)", () => {
  it("is the requester alone while no rule names an office, and says which reading it is", async () => {
    expect(await plan("INDENT_EXPIRED")).toMatchObject({ state: "NO_RULE", recipientIds: [requester] });
  });
  it("is the requester and the holders of the offices the rule names, not the unit's head", async () => {
    await rule(CLOCK_EVENT_KEY.INDENT_EXPIRED, { offices: [OFFICE, EMPTY_OFFICE] });
    const p = await plan("INDENT_EXPIRED");
    expect(p.state).toBe("RULE_SET");
    expect(p.recipientIds).toEqual([holder, requester].sort());
    expect(p.recipientIds).not.toContain(unitHead);
    expect(p.emptyOffices).toEqual([EMPTY_OFFICE]);
  });
  it("tells no office when the rule is off, and cannot find holders when the day is unknown", async () => {
    await rule(CLOCK_EVENT_KEY.COMMENCEMENT_LATE, { isActive: false });
    expect(await plan("COMMENCEMENT_LATE")).toMatchObject({ state: "RULE_OFF", recipientIds: [requester] });
    expect(await plan("INDENT_EXPIRED", null)).toMatchObject({ state: "NO_TIME_ZONE", recipientIds: [requester] });
  });
});

describe("the clock notices against a database", () => {
  it("reading twice writes one notice per recipient and clock", async () => {
    const awardId = `award_${randomId()}`;
    expect(await raiseCaseClockNotices(input(awardId, "ex_open", [holder, requester]))).toBe(4);
    expect(await raiseCaseClockNotices(input(awardId, "ex_open", [holder, requester]))).toBe(0);
    expect(await db.staffNotice.count({ where: { subjectId: awardId } })).toBe(4);
    expect((await loadInboxPage(db, { organisationId, personId: holder }, [])).notices.filter((n) => n.href === `/projects/${awardId}`).map((n) => n.kind).sort()).toEqual(["COMMENCEMENT_LATE", "INDENT_EXPIRED"]);
    expect((await loadInboxPage(db, { organisationId, personId: outsider }, [])).notices).toEqual([]);
    expect((await loadInboxPage(db, { organisationId, personId: unitHead }, [])).notices).toEqual([]);
  });

  it("a restricted exercise's notice is left out for someone not named on it", async () => {
    const awardId = `award_${randomId()}`;
    await raiseCaseClockNotices(input(awardId, "ex_restricted", [requester]));
    const seen = (hidden: string[]) => loadInboxPage(db, { organisationId, personId: requester }, hidden).then((r) => r.notices.filter((n) => n.href === `/projects/${awardId}`).length);
    expect(await seen([])).toBe(2);
    expect(await seen(["ex_restricted"])).toBe(0);
  });
});
