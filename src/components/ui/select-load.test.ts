// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Select, type RemoteLoad } from "./select";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** ADR 0041: a server-searched Select may take the page's own loader in place of a route (the public registration form's code search, whose answer has another shape). */

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const wait = async (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

describe("Select with a page's own loader", () => {
  it("asks the loader, not the network, once enough is typed, and lists what it answers", async () => {
    // The browser's popover API and scrolling are not in jsdom.
    HTMLElement.prototype.showPopover ??= function () {};
    HTMLElement.prototype.hidePopover ??= function () {};
    Element.prototype.scrollIntoView ??= function () {};
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const load = vi.fn<RemoteLoad>(async (q) => ({ options: [{ value: "v1", label: `G1 — Grade 1 (${q})` }], hasMore: false }));
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const changes: string[] = [];
    act(() => root!.render(createElement(Select, { id: "s", value: "", onChange: (e) => changes.push(e.target.value), placeholder: "Choose", search: { load, minChars: 2 } })));
    await act(async () => host.querySelector("button")!.click());
    const box = document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      set.call(box, "g");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(300);
    expect(load).not.toHaveBeenCalled();
    act(() => {
      set.call(box, "g1");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(300);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]![0]).toBe("g1");
    expect(document.body.textContent).toContain("G1 — Grade 1 (g1)");
    expect(fetchSpy).not.toHaveBeenCalled();
    // A searched row can be chosen: the hidden native select holds it, so the change carries its value (a single choice was lost before, ADR 0041 rehearsal).
    await act(async () => (document.querySelector('[role="option"]') as HTMLElement).click());
    expect(changes).toEqual(["v1"]);
    vi.unstubAllGlobals();
  });
});
