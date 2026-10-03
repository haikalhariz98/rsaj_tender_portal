import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * 614-C4 (6.13 Part A step 3): a certificate's route is decided under the one lock order (Requisition → Exercise →
 * Award → Contract → Certificate → the step), wherever it is acted on. Source scans, so a new path cannot take
 * another order (the lock-order scan extended to the new acts).
 */

const ROOT = path.join(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("a certificate's route, under the lock order", () => {
  it("escalation from Approvals locks the requisition, the exercise, the award, the contract, then the certificate", () => {
    const src = read("src/app/approvals/actions.ts");
    const body = src.slice(src.indexOf("export async function escalateStep"));
    const at = (t: string) => body.indexOf(`FROM "${t}" WHERE id`);
    const order = ["Requisition", "SourcingExercise", "Award", "Contract", "Certificate"].map(at);
    for (const x of order) expect(x).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The step is re-read and written after every lock.
    expect(body.indexOf("tx.approvalInstance.findUnique")).toBeGreaterThan(at("Certificate"));
    expect(body.indexOf("tx.approvalStep.updateMany")).toBeGreaterThan(at("Certificate"));
  });

  it("the certificate's own acts decide its route inside inCertificate (withLockedCertificate), reading the clock once", () => {
    const src = read("src/app/projects/[id]/certificates/[certId]/actions.ts");
    for (const name of ["sendCertificateForApproval", "decideCertificateRouteStep", "chooseCertificateRouteRejection", "recordCertificatePayment"]) {
      const at = src.indexOf(`export async function ${name}(`);
      expect(at, name).toBeGreaterThan(-1);
      const body = src.slice(at, src.indexOf("\nexport async function ", at + 10) === -1 ? undefined : src.indexOf("\nexport async function ", at + 10));
      expect(body, name).toMatch(/return inCertificate\(/);
      expect((body.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
    }
  });

  it("the route's helpers read no clock, take no lock of their own and never reach outside the transaction", () => {
    for (const f of ["src/lib/certificate/route-write.ts", "src/lib/payment/route-open.ts", "src/lib/payment/finance-write.ts", "src/lib/payment/at-issue.ts"]) {
      const m = lex(read(f));
      expect(m, f).not.toMatch(/new Date\(\)/);
      expect(m, f).not.toMatch(/FOR UPDATE|FOR SHARE/);
      expect(m, f).not.toMatch(/\bdb\./);
    }
  });

  it("the worklist links a certificate's step to the certificate's route, where it is decided", () => {
    expect(read("src/lib/approvals/load.ts")).toMatch(/href: `\/projects\/\$\{r\.certificate\.contract\.id\}\/certificates\/\$\{r\.certificate\.id\}\?tab=routing`/);
  });
});
