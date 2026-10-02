import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dayIn, dayToDate, storedDay } from "@/lib/dates";

/**
 * Phase 2 close-out, carry 68-C5, examined: `ApprovalInstance.openedAt` is a stored day, not an
 * instant. Every act that opens a route writes the organisation's day at midnight UTC
 * (`dayToDate(today)`, or the received trail's first decision day), so `storedDay(openedAt)` — read by
 * the six decision acts and the requisition's Approval tab — is the organisation's day the route
 * opened, in every zone. Reading it as an instant with `dayIn(openedAt, timeZone)` would be wrong
 * west of UTC: midnight UTC on 2 October is 20:00 on 1 October in New York. This scan holds the
 * writers to that form, so a writer that stores the server's clock fails here first.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Each route writer, with the `openedAt` expression it writes and the definition that makes it a day. */
const WRITERS: readonly { file: string; openedAt: RegExp; day?: RegExp }[] = [
  { file: "src/app/requisitions/actions.ts", openedAt: /openedAt: today,/, day: /const today = dayToDate\(todayStr\);/ },
  { file: "src/app/awards/actions.ts", openedAt: /openedAt: on,/, day: /const on = dayToDate\(l\.org\.today!\);/ },
  { file: "src/app/sourcing/actions.ts", openedAt: /openedAt: on,/, day: /const on = dayToDate\(l\.org\.today!\);/ },
  { file: "src/app/sourcing/[id]/documents/actions.ts", openedAt: /openedAt: on,/, day: /const on = dayToDate\(l\.org\.today\);/ },
  { file: "src/app/sourcing/[id]/evaluation/meeting-actions.ts", openedAt: /openedAt: dayToDate\(l\.org\.today!\),/ },
  { file: "src/app/sourcing/[id]/window/change-actions.ts", openedAt: /openedAt: dayToDate\(l\.org\.today!\),/ },
  { file: "src/lib/integration/requisition-intake.ts", openedAt: /openedAt: dayToDate\(p\.trail\[0\]\.decidedOn\),/ },
];

/** The text of each `approvalInstance.create({ … })` call in a file. */
function createCalls(src: string): string[] {
  const out: string[] = [];
  for (let i = src.indexOf("approvalInstance.create("); i >= 0; i = src.indexOf("approvalInstance.create(", i + 1)) {
    let depth = 0;
    let j = src.indexOf("(", i);
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")" && --depth === 0) break;
    }
    out.push(src.slice(i, j + 1));
  }
  return out;
}

describe("a route's opened day is stored as a day (68-C5, examined)", () => {
  it("every route writer stores the organisation's day at midnight UTC, never the server's clock", () => {
    for (const w of WRITERS) {
      const src = read(w.file);
      const calls = createCalls(src).filter((c) => /openedAt:/.test(c));
      expect(calls.length, w.file).toBeGreaterThan(0);
      for (const c of calls) {
        expect(c, w.file).toMatch(w.openedAt);
        expect(c, w.file).not.toMatch(/openedAt: (now|new Date\(\))/);
      }
      if (w.day) {
        // The variable written is the day, defined before the create and not reassigned.
        const at = src.indexOf(calls[0]);
        const defs = [...src.slice(0, at).matchAll(new RegExp(w.day.source, "g"))];
        expect(defs.length, w.file).toBeGreaterThan(0);
      }
    }
  });

  it("a successor route opens on the organisation's day too", () => {
    // openSuccessor writes the openedAt it is given; each caller gives the organisation's day.
    expect(createCalls(read("src/lib/approvals/rejection-store.ts")).join("")).toMatch(/\bopenedAt,/);
    for (const f of ["src/app/requisitions/actions.ts", "src/app/awards/actions.ts", "src/app/sourcing/actions.ts"]) {
      const calls = [...read(f).matchAll(/openSuccessor\([^;]*\);/g)].map((m) => m[0]);
      expect(calls.length, f).toBeGreaterThan(0);
      for (const c of calls) expect(c, f).toMatch(/dayToDate\((today!|l\.org\.today!)\)\);$/);
    }
  });

  it("no other file opens a route, so the list above is every writer", () => {
    const known = new Set([...WRITERS.map((w) => w.file), "src/lib/approvals/rejection-store.ts"]);
    const walk = (dir: string): string[] =>
      readdirSync(join(process.cwd(), dir)).flatMap((f) => {
        const p = `${dir}/${f}`;
        if (statSync(join(process.cwd(), p)).isDirectory()) return f === "generated" ? [] : walk(p);
        return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
      });
    const files = walk("src").filter((f) => read(f).includes("approvalInstance.create("));
    expect(new Set(files)).toEqual(known);
  });

  it("so storedDay reads the opened day in every zone, where dayIn would move it a day west of UTC", () => {
    const openedAt = dayToDate("2026-10-02"); // as written by an act on 2 October, organisation's day
    expect(storedDay(openedAt)).toBe("2026-10-02");
    expect(dayIn(openedAt, "Asia/Kuala_Lumpur")).toBe("2026-10-02");
    expect(dayIn(openedAt, "America/New_York")).toBe("2026-10-01");
  });

  it("the six decision acts and the Approval tab read it with storedDay", () => {
    const readers: [string, number][] = [
      ["src/app/requisitions/actions.ts", 2],
      ["src/app/requisitions/[id]/page.tsx", 1],
      ["src/app/awards/actions.ts", 3],
      ["src/app/sourcing/actions.ts", 2],
      ["src/app/sourcing/[id]/evaluation/meeting-actions.ts", 1],
      ["src/app/sourcing/[id]/window/change-actions.ts", 1],
      ["src/app/sourcing/[id]/documents/actions.ts", 1],
    ];
    for (const [f, n] of readers) {
      const src = read(f);
      expect((src.match(/storedDay\(\w+\.openedAt\)/g) ?? []).length, f).toBe(n);
      expect(src, f).not.toMatch(/dayIn\(\w+\.openedAt/);
    }
  });
});
