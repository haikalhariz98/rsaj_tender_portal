import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Review R-1, R-7: an opening act never returns a refusal after it has written. A refusal decided
 * after the first write is thrown (a Refusal), so the transaction rolls back and nothing half-done is
 * kept; returning `{ ok: false }` would commit whatever was written before it.
 */

const src = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
const bodies = [...src.matchAll(/export async function (\w+)\(/g)].map((m, i, all) => ({ name: m[1], body: src.slice(m.index!, all[i + 1]?.index ?? src.length) }));
const WRITE = /await (tx\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|audit\(|moveExercise\(|discloseAtFinalising\()/;
const RETURN_REFUSAL = /return (\{ ok: false|refuse\(|GONE_|CHANGED|fs\.length)/;

describe("no opening act returns a refusal after writing (R-7)", () => {
  it("found the acts", () => expect(bodies.length).toBeGreaterThan(15));
  it.each(bodies.map((b) => [b.name, b.body] as const))("%s", (_name, body) => {
    const first = body.search(WRITE);
    if (first === -1) return;
    expect(body.slice(first)).not.toMatch(RETURN_REFUSAL);
  });
  it("the two named in the review throw instead", () => {
    for (const fn of ["openEnvelope", "matchWithdrawal"]) expect(bodies.find((b) => b.name === fn)!.body).toMatch(/if \(moved\.count !== 1\) throw new Refusal\(ENVELOPE_CHANGED\);/);
  });
  it("a changed checklist answer clears the verdict's completeness record with a database null, not undefined", () => {
    const body = bodies.find((b) => b.name === "recordChecklistAnswer")!.body;
    expect(body).toMatch(/completeness: Prisma\.DbNull/);
    expect(body).not.toMatch(/completeness: undefined/);
  });
});
