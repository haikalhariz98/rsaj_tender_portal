import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The exercise's History and Access tabs are built only while they are the tab looked at (a workspace renders one tab at a time; product owner, 2026-10-08, ruling on log
 * line 1751). The History rows carry the opening's pairing of a listing number with a bidder's name and price, and the evaluation's audit rows: built on every tab, they rode in
 * the response of the Evaluation tab of a team member read blind, which then sent what the ruling says it sends nobody. The Access tab lists the people the routes and the
 * sittings name (ruling on log line 1711), read only for that tab.
 */

const page = readFileSync(path.join(process.cwd(), "src", "app", "sourcing", "[id]", "page.tsx"), "utf8");
const tab = (id: string) => {
  const a = page.indexOf(`id: "${id}",\n      label:`);
  return page.slice(a, a + 700);
};

describe("the exercise page builds History and Access only for their own tab", () => {
  it("asks for the trail's rows only when the History tab is asked for, and otherwise only for its count", () => {
    expect(page).toMatch(/exerciseHistory\(l, asked === "history"\)/);
    const repo = readFileSync(path.join(process.cwd(), "src", "lib", "method", "repo.ts"), "utf8");
    expect(repo).toMatch(/export async function exerciseHistory\(l: LoadedExercise, withEntries = true\)/);
    expect(repo).toMatch(/withEntries \? db\.auditEntry\.findMany\(/);
  });

  it("the History tab is lazy and its panel is null unless it is the tab looked at", () => {
    const t = tab("history");
    expect(t).toMatch(/lazy: true,/);
    expect(t).toMatch(/panel: tab !== "history" \? null : \(/);
  });

  it("the Access tab is lazy and reads the derived names only for itself", () => {
    const t = tab("access");
    expect(t).toMatch(/lazy: true,/);
    expect(t).toMatch(/panel: tab !== "access" \? null : \(/);
    expect(page).toMatch(/const derivedNames = tab === "access" \?/);
  });

  it("the Overview reads the cancellation day by itself and not from the History rows", () => {
    expect(page).toMatch(/const cancelledAt = ex\.status === "CANCELLED" \? await exerciseCancelledAt\(l\) : null;/);
    expect(page).not.toMatch(/history\.entries\.find\(/);
  });
});
