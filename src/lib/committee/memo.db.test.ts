import { beforeAll, describe, expect, it } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { NOT_CARRIED_EVENT_KEY } from "./labels";
import { issueNotCarriedMemo } from "./memo-store";

/**
 * FR-CTE-009 against a real database (Phase 3c): the not-approved memo is issued in the portal to the holders of the offices the organisation's own notification rule
 * names, and where it cannot be, the decision says why. Nobody is picked in the rule's place.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const run = randomId();
const ROLE = `MEMO_${run}`;

let organisationId = "";
let organisationCode = "";
let holder = "";
let actor: StaffActor;
let meetingId = "";

async function decision() {
  return (await db.committeeDecision.create({ data: { meetingId, domain: "requisition", subject: `A matter ${randomId()}`, outcome: "NOT_CARRIED" } })).id;
}
const issue = (decisionId: string, over: Partial<Parameters<typeof issueNotCarriedMemo>[2]> = {}) =>
  db.$transaction((tx) =>
    issueNotCarriedMemo(tx, actor, { decisionId, subject: "REQ-1 · Roof", committeeLabel: "Tender Board", outcomeLabel: "Re-clarification", note: "Needs more", unitCode: null, exerciseId: null, href: "/committees", today: "2026-10-09", ...over }),
  );
const stateOf = async (id: string) => (await db.committeeDecision.findUniqueOrThrow({ where: { id } })).memoState;

beforeAll(async () => {
  const org = await db.organisation.upsert({ where: { code: "P3C_MEMO_TEST" }, update: {}, create: { code: "P3C_MEMO_TEST", name: "Memo test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  organisationCode = org.code;
  holder = (await makePerson(organisationId, `Memo holder ${run}`)).id;
  const me = (await makePerson(organisationId, `Memo officer ${run}`)).id;
  actor = {
    kind: "STAFF", accountId: "", sessionId: "", personId: me, personName: "Officer", jobTitle: null, isAdministrator: false, organisationId, organisationCode,
    organisationTimeZone: org.timeZone, offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false,
  };
  await db.authorityRole.create({ data: { organisationId, code: ROLE, nameEn: `Memo office ${run}`, nameMs: `Pejabat ${run}` } });
  const committee = await db.committee.create({ data: { organisationId, code: `MEMO_C_${run}`, nameEn: "Memo committee", mandate: "Tests.", governingSource: "None." } });
  meetingId = (await db.meeting.create({ data: { committeeId: committee.id, reference: `MEMO/${run}`, meetingDate: day("2026-10-05") } })).id;
});

describe("the not-approved memo, issued in the portal", () => {
  it("is not issued where no rule is set: nobody is picked in its place, and the decision says so", async () => {
    await db.notificationRule.deleteMany({ where: { organisationId, eventKey: NOT_CARRIED_EVENT_KEY } });
    const id = await decision();
    expect(await issue(id)).toBe("NO_RULE");
    expect(await stateOf(id)).toBe("NO_RULE");
    expect(await db.staffNotice.count({ where: { subjectEntity: "CommitteeDecision", subjectId: id } })).toBe(0);
  });

  it("is not issued where the rule is switched off, which records that nobody is to be told", async () => {
    await db.notificationRule.create({ data: { organisationId, eventKey: NOT_CARRIED_EVENT_KEY, nameEn: "A matter was not carried", recipientRoleCodes: [ROLE], reminderOffsetDays: [], isActive: false } });
    const id = await decision();
    expect(await issue(id)).toBe("RULE_OFF");
    expect(await db.staffNotice.count({ where: { subjectEntity: "CommitteeDecision", subjectId: id } })).toBe(0);
  });

  it("is not issued where nobody holds the offices the rule names", async () => {
    await db.notificationRule.updateMany({ where: { organisationId, eventKey: NOT_CARRIED_EVENT_KEY }, data: { isActive: true } });
    const id = await decision();
    expect(await issue(id)).toBe("NO_ONE_HOLDS");
    expect(await stateOf(id)).toBe("NO_ONE_HOLDS");
  });

  it("is written as a notice to each holder of the offices the rule names, once, with words and no amount", async () => {
    await db.roleAssignment.create({ data: { personId: holder, roleCode: ROLE, effectiveFrom: day("2020-01-01") } });
    const id = await decision();
    expect(await issue(id)).toBe("ISSUED");
    expect(await stateOf(id)).toBe("ISSUED");
    const told = await db.staffNotice.findMany({ where: { subjectEntity: "CommitteeDecision", subjectId: id } });
    expect(told.map((n) => n.recipientPersonId)).toEqual([holder]);
    expect(told[0]).toMatchObject({ kind: "MATTER_NOT_CARRIED_MEMO", href: "/committees" });
    expect(told[0]!.body).toContain("Re-clarification");
    expect(`${told[0]!.title} ${told[0]!.body}`).not.toMatch(/RM\s?\d/);
    // Issued again for the same decision (a retried act): the key meets the first, and nobody is told twice.
    await issue(id);
    expect(await db.staffNotice.count({ where: { subjectEntity: "CommitteeDecision", subjectId: id } })).toBe(1);
  });

  it("does not tell the holder of an office that has ended", async () => {
    await db.roleAssignment.updateMany({ where: { personId: holder, roleCode: ROLE }, data: { effectiveTo: day("2026-01-01") } });
    const id = await decision();
    expect(await issue(id)).toBe("NO_ONE_HOLDS");
  });
});
