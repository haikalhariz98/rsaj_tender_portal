import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { encodeCursor } from "./paging";
import { inboxTotals, loadInboxPage, markAllRead, markBackdateNoticeRead, markRead, openNotice, unreadCount, writeNotices } from "./store";
import { matterNotCarriedMemo, stepEscalatedNotices, type NoticeDraft } from "./notices";

/**
 * The staff inbox and the reporting lines against a real database (Phase 3c): what the migration's constraints and trigger refuse, what a retried act does not
 * write twice, whose notices a person reads, and that a restricted exercise's notices are left out for those not named on it.
 */

let organisationId = "";
let alice = "";
let bob = "";
let mallory = "";

const draft = (over: Partial<NoticeDraft> & Pick<NoticeDraft, "recipientPersonId">): NoticeDraft => ({
  kind: "STEP_ESCALATED",
  subjectEntity: "ApprovalStep",
  subjectId: `step_${randomId()}`,
  occurrence: "1",
  exerciseId: null,
  title: "A step was escalated",
  body: "It moved.",
  href: "/approvals",
  ...over,
});

beforeAll(async () => {
  // Its own organisation: a reporting line recorded in the shared test organisation would switch on the delegate rule for every other file that uses it.
  organisationId = (await db.organisation.upsert({ where: { code: "P3C_INBOX_TEST" }, update: {}, create: { code: "P3C_INBOX_TEST", name: "Inbox test organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
  alice = (await makePerson(organisationId)).id;
  bob = (await makePerson(organisationId)).id;
  mallory = (await makePerson(organisationId)).id;
});

describe("a notice is written once, and only to people of the organisation", () => {
  it("a retried act writes nothing new: the key is the recipient, the kind, the record and the occurrence", async () => {
    const d = draft({ recipientPersonId: alice });
    const first = await db.$transaction((tx) => writeNotices(tx, organisationId, null, [d, d]));
    const retry = await db.$transaction((tx) => writeNotices(tx, organisationId, null, [d]));
    expect(first).toBe(1);
    expect(retry).toBe(0);
    expect(await db.staffNotice.count({ where: { recipientPersonId: alice, subjectId: d.subjectId } })).toBe(1);
  });

  it("a second occurrence of the same event on the same record is another notice", async () => {
    const d = draft({ recipientPersonId: alice });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [d]));
    expect(await db.$transaction((tx) => writeNotices(tx, organisationId, null, [{ ...d, occurrence: "2" }]))).toBe(1);
  });

  it("tells nobody who is not a person of the organisation", async () => {
    const other = await db.organisation.upsert({ where: { code: "INBOX_OTHER_ORG" }, update: {}, create: { code: "INBOX_OTHER_ORG", name: "Another organisation" } });
    const stranger = (await makePerson(other.id)).id;
    expect(await db.$transaction((tx) => writeNotices(tx, organisationId, null, [draft({ recipientPersonId: stranger })]))).toBe(0);
    expect(await db.staffNotice.count({ where: { recipientPersonId: stranger } })).toBe(0);
  });

  it("refuses an unknown kind, an unnamed record and an address that leaves the application", async () => {
    const base = { organisationId, recipientPersonId: alice, subjectEntity: "X", subjectId: "x", title: "t", body: "b" };
    await expect(db.staffNotice.create({ data: { ...base, kind: "SOMETHING_ELSE" } })).rejects.toThrow(/StaffNotice_kind_known|constraint/i);
    await expect(db.staffNotice.create({ data: { ...base, kind: "STEP_ESCALATED", subjectId: "" } })).rejects.toThrow(/StaffNotice_subject_named|constraint/i);
    await expect(db.staffNotice.create({ data: { ...base, kind: "STEP_ESCALATED", subjectId: "y", href: "https://elsewhere.example/" } })).rejects.toThrow(/StaffNotice_href_is_a_local_path|constraint/i);
    await expect(db.staffNotice.create({ data: { ...base, kind: "STEP_ESCALATED", subjectId: "z", href: "//elsewhere.example/" } })).rejects.toThrow(/StaffNotice_href_is_a_local_path|constraint/i);
  });
});

describe("a notice is evidence: only its first reading changes, by any login", () => {
  it("lets readAt go from empty to a time, once, and nothing else change", async () => {
    const d = draft({ recipientPersonId: alice });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [d]));
    const row = await db.staffNotice.findFirstOrThrow({ where: { recipientPersonId: alice, subjectId: d.subjectId } });
    await expect(db.staffNotice.update({ where: { id: row.id }, data: { body: "Changed." } })).rejects.toThrow(/a notice is evidence|PA001/i);
    await expect(db.staffNotice.update({ where: { id: row.id }, data: { recipientPersonId: bob } })).rejects.toThrow(/a notice is evidence|PA001/i);
    await db.staffNotice.update({ where: { id: row.id }, data: { readAt: new Date("2026-10-09T01:00:00Z") } });
    await expect(db.staffNotice.update({ where: { id: row.id }, data: { readAt: new Date("2026-10-10T01:00:00Z") } })).rejects.toThrow(/a notice is evidence|PA001/i);
    await expect(db.staffNotice.update({ where: { id: row.id }, data: { readAt: null } })).rejects.toThrow(/a notice is evidence|PA001/i);
  });

  it("refuses a delete, and a truncate", async () => {
    const d = draft({ recipientPersonId: alice });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [d]));
    await expect(db.staffNotice.deleteMany({ where: { recipientPersonId: alice, subjectId: d.subjectId } })).rejects.toThrow(/a notice is evidence|PA001/i);
    await expect(db.$executeRawUnsafe(`TRUNCATE TABLE "StaffNotice"`)).rejects.toThrow(/a notice is evidence|PA001/i);
  });
});

describe("a person reads their own notices and nobody else's", () => {
  it("lists and counts only what is addressed to them, and marks only their own read", async () => {
    const forBob = draft({ recipientPersonId: bob, title: "For Bob only" });
    const forAlice = draft({ recipientPersonId: alice, title: "For Alice only" });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [forBob, forAlice]));
    const bobs = (await loadInboxPage(db, { organisationId, personId: bob }, [])).notices;
    expect(bobs.some((n) => n.title === "For Bob only")).toBe(true);
    expect(bobs.some((n) => n.title === "For Alice only")).toBe(false);
    // Mallory forges Alice's notice ids into a "mark as read": nothing of Alice's is touched.
    const aliceRow = await db.staffNotice.findFirstOrThrow({ where: { recipientPersonId: alice, subjectId: forAlice.subjectId } });
    expect(await db.$transaction((tx) => markRead(tx, { organisationId, personId: mallory }, [aliceRow.id], new Date("2026-10-09T02:00:00Z")))).toBe(0);
    expect((await db.staffNotice.findUniqueOrThrow({ where: { id: aliceRow.id } })).readAt).toBeNull();
    const before = await unreadCount(db, { organisationId, personId: alice }, []);
    expect(await db.$transaction((tx) => markRead(tx, { organisationId, personId: alice }, [aliceRow.id], new Date("2026-10-09T02:00:00Z")))).toBe(1);
    expect(await unreadCount(db, { organisationId, personId: alice }, [])).toBe(before - 1);
  });

  it("leaves out the notices of an exercise restricted to people the reader is not (FR-MTD-007)", async () => {
    const restricted = draft({ recipientPersonId: alice, title: "About a restricted exercise", exerciseId: "ex_restricted_for_test" });
    const plain = draft({ recipientPersonId: alice, title: "About nothing restricted" });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [restricted, plain]));
    const named = (await loadInboxPage(db, { organisationId, personId: alice }, [])).notices;
    expect(named.map((n) => n.title)).toEqual(expect.arrayContaining(["About a restricted exercise", "About nothing restricted"]));
    const outsider = (await loadInboxPage(db, { organisationId, personId: alice }, ["ex_restricted_for_test"])).notices;
    expect(outsider.map((n) => n.title)).not.toContain("About a restricted exercise");
    expect(outsider.map((n) => n.title)).toContain("About nothing restricted");
    const all = await unreadCount(db, { organisationId, personId: alice }, []);
    expect(await unreadCount(db, { organisationId, personId: alice }, ["ex_restricted_for_test"])).toBe(all - 1);
  });

  it("carries the escalation and the memo as labels and words only", async () => {
    const [e] = stepEscalatedNotices({ stepId: "s", escalationCount: 1, matter: { label: "REQ-1 · Roof", href: "/approvals", exerciseId: null }, actLabel: "approve", fromOffice: "A", toOffice: "B", whyLabel: "No one was able to act", reason: "away", recipients: [bob], by: null, superiorNote: "Reporting line not set: no immediate superior is named." });
    const [m] = matterNotCarriedMemo({ decisionId: "d", matterLabel: "REQ-1", committeeLabel: "Tender Board", outcomeLabel: "Re-clarification", note: "", recipients: [bob], href: "/committees", exerciseId: null });
    for (const n of [e!, m!]) expect(`${n.title} ${n.body}`).not.toMatch(/RM\s?\d/);
  });
});

describe("an inbox of any size can be read to its end and marked read as a whole (Phase 3c review)", () => {
  it("pages from a cursor without losing or repeating a notice, and counts the real totals", async () => {
    const reader = (await makePerson(organisationId)).id;
    const viewer = { organisationId, personId: reader };
    const drafts = Array.from({ length: 7 }, (_, i) => draft({ recipientPersonId: reader, title: `Notice ${i}` }));
    // Raised a second apart in pairs, two at the very same instant, so that the cursor's tie-break on the id is exercised (a notice is evidence: its time is set when it is written).
    await db.staffNotice.createMany({ data: drafts.map((d, i) => ({ organisationId, ...d, raisedAt: new Date(Date.UTC(2026, 9, 9, 1, 0, Math.floor(i / 2))) })) });
    const seen: string[] = [];
    let before = null as null | { raisedAt: Date; id: string };
    for (let guard = 0; guard < 10; guard++) {
      const page = await loadInboxPage(db, viewer, [], { take: 3, before });
      seen.push(...page.notices.map((n) => n.id));
      if (!page.more) break;
      const last = page.notices[page.notices.length - 1]!;
      before = { raisedAt: last.raisedAt, id: last.id };
      expect(encodeCursor(before)).toContain(last.id);
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(await inboxTotals(db, viewer, [])).toEqual({ total: 7, unread: 7 });
  });

  it("marks every unread notice of the person's own read, beyond what any page showed, and leaves others' and the hidden ones alone", async () => {
    const reader = (await makePerson(organisationId)).id;
    const other = (await makePerson(organisationId)).id;
    const viewer = { organisationId, personId: reader };
    const hiddenEx = `ex_hidden_${randomId()}`;
    const mine = Array.from({ length: 5 }, () => draft({ recipientPersonId: reader }));
    const restricted = draft({ recipientPersonId: reader, exerciseId: hiddenEx });
    const theirs = draft({ recipientPersonId: other });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [...mine, restricted, theirs]));
    expect((await inboxTotals(db, viewer, [hiddenEx])).unread).toBe(5);

    const now = new Date();
    const upTo = new Date(now.getTime() + 1000);
    expect(await db.$transaction((tx) => markAllRead(tx, viewer, [hiddenEx], now, upTo))).toBe(5);
    expect(await inboxTotals(db, viewer, [hiddenEx])).toEqual({ total: 5, unread: 0 });
    // The restricted notice, which the reader may not see, was not marked read for them; the other person's was not touched.
    expect((await db.staffNotice.findFirstOrThrow({ where: { recipientPersonId: reader, subjectId: restricted.subjectId } })).readAt).toBeNull();
    expect((await db.staffNotice.findFirstOrThrow({ where: { recipientPersonId: other, subjectId: theirs.subjectId } })).readAt).toBeNull();
    // Run again: nothing new to mark.
    expect(await db.$transaction((tx) => markAllRead(tx, viewer, [hiddenEx], now, upTo))).toBe(0);
  });

  it("leaves unread a notice raised after the page was drawn: it has not been seen", async () => {
    const reader = (await makePerson(organisationId)).id;
    const viewer = { organisationId, personId: reader };
    const early = draft({ recipientPersonId: reader });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [early]));
    const drawnAt = new Date();
    await new Promise((r) => setTimeout(r, 20));
    const late = draft({ recipientPersonId: reader });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [late]));
    expect(await db.$transaction((tx) => markAllRead(tx, viewer, [], new Date(), drawnAt))).toBe(1);
    expect((await db.staffNotice.findFirstOrThrow({ where: { recipientPersonId: reader, subjectId: late.subjectId } })).readAt).toBeNull();
  });
});

describe("a reporting line is refused what cannot be true", () => {
  const line = (over: Record<string, unknown>) => ({ organisationId, effectiveFrom: new Date("2026-01-01T00:00:00Z"), ...over });

  it("is never to oneself, and never ends before it begins", async () => {
    const p = (await makePerson(organisationId)).id;
    await expect(db.reportingLine.create({ data: line({ personId: p, superiorPersonId: p }) as never })).rejects.toThrow(/ReportingLine_not_self|constraint/i);
    await expect(db.reportingLine.create({ data: line({ personId: p, superiorPersonId: alice, effectiveTo: new Date("2026-01-01T00:00:00Z") }) as never })).rejects.toThrow(/ReportingLine_period_runs_forwards|constraint/i);
  });

  it("allows one open-ended line per person, and records 'nobody above' as a line with no superior", async () => {
    const p = (await makePerson(organisationId)).id;
    await db.reportingLine.create({ data: line({ personId: p, superiorPersonId: null }) as never });
    await expect(db.reportingLine.create({ data: line({ personId: p, superiorPersonId: alice }) as never })).rejects.toThrow(/ReportingLine_one_open_per_person|unique/i);
  });
});

describe("the memo's state on a decision", () => {
  it("is held only by a matter that was not carried, and only one of the closed states", async () => {
    const committee = await db.committee.create({ data: { organisationId, code: `MEMO_${randomId()}`, nameEn: "Memo committee", mandate: "Tests.", governingSource: "None." } });
    const meeting = await db.meeting.create({ data: { committeeId: committee.id, reference: `MEMO/${randomId()}`, meetingDate: new Date("2026-10-05T00:00:00Z") } });
    const pending = await db.committeeDecision.create({ data: { meetingId: meeting.id, domain: "requisition", subject: "A matter" } });
    await expect(db.committeeDecision.update({ where: { id: pending.id }, data: { memoState: "ISSUED" } })).rejects.toThrow(/memo_only_when_not_carried|constraint/i);
    const notCarried = await db.committeeDecision.create({ data: { meetingId: meeting.id, domain: "requisition", subject: "Another matter", outcome: "NOT_CARRIED" } });
    await expect(db.committeeDecision.update({ where: { id: notCarried.id }, data: { memoState: "SENT_BY_EMAIL" } })).rejects.toThrow(/memo_state_known|constraint/i);
    await db.committeeDecision.update({ where: { id: notCarried.id }, data: { memoState: "NO_RULE" } });
    expect((await db.committeeDecision.findUniqueOrThrow({ where: { id: notCarried.id } })).memoState).toBe("NO_RULE");
  });
});

describe("opening a notice marks it read, as the reader's own act (AC-47)", () => {
  const readAt = async (recipient: string, subjectId: string) => (await db.staffNotice.findFirstOrThrow({ where: { recipientPersonId: recipient, subjectId } })).readAt;
  const idOf = async (recipient: string, subjectId: string) => (await db.staffNotice.findFirstOrThrow({ where: { recipientPersonId: recipient, subjectId } })).id;
  const viewer = (personId: string) => ({ organisationId, personId });
  const now = new Date("2026-10-19T02:00:00Z");

  it("marks the one notice read and returns where it points; another reader opening it marks and learns nothing", async () => {
    const d = draft({ recipientPersonId: alice, href: "/approvals/open-me" });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [d]));
    const id = await idOf(alice, d.subjectId);
    expect(await openNotice(db, viewer(mallory), [], id, now)).toBeNull();
    expect(await readAt(alice, d.subjectId)).toBeNull();
    expect(await openNotice(db, viewer(alice), [], id, now)).toEqual({ href: "/approvals/open-me" });
    expect(await readAt(alice, d.subjectId)).toEqual(now);
  });

  it("does not mark a back-dated signature to confirm read by opening it; recording the confirmation does, and only the confirmer's", async () => {
    const attributionId = `attr_${randomId()}`;
    const d = draft({ recipientPersonId: alice, kind: "BACKDATE_TO_CONFIRM", subjectEntity: "ActAttribution", subjectId: attributionId, href: `/inbox/${attributionId}` });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [d]));
    const id = await idOf(alice, attributionId);
    expect(await openNotice(db, viewer(alice), [], id, now)).toEqual({ href: `/inbox/${attributionId}` });
    expect(await readAt(alice, attributionId)).toBeNull();
    expect(await markBackdateNoticeRead(db, viewer(mallory), attributionId, now)).toBe(0);
    expect(await readAt(alice, attributionId)).toBeNull();
    expect(await markBackdateNoticeRead(db, viewer(alice), attributionId, now)).toBe(1);
    expect(await readAt(alice, attributionId)).toEqual(now);
  });

  it("leaves a notice of a restricted exercise unopened for a reader it is hidden from", async () => {
    const d = draft({ recipientPersonId: alice, exerciseId: "ex_hidden_ac47", href: "/approvals/hidden" });
    await db.$transaction((tx) => writeNotices(tx, organisationId, null, [d]));
    const id = await idOf(alice, d.subjectId);
    expect(await openNotice(db, viewer(alice), ["ex_hidden_ac47"], id, now)).toBeNull();
    expect(await readAt(alice, d.subjectId)).toBeNull();
  });
});
