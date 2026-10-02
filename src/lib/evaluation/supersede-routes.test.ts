import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { pendingRoutes, supersededRouteNote } from "./loop";

/**
 * 6.8 fix R-7: opening the next evaluation version withdraws the superseded version's negotiation
 * routes still with approval (as the window's cancellation withdraws an exercise's routes), audited,
 * so no approval is recorded on a negotiation that can no longer be held.
 */

describe("the superseded version's routes (R-7)", () => {
  it("only the routes still with approval are withdrawn; approved or refused ones stand as decided", () => {
    const n = (id: string, status: string) => ({ id, approvalInstance: { status } });
    expect(pendingRoutes([n("a", "PENDING"), n("b", "APPROVED"), n("c", "REJECTED"), n("d", "PENDING")]).map((x) => x.id)).toEqual(["a", "d"]);
  });
  it("the note names both versions and the way on", () => {
    const note = supersededRouteNote("WITHDRAWN_ON_CHANGE", 1, 2);
    expect(note.code).toBe("WITHDRAWN_ON_CHANGE");
    expect(note.messageEn).toMatch(/version 1 was superseded by version 2/);
    expect(note.messageEn).toMatch(/Ask for it again on version 2/);
  });
  it("openNewVersion withdraws them in its transaction, guarded on PENDING, with an audit row (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/evaluation/versions.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function openNewVersion"), src.indexOf("export async function closeOnCancellation"));
    const at = body.indexOf("for (const n of pendingRoutes(prev.negotiations))");
    expect(at).toBeGreaterThan(body.indexOf('data: { state: "SUPERSEDED"'));
    const loop = body.slice(at, body.indexOf("const next = await tx.evaluation.create"));
    expect(loop).toMatch(/tx\.approvalInstance\.updateMany\(\{ where: \{ id: inst\.id, status: "PENDING" \}, data: \{ status: "RECALLED", closedAt: x\.now/);
    expect(loop).toMatch(/if \(moved\.count === 1\) await writeAudit\(tx, \{[^}]*entity: "ApprovalInstance"/);
  });
  it("the list says a withdrawn route was not held, never that it was refused", () => {
    const read = readFileSync(join(process.cwd(), "src/lib/evaluation/read.ts"), "utf8");
    expect(read).toMatch(/status === "RECALLED" \? "Withdrawn: not held"/);
  });
});
