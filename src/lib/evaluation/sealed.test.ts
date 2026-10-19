import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { ACTIVITY_ENTITIES } from "@/lib/dashboard/activity";

import { EVALUATION_ENTITIES } from "./audit-view";
import { toPosix } from "@/lib/scan/files";

/**
 * By source scan (plan §3 `sealed.test.ts`; FR-EVL-007, 014; E-3; ADR 0018):
 * - every evaluation computation runs from the exercise's pinned snapshot: nothing that evaluates
 *   reads the model's configuration rows;
 * - no score, price, recommendation or Kertas Cadangan reaches a broadcast surface (the dashboard,
 *   the lists, the activity feed, search, the audit export's screen);
 * - every act on an evaluation asks first whether the exercise is cancelled (E-10, the 6.7 M-1 rule);
 * - no act returns a refusal after it has written (the 6.7 R-7 rule): a late refusal is thrown;
 * - the test fixtures with the customer's figures are imported only by tests (X-10(d)).
 */

const root = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : files(path);
    return /\.tsx?$/.test(name) ? [toPosix(path)] : [];
  });
}
const all = files(join(root, "src")).map((p) => ({ path: relative(root, p), text: readFileSync(p, "utf8") }));
const sources = all.filter((s) => !/\.test\.tsx?$/.test(s.path));
const ACTION_DIR = join("src", "app", "sourcing", "[id]", "evaluation");
const actionFiles = sources.filter((s) => s.path.startsWith(ACTION_DIR) && /actions\.ts$/.test(s.path));

/// Every exported act of the evaluation's action files, with its body.
const acts = actionFiles.flatMap((f) => [...f.text.matchAll(/export async function (\w+)\(/g)].map((m, i, xs) => ({ file: f.path, name: m[1], body: f.text.slice(m.index!, xs[i + 1]?.index ?? f.text.length) })));

describe("the configured model is the model executed (FR-EVL-007, §13.4)", () => {
  it("nothing that evaluates reads the model's configuration rows: only the pinned snapshot", () => {
    const ROWS = /\.(evaluationModel|evaluationStage|evaluationCriterion|evaluationFactorOption|evaluationBandSet|evaluationBand|evaluationAspect)\.(find|count|aggregate)/;
    const evaluates = sources.filter((s) => (s.path.startsWith(join("src", "lib", "evaluation")) && !/config/.test(s.path)) || s.path.startsWith(ACTION_DIR));
    expect(evaluates.length).toBeGreaterThan(20);
    expect(evaluates.filter((s) => ROWS.test(s.text)).map((s) => s.path)).toEqual([]);
  });
});

describe("evaluation records never reach a broadcast surface (E-3, FR-EVL-014)", () => {
  // 6.14 inc 2 code review S-6 (stricter): the documents register is a broadcast surface too. app/reports/ stays (inert since
  // 6.17 was removed; kept, not weakened).
  const BROADCAST = /^src\/(app\/page\.tsx|app\/sourcing\/page\.tsx|app\/awards\/page\.tsx|app\/requisitions\/|app\/approvals\/|app\/reports\/|app\/documents\/|lib\/certificate\/register\.ts|app\/configuration\/audit\/|lib\/dashboard|lib\/search)/;
  it("no loader of the dashboard, the lists, the activity feed or the audit export's screen reads a score, a result, a recommendation or the Kertas Cadangan", () => {
    const hits = sources.filter((s) => BROADCAST.test(s.path) && /evaluationScore|stageResult|recommendation\b|Recommendation\b|proposalPaper|ProposalPaper|correctedPrice|cprPercent|evaluatedPrice|recommendedPrice|reportSnapshot/.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });
  it("the activity feed reads none of the evaluation's entities", () => {
    for (const e of EVALUATION_ENTITIES) expect(ACTIVITY_ENTITIES as readonly string[]).not.toContain(e);
  });
});

describe("every act refuses on a cancelled exercise first (E-10)", () => {
  it("found the acts", () => expect(acts.length).toBeGreaterThan(15));
  it.each(acts.map((a) => [a.name, a] as const))("%s", (_name, a) => {
    if (a.name === "startEvaluation") expect(a.body).toMatch(/startFaults\(\{ status: l\.ex\.status/);
    else expect(a.body).toMatch(/(openActFaults|issuedActFaults)\(\{ exerciseStatus: l\.ex\.status/);
  });
});

describe("no act returns a refusal after writing (the 6.7 R-7 rule)", () => {
  const WRITE = /await (tx\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|audit\(|moveExercise\(|issueReference\()/;
  const RETURN_REFUSAL = /return (\{ ok: false|refuse\(|GONE_|CHANGED|NO_ISSUE)/;
  it.each(acts.map((a) => [a.name, a.body] as const))("%s", (_name, body) => {
    const first = body.search(WRITE);
    if (first === -1) return;
    expect(body.slice(first)).not.toMatch(RETURN_REFUSAL);
  });
});

describe("the customer's figures stay in the test fixture (X-10(d))", () => {
  it("ta109-fixture and fixture are imported only by tests", () => {
    const hits = sources.filter((s) => /from "\.\/(ta109-fixture|fixture)"|evaluation\/(ta109-fixture|fixture)"/.test(s.text) && !s.path.endsWith("fixture.ts")).map((s) => s.path);
    expect(hits).toEqual([]);
  });
});
