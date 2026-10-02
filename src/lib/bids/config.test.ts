import { describe, expect, it } from "vitest";

import { bidRuleFaults, bidRuleToSave, type BidRuleDraft } from "./config";

const unset: BidRuleDraft = { committeeCode: null, committeeProvenance: null, minimumBids: null, minimumProvenance: null, eliminates: null, eliminatesProvenance: null };
const known = { committees: ["TB", "QC"] };

describe("a method's bid-receipt rules", () => {
  it("every rule may be left unset, and is stored as not set with no provenance", () => {
    expect(bidRuleFaults(unset, known)).toEqual([]);
    expect(bidRuleToSave({ ...unset, committeeProvenance: "STATED" })).toEqual({ lateAdmissionCommitteeCode: null, lateAdmissionProvenance: null, minimumBids: null, minimumBidsProvenance: null, completenessEliminates: null, completenessProvenance: null });
  });
  it("a value set says where it came from", () => {
    expect(bidRuleFaults({ ...unset, committeeCode: "TB" }, known).map((f) => f.field)).toEqual(["lateAdmissionProvenance"]);
    expect(bidRuleFaults({ ...unset, minimumBids: 3 }, known).map((f) => f.field)).toEqual(["minimumBidsProvenance"]);
    expect(bidRuleFaults({ ...unset, eliminates: false }, known).map((f) => f.field)).toEqual(["completenessProvenance"]);
  });
  it("refuses an unknown committee and a minimum below one", () => {
    expect(bidRuleFaults({ ...unset, committeeCode: "NOPE", committeeProvenance: "ASSUMED" }, known).map((f) => f.code)).toEqual(["UNKNOWN_COMMITTEE"]);
    expect(bidRuleFaults({ ...unset, minimumBids: 0, minimumProvenance: "ASSUMED" }, known).map((f) => f.code)).toEqual(["MINIMUM_BELOW_ONE"]);
  });
  it("false is a stated answer (reported, not eliminated), never read as not set", () => {
    expect(bidRuleToSave({ ...unset, eliminates: false, eliminatesProvenance: "STATED" }).completenessEliminates).toBe(false);
  });
});
