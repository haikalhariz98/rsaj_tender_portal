import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Ruling 4 (product owner, 2026-10-06): the Results demo fixture. One new advertised quotation taken to an issued
 * award through the product's own issue act, never touching demo_aw7 / demo_sx16 and never setting
 * AwardPolicy.publishAwardedValue; added to a loaded database by `demo:results` without a wipe, and run last by
 * `demo:load`. A source scan of the loader, so its ids stay its own and its guard stays in place.
 */

const dir = join(process.cwd(), "prisma");
const src = readFileSync(join(dir, "demo-results.ts"), "utf8");
/// The loader without its comments (which name what it leaves alone).
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const demo = readFileSync(join(dir, "demo.ts"), "utf8");
const acts = readFileSync(join(dir, "demo-acts.ts"), "utf8");
const lifecycle = readFileSync(join(dir, "demo-lifecycle.ts"), "utf8");
const others = readdirSync(dir).filter((f) => /^demo.*\.ts$/.test(f) && f !== "demo-results.ts").map((f) => readFileSync(join(dir, f), "utf8"));
const numbers = (text: string, re: RegExp) => [...new Set([...text.matchAll(re)].map((m) => Number(m[1])))].sort((a, b) => a - b);

describe("its ids are its own", () => {
  it("its new exercise is demo_sx30 and its requisition demo_rq50", () => {
    expect(src).toMatch(/RESULTS_EXERCISE = `\$\{P\}sx30`/);
    expect(src).toMatch(/const RQ = `\$\{P\}rq50`/);
  });
  it("its hand-written routes are demo_ai160 and demo_ai161, outside the acts' claimed demo_ai131–159", () => {
    expect(numbers(src, /\$\{P\}ai(\d+)`/g)).toEqual([160, 161]);
    expect(acts).toMatch(/ApprovalInstance: \{ prefix: "ai", from: 131, to: 159 \}/);
  });
  it("no other demo module writes an id in its range", () => {
    const mine = /\$\{P\}(sx30|rq50|ai16[01]|tpk30|win30|op30|evl30|box30|bm80|pub30_|pty3[0-2]|env3[0-2]|ob3[0-2]|sale3[0-2]|en50|bk50|sp50|rs50_|rsau|rsdoc)\b/;
    for (const text of others) expect(text).not.toMatch(mine);
    // Its documents start at demo_doc200, above every number another module counts from.
    expect(src).toMatch(/let doc = 200;/);
    for (const text of others) expect(numbers(text, /let doc = (\d+);/g).every((n) => n < 200)).toBe(true);
  });
  it("its references are drawn from the series, never typed", () => {
    expect(src).toMatch(/issueReference\(tx as never, organisationId, "requisition"/);
    expect(src).toMatch(/issueReference\(tx as never, organisationId, "exercise"/);
    expect(src).not.toMatch(/DEMO\/(SX|REQ|AWD)\/\d{4}/);
  });
  it("the acts continue every id series after what the database holds, before the first act", () => {
    expect(acts).toMatch(/export async function seedActIds/);
    const seeded = src.indexOf("await seedActIds(db);");
    expect(seeded).toBeGreaterThan(-1);
    expect(seeded).toBeLessThan(src.indexOf("await act("));
  });
  it("every model the award's acts create has a demo sub-prefix", () => {
    for (const m of ["Award", "Contract", "CaseOwnershipEvent", "AwardDistribution", "AwardDocument", "AwardReturn"]) expect(acts).toMatch(new RegExp(`\\n  ${m}: "[a-z]{3}",`));
    const prefixes = [...acts.matchAll(/^ {2}\w+: "([a-z]{3})",$/gm)].map((m) => m[1]);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe("what it leaves alone", () => {
  it("never names demo_aw7 or demo_sx16", () => {
    expect(code).not.toMatch(/aw7|sx16|APPENDIX_AWARD/);
  });
  it("never writes whether the awarded value is published", () => {
    // Read only, in the check: the page shows no value unless the organisation chose to publish it.
    expect(src.match(/publishAwardedValue/g)?.length).toBe(src.match(/select: \{ publishAwardedValue: true \}|publishAwardedValue !== true|AwardPolicy\.publishAwardedValue/g)?.length);
    expect(src).not.toMatch(/awardPolicy\.(update|upsert|create)/);
  });
  it("every value it configures is ASSUMED", () => {
    expect(src).not.toMatch(/provenance: "(STATED|OBSERVED)"|Provenance: "(STATED|OBSERVED)"/);
  });
});

describe("the award is the real acts'", () => {
  it("is opened, sent, decided and issued by the product's own server actions", () => {
    for (const a of ["createAward", "updateAwardTerms", "submitAward", "decideAppointmentStep", "recordCommitment", "issueAward"]) expect(src).toMatch(new RegExp(`act\\([^;]*A\\.${a},`));
    expect(src).not.toMatch(/db\.award\.(create|update|updateMany|upsert)\(/);
    expect(code).not.toMatch(/data: \{[^}]*status: "(ISSUED|ACCEPTED|APPROVED)"/);
  });
  it("is advertised: the window's publications recorded and published by the window's acts", () => {
    expect(src).toMatch(/acts\.publication\(/);
    expect(src).toMatch(/acts\.publish\(sx,/);
  });
  it("a redirect thrown after an act committed is its success, and nothing else is", () => {
    expect(acts).toMatch(/digest\.startsWith\("NEXT_REDIRECT"\)\) return \{ ok: true \}/);
  });
});

describe("how it is applied", () => {
  it("demo:load runs it last and reads it back", () => {
    const load = demo.slice(demo.indexOf("async function load()"), demo.indexOf('console.log("Demo data loaded.'));
    // Phase 2b (decisions log, 2026-10-07): the rows the loaders wrote straight into the tables are attributed to the demo loader once everything is loaded, so the fixture
    // is still the last of the demo's own data, and the attribution of the rows already there is the one step after it.
    // AC-20 (wave C step C10): the registers are moved past the later-stage cases and every stage of the case list is read back after the fixture, still before the attribution.
    // ADR 0046 (plan step 8): the funding demo follows Wave V's, before the attribution.
    expect(load).toMatch(/await loadResultsDemo\(db, organisationId, \{ determine: determineExercises \}\);\n {2}await checkResultsDemo\(db\);\n(?: {2}\/\/ [^\n]*\n)* {2}await finishCaseStages\(db\);\n {2}await checkCaseStages\([^\n]*\);\n {2}\/\/ [^\n]*\n {2}await loadWaveVDemo\(db, organisationId\);\n {2}\/\/ [^\n]*\n {2}await loadFundingDemo\(db, organisationId\);\n {2}\/\/ [^\n]*\n {2}await attributeSeededRows\(db, organisationId\);\n\n {2}$/);
  });
  it("demo:results adds it to a loaded database without a wipe, writes nothing where it is issued, and refuses part-made", () => {
    const results = demo.slice(demo.indexOf("async function results()"), demo.indexOf("const mode = process.argv[2];"));
    expect(results).toMatch(/if \(state === "PARTIAL"\) throw new Error/);
    expect(results).toMatch(/if \(state === "ABSENT"\) \{\n\s+const made = await loadResultsDemo/);
    expect(results).not.toMatch(/wipe\(|deleteMany|\.delete\(/);
    expect(src).not.toMatch(/deleteMany|\.delete\(|TRUNCATE/);
    expect(JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).scripts["demo:results"]).toBe("tsx prisma/demo.ts results");
  });
  it("the demo's own valuation clause is loaded with 'every agreement carries it' set, so a pack can be submitted after it", () => {
    expect(lifecycle).toMatch(/id: `\$\{P\}cl2`[^;]*mandatoryInAgreements: false/);
  });
});
