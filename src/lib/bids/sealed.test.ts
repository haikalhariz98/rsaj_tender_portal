import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ADR 0016 (6.6 OD-1, OD-2): the register records envelopes, never offers, and names no bidder
 * before opening. Three scans keep it so:
 * - the register's models carry no price, sum, period, score or content column;
 * - no code but 6.7's `openEnvelope` writes an envelope's party (OD-2; 6.7 C-10 names the one writer);
 * - no code deletes an envelope (FR-BID-003: never deleted, rejected or set aside), and the bids
 *   screens offer no Delete or Reject.
 */

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const modelBody = (name: string) => {
  const m = new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!m) throw new Error(`model ${name} not found`);
  return m[1];
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const sources = [...files(join(root, "src", "app")), ...files(join(root, "src", "lib"))].map((p) => ({ path: relative(root, p), text: readFileSync(p, "utf8") }));

describe("the register holds no offer (ADR 0016)", () => {
  it.each(["BidEnvelope", "BidWithdrawal", "BoxEvent", "ValidityExtension"])("%s has no money, price, sum, period, score or content column", (model) => {
    const fields = modelBody(model)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\w+\s+\w/.test(l) && !l.startsWith("//") && !l.startsWith("@@"));
    expect(fields.filter((l) => /\bDecimal\b|BigInt|Bytes/.test(l))).toEqual([]);
    expect(fields.map((l) => l.split(/\s+/)[0]).filter((n) => /price|amount|sum|value|period|score|content|figure|total/i.test(n))).toEqual([]);
  });
});

/// Each `bidEnvelope.<write>(` call with the text of its argument (to the matching parenthesis), and where it is.
function envelopeWrites(text: string): { w: string; at: number }[] {
  const out: { w: string; at: number }[] = [];
  const re = /bidEnvelope\.(create|createMany|update|updateMany|upsert)\(/g;
  for (const m of text.matchAll(re)) {
    let depth = 0;
    let i = m.index! + m[0].length - 1;
    for (; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) break;
    }
    out.push({ w: text.slice(m.index!, i + 1), at: m.index! });
  }
  return out;
}

/// Every named function declared in a file (`function f(`, `async function f(`, and `const f = (…) =>` or
/// `async (…) =>` with a block body), with the span of its body from its opening brace to the
/// matching closing one.
function functionSpans(text: string): { name: string; from: number; to: number }[] {
  const out: { name: string; from: number; to: number }[] = [];
  const re = /(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  for (const m of text.matchAll(re)) {
    // Past the parameters (to their matching parenthesis), then to the body's opening brace.
    let i = m.index! + m[0].length - 1;
    let depth = 0;
    for (; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) break;
    }
    // The body: the first "{" that ends a line (a return-type literal stays on the signature's line), or "=> {".
    const rest = text.slice(i + 1);
    const arrow = /^\s*(?::[^=]*?)?=>\s*\{/.exec(rest);
    const block = /^[^;{]*?\{\s*\n/.exec(rest);
    const open = arrow ? i + 1 + arrow[0].lastIndexOf("{") : block ? i + 1 + block[0].lastIndexOf("{") : -1;
    if (open < 0) continue;
    let d = 0;
    let j = open;
    for (; j < text.length; j++) {
      if (text[j] === "{") d++;
      else if (text[j] === "}" && --d === 0) break;
    }
    out.push({ name: m[1] ?? m[2], from: open, to: j });
  }
  return out;
}

/// The function a write sits in: the innermost declared function whose body encloses it (6.7 review R-7: not the last one declared before it).
const within = (text: string, at: number) =>
  functionSpans(text)
    .filter((f) => f.from < at && at < f.to)
    .sort((a, b) => b.from - a.from)[0]?.name ?? "(module)";

describe("no bidder is named before opening (OD-2)", () => {
  // 6.7 C-10 (ruled, flagged): the scan becomes "only openEnvelope writes an envelope's party" — the
  // one act that names a bidder, at its opening. Every other envelope write still names none.
  it("only 6.7's openEnvelope sets an envelope's party; no other write in the app or the lib does", () => {
    // Each occurrence is attributed where it is (6.7 review R-7: two identical writes in two functions are two writes).
    const writes = sources.flatMap((s) => envelopeWrites(s.text).map(({ w, at }) => ({ path: s.path, w, fn: within(s.text, at) })));
    expect(writes.length).toBeGreaterThan(0);
    const naming = writes.filter((x) => /\bpartyId\b|\bparty\s*:/.test(x.w));
    expect(naming.map((x) => `${x.path}#${x.fn}`)).toEqual([join("src", "app", "sourcing", "[id]", "opening", "actions.ts") + "#openEnvelope"]);
  });
});

describe("the scan attributes a write to the function that encloses it (6.7 review R-7)", () => {
  const sample = [
    "export async function openEnvelope(_prev: FormState, data: FormData): Promise<FormState> {",
    "  const helper = async (tx: Tx) => {",
    "    await tx.bidEnvelope.updateMany({ where: { id }, data: { status: \"OPENED\" } });",
    "  };",
    "  await tx.bidEnvelope.updateMany({ where: { id }, data: { status: \"OPENED\", partyId } });",
    "}",
    "function other() {",
    "  return 1;",
    "}",
    "export async function sneaky(): Promise<void> {",
    "  await tx.bidEnvelope.updateMany({ where: { id }, data: { status: \"OPENED\", partyId } });",
    "}",
  ].join("\n");
  it("each occurrence by its own position: the same write text in two functions is two writes", () => {
    const found = envelopeWrites(sample).map(({ w, at }) => ({ w, fn: within(sample, at) }));
    expect(found.map((x) => x.fn)).toEqual(["helper", "openEnvelope", "sneaky"]);
  });
  it("a write after a function has closed is not that function's", () => {
    expect(within(sample, sample.indexOf("return 1;"))).toBe("other");
    expect(within(sample, sample.lastIndexOf("await tx.bidEnvelope"))).toBe("sneaky");
  });
});

describe("an envelope is never deleted, rejected or set aside (FR-BID-003)", () => {
  it("no code deletes an envelope, a withdrawal, a box event or an extension", () => {
    const hits = sources.filter((s) => /\b(bidEnvelope|bidWithdrawal|boxEvent|validityExtension)\.(delete|deleteMany)\(/.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });
  it("the bids screens offer no Delete or Reject", () => {
    const screens = sources.filter((s) => s.path.includes(join("sourcing", "[id]", "bids")) && s.path.endsWith(".tsx"));
    expect(screens.length).toBeGreaterThan(0);
    for (const s of screens) expect(s.text, s.path).not.toMatch(/>\s*(Delete|Reject)[^<]*</);
  });
});
