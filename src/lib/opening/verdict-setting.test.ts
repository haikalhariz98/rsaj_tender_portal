import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { OpeningChecklist } from "./checklist";
import { finaliseFaults } from "./finalise";
import { openingFindingText } from "./labels";
import { judgeBid, recordedTreatment, verdictRecord, type BidForVerdict } from "./verdict";
import { verdictDrift, type BidAsRecorded } from "./verdict-drift";

/**
 * 6.15a fix R-6 (OD-6) and residual 5 (against accepted 6.7): each recorded verdict is judged again under
 * the rules about to be frozen at finalising, by one function the act and the screen share. Two findings:
 * the register's setting changed since the verdict (VERDICT_UNDER_OTHER_SETTING, naming the change), or
 * the verdict no longer stands for another reason, such as a sale voided since (VERDICT_NO_LONGER_STANDS,
 * naming the grounds added or gone) — never the one reported as the other.
 */

const checklist: OpeningChecklist = { items: [], notJudged: [], notReturned: [] };
const NOT_ELIGIBLE = { judgedOn: "2026-10-01", supplierId: "s", supplierReference: "VND", standing: "SUSPENDED", verdict: "NOT_ELIGIBLE", rows: [] };
const facts = (o: Partial<BidForVerdict> = {}): BidForVerdict => ({ saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED", isAlternative: false, alternativeStatus: null, ineligible: true, ...o });
const ctx = (ineligible: "ELIMINATE" | "REPORT" | null, unpurchased: "ELIMINATE" | "REPORT" = "ELIMINATE") => ({ checklist, completenessEliminates: true, unpurchased, ineligible });
const recordUnder = (f: BidForVerdict, c: ReturnType<typeof ctx>) => verdictRecord(judgeBid(f, checklist, new Map(), c));
const asRecorded = (o: Partial<BidAsRecorded>): BidAsRecorded => ({ listingNo: 1, verdict: "PASS", completeness: null, eligibilityFinding: NOT_ELIGIBLE, answers: [], saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED", isAlternative: false, alternativeStatus: null, ...o });

describe("the register's setting changed since the verdict (fix R-6)", () => {
  it("PASS recorded while reported; the setting is now to eliminate", () => {
    const rec = recordUnder(facts(), ctx("REPORT"));
    expect(recordedTreatment(rec)).toBe("REPORT");
    expect(verdictDrift([asRecorded({ listingNo: 3, completeness: rec })], ctx("ELIMINATE"))).toEqual({ setting: [{ listingNo: 3, was: "REPORT", now: "ELIMINATE" }], noLongerStands: [] });
  });

  it("REJECT recorded while eliminating; the setting is now to report", () => {
    const rec = recordUnder(facts(), ctx("ELIMINATE"));
    expect(verdictDrift([asRecorded({ listingNo: 2, verdict: "REJECT", completeness: rec })], ctx("REPORT")).setting).toEqual([{ listingNo: 2, was: "ELIMINATE", now: "REPORT" }]);
  });

  it("the same setting, the same verdict: nothing; consequence unset: not judged here", () => {
    const rec = recordUnder(facts(), ctx("ELIMINATE"));
    expect(verdictDrift([asRecorded({ verdict: "REJECT", completeness: rec })], ctx("ELIMINATE"))).toEqual({ setting: [], noLongerStands: [] });
    expect(verdictDrift([asRecorded({ completeness: recordUnder(facts(), ctx("REPORT")) })], ctx(null))).toEqual({ setting: [], noLongerStands: [] });
    expect(verdictDrift([asRecorded({ verdict: null })], ctx("ELIMINATE"))).toEqual({ setting: [], noLongerStands: [] });
  });
});

describe("a verdict that no longer stands for another reason (residual 5)", () => {
  it("PASS recorded with a live sale; the sale was voided since and the method eliminates: no longer stands, not 'the register's setting'", () => {
    const rec = recordUnder(facts({ ineligible: false }), ctx("REPORT"));
    const d = verdictDrift([asRecorded({ listingNo: 4, completeness: rec, eligibilityFinding: null, saleFinding: "NO_LIVE_SALE" })], ctx("REPORT"));
    expect(d).toEqual({ setting: [], noLongerStands: [{ listingNo: 4, verdict: "PASS", added: ["NOT_PURCHASED"], removed: [] }] });
  });

  it("on a not-eligible bidder too: the treatment unchanged (reported), the sale voided since", () => {
    const rec = recordUnder(facts(), ctx("REPORT"));
    const d = verdictDrift([asRecorded({ completeness: rec, saleFinding: "NO_LIVE_SALE" })], ctx("REPORT"));
    expect(d.setting).toEqual([]);
    expect(d.noLongerStands).toEqual([{ listingNo: 1, verdict: "PASS", added: ["NOT_PURCHASED"], removed: [] }]);
  });

  it("the words name what changed, never 'eliminated → eliminated'", () => {
    const base = { state: { kind: "MAIN", status: "IN_PROGRESS", sittingNo: 1, finalised: false, exerciseStatus: "CLOSED" }, bids: [], present: [], signed: [], pages: 2, checklist, withdrawals: [], unopened: 0, admittedOpened: true, completenessEliminates: true, unpurchased: "ELIMINATE" as const, invitedReading: "ALL" as never, estimate: { required: false, lodged: false, paperAnswered: true }, personActive: true } as unknown as Parameters<typeof finaliseFaults>[0];
    const fs = finaliseFaults({ ...base, noLongerStands: [{ listingNo: 4, verdict: "PASS", added: ["NOT_PURCHASED"], removed: [] }] });
    const f = fs.find((x) => x.code === "VERDICT_NO_LONGER_STANDS")!;
    expect(openingFindingText(f)).toBe("Offer 4's carrying no longer stands under the rules as they read now (now against it: the bidder holds no live purchase of the documents, and the method eliminates such a bid). Record offer 4's verdict again.");
    expect(openingFindingText(f)).not.toMatch(/setting has changed/);
    const s = finaliseFaults({ ...base, ineligible: { consequence: "ELIMINATE", anyFound: true, disagreements: [{ listingNo: 3, was: "REPORT", now: "ELIMINATE" }] } }).find((x) => x.code === "VERDICT_UNDER_OTHER_SETTING")!;
    expect(openingFindingText(s)).toBe("Offer 3's verdict was recorded with its bidder, found not eligible on the supplier register, reported to the committee, which decides; the register's setting has changed since, and finalising would freeze it as eliminated at the opening. Record offer 3's verdict again under the setting as it stands.");
  });
});

describe("one judgement, shared (residual 5, source)", () => {
  it("the finalise act and the opening screen both call verdictDrift; neither restates it", () => {
    const act = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const read = readFileSync("src/lib/opening/read.ts", "utf8");
    const body = act.slice(act.indexOf("export async function finaliseOpening"));
    expect(body).toMatch(/const drift = verdictDrift\(o\.bids, /);
    expect(body.indexOf("if (blocking(fs).length) return refuse(fs);")).toBeGreaterThan(body.indexOf("verdictDrift("));
    expect(body.indexOf("tx.opening.update(")).toBeGreaterThan(body.indexOf("if (blocking(fs).length) return refuse(fs);"));
    expect(read).toMatch(/const drift = verdictDrift\(o\.bids, /);
    for (const t of [act, read]) expect(t).not.toMatch(/verdictUnderOtherSetting|recordedTreatment\(/);
  });
});
