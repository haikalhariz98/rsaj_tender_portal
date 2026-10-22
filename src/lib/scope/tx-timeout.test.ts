import { describe, expect, it } from "vitest";

import { scopeFaultText } from "./labels";
import { deadlocked, transactionTimedOut } from "./tx-timeout";

describe("a transaction that ran out of time", () => {
  it("is P2028, as observed (timeout during a query, or at commit)", () => {
    expect(transactionTimedOut({ code: "P2028", meta: { modelName: "Organisation", operation: "query", timeout: 100, timeTaken: 365 } })).toBe(true);
    expect(transactionTimedOut({ code: "P2028", meta: { operation: "commit", timeout: 100, timeTaken: 302 } })).toBe(true);
  });
  it("nothing else is", () => {
    expect(transactionTimedOut({ code: "P2002" })).toBe(false);
    expect(transactionTimedOut(new Error("P2028"))).toBe(false);
    expect(transactionTimedOut(null)).toBe(false);
  });
  it("is refused in a fixed sentence that says nothing was saved", () => {
    expect(scopeFaultText("TIMED_OUT")).toMatch(/^Not saved/); // 0005, founder 2026-10-19: "Not saved" says the same
  });
});

describe("a transaction chosen as a deadlock's victim", () => {
  it("is 40P01 on the adapter's error, as observed on a raw query (P2010) and on a model query, or a write conflict (P2034)", () => {
    expect(deadlocked({ code: "P2010", meta: { driverAdapterError: { cause: { kind: "postgres", code: "40P01", originalCode: "40P01", originalMessage: "deadlock detected" } } } })).toBe(true);
    expect(deadlocked({ cause: { originalCode: "40P01" } })).toBe(true);
    expect(deadlocked({ code: "P2034" })).toBe(true);
  });
  it("nothing else is", () => {
    expect(deadlocked({ code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "23505" } } } })).toBe(false);
    expect(deadlocked(new Error("deadlock detected"))).toBe(false);
    expect(deadlocked(null)).toBe(false);
  });
});
