import { describe, expect, it } from "vitest";

import { applyFaults, extensionFaults } from "./extension";
import { CLOSING, S } from "./fixture";

const base = { cancelled: false, closing: CLOSING, now: new Date(CLOSING.getTime() + 86400 * S), today: "2027-03-01" as string | null, currentExpiry: "2027-03-17" as string | null, toExpiry: "2027-04-30" as string | null, reason: "Evaluation needs longer", partyKnown: true, partyId: "p1" as string | null, recommendedPartyId: null as string | null, consentReceivedOn: "2027-02-28" as string | null, pendingExists: false, personActive: true };
const codes = (i: Partial<typeof base>) => extensionFaults({ ...base, ...i }).map((f) => f.code);

describe("recording a validity extension (FR-BID-010)", () => {
  it("after the closing, later than the expiry, with a reason, a party and the consent day", () => expect(codes({})).toEqual([]));
  it("allowed after expiry", () => expect(codes({ today: "2027-03-20", consentReceivedOn: "2027-03-19" })).toEqual([]));
  it("new expiry not after the old is refused", () => {
    expect(codes({ toExpiry: "2027-03-17" })).toEqual(["NOT_LATER"]);
    expect(codes({ toExpiry: "2027-03-01" })).toEqual(["NOT_LATER"]);
  });
  it("a non-recommended party, once 6.8 names one: NOT_RECOMMENDED; before, the officer's naming stands", () => {
    expect(codes({ recommendedPartyId: "p2" })).toEqual(["NOT_RECOMMENDED"]);
    expect(codes({ recommendedPartyId: "p1" })).toEqual([]);
  });
  it("refused before the closing, with no validity, and while another waits to be applied", () => {
    expect(codes({ now: CLOSING })).toEqual(["NOT_CLOSED"]);
    expect(codes({ currentExpiry: null })).toEqual(["VALIDITY_NOT_SET"]);
    expect(codes({ pendingExists: true })).toEqual(["PENDING_EXISTS"]);
  });
  it("refused with no reason, no party, a consent day in the future", () => {
    expect(codes({ reason: "", partyId: null, consentReceivedOn: "2027-03-02" })).toEqual(["REASON_REQUIRED", "PARTY_REQUIRED", "CONSENT_DAY_IN_FUTURE"]);
  });
});

describe("applying it", () => {
  it("consent not attached: CONSENT_REQUIRED", () => expect(applyFaults({ cancelled: false, appliedAt: null, liveConsents: 0, toExpiry: "2027-04-30", currentExpiry: "2027-03-17" }).map((f) => f.code)).toEqual(["CONSENT_REQUIRED"]));
  it("with it: applied; once only; still later than what stands", () => {
    expect(applyFaults({ cancelled: false, appliedAt: null, liveConsents: 1, toExpiry: "2027-04-30", currentExpiry: "2027-03-17" })).toEqual([]);
    expect(applyFaults({ cancelled: false, appliedAt: new Date(), liveConsents: 1, toExpiry: "2027-04-30", currentExpiry: "2027-03-17" }).map((f) => f.code)).toEqual(["ALREADY_APPLIED"]);
    expect(applyFaults({ cancelled: false, appliedAt: null, liveConsents: 1, toExpiry: "2027-04-30", currentExpiry: "2027-05-01" }).map((f) => f.code)).toEqual(["NOT_LATER"]);
  });
});
