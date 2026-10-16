import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * Ruling 20bn: the demonstration's online exercise is made through the product's own judges and sealing code, never by setting rows they would refuse. A source scan of the loader, with a
 * self-test: it imports each named function from the product (a path under src/lib) and calls it in code, and it publishes through the product's own `publishWindow`.
 */
const root = process.cwd();
const source = readFileSync(join(root, "prisma", "demo-online.ts"), "utf8");
const code = lex(source);

const JUDGES: Readonly<Record<string, string>> = {
  submitFaults: "../src/lib/bids/online/submission",
  uploadGateFaults: "../src/lib/bids/online/parts",
  attributionFaults: "../src/lib/auth/attribution",
  passphraseFaults: "../src/lib/sealing/ceremony",
  shareFaults: "../src/lib/sealing/share",
  sealSubmission: "../src/lib/sealing/bid-seal",
  sealFile: "../src/lib/sealing/file-seal",
  makeOfficerKey: "../src/lib/sealing/ceremony-seal",
};

describe("the demo's online exercise goes through the product's judges and sealing (20bn)", () => {
  it.each(Object.entries(JUDGES))("%s is imported from %s and called in code", (name, from) => {
    const imp = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"${from.replace(/[./]/g, "\\$&")}"`);
    expect(imp.test(source), `${name} import`).toBe(true);
    expect(new RegExp(`(?<![\\w.])${name}\\s*\\(`).test(code), `${name} call`).toBe(true);
  });

  it("the window is published by the product's own publishWindow", () => {
    expect(source).toMatch(/import\("\.\.\/src\/app\/sourcing\/\[id\]\/window\/actions"\)/);
    expect(/\bWn\.publishWindow\b/.test(code)).toBe(true);
  });

  it("the scan reads code only: a name in a comment does not count", () => {
    expect(/(?<![\w.])submitFaults\s*\(/.test(lex("// submitFaults(x)\nconst a = 1;"))).toBe(false);
  });
});
