// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Board, type BoardCard, type BoardMove } from "./board";
import { SidePanel } from "./side-panel";

/** The Board and the side panel in a DOM: keyboard, the move menu, and where focus lands (step 4's planned tests). */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const columns = [
  { id: "todo", label: "To do", total: 2 },
  { id: "doing", label: "In progress", total: 0 },
  { id: "done", label: "Done", total: 1 },
];
const card = (id: string, columnId: string, moves: string[]): BoardCard => ({ id, columnId, title: `Card ${id}`, href: `/i/${id}`, moves, fields: { id } });
const CARDS = [card("1", "todo", ["doing", "done"]), card("2", "todo", []), card("3", "done", ["todo"])];

async function draw(move: BoardMove = async () => {}, cards = CARDS) {
  await act(async () => root.render(createElement(Board, { columns, cards, move, label: "Work board" })));
}
const link = (id: string) => host.querySelector<HTMLElement>(`[data-card-id="${id}"] a`)!;
const key = async (el: Element, k: string) => {
  await act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
};
const details = (id: string) => host.querySelector<HTMLDetailsElement>(`[data-card-id="${id}"] details`)!;
const inColumn = (n: number, id: string) => host.querySelector(`[data-board-column]:nth-of-type(${n}) [data-card-id="${id}"]`);

describe("Board keyboard", () => {
  it("left and right skip an empty column; up and down walk the column", async () => {
    await draw();
    link("1").focus();
    await key(link("1"), "ArrowRight");
    expect(document.activeElement).toBe(link("3")); // "In progress" is empty
    await key(link("3"), "ArrowLeft");
    expect(document.activeElement).toBe(link("1"));
    await key(link("1"), "ArrowDown");
    expect(document.activeElement).toBe(link("2"));
    await key(link("2"), "ArrowDown"); // the last card: stays
    expect(document.activeElement).toBe(link("2"));
  });
});

describe("a card's Move to menu", () => {
  const menu = (id: string) => [...host.querySelectorAll(`[data-card-id="${id}"] details button`)].map((b) => b.textContent);

  it("holds exactly the card's moves, by column label, and a card with none has no menu", async () => {
    await draw();
    expect(menu("1")).toEqual(["In progress", "Done"]);
    expect(menu("3")).toEqual(["To do"]);
    expect(details("2")).toBeNull();
  });

  it("Escape closes it and returns focus to its button", async () => {
    await draw();
    await act(async () => void (details("1").open = true));
    details("1").querySelector("button")!.focus();
    await key(document.body, "Escape");
    expect(details("1").open).toBe(false);
    expect(document.activeElement).toBe(details("1").querySelector("summary"));
  });

  it("a click outside closes it", async () => {
    await draw();
    await act(async () => void (details("1").open = true));
    await act(async () => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(details("1").open).toBe(false);
  });

  it("picking a column moves the card there and focus follows its link", async () => {
    // The caller's action saves and the page sends the cards again, with the card in its new column.
    const moved = CARDS.map((c) => (c.id === "1" ? { ...c, columnId: "doing" } : c));
    const move = vi.fn<BoardMove>(async () => void root.render(createElement(Board, { columns, cards: moved, move, label: "Work board" })));
    await draw(move);
    details("1").open = true;
    const pick = [...details("1").querySelectorAll("button")].find((b) => b.textContent === "In progress")!;
    pick.focus();
    await act(async () => void pick.click());
    const sent = move.mock.calls[0][0];
    expect([sent.get("id"), sent.get("from"), sent.get("to")]).toEqual(["1", "todo", "doing"]);
    expect(inColumn(2, "1")).not.toBeNull();
    expect(document.activeElement).toBe(link("1"));
  });

  it("a refusal puts the card back, says why, and focus is on it", async () => {
    await draw(async () => ({ refused: "Only Hafiz can do that." }));
    details("1").open = true;
    await act(async () => void details("1").querySelector("button")!.click());
    expect(inColumn(1, "1")).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Only Hafiz can do that.");
    expect(document.activeElement).toBe(link("1"));
  });
});

describe("the side panel", () => {
  it("is a labelled complementary region, not a modal; Escape closes it only from inside, and focus goes back to the opener", async () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    await act(async () => root.render(createElement(SidePanel, { label: "RFI 12", onClose } as never, createElement("button", { id: "inside" }, "Inside"))));
    const panel = host.querySelector("aside")!;
    expect(panel.getAttribute("role")).toBe("complementary");
    expect(panel.getAttribute("aria-label")).toBe("RFI 12");
    expect(panel.hasAttribute("aria-modal")).toBe(false);
    await key(opener, "Escape"); // focus is outside
    expect(onClose).not.toHaveBeenCalled();
    host.querySelector<HTMLElement>("#inside")!.focus();
    await key(document.activeElement!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => root.render(createElement("div")));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
