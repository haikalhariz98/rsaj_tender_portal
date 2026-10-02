import { describe, expect, it } from "vitest";

import { judgeLodgement, lodgementFaults, lodgementMarkings } from "./estimate";
import { CLOSING, S } from "./fixture";

describe("the estimate's lodgement into the box", () => {
  it("needs no window: lodged in preparation, before any closing", () => {
    expect(lodgementFaults({ status: "DOCUMENTS_IN_PREPARATION", closing: null, now: new Date() })).toEqual([]);
    expect(judgeLodgement(new Date(CLOSING.getTime() - 5 * S), null)).toMatchObject({ late: false, closingAtJudged: null });
  });
  it("refused after the closing and on a cancelled exercise only", () => {
    expect(lodgementFaults({ status: "ADVERTISED", closing: CLOSING, now: CLOSING })).toEqual([]);
    expect(lodgementFaults({ status: "ADVERTISED", closing: CLOSING, now: new Date(CLOSING.getTime() + S) }).map((f) => f.code)).toEqual(["LODGEMENT_CLOSED"]);
    expect(lodgementFaults({ status: "CANCELLED", closing: null, now: new Date() }).map((f) => f.code)).toEqual(["CANCELLED"]);
  });
  it("its markings name the version, never a figure", () => expect(lodgementMarkings(2)).toBe("Company estimate, copy 1 (version 2), sealed"));
});
