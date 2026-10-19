import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { posixRelative, toPosix } from "@/lib/scan/files";

/**
 * Source scan (65-C1): every form field and every refusal for an effective-dated end day
 * takes its words from `effective-text.ts`, so none can go back to a bare "To" that reads
 * as if the end day were included. `effectiveTo` is exclusive on every model that has
 * it; a qualification's `validTo` is inclusive and is not scanned.
 */
const ROOT = join(__dirname, "..", "app");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [toPosix(path)] : [];
  });
}

const sources = files(ROOT).map((path) => ({ path: posixRelative(ROOT, path), text: readFileSync(path, "utf8") }));

describe("effective-dated end days on forms", () => {
  it("every end-day date field is labelled END_DAY_LABEL", () => {
    const fields = sources.flatMap(({ path, text }) =>
      [...text.matchAll(/name:\s*"(effectiveTo|endsOn)",?\s*label:\s*([^,}\n]+)/g)].map((m) => ({ path, label: m[2].trim() })),
    );
    expect(fields.length).toBeGreaterThan(8);
    expect(fields.filter((f) => f.label !== "END_DAY_LABEL")).toEqual([]);
  });

  it("every refusal on an end day names the field the same way", () => {
    const reads = sources.flatMap(({ path, text }) =>
      [...text.matchAll(/r\.date\(\s*"(effectiveTo|endsOn)",\s*([^,)]+)/g)].map((m) => ({ path, label: m[2].trim() })),
    );
    expect(reads.length).toBeGreaterThan(6);
    expect(reads.filter((r) => r.label !== "END_DAY_LABEL")).toEqual([]);
  });
});
