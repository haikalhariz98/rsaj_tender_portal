import { describe, expect, it } from "vitest";

import {
  ACTION_WORDS,
  contractorActorWords,
  enumValueWords,
  fieldFaultText,
  FIELD_WORDS,
  IMPACT_WORDS,
  itemRefText,
  moveFaultText,
  NOTICE_TITLE_WORDS,
  PORTAL_ACTION_WORDS,
  PORTAL_EMPTY_WORDS,
  PORTAL_YOU_WORDS,
  portalGroupWords,
  portalMoveFaultText,
  removeFileWords,
  PRIORITY_WORDS,
  RESULT_WORDS,
  SEVERITY_WORDS,
  STATUS_WORDS,
  TEAM_ROLE_WORDS,
  teamFaultText,
  TYPE_SHORT,
  TYPE_WORDS,
  VIEW_EMPTY_WORDS,
  VIEW_WORDS,
  viewWords,
  whoCanWords,
  type WhoNames,
} from "./labels";
import type { TeamFault } from "./team";
import { WORK_ITEM_TYPES, type FieldFault, type MoveFault } from "./types";

/** Work items' words: every value has words, none is a code (AGENTS.md rule 5), and every refusal is one sentence that names who can. */

const CODE = /\b[A-Z]{2,}_[A-Z_]+\b|\b(TO_DO|URGENT|NORMAL|RFI_|[a-z]+[A-Z][a-zA-Z]*)\b/;
const who: WhoNames = { raiser: "Hafiz", assignee: "Aisyah", lead: { roleLabel: "S.O.", names: ["Nurul"] } };

describe("every enum value has words, and none is its key", () => {
  it.each([
    ["type", TYPE_WORDS, [...WORK_ITEM_TYPES]],
    ["status", STATUS_WORDS, ["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]],
    ["priority", PRIORITY_WORDS, ["LOW", "NORMAL", "HIGH", "URGENT"]],
    ["impact", IMPACT_WORDS, ["NONE", "COST", "TIME", "COST_AND_TIME"]],
    ["result", RESULT_WORDS, ["NOT_YET", "PASSED", "FAILED"]],
    ["severity", SEVERITY_WORDS, ["NEAR_MISS", "FIRST_AID", "MEDICAL_TREATMENT", "LOST_TIME", "DANGEROUS_OCCURRENCE"]],
    ["action", ACTION_WORDS, ["START", "SEND_FOR_REVIEW", "MARK_DONE", "SEND_BACK", "CANCEL", "REOPEN"]],
    ["view", VIEW_WORDS, ["open", "mine", "late", "unassigned", "ncr", "done"]],
    ["empty view", VIEW_EMPTY_WORDS, ["open", "mine", "late", "unassigned", "contractor", "ncr", "done"]],
    ["notice", NOTICE_TITLE_WORDS, ["WORK_ITEM_ASSIGNED", "WORK_ITEM_TO_CHECK", "WORK_ITEM_RETURNED", "WORK_ITEM_COMMENT", "WORK_ITEM_FROM_CONTRACTOR"]],
    ["team role", TEAM_ROLE_WORDS, ["PROJECT_MANAGER", "SITE_ENGINEER", "CONTRACT_ADMINISTRATOR", "CONSULTANT"]],
    ["portal action", PORTAL_ACTION_WORDS, ["REPLY", "SEND_FOR_CHECKING", "MARK_AS_FIXED", "ACCEPT_ANSWER", "ASK_AGAIN", "OPEN"]],
  ] as const)("%s", (_, map, keys) => {
    expect(Object.keys(map).sort()).toEqual([...keys].sort());
    for (const [k, v] of Object.entries(map)) {
      // "RFI" is both the key and the word the trade uses; every other word differs from its key.
      if (k !== "RFI") expect(v.en, k).not.toBe(k);
      expect(v.en, k).not.toMatch(CODE);
      // The word budget for chips, columns and statuses (0008 §13): 1–3 words.
      if (_ !== "notice") expect(v.en.split(" ").length, k).toBeLessThanOrEqual(3);
    }
  });

  it("the short type words follow 0008 (§4.4, §5.2)", () => {
    expect(WORK_ITEM_TYPES.map((t) => itemRefText(t, 1))).toEqual(["RFI 1", "SI 1", "Insp 1", "Incident 1", "Act 1", "Defect 1", "Task 1"]);
    expect(Object.keys(TYPE_SHORT)).toEqual([...WORK_ITEM_TYPES]);
  });

  it("a stored enum value reads in words; a column with no enum, or an unknown value, gives null", () => {
    expect(enumValueWords("status", "IN_REVIEW")).toBe("In review");
    expect(enumValueWords("inspectionResult", "FAILED")).toBe("Failed");
    expect(enumValueWords("title", "TO_DO")).toBeNull();
    expect(enumValueWords("status", "toString")).toBeNull();
  });
});

describe("who can", () => {
  it("names the people of each action, in one sentence", () => {
    expect(whoCanWords("MARK_DONE", who).en).toBe("Hafiz, who raised it, or the S.O. (Nurul) can mark this done.");
    expect(whoCanWords("SEND_FOR_REVIEW", who).en).toBe("Only Aisyah, the assignee, can send this for review.");
    expect(whoCanWords("START", who).en).toBe("Aisyah, the assignee, Hafiz, who raised it, or the S.O. (Nurul) can start this.");
    expect(whoCanWords("EDIT", { ...who, lead: null }).en).toBe("Aisyah, the assignee, or Hafiz, who raised it, can edit this.");
    expect(whoCanWords("REOPEN", { ...who, lead: null }).en).toBe("Only Hafiz, who raised it, can reopen this.");
    expect(whoCanWords("CANCEL", { ...who, lead: { roleLabel: "Superintending Officer", names: ["Nurul", "Faiz"] } }).en).toBe("Hafiz, who raised it, or the Superintending Officer (Nurul, Faiz) can cancel this.");
    expect(whoCanWords("SEND_FOR_REVIEW", { ...who, assignee: null }).en).toBe("Nobody can send this for review now.");
    // The raiser who holds the item is named once.
    expect(whoCanWords("START", { ...who, assignee: "Hafiz" }).en).toBe("Hafiz, who raised it, or the S.O. (Nurul) can start this.");
    expect(whoCanWords("EDIT", { ...who, assignee: "Hafiz", lead: null }).en).toBe("Only Hafiz, who raised it, can edit this.");
    // An office with nobody in it today is no lead.
    expect(whoCanWords("MARK_DONE", { ...who, lead: { roleLabel: "S.O.", names: [] } }).en).toBe("Only Hafiz, who raised it, can mark this done.");
  });
});

describe("every refusal is worded, with no code", () => {
  const moves: MoveFault[] = [
    { code: "CONTRACT_READ_ONLY" },
    { code: "NOT_A_MOVE", from: "IN_PROGRESS", to: "TO_DO" },
    { code: "MOVED_ALREADY", by: "Aisyah", at: "2026-11-05T02:00:00.000Z" },
    { code: "MOVED_ALREADY", by: null, at: "" },
    { code: "ONLY_ASSIGNEE" },
    { code: "ONLY_RAISER_OR_LEAD" },
    { code: "ONLY_ASSIGNEE_RAISER_OR_LEAD" },
    { code: "TOO_LONG", field: "comment", max: 10_000 },
    { code: "TOO_LONG", field: "cancelReason", max: 10_000 },
    { code: "ANSWER_NEEDED" },
    { code: "RESULT_NOT_PASSED" },
    { code: "REASON_NEEDED" },
    { code: "COMMENT_NEEDED" },
  ];
  const fields: FieldFault[] = [
    { code: "TITLE_NEEDED" },
    { code: "TOO_LONG", field: "title", max: 200 },
    { code: "TOO_LONG", field: "description", max: 10_000 },
    { code: "DUE_NEEDED" },
    { code: "SEVERITY_NEEDED" },
    { code: "HAPPENED_AT_NEEDED" },
    { code: "NEEDS_TIME_ZONE" },
    { code: "COMMENT_EMPTY" },
    { code: "HAPPENED_IN_FUTURE" },
    { code: "NOT_THIS_TYPE", field: "answer" },
    { code: "NOT_EDITABLE", whoCan: { en: "Only Hafiz, who raised it, can edit this." } },
    { code: "CLOSED_ITEM" },
    { code: "ASSIGNEE_NOT_ELIGIBLE" },
    { code: "OTHER_CONTRACT" },
  ];

  it("move faults", () => {
    for (const f of moves) {
      const t = moveFaultText(f, "MARK_DONE", who);
      expect(t, f.code).not.toMatch(CODE);
      expect(t, f.code).toMatch(/^[A-Z].*\.$/);
    }
    expect(moveFaultText({ code: "NOT_A_MOVE", from: "IN_PROGRESS", to: "TO_DO" }, null, who)).toBe("This can't go from In progress to To do.");
    expect(moveFaultText({ code: "MOVED_ALREADY", by: "Aisyah", at: "" }, null, who)).toBe("Aisyah changed this a moment ago.");
    expect(moveFaultText({ code: "ONLY_RAISER_OR_LEAD" }, "MARK_DONE", who)).toBe("Hafiz, who raised it, or the S.O. (Nurul) can mark this done.");
    expect(moveFaultText({ code: "CONTRACT_READ_ONLY" }, null, who)).toBe("Closed. Read only.");
  });

  it("field faults", () => {
    for (const f of fields) {
      const t = fieldFaultText(f);
      expect(t, f.code).not.toMatch(CODE);
      expect(t, f.code).toMatch(/^[A-Z].*\.$/);
    }
    expect(fieldFaultText({ code: "TOO_LONG", field: "description", max: 10_000 })).toBe("Description is over 10,000 characters.");
    expect(fieldFaultText({ code: "NOT_THIS_TYPE", field: "inspectionResult" })).toBe("This type has no result.");
  });
});

describe("3b words", () => {
  it("every new refusal is one sentence with no code", () => {
    const fields: FieldFault[] = [
      { code: "NOT_SHARED" },
      { code: "SHARE_IS_ONE_WAY" },
      { code: "CONTRACTOR_MAY_NOT_EDIT", field: "dueOn" },
      { code: "NOT_CONTRACTOR_TYPE" },
      { code: "FILE_ON_SHARED_ITEM" },
      { code: "REASON_NEEDED" },
    ];
    for (const f of fields) {
      const t = fieldFaultText(f);
      expect(t, f.code).not.toMatch(CODE);
      expect(t, f.code).toMatch(/^[A-Z].*\.$/);
    }
    const t = moveFaultText({ code: "NOT_FOR_CONTRACTOR" }, "CANCEL", who);
    expect(t).not.toMatch(CODE);
    expect(t).toBe("Only the organisation can do this.");
  });

  it("a closed item refuses the contractor in words that name no one and say what to do (WSEC-5); the staff words say to reopen it", () => {
    expect(portalMoveFaultText({ code: "ITEM_CLOSED" })).toBe("This is closed. If something is still open, raise a new item.");
    expect(moveFaultText({ code: "ITEM_CLOSED" }, null, who)).toBe("Reopen it first.");
  });

  it("the contractor is the company, by the awardee's name (B-4)", () => {
    expect(contractorActorWords("Binaan Jaya Sdn Bhd").en).toBe("Binaan Jaya Sdn Bhd");
    expect(viewWords("contractor", "Binaan Jaya Sdn Bhd").en).toBe("Waiting on Binaan Jaya Sdn Bhd");
    expect(viewWords("late", "Binaan Jaya Sdn Bhd")).toBe(VIEW_WORDS.late);
  });

  it("the portal's groups name the organisation; no code", () => {
    expect((["WAITING_FOR_YOU", "WITH_ORG", "CLOSED"] as const).map((g) => portalGroupWords(g, "JKR").en)).toEqual(["Waiting for you", "With JKR", "Closed"]);
    for (const x of [PORTAL_EMPTY_WORDS, PORTAL_YOU_WORDS]) expect(x.en).not.toMatch(CODE);
  });
});

describe("3b step 3: the team's and the removed file's words", () => {
  const lead = { roleLabel: "Project manager", names: ["Aisyah"] };
  const changers = [lead];
  const FAULTS: TeamFault[] = [{ code: "NOT_LEAD" }, { code: "MANAGER_NAMED" }, { code: "ALREADY_IN_ROLE" }, { code: "PERSON_NOT_ELIGIBLE" }, { code: "NOT_ON_TEAM" }, { code: "REASON_NEEDED" }];

  it("every team fault has one sentence, and none shows a code", () => {
    for (const f of FAULTS) {
      const t = teamFaultText(f, changers);
      expect(t, f.code).toMatch(/^[A-Z].*\.$/);
      expect(t, f.code).not.toMatch(/[A-Z]_[A-Z]|PROJECT_MANAGER/);
    }
  });

  it("NOT_LEAD names the Project manager and the S.O. who may change the team; with neither it says what to set (WSEC-2)", () => {
    expect(teamFaultText({ code: "NOT_LEAD" }, changers)).toBe("Only the Project manager (Aisyah) can change the team.");
    expect(teamFaultText({ code: "NOT_LEAD" }, [lead, { roleLabel: "S.O.", names: ["Nurul", "Hafiz"] }])).toBe("Only the Project manager (Aisyah) or the S.O. (Nurul, Hafiz) can change the team.");
    expect(teamFaultText({ code: "NOT_LEAD" }, [])).toBe("Nobody can change the team yet. Set the S.O. for this contract, or the organisation's time zone.");
  });

  it("who may remove a file names the person who attached it and the lead", () => {
    expect(removeFileWords("Hafiz", lead).en).toBe("Only Hafiz, who attached it or the Project manager (Aisyah) can remove this file.");
    expect(removeFileWords(null, null).en).toBe("Nobody can remove this file now.");
  });

  it("the new audit columns have words", () => {
    expect(FIELD_WORDS.sharedAt.en).toBe("Shared");
    expect(FIELD_WORDS.assignedToContractor.en).toBe("Assigned to the contractor");
  });
});
