import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * Ruling 25 (wave 3c step 1): a bidder is never told the opening's verdict on its own bid. So no module of the supplier's side (src/app/supplier, src/lib/portal, src/lib/bids/online)
 * reads `OpenedBid.verdict` (or `verdictReason`). Other verdicts (eligibility, a form token) are different things and are not scanned: the scan looks only at files that touch the opened bid.
 * A relation read of the opened bid with no `select` would carry the verdict without naming it, so that is refused too.
 */
const root = process.cwd();
const posix = (p: string) => relative(root, p).split(sep).join("/");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const SCOPE = ["src/app/supplier", "src/lib/portal", "src/lib/bids/online"];

const touchesOpenedBid = (code: string) => /\bopenedBids?\b|\bOpenedBid\b/.test(code);
const readsVerdict = (code: string) => /\bverdict(Reason)?\b/.test(code);
const wholeRelation = (code: string) => /\bopenedBids?\s*:\s*true\b/.test(code);
/// An `openedBid.findMany({...})` style read with neither `select` nor a column list is not caught by text alone, so a call is checked for a `select` within its argument.
const unselectedCall = (code: string) => [...code.matchAll(/\bopenedBid\.(?:findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow)\s*\(/g)].some((m) => !/\bselect\b/.test(code.slice(m.index!, m.index! + 600)));

describe("ruling 25: the supplier's side never reads the opening's verdict on a bid", () => {
  const sources = SCOPE.flatMap((d) => files(join(root, d))).map((p) => ({ path: posix(p), code: lex(readFileSync(p, "utf8")) }));
  const touching = sources.filter((s) => touchesOpenedBid(s.code));

  it("the scan reaches the supplier's side", () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(touching.length).toBeGreaterThan(0);
  });

  it("no file that touches the opened bid names its verdict", () => {
    expect(touching.filter((s) => readsVerdict(s.code)).map((s) => s.path)).toEqual([]);
  });

  it("no file reads the opened bid whole, by relation or by an unselected query", () => {
    expect(touching.filter((s) => wholeRelation(s.code) || unselectedCall(s.code)).map((s) => s.path)).toEqual([]);
  });

  it("the matchers fail bad samples (and pass a good one)", () => {
    expect(readsVerdict(lex("const v = ob.verdict;"))).toBe(true);
    expect(readsVerdict(lex("const v = ob.verdictReason;"))).toBe(true);
    expect(readsVerdict(lex("// the verdict is not read\nconst a = 1;"))).toBe(false);
    expect(wholeRelation(lex("include: { openedBid: true }"))).toBe(true);
    expect(wholeRelation(lex("include: { openedBids: { select: { listingNo: true } } }"))).toBe(false);
    expect(unselectedCall(lex("await tx.openedBid.findMany({ where: { exerciseId } })"))).toBe(true);
    expect(unselectedCall(lex("await tx.openedBid.findMany({ where: { exerciseId }, select: { listingNo: true } })"))).toBe(false);
    expect(touchesOpenedBid(lex("tx.openedBid.count()"))).toBe(true);
  });
});
