import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { open } from "./fixture";
import { openingFindingText } from "./labels";
import { alternativeInsideFaults, alternativeOf, correctionFaults, nextListingNo, openFaults } from "./open";

/** FR-OPN-005, FR-BID-006, OD-2, OD-10: opening an envelope, its Bil., its alternatives, and a corrected keying slip. */

const bidder = { partyId: "pty1", name: "", registrationNo: "", registrationTaken: false };
const base: Parameters<typeof openFaults>[0] = { state: open(), envelope: { id: "e3", kind: "BID", status: "RECEIVED", late: false }, withdrawn: false, admittedEnvelopeId: null, bidder, price: parseSen("297000.00"), period: { value: 18, unit: "MONTHS" }, isAlternative: false, alternativesPermitted: false, parent: null, timeZone: "Asia/Kuala_Lumpur" };
const codes = (x: Partial<typeof base>) => openFaults({ ...base, ...x }).map((f) => f.code);

describe("which envelopes are opened", () => {
  it("an in-time bid, once the sitting is authorised", () => expect(codes({})).toEqual([]));
  it("not before the box is opened, nor in an unauthorised sitting", () => {
    expect(codes({ state: open({ unsealed: false, sittingAuthorised: false }) })).toEqual(["NOT_UNSEALED"]);
    expect(codes({ state: open({ sittingAuthorised: false }) })).toEqual(["SITTING_NOT_AUTHORISED"]);
  });
  it("a late envelope at the main opening → LATE_NOT_ADMITTED (never openable there)", () => expect(codes({ envelope: { ...base.envelope!, late: true } })).toEqual(["LATE_NOT_ADMITTED"]));
  it("at a supplementary opening, only the admitted envelope", () => {
    const supp = open({ kind: "SUPPLEMENTARY" });
    expect(codes({ state: supp, envelope: { ...base.envelope!, late: true }, admittedEnvelopeId: "e3" })).toEqual([]);
    expect(codes({ state: supp, envelope: { ...base.envelope!, late: true }, admittedEnvelopeId: "e4" })).toEqual(["NOT_THE_ADMITTED_ENVELOPE"]);
  });
  it("the company estimate's envelope is never opened as a bid", () => expect(codes({ envelope: { ...base.envelope!, kind: "COMPANY_ESTIMATE" } })).toEqual(["ESTIMATE_NOT_A_BID"]));
  it("a withdrawn or already opened envelope is refused", () => {
    expect(codes({ withdrawn: true })).toEqual(["OPEN_REFUSED_WITHDRAWN"]);
    expect(codes({ envelope: { ...base.envelope!, status: "OPENED" } })).toEqual(["ALREADY_OPENED"]);
  });
  it("a price is read; a new bidder needs its name and registration, and an existing registration is picked", () => {
    expect(codes({ price: null })).toEqual(["PRICE_REQUIRED"]);
    expect(codes({ bidder: { partyId: null, name: "", registrationNo: "", registrationTaken: false } })).toEqual(["BIDDER_REQUIRED", "REGISTRATION_REQUIRED"]);
    expect(codes({ bidder: { partyId: null, name: "Syarikat Baru", registrationNo: "REG-1", registrationTaken: true } })).toEqual(["PARTY_EXISTS"]);
    expect(codes({ period: { value: 18, unit: null } })).toEqual(["PERIOD_INCOMPLETE"]);
  });
});

describe("Bil. is opening order, not receipt order", () => {
  it("opening E3, E1, E2 gives Bil. 1, 2, 3 in that order", () => {
    const listed: number[] = [];
    const order = ["E3", "E1", "E2"].map((e) => {
      const n = nextListingNo(listed);
      listed.push(n);
      return [e, n];
    });
    expect(order).toEqual([["E3", 1], ["E1", 2], ["E2", 3]]);
  });
  it("continues across openings: a supplementary opening's offer takes the next Bil.", () => expect(nextListingNo([1, 2, 3, 4])).toBe(5));
});

describe("alternatives (FR-BID-006)", () => {
  it("considered where permitted, recorded not considered where not; not stated: none is marked", () => {
    expect(alternativeOf(true, true)).toBe("CONSIDERED");
    expect(alternativeOf(true, false)).toBe("NOT_CONSIDERED");
    expect(alternativeOf(false, true)).toBeNull();
    expect(codes({ isAlternative: true, alternativesPermitted: null })).toEqual(["ALTERNATIVES_NOT_STATED"]);
  });
  it("one found inside an opened envelope needs its main offer opened at this opening", () => {
    const f = (x: Partial<Parameters<typeof alternativeInsideFaults>[0]>) => alternativeInsideFaults({ state: open(), main: { openingMatches: true, isAlternative: false }, alternativesPermitted: true, price: parseSen("280000"), period: { value: null, unit: null }, ...x }).map((y) => y.code);
    expect(f({})).toEqual([]);
    expect(f({ main: null })).toEqual(["MAIN_NOT_OPENED"]);
    expect(f({ alternativesPermitted: null })).toEqual(["ALTERNATIVES_NOT_STATED"]);
  });
});

describe("correcting a keying slip (OD-10)", () => {
  // Review S6: the input names whether the bid's price was read; a paper bid's always is.
  const f = (x: Partial<Parameters<typeof correctionFaults>[0]>) => correctionFaults({ state: open(), sameOpening: true, reason: "Typed 279 for 297", changed: true, price: parseSen("297000"), period: { value: null, unit: null }, priceRead: true, ...x }).map((y) => y.code);
  it("before finalising, with a reason, where something changes", () => {
    expect(f({})).toEqual([]);
    expect(f({ reason: "" })).toEqual(["REASON_REQUIRED"]);
    expect(f({ changed: false })).toEqual(["NOTHING_CHANGED"]);
  });
  it("after signing, never", () => expect(f({ state: open({ finalised: true }) })).toEqual(["FINALISED"]));
  it("an online bid whose price is not read yet is refused in words, never thrown (review S6)", () => {
    expect(f({ priceRead: false })).toEqual(["PRICE_NOT_READ"]);
    expect(openingFindingText({ code: "PRICE_NOT_READ", level: "block" })).toMatch(/Price not read yet/);
  });
});
