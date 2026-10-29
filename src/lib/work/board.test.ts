import { describe, expect, it } from "vitest";

import { BOARD_COLUMN_CAP, BOARD_DONE_DAYS, boardColumns, cardMoves, closedRecently, type BoardItem } from "./board";
import { FIXTURE_ITEMS, FIXTURE_TODAY } from "./items.fixture";
import type { WhoNames } from "./labels";
import type { WorkActor } from "./types";
import { compareItems } from "./views";

/** The Board (0008 §5.3): four columns, no Cancelled, Done for 14 days, 50 a column, the list's order; each card's moves from `moveFaults`. */

const card = (o: Partial<BoardItem> = {}): BoardItem => ({ id: "c", type: "TASK", number: 1, status: "TO_DO", raisedBy: "hafiz", assignee: "aisyah", dueOn: null, answer: "", inspectionResult: null, title: "T", priority: "NORMAL", closedOn: null, ...o });

describe("boardColumns", () => {
  const cols = boardColumns(FIXTURE_ITEMS, FIXTURE_TODAY);

  it("four columns, To do to Done; Cancelled is never on the board", () => {
    expect(cols.map((c) => c.column)).toEqual(["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
    expect(cols.flatMap((c) => c.items).some((i) => i.status === "CANCELLED")).toBe(false);
    expect(FIXTURE_ITEMS.some((i) => i.status === "CANCELLED")).toBe(true);
  });

  it("each column is in compareItems order", () => {
    for (const c of cols) expect(c.items.map((i) => i.id)).toEqual([...c.items].sort(compareItems).map((i) => i.id));
  });

  it("Done shows what closed today and in the 13 days before; the 14th day back is older", () => {
    expect(BOARD_DONE_DAYS).toBe(14);
    expect(closedRecently("2026-11-05", "2026-11-05")).toBe(true);
    expect(closedRecently("2026-10-23", "2026-11-05")).toBe(true); // 13 days back
    expect(closedRecently("2026-10-22", "2026-11-05")).toBe(false); // 14 days back
    expect(closedRecently(null, "2026-11-05")).toBe(false);
    const done = cols.find((c) => c.column === "DONE")!;
    expect(done.items.every((i) => i.closedOn! > "2026-10-22")).toBe(true);
    expect(FIXTURE_ITEMS.some((i) => i.status === "DONE" && i.closedOn! <= "2026-10-22")).toBe(true);
  });

  it("with no time zone the window cannot be judged: every Done item shows, capped", () => {
    const done = boardColumns(FIXTURE_ITEMS, null).find((c) => c.column === "DONE")!;
    expect(done.total).toBe(FIXTURE_ITEMS.filter((i) => i.status === "DONE").length);
  });

  it("a column shows 50 and counts the rest; 50 exactly shows all", () => {
    expect(BOARD_COLUMN_CAP).toBe(50);
    const many = (n: number) => Array.from({ length: n }, (_, i) => card({ id: `c${String(i).padStart(3, "0")}`, number: i + 1 }));
    const at = boardColumns(many(50), FIXTURE_TODAY)[0];
    expect([at.items.length, at.total, at.more]).toEqual([50, 50, 0]);
    const over = boardColumns(many(51), FIXTURE_TODAY)[0];
    expect([over.items.length, over.total, over.more]).toEqual([50, 51, 1]);
    expect(over.items.map((i) => i.number)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });
});

describe("cardMoves", () => {
  const who: WhoNames = { raiser: "Hafiz", assignee: "Aisyah", lead: { roleLabel: "S.O.", names: ["Nurul"] } };
  const as = (personId: string): WorkActor => ({ personId, leadIds: ["nurul"], mayReadContract: true });
  const ctx = { contractOpen: true, who };

  it("the assignee drags To do to In progress or In review; never to Done when someone else raised it", () => {
    expect(cardMoves(card(), as("aisyah"), ctx)).toEqual({ moves: ["IN_PROGRESS", "IN_REVIEW"], stuckWhy: null });
  });
  it("the raiser on an item In review may drop it in Done; send back needs a comment, so not by drag", () => {
    expect(cardMoves(card({ status: "IN_REVIEW" }), as("hafiz"), ctx)).toEqual({ moves: ["DONE"], stuckWhy: null });
  });
  it("Done reopens to To do, for the raiser or the lead", () => {
    expect(cardMoves(card({ status: "DONE" }), as("nurul"), ctx)).toEqual({ moves: ["TO_DO"], stuckWhy: null });
  });
  it("an RFI with no answer may still be dropped in In review: the act says what is missing", () => {
    expect(cardMoves(card({ type: "RFI", status: "IN_PROGRESS" }), as("aisyah"), ctx).moves).toEqual(["IN_REVIEW"]);
  });
  it("someone with no move is told who can", () => {
    expect(cardMoves(card({ status: "IN_REVIEW" }), as("aisyah"), ctx)).toEqual({ moves: [], stuckWhy: "Hafiz, who raised it, or the S.O. (Nurul) can mark this done." });
  });
  it("a closed contract: no moves, and it says so", () => {
    expect(cardMoves(card(), as("hafiz"), { ...ctx, contractOpen: false })).toEqual({ moves: [], stuckWhy: "Closed. Read only." });
  });
});
