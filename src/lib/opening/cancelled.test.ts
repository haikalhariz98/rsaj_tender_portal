import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import { cancelFaults } from "@/lib/window/change";

import { registerBoxFaults } from "./box";
import { finaliseFaults, markFaults, recordFaults } from "./finalise";
import { ALL_PRESENT, CHECKLIST, CLOSING, PANEL, S, at, open } from "./fixture";
import { openingFindingText } from "./labels";
import { alternativeInsideFaults, correctionFaults, openFaults } from "./open";
import { actFaults, openingState } from "./state";
import { adjournFaults, authorisationFaults } from "./unseal";
import { verdictFaults } from "./verdict";
import { findingFaults, matchFaults } from "./withdrawals";

/**
 * Review M-1: an opening on a cancelled exercise records nothing more. Every act asks
 * `actFaults`, `authorisationFaults` or `adjournFaults` first, and each refuses CANCELLED before
 * anything else; the exercise is not cancelled while any opening, a supplementary one included, sits.
 */

const cancelled = open({ cancelled: true });
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("the opening's state reads the exercise's cancellation", () => {
  it("a CANCELLED exercise's opening is cancelled; any other status is not", () => {
    const sittings = [{ sittingNo: 1, adjournedAt: null }];
    const o = { kind: "MAIN" as const, unsealedAt: at(S), finalisedAt: null };
    expect(openingState({ ...o, exerciseStatus: "CANCELLED" }, sittings, [], PANEL).cancelled).toBe(true);
    expect(openingState({ ...o, exerciseStatus: "OPENING_IN_PROGRESS" }, sittings, [], PANEL).cancelled).toBe(false);
  });
  it("its words say nothing more is recorded", () => expect(openingFindingText({ code: "CANCELLED", level: "block" })).toMatch(/nothing more is recorded at its opening/));
});

describe("every act refuses CANCELLED, first and alone", () => {
  it("the shared check, even on an opening otherwise open and authorised", () => {
    expect(actFaults(cancelled)).toEqual([{ code: "CANCELLED", level: "block" }]);
    expect(actFaults(open({ cancelled: true, finalised: true }))).toEqual([{ code: "CANCELLED", level: "block" }]);
  });
  it("recordAuthorisation", () => {
    expect(codes(authorisationFaults({ state: { ...cancelled, unsealed: false, sittingAuthorised: false }, panel: PANEL, auths: [], personId: "p1", recorderId: null, now: at(S), closing: CLOSING, boxLocked: true }))).toEqual(["CANCELLED"]);
  });
  it("sittingAct: neither adjourned nor resumed", () => {
    expect(codes(adjournFaults({ state: cancelled, reason: "x", personActive: true, resume: false }))).toEqual(["CANCELLED"]);
    expect(codes(adjournFaults({ state: { ...cancelled, adjourned: true }, reason: "x", personActive: true, resume: true }))).toEqual(["CANCELLED"]);
  });
  it("openEnvelope, recordAlternative, correctAsRead", () => {
    expect(codes(openFaults({ state: cancelled, envelope: { id: "e3", kind: "BID", status: "RECEIVED", late: false }, withdrawn: false, admittedEnvelopeId: null, bidder: { partyId: "x", name: "", registrationNo: "", registrationTaken: false }, price: parseSen("1.00"), period: { value: null, unit: null }, isAlternative: false, alternativesPermitted: false, parent: null, timeZone: "Asia/Kuala_Lumpur" }))).toEqual(["CANCELLED"]);
    expect(codes(alternativeInsideFaults({ state: cancelled, main: { openingMatches: true, isAlternative: false }, alternativesPermitted: true, price: parseSen("1.00"), period: { value: null, unit: null } }))).toEqual(["CANCELLED"]);
    // Review S6: correctionFaults now names whether the price was read; a paper bid's always is.
    expect(codes(correctionFaults({ state: cancelled, sameOpening: true, reason: "slip", changed: true, price: parseSen("1.00"), period: { value: null, unit: null }, priceRead: true }))).toEqual(["CANCELLED"]);
  });
  it("recordInitial, recordSignature, recordScheduleDetails", () => {
    expect(codes(markFaults({ state: cancelled, panel: PANEL, personId: "p1", already: false, sameOpening: true }))).toEqual(["CANCELLED"]);
    expect(codes(markFaults({ state: cancelled, panel: PANEL, personId: "p1", already: false, sameOpening: true, signedOn: { day: "2026-11-17", today: "2026-11-17", startDay: "2026-11-17" } }))).toEqual(["CANCELLED"]);
    expect(codes(recordFaults({ state: cancelled, pages: 2 }))).toEqual(["CANCELLED"]);
  });
  it("recordVerdict (and recordChecklistAnswer, which asks actFaults itself)", () => {
    expect(codes(verdictFaults({ state: cancelled, sameOpening: true, bid: { saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED", isAlternative: false, alternativeStatus: null }, checklist: CHECKLIST, answers: ALL_PRESENT, policy: { completenessEliminates: false, unpurchased: "REPORT" }, verdict: "PASS", reason: "" }))).toEqual(["CANCELLED"]);
    const src = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    // Re-anchored (re-review): the body runs from recordChecklistAnswer to the next exported act, recordVerdict; both anchors must be found.
    const from = src.indexOf("export async function recordChecklistAnswer(");
    const to = src.indexOf("export async function recordVerdict(");
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const answer = src.slice(from, to);
    expect(answer).toMatch(/actFaults\(stateOf\(o, l\.ex\.status\)\)/);
  });
  it("registerBoxEnvelope, matchWithdrawal, recordWithdrawalFinding", () => {
    expect(codes(registerBoxFaults({ state: cancelled, anyOpened: false, kind: "BID", markings: "T/1", personActive: true, closing: CLOSING, lockedAt: at(60 * S) }))).toContain("CANCELLED");
    expect(codes(matchFaults({ state: cancelled, withdrawal: { id: "w1", envelopeId: null, unmatchedFinding: "" }, envelope: { id: "b1", kind: "BID", status: "RECEIVED", late: false, receivedSource: "BOX_AT_OPENING" }, withdrawals: [] }))).toContain("CANCELLED");
    expect(codes(findingFaults({ state: cancelled, withdrawal: { id: "w1", envelopeId: null, unmatchedFinding: "" }, finding: "Not found", personActive: true }))).toContain("CANCELLED");
  });
  it("finaliseOpening", () => {
    expect(codes(finaliseFaults({ state: cancelled, bids: [], present: [{ personId: "p1", name: "A" }, { personId: "p2", name: "B" }], signed: ["p1", "p2"], pages: 1, checklist: CHECKLIST, withdrawals: [], unopened: 0, admittedOpened: true, completenessEliminates: false, unpurchased: "REPORT", invitedReading: "PURCHASERS", estimate: { required: false, lodged: false, paperAnswered: false }, personActive: true }))).toEqual(["CANCELLED"]);
  });
  it("every opening act's server path reads the state on the exercise's status", () => {
    const src = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    expect(src).not.toMatch(/stateOf\(o\)/);
    expect(src.match(/stateOf\(o, l\.ex\.status\)/g)?.length ?? 0).toBeGreaterThanOrEqual(14);
  });
});

describe("cancelling while an opening sits (C-9 as tightened by M-1)", () => {
  const base = { reason: "Every bid was not carried", feeRefund: false, changePending: false, awardStands: null, today: "2026-11-20" };
  it("from Opened, with a supplementary opening in progress: refused until it is adjourned", () => {
    expect(codes(cancelFaults({ ...base, status: "OPENED", openingInProgress: true }))).toEqual(["OPENING_NOT_ADJOURNED"]);
    expect(codes(cancelFaults({ ...base, status: "OPENED", openingInProgress: false }))).toEqual([]);
  });
  it("the main opening adjourned: the cancellation is asked; afterwards its opening is never resumed nor authorised again", () => {
    expect(codes(cancelFaults({ ...base, status: "OPENING_IN_PROGRESS", openingAdjourned: true, openingInProgress: false }))).toEqual([]);
    // Resumed before the cancellation applies, the new sitting is in progress again: refused.
    expect(codes(cancelFaults({ ...base, status: "OPENING_IN_PROGRESS", openingAdjourned: false, openingInProgress: true }))).toEqual(["OPENING_NOT_ADJOURNED"]);
    const adjournedThenCancelled = openingState({ kind: "MAIN", unsealedAt: at(S), finalisedAt: null, exerciseStatus: "CANCELLED" }, [{ sittingNo: 1, adjournedAt: at(600 * S) }], [], PANEL);
    expect(codes(adjournFaults({ state: adjournedThenCancelled, reason: "Resume", personActive: true, resume: true }))).toEqual(["CANCELLED"]);
    expect(codes(authorisationFaults({ state: { ...adjournedThenCancelled, sittingNo: 2, adjourned: false }, panel: PANEL, auths: [], personId: "p1", recorderId: null, now: at(900 * S), closing: CLOSING, boxLocked: true }))).toEqual(["CANCELLED"]);
  });
  it("every caller asks whether any opening is in progress", () => {
    for (const p of ["src/app/sourcing/[id]/window/change-actions.ts", "src/lib/window/read.ts"]) {
      const src = readFileSync(p, "utf8");
      const calls = src.match(/cancelFaults\(\{[^\n]*\}\)/g) ?? [];
      expect(calls.length, p).toBeGreaterThan(0);
      for (const c of calls) expect(c, p).toMatch(/openingInProgress: await openingInProgress\(/);
    }
  });
});

describe("the copy explanation on a cancelled exercise (re-review, M-1 gap)", () => {
  it("refused CANCELLED, first and alone; otherwise the explanation's own rules", async () => {
    const { explanationFaults, refuseIfCancelled } = await import("./estimate-copy");
    const base = { finalised: true, check: "MISMATCH" as const, explained: false, text: "Copy 1 was with the HoD.", personActive: true };
    expect(refuseIfCancelled(true, () => explanationFaults(base))).toEqual([{ code: "CANCELLED", level: "block" }]);
    expect(refuseIfCancelled(false, () => explanationFaults(base))).toEqual([]);
    expect(refuseIfCancelled(false, () => explanationFaults({ ...base, explained: true })).map((f) => f.code)).toEqual(["ALREADY_EXPLAINED"]);
  });
  it("recordCopyExplanation asks it on the exercise's status, and the Schedule offers it only when allowed", () => {
    const src = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const at = src.indexOf("export async function recordCopyExplanation");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at)).toMatch(/refuseIfCancelled\(l\.ex\.status === "CANCELLED", \(\) => explanationFaults\(\{ finalised: !!o\.finalisedAt/);
    expect(readFileSync("src/lib/opening/read.ts", "utf8")).toMatch(/explain: copy && o\.finalisedAt \? allowedOf\(l\.ex\.status === "CANCELLED"/);
    expect(readFileSync("src/app/sourcing/[id]/opening/workspace.tsx", "utf8")).toMatch(/action=\{o\.explain\?\.allowed \?/);
  });
});
