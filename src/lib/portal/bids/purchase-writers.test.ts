import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * Who may write "paid", held by a source scan (SR-10, ruling 17 as amended by the founder; the Phase 4d scan that said "no other writer" is this one, widened):
 *
 *  - a purchase becomes PAID in one place, `markPurchasePaid` (`purchase-paid.ts`), which has exactly two callers: the payment simulator's settlement (`purchase-store.ts`) and an officer
 *    recording the finance receipt (`recordPurchaseReceipt`, `register-actions.ts`). Nothing else writes `state: "PAID"` on a purchase, and nothing writes a paid state on the supplier's say-so;
 *  - the simulator's answer is read in one place (`purchase-store.ts`), and a simulated sale (`paymentChannel: "SIMULATED"`, a `simulatedReference`) is written in one place (`purchase-paid.ts`),
 *    which never gives it a receipt number: the finance receipt number is written only by the officer's two acts (`register-actions.ts`) and by `markPurchasePaid` for the officer's channel;
 *  - a simulated payment never counts as a finance receipt: the reconciliation list excludes it, and nothing that builds a finance export reads a sale without asking its channel.
 *
 * Paths are compared with forward slashes, so the scan holds on Windows as on Linux.
 */

const SRC = path.join(process.cwd(), "src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) && !p.includes(`${path.sep}generated${path.sep}`) ? [p] : [];
  });
const FILES = walk(SRC).map((f) => ({ file: path.relative(process.cwd(), f).split(path.sep).join("/"), src: lex(readFileSync(f, "utf8")), code: lex(readFileSync(f, "utf8"), { only: "comments" }), raw: readFileSync(f, "utf8") }));
const filesMatching = (re: RegExp) => FILES.filter((f) => re.test(f.src)).map((f) => f.file).sort();

describe("the writers of paid (SR-10)", () => {
  it("only markPurchasePaid writes a paid state on a purchase", () => {
    // A write of the state: `state: "PAID"` inside a documentPurchase update or create.
    const writers = FILES.filter((f) => /documentPurchase\.(?:update|updateMany|create|upsert)\([^;]*state:\s*"PAID"/s.test(f.raw)).map((f) => f.file);
    expect(writers).toEqual(["src/lib/portal/bids/purchase-paid.ts"]);
  });

  it("markPurchasePaid has exactly two callers: the simulator's settlement and the officer's receipt", () => {
    const callers = FILES.filter((f) => /\bmarkPurchasePaid\(/.test(f.src) && f.file !== "src/lib/portal/bids/purchase-paid.ts").map((f) => f.file);
    expect(callers.sort()).toEqual(["src/app/sourcing/[id]/window/register-actions.ts", "src/lib/portal/bids/purchase-store.ts"]);
  });

  it("the simulated channel is chosen in one caller and the officer's in the other, never the reverse", () => {
    const store = FILES.find((f) => f.file === "src/lib/portal/bids/purchase-store.ts")!;
    const actions = FILES.find((f) => f.file === "src/app/sourcing/[id]/window/register-actions.ts")!;
    expect(store.raw).toMatch(/by:\s*\{\s*channel:\s*"SIMULATED"/);
    expect(store.raw).not.toMatch(/channel:\s*"FINANCE_RECEIPT"/);
    expect(actions.raw).toMatch(/by:\s*\{\s*channel:\s*"FINANCE_RECEIPT"/);
    expect(actions.raw).not.toMatch(/channel:\s*"SIMULATED"/);
  });

  it("the payment simulator is asked in one place", () => {
    expect(filesMatching(/\bpaymentSimulator\.settle\(/)).toEqual(["src/lib/portal/bids/purchase-store.ts"]);
  });

  it("a simulated sale is written in one place, and never with a receipt number", () => {
    const writers = FILES.filter((f) => /paymentChannel:\s*simulated\s*\?|paymentChannel:\s*"SIMULATED"/.test(f.raw)).map((f) => f.file);
    expect(writers).toEqual(["src/lib/portal/bids/purchase-paid.ts"]);
    const paid = FILES.find((f) => f.file === "src/lib/portal/bids/purchase-paid.ts")!;
    expect(paid.raw).toMatch(/financeReceiptNo:\s*simulated\s*\?\s*null\s*:/);
    expect(paid.raw).toMatch(/receiptRecordedOn:\s*simulated\s*\?\s*null\s*:/);
  });

  it("a finance receipt number is stored by the officer's acts only; every other file that names the column only reads or shows it", () => {
    // A file that names the column must be listed: the two that store it, and the ones that read or show it. A new file naming it is a new line here, with a reason.
    const naming = FILES.filter((f) => /\bfinanceReceiptNo\b/.test(f.src)).map((f) => f.file).sort();
    expect(naming).toEqual([...WRITERS, ...READERS].sort());
    // The two that store it never do so on a simulated sale: the simulator's store does not name the column at all.
    expect(naming).not.toContain("src/lib/portal/bids/purchase-store.ts");
  });

  it("the reconciliation list leaves a simulated payment out", () => {
    const fee = FILES.find((f) => f.file === "src/lib/integration/fee-receipt.ts")!;
    expect(fee.raw).toMatch(/paymentChannel\s*!==\s*"SIMULATED"/);
  });

  it("the sale register reads the channel before it reads a receipt, so a simulated payment is called so", () => {
    const read = FILES.find((f) => f.file === "src/lib/window/read.ts")!;
    expect(read.raw).toMatch(/s\.paymentChannel === "SIMULATED" \? `\$\{SIMULATED_LABEL\}/);
  });
});

/// Files that name `financeReceiptNo` as a value they read or show, not one they store: views, filters, and the reading functions. Listed so a new writer is a new line here, with a reason.
const WRITERS: string[] = ["src/app/sourcing/[id]/window/register-actions.ts", "src/lib/portal/bids/purchase-paid.ts"];
const READERS: string[] = [
  "src/lib/portal/bids/workspace-store.ts",
  "src/lib/window/read.ts",
  "src/lib/window/audit-view.ts",
  "src/lib/portal/bids/inspection-store.ts",
  "src/lib/portal/bids/sale-facts.ts",
  "src/lib/portal/bids/release.ts",
  "src/lib/portal/bids/purchase.ts",
  "src/lib/integration/payment-gateway.ts",
  "src/lib/integration/fee-receipt.ts",
];
