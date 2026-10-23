import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The browser tab names the screen (SP-20): every page sets `metadata.title` or `generateMetadata`. A page that only redirects renders nothing, so it has no title to set.
const APP = join(process.cwd(), "src", "app");
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? pages(p) : n === "page.tsx" ? [p] : [];
  });
}

describe("every page names its tab", () => {
  it("has a metadata title or generateMetadata", () => {
    const missing = pages(APP)
      .map((p) => ({ p: p.slice(APP.length + 1).replaceAll("\\", "/"), s: readFileSync(p, "utf8") }))
      .filter(({ s }) => !/export (const metadata|async function generateMetadata|function generateMetadata)/.test(s) && !(/redirect\(/i.test(s) && !s.includes("<PageHeader")))
      .map(({ p }) => p);
    expect(missing).toEqual([]);
  });
});
