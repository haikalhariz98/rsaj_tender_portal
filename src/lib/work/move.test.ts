import { describe, expect, it } from "vitest";

import type { WhoNames } from "./labels";
import { actionOf, blockingFaults, contractorActions, moveFaults, primaryActions, TARGET, type MoveContext } from "./move";
import { CONTRACTOR, person } from "./party";
import type { MoveFault, WorkActor, WorkItemFacts, WorkStatus } from "./types";

/**
 * The move table (plan §3.3; WS-24), written out by hand: every from × to × actor on an item someone else holds, then the rows the item's holder changes
 * (held by its raiser, or by nobody), then what a move also needs. The expectations are literals, never re-derived from the rule.
 */

const R = "raiser";
const A = "assignee";
const L = "lead";
const O = "other";
const actor = (personId: string, mayReadContract = true): WorkActor => ({ side: "STAFF", personId, leadIds: [L], mayReadContract });
const ACTORS = [actor(R), actor(A), actor(L), actor(O)];

const task = (status: WorkStatus, assignee: string | null = A): WorkItemFacts => ({ id: "w1", type: "TASK", number: 1, status, raisedBy: person(R), assignee: assignee === null ? null : person(assignee), sharedAt: null, dueOn: null, answer: "", inspectionResult: null });
/// The inputs a dialog collects, given, so the table below shows who alone.
const FULL: MoveContext = { contractOpen: true, reason: "Duplicate", comment: "Redo the drawing" };

type Cell = "ok" | "RL" | "A" | "X";
const cell = (faults: MoveFault[]): Cell => {
  if (faults.length === 0) return "ok";
  if (faults.length !== 1) throw new Error(`more than one fault: ${JSON.stringify(faults)}`);
  return ({ ONLY_RAISER_OR_LEAD: "RL", ONLY_ASSIGNEE_RAISER_OR_LEAD: "RL", ONLY_ASSIGNEE: "A", NOT_A_MOVE: "X" } as Record<string, Cell>)[faults[0].code] ?? (faults[0].code as Cell);
};
const row = (item: WorkItemFacts, to: WorkStatus) => ACTORS.map((a) => cell(moveFaults(item, a, to, item.status, FULL)));

const S: WorkStatus[] = ["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];

// [from, to, raiser, assignee, lead, other] on an item assigned to someone other than its raiser.
const HELD_BY_ANOTHER: [WorkStatus, WorkStatus, Cell, Cell, Cell, Cell][] = [
  ["TO_DO", "TO_DO", "X", "X", "X", "X"],
  ["TO_DO", "IN_PROGRESS", "ok", "ok", "ok", "RL"],
  ["TO_DO", "IN_REVIEW", "A", "ok", "A", "A"],
  ["TO_DO", "DONE", "X", "X", "X", "X"],
  ["TO_DO", "CANCELLED", "ok", "RL", "ok", "RL"],
  ["IN_PROGRESS", "TO_DO", "X", "X", "X", "X"],
  ["IN_PROGRESS", "IN_PROGRESS", "X", "X", "X", "X"],
  ["IN_PROGRESS", "IN_REVIEW", "A", "ok", "A", "A"],
  ["IN_PROGRESS", "DONE", "X", "X", "X", "X"],
  ["IN_PROGRESS", "CANCELLED", "ok", "RL", "ok", "RL"],
  ["IN_REVIEW", "TO_DO", "X", "X", "X", "X"],
  ["IN_REVIEW", "IN_PROGRESS", "ok", "RL", "ok", "RL"],
  ["IN_REVIEW", "IN_REVIEW", "X", "X", "X", "X"],
  ["IN_REVIEW", "DONE", "ok", "RL", "ok", "RL"],
  ["IN_REVIEW", "CANCELLED", "ok", "RL", "ok", "RL"],
  ["DONE", "TO_DO", "ok", "RL", "ok", "RL"],
  ["DONE", "IN_PROGRESS", "X", "X", "X", "X"],
  ["DONE", "IN_REVIEW", "X", "X", "X", "X"],
  ["DONE", "DONE", "X", "X", "X", "X"],
  ["DONE", "CANCELLED", "X", "X", "X", "X"],
  ["CANCELLED", "TO_DO", "ok", "RL", "ok", "RL"],
  ["CANCELLED", "IN_PROGRESS", "X", "X", "X", "X"],
  ["CANCELLED", "IN_REVIEW", "X", "X", "X", "X"],
  ["CANCELLED", "DONE", "X", "X", "X", "X"],
  ["CANCELLED", "CANCELLED", "X", "X", "X", "X"],
];

// The rows that change when nobody else holds the item: In review has nobody to send it, and the raiser or lead may close it straight away (the shortcut).
// "assignee" here is a fourth person who does not hold the item.
const SELF_HELD_ROWS: [WorkStatus, WorkStatus, Cell, Cell, Cell, Cell][] = [
  ["TO_DO", "IN_PROGRESS", "ok", "RL", "ok", "RL"],
  ["TO_DO", "IN_REVIEW", "X", "X", "X", "X"],
  ["TO_DO", "DONE", "ok", "RL", "ok", "RL"],
  ["IN_PROGRESS", "IN_REVIEW", "X", "X", "X", "X"],
  ["IN_PROGRESS", "DONE", "ok", "RL", "ok", "RL"],
  ["IN_REVIEW", "DONE", "ok", "RL", "ok", "RL"],
  ["IN_REVIEW", "IN_PROGRESS", "ok", "RL", "ok", "RL"],
];

describe("the move table: an item someone other than its raiser holds", () => {
  it("covers every from × to", () => {
    expect(HELD_BY_ANOTHER.map(([f, t]) => `${f}>${t}`).sort()).toEqual(S.flatMap((f) => S.map((t) => `${f}>${t}`)).sort());
  });
  it.each(HELD_BY_ANOTHER)("%s → %s: raiser %s, assignee %s, lead %s, other %s", (from, to, ...want) => {
    expect(row(task(from), to)).toEqual(want);
  });
});

describe.each([
  ["held by its raiser", R],
  ["unassigned", null],
])("the move table: an item %s", (_, holder) => {
  it.each(SELF_HELD_ROWS)("%s → %s: raiser %s, someone else %s, lead %s, other %s", (from, to, ...want) => {
    expect(row(task(from, holder), to)).toEqual(want);
  });
});

describe("who counts", () => {
  it("someone who may not read the contract's stages is nobody on the item, even its raiser or assignee", () => {
    expect(moveFaults(task("TO_DO"), actor(A, false), "IN_PROGRESS", "TO_DO", FULL)).toEqual([{ code: "ONLY_ASSIGNEE_RAISER_OR_LEAD" }]);
    expect(moveFaults(task("IN_REVIEW"), actor(R, false), "DONE", "IN_REVIEW", FULL)).toEqual([{ code: "ONLY_RAISER_OR_LEAD" }]);
  });

  it("a lead is whoever is in the actor's lead set; with none, only the raiser closes (W-4)", () => {
    expect(moveFaults(task("IN_REVIEW"), { side: "STAFF", personId: L, leadIds: [], mayReadContract: true }, "DONE", "IN_REVIEW", FULL)).toEqual([{ code: "ONLY_RAISER_OR_LEAD" }]);
    expect(moveFaults(task("IN_REVIEW"), { side: "STAFF", personId: O, leadIds: [L, O], mayReadContract: true }, "DONE", "IN_REVIEW", FULL)).toEqual([]);
  });

  it("an assignee who is also the lead may close after review, but not skip it", () => {
    const leadHolds = task("IN_PROGRESS", L);
    expect(moveFaults(leadHolds, actor(L), "DONE", "IN_PROGRESS", FULL)).toEqual([{ code: "NOT_A_MOVE", from: "IN_PROGRESS", to: "DONE" }]);
    expect(moveFaults(leadHolds, actor(L), "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([]);
    expect(moveFaults({ ...leadHolds, status: "IN_REVIEW" }, actor(L), "DONE", "IN_REVIEW", FULL)).toEqual([]);
  });
});

describe("what a move also needs", () => {
  const rfi = (status: WorkStatus, answer: string, assignee: string | null = A): WorkItemFacts => ({ ...task(status, assignee), type: "RFI", answer });
  const insp = (status: WorkStatus, result: WorkItemFacts["inspectionResult"], assignee: string | null = A): WorkItemFacts => ({ ...task(status, assignee), type: "INSPECTION", inspectionResult: result });

  it("an RFI goes to In review or Done only with an answer; blank is no answer", () => {
    expect(moveFaults(rfi("IN_PROGRESS", ""), actor(A), "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([{ code: "ANSWER_NEEDED" }]);
    expect(moveFaults(rfi("IN_PROGRESS", "  \n"), actor(A), "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([{ code: "ANSWER_NEEDED" }]);
    expect(moveFaults(rfi("IN_PROGRESS", "150 c/c governs"), actor(A), "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([]);
    expect(moveFaults(rfi("IN_REVIEW", ""), actor(R), "DONE", "IN_REVIEW", FULL)).toEqual([{ code: "ANSWER_NEEDED" }]);
    expect(moveFaults(rfi("TO_DO", "", null), actor(R), "DONE", "TO_DO", FULL)).toEqual([{ code: "ANSWER_NEEDED" }]);
    // Who and what together: both are said.
    expect(moveFaults(rfi("IN_REVIEW", ""), actor(O), "DONE", "IN_REVIEW", FULL)).toEqual([{ code: "ONLY_RAISER_OR_LEAD" }, { code: "ANSWER_NEEDED" }]);
  });

  it("an RFI's answer is not asked for to start, send back, cancel or reopen", () => {
    expect(moveFaults(rfi("TO_DO", ""), actor(A), "IN_PROGRESS", "TO_DO", FULL)).toEqual([]);
    expect(moveFaults(rfi("IN_REVIEW", ""), actor(R), "IN_PROGRESS", "IN_REVIEW", FULL)).toEqual([]);
    expect(moveFaults(rfi("TO_DO", ""), actor(R), "CANCELLED", "TO_DO", FULL)).toEqual([]);
    expect(moveFaults(rfi("DONE", ""), actor(R), "TO_DO", "DONE", FULL)).toEqual([]);
  });

  it("an inspection goes to In review or Done only when Passed: Not yet and Failed are refused (OQ-8)", () => {
    for (const result of ["NOT_YET", "FAILED", null] as const) {
      expect(moveFaults(insp("IN_PROGRESS", result), actor(A), "IN_REVIEW", "IN_PROGRESS", FULL), String(result)).toEqual([{ code: "RESULT_NOT_PASSED" }]);
      expect(moveFaults(insp("IN_REVIEW", result), actor(R), "DONE", "IN_REVIEW", FULL), String(result)).toEqual([{ code: "RESULT_NOT_PASSED" }]);
    }
    expect(moveFaults(insp("IN_PROGRESS", "PASSED"), actor(A), "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([]);
    expect(moveFaults(insp("TO_DO", "PASSED", R), actor(R), "DONE", "TO_DO", FULL)).toEqual([]);
  });

  it("cancel needs a reason; send back needs a comment; blank is neither", () => {
    expect(moveFaults(task("TO_DO"), actor(R), "CANCELLED", "TO_DO", { contractOpen: true })).toEqual([{ code: "REASON_NEEDED" }]);
    expect(moveFaults(task("TO_DO"), actor(R), "CANCELLED", "TO_DO", { contractOpen: true, reason: "   " })).toEqual([{ code: "REASON_NEEDED" }]);
    expect(moveFaults(task("IN_REVIEW"), actor(L), "IN_PROGRESS", "IN_REVIEW", { contractOpen: true })).toEqual([{ code: "COMMENT_NEEDED" }]);
    expect(moveFaults(task("IN_REVIEW"), actor(L), "IN_PROGRESS", "IN_REVIEW", { contractOpen: true, comment: " " })).toEqual([{ code: "COMMENT_NEEDED" }]);
    expect(moveFaults(task("IN_PROGRESS"), actor(O), "CANCELLED", "IN_PROGRESS", { contractOpen: true })).toEqual([{ code: "ONLY_RAISER_OR_LEAD" }, { code: "REASON_NEEDED" }]);
  });
  it("a reason or a comment over the text bound is refused, counted in code points", () => {
    const long = "a".repeat(10_001);
    expect(moveFaults(task("TO_DO"), actor(R), "CANCELLED", "TO_DO", { contractOpen: true, reason: long })).toEqual([{ code: "TOO_LONG", field: "cancelReason", max: 10_000 }]);
    expect(moveFaults(task("IN_REVIEW"), actor(L), "IN_PROGRESS", "IN_REVIEW", { contractOpen: true, comment: long })).toEqual([{ code: "TOO_LONG", field: "comment", max: 10_000 }]);
    expect(moveFaults(task("TO_DO"), actor(R), "CANCELLED", "TO_DO", { contractOpen: true, reason: "😀".repeat(10_000) })).toEqual([]);
  });
});

describe("the contract and the status the reader saw are asked first", () => {
  it("a closed contract refuses every move alone, before anything else", () => {
    for (const from of S) for (const to of S) for (const a of ACTORS) expect(moveFaults(task(from), a, to, "TO_DO", { contractOpen: false })).toEqual([{ code: "CONTRACT_READ_ONLY" }]);
  });

  it("a row no longer at the status the reader saw is MOVED_ALREADY, naming who moved it, before the table", () => {
    expect(moveFaults(task("IN_REVIEW"), actor(R), "DONE", "IN_PROGRESS", { ...FULL, lastMove: { by: "Aisyah", at: "2026-10-29T03:00:00.000Z" } })).toEqual([
      { code: "MOVED_ALREADY", by: "Aisyah", at: "2026-10-29T03:00:00.000Z" },
    ]);
    expect(moveFaults(task("DONE"), actor(O), "IN_PROGRESS", "TO_DO", FULL)).toEqual([{ code: "MOVED_ALREADY", by: null, at: "" }]);
  });
});

describe("actionOf and TARGET agree", () => {
  it("every action's target is the move it names, from some status", () => {
    for (const [action, to] of Object.entries(TARGET)) expect(S.some((from) => actionOf(from, to) === action), action).toBe(true);
  });
  it("names the moves", () => {
    expect(actionOf("TO_DO", "IN_PROGRESS")).toBe("START");
    expect(actionOf("IN_REVIEW", "IN_PROGRESS")).toBe("SEND_BACK");
    expect(actionOf("CANCELLED", "TO_DO")).toBe("REOPEN");
    expect(actionOf("IN_PROGRESS", "TO_DO")).toBeNull();
  });
});

describe("primaryActions (0008 §5.4)", () => {
  const who: WhoNames = { raiser: "Hafiz", assignee: "Aisyah", lead: { roleLabel: "S.O.", names: ["Nurul"] } };
  const ctx = { contractOpen: true, who };
  const pa = (item: WorkItemFacts, a: string) => primaryActions(item, actor(a), ctx);

  it("assignee, To do: Start; Send for review in the menu; Cancel is the raiser's or lead's (§3.3), so not offered", () => {
    expect(pa(task("TO_DO"), A)).toEqual({ primary: "START", menu: ["SEND_FOR_REVIEW"], disabled: null });
  });
  it("assignee, In progress: Send for review", () => {
    expect(pa(task("IN_PROGRESS"), A)).toEqual({ primary: "SEND_FOR_REVIEW", menu: [], disabled: null });
  });
  it("raiser or lead, In review: Mark done; Send back and Cancel in the menu", () => {
    for (const a of [R, L]) expect(pa(task("IN_REVIEW"), a)).toEqual({ primary: "MARK_DONE", menu: ["SEND_BACK", "CANCEL"], disabled: null });
  });
  it("raiser or lead, Done or Cancelled: no primary; Reopen in the menu", () => {
    for (const s of ["DONE", "CANCELLED"] as const) for (const a of [R, L]) expect(pa(task(s), a)).toEqual({ primary: null, menu: ["REOPEN"], disabled: null });
  });
  it("the assignee on an item In review sees Mark done disabled, naming who can", () => {
    expect(pa(task("IN_REVIEW"), A)).toEqual({ primary: null, menu: [], disabled: { action: "MARK_DONE", whoCan: { en: "Hafiz, who raised it, or the S.O. (Nurul) can mark this done." } } });
  });
  it("someone else: fields only, with the first action disabled and who can", () => {
    expect(pa(task("TO_DO"), O)).toEqual({ primary: null, menu: [], disabled: { action: "START", whoCan: { en: "Aisyah, the assignee, Hafiz, who raised it, or the S.O. (Nurul) can start this." } } });
    expect(pa(task("IN_PROGRESS"), O).disabled?.whoCan.en).toBe("Only Aisyah, the assignee, can send this for review.");
    expect(pa(task("DONE"), O)).toEqual({ primary: null, menu: [], disabled: null });
  });
  it("the raiser on an item someone else holds: Start is theirs too, and Cancel", () => {
    expect(pa(task("TO_DO"), R)).toEqual({ primary: "START", menu: ["CANCEL"], disabled: null });
    expect(pa(task("IN_PROGRESS"), R)).toEqual({ primary: null, menu: ["CANCEL"], disabled: { action: "SEND_FOR_REVIEW", whoCan: { en: "Only Aisyah, the assignee, can send this for review." } } });
  });
  it("the shortcut: the raiser who holds the item marks it done from In progress", () => {
    expect(pa(task("IN_PROGRESS", R), R)).toEqual({ primary: "MARK_DONE", menu: ["CANCEL"], disabled: null });
    expect(pa(task("TO_DO", null), R)).toEqual({ primary: "START", menu: ["MARK_DONE", "CANCEL"], disabled: null });
  });
  it("an RFI with no answer still offers Send for review: the act says what is missing", () => {
    expect(pa({ ...task("IN_PROGRESS"), type: "RFI" }, A).primary).toBe("SEND_FOR_REVIEW");
  });
  it("with no lead, the words name only the raiser", () => {
    expect(primaryActions(task("IN_REVIEW"), actor(A), { contractOpen: true, who: { ...who, lead: null } }).disabled?.whoCan.en).toBe("Only Hafiz, who raised it, can mark this done.");
  });
  it("a closed contract offers nothing and disables nothing (the tab's callout says why)", () => {
    expect(primaryActions(task("IN_REVIEW"), actor(R), { contractOpen: false, who })).toEqual({ primary: null, menu: [], disabled: null });
  });
  it("offers exactly what moveFaults lets through, apart from what a dialog collects", () => {
    for (const s of S)
      for (const holder of [A, R, null])
        for (const a of ACTORS) {
          const item = task(s, holder);
          const p = primaryActions(item, a, ctx);
          const offered = [p.primary, ...p.menu].filter((x) => x !== null);
          for (const action of offered) expect(blockingFaults(moveFaults(item, a, TARGET[action], s, { contractOpen: true })), `${s} ${holder} ${a.personId} ${action}`).toEqual([]);
        }
  });
});

/**
 * 3b B-9: the contractor as a party (the company, never the lead), written out by hand for every from × to on a shared item: as its assignee, as its
 * raiser, and as neither. "NC" is NOT_FOR_CONTRACTOR: Start, Cancel, Reopen and the shortcut are never the contractor's (0008 §4.2).
 */
describe("the move table: the contractor", () => {
  const C: WorkActor = { side: "CONTRACTOR", personId: null, leadIds: [L], mayReadContract: true };
  const SHARED = "2026-11-01T02:00:00.000Z";
  const held = (status: WorkStatus): WorkItemFacts => ({ ...task(status), assignee: CONTRACTOR, sharedAt: SHARED });
  const raised = (status: WorkStatus): WorkItemFacts => ({ ...task(status), type: "SAFETY_INCIDENT", raisedBy: CONTRACTOR, sharedAt: SHARED });
  const neither = (status: WorkStatus): WorkItemFacts => ({ ...task(status), sharedAt: SHARED });
  type CCell = "ok" | "RL" | "A" | "X" | "NC";
  const ccell = (faults: MoveFault[]): CCell => {
    if (faults.length === 0) return "ok";
    if (faults.length !== 1) throw new Error(`more than one fault: ${JSON.stringify(faults)}`);
    return ({ ONLY_RAISER_OR_LEAD: "RL", ONLY_ASSIGNEE: "A", NOT_A_MOVE: "X", NOT_FOR_CONTRACTOR: "NC" } as Record<string, CCell>)[faults[0].code];
  };
  const judge = (item: WorkItemFacts, to: WorkStatus) => ccell(moveFaults(item, C, to, item.status, FULL));

  // [from, to, as assignee, as raiser, as neither]
  const TABLE: [WorkStatus, WorkStatus, CCell, CCell, CCell][] = [
    ["TO_DO", "TO_DO", "X", "X", "X"],
    ["TO_DO", "IN_PROGRESS", "NC", "NC", "NC"],
    ["TO_DO", "IN_REVIEW", "ok", "A", "A"],
    ["TO_DO", "DONE", "NC", "NC", "NC"],
    ["TO_DO", "CANCELLED", "NC", "NC", "NC"],
    ["IN_PROGRESS", "TO_DO", "X", "X", "X"],
    ["IN_PROGRESS", "IN_PROGRESS", "X", "X", "X"],
    ["IN_PROGRESS", "IN_REVIEW", "ok", "A", "A"],
    ["IN_PROGRESS", "DONE", "NC", "NC", "NC"],
    ["IN_PROGRESS", "CANCELLED", "NC", "NC", "NC"],
    ["IN_REVIEW", "TO_DO", "X", "X", "X"],
    ["IN_REVIEW", "IN_PROGRESS", "RL", "ok", "RL"],
    ["IN_REVIEW", "IN_REVIEW", "X", "X", "X"],
    ["IN_REVIEW", "DONE", "RL", "ok", "RL"],
    ["IN_REVIEW", "CANCELLED", "NC", "NC", "NC"],
    ["DONE", "TO_DO", "NC", "NC", "NC"],
    ["DONE", "IN_PROGRESS", "X", "X", "X"],
    ["DONE", "IN_REVIEW", "X", "X", "X"],
    ["DONE", "DONE", "X", "X", "X"],
    ["DONE", "CANCELLED", "X", "X", "X"],
    ["CANCELLED", "TO_DO", "NC", "NC", "NC"],
    ["CANCELLED", "IN_PROGRESS", "X", "X", "X"],
    ["CANCELLED", "IN_REVIEW", "X", "X", "X"],
    ["CANCELLED", "DONE", "X", "X", "X"],
    ["CANCELLED", "CANCELLED", "X", "X", "X"],
  ];

  it("covers every from × to", () => {
    expect(TABLE.map(([f, t]) => `${f}>${t}`).sort()).toEqual(S.flatMap((f) => S.map((t) => `${f}>${t}`)).sort());
  });
  it.each(TABLE)("%s → %s: as assignee %s, as raiser %s, as neither %s", (from, to, ...want) => {
    expect([judge(held(from), to), judge(raised(from), to), judge(neither(from), to)]).toEqual(want);
  });

  it("is nobody on an item not shared, or when it does not hold the contract", () => {
    expect(moveFaults({ ...held("IN_PROGRESS"), sharedAt: null }, C, "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([{ code: "ONLY_ASSIGNEE" }]);
    expect(moveFaults(held("IN_PROGRESS"), { ...C, mayReadContract: false }, "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([{ code: "ONLY_ASSIGNEE" }]);
    expect(moveFaults({ ...raised("IN_REVIEW"), sharedAt: null }, C, "DONE", "IN_REVIEW", FULL)).toEqual([{ code: "ONLY_RAISER_OR_LEAD" }]);
  });

  it("is never the lead, whatever ids the lead holds", () => {
    expect(moveFaults(neither("IN_REVIEW"), { ...C, leadIds: [L, "x"] }, "DONE", "IN_REVIEW", FULL)).toEqual([{ code: "ONLY_RAISER_OR_LEAD" }]);
  });

  it("Ask again needs its reply, as Send back needs a comment", () => {
    expect(moveFaults(raised("IN_REVIEW"), C, "IN_PROGRESS", "IN_REVIEW", { contractOpen: true })).toEqual([{ code: "COMMENT_NEEDED" }]);
  });

  it("an RFI it holds needs an answer to send; an Inspection it holds needs Passed (OQ-8 stands, WB-5)", () => {
    expect(moveFaults({ ...held("IN_PROGRESS"), type: "RFI" }, C, "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([{ code: "ANSWER_NEEDED" }]);
    expect(moveFaults({ ...held("IN_PROGRESS"), type: "RFI", answer: "Detail 4" }, C, "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([]);
    for (const r of ["NOT_YET", "FAILED"] as const)
      expect(moveFaults({ ...held("IN_PROGRESS"), type: "INSPECTION", inspectionResult: r }, C, "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([{ code: "RESULT_NOT_PASSED" }]);
    expect(moveFaults({ ...held("IN_PROGRESS"), type: "INSPECTION", inspectionResult: "PASSED" }, C, "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([]);
  });

  it("raised and held by the contractor is self-held: no In review, and no shortcut for it", () => {
    const both: WorkItemFacts = { ...raised("IN_PROGRESS"), assignee: CONTRACTOR };
    expect(moveFaults(both, C, "IN_REVIEW", "IN_PROGRESS", FULL)).toEqual([{ code: "NOT_A_MOVE", from: "IN_PROGRESS", to: "IN_REVIEW" }]);
    expect(moveFaults(both, C, "DONE", "IN_PROGRESS", FULL)).toEqual([{ code: "NOT_FOR_CONTRACTOR" }]);
  });
});

describe("staff on an item the contractor is party to", () => {
  const SHARED = "2026-11-01T02:00:00.000Z";
  const raised = (status: WorkStatus, assignee: string | null = A): WorkItemFacts => ({ ...task(status, assignee), type: "RFI", answer: "Use detail 4", raisedBy: CONTRACTOR, sharedAt: SHARED });
  const held = (status: WorkStatus): WorkItemFacts => ({ ...task(status), assignee: CONTRACTOR, sharedAt: SHARED });

  it("contractor-raised: raiser rights fall to the lead; the staff assignee works it as before (B-9)", () => {
    // [the staff "raiser" (here nobody's raiser), the assignee, the lead, another]
    expect(row(raised("IN_REVIEW"), "DONE")).toEqual(["RL", "RL", "ok", "RL"]);
    expect(row(raised("IN_REVIEW"), "IN_PROGRESS")).toEqual(["RL", "RL", "ok", "RL"]);
    expect(row(raised("IN_PROGRESS"), "CANCELLED")).toEqual(["RL", "RL", "ok", "RL"]);
    expect(row(raised("IN_PROGRESS"), "IN_REVIEW")).toEqual(["A", "ok", "A", "A"]);
    expect(row(raised("TO_DO"), "IN_PROGRESS")).toEqual(["RL", "ok", "ok", "RL"]);
    expect(row(raised("DONE"), "TO_DO")).toEqual(["RL", "RL", "ok", "RL"]);
  });
  it("contractor-raised and unassigned: the lead takes the shortcut", () => {
    expect(row(raised("IN_PROGRESS", null), "DONE")).toEqual(["RL", "RL", "ok", "RL"]);
  });
  it("contractor-held: only the contractor sends it for review; the staff raiser or lead closes it after", () => {
    expect(row(held("IN_PROGRESS"), "IN_REVIEW")).toEqual(["A", "A", "A", "A"]);
    expect(row(held("IN_PROGRESS"), "DONE")).toEqual(["X", "X", "X", "X"]);
    expect(row(held("IN_REVIEW"), "DONE")).toEqual(["ok", "RL", "ok", "RL"]);
    expect(row(held("TO_DO"), "IN_PROGRESS")).toEqual(["ok", "RL", "ok", "RL"]);
  });
});

describe("contractorActions: the moves the portal may offer", () => {
  const C: WorkActor = { side: "CONTRACTOR", personId: null, leadIds: [], mayReadContract: true };
  const SHARED = "2026-11-01T02:00:00.000Z";
  const held = (o: Partial<WorkItemFacts>): WorkItemFacts => ({ ...task("IN_PROGRESS"), assignee: CONTRACTOR, sharedAt: SHARED, ...o });

  it("held: Send for checking, even on an RFI with no answer yet (it writes the answer, WB-6)", () => {
    expect(contractorActions(held({}), C)).toEqual(["SEND_FOR_REVIEW"]);
    expect(contractorActions(held({ type: "RFI" }), C)).toEqual(["SEND_FOR_REVIEW"]);
    expect(contractorActions(held({ status: "TO_DO" }), C)).toEqual(["SEND_FOR_REVIEW"]);
  });
  it("held Inspection not passed: nothing, since it never sets a result (B-10)", () => {
    expect(contractorActions(held({ type: "INSPECTION", inspectionResult: "FAILED" }), C)).toEqual([]);
  });
  it("raised and In review: Accept answer and Ask again", () => {
    expect(contractorActions({ ...task("IN_REVIEW"), raisedBy: CONTRACTOR, sharedAt: SHARED }, C)).toEqual(["MARK_DONE", "SEND_BACK"]);
  });
  it("nothing on a closed item, an item it is not party to, or for staff", () => {
    expect(contractorActions(held({ status: "DONE" }), C)).toEqual([]);
    expect(contractorActions({ ...task("IN_PROGRESS"), sharedAt: SHARED }, C)).toEqual([]);
    expect(contractorActions(held({}), actor(A))).toEqual([]);
  });
});
