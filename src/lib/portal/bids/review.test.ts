import { describe, expect, it } from "vitest";

import { simulatedSales, SIMULATED_NO_MONEY, uncollectedReceipts } from "@/lib/integration/fee-receipt";
import { PAYMENT_SIMULATOR_ENV, simulatorAllowedByDeployment } from "@/lib/integration/payment-deployment";
import { gatewayReading, isFinanceReceipt, paymentSimulator } from "@/lib/integration/payment-gateway";
import { saleFinding } from "@/lib/opening/findings";

import { failedTriesExhausted, isRepeatDownload, MAX_FAILED_PAYMENT_TRIES, rateVerdict, RATE_LIMITS, windowStartOf } from "./limits";
import { paymentSay } from "./payment-say";
import { holdsBidStanding, holdsReleasedPurchase } from "./purchase";
import { releaseState, releaseText } from "./release";

/** The SR-10 wave 3a review: the deployment gate (SEC-1), the release before the setting (S2), the bid predicate (S9), the words of an online exercise (S6) and the bounds (SEC-2). */

const sim = { voidedAt: null, financeReceiptNo: null, paymentChannel: "SIMULATED" as const };
const counter = (no: string | null) => ({ voidedAt: null, financeReceiptNo: no, paymentChannel: "COUNTER" as const });
const PAID = { state: "PAID" as const };

describe("the deployment's permission for the simulator (SEC-1)", () => {
  it("is absent by default and only the word true or 1 allows it", () => {
    expect(simulatorAllowedByDeployment({})).toBe(false);
    expect(simulatorAllowedByDeployment({ [PAYMENT_SIMULATOR_ENV]: "" })).toBe(false);
    expect(simulatorAllowedByDeployment({ [PAYMENT_SIMULATOR_ENV]: "yes" })).toBe(false);
    expect(simulatorAllowedByDeployment({ [PAYMENT_SIMULATOR_ENV]: "false" })).toBe(false);
    expect(simulatorAllowedByDeployment({ [PAYMENT_SIMULATOR_ENV]: " TRUE " })).toBe(true);
    expect(simulatorAllowedByDeployment({ [PAYMENT_SIMULATOR_ENV]: "1" })).toBe(true);
  });
  it("without it the gateway is never available, whatever the organisation switched on, and says why", () => {
    const r = gatewayReading({ simulatorOn: true, methods: ["Card"] }, false);
    expect(r.available).toBe(false);
    expect(!r.available && r.why).toBe("NOT_ALLOWED");
    // The organisation's own unset and off readings still come first.
    expect(gatewayReading({ simulatorOn: null, methods: ["Card"] }, false)).toMatchObject({ why: "NOT_SET" });
    expect(gatewayReading({ simulatorOn: false, methods: ["Card"] }, false)).toMatchObject({ why: "OFF" });
  });
});

describe("a simulated purchase entitles only while the deployment allows the simulator (SEC-1)", () => {
  it("releases the documents only while allowed; a counter sale with its receipt is unaffected", () => {
    expect(holdsReleasedPurchase({ releaseOnline: true, purchase: PAID, sale: sim, simulatorAllowed: true }).released).toBe(true);
    expect(holdsReleasedPurchase({ releaseOnline: true, purchase: PAID, sale: sim, simulatorAllowed: false }).released).toBe(false);
    expect(holdsReleasedPurchase({ releaseOnline: true, purchase: null, sale: counter("R-1"), simulatorAllowed: false }).released).toBe(true);
    expect(holdsReleasedPurchase({ releaseOnline: true, purchase: PAID, sale: counter("R-1"), simulatorAllowed: false }).released).toBe(true);
  });
  it("the release state says the payment was simulated and releases nothing, whatever the live setting", () => {
    const base = { sale: sim, purchase: PAID, phase: "OPEN_FOR_PURCHASE" as const };
    expect(releaseState({ ...base, setting: true, simulatorAllowed: true })).toBe("READY");
    expect(releaseState({ ...base, setting: true, simulatorAllowed: false })).toBe("SIMULATION_NOT_ALLOWED");
  });
});

describe("S2: a paid purchase is read before the live release setting (G1)", () => {
  it("documents bought stay released when the setting is later off or unset", () => {
    const base = { sale: counter(null), purchase: PAID, phase: "OPEN_FOR_PURCHASE" as const, simulatorAllowed: true };
    expect(releaseState({ ...base, setting: false })).toBe("READY");
    expect(releaseState({ ...base, setting: null })).toBe("READY");
  });
  it("a counter sale with its receipt still needs the setting (OD-11), and an unpaid purchase releases nothing", () => {
    expect(releaseState({ setting: false, sale: counter("R-1"), phase: "OPEN_FOR_PURCHASE", simulatorAllowed: true })).toBe("OFF");
    expect(releaseState({ setting: false, sale: null, purchase: { state: "AWAITING_PAYMENT" }, phase: "OPEN_FOR_PURCHASE", simulatorAllowed: true })).toBe("OFF");
  });
});

describe("S9: the bid predicate is the opening's, the release is stricter", () => {
  it("a counter sale that stands counts for a bid whether or not its receipt is recorded; the documents still need the receipt", () => {
    expect(holdsBidStanding({ sale: counter(null), simulatorAllowed: true })).toBe(true);
    expect(holdsReleasedPurchase({ releaseOnline: true, purchase: null, sale: counter(null), simulatorAllowed: true }).released).toBe(false);
  });
  it("17c: a counter sale counts for a bid whatever electronicDocumentRelease says; the release setting governs the online documents only", () => {
    // `holdsBidStanding` takes no release input at all, so the setting cannot change its answer: that is held here by comparing it with the documents' release, which does take it (review of 17a, finding 9).
    // Across the three values of the setting the documents' release changes, and the standing to bid, for the very same counter sale with its receipt, does not.
    const released = [null, false, true].map((releaseOnline) => holdsReleasedPurchase({ releaseOnline, purchase: null, sale: counter("R-1"), simulatorAllowed: true }).released);
    expect(released).toEqual([false, false, true]);
    const standing = [null, false, true].map(() => holdsBidStanding({ sale: counter("R-1"), simulatorAllowed: true }));
    expect(standing).toEqual([true, true, true]);
    // A counter sale with no receipt recorded yet still stands for a bid, and releases nothing under any value.
    expect(holdsBidStanding({ sale: counter(null), simulatorAllowed: true })).toBe(true);
    for (const releaseOnline of [null, false, true]) expect(holdsReleasedPurchase({ releaseOnline, purchase: null, sale: counter(null), simulatorAllowed: true }).released).toBe(false);

    expect(saleFinding("p1", [{ partyId: "p1", voided: false, certSighted: null, certValidUntil: null }], "ADVERTISED", new Set())).toBe("LIVE_SALE");
  });
  it("a voided sale, or none, does not count; a simulated one counts only while the deployment allows it", () => {
    expect(holdsBidStanding({ sale: null, simulatorAllowed: true })).toBe(false);
    expect(holdsBidStanding({ sale: { ...counter("R-1"), voidedAt: new Date() }, simulatorAllowed: true })).toBe(false);
    expect(holdsBidStanding({ sale: sim, simulatorAllowed: true })).toBe(true);
    expect(holdsBidStanding({ sale: sim, simulatorAllowed: false })).toBe(false);
  });
});

describe("S6: the words are true of an online exercise, and say simulated when it was", () => {
  const online = { saleMode: "ONLINE" as const, simulated: false };
  it("never tells a buyer to collect at the counter or that the office will sell the documents", () => {
    for (const state of ["NOT_SET", "OFF", "NO_SALE", "AWAITING_RECEIPT"] as const) {
      const t = releaseText(state, online);
      expect(`${t.short} ${t.detail}`, state).not.toMatch(/counter|office has sold/i);
    }
  });
  it("a counter exercise keeps the counter words", () => {
    expect(releaseText("NOT_SET", { saleMode: "COUNTER", simulated: false }).short).toBe("Collected at the counter");
  });
  it("released after a simulated payment says simulated and not that a payment is recorded", () => {
    const t = releaseText("READY", { saleMode: "ONLINE", simulated: true });
    expect(t.short).toContain("simulated");
    expect(t.detail).toContain("no money moved");
    expect(releaseText("READY", online).detail).toContain("Your payment is recorded");
  });
});

describe("the reconciliation lists a simulated sale apart, never as awaiting a receipt, never dropped (SEC-1)", () => {
  const row = (id: string, ch: "COUNTER" | "SIMULATED", no: string | null, day: number) => ({ id, paymentChannel: ch, financeReceiptNo: no, voidedAt: null, soldOn: new Date(Date.UTC(2026, 10, day)) });
  it("splits live sales three ways", () => {
    const sales = [row("a", "COUNTER", null, 5), row("b", "SIMULATED", null, 4), row("c", "COUNTER", "R-1", 3), row("d", "COUNTER", "  ", 2), { ...row("e", "SIMULATED", null, 1), voidedAt: new Date() }];
    expect(uncollectedReceipts(sales).map((s) => s.id)).toEqual(["d", "a"]);
    expect(simulatedSales(sales).map((s) => s.id)).toEqual(["b"]);
    expect(SIMULATED_NO_MONEY).toBe("Simulated, no money received");
  });
});

describe("the bounds on what a supplier can make the system write (SEC-2)", () => {
  const t = new Date("2026-11-03T10:00:30Z");
  it("counts by fixed window and judges the count over the limit", () => {
    expect(windowStartOf(t, 60).toISOString()).toBe("2026-11-03T10:00:00.000Z");
    const { limit } = RATE_LIMITS["document-download"];
    expect(rateVerdict("document-download", limit, t)).toEqual({ limited: false });
    expect(rateVerdict("document-download", limit + 1, t)).toEqual({ limited: true, retryAfterSeconds: 30 });
  });
  it("a purchase that has failed the bounded number of times takes no more tries", () => {
    expect(failedTriesExhausted(MAX_FAILED_PAYMENT_TRIES - 1)).toBe(false);
    expect(failedTriesExhausted(MAX_FAILED_PAYMENT_TRIES)).toBe(true);
  });
  it("a repeat download within the window is one for the log; after it, or the first, is logged", () => {
    expect(isRepeatDownload(null, t)).toBe(false);
    expect(isRepeatDownload(new Date(t.getTime() - 60_000), t)).toBe(true);
    expect(isRepeatDownload(new Date(t.getTime() - 11 * 60_000), t)).toBe(false);
  });
});

describe("what the pay screens say for each reason online payment is not on", () => {
  it("never says 'not connected' of a purchase that ran out of tries, nor of a copy that does not allow the simulator", () => {
    const say = (r: Parameters<typeof paymentSay>[0]) => paymentSay(r, "Jabatan Contoh");
    expect(say("TRIES_EXHAUSTED").instruct).toMatch(/Ask Jabatan Contoh to record your payment/);
    expect(say("TRIES_EXHAUSTED").title).not.toMatch(/not connected/);
    expect(say("NOT_ALLOWED").title).toMatch(/not available here/);
    expect(say("OFF").title).toMatch(/not connected yet/);
    expect(say("NO_METHODS").how).toMatch(/not connected yet/);
  });
  it("a simulated payment is a finance receipt by the simulator's own flag, whatever else the record carries", () => {
    expect(isFinanceReceipt({ paymentChannel: "SIMULATED", financeReceiptNo: "R-1", voidedAt: null })).toBe(paymentSimulator.countsAsFinanceReceipt);
    expect(paymentSimulator.countsAsFinanceReceipt).toBe(false);
    expect(isFinanceReceipt({ paymentChannel: "COUNTER", financeReceiptNo: "R-1", voidedAt: null })).toBe(true);
  });
});
