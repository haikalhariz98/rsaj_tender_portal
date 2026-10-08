import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BLIND_FIGURE, BLIND_NOTICE, BLIND_TEXT, bidderKey, blindReader, resolveBidderRef } from "./blind";

/**
 * A blind reading of an anonymised evaluation (product owner, 2026-10-08, ruling on log line 1751; FR-EVL-020): until the technical scoring stage is submitted, a member of the
 * evaluation team is sent no bidder name, no price and no evaluation-bidder id outside the logged reveal. Their rows carry an opaque key for each version.
 */

describe("who is read blind", () => {
  it("is a member of the evaluation team, while the version holds its bidders' identities back, and nobody else", () => {
    expect(blindReader(true, ["p1", "p2"], "p1")).toBe(true);
    expect(blindReader(true, ["p1", "p2"], "p3")).toBe(false);
    expect(blindReader(true, ["p1"], null)).toBe(false);
    // Once the technical stage is submitted (or where the version never froze the switch on) nobody is read blind.
    expect(blindReader(false, ["p1"], "p1")).toBe(false);
  });
});

describe("the opaque key", () => {
  const ids = ["cmbid0001aaaaaaaaaaaaaaaa", "cmbid0002bbbbbbbbbbbbbbbb", "cmbid0003cccccccccccccccc"];

  it("is the same every time a version is read, differs between versions, and is not the bidder's id", () => {
    const a = bidderKey("eval_1", ids[0]!);
    expect(bidderKey("eval_1", ids[0]!)).toBe(a);
    expect(bidderKey("eval_2", ids[0]!)).not.toBe(a);
    expect(bidderKey("eval_1", ids[1]!)).not.toBe(a);
    expect(a).not.toContain(ids[0]!);
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    // Nothing of the id survives in it.
    for (const id of ids) expect(bidderKey("eval_1", id)).not.toContain(id.slice(0, 8));
  });

  it("resolves back, on the server, to the bid of this version, by its key or its id", () => {
    for (const id of ids) {
      expect(resolveBidderRef("eval_1", ids, bidderKey("eval_1", id))).toBe(id);
      expect(resolveBidderRef("eval_1", ids, id)).toBe(id);
    }
  });

  it("resolves a key of another version, a made-up key and an empty one to nothing", () => {
    expect(resolveBidderRef("eval_1", ids, bidderKey("eval_2", ids[0]!))).toBeNull();
    expect(resolveBidderRef("eval_1", ids, "0123456789abcdef01234567")).toBeNull();
    expect(resolveBidderRef("eval_1", ids, "")).toBeNull();
    expect(resolveBidderRef("eval_1", [], bidderKey("eval_1", ids[0]!))).toBeNull();
  });

  it("makes no two bids of a version share a key", () => {
    const many = Array.from({ length: 200 }, (_, i) => `cmbid${String(i).padStart(4, "0")}zzzzzzzzzzzzzz`);
    expect(new Set(many.map((id) => bidderKey("eval_1", id))).size).toBe(200);
  });
});

describe("the words", () => {
  it("say what is held back and why, in plain English with no code", () => {
    expect(BLIND_NOTICE.body).toMatch(/froze anonymised scoring/);
    expect(BLIND_NOTICE.body).toMatch(/opening panel has seen the names/);
    for (const w of [BLIND_FIGURE, BLIND_TEXT, BLIND_NOTICE.title, BLIND_NOTICE.body]) expect(w).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
  });
});

describe("the Evaluation tab's view holds every name, price and bid id back from a blind reader (a scan of the view's source)", () => {
  const read = readFileSync(path.join(process.cwd(), "src", "lib", "evaluation", "read.ts"), "utf8");
  const detail = read.slice(read.indexOf("const detailOf = async () => {"), read.indexOf("const gate = gates.evaluation;"));
  const lines = detail.split("\n");

  /// (A line that asks whether the version `held` its identities back is as good: a blind reader is read so only while it does, and `shownAs` names a bid only when it does not.)
  /// Every place the detail puts a name, a registration number, a price or a bid's own id into the view: each must be conditioned on `blind` (or built from a value that is).
  const SENSITIVE = [
    /\bb\.bidderName\b/,
    /\bregistrationNo: b\.registrationNo\b/,
    /formatMoney\(b\.priceAsRead\)/,
    /formatMoney\(evaluatedPrice\(b\)\)/,
    /formatMoney\(r\.price\)/,
    /formatMoney\(recommendedPriceOf\(/,
    /formatMoney\(senFromDecimal\(rec\.price\)\)/,
    /formatMoney\(senFromDecimal\(m\.price(Before|After)\)\)/,
    /\bid: b\.id,/,
    /\bid: r\.bidder\.id,/,
    /value: b\.id,/,
    /bidder\.id \?\? null/,
  ];

  it("names no bidder, registration number, price or bid id on a line that does not ask whether the reader is blind", () => {
    const leaks = lines.map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => SENSITIVE.some((re) => re.test(l)) && !/\bblind\b|\bheld \?|keyOf|bidderOption|shownAs/.test(l));
    expect(leaks.map((x) => `${x.n}: ${x.l.trim().slice(0, 140)}`)).toEqual([]);
  });

  it("the picker options and the stage rows carry the key and not the id", () => {
    expect(detail).toMatch(/const bidderOption = \(b: BidderFacts\) => \(\{ value: keyOf\(b\.id\),/);
    expect(read).toMatch(/id: blindKey \? blindKey\(b\.id\) : b\.id,/);
    expect(detail).toMatch(/topId: \(\(id\) => \(id \? keyOf\(id\) : null\)\)\(ranked\.find/);
  });

  it("reads the reader from the tab's own gates, never from the request", () => {
    expect(read).toMatch(/const blind = blindReader\(held, e\.team\.map\(\(t\) => t\.personId\), gates\.readerPersonId\)/);
    const ws = readFileSync(path.join(process.cwd(), "src", "app", "sourcing", "[id]", "evaluation", "workspace.tsx"), "utf8");
    expect(ws).toMatch(/readerPersonId: actor\.personId \|\| null/);
  });

  it("holds back free text that may name a bidder or quote its price: minutes, letters, the reason for a negotiation, an aspect's narrative", () => {
    for (const re of [/meetingMinutes: blind && m\.minutes \? BLIND_TEXT/, /reason: blind && n\.reason \? BLIND_TEXT/, /subject: blind \? BLIND_TEXT/, /communicationContent: blind \? BLIND_TEXT/, /narrative: blind && v\?\.narrative \? BLIND_TEXT/]) expect(detail).toMatch(re);
  });
});

describe("the acts resolve the key on the server, under the lock", () => {
  const dir = path.join(process.cwd(), "src", "app", "sourcing", "[id]", "evaluation");
  const src = (f: string) => readFileSync(path.join(dir, f), "utf8");
  const SITES: [string, string][] = [
    ["actions.ts", "recordScore"],
    ["actions.ts", "recordInputs"],
    ["actions.ts", "correctPrice"],
    ["actions.ts", "assessAspect"],
    ["actions.ts", "logCommunication"],
    ["meeting-actions.ts", "openMeeting"],
    ["meeting-actions.ts", "requestNegotiation"],
    ["report-actions.ts", "formRecommendation"],
    ["stage-one-actions.ts", "tableStageOneMatter"],
  ];

  for (const [file, fn] of SITES) {
    it(`${fn} reads the form's bid as a reference and resolves it inside the lock before it is used`, () => {
      const s = src(file);
      const a = s.indexOf(`export async function ${fn}(`);
      const body = s.slice(a, s.indexOf("\n}\n", a));
      expect(body).toMatch(/const bidderRef = r\.text\("bidderId"/);
      expect(body).not.toMatch(/const bidderId = r\.text\(/);
      const resolved = body.indexOf("const bidderId = bidderIdFrom(c, bidderRef);");
      expect(resolved).toBeGreaterThan(-1);
      expect(resolved).toBeLessThan(body.search(/f\.bidders\.find|facts!\.bidders\.find|e!\.bidders\.find/));
    });
  }

  it("a shortlist's chosen bids and a stage's notes name a bid by key too", () => {
    const s = src("actions.ts");
    expect(s).toMatch(/const chosen = chosenRefs\.map\(\(x\) => bidderIdFrom\(c, x\)\);/);
    expect(s).toMatch(/\$\{bidderIdFrom\(c, k\.slice\(0, i\)\)\}\$\{k\.slice\(i\)\}/);
  });

  it("an unresolved reference becomes no bid at all, so the act answers that the bid is not in this evaluation", () => {
    const shared = src("shared.ts");
    expect(shared).toMatch(/resolveBidderRef\(c\.current\?\.id \?\? "", \(c\.facts\?\.bidders \?\? \[\]\)\.map\(\(b\) => b\.id\), supplied\) \?\? ""/);
  });
});
