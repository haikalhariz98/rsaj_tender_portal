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

/** Each route writer, with the `openedAt` expression it writes (openedAtFaults judges where it comes from). */
const WRITERS: readonly { file: string; openedAt: RegExp }[] = [
  { file: "src/app/requisitions/actions.ts", openedAt: /openedAt: today,/ },
  { file: "src/app/awards/actions.ts", openedAt: /openedAt: on,/ },
  { file: "src/app/sourcing/actions.ts", openedAt: /openedAt: on,/ },
  { file: "src/app/sourcing/[id]/documents/actions.ts", openedAt: /openedAt: on,/ },
  { file: "src/app/sourcing/[id]/evaluation/meeting-actions.ts", openedAt: /openedAt: dayToDate\(l\.org\.today!\),/ },
  { file: "src/app/sourcing/[id]/window/change-actions.ts", openedAt: /openedAt: dayToDate\(l\.org\.today!\),/ },
  { file: "src/lib/integration/requisition-intake.ts", openedAt: /openedAt: dayToDate\(p\.trail\[0\]\.decidedOn\),/ },
  // 6.15 (faithful update, flagged: the scan's own list of writers): a supplier's registration route.
  { file: "src/app/suppliers/actions.ts", openedAt: /openedAt: dayToDate\(today\),/ },
  // 6.15a (faithful update, flagged: the scan's own list of writers): a blacklisting's and a special permission's route.
  { file: "src/app/suppliers/routes.ts", openedAt: /openedAt: dayToDate\(today\),/ },
  // 6.13 Part A step 3 (faithful update, flagged: the scan's own list of writers): a certificate's route (614-C4).
  { file: "src/lib/certificate/route-write.ts", openedAt: /openedAt: on,/ },
  // 6.13 Part A step 4 (faithful update, flagged: the scan's own list of writers): a variation's route (614-C4).
  { file: "src/lib/variation/route-write.ts", openedAt: /openedAt: on,/ },
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

/**
 * Why each create's openedAt is (not) a day, judged inside the function that creates the route: written
 * as dayToDate(…) directly, or as a variable that function defines as `const x = dayToDate(…)` and never
 * reassigns. A definition in another function of the same file does not count (residual 3).
 */
function openedAtFaults(src: string): string[] {
  const faults: string[] = [];
  for (let i = src.indexOf("approvalInstance.create("); i >= 0; i = src.indexOf("approvalInstance.create(", i + 1)) {
    const call = createCalls(src.slice(i))[0];
    const m = /openedAt: ([^,}\n]+)/.exec(call);
    if (!m) continue;
    const expr = m[1].trim();
    if (/^dayToDate\(/.test(expr)) continue;
    const fnStarts = [...src.slice(0, i).matchAll(/(?:^|\n)(?:export )?(?:async )?function \w+/g)];
    const body = src.slice(fnStarts.length ? fnStarts[fnStarts.length - 1].index! : 0, i);
    if (!/^[A-Za-z_]\w*$/.test(expr)) { faults.push(`openedAt: ${expr}`); continue; }
    const defs = [...body.matchAll(new RegExp(`\\b(?:const|let|var) ${expr}\\b\\s*=\\s*([^;\\n]+)`, "g"))];
    const reassigned = new RegExp(`(?<!(?:const|let|var) )\\b${expr}\\s*=(?!=)`).test(body);
    if (defs.length !== 1 || !/^dayToDate\(/.test(defs[0][1].trim()) || /^(?:let|var)/.test(defs[0][0]) || reassigned) faults.push(`openedAt: ${expr} (${defs.map((d) => d[0]).join("; ") || "not defined in the creating function"})`);
  }
  return faults;
}

describe("a route's opened day is stored as a day (68-C5, examined)", () => {
  it("every route writer stores the organisation's day at midnight UTC, judged in the creating function", () => {
    for (const w of WRITERS) {
      const src = read(w.file);
      const calls = createCalls(src).filter((c) => /openedAt:/.test(c));
      expect(calls.length, w.file).toBeGreaterThan(0);
      for (const c of calls) expect(c, w.file).toMatch(w.openedAt);
      expect(openedAtFaults(src), w.file).toEqual([]);
    }
  });

  it("the check fails a new Date() in one function even where another function defines the variable as a day (self-test)", () => {
    const good = "export async function a() {\n  const on = dayToDate(l.org.today!);\n  await tx.approvalInstance.create({ data: { openedAt: on, status: \"PENDING\" } });\n}\n";
    const bad = "export async function b() {\n  const on = new Date();\n  await tx.approvalInstance.create({ data: { openedAt: on, status: \"PENDING\" } });\n}\n";
    const undefinedHere = "export async function c() {\n  await tx.approvalInstance.create({ data: { openedAt: on } });\n}\n";
    const reassigned = "export async function d() {\n  const on = dayToDate(t);\n  on = new Date();\n  await tx.approvalInstance.create({ data: { openedAt: on } });\n}\n";
    expect(openedAtFaults(good)).toEqual([]);
    expect(openedAtFaults(good + bad)).toHaveLength(1);
    expect(openedAtFaults(good + undefinedHere)).toHaveLength(1);
    expect(openedAtFaults(reassigned)).toHaveLength(1);
    expect(openedAtFaults("function e() {\n  tx.approvalInstance.create({ data: { openedAt: new Date() } });\n}\n")).toEqual(["openedAt: new Date()"]);
    expect(openedAtFaults("function f() {\n  tx.approvalInstance.create({ data: { openedAt: dayToDate(x) } });\n}\n")).toEqual([]);
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
