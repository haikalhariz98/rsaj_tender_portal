import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { ACTIVITY_ENTITIES } from "@/lib/dashboard/activity";

import { OPENING_ENTITIES } from "./audit-view";
import { toPosix } from "@/lib/scan/files";

/**
 * ADR 0017, C-4, FR-OPN-011 by source scan:
 * - an offer's figures are written only by the opening's own acts (openEnvelope, recordAlternative,
 *   correctAsRead);
 * - a price as read never reaches a broadcast surface: the dashboard, the sourcing and award lists,
 *   the activity feed, the audit export's screen, the requisition screens;
 * - a bid in the box is registered only at opening, and the estimate's lodgement is the only other
 *   writer of channel BOX (6.6 plan §2 as amended, C-12);
 * - every opening act but the explanation of a copy finding judges the opening's state first, so a
 *   finalised opening has no update path;
 * - only the opening's estimate helper reads the estimate's figures.
 */

const root = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [toPosix(path)] : [];
  });
}
const sources = files(join(root, "src")).map((p) => ({ path: relative(root, p), text: readFileSync(p, "utf8") }));
const ACTIONS = join("src", "app", "sourcing", "[id]", "opening", "actions.ts");
const actions = readFileSync(join(root, ACTIONS), "utf8");

/// Each call matching `re` with its argument text and the function it sits in.
function calls(text: string, re: RegExp): { text: string; fn: string }[] {
  const out: { text: string; fn: string }[] = [];
  for (const m of text.matchAll(re)) {
    let depth = 0;
    let i = m.index! + m[0].length - 1;
    for (; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) break;
    }
    const fn = [...text.slice(0, m.index!).matchAll(/export async function (\w+)|async function (\w+)|function (\w+)/g)].pop()?.slice(1).find(Boolean) ?? "(module)";
    out.push({ text: text.slice(m.index!, i + 1), fn });
  }
  return out;
}

describe("the offer is written only by the opening's acts (ADR 0017)", () => {
  it("only openEnvelope and recordAlternative create an offer, only correctAsRead changes what was read", () => {
    const creates = sources.flatMap((s) => calls(s.text, /openedBid\.(create|createMany|upsert)\(/g).map((c) => `${s.path}#${c.fn}`));
    // Wave 3b step 13 (plan 1.5f): the online unseal is the one other writer, in `commitUnseal`, and it writes the offer with its price NULL (ruling 20).
    expect(creates.sort()).toEqual([`${ACTIONS}#openEnvelope`, `${ACTIONS}#recordAlternative`, join("src", "lib", "opening", "unseal-store.ts#commitUnseal")].sort());
    const priced = sources.flatMap((s) => calls(s.text, /openedBid\.(update|updateMany)\(/g).filter((c) => /priceAsRead|completionPeriod|bidderNameAsRead/.test(c.text)).map((c) => `${s.path}#${c.fn}`));
    expect(priced).toEqual([`${ACTIONS}#correctAsRead`]);
  });
});

describe("a price as read never reaches a broadcast surface (C-4)", () => {
  // 6.14 inc 2 code review S-6 (stricter): the documents register is a broadcast surface too. app/reports/ stays (inert since
  // 6.17 was removed; kept, not weakened).
  const BROADCAST = /^src\/(app\/page\.tsx|app\/sourcing\/page\.tsx|app\/awards\/page\.tsx|app\/requisitions\/|app\/approvals\/|app\/reports\/|app\/documents\/|lib\/certificate\/register\.ts|app\/configuration\/audit\/|lib\/dashboard)/;
  it("no loader of the dashboard, the lists, the activity feed or the audit export's screen reads an offer", () => {
    const hits = sources.filter((s) => BROADCAST.test(s.path) && /openedBid|priceAsRead|openingPrice|OpenedBid/.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });
  it("the activity feed reads none of the opening's entities", () => {
    for (const e of OPENING_ENTITIES) expect(ACTIVITY_ENTITIES as readonly string[]).not.toContain(e);
  });
});

describe("the box (OD-4, C-3, C-12)", () => {
  it("channel BOX is written only by the estimate's lodgement and the opening's registration of a box envelope", () => {
    const writers = sources.flatMap((s) => calls(s.text, /bidEnvelope\.(create|createMany|update|updateMany|upsert)\(/g).filter((c) => /channel:\s*"BOX"/.test(c.text)).map((c) => `${s.path}#${c.fn}`));
    expect(writers.sort()).toEqual([`${ACTIONS}#registerBoxEnvelope`, `${join("src", "lib", "bids", "lodgement.ts")}#recordEstimateLodgement`].sort());
  });
  it("BOX_AT_OPENING is written only at opening", () => {
    const hits = sources.filter((s) => /receivedSource:\s*"BOX_AT_OPENING"|boxEnvelopeJudgement\(/.test(s.text)).map((s) => s.path);
    expect(hits.sort()).toEqual([ACTIONS, join("src", "lib", "opening", "box.ts")].sort());
  });
});

describe("a finalised opening has no update path (FR-OPN-011)", () => {
  it("every act on an opening judges its state first; only the copy explanation is taken once finalised", () => {
    const acts = [...actions.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    expect(acts.length).toBeGreaterThan(15);
    const body = (fn: string) => {
      const at = actions.indexOf(`export async function ${fn}(`);
      const next = actions.indexOf("\nexport async function ", at + 10);
      return actions.slice(at, next === -1 ? undefined : next);
    };
    const starts = ["startOpening", "startSupplementaryOpening"];
    const afterFinalising = ["recordCopyExplanation"];
    const sittingDelegates = ["adjournOpening", "resumeOpening"];
    // Step 15: the finalise judges the state in `finalise-transaction.ts`, which the paper and the online finalise share; the act itself only hands the transaction over.
    const finaliseDelegates = ["finaliseOpening"];
    for (const fn of acts.filter((a) => ![...starts, ...afterFinalising, ...sittingDelegates, ...finaliseDelegates].includes(a))) expect(body(fn), fn).toMatch(/stateOf\(o, l\.ex\.status\)/);
    expect(body("finaliseOpening")).toMatch(/finaliseInTransaction\(tx, l, c,/);
    expect(readFileSync("src/app/sourcing/[id]/opening/finalise-transaction.ts", "utf8")).toMatch(/const state = stateOf\(o, l\.ex\.status\)/);
    expect(actions).toMatch(/async function sittingAct[\s\S]*adjournFaults\(\{ state,/);
    expect(body("recordCopyExplanation")).toMatch(/explanationFaults\(\{ finalised: !!o\.finalisedAt/);
  });
});

describe("the estimate's figure (ADR 0012)", () => {
  it("only the opening's estimate helper reads it, and nothing in src/app", () => {
    expect(sources.filter((s) => /\breadSealedFigures\(/.test(s.text)).map((s) => s.path).sort()).toEqual([join("src", "lib", "opening", "estimate.ts"), join("src", "lib", "scope", "estimate-store.ts")].sort());
  });
});
