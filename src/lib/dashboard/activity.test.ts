import { describe, expect, it } from "vitest";

import { ACTIVITY_ENTITIES, activityFeed, activityLine, type ActivityEntry, type ActivityOwner } from "./activity";

let n = 0;
const entry = (over: Partial<ActivityEntry> & Pick<ActivityEntry, "entity">): ActivityEntry => ({
  id: `e${++n}`,
  entityId: "x1",
  entityLabel: "REQ/1 · Pumps",
  action: "UPDATE",
  changes: [],
  reason: "",
  at: new Date("2026-09-10T02:00:00Z"),
  ...over,
});
const to = (from: string | null, after: string) => [{ field: "status", before: from, after }];
const req = (from: string | null, after: string, over: Partial<ActivityEntry> = {}) =>
  entry({ entity: "Requisition", entityId: "r1", changes: to(from, after), ...over });
const line = (e: ActivityEntry, owners: Record<string, ActivityOwner> = {}) => activityLine(e, owners, "Asia/Kuala_Lumpur");

describe("what the feed will not report", () => {
  const SECRET = "7919";
  const people = ["Aisyah Rahman", "Chen Wei Ling"];

  it("never reads a vote, a recusal or attendance, whatever they carry", () => {
    for (const entity of ["Vote", "DecisionRecusal", "MeetingAttendance"]) {
      for (const action of ["CREATE", "UPDATE"] as const) {
        const e = entry({
          entity,
          action,
          entityLabel: "Aisyah Rahman voted Setuju",
          changes: [
            { field: "choice", before: null, after: "SETUJU" },
            { field: "person", before: null, after: "Aisyah Rahman" },
          ],
        });
        expect(line(e)).toBeNull();
        expect(activityFeed([e], {}, null)).toEqual([]);
      }
    }
  });

  it("keeps votes, recusals, attendance and configuration out of the entities it reads", () => {
    for (const entity of ["Vote", "DecisionRecusal", "MeetingAttendance", "AuthorityMatrix", "Committee", "Organisation"]) {
      expect(ACTIVITY_ENTITIES as readonly string[]).not.toContain(entity);
    }
  });

  it("states an outcome without the counts, the rule or the people behind it", () => {
    const e = entry({
      entity: "CommitteeDecision",
      entityLabel: "Award of the reservoir rehabilitation",
      changes: [
        { field: "outcome", before: "PENDING", after: "CARRIED" },
        { field: "presentVoters", before: null, after: SECRET },
        { field: "recusedCount", before: null, after: "2" },
        { field: "votingRule", before: null, after: "SIMPLE_MAJORITY" },
        { field: "tabledBy", before: null, after: people[0] },
      ],
    });
    const l = line(e)!;
    expect(l.headline).toBe("Award of the reservoir rehabilitation: carried");
    const everything = JSON.stringify(l);
    expect(everything).not.toContain(SECRET);
    expect(everything).not.toMatch(/recus|voter|majority|SIMPLE/i);
    for (const p of people) expect(everything).not.toContain(p);
  });

  it("names the office of a decided step, never the person who recorded it", () => {
    const e = entry({
      entity: "ApprovalStep",
      entityLabel: "REQ/1 · Chief Executive",
      changes: [
        { field: "decision", before: "PENDING", after: "DONE" },
        { field: "decidedBy", before: null, after: people[0] },
      ],
    });
    const l = line(e)!;
    expect(l.headline).toBe("REQ/1: Chief Executive decided");
    expect(JSON.stringify(l)).not.toContain(people[0]);
  });

  it("ignores an edit that changes no status", () => {
    expect(line(req("DRAFT", "DRAFT"))).toBeNull();
    expect(line(entry({ entity: "Requisition", changes: [{ field: "title", before: "A", after: "B" }] }))).toBeNull();
    expect(line(req("APPROVED", "SOURCING"))).toBeNull();
  });
});

describe("requisitions", () => {
  it("reads a raise and a receipt from the finance system", () => {
    expect(line(req(null, "DRAFT", { action: "CREATE" }))!.headline).toBe("REQ/1 raised");
    expect(line(req(null, "DRAFT", { action: "CREATE", reason: "Received by hand from the finance system" }))!.headline).toBe("REQ/1 received from the finance system");
    expect(line(req(null, "DRAFT", { action: "CREATE" }))!.title).toBe("Pumps");
  });

  it.each([
    ["DRAFT", "ENDORSED", "REQ/1 endorsed"],
    ["ENDORSED", "REGISTERED", "REQ/1 registered"],
    ["BUDGET_CHECKED", "OVER_BUDGET", "REQ/1 is over budget"],
    ["ENDORSED", "PENDING_APPROVAL", "REQ/1 sent for approval"],
    ["PENDING_APPROVAL", "APPROVED", "REQ/1 approved"],
    ["PENDING_APPROVAL", "RECALLED", "REQ/1 recalled"],
    ["DRAFT", "CANCELLED", "REQ/1 cancelled"],
    ["APPROVED", "CLOSED", "REQ/1 closed"],
    ["REJECTED", "DRAFT", "REQ/1 sent back to whoever raised it"],
    ["REJECTED", "PENDING_APPROVAL", "REQ/1 returned to an earlier step"],
  ])("%s to %s", (from, after, expected) => {
    expect(line(req(from, after))!.headline).toBe(expected);
  });

  it("carries the reason of a rejection and shortens a long one", () => {
    expect(line(req("PENDING_APPROVAL", "REJECTED", { reason: "Scope unclear." }))).toMatchObject({ headline: "REQ/1 rejected", reason: "Scope unclear." });
    expect(line(req("PENDING_APPROVAL", "REJECTED", { reason: "x".repeat(400) }))!.reason!.length).toBeLessThanOrEqual(120);
  });

  it("puts the line on the organisation's day, not the UTC day", () => {
    // 17:30 UTC on the 10th is 01:30 on the 11th in Kuala Lumpur.
    const e = req("DRAFT", "ENDORSED", { at: new Date("2026-09-10T17:30:00Z") });
    expect(activityLine(e, {}, "Asia/Kuala_Lumpur")!.day).toBe("11 Sep 2026");
    expect(activityLine(e, {}, "UTC")!.day).toBe("10 Sep 2026");
    expect(activityLine(e, {}, null)!.day).toContain("time zone not set");
  });
});

describe("approval steps", () => {
  const step = (changes: ActivityEntry["changes"], label = "REQ/1 · Section Head") =>
    entry({ entity: "ApprovalStep", entityId: "s1", entityLabel: label, changes });
  const owners = { "ApprovalStep:s1": { kind: "requisition", id: "r1", reference: "REQ/1", committee: null } as ActivityOwner };

  it("reads an escalation, a decision and a rejection by office", () => {
    expect(line(step([{ field: "actingOffice", before: "Section Head", after: "Head of Department" }, { field: "escalation", before: null, after: "Holder absent" }]))!.headline).toBe("REQ/1: Section Head step passed to Head of Department");
    expect(line(step([{ field: "decision", before: "PENDING", after: "DONE" }]))!.headline).toBe("REQ/1: Section Head decided");
    expect(line(step([{ field: "decision", before: "PENDING", after: "REJECTED" }]))!.headline).toBe("REQ/1: Section Head rejected");
  });

  it("takes the office from the end of a label that names the matter first", () => {
    expect(line(step([{ field: "decision", before: "PENDING", after: "DONE" }], "AWD/1 · appointment · Chief Executive"))!.headline).toBe("AWD/1: Chief Executive decided");
  });

  it("links through its owner, and is plain text without one", () => {
    expect(line(step([{ field: "decision", before: "PENDING", after: "DONE" }]), owners)!.link).toEqual({ kind: "requisition", id: "r1" });
    expect(line(step([{ field: "decision", before: "PENDING", after: "DONE" }]))!.link).toBeNull();
  });
});

describe("exercises, sittings, matters and awards", () => {
  it("reads an exercise opened, prepared and cancelled", () => {
    const ex = (changes: ActivityEntry["changes"], action: ActivityEntry["action"] = "UPDATE", reason = "") =>
      entry({ entity: "SourcingExercise", entityId: "x1", entityLabel: "SX/1 · Filter works", action, changes, reason });
    expect(line(ex([{ field: "requisition", before: null, after: "REQ/9" }], "CREATE"))!.headline).toBe("Exercise SX/1 opened for REQ/9");
    expect(line(ex(to("DRAFT", "DOCUMENTS_IN_PREPARATION")))!.headline).toBe("Exercise SX/1 moved into preparation");
    expect(line(ex(to("DRAFT", "CANCELLED"), "UPDATE", "Withdrawn."))).toMatchObject({ headline: "Exercise SX/1 cancelled", reason: "Withdrawn." });
  });

  it("reads a sitting scheduled, started, minuted and cancelled, naming the committee", () => {
    const created = entry({
      entity: "Meeting",
      entityId: "m1",
      action: "CREATE",
      entityLabel: "Tender Board sitting",
      changes: [
        { field: "committee", before: null, after: "Tender Board" },
        { field: "meetingDate", before: null, after: "2026-09-24" },
        { field: "reference", before: null, after: "SIT/5" },
      ],
    });
    expect(line(created)!.headline).toBe("Tender Board sitting scheduled for 24 Sep 2026");
    const owners = { "Meeting:m1": { kind: "sitting", id: "m1", reference: "SIT/5", committee: "Tender Board" } as ActivityOwner };
    const sit = (after: string, reason = "") => entry({ entity: "Meeting", entityId: "m1", entityLabel: "SIT/5", changes: to("SCHEDULED", after), reason });
    expect(line(sit("IN_PROGRESS"), owners)!.headline).toBe("Tender Board sitting SIT/5 started");
    expect(line(sit("MINUTED"), owners)!.headline).toBe("Tender Board sitting SIT/5 minuted");
    expect(line(sit("CANCELLED", "No quorum possible."), owners)).toMatchObject({ headline: "Tender Board sitting SIT/5 cancelled", reason: "No quorum possible." });
    // The minutes themselves are never read.
    expect(line(entry({ entity: "Meeting", entityId: "m1", entityLabel: "SIT/5", changes: [{ field: "minutes", before: "", after: "Long minutes" }] }), owners)).toBeNull();
  });

  it("reads a matter tabled and its outcome", () => {
    const owners = { "CommitteeDecision:d1": { kind: "sitting", id: "m1", reference: "SIT/5", committee: "Tender Board" } as ActivityOwner };
    const d = (action: ActivityEntry["action"], changes: ActivityEntry["changes"] = []) => entry({ entity: "CommitteeDecision", entityId: "d1", entityLabel: "Valve keys", action, changes });
    expect(line(d("CREATE"), owners)!.headline).toBe("Valve keys tabled at Tender Board");
    expect(line(d("UPDATE", to("PENDING", "x").map((c) => ({ ...c, field: "outcome", after: "NOT_CARRIED" }))), owners)!.headline).toBe("Valve keys: not carried");
    expect(line(d("UPDATE", [{ field: "outcome", before: "PENDING", after: "DEFERRED" }]), owners)!.headline).toBe("Valve keys: deferred");
    expect(line(d("UPDATE", [{ field: "outcome", before: "PENDING", after: "PENDING" }]), owners)).toBeNull();
  });

  it("reads an award from opening to acceptance and the day work commenced", () => {
    const aw = (action: ActivityEntry["action"], changes: ActivityEntry["changes"]) => entry({ entity: "Award", entityId: "a1", entityLabel: "AWD/1 · Demo Works Sdn Bhd", action, changes });
    expect(line(aw("CREATE", to(null, "DRAFT")))!.headline).toBe("Award AWD/1 opened");
    expect(line(aw("UPDATE", to("DRAFT", "PENDING_APPROVAL")))!.headline).toBe("Award AWD/1 sent for approval");
    expect(line(aw("UPDATE", to("APPROVED", "ISSUED")))!.headline).toBe("Award AWD/1 issued");
    expect(line(aw("UPDATE", to("ISSUED", "ACCEPTED")))!.headline).toBe("Award AWD/1 accepted");
    expect(line(aw("UPDATE", to("DRAFT", "CANCELLED")))!.headline).toBe("Award AWD/1 cancelled");
    expect(line(aw("UPDATE", [{ field: "commencedOn", before: null, after: "2026-09-22" }]))!.headline).toBe("Award AWD/1: work commenced 22 Sep 2026");
    // The awardee is not on the line.
    expect(JSON.stringify(line(aw("CREATE", to(null, "DRAFT"))))).not.toContain("Demo Works");
  });
});

describe("one act is one line", () => {
  const T = new Date("2026-09-10T02:00:00Z");
  const at = (ms: number) => new Date(T.getTime() + ms);
  const owners: Record<string, ActivityOwner> = {
    "ApprovalStep:s1": { kind: "requisition", id: "r1", reference: "REQ/1", committee: null },
    "ApprovalStep:s2": { kind: "exercise", id: "x1", reference: "SX/1", committee: null },
    "ApprovalStep:s3": { kind: "award", id: "a1", reference: "AWD/1", committee: null },
  };
  const step = (id: string, label: string, after: string, ms = 0, reason = "") =>
    entry({ entity: "ApprovalStep", entityId: id, entityLabel: label, changes: [{ field: "decision", before: "PENDING", after }], at: at(ms), reason });
  const feed = (rows: ActivityEntry[]) => activityFeed(rows, owners, "Asia/Kuala_Lumpur").map((l) => l.headline);

  it("a rejection sent back to the originator", () => {
    const rows = [
      step("s1", "REQ/1 · Section Head", "REJECTED", 0, "Scope unclear."),
      req("PENDING_APPROVAL", "REJECTED", { at: at(5), reason: "Scope unclear." }),
      req("REJECTED", "DRAFT", { at: at(10), reason: "Returned to whoever raised it: Scope unclear." }),
    ];
    const lines = activityFeed(rows, owners, null);
    expect(lines.map((l) => l.headline)).toEqual(["REQ/1 rejected at Section Head and sent back to whoever raised it"]);
    expect(lines[0].reason).toBe("Scope unclear.");
  });

  it("a rejection that closes it, and one returned to an earlier step", () => {
    expect(feed([step("s1", "REQ/1 · Section Head", "REJECTED"), req("PENDING_APPROVAL", "REJECTED", { at: at(5) }), req("REJECTED", "CLOSED", { at: at(9) })])).toEqual(["REQ/1 rejected at Section Head and closed"]);
    expect(feed([step("s1", "REQ/1 · Section Head", "REJECTED"), req("PENDING_APPROVAL", "REJECTED", { at: at(5) }), req("REJECTED", "PENDING_APPROVAL", { at: at(9) })])).toEqual(["REQ/1 rejected at Section Head and returned to an earlier step"]);
  });

  it("a rejection awaiting the officer's choice stays rejected", () => {
    expect(feed([step("s1", "REQ/1 · Section Head", "REJECTED"), req("PENDING_APPROVAL", "REJECTED", { at: at(5) })])).toEqual(["REQ/1 rejected at Section Head"]);
  });

  it("a final approval of a requisition and of an award", () => {
    expect(feed([step("s1", "REQ/1 · Chief Executive", "DONE"), req("PENDING_APPROVAL", "APPROVED", { at: at(4) })])).toEqual(["REQ/1 approved at Chief Executive"]);
    expect(
      feed([step("s3", "AWD/1 · Tender Board", "DONE"), entry({ entity: "Award", entityId: "a1", entityLabel: "AWD/1 · Demo", changes: to("PENDING_APPROVAL", "APPROVED"), at: at(3) })]),
    ).toEqual(["Award AWD/1 approved at Tender Board"]);
  });

  it("a refused name", () => {
    const cancel = entry({ entity: "SourcingExercise", entityId: "x1", entityLabel: "SX/1 · Filter works", changes: to("DRAFT", "CANCELLED"), at: at(3) });
    expect(feed([step("s2", "SX/1 · name approval · Head of Department", "REJECTED"), cancel])).toEqual(["Exercise SX/1 cancelled: Head of Department refused the name"]);
  });

  it("a step that is not the last stays its own line, and unrelated acts stay apart", () => {
    expect(feed([step("s1", "REQ/1 · Section Head", "DONE")])).toEqual(["REQ/1: Section Head decided"]);
    // The same owner, but a day apart: two acts.
    const day = 24 * 3600 * 1000;
    expect(feed([step("s1", "REQ/1 · Chief Executive", "DONE", 0), req("PENDING_APPROVAL", "APPROVED", { at: at(day) })])).toEqual(["REQ/1 approved", "REQ/1: Chief Executive decided"]);
    // Different owners at one instant: not folded.
    expect(feed([step("s1", "REQ/1 · Chief Executive", "DONE"), entry({ entity: "Award", entityId: "a1", entityLabel: "AWD/1 · Demo", changes: to("PENDING_APPROVAL", "APPROVED"), at: at(1) })])).toHaveLength(2);
  });
});

describe("the feed as a whole", () => {
  it("is newest first and keeps at most eight", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      entry({ entity: "Requisition", entityId: `r${i}`, entityLabel: `REQ/${i} · T`, changes: to("DRAFT", "ENDORSED"), at: new Date(Date.UTC(2026, 8, i + 1)) }),
    );
    const lines = activityFeed(rows, {}, "UTC");
    expect(lines).toHaveLength(8);
    expect(lines[0].headline).toBe("REQ/11 endorsed");
    expect(lines.map((l) => l.at.getTime())).toEqual([...lines.map((l) => l.at.getTime())].sort((a, b) => b - a));
  });

  it("is empty for an empty trail", () => {
    expect(activityFeed([], {}, null)).toEqual([]);
  });
});
