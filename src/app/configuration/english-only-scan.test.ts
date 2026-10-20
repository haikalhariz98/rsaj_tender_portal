import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Founder, 2026-10-19: English only on every screen. A Configuration editor never asks for a Malay value: a field named `...Ms` is a hidden field that carries the
 * stored value through the save, never a text input (`english-only-save.db.test.ts` holds the save to that). The exceptions are document content, held pending the
 * founder's decision, and each is named here with its reason.
 */

const HERE = __dirname;
const HELD: Record<string, string> = {
  "awards/editors.tsx": "award letter recipients: issued-document content",
  "contracts/editors.tsx": "contract copy stamp, parts and recipients: issued-document content",
  "templates/": "document templates build Malay as document content",
  "tender-documents/conditions-editors.tsx#bodyMs": "tender condition wording cited by Malay templates",
  "tender-documents/editors.tsx#restrictionStampTextMs": "stamp printed on restricted tender documents",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /editors\.tsx$/.test(n) ? [p] : [];
  });
}

describe("Configuration editors are English only", () => {
  it("every Malay field outside the held list is hidden, not asked for", () => {
    const asked: string[] = [];
    for (const f of files(HERE)) {
      const rel = relative(HERE, f).split(sep).join("/");
      if (Object.keys(HELD).some((h) => !h.includes("#") && rel.startsWith(h))) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/kind: "(\w+)",\s*name: "(\w+Ms)"/g)) {
        if (m[1] === "hidden") continue;
        if (HELD[`${rel}#${m[2]}`] || HELD[rel]) continue;
        asked.push(`${rel}: ${m[2]}`);
      }
    }
    expect(asked).toEqual([]);
  });
});
