import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONFIRM_SCRIM, DRAWER_SCRIM, confirmPanelClass, drawerPanelClass } from "./drawer";

/// N3 reviewer run 1 and its review, AC-63: a modal never scrolls the page behind it. overscroll-behavior only works on a scroll container, so the rule is on the scrolling body.
describe("drawers and confirmation boxes contain overscroll", () => {
  it.each([
    ["drawer scrim", DRAWER_SCRIM],
    ["confirm scrim", CONFIRM_SCRIM],
    ["drawer panel", drawerPanelClass("md")],
    ["confirm panel", confirmPanelClass()],
  ])("%s", (_name, cls) => {
    expect(cls.split(/\s+/)).toContain("overscroll-contain");
  });

  it("every scrolling body inside a drawer or confirmation is overscroll-contain", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
    });
    const offenders: string[] = [];
    for (const f of walk("src")) {
      const src = readFileSync(f, "utf8");
      if (!/DRAWER_SCRIM|CONFIRM_SCRIM|drawerPanelClass|confirmPanelClass/.test(src)) continue;
      for (const m of src.matchAll(/className=(?:\{[^}]*)?"([^"]*overflow-y-auto[^"]*)"/g)) {
        if (!m[1].split(/\s+/).includes("overscroll-contain")) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
