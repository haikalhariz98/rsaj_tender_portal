import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/// Code review run 2 item 5: /approvals escalating a certificate's step refuses on a cancelled contract, the
/// contract's status read inside the transaction, after the contract and the certificate are locked, before any write.
describe("escalating a certificate's step on a cancelled contract", () => {
  const src = readFileSync(path.join(__dirname, "../../app/approvals/actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function escalateStep"));
  it("reads the contract's status in the transaction's own read of the route", () => {
    expect(body).toMatch(/contract: \{ select: \{ id: true, number: true, status: true,/);
  });
  it("refuses CANCELLED after the locks and before the step is moved", () => {
    const lock = body.indexOf('FROM "Certificate" WHERE id');
    // Run 1a (faithful, ADR 0031): the refusal is the one act × status table's, CANCELLED first; the order is unchanged.
    const refuse = body.indexOf("const certRefused = inst.certificate?.kind ? actStatusFault(certificateAct(");
    const write = body.indexOf("approvalStep.update");
    expect(lock).toBeGreaterThan(-1);
    expect(refuse).toBeGreaterThan(lock);
    expect(write === -1 || refuse < write).toBe(true);
  });
});
