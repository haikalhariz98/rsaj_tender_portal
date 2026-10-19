import { describe, expect, it } from "vitest";

import { bytesWords, discardedNotices, partViews, standingChoices, submissionViews, type OwnBidRow } from "./my-bids";
import { stampText } from "./stamp-text";
import type { BidPartRule } from "./types";
import { WITHDRAW_FAULT_WORDS } from "./words";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * What the supplier's screens for an online bid assemble (SR-13, rulings 20s, 20an, 20ab; build plan step 11). The closing is 4 November 2026 at 12:00:00 in Kuala Lumpur (04:00:00 UTC).
 */

const CLOSING = new Date("2026-11-04T04:00:00Z");
const BEFORE = new Date("2026-11-03T04:00:00Z");
const row = (o: Partial<OwnBidRow> & { id: string; sequence: number }): OwnBidRow => ({
  kind: "BID", status: "SUBMITTED", parentOnlineBidId: null, receiptDigest: String(o.sequence % 10).repeat(64), keyFingerprint: "ab".repeat(8), receivedAt: new Date("2026-11-02T03:00:00Z"), late: false, ...o,
});
const view = (rows: OwnBidRow[], over: Partial<Parameters<typeof submissionViews>[0]> = {}) =>
  submissionViews({ rows, opening: { started: false, unsealed: false, roll: null }, organisationName: "Perbadanan Contoh", timeZone: "Asia/Kuala_Lumpur", closing: CLOSING, cancelled: false, alternativesPermitted: true, now: BEFORE, ...over });

describe("a submission's own number (20an)", () => {
  it("counts the supplier's own rows by the order accepted, whatever the exercise-wide sequence was", () => {
    // The supplier's envelopes were 4, 9 and 31 of the exercise: it reads 1, 2 and 3, newest first, and the gaps (rivals) never show.
    const v = view([row({ id: "a", sequence: 4 }), row({ id: "b", sequence: 9, status: "REPLACED" }), row({ id: "c", sequence: 31 })]);
    expect(v.map((x) => [x.id, x.number])).toEqual([["c", 3], ["b", 2], ["a", 1]]);
    for (const x of v) expect(Object.keys(x)).not.toContain("sequence");
  });

  it("names the bid an alternative goes with by that bid's own number, and lists the standing alternatives a withdrawal may take", () => {
    const v = view([row({ id: "bid", sequence: 5 }), row({ id: "alt1", sequence: 7, kind: "ALTERNATIVE", parentOnlineBidId: "bid" }), row({ id: "alt2", sequence: 8, kind: "ALTERNATIVE", parentOnlineBidId: "bid", status: "WITHDRAWN" })]);
    const bid = v.find((x) => x.id === "bid")!;
    expect(bid.linked).toEqual([{ id: "alt1", number: 2 }]);
    expect(v.find((x) => x.id === "alt1")!.parentNumber).toBe(1);
  });
});

describe("an alternative where alternatives are not permitted (20am)", () => {
  it("is marked not considered, and only an alternative, and only where the exercise says no", () => {
    const rows = [row({ id: "bid", sequence: 1 }), row({ id: "alt", sequence: 2, kind: "ALTERNATIVE", parentOnlineBidId: "bid" })];
    expect(view(rows, { alternativesPermitted: false }).map((v) => [v.id, v.notConsidered]).sort()).toEqual([["alt", true], ["bid", false]]);
    expect(view(rows, { alternativesPermitted: true }).some((v) => v.notConsidered)).toBe(false);
    expect(view(rows, { alternativesPermitted: null }).some((v) => v.notConsidered)).toBe(false);
  });
});

describe("Withdraw is offered only while the rules allow it", () => {
  it("allowed up to the closing second, not after it, not for one that no longer stands", () => {
    expect(view([row({ id: "a", sequence: 1 })])[0].withdraw).toEqual({ allowed: true });
    const after = view([row({ id: "a", sequence: 1 })], { now: new Date(CLOSING.getTime() + 1000) })[0].withdraw;
    expect(after).toEqual({ allowed: false, reason: WITHDRAW_FAULT_WORDS.AFTER_CLOSING });
    expect(view([row({ id: "a", sequence: 1, status: "WITHDRAWN" })])[0].withdraw).toEqual({ allowed: false, reason: WITHDRAW_FAULT_WORDS.NOT_LIVE });
    expect(view([row({ id: "a", sequence: 1 })], { cancelled: true })[0].withdraw).toMatchObject({ allowed: false });
  });
});

describe("from the opening's start, the four states and the digest in full (20s)", () => {
  const roll = (entries: { sequence: number; receiptDigest: string; late: boolean }[]) => ({ entries });
  const started = (r: ReturnType<typeof roll> | null, unsealed = false) => ({ started: true, unsealed, roll: r });

  it("shows nothing before the start", () => {
    expect(view([row({ id: "a", sequence: 1 })])[0].opening).toBeNull();
  });

  it("listed: the roll's digest, in full, in both languages, with the request to compare it with the receipt kept", () => {
    const digest = "c".repeat(64);
    const [v] = view([row({ id: "a", sequence: 12, receiptDigest: "d".repeat(64) })], { opening: started(roll([{ sequence: 12, receiptDigest: digest, late: false }])) });
    expect(v.opening!.digest).toBe(digest);
    expect(v.opening!.detail.en).toContain(digest);
    expect(v.opening!.detail.en).toMatch(/Compare with your receipt/); // 0005, founder 2026-10-19: instruction cut, digest stays in full
  });

  it("late in the roll, not in the roll (naming the organisation), opened, and replaced or withdrawn (not opened, as expected)", () => {
    const rows = [row({ id: "late", sequence: 1, late: true }), row({ id: "gone", sequence: 2 }), row({ id: "opened", sequence: 3, status: "OPENED" }), row({ id: "old", sequence: 4, status: "REPLACED" })];
    const out = Object.fromEntries(view(rows, { opening: started(roll([{ sequence: 1, receiptDigest: "e".repeat(64), late: true }]), true) }).map((x) => [x.id, x.opening!]));
    expect(out.late.headline.en).toMatch(/Received after the closing/);
    expect(out.gone.headline.en).toMatch(/not in the opening's list/);
    expect(out.gone.detail.en).toContain("Perbadanan Contoh");
    // Stage C security audit nit: the list holds no digest for it, but the supplier's own recorded one is shown with words that say so (S11).
    expect(out.gone.digest).toBe("2".repeat(64));
    expect(out.gone.detail.en).toContain("The digest recorded when you submitted is"); // 0005, founder 2026-10-19: shortened
    expect(out.gone.detail.en).toContain("The opening's list holds none"); // 0005, founder 2026-10-19: shortened
    expect(out.opened.headline.en).toBe("Opened; the result follows the evaluation");
    expect(out.old.headline.en).toBe("Not opened, as expected");
  });

  it("claims nothing of a standing submission when the opening started but its list is not recorded", () => {
    const [v] = view([row({ id: "a", sequence: 1 })], { opening: started(null) });
    expect(v.opening).toBeNull();
    expect(v.openingListMissing).toBe(true);
  });
});

describe("the parts a bidder returns", () => {
  const rule = (o: Partial<BidPartRule>): BidPartRule => ({ packPartId: "p1", label: "Form of Tender", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "5242880", openingCheck: true, ...o });

  it("shows the types and the largest file in words, the smaller of the part's limit and the deployment's ceiling", () => {
    const [p] = partViews([rule({})], [], BigInt(2 * 1024 * 1024), null);
    expect(p.types).toEqual({ en: "PDF" });
    expect(p.largest).toEqual(bytesWords(BigInt(2 * 1024 * 1024)));
    expect(p.largest!.en).toBe("2 MB");
    expect(p.uploadable).toBe(true);
  });

  it("is not uploadable where the types or the size are not set, and says so by being null, never as an empty list", () => {
    expect(partViews([rule({ acceptedMediaTypes: [] })], [], BigInt(1024), null)[0]).toMatchObject({ types: null, uploadable: false });
    expect(partViews([rule({})], [], null, null)[0]).toMatchObject({ largest: null, uploadable: false });
    expect(partViews([rule({ maxBytes: "x" })], [], BigInt(1024), null)[0].largest).toBeNull();
  });

  it("leaves out a part the bidder does not return, and takes the newest waiting file for a part", () => {
    const drafts = [{ id: "old", packPartId: "p1", uploadedAt: new Date("2026-11-01T01:00:00Z") }, { id: "new", packPartId: "p1", uploadedAt: new Date("2026-11-01T02:00:00Z") }];
    const views = partViews([rule({}), rule({ packPartId: "p2", returnedByBidder: false })], drafts, BigInt(1024 * 1024), "Asia/Kuala_Lumpur");
    expect(views.map((v) => v.packPartId)).toEqual(["p1"]);
    expect(views[0].draft?.fileId).toBe("new");
  });

  it("never shows a media type: an unknown one reads as a type the portal does not recognise", () => {
    const [p] = partViews([rule({ acceptedMediaTypes: ["application/x-odd"] })], [], BigInt(1024), null);
    expect(p.types!.en).not.toContain("/");
  });
});

describe("the choices the submit page offers, and the stamp's text", () => {
  it("offers only standing submissions to replace, and only a standing bid as the parent of an alternative", () => {
    const v = view([row({ id: "bid", sequence: 1 }), row({ id: "alt", sequence: 2, kind: "ALTERNATIVE", parentOnlineBidId: "bid" }), row({ id: "gone", sequence: 3, status: "WITHDRAWN" })]);
    const c = standingChoices(v);
    expect(c.replaceable.map((x) => x.id).sort()).toEqual(["alt", "bid"]);
    expect(c.replaceable.find((x) => x.id === "alt")!.parentId).toBe("bid");
    expect(c.parents.map((x) => x.id)).toEqual(["bid"]);
  });

  it("reads the stamp to the second on the organisation's clock, and says UTC where no zone is set", () => {
    const t = new Date("2026-11-04T04:00:07Z");
    expect(stampText(t, "Asia/Kuala_Lumpur")).toBe("04 Nov 2026, 12:00:07");
    expect(stampText(t, null)).toBe("04 Nov 2026, 04:00:07 (UTC)");
  });

  it("says the size of a small file in bytes, in both languages", () => {
    expect(bytesWords(BigInt(500))).toEqual({ en: "500 bytes" });
  });
});

describe("files discarded because the key changed (step 8's review)", () => {
  it("is one entry per fingerprint the files were sealed to, with the fingerprint live now", () => {
    expect(discardedNotices([{ keyFingerprint: "aa" }, { keyFingerprint: "bb" }, { keyFingerprint: "aa" }], "cc")).toEqual([
      { sealedTo: "aa", now: "cc", files: 2 },
      { sealedTo: "bb", now: "cc", files: 1 },
    ]);
    expect(discardedNotices([], "cc")).toEqual([]);
  });

});
