import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BOUNDARY_VIEW_ABOUT, boundaryCountNote, boundaryShown } from "./boundary-reading";

describe("'on the boundary' states the estimate, so it is told only to a reader who may read it (ruling on log line 1716)", () => {
  it("is shown when the exercise is on the boundary and the estimate is readable, and never otherwise", () => {
    expect(boundaryShown(true, true)).toBe(true);
    expect(boundaryShown(true, false)).toBe(false);
    expect(boundaryShown(false, true)).toBe(false);
    expect(boundaryShown(false, false)).toBe(false);
  });

  it("says in words how many rows the count leaves out, and nothing when none", () => {
    expect(boundaryCountNote(0)).toBeNull();
    expect(boundaryCountNote(1)).toBe("1 exercise whose estimate is withheld from you is not counted");
    expect(boundaryCountNote(3)).toBe("3 exercises whose estimates are withheld from you are not counted");
    expect(BOUNDARY_VIEW_ABOUT).toMatch(/withheld estimate/);
  });
});

describe("the screens that say it ask the helper", () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), ...p.split("/")), "utf8");

  it("the sourcing list's chip, view membership, header count and view text all go through it", () => {
    const src = read("src/app/sourcing/page.tsx");
    expect(src).toMatch(/const onBoundary = \(r: \(typeof rows\)\[number\]\) => boundaryShown\(r\.onBoundary, values\.get\(r\.id\)\?\.state === "GRANTED"\)/);
    // The raw flag is read twice only: by the helper (with the reader's gate) and to count the rows left out.
    expect(src.match(/\br\.onBoundary\b/g)).toHaveLength(2);
    expect(src).toMatch(/boundaryCountNote\(/);
    expect(src).toMatch(/about: BOUNDARY_VIEW_ABOUT/);
  });

  it("the award page's boundary line is held to the reader's gate on the estimate", () => {
    const src = read("src/app/projects/[id]/award/overview-panel.tsx") /* C-3: OverviewPanel moved out of the award page (wave C step C4) */;
    expect(src).toMatch(/boundaryShown\(ex\.onBoundary, sulit\.state === "GRANTED"\) && ex\.boundaryOperator/);
  });
});
