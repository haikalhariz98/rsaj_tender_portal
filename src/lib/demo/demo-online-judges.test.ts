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

  // The estimate's sealed lodging is reached through dynamic destructured imports, which the static matcher above does not see.
  const LATE: Readonly<Record<string, string>> = {
    sealedLodgementFaults: "../src/lib/sealing/estimate-lodgement",
    writeSealedLodgement: "../src/lib/scope/estimate-store",
  };
  const dynamicImport = (src: string, name: string, from: string) =>
    new RegExp(String.raw`const\s*\{[^}]*\b${name}\b[^}]*\}\s*=\s*await\s+import\("${from.replace(/[./]/g, "\\$&")}"\)`).test(src);
  it.each(Object.entries(LATE))("%s is imported from %s (dynamically) and called in code", (name, from) => {
    expect(dynamicImport(source, name, from), `${name} import`).toBe(true);
    expect(new RegExp(String.raw`(?<![\w.])${name}\s*\(`).test(code), `${name} call`).toBe(true);
  });

  it("the dynamic matcher fails a sample that imports from the wrong module", () => {
    expect(dynamicImport('const { writeSealedLodgement } = await import("../src/lib/scope/estimate-store");', "writeSealedLodgement", LATE.writeSealedLodgement)).toBe(true);
    expect(dynamicImport('const { writeSealedLodgement } = await import("../src/lib/other");', "writeSealedLodgement", LATE.writeSealedLodgement)).toBe(false);
  });

  // The loader makes no cipher or key-agreement call of its own: all sealing goes through the product's functions above.
  const SEALING_PRIMITIVES = /["']\.\.\/src\/lib\/sealing\/(hpke|aead|x25519|kdf|open)["']/;
  const cryptoImports = (src: string) => [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(?:node:)?crypto"/g)].flatMap((m) => m[1].split(",").map((x) => x.trim()).filter(Boolean));
  it("imports nothing from node:crypto but randomUUID, and no sealing primitive module", () => {
    expect(cryptoImports(source)).toEqual(["randomUUID"]);
    expect(/(?:from|import\()\s*"(?:node:)?crypto/.test(source.replace(/import\s*\{[^}]*\}\s*from\s*"(?:node:)?crypto"/g, ""))).toBe(false);
    expect(SEALING_PRIMITIVES.test(source)).toBe(false);
    expect(/(?<![\w.])(createCipheriv|createDecipheriv|createECDH|randomBytes|hkdf|scrypt|pbkdf2)\w*\s*\(/.test(code)).toBe(false);
    expect(/\b(subtle|webcrypto)\b/.test(code)).toBe(false);
  });

  it("the crypto matchers fail bad samples", () => {
    expect(cryptoImports('import { randomUUID, createCipheriv } from "node:crypto";')).toEqual(["randomUUID", "createCipheriv"]);
    expect(SEALING_PRIMITIVES.test('import { hpkeSeal } from "../src/lib/sealing/hpke";')).toBe(true);
    expect(/\b(subtle|webcrypto)\b/.test(lex("crypto.subtle.encrypt(a)"))).toBe(true);
  });

  it("the scan reads code only: a name in a comment does not count", () => {
    expect(/(?<![\w.])submitFaults\s*\(/.test(lex("// submitFaults(x)\nconst a = 1;"))).toBe(false);
  });
});
