import { describe, expect, it } from "vitest";

import { coverageOf, NOT_CONVERTED_NOTICE, NOT_YET_CONVERTED, PARTLY_NOTICE, routePatternOf, SCREEN_COVERAGE } from "./coverage";
import { hasMalay } from "./say";

describe("routePatternOf", () => {
  const patterns = ["/", "/projects", "/projects/[id]", "/projects/new", "/projects/[id]/variations/[variationId]", "/a/[x]/c", "/a/b/[y]"];

  it("matches the root", () => {
    expect(routePatternOf("/", patterns)).toBe("/");
  });

  it("prefers a static segment over a parameter, whatever the list order", () => {
    expect(routePatternOf("/projects/new", patterns)).toBe("/projects/new");
    expect(routePatternOf("/projects/new", [...patterns].reverse())).toBe("/projects/new");
  });

  it("matches a parameter with any one segment", () => {
    expect(routePatternOf("/projects/cl0abc", patterns)).toBe("/projects/[id]");
    expect(routePatternOf("/projects/cl0abc/variations/v1", patterns)).toBe("/projects/[id]/variations/[variationId]");
  });

  it("decides at the first segment where the candidates differ", () => {
    expect(routePatternOf("/a/b/c", patterns)).toBe("/a/b/[y]");
    expect(routePatternOf("/a/b/c", [...patterns].reverse())).toBe("/a/b/[y]");
  });

  it("ignores a trailing slash, a query and a fragment", () => {
    expect(routePatternOf("/projects/", patterns)).toBe("/projects");
    expect(routePatternOf("/projects?view=mine", patterns)).toBe("/projects");
    expect(routePatternOf("/projects/x#tab", patterns)).toBe("/projects/[id]");
  });

  it("returns null when nothing matches, including a different depth", () => {
    expect(routePatternOf("/nowhere", patterns)).toBeNull();
    expect(routePatternOf("/projects/x/y", patterns)).toBeNull();
    expect(routePatternOf("/projects", [])).toBeNull();
  });
});

describe("coverageOf", () => {
  it("reads the converted and partly converted screens", () => {
    expect(coverageOf("/")).toBe("CONVERTED");
    expect(coverageOf("/projects")).toBe("PARTLY");
    expect(coverageOf("/inbox")).toBe("PARTLY");
    expect(coverageOf("/projects/cl0abc")).toBe("PARTLY");
  });

  it("does not let /projects/[id] claim /projects/new", () => {
    expect(coverageOf("/projects/new")).toBe("NOT_CONVERTED");
  });

  it("reads a listed screen and a deeper screen under a converted one as not converted", () => {
    expect(coverageOf("/requisitions")).toBe("NOT_CONVERTED");
    expect(coverageOf("/inbox/abc")).toBe("NOT_CONVERTED");
    expect(coverageOf("/projects/cl0abc/certificates/c1")).toBe("NOT_CONVERTED");
  });

  it("reads an unknown path as not converted (the conservative reading)", () => {
    expect(coverageOf("/no/such/screen")).toBe("NOT_CONVERTED");
    expect(coverageOf("/supplier/account")).toBe("NOT_CONVERTED");
  });
});

describe("the lists", () => {
  it("NOT_YET_CONVERTED is sorted, without duplicates, and disjoint from SCREEN_COVERAGE", () => {
    expect([...NOT_YET_CONVERTED].sort()).toEqual(NOT_YET_CONVERTED);
    expect(new Set(NOT_YET_CONVERTED).size).toBe(NOT_YET_CONVERTED.length);
    for (const p of Object.keys(SCREEN_COVERAGE)) expect(NOT_YET_CONVERTED).not.toContain(p);
  });

  it("the notices have both languages", () => {
    expect(hasMalay(NOT_CONVERTED_NOTICE)).toBe(true);
    expect(hasMalay(PARTLY_NOTICE)).toBe(true);
    expect(NOT_CONVERTED_NOTICE.en).toBe("This screen is not yet in Bahasa Malaysia.");
    expect(PARTLY_NOTICE.en).toBe("Parts of this screen are not yet in Bahasa Malaysia.");
  });
});
