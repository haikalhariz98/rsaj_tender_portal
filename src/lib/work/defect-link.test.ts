import { describe, expect, it } from "vitest";

import { defectActOf, defectLineText, defectItemStatus, linkedDropColumns, linkedItemPatch, linkedMoveWords, linkedPanelActions, lineStateOf, stateAfter } from "./defect-link";
import type { WorkAction } from "./types";

const NOW = new Date("2026-11-02T03:00:00Z");

describe("a line's state writes its item's status through (B-18)", () => {
  it("maps each state", () => {
    expect(defectItemStatus("OPEN")).toBe("IN_PROGRESS");
    expect(defectItemStatus("REPORTED_RECTIFIED")).toBe("IN_REVIEW");
    expect(defectItemStatus("MADE_GOOD")).toBe("DONE");
    expect(defectItemStatus("WITHDRAWN")).toBe("CANCELLED");
  });

  it("each allowed act leaves the line in the state whose status it writes", () => {
    expect((["REPORT_RECTIFIED", "ACCEPT", "RETURN", "WITHDRAW"] as const).map((a) => defectItemStatus(stateAfter(a)))).toEqual(["IN_REVIEW", "DONE", "IN_PROGRESS", "CANCELLED"]);
  });

  it("closedAt is set exactly when the item closes, and a withdrawal's note is the cancel reason", () => {
    expect(linkedItemPatch("OPEN", "", NOW)).toEqual({ status: "IN_PROGRESS", closedAt: null });
    expect(linkedItemPatch("REPORTED_RECTIFIED", "", NOW)).toEqual({ status: "IN_REVIEW", closedAt: null });
    expect(linkedItemPatch("MADE_GOOD", "", NOW)).toEqual({ status: "DONE", closedAt: NOW });
    expect(linkedItemPatch("WITHDRAWN", "  Not ours.  ", NOW)).toEqual({ status: "CANCELLED", closedAt: NOW, cancelReason: "Not ours." });
  });
});

it("a line reads as the item's title, then its description", () => {
  expect(defectLineText(" Leak ", "")).toBe("Leak");
  expect(defectLineText("Leak", " Block A ")).toBe("Leak: Block A");
  expect(defectLineText("x", "y".repeat(3000))).toHaveLength(2000);
});

describe("an item move is a defect act", () => {
  const staff = (a: WorkAction) => defectActOf(a, "STAFF");
  it("maps the staff moves", () => {
    expect([staff("MARK_DONE"), staff("SEND_BACK"), staff("CANCEL"), staff("SEND_FOR_REVIEW")]).toEqual(["ACCEPT", "RETURN", "WITHDRAW", "REPORT_RECTIFIED"]);
  });
  it("Reopen and Start have no act", () => {
    expect([staff("REOPEN"), staff("START"), defectActOf(null, "STAFF")]).toEqual([null, null, null]);
    expect(linkedMoveWords("REOPEN")).toBe("This defect is closed in Close-out.");
  });
  it("the contractor's only move is Mark as fixed", () => {
    expect((["START", "SEND_FOR_REVIEW", "MARK_DONE", "SEND_BACK", "CANCEL", "REOPEN"] as const).map((a) => defectActOf(a, "CONTRACTOR"))).toEqual([null, "REPORT_RECTIFIED", null, null, null, null]);
  });
});

describe("a linked item's panel and drag offer only defect acts", () => {
  it("offers the moves that have an act, whoever the reader is", () => {
    expect(linkedPanelActions("IN_PROGRESS", true)).toEqual({ primary: "SEND_FOR_REVIEW", menu: ["MARK_DONE", "CANCEL"] });
    expect(linkedPanelActions("IN_REVIEW", true)).toEqual({ primary: "MARK_DONE", menu: ["SEND_BACK", "CANCEL"] });
    expect(linkedPanelActions("DONE", true)).toEqual({ primary: null, menu: [] }); // Reopen is Close-out's
    expect(linkedPanelActions("IN_PROGRESS", false)).toEqual({ primary: null, menu: [] });
    expect(linkedPanelActions("IN_PROGRESS", true, "CONTRACTOR")).toEqual({ primary: "SEND_FOR_REVIEW", menu: [] });
  });
  it("drops only where a defect act stands for the drop", () => {
    expect(linkedDropColumns("IN_PROGRESS")).toEqual(["IN_REVIEW", "DONE"]);
    expect(linkedDropColumns("IN_REVIEW")).toEqual(["DONE"]); // back to In progress is a send back, which needs a note
    expect(linkedDropColumns("DONE")).toEqual([]);
  });
  it("reads a status as the line state that wrote it", () => {
    for (const st of ["OPEN", "REPORTED_RECTIFIED", "MADE_GOOD", "WITHDRAWN"] as const) expect(lineStateOf(defectItemStatus(st))).toBe(st);
  });
});
