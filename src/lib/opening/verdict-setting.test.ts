import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { finaliseFaults } from "./finalise";
import { openingFindingText } from "./labels";
import { judgeBid, recordedTreatment, verdictRecord, verdictUnderOtherSetting, type BidForVerdict } from "./verdict";
import type { OpeningChecklist } from "./checklist";

/**
 * 6.15a fix R-6 (OD-6, against accepted 6.7): a verdict is recorded under the register's live
 * ineligibleBidConsequence, and finalising freezes whatever the setting is then. If it changed in between,
 * finalising is refused, naming the offer and the change, until the panel records the verdict again.
 */

const checklist: OpeningChecklist = { items: [], notJudged: [], notReturned: [] };
const bid: BidForVerdict = { saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED", isAlternative: false, alternativeStatus: null, ineligible: true } as BidForVerdict;
const judged = (c: "ELIMINATE" | "REPORT" | null) => judgeBid(bid, checklist, new Map(), { completenessEliminates: true, unpurchased: "ELIMINATE", ineligible: c });
const recorded = (c: "ELIMINATE" | "REPORT") => verdictRecord(judged(c));

describe("a verdict recorded under another setting (fix R-6)", () => {
  it("recorded PASS while reported; the setting is now to eliminate: disagrees, eliminated now", () => {
    expect(recordedTreatment(recorded("REPORT"))).toBe("REPORT");
    expect(verdictUnderOtherSetting({ listingNo: 3, verdict: "PASS", record: recorded("REPORT"), ineligible: true }, judged("ELIMINATE"))).toEqual({ listingNo: 3, was: "REPORT", now: "ELIMINATE" });
  });

  it("recorded REJECT while eliminating; the setting is now to report: disagrees (the REJECT has no ground left)", () => {
    expect(verdictUnderOtherSetting({ listingNo: 2, verdict: "REJECT", record: recorded("ELIMINATE"), ineligible: true }, judged("REPORT"))).toEqual({ listingNo: 2, was: "ELIMINATE", now: "REPORT" });
  });

  it("the same setting agrees; no finding, no verdict, or the setting unset is not judged here", () => {
    expect(verdictUnderOtherSetting({ listingNo: 1, verdict: "REJECT", record: recorded("ELIMINATE"), ineligible: true }, judged("ELIMINATE"))).toBeNull();
    expect(verdictUnderOtherSetting({ listingNo: 1, verdict: "PASS", record: recorded("REPORT"), ineligible: true }, judged("REPORT"))).toBeNull();
    expect(verdictUnderOtherSetting({ listingNo: 1, verdict: "PASS", record: null, ineligible: false }, judged("ELIMINATE"))).toBeNull();
    expect(verdictUnderOtherSetting({ listingNo: 1, verdict: null, record: null, ineligible: true }, judged("ELIMINATE"))).toBeNull();
    expect(verdictUnderOtherSetting({ listingNo: 1, verdict: "PASS", record: recorded("REPORT"), ineligible: true }, judged(null))).toBeNull();
  });

  it("finalise refuses, naming the offer and the change; nothing else changes", () => {
    const base = { state: { kind: "MAIN", status: "IN_PROGRESS", sittingNo: 1, finalised: false, exerciseStatus: "CLOSED" }, bids: [{ listingNo: 3, initials: [], unanswered: 0, verdict: "PASS" as const, unpurchased: false }], present: [], signed: [], pages: 2, checklist, withdrawals: [], unopened: 0, admittedOpened: true, completenessEliminates: true, unpurchased: "ELIMINATE" as const, invitedReading: "ALL" as never, estimate: { required: false, lodged: false, paperAnswered: true }, personActive: true } as unknown as Parameters<typeof finaliseFaults>[0];
    const without = finaliseFaults({ ...base, ineligible: { consequence: "ELIMINATE", anyFound: true, disagreements: [] } }).map((f) => f.code);
    const withIt = finaliseFaults({ ...base, ineligible: { consequence: "ELIMINATE", anyFound: true, disagreements: [{ listingNo: 3, was: "REPORT", now: "ELIMINATE" }] } });
    expect(withIt.map((f) => f.code)).toEqual([...without, "VERDICT_UNDER_OTHER_SETTING"]);
    const f = withIt.find((x) => x.code === "VERDICT_UNDER_OTHER_SETTING")!;
    expect(openingFindingText(f)).toBe("Offer 3's verdict was recorded with its bidder, found not eligible on the supplier register, reported to the committee, which decides; the register's setting has changed since, and finalising would freeze it as eliminated at the opening. Record offer 3's verdict again under the setting as it stands.");
  });

  it("finaliseOpening judges each verdict under the consequence it freezes, before anything is written (source)", () => {
    const text = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const body = text.slice(text.indexOf("export async function finaliseOpening"));
    const i = body.indexOf("verdictUnderOtherSetting(");
    expect(i).toBeGreaterThan(0);
    expect(body.indexOf("ineligible: { consequence: ineligible, anyFound: anyIneligible, disagreements }")).toBeGreaterThan(i);
    expect(body.indexOf("if (blocking(fs).length) return refuse(fs);")).toBeGreaterThan(i);
    expect(body.indexOf("tx.opening.update(")).toBeGreaterThan(body.indexOf("if (blocking(fs).length) return refuse(fs);"));
    expect(readFileSync("src/lib/opening/read.ts", "utf8")).toMatch(/disagreements: o\.bids\.flatMap/);
  });
});
