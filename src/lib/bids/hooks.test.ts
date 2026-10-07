import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 6.6's flagged hooks into accepted modules, each held by a source scan (the pure rules are tested
 * beside them): 6.10's tabling and 6.11's citation refuse an appointment while a late envelope waits
 * (OD-6); 6.11's award facts carry the register's gate (X-9); 6.2's lodge act writes the estimate's
 * envelope through its own helper, never through a receipt (it is lodged in preparation).
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const body = (src: string, name: string) => {
  const from = src.indexOf(`export async function ${name}(`);
  const to = src.indexOf("\nexport async function", from + 10);
  return src.slice(from, to === -1 ? undefined : to);
};

describe("the late-admission gate is asked where an appointment is tabled or cited", () => {
  it("6.10 tableMatter: for an exercise's appointment matter", () => {
    const b = body(read("src/app/committees/actions.ts"), "tableMatter");
    expect(b).toMatch(/domain === APPOINTMENT_DOMAIN/);
    expect(b).toMatch(/bidGate\(/);
    expect(b).toMatch(/lateFault/);
  });
  it("6.11 citeAppointmentDecision", () => {
    // Founder, 2026-10-05: the citation moved, unchanged, to the module's route writer, the one function its act and a sitting's outcome both run.
    // Phase 1c (ADR 0034 D10): the lock is now asked for the signed-in person's organisation first; the call is otherwise as pinned.
    expect(body(read("src/app/awards/actions.ts"), "citeAppointmentDecision")).toMatch(/return inAward\(actor, id, \(tx, l\) => citeAppointmentStep\(tx, toAuditActor\(actor\), l, stepId, decisionId\)\);/); // Phase 1b: who acted is the argument after the transaction
    const b = body(read("src/lib/award/route-write.ts"), "citeAppointmentStep");
    expect(b).toMatch(/bidGate\(/);
    expect(b).toMatch(/bids\.lateFault/);
  });
  it("6.11's award facts carry the register's gate into submission and issue", () => {
    expect(read("src/lib/award/repo.ts")).toMatch(/bids: bidsNow\.published/);
    const ev = read("src/lib/award/evaluate.ts");
    expect(ev.match(/bids: f\.exercise\.bids \?\? null/g)?.length).toBe(2);
  });
});

describe("6.2's lodgement writes the estimate's envelope in its own transaction", () => {
  it("through recordEstimateLodgement, never a receipt", () => {
    const b = body(read("src/app/sourcing/[id]/scope/actions.ts"), "lodgeEstimate");
    expect(b).toMatch(/recordEstimateLodgement\(tx, toAuditActor\(actor\), l,/); // Phase 1b: who acted is the argument after the transaction
    expect(b).not.toMatch(/recordReceipt/);
  });
});
