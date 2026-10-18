/**
 * Every staff screen has a language coverage state (NFR-LNG-001, ADR 0040). Walks `src/app/**\/page.tsx`,
 * leaving out the supplier portal (a later slice), `src/app/api`, any `_`-prefixed (private) folder and the
 * AC-23 redirect-only award addresses (pinned below), and
 * maps each file to its route pattern with `(group)` segments removed. Every path is normalised to "/"
 * before it is compared, so the test reads the same on Windows and Linux.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NOT_YET_CONVERTED, SCREEN_COVERAGE } from "./coverage";

const APP = path.resolve(__dirname, "../../app");

/**
 * The route pattern of a page file, given its path relative to `src/app` with either separator, or null when
 * the file is not a staff screen.
 */
function staffRouteOf(relative: string): string | null {
  const parts = relative.replace(/\\/g, "/").split("/").filter((s) => s !== "");
  if (parts.at(-1) !== "page.tsx") return null;
  const folders = parts.slice(0, -1);
  if (folders[0] === "supplier" || folders[0] === "api") return null;
  if (folders.some((f) => f.startsWith("_"))) return null;
  const segments = folders.filter((f) => !/^\(.*\)$/.test(f));
  return `/${segments.join("/")}`;
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const full = path.join(dir, n);
    return statSync(full).isDirectory() ? walk(full) : n === "page.tsx" ? [full] : [];
  });

describe("staffRouteOf", () => {
  it("maps the root page to /", () => {
    expect(staffRouteOf("page.tsx")).toBe("/");
  });

  it("normalises Windows separators", () => {
    expect(staffRouteOf("projects\\[id]\\page.tsx")).toBe("/projects/[id]");
  });

  it("strips route groups", () => {
    expect(staffRouteOf("(staff)/x/page.tsx")).toBe("/x");
    expect(staffRouteOf("a/(b)/c/page.tsx")).toBe("/a/c");
  });

  it("leaves out the supplier portal, the api and private folders", () => {
    expect(staffRouteOf("supplier/account/page.tsx")).toBeNull();
    expect(staffRouteOf("supplier/page.tsx")).toBeNull();
    expect(staffRouteOf("api/x/page.tsx")).toBeNull();
    expect(staffRouteOf("_auth/page.tsx")).toBeNull();
    expect(staffRouteOf("a/_parts/page.tsx")).toBeNull();
  });

  it("does not leave out a staff folder that merely starts with the same letters", () => {
    expect(staffRouteOf("suppliers/page.tsx")).toBe("/suppliers");
  });

  it("ignores files other than page.tsx", () => {
    expect(staffRouteOf("projects/layout.tsx")).toBeNull();
  });
});

/**
 * The old award addresses AC-23 keeps (src/lib/contract/awards-links-scan.test.ts). Each page only redirects and renders nothing of its
 * own, so it is not a screen and has no language state; `coverageOf` reads it as not converted, as any unlisted path. The award print
 * view under the same folder is a screen and is listed. Pinned here, in a test file, because AC-23's scan forbids an /awards literal in
 * source outside those pages.
 */
const REDIRECT_ONLY: Readonly<Record<string, string>> = {
  "/awards": "awards/page.tsx",
  "/awards/[id]": "awards/[id]/page.tsx",
  "/awards/new": "awards/new/page.tsx",
};

describe("the coverage lists match the staff screens", () => {
  const walked = walk(APP)
    .map((f) => staffRouteOf(path.relative(APP, f).split(path.sep).join("/")))
    .filter((r): r is string => r !== null)
    .sort();

  it("finds screens", () => {
    expect(walked).toContain("/");
    expect(walked).toContain("/projects/[id]");
  });

  it("the redirect-only pages exist, redirect, render no award, and are in neither list", () => {
    for (const [route, file] of Object.entries(REDIRECT_ONLY)) {
      expect(walked, route).toContain(route);
      const src = readFileSync(path.join(APP, file), "utf8");
      expect(src, file).toContain("redirect(");
      expect(src, file).not.toContain("loadAward(");
      expect(Object.keys(SCREEN_COVERAGE), route).not.toContain(route);
      expect(NOT_YET_CONVERTED, route).not.toContain(route);
    }
  });

  it("every other staff screen is in exactly one list, and every listed screen exists", () => {
    const listed = [...Object.keys(SCREEN_COVERAGE), ...NOT_YET_CONVERTED].sort();
    expect(walked.filter((r) => !(r in REDIRECT_ONLY))).toEqual(listed);
  });

  it("the two lists are disjoint", () => {
    const converted = new Set(Object.keys(SCREEN_COVERAGE));
    expect(NOT_YET_CONVERTED.filter((p) => converted.has(p))).toEqual([]);
  });

  it("NOT_YET_CONVERTED is sorted and without duplicates", () => {
    expect([...NOT_YET_CONVERTED].sort()).toEqual(NOT_YET_CONVERTED);
    expect(new Set(NOT_YET_CONVERTED).size).toBe(NOT_YET_CONVERTED.length);
  });
});
