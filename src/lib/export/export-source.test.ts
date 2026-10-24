import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every list export route (ST-11, plan 7.5): asks who is signed in, refuses a request another site started, reaches rows only through a `rows.ts`
 * builder with `forExport: true` (so no SULIT column is built), and writes its audit entry through the shared `recordListExport`.
 */
const APP = path.join(process.cwd(), "src", "app");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const routes = walk(APP).filter((f) => f.split(path.sep).slice(-2).join("/") === "export/route.ts");

describe("the list export routes", () => {
  it("finds them", () => {
    expect(routes.length).toBeGreaterThanOrEqual(2);
  });
  for (const file of routes) {
    const src = readFileSync(file, "utf8");
    const name = path.relative(APP, file).split(path.sep).join("/");
    it(`${name} asks the guard, refuses cross-site, builds rows for export only, and records the export`, () => {
      expect(src).toMatch(/export async function GET\(req: Request\) \{\s*const guard = await staffRoute\(\);/);
      expect(src).toContain("downloadRequestFault(");
      expect(src).toMatch(/\{ forExport: true \}/);
      expect(src).not.toMatch(/forExport: false/);
      expect(src).toContain("recordListExport(");
      // The file is built before the entry is written, and the entry before the file is returned.
      expect(src.indexOf("listToXlsx(")).toBeLessThan(src.indexOf("recordListExport("));
      expect(src.indexOf("recordListExport(")).toBeLessThan(src.indexOf("return xlsxResponse("));
      expect(src).toMatch(/export async function HEAD\(\)/);
    });
  }
});
