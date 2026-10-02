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

describe("when a change to a method's bid-receipt rules applies (6.6 CR-2)", () => {
  it("Configuration › Invitation says it applies only to exercises published after it", async () => {
    const { BID_RULES_APPLY_TEXT } = await import("./config");
    expect(BID_RULES_APPLY_TEXT).toMatch(/applies only to exercises published after it/);
    const { readFileSync } = await import("node:fs");
    for (const f of ["src/app/configuration/invitation/page.tsx", "src/app/configuration/invitation/editors.tsx"]) expect(readFileSync(f, "utf8")).toMatch(/\$\{BID_RULES_APPLY_TEXT\}/);
  });
});

describe("Configuration › Invitation's header badge (6.6 review S-3)", () => {
  const method = (code: string | null, min: number | null, elim: boolean | null) => ({ lateAdmissionCommitteeCode: code, minimumBids: min, completenessEliminates: elim });
  it("counts three rules per method, false and a minimum of one being set", async () => {
    const { bidRulesNotSet } = await import("./config");
    expect(bidRulesNotSet([])).toBe(0);
    expect(bidRulesNotSet([method(null, null, null)])).toBe(3);
    expect(bidRulesNotSet([method("TB", 1, false), method(null, 3, null)])).toBe(2);
    expect(bidRulesNotSet([method("TB", 1, false)])).toBe(0);
  });
  it("says Everything set only when the window rules and the bid-receipt rules are all set", async () => {
    const { invitationBadge } = await import("./config");
    expect(invitationBadge(0, 0)).toEqual({ tone: "ok", text: "Everything set" });
    expect(invitationBadge(0, 14)).toEqual({ tone: "warn", text: "Window rules set · 14 bid-receipt rules not set" });
    expect(invitationBadge(0, 1)).toEqual({ tone: "warn", text: "Window rules set · 1 bid-receipt rule not set" });
    expect(invitationBadge(2, 0)).toEqual({ tone: "warn", text: "2 not set" });
    expect(invitationBadge(1, 3)).toEqual({ tone: "warn", text: "1 window rule · 3 bid-receipt rules not set" });
    expect(invitationBadge(2, 3)).toEqual({ tone: "warn", text: "2 window rules · 3 bid-receipt rules not set" });
  });
  it("the page reads its badge from invitationBadge, never its own Everything set", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/app/configuration/invitation/page.tsx", "utf8");
    expect(page).toMatch(/invitationBadge\(c\.notSet, bidRulesNotSet\(bidMethods\)\)/);
    expect(page).not.toMatch(/Everything set/);
  });
});
