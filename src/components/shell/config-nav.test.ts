import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_LABELS, FOLDER_SECTION, NON_SETTING_PAGES, sectionOfPath, SETTINGS_RAIL, SETTINGS_SECTIONS } from "@/lib/nav";

import { crumbTrail } from "./topbar";

/**
 * Settings is six sections (simplification plan 5.1). The table in `@/lib/nav` is the only place a page is placed; this is what makes
 * that more than advice: a page folder with no section, or in two, fails here.
 */

const CONFIG = path.join(__dirname, "../../app/configuration");
const slugs = SETTINGS_SECTIONS.map((s) => s.slug);
const folders = readdirSync(CONFIG, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(CONFIG, d.name, "page.tsx")))
  .map((d) => d.name);
const pages = folders.filter((f) => !slugs.includes(f as never) && !NON_SETTING_PAGES.includes(f));

describe("Settings' sections", () => {
  it("there are six, and the rail is Getting started then those six", () => {
    expect(SETTINGS_SECTIONS).toHaveLength(6);
    expect(SETTINGS_RAIL).toHaveLength(7);
    expect(SETTINGS_RAIL.map((i) => i.href)).toEqual(["/configuration", ...slugs.map((s) => `/configuration/${s}`)]);
  });

  it("every section has a page of its own", () => {
    for (const s of slugs) expect(folders, s).toContain(s);
  });

  it("every page folder belongs to exactly one section, and every claimed folder exists", () => {
    for (const f of pages) expect(SETTINGS_SECTIONS.filter((s) => s.folders.includes(f)).length, f).toBe(1);
    for (const s of SETTINGS_SECTIONS) for (const f of s.folders) expect(pages, f).toContain(f);
  });

  it("a page lights its own section in the rail", () => {
    for (const f of pages) expect(sectionOfPath(`/configuration/${f}/anything`), f).toBe(FOLDER_SECTION[f]);
    expect(sectionOfPath("/configuration")).toBeNull();
    for (const s of slugs) expect(sectionOfPath(`/configuration/${s}`)).toBe(s);
  });

  it("every old page is one link from its section (a section page lists each of its folders)", () => {
    for (const s of SETTINGS_SECTIONS) {
      for (const f of s.folders) expect(s.advanced.some((a) => a.href.split("?")[0] === `/configuration/${f}`), `${s.slug}: ${f}`).toBe(true);
      for (const a of s.advanced) expect(s.folders, a.href).toContain(a.href.split("?")[0].split("/")[2]);
    }
  });

  it("each label reads the same in the breadcrumb as in the rail, under Settings", () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(CONFIG_LABELS[s.slug].en).toBe(s.label.en);
      expect(crumbTrail(["configuration", s.slug], null, null).map((c) => c.label.en)).toEqual(["Settings", s.label.en]);
    }
    for (const f of pages) {
      const section = SETTINGS_SECTIONS.find((s) => s.folders.includes(f))!;
      expect(crumbTrail(["configuration", f], null, null).map((c) => c.label.en), f).toEqual(["Settings", section.label.en, CONFIG_LABELS[f].en]);
    }
  });

  it("no label holds a configuration code", () => {
    for (const [slug, label] of Object.entries(CONFIG_LABELS)) expect(label.en, slug).not.toMatch(/[_/]|^[a-z]+(-[a-z]+)+$/);
  });
});
