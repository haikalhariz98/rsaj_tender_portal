import { describe, expect, it } from "vitest";

import { open } from "./fixture";
import { findingFaults, matchFaults, openFault, withdrawalsResolved, type EnvelopeForWithdrawal, type WithdrawalFacts } from "./withdrawals";

/** FR-BID-004, X-11: a withdrawal matched to an envelope; the envelope is never opened; an unmatched one is explained. */

const w = (over: Partial<WithdrawalFacts> = {}): WithdrawalFacts => ({ id: "w1", envelopeId: null, unmatchedFinding: "", ...over });
const env = (over: Partial<EnvelopeForWithdrawal> = {}): EnvelopeForWithdrawal => ({ id: "b1", kind: "BID", status: "RECEIVED", late: false, receivedSource: "BOX_AT_OPENING", ...over });

describe("a matched envelope is never opened", () => {
  it("a withdrawal naming the envelope → OPEN_REFUSED_WITHDRAWN", () => {
    expect(openFault("b1", [w({ envelopeId: "b1" })])?.code).toBe("OPEN_REFUSED_WITHDRAWN");
    expect(openFault("b2", [w({ envelopeId: "b1" })])).toBeNull();
  });
});

describe("matching a withdrawal to a box envelope", () => {
  const codes = (x: Partial<Parameters<typeof matchFaults>[0]>) => matchFaults({ state: open(), withdrawal: w(), envelope: env(), withdrawals: [w()], ...x }).map((f) => f.code);
  it("an unmatched withdrawal to a box envelope", () => expect(codes({})).toEqual([]));
  it("a late envelope cannot be matched (a withdrawal after the closing is refused in 6.6)", () => expect(codes({ envelope: env({ late: true, receivedSource: "SERVER" }) })).toEqual(["LATE_ENVELOPE", "NOT_A_BOX_ENVELOPE"]));
  it("twice, to a counter envelope, to an opened one or one matched already: refused", () => {
    expect(codes({ withdrawal: w({ envelopeId: "b9" }) })).toEqual(["ALREADY_MATCHED"]);
    expect(codes({ envelope: env({ receivedSource: "SERVER" }) })).toEqual(["NOT_A_BOX_ENVELOPE"]);
    expect(codes({ envelope: env({ status: "OPENED" }) })).toEqual(["ENVELOPE_NOT_RECEIVED"]);
    expect(codes({ withdrawals: [w(), w({ id: "w2", envelopeId: "b1" })] })).toEqual(["ENVELOPE_MATCHED"]);
  });
});

describe("an unmatched withdrawal needs a finding before finalising", () => {
  it("unmatched, no finding → WITHDRAWAL_UNRESOLVED; matched or found → resolved", () => {
    expect(withdrawalsResolved([w(), w({ id: "w2" })])).toEqual({ code: "WITHDRAWAL_UNRESOLVED", level: "block", data: { count: 2 } });
    expect(withdrawalsResolved([w({ envelopeId: "b1" }), w({ id: "w2", unmatchedFinding: "No envelope in the box bore the quoted marks." })])).toBeNull();
  });
  it("a finding needs words and is recorded once", () => {
    const codes = (x: Partial<Parameters<typeof findingFaults>[0]>) => findingFaults({ state: open(), withdrawal: w(), finding: "None in the box.", personActive: true, ...x }).map((f) => f.code);
    expect(codes({})).toEqual([]);
    expect(codes({ finding: "" })).toEqual(["FINDING_REQUIRED"]);
    expect(codes({ withdrawal: w({ unmatchedFinding: "x" }) })).toEqual(["ALREADY_FOUND"]);
  });
});
