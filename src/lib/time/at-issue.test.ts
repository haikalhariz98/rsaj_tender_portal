import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { Tx } from "@/lib/audit/record";
import { CERTIFICATE_KINDS } from "@/lib/certificate/types";

vi.mock("@/lib/db", () => ({ db: {} }));

import { certificateMatterFacts } from "./at-issue";

/**
 * Close-out stage A review S4: BD-613-121's refusal of a TERMINATION certificate at signing rests on `certificateMatterFacts` finding no matter for
 * it (a termination has no record in Phase 2). Pinned here: the function reads a matter for the EOT certificate and the contract period agreement
 * only, and answers null for every other kind without reading anything.
 */

/// A transaction that fails the test if anything is read through it.
const untouched = new Proxy({}, { get: (_t, k) => { throw new Error(`read ${String(k)}`); } }) as unknown as Tx;

describe("certificateMatterFacts (review S4)", () => {
  it("answers null for TERMINATION, and for every kind but the two, without a read", async () => {
    for (const kind of CERTIFICATE_KINDS.filter((k) => k !== "EOT" && k !== "CONTRACT_PERIOD_AGREEMENT")) expect(await certificateMatterFacts(untouched, { id: "c1", kind }), kind).toBeNull();
  });
  it("reads a matter for exactly the EOT certificate and the contract period agreement (source)", () => {
    const src = readFileSync("src/lib/time/at-issue.ts", "utf8");
    const body = src.slice(src.indexOf("export async function certificateMatterFacts"), src.indexOf("/// The latest version's values"));
    expect([...body.matchAll(/cert\.kind === "([A-Z_]+)"/g)].map((m) => m[1])).toEqual(["EOT", "CONTRACT_PERIOD_AGREEMENT"]);
  });
});
