import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AWARD_MATRIX } from "@/lib/award/fixture";
import { resolveSignatory } from "@/lib/award/signatory";

import { successorSteps } from "./rejection";
import { routedOffices, ruleChain } from "./resolve";
import type { CoreLevel, Matrix } from "./types";

/**
 * 6.9 ruling C3 and scope: the three places that showed or counted a rule's chain from
 * its fields — the approval matrix's rule preview, the award signatory's recommenders
 * and the roster's "routed" offices — read the resolver's chain instead, so a step the
 * core routing generates is never missing from them. Proved two ways: by behaviour, and
 * by a scan of their source that fails if a chain is rebuilt from rule fields again.
 */

// An invented core row beneath the Functional Director: Head of Department proposes.
const FD_ROW: CoreLevel = { approverCode: "FD", clause: "TEST core", provenance: "ASSUMED", steps: [{ roleCode: "HOD", act: "P", provenance: "ASSUMED" }] };
const flagged = (m: Matrix, key: string): Matrix => ({
  ...m,
  coreRouting: [FD_ROW],
  rules: m.rules.map((r) => (r.ruleKey === key ? { ...r, generateCoreChain: true } : r)),
});

describe("the readers take the resolver's chain", () => {
  it("the signatory's recommenders include a step the core routing generates", () => {
    const before = resolveSignatory(AWARD_MATRIX, { kind: "LETTER_OF_ACCEPTANCE", value: 2_000_000 });
    expect(before.ok && before.recommenders.map((r) => [r.roleCode, r.act])).toEqual([["CP", "R"]]);
    const after = resolveSignatory(flagged(AWARD_MATRIX, "SIG_LOA_3M"), { kind: "LETTER_OF_ACCEPTANCE", value: 2_000_000 });
    expect(after.ok && after.recommenders.map((r) => [r.roleCode, r.act])).toEqual([["HOD", "P"], ["CP", "R"]]);
    expect(after.ok && after.roleCode).toBe("FD");
  });

  it("an office only the core routing routes to counts as routed", () => {
    const m: Matrix = {
      ...AWARD_MATRIX,
      rules: AWARD_MATRIX.rules.filter((r) => r.ruleKey === "SIG_LOA_3M"),
    };
    expect(routedOffices(m).sort()).toEqual(["CP", "FD"]);
    expect(routedOffices(flagged(m, "SIG_LOA_3M")).sort()).toEqual(["CP", "FD", "HOD"]);
  });

  it("the rule preview's chain is the resolver's, approver last", () => {
    const m = flagged(AWARD_MATRIX, "SIG_LOA_3M");
    const rule = m.rules.find((r) => r.ruleKey === "SIG_LOA_3M")!;
    expect(ruleChain(m, rule).steps.map((s) => `${s.roleCode}:${s.act}:${s.origin ?? "-"}`)).toEqual(["HOD:P:CORE", "CP:R:RULE", "FD:A:-"]);
  });

  it("a successor route carries each step's origin from the route it continues", () => {
    const step = (sequence: number, chainOrigin: string | null) => ({
      id: `s${sequence}`, sequence, roleCode: "X", roleLabel: "X", act: "R", committeeCode: null, nonDelegable: false, sourceRuleKey: null,
      decision: sequence === 1 ? "DONE" : "PENDING", decidedByPersonId: null, decidedByName: null, decidedOn: null, delegationId: null, reason: "", receivedOn: null, recordedAt: null, chainOrigin,
    });
    expect(successorSteps([step(1, "CORE"), step(2, "RULE"), step(3, null)], 2).map((s) => s.chainOrigin)).toEqual(["CORE", "RULE", null]);
  });
});

describe("no reader rebuilds a chain from rule fields (source scan, ruling C3)", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const RESTATES_A_CHAIN = [/\brule\.recommenders\b/, /for \(const \w+ of [\w.!]*\.recommenders\)/, /roleName\(rule\.proposerCode\)/];
  const READERS: { file: string; uses: RegExp; alsoBarred: RegExp[] }[] = [
    { file: "src/app/configuration/approval-matrix/page.tsx", uses: /ruleChain\(matrix, rule\)/, alsoBarred: [] },
    { file: "src/lib/award/signatory.ts", uses: /r\.chain\.slice\(/, alsoBarred: [/proposerCode/, /recommenders\.map/] },
    { file: "src/lib/people/load.ts", uses: /routedOffices\(/, alsoBarred: [/proposerCode/, /authorityRuleStep/, /authorityRule\.findMany/] },
  ];

  it.each(READERS)("$file reads the resolver's chain", ({ file, uses, alsoBarred }) => {
    const text = src(file);
    expect(text).toMatch(uses);
    for (const re of [...RESTATES_A_CHAIN, ...alsoBarred]) expect(text, `${file} matches ${re}`).not.toMatch(re);
  });
});
