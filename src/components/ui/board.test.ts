import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Activity } from "./activity";
import { Board, type BoardCard } from "./board";
import { sidePanelClass } from "./drawer";
import { DataList, type Column, type Row } from "@/components/data-list";

const columns = [
  { id: "a", label: "To do", total: 1 },
  { id: "b", label: "In progress", total: 5, moreHref: "/x?view=b" },
];
const card = (over: Partial<BoardCard>): BoardCard => ({ id: "1", columnId: "a", title: "Fix the gate", href: "/i/1", moves: ["a", "b"], fields: { id: "1" }, ...over });
const board = (cards: BoardCard[]) => renderToStaticMarkup(createElement(Board, { columns, cards, move: async () => {}, label: "Work board" }));

describe("Board", () => {
  it("draws a link to open each card, and a Move menu only on a card that may move", () => {
    const out = board([card({}), card({ id: "2", title: "Locked", moves: [], stuckWhy: "Closed" })]);
    expect(out).toContain('href="/i/1"');
    expect(out.match(/aria-haspopup="menu"/g)).toHaveLength(1);
    expect(out).toContain('draggable="true"');
    expect(out).toContain('draggable="false"');
    expect(out).toContain("Closed");
  });
  it("says a capped column has more, and an empty one is empty", () => {
    const out = board([card({})]);
    expect(out).toContain('href="/x?view=b"');
    expect(out).toContain("Nothing here");
  });
});

describe("the select cell", () => {
  const columnsL: Column[] = [{ key: "s", label: "Status" }];
  const sel = (disabledWhy?: string): Row[] => [
    { id: "1", search: "", cells: { s: { kind: "select", name: "to", value: "b", label: "Status", options: [{ value: "a", label: "To do" }, { value: "b", label: "In progress" }], action: async () => {}, fields: {}, disabledWhy } } },
  ];
  it("offers its options when it can change", () => {
    expect(renderToStaticMarkup(createElement(DataList, { columns: columnsL, rows: sel() }))).toContain("In progress");
  });
  it("shows the current label and who can change it when it cannot", () => {
    const out = renderToStaticMarkup(createElement(DataList, { columns: columnsL, rows: sel("Only the assignee can move it") }));
    expect(out).toContain("In progress");
    expect(out).toContain("Only the assignee can move it");
    expect(out).not.toContain("To do");
  });
});

describe("Activity and the side panel", () => {
  it("lists entries and offers All and Comments", () => {
    const out = renderToStaticMarkup(createElement(Activity, { label: "Activity", entries: [{ id: "1", kind: "comment", who: "Aina", at: "today", text: "Done" }] }));
    expect(out).toContain("Comments");
    expect(out).toContain("Done");
  });
  it("a side panel has no scrim and is not modal", () => {
    expect(sidePanelClass("lg")).toContain("overscroll-contain");
    expect(sidePanelClass("lg")).toContain("w-[46rem]");
  });
});
