import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { bondFaults, derivedAnnualValue, requiredBond } from "./bond";

const PRICE = parseSen("1077508.60");

describe("the performance bond's required amount (D4, §8.10 worked examples)", () => {
  it("Option A: 5% of the total contract price RM1,077,508.60 is RM53,875.43", () => {
    expect(requiredBond({ basis: "CONTRACT_PRICE", percent: "5.0000", basisAmount: null, contractPrice: PRICE })).toEqual({ state: "SET", amount: parseSen("53875.43"), basis: "CONTRACT_PRICE" });
  });

  it("Option B: 5% of an entered one-year value RM538,754.00 is RM26,937.70 — the pack's figure (base ASSUMED, inferred from it)", () => {
    expect(requiredBond({ basis: "ANNUAL_VALUE", percent: "5", basisAmount: parseSen("538754.00"), contractPrice: PRICE })).toEqual({ state: "SET", amount: parseSen("26937.70"), basis: "ANNUAL_VALUE" });
  });

  it("halving the contract sum gives RM538,754.30 and RM26,937.72, which does not reproduce the pack", () => {
    const half = derivedAnnualValue(PRICE, 24);
    expect(half).toBe(parseSen("538754.30"));
    const r = requiredBond({ basis: "ANNUAL_VALUE", percent: "5", basisAmount: half, contractPrice: PRICE });
    expect(r).toEqual({ state: "SET", amount: parseSen("26937.72"), basis: "ANNUAL_VALUE" });
    expect(r.state === "SET" && r.amount).not.toBe(parseSen("26937.70"));
  });

  it("an unset basis or percent is not set, never 5%", () => {
    expect(requiredBond({ basis: null, percent: "5", basisAmount: null, contractPrice: PRICE })).toEqual({ state: "NOT_SET", missing: ["BASIS"] });
    expect(requiredBond({ basis: "CONTRACT_PRICE", percent: null, basisAmount: null, contractPrice: PRICE })).toEqual({ state: "NOT_SET", missing: ["PERCENT"] });
    expect(requiredBond({ basis: "ANNUAL_VALUE", percent: "5", basisAmount: null, contractPrice: PRICE })).toEqual({ state: "NOT_SET", missing: ["BASIS_AMOUNT"] });
  });

  it("a stated amount is the amount", () => {
    expect(requiredBond({ basis: "STATED_AMOUNT", percent: null, basisAmount: parseSen("40000"), contractPrice: PRICE })).toEqual({ state: "SET", amount: parseSen("40000"), basis: "STATED_AMOUNT" });
  });
});

describe("verifying a bond (FR-AWD-012)", () => {
  const issuers = [{ id: "bank1", retiredOn: null }, { id: "bank2", retiredOn: new Date("2026-06-01T00:00:00Z") }];
  const req = requiredBond({ basis: "ANNUAL_VALUE", percent: "5", basisAmount: parseSen("538754.00"), contractPrice: PRICE });
  const ok = { issuerId: "bank1", lodgedOn: "2026-09-10", expiresOn: "2029-03-01", value: parseSen("26937.70") };

  it("passes with an approved issuer, an expiry, the basis set and enough value and validity", () => {
    expect(bondFaults(ok, req, issuers, "2028-03-01", 12)).toEqual([]);
  });

  it("refuses an issuer not on the list, or retired from it by the lodgement day", () => {
    expect(bondFaults({ ...ok, issuerId: "other" }, req, issuers, "2028-03-01", 12)).toEqual(["ISSUER_NOT_APPROVED"]);
    expect(bondFaults({ ...ok, issuerId: "bank2" }, req, issuers, "2028-03-01", 12)).toEqual(["ISSUER_NOT_APPROVED"]);
  });

  it("refuses a missing expiry, an unset basis and too little value", () => {
    expect(bondFaults({ ...ok, expiresOn: null }, req, issuers, "2028-03-01", 12)).toEqual(["EXPIRY_REQUIRED"]);
    expect(bondFaults(ok, { state: "NOT_SET", missing: ["BASIS"] }, issuers, "2028-03-01", 12)).toEqual(["BASIS_NOT_SET"]);
    expect(bondFaults({ ...ok, value: parseSen("26937.69") }, req, issuers, "2028-03-01", 12)).toEqual(["BELOW_REQUIRED"]);
  });

  it("refuses an expiry before completion plus the validity months, and an unset validity", () => {
    expect(bondFaults({ ...ok, expiresOn: "2029-02-28" }, req, issuers, "2028-03-01", 12)).toEqual(["EXPIRES_TOO_EARLY"]);
    expect(bondFaults(ok, req, issuers, "2028-03-01", null)).toEqual(["VALIDITY_NOT_SET"]);
  });
});
