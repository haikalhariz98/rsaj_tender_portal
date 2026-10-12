import { describe, expect, it } from "vitest";

import { gatewayReading, isFinanceReceipt, offeredMethod, paymentSimulator, simulatedReference, SIMULATED_LABEL } from "@/lib/integration/payment-gateway";

import type { PreSaleCheck } from "./checks";
import { buyerStandingCheck, holdsReleasedPurchase, judgePurchase, onlinePurchaseChecks, PAID_CHANNEL_WORDS, restrictionPurchaseCheck } from "./purchase";
import { releaseState } from "./release";

const pass = (key: PreSaleCheck["key"]): PreSaleCheck => ({ key, state: "PASS", detail: "ok" });
const OK_BUYER = { name: "Aini", accountActive: true, contactCurrent: true, bar: null };

describe("the payment simulator (SR-10, ruling 17 as amended)", () => {
  const req = { purchaseId: "p1", attemptNo: 1, method: "Online banking (FPX)" };
  it("a success is a simulated payment with the method chosen and a simulated reference", () => {
    const s = paymentSimulator.settle(req, "PAY");
    expect(s).toMatchObject({ outcome: "PAID", channel: "SIMULATED", method: "Online banking (FPX)" });
    expect(s.reference).toMatch(/^SIM-[0-9A-F]{10}$/);
  });
  it("a failure is a failure, with its words, and still carries the channel", () => {
    const s = paymentSimulator.settle(req, "FAIL");
    expect(s).toMatchObject({ outcome: "FAILED", channel: "SIMULATED" });
    expect("failureText" in s && s.failureText).toMatch(/no money moved/);
  });
  it("the reference is stable for one attempt and different for the next", () => {
    expect(simulatedReference("p1", 1)).toBe(simulatedReference("p1", 1));
    expect(simulatedReference("p1", 1)).not.toBe(simulatedReference("p1", 2));
  });
  it("is called 'Simulated payment' and is never a finance receipt", () => {
    expect(paymentSimulator.label).toBe(SIMULATED_LABEL);
    expect(paymentSimulator.countsAsFinanceReceipt).toBe(false);
    expect(PAID_CHANNEL_WORDS.SIMULATED).toBe("Simulated payment");
    // Even one that carries a number is not counted.
    expect(isFinanceReceipt({ paymentChannel: "SIMULATED", financeReceiptNo: "R-1", voidedAt: null })).toBe(false);
    expect(isFinanceReceipt({ paymentChannel: "COUNTER", financeReceiptNo: "R-1", voidedAt: null })).toBe(true);
    expect(isFinanceReceipt({ paymentChannel: "COUNTER", financeReceiptNo: "R-1", voidedAt: new Date() })).toBe(false);
    expect(isFinanceReceipt({ paymentChannel: "COUNTER", financeReceiptNo: null, voidedAt: null })).toBe(false);
  });
  it("is available only with the switch on and a method configured; otherwise it refuses in words, and the fallback is the officer's receipt", () => {
    expect(gatewayReading({ simulatorOn: true, methods: ["Card"] }, true).available).toBe(true);
    for (const f of [{ simulatorOn: null, methods: ["Card"] }, { simulatorOn: false, methods: ["Card"] }, { simulatorOn: true, methods: [] }]) {
      const r = gatewayReading(f, true);
      expect(r.available).toBe(false);
      expect(!r.available && r.words.length).toBeGreaterThan(20);
    }
    const unset = gatewayReading({ simulatorOn: null, methods: [] }, true);
    expect(!unset.available && unset.why).toBe("NOT_SET");
  });
  it("a buyer can only name a method the organisation offers", () => {
    expect(offeredMethod(["Card", "E-wallet"], "Card")).toBe("Card");
    expect(offeredMethod(["Card"], "Bitcoin")).toBeNull();
  });
});

describe("the checks online", () => {
  it("replaces the officer's sighting of authority with a reading of the signed-in person's standing", () => {
    const counter: PreSaleCheck[] = [pass("ON_SALE"), pass("REGISTER"), { key: "AUTHORITY", state: "BRING", detail: "Bring proof" }];
    const out = onlinePurchaseChecks(counter, buyerStandingCheck(OK_BUYER), null);
    expect(out.filter((c) => c.key === "AUTHORITY")).toHaveLength(1);
    expect(out.find((c) => c.key === "AUTHORITY")).toMatchObject({ state: "PASS" });
    expect(out.some((c) => c.state === "BRING")).toBe(false);
  });
  // 17a (replacing the SR-10 review M1 test, which held that a restricted tender is not sold online): the counter's "bring the certificate" is replaced by the supplier register's reading of the evidence document.
  it("17a: a restricted tender's check is the register's reading, in place of bringing the certificate to a counter", () => {
    const reading = restrictionPurchaseCheck({ outcome: "ALLOW", document: { id: "d1", reference: "STA-1", validFrom: "2026-01-01", expiresOn: "2027-12-31" }, lapses: null }, null);
    const out = onlinePurchaseChecks([{ key: "RESTRICTION", state: "BRING", detail: "Bring it" }], buyerStandingCheck(OK_BUYER), reading);
    expect(out.find((c) => c.key === "RESTRICTION")).toBe(reading);
    expect(out.some((c) => c.state === "BRING")).toBe(false);
  });
  it("17a: a restricted tender with no reading is stopped and never let through", () => {
    const out = onlinePurchaseChecks([{ key: "RESTRICTION", state: "BRING", detail: "Bring it" }], buyerStandingCheck(OK_BUYER), null);
    expect(out.find((c) => c.key === "RESTRICTION")).toMatchObject({ state: "BLOCK" });
  });
  it("17a: a tender that is not restricted carries no restriction check", () => {
    expect(onlinePurchaseChecks([pass("ON_SALE")], buyerStandingCheck(OK_BUYER), null).some((c) => c.key === "RESTRICTION")).toBe(false);
  });
});

describe("17a: the restricted tender's check at the purchase, in words", () => {
  const doc = { id: "d1", reference: "STA-1", validFrom: "2026-01-01", expiresOn: "2027-12-31" };
  it("a verified document in force through the closing day passes, citing its reference and validity and saying 'verified on the supplier register'", () => {
    const c = restrictionPurchaseCheck({ outcome: "ALLOW", document: doc, lapses: null }, "Bumiputera tender");
    expect(c).toMatchObject({ key: "RESTRICTION", state: "PASS" });
    expect(c.detail).toMatch(/Bumiputera tender: Verified on the supplier register: your document STA-1, valid until/);
    expect(c.detail).not.toMatch(/sighted|original|bring/i);
  });
  it("one that lapses before the closing day is allowed with a warning that says a renewal must be lodged and verified", () => {
    for (const kind of ["BEFORE_CLOSING", "ON_CLOSING_DAY_NOT_COUNTED", "ON_CLOSING_DAY_NOT_SET"] as const) {
      const c = restrictionPurchaseCheck({ outcome: "ALLOW", document: doc, lapses: { kind, on: "2026-11-15" } }, null);
      expect(c.state).toBe("WARN");
      expect(c.detail).toMatch(/renewal/);
    }
    expect(restrictionPurchaseCheck({ outcome: "ALLOW", document: doc, lapses: { kind: "BEFORE_CLOSING", on: "2026-11-15" } }, null).detail).toMatch(/not evidenced/);
  });
  it("every refusal blocks, in words that name the register and carry no code", () => {
    for (const reason of ["EVIDENCE_TYPE_NOT_SET", "NONE_LODGED", "NOT_VERIFIED", "NOT_IN_ORDER", "NOT_APPLICABLE", "NOT_YET_VALID", "EXPIRED", "EXPIRED_RENEWAL_WAITING"] as const) {
      for (const by of ["BUYER", "STAFF"] as const) {
        const c = restrictionPurchaseCheck({ outcome: "REFUSE", reason }, null, by);
        expect(c).toMatchObject({ key: "RESTRICTION", state: "BLOCK" });
        expect(c.detail).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
        expect(c.detail).not.toMatch(/bring|counter|sighted/i);
        // Review of 17a (finding 7): each audience is spoken to in its own voice.
        expect(c.detail).not.toMatch(by === "BUYER" ? /the supplier's|the supplier has/ : /\byour\b|under Company/);
      }
    }
    // Review of 17a (finding 7): an expired document with a renewal already waiting is not told to lodge one.
    expect(restrictionPurchaseCheck({ outcome: "REFUSE", reason: "EXPIRED_RENEWAL_WAITING" }, null).detail).not.toMatch(/Lodge/);
    expect(restrictionPurchaseCheck({ outcome: "REFUSE", reason: "EXPIRED_RENEWAL_WAITING" }, null).detail).toMatch(/waiting for an officer/);
    expect(restrictionPurchaseCheck({ outcome: "REFUSE", reason: "EXPIRED" }, null).detail).toMatch(/Lodge the renewal/);
    expect(restrictionPurchaseCheck({ outcome: "REFUSE", reason: "EVIDENCE_TYPE_NOT_SET" }, null).detail).toMatch(/has not set which document/);
  });
  it("review of 17a (finding 7): the staff register is given the staff's words, and a warning for a waiting renewal says it must be verified rather than lodged", () => {
    const staff = restrictionPurchaseCheck({ outcome: "ALLOW", document: doc, lapses: { kind: "BEFORE_CLOSING", on: "2026-11-15", renewalWaiting: true } }, null, "STAFF");
    expect(staff.state).toBe("WARN");
    expect(staff.detail).toMatch(/Verified on the supplier register: the supplier's document STA-1/);
    expect(staff.detail).not.toMatch(/\byour\b/);
    expect(staff.detail).toMatch(/the renewal lodged must be verified/);
    expect(restrictionPurchaseCheck({ outcome: "ALLOW", document: doc, lapses: { kind: "BEFORE_CLOSING", on: "2026-11-15", renewalWaiting: true } }, null).detail).toMatch(/the renewal you lodged must be verified/);
    expect(restrictionPurchaseCheck({ outcome: "ALLOW", document: doc, lapses: { kind: "BEFORE_CLOSING", on: "2026-11-15" } }, null).detail).toMatch(/a renewal must be lodged and verified/);
  });
  it("a WARN is not a block: the purchase is made", () => {
    const warn = restrictionPurchaseCheck({ outcome: "ALLOW", document: doc, lapses: { kind: "BEFORE_CLOSING", on: "2026-11-15" } }, null);
    expect(judgePurchase({ saleMode: "ONLINE", releaseOnline: true, feeSet: true, checks: [pass("ON_SALE"), warn], alreadyBought: false, purchaseStands: false })).toEqual({ outcome: "MAKE" });
    const block = restrictionPurchaseCheck({ outcome: "REFUSE", reason: "EXPIRED" }, null);
    expect(judgePurchase({ saleMode: "ONLINE", releaseOnline: true, feeSet: true, checks: [pass("ON_SALE"), block], alreadyBought: false, purchaseStands: false })).toEqual({ outcome: "REFUSED" });
  });
});

describe("the standing reading (SR-10)", () => {
  it("the standing reading blocks an inactive account, a retired contact and a barred supplier, each in words", () => {
    expect(buyerStandingCheck({ ...OK_BUYER, accountActive: false }).state).toBe("BLOCK");
    expect(buyerStandingCheck({ ...OK_BUYER, contactCurrent: false }).detail).toMatch(/no longer a current contact/);
    expect(buyerStandingCheck({ ...OK_BUYER, bar: { en: "Your company is suspended.", ms: "Syarikat anda digantung." } })).toMatchObject({ state: "BLOCK", detail: "Your company is suspended." });
    expect(buyerStandingCheck(OK_BUYER).detail).toMatch(/signed in as Aini/);
  });
});

describe("judgePurchase", () => {
  const base: Parameters<typeof judgePurchase>[0] = { saleMode: "ONLINE", releaseOnline: true, feeSet: true, checks: [pass("ON_SALE")], alreadyBought: false, purchaseStands: false };
  it("makes the purchase when the checks pass", () => {
    expect(judgePurchase(base)).toEqual({ outcome: "MAKE" });
  });
  it("keeps a refusal when a check blocks", () => {
    expect(judgePurchase({ ...base, checks: [{ key: "REGISTER", state: "BLOCK", detail: "x" }] })).toEqual({ outcome: "REFUSED" });
  });
  it("is a fault, nothing written, for an exercise not sold online, release not set to online, a standing purchase, a bought set or no checks", () => {
    const f = (o: Partial<typeof base>) => { const j = judgePurchase({ ...base, ...o }); return j.outcome === "FAULTS" ? j.faults : null; };
    expect(f({ saleMode: "COUNTER" })).toEqual(["NOT_SOLD_ONLINE"]);
    expect(f({ saleMode: null })).toEqual(["NOT_SOLD_ONLINE"]);
    expect(f({ releaseOnline: null })).toEqual(["RELEASE_NOT_ONLINE"]);
    expect(f({ releaseOnline: false })).toEqual(["RELEASE_NOT_ONLINE"]);
    expect(f({ feeSet: false })).toEqual(["FEE_NOT_SET"]);
    expect(f({ purchaseStands: true })).toEqual(["PURCHASE_STANDS"]);
    expect(f({ alreadyBought: true })).toEqual(["ALREADY_BOUGHT"]);
    expect(f({ checks: [] })).toEqual(["WINDOW_NOT_DATED"]);
  });
});

describe("holdsReleasedPurchase: who may later submit a bid (wave 3b)", () => {
  const sale = (o: Partial<{ voidedAt: Date | null; financeReceiptNo: string | null; paymentChannel: "COUNTER" | "SIMULATED" }> = {}) => ({ voidedAt: null, financeReceiptNo: null, paymentChannel: "SIMULATED" as const, ...o });
  it("a paid purchase whose sale stands is released, by the simulator or by an officer's receipt", () => {
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: true, purchase: { state: "PAID" }, sale: sale() })).toEqual({ released: true, basis: "PAID_PURCHASE" });
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: true, purchase: { state: "PAID" }, sale: sale({ paymentChannel: "COUNTER", financeReceiptNo: "R-9" }) })).toEqual({ released: true, basis: "PAID_PURCHASE" });
  });
  it("an unpaid purchase, a voided sale and no purchase are not released", () => {
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: true, purchase: { state: "AWAITING_PAYMENT" }, sale: null }).released).toBe(false);
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: true, purchase: { state: "PAID" }, sale: sale({ voidedAt: new Date() }) }).released).toBe(false);
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: true, purchase: null, sale: null }).released).toBe(false);
  });
  it("a counter sale with its receipt recorded is released; without the receipt, or simulated with no purchase, it is not", () => {
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: true, purchase: null, sale: sale({ paymentChannel: "COUNTER", financeReceiptNo: "R-1" }) }).basis).toBe("COUNTER_SALE_WITH_RECEIPT");
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: true, purchase: null, sale: sale({ paymentChannel: "COUNTER" }) }).released).toBe(false);
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: true, purchase: null, sale: sale() }).released).toBe(false);
  });
  it("a paid purchase stays released if the organisation later turns release off (G1: a gate in flight is not rewritten); a counter sale's receipt counts only while it releases online", () => {
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: false, purchase: { state: "PAID" }, sale: sale() }).released).toBe(true);
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: null, purchase: { state: "PAID" }, sale: sale() }).released).toBe(true);
    const counter = sale({ paymentChannel: "COUNTER", financeReceiptNo: "R-1" });
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: false, purchase: null, sale: counter }).released).toBe(false);
    expect(holdsReleasedPurchase({ simulatorAllowed: true, releaseOnline: null, purchase: null, sale: counter }).released).toBe(false);
  });
  it("does not depend on the phase: a released purchase stays released after the closing, when the pack itself is no longer open", () => {
    const input = { simulatorAllowed: true, releaseOnline: true, purchase: { state: "PAID" as const }, sale: sale() };
    expect(holdsReleasedPurchase(input).released).toBe(true);
    expect(releaseState({ simulatorAllowed: true, setting: true, sale: input.sale, purchase: input.purchase, phase: "CLOSED" })).toBe("NOT_OPEN");
    expect(releaseState({ simulatorAllowed: true, setting: true, sale: input.sale, purchase: input.purchase, phase: "OPEN_FOR_PURCHASE" })).toBe("READY");
  });
});

describe("releaseState with an online purchase", () => {
  it("is waiting for payment while the purchase is awaiting it", () => {
    expect(releaseState({ simulatorAllowed: true, setting: true, sale: null, purchase: { state: "AWAITING_PAYMENT" }, phase: "OPEN_FOR_PURCHASE" })).toBe("AWAITING_PAYMENT");
  });
  it("a simulated sale releases like a recorded receipt, and a simulated sale with no purchase does not", () => {
    const sale = { voidedAt: null, financeReceiptNo: null, paymentChannel: "SIMULATED" as const };
    expect(releaseState({ simulatorAllowed: true, setting: true, sale, purchase: { state: "PAID" }, phase: "PUBLISHED" })).toBe("READY");
    expect(releaseState({ simulatorAllowed: true, setting: true, sale, purchase: null, phase: "PUBLISHED" })).toBe("AWAITING_RECEIPT");
  });
  it("is unchanged for the counter: no purchase, a sale, a receipt", () => {
    expect(releaseState({ simulatorAllowed: true, setting: true, sale: { voidedAt: null, financeReceiptNo: "R-1" }, phase: "OPEN_FOR_PURCHASE" })).toBe("READY");
    expect(releaseState({ simulatorAllowed: true, setting: true, sale: { voidedAt: null, financeReceiptNo: null }, phase: "OPEN_FOR_PURCHASE" })).toBe("AWAITING_RECEIPT");
    expect(releaseState({ simulatorAllowed: true, setting: null, sale: null, phase: "OPEN_FOR_PURCHASE" })).toBe("NOT_SET");
  });
});
