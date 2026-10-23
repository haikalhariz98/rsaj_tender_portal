import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { maySeeSettings, STAFF_NAV, visibleGroups } from "./nav";

const none = new Set<string>();
const items = STAFF_NAV.flatMap((g) => g.items);

describe("the staff sidebar (plan 6.1)", () => {
  it("has four groups, with the labels the plan names and the addresses unchanged (SP-10)", () => {
    expect(STAFF_NAV.map((g) => [g.label.en, g.items.map((i) => [i.label.en, i.href])])).toEqual([
      ["Work", [["Home", "/"], ["My approvals", "/approvals"], ["Inbox", "/inbox"]]],
      ["Buying", [["Requisitions", "/requisitions"], ["Tenders & quotations", "/sourcing"], ["Projects", "/projects"]]],
      ["Records", [["Suppliers", "/suppliers"], ["Committees", "/committees"]]],
      ["Settings", [["Settings", "/configuration"]]],
    ]);
  });
  it("holds no item that is not built, and every item has a page (no Reports until step 7, SP-12)", () => {
    for (const i of items) {
      expect(i.built, i.href).toBe(true);
      expect(existsSync(path.join(__dirname, "../app", i.href === "/" ? "" : i.href, "page.tsx")), i.href).toBe(true);
    }
    expect(items.some((i) => /report/i.test(i.label.en))).toBe(false);
  });
  it("shows Settings only to those who may open it (SP-21)", () => {
    expect(maySeeSettings({ isAdministrator: false, permissions: none })).toBe(false);
    expect(maySeeSettings({ isAdministrator: true, permissions: none })).toBe(true);
    for (const p of ["configuration.draft", "configuration.issue", "audit.read"]) expect(maySeeSettings({ isAdministrator: false, permissions: new Set([p]) }), p).toBe(true);
    expect(maySeeSettings({ isAdministrator: false, permissions: new Set(["requisition.raise"]) })).toBe(false);
    const hidden = visibleGroups(STAFF_NAV, false);
    expect(hidden.map((g) => g.label.en)).toEqual(["Work", "Buying", "Records"]);
    expect(visibleGroups(STAFF_NAV, true)).toHaveLength(4);
  });
});
