// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Board } from "./board";
import { Composer } from "./composer";
import { ListPageSkeleton, PageSkeleton, PanelSkeleton, RecordPageSkeleton } from "./skeleton";

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

describe("loading regions", () => {
  it("only the outermost skeleton is a status, named once in text", () => {
    for (const el of [PageSkeleton({}), ListPageSkeleton({}), RecordPageSkeleton({ stepper: true }), PanelSkeleton({})]) {
      const html = renderToStaticMarkup(el);
      expect(html.match(/role="status"/g)).toHaveLength(1);
      expect(html).toContain('<span class="sr-only">Loading…</span>');
      expect(html).not.toContain("aria-busy");
    }
  });
  it("a nested panel has no role of its own, and the pulse yields to reduced motion", () => {
    const html = renderToStaticMarkup(PanelSkeleton({ nested: true }));
    expect(html).not.toContain("role=");
    expect(html).toContain("motion-reduce:animate-none");
  });
});

describe("Composer", () => {
  const box = () => host.querySelector("textarea")!;
  const type = async (text: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box(), text);
      box().dispatchEvent(new Event("input", { bubbles: true }));
    });

  it("an empty send says so, ties the message to the box and focuses it; the button stays enabled", async () => {
    const action = vi.fn(async () => {});
    await act(async () => root.render(createElement(Composer, { action, label: "Comment" })));
    const send = host.querySelector<HTMLButtonElement>("button[type=submit]")!;
    expect(send.disabled).toBe(false);
    await act(async () => send.click());
    expect(action).not.toHaveBeenCalled();
    const note = host.querySelector('[role="status"]')!;
    expect(note.textContent).toBe("Write something first.");
    expect(box().getAttribute("aria-describedby")).toBe(note.id);
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(box());
  });

  it("Ctrl+Enter sends the trimmed words", async () => {
    const action = vi.fn(async (data: FormData) => void data.get("body"));
    await act(async () => root.render(createElement(Composer, { action, label: "Comment", fields: { id: "7" } })));
    await type("  hello  ");
    await act(async () => void box().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })));
    expect(action).toHaveBeenCalledTimes(1);
    const sent = action.mock.calls[0][0];
    expect([sent.get("body"), sent.get("id")]).toEqual(["hello", "7"]);
    expect(box().value).toBe("");
  });
});

describe("Board", () => {
  it("never writes a column id it does not draw", async () => {
    const columns = [{ id: "a", label: "Alpha", total: 1 }];
    const cards = [{ id: "1", columnId: "a", title: "One", href: "/1", moves: ["ghost"], fields: {} }];
    await act(async () => root.render(createElement(Board, { columns, cards, move: async () => {}, label: "B" })));
    expect(host.textContent).not.toContain("ghost");
    expect(host.querySelector("details")).toBeNull();
    expect(host.querySelector("h2")?.textContent).toContain("Alpha");
  });
});
