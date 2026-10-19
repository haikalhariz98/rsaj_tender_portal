import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ push: () => {}, replace: () => {} }), useSearchParams: () => new URLSearchParams() }));

import { Tabs } from "./tabs";

/// N3 reviewer run 1 and its review, AC-63: the tab strip follows the APG tabs pattern, proved on the rendered markup. The selected tab points at the panel, the panel is named by that tab.
describe("Tabs links tab and panel", () => {
  const html = renderToStaticMarkup(createElement(Tabs, { label: "Sections", initial: "b", tabs: [{ id: "a", label: "Alpha", panel: "A body" }, { id: "b", label: "Beta", panel: "B body" }] }));
  const attr = (tag: RegExp, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag.exec(html)?.[0] ?? "")?.[1];
  it("the selected tab's aria-controls equals the panel's id", () => {
    const controls = attr(/<[^>]*role="tab"[^>]*aria-selected="true"[^>]*>/, "aria-controls");
    const panelId = attr(/<[^>]*role="tabpanel"[^>]*>/, "id");
    expect(controls).toBeTruthy();
    expect(controls).toBe(panelId);
  });
  it("the panel is labelled by the selected tab's id", () => {
    const tabTag = /<[^>]*role="tab"[^>]*aria-selected="true"[^>]*>/;
    expect(attr(/<[^>]*role="tabpanel"[^>]*>/, "aria-labelledby")).toBe(attr(tabTag, "id"));
    expect(html).toContain("B body");
    expect(html).not.toContain("A body");
  });
});
