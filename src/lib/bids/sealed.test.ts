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

/// Each `bidEnvelope.<write>(` call with the text of its argument (to the matching parenthesis).
function envelopeWrites(text: string): string[] {
  const out: string[] = [];
  const re = /bidEnvelope\.(create|createMany|update|updateMany|upsert)\(/g;
  for (const m of text.matchAll(re)) {
    let depth = 0;
    let i = m.index! + m[0].length - 1;
    for (; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) break;
    }
    out.push(text.slice(m.index!, i + 1));
  }
  return out;
}

/// The function a match sits in: the last function declared before it.
const within = (text: string, at: number) => [...text.slice(0, at).matchAll(/export async function (\w+)|async function (\w+)|function (\w+)/g)].pop()?.slice(1).find(Boolean) ?? "(module)";

describe("no bidder is named before opening (OD-2)", () => {
  // 6.7 C-10 (ruled, flagged): the scan becomes "only openEnvelope writes an envelope's party" — the
  // one act that names a bidder, at its opening. Every other envelope write still names none.
  it("only 6.7's openEnvelope sets an envelope's party; no other write in the app or the lib does", () => {
    const writes = sources.flatMap((s) => envelopeWrites(s.text).map((w) => ({ path: s.path, w, fn: within(s.text, s.text.indexOf(w)) })));
    expect(writes.length).toBeGreaterThan(0);
    const naming = writes.filter((x) => /\bpartyId\b|\bparty\s*:/.test(x.w));
    expect(naming.map((x) => `${x.path}#${x.fn}`)).toEqual([join("src", "app", "sourcing", "[id]", "opening", "actions.ts") + "#openEnvelope"]);
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
