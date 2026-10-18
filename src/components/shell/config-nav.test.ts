import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_LABELS, CONFIG_PINNED, CONFIG_SECTIONS } from "@/lib/nav";

import { crumbTrail } from "./topbar";

/**
 * Configuration's navigator is held to the pages beside it (founder, 2026-10-08: "more features are coming and it is becoming
 * unorganised; let's stay organised"). The rule for where a section goes is the comment above CONFIG_SECTIONS; this is what makes it
 * more than advice. There is deliberately no fixed count: a new section is added, and the test only insists it is placed.
 */

const CONFIG = path.join(__dirname, "../../app/configuration");

const sections = CONFIG_SECTIONS.flatMap((g) => g.items);
const all = [...CONFIG_PINNED, ...sections];

describe("Configuration's navigator", () => {
  it("every entry opens a page", () => {
    for (const item of all) expect(existsSync(path.join(CONFIG, item.href.replace("/configuration/", ""), "page.tsx")), item.href).toBe(true);
  });

  it("every section folder has exactly one entry, so a new section cannot ship without a place", () => {
    const folders = readdirSync(CONFIG, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(path.join(CONFIG, d.name, "page.tsx")))
      .map((d) => `/configuration/${d.name}`);
    expect(folders.length).toBeGreaterThan(0);
    for (const href of folders) expect(all.filter((i) => i.href === href).length, href).toBe(1);
    for (const item of all) expect(folders, item.href).toContain(item.href);
  });

  it("every entry's address is unique", () => {
    const hrefs = all.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("every group holds two to seven sections, and group names are unique", () => {
    for (const g of CONFIG_SECTIONS) {
      expect(g.items.length, g.group).toBeGreaterThanOrEqual(2);
      expect(g.items.length, g.group).toBeLessThanOrEqual(7);
    }
    const names = CONFIG_SECTIONS.map((g) => g.group);
    expect(new Set(names).size).toBe(names.length);
  });

  it("each entry reads the same in the breadcrumb as it does in the navigator", () => {
    for (const item of all) {
      const slug = item.href.slice("/configuration/".length);
      // AC-63 N1 (NFR-LNG-001): labels are `Words`; the English is what these assertions always read, and the Malay must agree as well.
      expect(CONFIG_LABELS[slug].en, item.href).toBe(item.label.en);
      expect(CONFIG_LABELS[slug].ms, item.href).toBe(item.label.ms);
      const crumbs = crumbTrail(["configuration", slug], null, null);
      expect(crumbs.map((c) => c.label.en), item.href).toEqual(["Configuration", item.label.en]);
      expect(crumbs.map((c) => c.label.ms), item.href).toEqual(["Konfigurasi", item.label.ms]);
    }
  });

  it("the section's name never shows a configuration code", () => {
    for (const item of all) expect(item.label.en, item.href).not.toMatch(/[_/]|^[a-z]+(-[a-z]+)+$/);
  });
});
