import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { receiptDigest } from "@/lib/bids/online/receipt";
import type { BidPartRule } from "@/lib/bids/online/types";
import { PEPPER_NOT_HELD_WORDS } from "@/lib/sealing/kdf";
import { afterWrongPassphrase, passphraseGate } from "@/lib/sealing/passphrase";

import { CLOSING, PANEL, S, at, open } from "./fixture";
import { openingFindingText } from "./labels";
import { bidCheckFaults, grantPlan, parseManifest, rollEntries, unsealSelection, type BidRow } from "./online-unseal";
import { openingPhase, requiredAuthorisations } from "./state";
import { onlineStartFaults, skewElapsed, startFaults } from "./start";
import { actFaults, openingState } from "./state";
import { authorisationFaults, lapsedByAdjourning, opensTheBox, unsealState } from "./unseal";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const people = ["p1", "p2", "p3"];
const panel3 = people.map((personId) => ({ personId, present: true }));
const auth = (personId: string, sittingNo = 1) => ({ id: `a-${personId}-${sittingNo}`, personId, sittingNo, recordedAt: at(2 * S), lapsedAt: null });

describe("how many authorise (ADR 0036 D10, ruling 20k): two on paper, the roster's n online", () => {
  it("is two on paper however large the panel, and the panel's size online, never fewer than two", () => {
    expect(requiredAuthorisations("PAPER", 5)).toBe(2);
    expect(requiredAuthorisations(null, 3)).toBe(2);
    expect(requiredAuthorisations("ONLINE", 3)).toBe(3);
    expect(requiredAuthorisations("ONLINE", 2)).toBe(2);
    expect(requiredAuthorisations("ONLINE", 1)).toBe(2);
  });

  it("unsealState: n = 3 awaits until the third, and paper still ends at two", () => {
    expect(unsealState(1, [auth("p1")], panel3, 3)).toEqual({ state: "AWAITING_SECOND", count: 1 });
    expect(unsealState(1, [auth("p1"), auth("p2")], panel3, 3)).toEqual({ state: "AWAITING_SECOND", count: 2 });
    expect(unsealState(1, [auth("p1"), auth("p2"), auth("p3")], panel3, 3)).toEqual({ state: "AUTHORISED", count: 3 });
    expect(unsealState(1, [auth("p1"), auth("p2")], panel3, 2).state).toBe("AUTHORISED");
  });

  it("opensTheBox: the third authorisation opens an n = 3 unseal, the second does not; paper's second does", () => {
    const notYet = open({ unsealed: false, sittingAuthorised: false });
    expect(opensTheBox(notYet, 2, 3)).toBe(false);
    expect(opensTheBox(notYet, 3, 3)).toBe(true);
    expect(opensTheBox(notYet, 2, 2)).toBe(true);
    expect(opensTheBox(open(), 3, 3)).toBe(false);
  });

  it("SITTING_AUTHORISED: the third officer is not refused at n = 3 (the second would be refused on paper), and a fourth is", () => {
    const base = { state: open({ unsealed: false, sittingAuthorised: false, required: 3 }), panel: [...panel3, { personId: "p4", present: true }], personId: "p3", recorderId: null, now: at(S), closing: CLOSING, boxLocked: false, online: true, required: 3 };
    expect(authorisationFaults({ ...base, auths: [auth("p1"), auth("p2")] }).map((f) => f.code)).toEqual([]);
    expect(authorisationFaults({ ...base, personId: "p4", auths: [auth("p1"), auth("p2"), auth("p3")] }).map((f) => f.code)).toEqual(["SITTING_AUTHORISED"]);
    const paper = { ...base, online: false, required: 2, boxLocked: true, state: open({ unsealed: false, sittingAuthorised: false }) };
    expect(authorisationFaults({ ...paper, auths: [auth("p1"), auth("p2")] }).map((f) => f.code)).toEqual(["SITTING_AUTHORISED"]);
  });

  it("online: the closing second itself is refused, and the next second is not (review nit)", () => {
    const base = { state: open({ unsealed: false, sittingAuthorised: false, required: 3 }), panel: panel3, auths: [], personId: "p1", recorderId: null, closing: CLOSING, boxLocked: false, online: true, required: 3 };
    expect(authorisationFaults({ ...base, now: CLOSING }).map((f) => f.code)).toEqual(["AT_OR_BEFORE_CLOSING"]);
    expect(authorisationFaults({ ...base, now: new Date(CLOSING.getTime() + S) }).map((f) => f.code)).toEqual([]);
  });

  it("an online main opening does not ask the box's lock; paper does", () => {
    const base = { state: open({ unsealed: false, sittingAuthorised: false }), panel: PANEL, auths: [], personId: "p1", recorderId: null, now: at(S), closing: CLOSING, boxLocked: false, required: 2 };
    expect(authorisationFaults(base).map((f) => f.code)).toEqual(["BOX_NOT_LOCKED"]);
    expect(authorisationFaults({ ...base, online: true }).map((f) => f.code)).toEqual([]);
  });

  it("lapsedByAdjourning: n - 1 of n lapse, n do not, and paper's pair does not", () => {
    expect(lapsedByAdjourning(1, [auth("p1"), auth("p2")], panel3, 3)).toEqual(["a-p1-1", "a-p2-1"]);
    expect(lapsedByAdjourning(1, [auth("p1"), auth("p2"), auth("p3")], panel3, 3)).toEqual([]);
    expect(lapsedByAdjourning(1, [auth("p1"), auth("p2")], panel3, 2)).toEqual([]);
  });

  it("the state counts to n: two of three is not a sitting authorised, and the phase and the faults say so in words", () => {
    // Review: the words follow the channel, not the count, so an online state names itself.
    const o = { kind: "MAIN" as const, unsealedAt: at(S), finalisedAt: null, online: true };
    const two = openingState(o, [{ sittingNo: 1, adjournedAt: null }], [auth("p1"), auth("p2")], panel3, 3);
    expect(two.sittingAuthorised).toBe(false);
    expect(openingPhase(two)).toBe("AWAITING_REAUTHORISATION");
    expect(openingFindingText(actFaults(two)[0])).toMatch(/All 3 named officers/);
    const three = openingState(o, [{ sittingNo: 1, adjournedAt: null }], [auth("p1"), auth("p2"), auth("p3")], panel3, 3);
    expect(three.sittingAuthorised).toBe(true);
    // An online roster of two is still every named officer, with no box (review): the words follow the channel, never the count.
    const panel2 = [{ personId: "p1", present: true }, { personId: "p2", present: true }];
    const noneYet = openingState({ ...o, unsealedAt: null }, [{ sittingNo: 1, adjournedAt: null }], [], panel2, 2);
    expect(openingFindingText(actFaults(noneYet)[0])).toMatch(/All 2 named opening officers/);
    expect(openingFindingText(actFaults(noneYet)[0])).not.toMatch(/box|panel members present/);
    const resting = openingState(o, [{ sittingNo: 1, adjournedAt: null }], [auth("p1")], panel2, 2);
    expect(openingFindingText(actFaults(resting)[0])).toMatch(/All 2 named officers/);
    expect(openingFindingText(actFaults(openingState({ ...o, online: false, unsealedAt: null }, [{ sittingNo: 1, adjournedAt: null }], [], PANEL))[0])).toMatch(/Two present panel members/);
  });
});

describe("starting an online opening (20aa, H2)", () => {
  const closing = new Date("2026-11-17T06:30:00.000Z");
  it("the skew is strict: at closing + 30 s an in-time act can still commit, one millisecond later none can", () => {
    expect(skewElapsed(new Date(closing.getTime() + 30_000), closing, 30)).toBe(false);
    expect(skewElapsed(new Date(closing.getTime() + 30_001), closing, 30)).toBe(true);
    expect(skewElapsed(closing, closing, 30)).toBe(false);
  });
  const key = { officerCount: 3, shareHolders: 3 };
  const ok = { closing, clock: new Date(closing.getTime() + 31_000), skewSeconds: 30, rosterOfficers: 3, key };
  it("passes once the clock is past the skew, with a live key across exactly the officers named", () => expect(onlineStartFaults(ok)).toEqual([]));
  it("refuses inside the skew in words that say how long to wait, never a code", () => {
    const f = onlineStartFaults({ ...ok, clock: new Date(closing.getTime() + 10_000) });
    expect(f.map((x) => x.code)).toEqual(["SKEW_NOT_ELAPSED"]);
    const words = openingFindingText(f[0]);
    expect(words).toMatch(/Try again in 21 seconds/);
  });
  it("KEY_OFFICERS_MISMATCH says the officers changed when the counts are the same, and gives the counts when they differ (review)", () => {
    expect(openingFindingText({ code: "KEY_OFFICERS_MISMATCH", level: "block", data: { officers: 2, keyOfficers: 2 } })).toMatch(/Officers differ from those the key was split across/);
    expect(openingFindingText({ code: "KEY_OFFICERS_MISMATCH", level: "block", data: { officers: 3, keyOfficers: 2 } })).toMatch(/split across 2 officers, 3 named/);
  });
  it("refuses no live key, a key split across other officers, a roster of one, and an unset closing", () => {
    expect(onlineStartFaults({ ...ok, key: null }).map((f) => f.code)).toEqual(["KEY_NOT_LIVE"]);
    expect(onlineStartFaults({ ...ok, key: { officerCount: 2, shareHolders: 2 } }).map((f) => f.code)).toEqual(["KEY_OFFICERS_MISMATCH"]);
    expect(onlineStartFaults({ ...ok, rosterOfficers: 1, key: { officerCount: 1, shareHolders: 1 } }).map((f) => f.code)).toEqual(["OFFICERS_FEWER_THAN_TWO"]);
    expect(onlineStartFaults({ ...ok, closing: null }).map((f) => f.code)).toEqual(["CLOSING_NOT_SET"]);
  });
  it("startFaults does not ask the box's lock online, and does on paper", () => {
    const base = { status: "ADVERTISED", packKind: "TENDER", publishedThroughWindow: true, timeZone: "Asia/Kuala_Lumpur", phase: "CLOSED" as const, boxLocked: false, changePending: false, mainExists: false, personActive: true };
    expect(startFaults(base).map((f) => f.code)).toEqual(["BOX_NOT_LOCKED"]);
    expect(startFaults({ ...base, channel: "ONLINE" })).toEqual([]);
  });
});

describe("the passphrase's own lockout (D4, 20v)", () => {
  const policy = { maxFailedAttempts: 3, lockoutMinutes: 15 };
  const now = new Date("2026-11-17T08:00:00Z");
  it("is not attempted where the sign-in lockout limits are unset: an unset limit is not an unlimited one", () => {
    expect(passphraseGate({ failedAttempts: 0, lockedUntil: null }, { maxFailedAttempts: null, lockoutMinutes: 15 }, now)).toBe("LOCKOUT_NOT_SET");
    expect(passphraseGate({ failedAttempts: 0, lockedUntil: null }, { maxFailedAttempts: 3, lockoutMinutes: null }, now)).toBe("LOCKOUT_NOT_SET");
  });
  it("counts wrong entries to the limit, then locks for the minutes, and a lock that has run out is gone", () => {
    let key = { failedAttempts: 0, lockedUntil: null as Date | null };
    expect(passphraseGate(key, policy, now)).toBeNull();
    key = afterWrongPassphrase(key, policy, now);
    key = afterWrongPassphrase(key, policy, now);
    expect(key).toEqual({ failedAttempts: 2, lockedUntil: null });
    key = afterWrongPassphrase(key, policy, now);
    expect(key.lockedUntil).toEqual(new Date(now.getTime() + 15 * 60_000));
    expect(passphraseGate(key, policy, now)).toBe("LOCKED");
    expect(passphraseGate(key, policy, new Date(now.getTime() + 16 * 60_000))).toBeNull();
  });
  it("a pepper this copy does not hold has words of its own, the same ones the key derivation gives", () => {
    expect(openingFindingText({ code: "PEPPER_NOT_HELD", level: "block" })).toBe(PEPPER_NOT_HELD_WORDS);
  });
});

describe("one bid against its own record", () => {
  const FILE = { fileId: "f1", packPartId: "pt1", cipherSha256: sha("body") };
  const sealedManifest = new TextEncoder().encode("manifest ciphertext");
  const sealedDeclaration = new TextEncoder().encode("declaration ciphertext");
  const stamp = new Date("2026-11-17T06:00:00.000Z");
  const fp = "c".repeat(64);
  const row = (): BidRow => {
    const manifestCipherSha256 = createHash("sha256").update(sealedManifest).digest("hex");
    const declarationCipherSha256 = createHash("sha256").update(sealedDeclaration).digest("hex");
    return {
      id: "b1", exerciseId: "e1", supplierId: "s1", accountId: "a1", kind: "BID", parentOnlineBidId: null, replacesOnlineBidId: null, keyId: "k1", sequence: 4, receivedAt: stamp,
      sealedManifest, sealedDeclaration, manifestCipherSha256, declarationCipherSha256,
      receiptDigest: receiptDigest({ exerciseId: "e1", submissionNumber: 1, receivedAt: stamp, keyFingerprint: fp, manifestCipherSha256, declarationCipherSha256, fileCipherSha256s: [FILE.cipherSha256] }),
      files: [FILE],
    };
  };
  const manifestOf = (b: BidRow, over: Record<string, unknown> = {}) =>
    parseManifest({ v: 1, exerciseId: b.exerciseId, onlineBidId: b.id, supplierId: b.supplierId, supplierAccountId: b.accountId, kind: b.kind, parentOnlineBidId: null, replacesOnlineBidId: null, files: [FILE], declarationCipherSha256: b.declarationCipherSha256, ...over });
  const check = (b: BidRow, over: Partial<Parameters<typeof bidCheckFaults>[0]> = {}) =>
    bidCheckFaults({ bid: b, manifest: manifestOf(b), liveKey: { id: "k1", fingerprint: fp }, submissionNumber: 1, rollEntry: { sequence: 4, receiptDigest: b.receiptDigest, late: false }, replacedBy: () => null, withdrawnClearedLink: false, ...over });

  it("is clean when everything agrees", () => expect(check(row())).toEqual([]));
  it("names a manifest sealed for another supplier, account, kind or replacement", () => {
    const b = row();
    expect(check(b, { manifest: manifestOf(b, { supplierId: "s2" }) })).toEqual(["BID_MANIFEST_BINDING"]);
    expect(check(b, { manifest: manifestOf(b, { supplierAccountId: "a2" }) })).toEqual(["BID_MANIFEST_BINDING"]);
    expect(check(b, { manifest: manifestOf(b, { onlineBidId: "b9" }) })).toEqual(["BID_MANIFEST_BINDING"]);
    expect(check(b, { manifest: manifestOf(b, { replacesOnlineBidId: "b0" }) })).toEqual(["BID_MANIFEST_BINDING"]);
    expect(check(b, { manifest: null })).toEqual(["BID_MANIFEST_BINDING"]);
  });
  it("names a changed ciphertext digest, file list, receipt digest, key and roll entry", () => {
    const b = row();
    expect(check({ ...b, manifestCipherSha256: sha("other") })).toContain("BID_MANIFEST_DIGEST");
    expect(check({ ...b, declarationCipherSha256: sha("other") })).toContain("BID_DECLARATION_DIGEST");
    expect(check(b, { manifest: manifestOf(b, { declarationCipherSha256: sha("other") }) })).toEqual(["BID_DECLARATION_DIGEST"]);
    expect(check(b, { manifest: manifestOf(b, { files: [{ ...FILE, cipherSha256: sha("swapped") }] }) })).toEqual(["BID_FILES"]);
    expect(check(b, { manifest: manifestOf(b, { files: [FILE, FILE] }) })).toContain("BID_FILES");
    expect(check({ ...b, receiptDigest: sha("forged") }, { rollEntry: { sequence: 4, receiptDigest: sha("forged"), late: false } })).toEqual(["BID_RECEIPT_DIGEST"]);
    expect(check(b, { submissionNumber: 2 })).toEqual(["BID_RECEIPT_DIGEST"]);
    expect(check({ ...b, keyId: "k0" })).toContain("BID_KEY");
    expect(check(b, { rollEntry: null })).toEqual(["BID_NOT_IN_ROLL"]);
    expect(check(b, { rollEntry: { sequence: 4, receiptDigest: sha("listed otherwise"), late: false } })).toEqual(["BID_ROLL_CHANGED"]);
    expect(check(b, { rollEntry: { sequence: 4, receiptDigest: b.receiptDigest, late: true } })).toEqual(["BID_ROLL_CHANGED"]);
  });
  it("judges an alternative's parent by following replacements, and refuses a jump", () => {
    const b = { ...row(), kind: "ALTERNATIVE" as const, parentOnlineBidId: "A3" };
    const chain = (id: string) => ({ A1: "A2", A2: "A3" })[id as "A1"] ?? null;
    expect(check(b, { manifest: manifestOf(b, { kind: "ALTERNATIVE", parentOnlineBidId: "A1" }), replacedBy: chain })).toEqual([]);
    expect(check(b, { manifest: manifestOf(b, { kind: "ALTERNATIVE", parentOnlineBidId: "B1" }), replacedBy: chain })).toEqual(["BID_PARENT"]);
  });
  it("the words name the receipt's number and nothing of the bidder, and are not a code", () => {
    for (const code of ["BID_MANIFEST_DIGEST", "BID_PARENT", "BID_FILES", "BID_RECEIPT_DIGEST", "BID_NOT_IN_ROLL", "BID_ROLL_CHANGED", "BID_KEY", "PARTY_NOT_FOUND"]) {
      const t = openingFindingText({ code, level: "block", data: { sequence: 4 } });
      expect(t).toMatch(/number 4/);
      expect(t).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
    }
  });
});

describe("the manifest is read strictly", () => {
  const ok = { v: 1, exerciseId: "e", onlineBidId: "b", supplierId: "s", supplierAccountId: "a", kind: "BID", parentOnlineBidId: null, replacesOnlineBidId: null, files: [{ fileId: "f", packPartId: "p", cipherSha256: "a".repeat(64) }], declarationCipherSha256: "b".repeat(64) };
  it("accepts what sealSubmission writes and nothing else", () => {
    expect(parseManifest(ok)).not.toBeNull();
    expect(parseManifest({ ...ok, extra: 1 })).toBeNull();
    expect(parseManifest({ ...ok, v: 2 })).toBeNull();
    expect(parseManifest({ ...ok, kind: "OTHER" })).toBeNull();
    expect(parseManifest({ ...ok, files: [{ fileId: "f", packPartId: "p", cipherSha256: "zz", extra: 1 }] })).toBeNull();
    expect(parseManifest({ ...ok, declarationCipherSha256: "short" })).toBeNull();
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest([])).toBeNull();
  });
});

describe("which submissions the main unseal opens (D7, D10)", () => {
  const roll = [{ sequence: 1, late: false }, { sequence: 3, late: false }, { sequence: 5, late: true }];
  it("opens the SUBMITTED in-time bids in the roll, holds the late one for a supplementary opening, and never touches REPLACED or WITHDRAWN", () => {
    const r = unsealSelection({
      bids: [
        { id: "a", sequence: 1, status: "SUBMITTED", late: false },
        { id: "b", sequence: 2, status: "REPLACED", late: false },
        { id: "c", sequence: 3, status: "SUBMITTED", late: false },
        { id: "d", sequence: 4, status: "WITHDRAWN", late: false },
        { id: "e", sequence: 5, status: "SUBMITTED", late: true },
      ],
      roll,
    });
    expect(r).toEqual({ open: ["a", "c"], waiting: ["e"], faults: [] });
  });
  it("blocks on an in-time bid the roll does not list, and on a listed bid that has since moved", () => {
    const r = unsealSelection({ bids: [{ id: "a", sequence: 1, status: "SUBMITTED", late: false }, { id: "x", sequence: 9, status: "SUBMITTED", late: false }, { id: "c", sequence: 3, status: "WITHDRAWN", late: false }], roll });
    expect(r.faults).toEqual([{ sequence: 9, fault: "BID_NOT_IN_ROLL" }, { sequence: 3, fault: "BID_ROLL_CHANGED" }]);
  });
  it("reads the roll the start froze, and refuses another shape", () => {
    expect(rollEntries({ v: 1, entries: [{ sequence: 1, receiptDigest: "d", late: false }], rollDigest: "x" })).toEqual([{ sequence: 1, receiptDigest: "d", late: false }]);
    expect(rollEntries(null)).toBeNull();
    expect(rollEntries({ v: 2, entries: [] })).toBeNull();
    expect(rollEntries({ v: 1, entries: [{ sequence: "1" }] })).toBeNull();
  });
});

describe("the data keys re-sealed to each named officer (H3 option a, 20t)", () => {
  const rule = (packPartId: string, openingCheck: boolean): BidPartRule => ({ packPartId, label: packPartId, mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1", openingCheck });
  it("grants OPENING_CHECK for an opening-check part, FINALISE for every other file and for the declaration", () => {
    expect(grantPlan({ files: [{ fileId: "f1", packPartId: "a" }, { fileId: "f2", packPartId: "b" }, { fileId: "f3", packPartId: "unruled" }], declarationBidId: "bid1", rules: [rule("a", true), rule("b", false)] })).toEqual([
      { subject: "FILE", recordId: "f1", use: "OPENING_CHECK" },
      { subject: "FILE", recordId: "f2", use: "FINALISE" },
      { subject: "FILE", recordId: "f3", use: "FINALISE" },
      { subject: "DECLARATION", recordId: "bid1", use: "FINALISE" },
    ]);
  });
});
