import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";
import { posixRelative, toPosix } from "@/lib/scan/files";

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

const ROOTS = ["src", "prisma", "scripts"].map((r) => path.join(process.cwd(), r));
const SOURCE = /\.(ts|tsx|mts|cts|mjs|js)$/;
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "migrations" || n === "node_modules" || p.includes(`${path.sep}generated${path.sep}`) ? [] : walk(p);
    return SOURCE.test(n) && !/\.test\.[a-z]+$/.test(n) ? [toPosix(p)] : [];
  });
// SEC / S8: the scan walks prisma/ (the demo loaders) and scripts/ as well as src/, because a loader or a script writes with the same client.
const FILES = ROOTS.flatMap(walk).map((f) => ({ file: posixRelative(process.cwd(), f), src: lex(readFileSync(f, "utf8")), code: lex(readFileSync(f, "utf8"), { only: "comments" }), raw: readFileSync(f, "utf8") }));
const filesMatching = (re: RegExp) => FILES.filter((f) => re.test(f.src)).map((f) => f.file).sort();

const PAID = "src/lib/portal/bids/purchase-paid.ts";
const STORE = "src/lib/portal/bids/purchase-store.ts";
const ACTIONS = "src/app/sourcing/[id]/window/register-actions.ts";
/// The only (file, method) pairs that write a DocumentPurchase: a first purchase is made in the store, and a purchase becomes paid in `markPurchasePaid`.
const PURCHASE_WRITES: readonly string[] = [`${STORE}#create`, `${PAID}#updateMany`];
const PURCHASE_READS = new Set(["findUnique", "findFirst", "findMany", "findUniqueOrThrow", "findFirstOrThrow", "count", "aggregate", "groupBy"]);

describe("the writers of paid (SR-10)", () => {
  it("only two (file, method) pairs write a DocumentPurchase at all, and every other use of the delegate is a read", () => {
    const writes: string[] = [];
    for (const f of FILES) {
      // Every mention of the delegate, however it is reached or aliased (`const p = tx.documentPurchase`, `db["documentPurchase"]`): its next token must be a read, or the pair is a write.
      for (const m of f.src.matchAll(/\bdocumentPurchase\b\s*(?:\.\s*(\w+)|[^.\s])/g)) {
        const method = m[1];
        if (!method || !PURCHASE_READS.has(method)) writes.push(`${f.file}#${method ?? "(used as a value)"}`);
      }
      if (/\[\s*"documentPurchase"\s*\]/.test(f.code)) writes.push(`${f.file}#(by name)`);
    }
    expect([...new Set(writes)].sort()).toEqual([...PURCHASE_WRITES].sort());
  });

  it("no nested write reaches a purchase through a relation, and no raw SQL names the table outside the two files", () => {
    const nested = /\b(?:documentPurchases|purchaseReceiptsRecorded|documentPurchasesMade|purchases|purchase)\s*:\s*\{\s*(?:create|createMany|connectOrCreate|upsert|update|updateMany|delete|deleteMany|set)\b/;
    expect(filesMatching(nested)).toEqual([]);
    const raw = FILES.filter((f) => /\$(?:queryRaw|executeRaw)(?:Unsafe)?|Prisma\.sql|\bsql`/.test(f.src) && /"DocumentPurchase"/.test(f.code)).map((f) => f.file);
    expect(raw.filter((f) => f !== PAID && f !== STORE)).toEqual([]);
  });

  it("only markPurchasePaid writes a paid state on a purchase, and its file exports nothing that could write one", () => {
    const writers = FILES.filter((f) => /documentPurchase\.(?:update|updateMany|create|createMany|createManyAndReturn|updateManyAndReturn|upsert)\([^;]*state:\s*"PAID"/s.test(f.raw)).map((f) => f.file);
    expect(writers).toEqual([PAID]);
    const paid = FILES.find((f) => f.file === PAID)!;
    // The paid write is in one function, and the file exports only that function and its two refusals: nothing else in the file can be called to write it.
    expect([...paid.src.matchAll(/documentPurchase\.updateMany\(/g)]).toHaveLength(1);
    const exported = [...paid.src.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/gm)].map((m) => m[1]).sort();
    expect(exported).toEqual(["PurchaseBarred", "PurchaseNotAwaiting", "markPurchasePaid"]);
    expect(/^export\s*\{|^export\s+default/m.test(paid.src)).toBe(false);
  });

  it("markPurchasePaid has exactly two callers, found however it is imported or aliased", () => {
    // By the module it comes from, so `import { markPurchasePaid as pay }` and `import * as p from ".../purchase-paid"` are caught as well as a direct call.
    const importers = FILES.filter((f) => f.file !== PAID && /from\s+["'][^"']*purchase-paid["']|require\(\s*["'][^"']*purchase-paid["']\s*\)|import\(\s*["'][^"']*purchase-paid["']\s*\)/.test(f.code)).map((f) => f.file);
    expect(importers.sort()).toEqual([ACTIONS, STORE]);
    const named = FILES.filter((f) => f.file !== PAID && /\bmarkPurchasePaid\b/.test(f.src)).map((f) => f.file);
    expect(named.sort()).toEqual([ACTIONS, STORE]);
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

  it("the reconciliation reads a receipt by the one definition (isFinanceReceipt) and lists a simulated sale apart, in the sale register's reader and the organisation's", () => {
    // SR-10 review SEC-1: the claim "a simulated payment is never a finance receipt" is enforced by code that every reader goes through, not by a comment.
    const fee = FILES.find((f) => f.file === "src/lib/integration/fee-receipt.ts")!;
    expect(fee.src).toMatch(/\bisFinanceReceipt\(/);
    const read = FILES.find((f) => f.file === "src/lib/window/read.ts")!;
    expect(read.src).toMatch(/\buncollectedReceipts\(/);
    expect(read.src).toMatch(/\bsimulatedSales\(/);
  });

  it("the sale register reads the channel before it reads a receipt, so a simulated payment is called so", () => {
    const read = FILES.find((f) => f.file === "src/lib/window/read.ts")!;
    expect(read.raw).toMatch(/s\.paymentChannel === "SIMULATED" \? `\$\{SIMULATED_LABEL\}/);
  });
});

/// `prisma/demo-window.ts` is the demonstration loader, which writes counter sales with their receipts (never a simulated one). Files that name `financeReceiptNo` as a value they read or show, not one they store: views, filters, and the reading functions. Listed so a new writer is a new line here, with a reason.
const WRITERS: string[] = ["prisma/demo-window.ts", "src/app/sourcing/[id]/window/register-actions.ts", "src/lib/portal/bids/purchase-paid.ts"];
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
