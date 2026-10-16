import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * Ruling 20ct: Received shows the SR-15 table through Schedule's component. No file under src/app/sourcing/[id] holds a second copy of the table's columns or rows: only schedule-tables.tsx names
 * the column headings or builds a schedule row (a source scan over code only, with a self-test).
 */

const root = join(process.cwd(), "src", "app", "sourcing", "[id]");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const OWN = /schedule-tables\.tsx$/;
const COPY = /\b(?:SCHEDULE_COLUMNS|SUMMARY_COLUMNS|classAsReadText|statusAsReadText|kelasText)\b/;
/// The print page is the same schedule as a document to print, not a screen: it takes its headings from the same lists (ruling 24), and was there before Received showed the table.
const PRINT = /opening[\\/]print[\\/]page\.tsx$/;

describe("the SR-15 table has one copy under the sourcing workspace", () => {
  const files = walk(root).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !/\.fixture\.tsx?$/.test(f));
  it("only schedule-tables.tsx names the table's columns or builds its rows", () => {
    const owner = files.filter((f) => OWN.test(f));
    expect(owner).toHaveLength(1);
    expect(lex(readFileSync(owner[0], "utf8"))).toMatch(COPY);
    const others = files.filter((f) => !OWN.test(f) && !PRINT.test(f) && COPY.test(lex(readFileSync(f, "utf8"))));
    expect(others).toEqual([]);
  });
  it("the scan finds a copy in code and not in a comment", () => {
    expect(COPY.test(lex("const c = SCHEDULE_COLUMNS.listing;"))).toBe(true);
    expect(COPY.test(lex("// SCHEDULE_COLUMNS"))).toBe(false);
  });
  it("Schedule and Received both render the shared components", () => {
    const w = readFileSync(join(root, "opening", "workspace.tsx"), "utf8");
    expect(w.match(/<ScheduleList /g)?.length).toBe(2);
    expect(w.match(/<GrandSummaryList /g)?.length).toBe(2);
  });
});
