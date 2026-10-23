import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SETTINGS_SECTIONS } from "@/lib/nav";
import type { ChecklistItem } from "@/lib/setup/types";

import { SectionPage } from "./section-page";

const item = (over: Partial<ChecklistItem>): ChecklistItem => ({ key: "k", section: "approvals", kind: "set", label: "Committee members", href: "/configuration/committees", state: "todo", ...over });
const approvals = SETTINGS_SECTIONS.find((s) => s.slug === "approvals")!;
const render = (items: ChecklistItem[]) => renderToStaticMarkup(createElement(SectionPage, { section: approvals, items, at: () => "" }));

describe("a Settings section page", () => {
  it("puts the essentials before Advanced, and Advanced links to the section's pages", () => {
    const out = render([item({})]);
    expect(out.indexOf("Essentials")).toBeGreaterThan(-1);
    expect(out.indexOf("Essentials")).toBeLessThan(out.indexOf("Advanced"));
    for (const a of approvals.advanced) expect(out).toContain(`href="${a.href}"`);
  });
  it("names what still needs a value, with a link to it", () => {
    const out = render([item({}), item({ key: "limits", label: "Confirm approval limits", href: "/configuration/approval-matrix", state: "confirm" })]);
    expect(out).toContain("2 settings need a value");
    expect(out).toContain('href="/configuration/approval-matrix"');
  });
  it("shows no banner when nothing is to do, and none for another section's items", () => {
    expect(render([item({ state: "done" })])).not.toContain("need a value");
    expect(render([item({ section: "people" })])).not.toContain("need a value");
  });
});
