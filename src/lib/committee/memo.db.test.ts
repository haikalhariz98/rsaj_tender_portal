import { beforeAll, describe, expect, it } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { loadInboxPage, unreadCount } from "@/lib/inbox/store";

import { hiddenDecisionIds } from "./hidden";
import { NOT_CARRIED_EVENT_KEY } from "./labels";
import { issueNotCarriedMemo, matterOfDecision } from "./memo-store";

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
    issueNotCarriedMemo(tx, actor, { decisionId, subject: "REQ-1 · Roof", committeeLabel: "Tender Board", outcomeLabel: "Re-clarification", note: "Needs more", href: "/committees", today: "2026-10-09", ...over }),
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

describe("the memo of a matter that names its exercise only by another road (FR-MTD-007, Phase 3c review)", () => {
  const UNIT = `MEMO_UNIT_${run}`;
  let requisitionId = "";
  let exerciseId = "";
  let bqVersionId = "";

  beforeAll(async () => {
    await db.notificationRule.deleteMany({ where: { organisationId, eventKey: NOT_CARRIED_EVENT_KEY } });
    await db.notificationRule.create({ data: { organisationId, eventKey: NOT_CARRIED_EVENT_KEY, nameEn: "A matter was not carried", recipientRoleCodes: [ROLE], reminderOffsetDays: [], isActive: true } });
    // The holder holds the office again, for this test's unit only.
    await db.roleAssignment.deleteMany({ where: { personId: holder, roleCode: ROLE } });
    await db.orgUnit.create({ data: { organisationId, code: UNIT, nameEn: `Memo unit ${run}`, kind: "DEPARTMENT", effectiveFrom: day("2020-01-01") } });
    await db.roleAssignment.create({ data: { personId: holder, roleCode: ROLE, scope: UNIT, effectiveFrom: day("2020-01-01") } });
    requisitionId = (
      await db.requisition.create({
        data: {
          organisationId, reference: `MEMO/REQ/${run}`, requestingUnitCode: UNIT, requestingPersonId: holder, title: "A requisition for the memo tests", justification: "Tests.", needStatement: "None.",
          costCentreCode: "MEMO_CC", accountCode: "MEMO_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"),
        },
      })
    ).id;
    exerciseId = (await db.sourcingExercise.create({ data: { organisationId, reference: `MEMO/EX/${run}`, requisitionId, title: "A restricted exercise for the memo tests", estimatedValue: "1000.00", sourcingMethodCode: "MEMO_METHOD", restricted: true } })).id;
    bqVersionId = (await db.bqVersion.create({ data: { organisationId, exerciseId, versionNo: 1 } })).id;
  });

  it("names the exercise of a scope matter, which holds no exercise of its own, so its memo is hidden from people not named on it", async () => {
    const id = (await db.committeeDecision.create({ data: { meetingId, domain: "scope", subject: "Scope of a restricted exercise", matterKind: "SCOPE", bqVersionId, outcome: "NOT_CARRIED" } })).id;
    expect((await db.committeeDecision.findUniqueOrThrow({ where: { id } })).exerciseId).toBeNull();
    expect(await matterOfDecision(db, organisationId, id)).toEqual({ exerciseId, unitCode: UNIT });
    // The same list of links hides the matter on the committee screens.
    expect([...(await hiddenDecisionIds([id], [exerciseId]))]).toEqual([id]);

    expect(await issue(id)).toBe("ISSUED");
    const notice = await db.staffNotice.findFirstOrThrow({ where: { subjectEntity: "CommitteeDecision", subjectId: id, recipientPersonId: holder } });
    expect(notice.exerciseId).toBe(exerciseId);
    // A recipient not named on the restricted exercise sees neither the notice nor a count for it; one named on it sees both.
    const viewer = { organisationId, personId: holder };
    expect((await loadInboxPage(db, viewer, [exerciseId])).notices.map((n) => n.id)).not.toContain(notice.id);
    expect((await loadInboxPage(db, viewer, [])).notices.map((n) => n.id)).toContain(notice.id);
    expect((await unreadCount(db, viewer, [])) - (await unreadCount(db, viewer, [exerciseId]))).toBe(1);
  });

  it("finds the unit of a variation's or a contract matter's decision through its contract, award, exercise and requisition", async () => {
    const award = await db.award.create({ data: { organisationId, reference: `MEMO/AW/${run}`, exerciseId, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: "ACCEPTED" } });
    const contract = await db.contract.create({ data: { organisationId, number: `MEMO/C/${run}`, numberSource: "SERIES", numberedOn: day("2026-10-02"), awardId: award.id, contractSum: "1000.00" } });
    const matter = await db.contractMatter.create({ data: { organisationId, contractId: contract.id, kind: "EOT", personId: holder, recordedAt: day("2026-10-03") } });
    const id = (await db.committeeDecision.create({ data: { meetingId, domain: "contract_matter", subject: "An extension", matterKind: "CONTRACT", contractMatterId: matter.id, outcome: "NOT_CARRIED" } })).id;
    // A contract is not a restricted exercise's own record, so no exercise is named for it; the unit is found, and the department head is told rather than "nobody holds the office".
    expect(await matterOfDecision(db, organisationId, id)).toEqual({ exerciseId: null, unitCode: UNIT });
    expect(await issue(id)).toBe("ISSUED");
    expect((await db.staffNotice.findMany({ where: { subjectEntity: "CommitteeDecision", subjectId: id } })).map((n) => n.recipientPersonId)).toEqual([holder]);
  });

  it("says the time zone is not set, and does not say nobody holds the office, when the day is not known", async () => {
    const id = await decision();
    expect(await issue(id, { today: null })).toBe("NO_TIME_ZONE");
    expect(await stateOf(id)).toBe("NO_TIME_ZONE");
    expect(await db.staffNotice.count({ where: { subjectEntity: "CommitteeDecision", subjectId: id } })).toBe(0);
  });
});
