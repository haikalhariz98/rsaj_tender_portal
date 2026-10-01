import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { SITTING_TABLED_MATTER_KINDS } from "@/lib/committee/labels";

/**
 * 62-C1 / BD-62-28: a SCOPE matter is judged under the committee of its sitting and the act
 * written on it, read as the rule it was tabled under, with no separate "rule at tabling"
 * column. That holds only while (1) `tableScope` is the one application writer of a SCOPE
 * matter, and it writes the act it read from the method's configuration under the lock,
 * after `scopeCitationFault` refused any other committee or act; (2) nothing rewrites a
 * matter's act afterwards; (3) nothing moves a sitting to another committee. A scan of the
 * application source (`src/`), in the accepted-writer.test.ts style: it fails if any of the
 * three stops being true, and then the column has to be decided again.
 *
 * Out of scope, deliberately: `prisma/demo-scope.ts` inserts demo_d40 as it stands, and its
 * load self-check passes d40's stored act through `scopeCitationFault` against the demo
 * configuration. Tests and the generated client are skipped.
 */

const ROOT = process.cwd();
const OWNER = "src/app/sourcing/[id]/scope/actions.ts";

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (relative(ROOT, p).replace(/\\/g, "/") === "src/generated") continue;
      out.push(...sources(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(relative(ROOT, p).replace(/\\/g, "/"));
    }
  }
  return out;
}

const FILES = sources(join(ROOT, "src"));
const text = (f: string) => readFileSync(join(ROOT, f), "utf8");

/// Every `<client>.<model>.<write>(...)` call in a file, with its whole argument text.
function writes(src: string, model: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\.${model}\\.(update|updateMany|upsert|create|createMany)\\(`, "g");
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
    }
    out.push(src.slice(m.index, i));
  }
  return out;
}

const dataOf = (w: string) => w.slice(Math.max(0, w.search(/\bdata\s*:/)));

describe("a scope matter's committee and act are the rule it was tabled under (62-C1, BD-62-28)", () => {
  it("the scan reads the application source", () => {
    expect(FILES).toContain(OWNER);
    expect(FILES).toContain("src/app/committees/actions.ts");
    expect(FILES.some((f) => f.startsWith("src/generated/"))).toBe(false);
  });

  it("tableScope is the one writer of a SCOPE matter, and writes the configured act it judged", () => {
    const writers = FILES.filter((f) => writes(text(f), "committeeDecision").some((w) => /\bbqVersionId\b|["'`]SCOPE["'`]/.test(dataOf(w))));
    expect(writers).toEqual([OWNER]);
    const src = text(OWNER);
    const fn = src.slice(src.indexOf("export async function tableScope("));
    const body = fn.slice(0, fn.indexOf("\nexport async function ", 1));
    const created = writes(body, "committeeDecision");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatch(/matterKind:\s*"SCOPE"/);
    expect(created[0]).toMatch(/\bbqVersionId:\s*version\.id\b/);
    // The act written is the one read from configuration under the lock, and judged.
    expect(body).toMatch(/const act = rules\.method\?\.scopeAct \?\? null;/);
    expect(created[0]).toMatch(/[{,]\s*act\s*,/);
    expect(body).toMatch(/scopeCitationFault\(\{[\s\S]*?\bact,\s*\n/);
    expect(body).toMatch(/if \(blocking\(faults\)\.length \|\| !act\) return refuse\(faults\);/);
  });

  it("a sitting does not table a SCOPE matter: its kinds leave it out", () => {
    expect(SITTING_TABLED_MATTER_KINDS).not.toContain("SCOPE");
  });

  it.each(FILES)("%s never rewrites a matter's act, nor moves a sitting to another committee", (file) => {
    const src = text(file);
    for (const w of writes(src, "committeeDecision").filter((x) => /\.(update|updateMany|upsert)\(/.test(x))) {
      expect(dataOf(w), `${file} rewrites a matter's act`).not.toMatch(/\bact\s*[:,}]/);
    }
    for (const w of writes(src, "meeting").filter((x) => /\.(update|updateMany|upsert)\(/.test(x))) {
      expect(dataOf(w), `${file} moves a sitting to another committee`).not.toMatch(/\bcommittee(Id)?\s*[:,}]/);
    }
  });
});
