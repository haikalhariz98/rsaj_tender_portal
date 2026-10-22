import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPLY, HOME_LINKS, RESULTS, STATE_BANNER } from "./labels";

/**
 * Rulings R1 to R3 (product owner, 2026-10-20), from the founder's instruction of the same day: no
 * "View opportunities" button at the top of Home or Results; an awarded opportunity's banner does not
 * send anyone to Results for a winner; no public words promise one.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === "generated" ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });

describe("R1: the home and Results pages have no top 'View opportunities' button", () => {
  it("the Home header has no actions, and the Opportunities card keeps its own link", () => {
    const home = read("src/app/supplier/page.tsx");
    expect(home).not.toMatch(/HOME_LINKS\[0\]/);
    expect(home.slice(home.indexOf("<PageHeader"), home.indexOf("/>", home.indexOf("<PageHeader")))).not.toMatch(/actions=/);
    expect(HOME_LINKS.find((l) => l.key === "opportunities")?.action.en).toBe("View opportunities");
  });
  it("the Results header has no actions", () => {
    const page = read("src/app/supplier/results/page.tsx");
    expect(page.slice(page.indexOf("<PageHeader"), page.indexOf("/>", page.indexOf("<PageHeader")))).not.toMatch(/actions=/);
  });
});

describe("R2: an awarded opportunity", () => {
  it("says it was awarded and that bids are no longer accepted, with no Results text", () => {
    expect(STATE_BANNER.AWARDED.title.en).toBe("This opportunity has been awarded");
    expect(STATE_BANNER.AWARDED.text(null).en).toBe("Bids are no longer accepted.");
  });
  it("its page has no 'View results' button", () => {
    const page = read("src/app/supplier/opportunities/[id]/page.tsx");
    expect(page).not.toMatch(/PORTAL_PATH\.results|viewResults/);
  });
});

describe("R3: no public words promise a winner", () => {
  it("none of the retired phrases is left in the code", () => {
    const retired = [/See Results for the winner/, /who won/i, /Search by title, reference or awardee/, /Awarded to"/, /Awarded value/, /awarded value is not published/i, /registered name appears on Results/, /See Results\./, /The award is under/];
    for (const f of walk(join(process.cwd(), "src"))) {
      const text = readFileSync(f, "utf8");
      // A bidder's own outcome ("Awarded to your company") is theirs to see; the retired column label (a quoted "Awarded to") is not.
      if (!/src\/(lib\/portal|app\/supplier)/.test(f.split("\\").join("/"))) continue;
      for (const re of retired) expect(text, `${f} ${re}`).not.toMatch(re);
    }
  });
  it("the Results words name no winner column, and the application form no longer promises one", () => {
    expect(Object.keys(RESULTS.columns)).toEqual(["exercise", "method", "closing", "awardedOn", "schedule"]);
    // Every word of the application form (the "before you start" list went with the one submission, ADR 0041): none promises a winner on Results.
    expect(JSON.stringify(APPLY)).not.toMatch(/Results/);
  });
});
