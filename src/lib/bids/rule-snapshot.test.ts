import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { completenessConsequence } from "./completeness";
import { competition } from "./count";
import { bidFindingText } from "./labels";
import { lateAdmissionFault, lateMatterFault } from "./late";
import { BID_RULES_KEY, bidRuleFor, bidRulesSnapshot, frozenUnsetText, type BidMethodRule } from "./rule-snapshot";

const AT_PUBLICATION: BidMethodRule = {
  nameEn: "Open tender",
  lateAdmissionCommitteeCode: "TENDER_BOARD",
  lateAdmissionProvenance: "ASSUMED",
  minimumBids: 3,
  minimumBidsProvenance: "STATED",
  completenessEliminates: false,
  completenessProvenance: "ASSUMED",
};
/// The same method changed after publication: another committee, a higher minimum, elimination.
const CHANGED_LATER: BidMethodRule = { ...AT_PUBLICATION, lateAdmissionCommitteeCode: "OTHER_BOARD", minimumBids: 5, completenessEliminates: true, completenessProvenance: "STATED" };
const UNSET_LATER: BidMethodRule = { ...AT_PUBLICATION, lateAdmissionCommitteeCode: null, lateAdmissionProvenance: null, minimumBids: null, minimumBidsProvenance: null, completenessEliminates: null, completenessProvenance: null };

const published = (snapshot: unknown) => ({ publishedAt: new Date("2026-11-03T03:00:00Z"), policySnapshot: snapshot });
const WINDOW = published({ v: 1, [BID_RULES_KEY]: bidRulesSnapshot(AT_PUBLICATION) });
const LATE = [{ id: "e1", kind: "BID" as const, late: true, status: "RECEIVED" as const }];

describe("the method's bid-receipt rules, frozen at publication (6.6 CR-2)", () => {
  it("before publication the exercise reads today's method", () => {
    const r = bidRuleFor({ publishedAt: null, policySnapshot: null }, AT_PUBLICATION);
    expect(r).toEqual({ rule: AT_PUBLICATION, committee: "LIVE", minimum: "LIVE", completeness: "LIVE", frozen: false });
    expect(bidRuleFor(null, CHANGED_LATER).rule).toBe(CHANGED_LATER);
  });

  it("changing the method after publication leaves the published exercise's committee, minimum and completeness consequence unchanged", () => {
    const before = bidRuleFor(WINDOW, AT_PUBLICATION);
    for (const later of [CHANGED_LATER, UNSET_LATER, null]) {
      const after = bidRuleFor(WINDOW, later);
      expect(after.rule!.lateAdmissionCommitteeCode).toBe("TENDER_BOARD");
      expect(after.rule!.minimumBids).toBe(3);
      expect(after.rule!.completenessEliminates).toBe(false);
      expect([after.rule!.lateAdmissionProvenance, after.rule!.minimumBidsProvenance, after.rule!.completenessProvenance]).toEqual(["ASSUMED", "STATED", "ASSUMED"]);
      // ... and what they decide is unchanged: the gate, the competition, the consequence.
      expect(lateAdmissionFault(LATE, [], !!after.rule!.lateAdmissionCommitteeCode, after.committee)).toEqual(lateAdmissionFault(LATE, [], !!before.rule!.lateAdmissionCommitteeCode, before.committee));
      expect(competition(4, after.rule!.minimumBids)).toBe(competition(4, 3));
      expect(completenessConsequence(after.rule!.completenessEliminates)).toBe("REPORTED");
      expect(lateMatterFault({ exerciseCancelled: false, committeeCode: after.rule!.lateAdmissionCommitteeCode, committeeSource: after.committee, envelope: LATE[0], matters: [], sitting: { committeeCode: "OTHER_BOARD", frozen: false } }).map((f) => f.code)).toEqual(["OTHER_COMMITTEE"]);
    }
  });

  it("a rule unset at publication stays unset, though the method sets it later: no fall-back, no exit", () => {
    const w = published({ [BID_RULES_KEY]: bidRulesSnapshot(UNSET_LATER) });
    const r = bidRuleFor(w, CHANGED_LATER);
    expect(r.rule).toMatchObject({ lateAdmissionCommitteeCode: null, minimumBids: null, completenessEliminates: null });
    expect([r.committee, r.minimum, r.completeness]).toEqual(["AS_PUBLISHED", "AS_PUBLISHED", "AS_PUBLISHED"]);
  });

  it("a snapshot without the rules reads each as not set and not recorded, never today's method", () => {
    for (const snapshot of [{ v: 1 }, null, { [BID_RULES_KEY]: "nonsense" }, { [BID_RULES_KEY]: [] }]) {
      const r = bidRuleFor(published(snapshot), AT_PUBLICATION);
      expect(r.rule).toMatchObject({ lateAdmissionCommitteeCode: null, lateAdmissionProvenance: null, minimumBids: null, minimumBidsProvenance: null, completenessEliminates: null, completenessProvenance: null });
      expect([r.committee, r.minimum, r.completeness]).toEqual(["NOT_RECORDED", "NOT_RECORDED", "NOT_RECORDED"]);
      expect(r.frozen).toBe(true);
    }
  });

  it("each rule is read on its own: one missing or malformed key does not take the others with it", () => {
    const r = bidRuleFor(published({ [BID_RULES_KEY]: { lateAdmissionCommitteeCode: "TENDER_BOARD", lateAdmissionProvenance: "STATED", minimumBids: 0, completenessEliminates: "yes" } }), CHANGED_LATER);
    expect(r.rule!.lateAdmissionCommitteeCode).toBe("TENDER_BOARD");
    expect(r.committee).toBe("AS_PUBLISHED");
    expect([r.minimum, r.completeness]).toEqual(["NOT_RECORDED", "NOT_RECORDED"]);
    expect(r.rule!.minimumBids).toBeNull();
    expect(r.rule!.completenessEliminates).toBeNull();
    // A provenance not of the product's three words is not invented.
    expect(bidRuleFor(published({ [BID_RULES_KEY]: { ...bidRulesSnapshot(AT_PUBLICATION), lateAdmissionProvenance: "GUESSED" } }), null).rule!.lateAdmissionProvenance).toBeNull();
  });

  it("publication freezes every rule, unset ones as null, and an exercise with no method as all unset", () => {
    expect(bidRulesSnapshot(AT_PUBLICATION)).toEqual({ lateAdmissionCommitteeCode: "TENDER_BOARD", lateAdmissionProvenance: "ASSUMED", minimumBids: 3, minimumBidsProvenance: "STATED", completenessEliminates: false, completenessProvenance: "ASSUMED" });
    expect(Object.values(bidRulesSnapshot(null)).every((v) => v === null)).toBe(true);
    // The JSON round trip the database makes keeps the reading.
    expect(bidRuleFor(published(JSON.parse(JSON.stringify({ [BID_RULES_KEY]: bidRulesSnapshot(AT_PUBLICATION) }))), null).rule).toMatchObject(bidRulesSnapshot(AT_PUBLICATION));
  });

  it("an unset frozen rule says so on screen, and never sends the reader to set it", () => {
    expect(frozenUnsetText("LIVE")).toBeNull();
    expect(frozenUnsetText("NOT_RECORDED")).toMatch(/^Not recorded when the window was published/);
    expect(frozenUnsetText("AS_PUBLISHED")).toMatch(/^Not set when the window was published/);
    const gate = lateAdmissionFault(LATE, [], false, "NOT_RECORDED")!;
    expect(bidFindingText(gate)).toMatch(/not recorded when this exercise's window was published/);
    expect(bidFindingText(gate)).not.toMatch(/set it on the sourcing method/);
    const unset = lateMatterFault({ exerciseCancelled: false, committeeCode: null, committeeSource: "AS_PUBLISHED", envelope: LATE[0], matters: [], sitting: { committeeCode: "X", frozen: false } });
    expect(bidFindingText(unset[0])).toMatch(/was not set for this exercise's method when its window was published; a later setting .* does not apply/);
    // Before publication the old advice stands.
    expect(bidFindingText(lateAdmissionFault(LATE, [], false)!)).toMatch(/set it on the sourcing method under Configuration › Invitation/);
  });
});

/// Every .ts/.tsx file under a directory.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = dir + "/" + n;
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("who reads the method's live bid-receipt rules (CR-2 source scan)", () => {
  it("only publication (to freeze them), loadBidRule and the tab's read model (each through bidRuleFor) call loadBidMethodRule", () => {
    const callers = [...files("src"), ...files("prisma")].filter((f) => /loadBidMethodRule\(/.test(readFileSync(f, "utf8"))).sort();
    expect(callers).toEqual(["prisma/demo-window.ts", "src/app/sourcing/[id]/window/actions.ts", "src/lib/bids/read.ts", "src/lib/bids/repo.ts"]);
    // The read model loads the live rule beside the window and reads it only through bidRuleFor.
    const read = readFileSync("src/lib/bids/read.ts", "utf8");
    expect(read).toMatch(/const reading = bidRuleFor\(window, liveRule\);/);
    expect(read.match(/liveRule/g)).toHaveLength(2);
    const repo = readFileSync("src/lib/bids/repo.ts", "utf8");
    // In repo.ts: its definition and loadBidRule's one call, nothing else.
    expect(repo.match(/loadBidMethodRule\(/g)).toHaveLength(2);
    expect(repo).toMatch(/return bidRuleFor\(window, await loadBidMethodRule\(/);
  });
  it("publication writes the rules into the snapshot it freezes, in the product and in the demo", () => {
    expect(readFileSync("src/app/sourcing/[id]/window/actions.ts", "utf8")).toMatch(/const bidRules = bidRulesSnapshot\(await loadBidMethodRule\([\s\S]*\[BID_RULES_KEY\]: bidRules,/);
    expect(readFileSync("prisma/demo-window.ts", "utf8")).toMatch(/\[BID_RULES_KEY\]: bidRulesSnapshot\(await loadBidMethodRule\(/);
  });
});
