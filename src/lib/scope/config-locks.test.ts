import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Configuration › Scope and estimate: a create has no row of its own to lock, so it locks
 * the Organisation row before it checks for a duplicate (or, for the policy's first save,
 * before its upsert). Without that lock two creates of one code both pass the check and
 * the second fails on the unique index. By source scan of the actions, because they are
 * the transaction boundary; fails if a lock is removed or moved after its check.
 */

const ACTIONS = readFileSync(join(process.cwd(), "src/app/configuration/scope/core.ts"), "utf8");

/// The body of one exported action, up to the next export.
function body(name: string): string {
  const start = ACTIONS.indexOf(`export async function ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = ACTIONS.indexOf("\nexport ", start + 1);
  return ACTIONS.slice(start, next === -1 ? undefined : next);
}

const LOCK = "await lockOrganisation(tx, orgId);";

describe("configuration creates lock the organisation before their duplicate check", () => {
  it("the helper locks the Organisation row FOR UPDATE", () => {
    expect(ACTIONS).toMatch(/async function lockOrganisation\(tx: Tx, organisationId: string\) \{\s*await tx\.\$queryRaw`SELECT id FROM "Organisation" WHERE id = \$\{organisationId\} FOR UPDATE`;/);
  });

  for (const [name, check] of [
    ["saveQualification", "tx.qualification.findFirst({ where: { organisationId: orgId, code: codeRaw! }"],
    ["saveBqTemplate", "tx.bqTemplate.findFirst({ where: { organisationId: orgId, code: code! }"],
    ["saveSpecPanelColumn", "tx.specPanelColumn.findFirst({ where: { organisationId: orgId, code: code! }"],
    ["saveScopePolicy", "tx.scopePolicy.upsert("],
    ["startRateIssue", "startIssueFaults(issues, label)"],
  ] as const) {
    it(`${name}: the lock comes before ${check.split("(")[0]}`, () => {
      const b = body(name);
      const lock = b.indexOf(LOCK);
      const at = b.indexOf(check);
      expect(lock, `${name} locks the organisation`).toBeGreaterThanOrEqual(0);
      expect(at, `${name} still has its check`).toBeGreaterThanOrEqual(0);
      expect(lock).toBeLessThan(at);
    });
  }

  it("saveScopePolicy locks the organisation before the policy row", () => {
    const b = body("saveScopePolicy");
    expect(b.indexOf(LOCK)).toBeLessThan(b.indexOf(`SELECT id FROM "ScopePolicy"`));
  });
});
