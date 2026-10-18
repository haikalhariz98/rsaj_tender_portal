import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AC-23 (wave C step C9): after the case list and the redirects, nothing builds an `/awards` address of its own. Every link to an
 * award goes through `caseHref` (src/lib/contract/links.ts). The three places that may still name `/awards` are the redirect pages
 * (src/app/awards/page.tsx, [id]/page.tsx, new/page.tsx, which are the old addresses themselves), the print views (their URLs are
 * kept, ADR 0008) and `/configuration/awards`.
 *
 * The scan reads each source file with its comments removed and looks for a string or template literal that starts with `/awards`
 * (or is a PageProps route type for it). Import paths (`@/app/awards/...`) and file paths in tests do not start with a slash after
 * a quote, so they do not match.
 */

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === "generated") continue;
      out.push(...walk(p));
    } else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

/// Block and line comments removed (a `//` inside a string such as a URL is kept, as only a `//` at the start of a line or after whitespace opens one).
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

const LITERAL = /["'`]\/awards(?:[/?"'`]|\$\{)/g;

const ALLOWED_FILES = [
  "src/app/awards/page.tsx",
  "src/app/awards/new/page.tsx",
  "src/app/awards/[id]/page.tsx",
];
/// A print view's address is kept (the instrument panel links to it).
const isPrintLiteral = (line: string) => /\/awards\/[^"'`]*\/print\//.test(line);

describe("no code builds an /awards address (AC-23)", () => {
  const files = walk(join(ROOT, "src")).concat(walk(join(ROOT, "scripts")));
  it("finds no /awards literal outside the redirect pages, the print pages and the print links", () => {
    const hits: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f).split(sep).join("/");
      if (ALLOWED_FILES.includes(rel) || rel.startsWith("src/app/awards/[id]/print/")) continue;
      // Tests may name an old address to prove it still works.
      if (/\.test\.tsx?$/.test(rel)) continue;
      const lines = stripComments(readFileSync(f, "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (LITERAL.test(line) && !isPrintLiteral(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        LITERAL.lastIndex = 0;
      });
    }
    expect(hits).toEqual([]);
  });
  it("the redirect pages are the only pages left under /awards besides the print views", () => {
    const pages = walk(join(ROOT, "src/app/awards"))
      .map((f) => relative(ROOT, f).split(sep).join("/"))
      .filter((f) => /\/(page|route)\.tsx?$/.test(f))
      .sort();
    expect(pages).toEqual(["src/app/awards/[id]/page.tsx", "src/app/awards/[id]/print/[kind]/page.tsx", "src/app/awards/new/page.tsx", "src/app/awards/page.tsx"]);
  });
  it("the old pages redirect or refuse, and render no award of their own", () => {
    for (const f of ALLOWED_FILES) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src, f).toContain("redirect(");
      expect(src, f).toContain("requireStaff");
      expect(src, f).not.toContain("loadAward(");
    }
    expect(readFileSync(join(ROOT, "src/app/awards/[id]/page.tsx"), "utf8")).toContain("oldAwardTarget");
  });
});
