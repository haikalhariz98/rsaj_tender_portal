import { describe, expect, it } from "vitest";

import { saleStandingCheck } from "@/lib/suppliers/sale";
import { attendanceFaults } from "@/lib/window/events";
import { event, klAt } from "@/lib/window/fixture";
import type { WindowPhase } from "@/lib/window/phase";
import { WINDOW_PHASES } from "@/lib/window/phase";

import { acknowledgeFaults } from "./acknowledge";
import { blockingChecks, judgeRequest, preSaleChecks, requestState, undatedChecks, type PreSaleInput } from "./checks";
import { INSPECTION_REPEAT_SECONDS, inspectionReading, isRepeatInspection } from "./documents";
import { REASON_MAX, awardStands, carriesReason, hasNonAwardFaultText, issueFaults, nonAwardFaultText, nonAwardSetting, nonAwardSettingWords, outcomeText, policySnapshot, reasonToFreeze, unsuccessfulPartyIds } from "./non-award";
import { NOTICE_KIND_WORDS, sortNotices, unacknowledged, type PortalNotice } from "./notices";
import { releaseState, releaseWords } from "./release";
import { signUpFaults, signUpState, withdrawFaults, windowFault } from "./signup";
import { bidStanding } from "./standing";
import type { BidFault } from "./types";
import { supplierSees } from "./visibility";
import { bidFaultText, bidFaultViews, hasBidFaultText } from "./words";

const NOW = klAt("2026-11-02", "09:00");
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("which exercises a supplier sees", () => {
  it("a public opportunity is seen by anyone signed in", () => expect(supplierSees({ publicOpportunity: true, windowPublished: true, linkedParty: false })).toEqual({ seen: true, via: "PUBLIC" }));
  it("a confidential or invited exercise (never public) is seen only through a linked party", () => {
    expect(supplierSees({ publicOpportunity: false, windowPublished: true, linkedParty: true })).toEqual({ seen: true, via: "LINKED" });
    expect(supplierSees({ publicOpportunity: false, windowPublished: true, linkedParty: false })).toEqual({ seen: false });
  });
  it("a linked party sees nothing before the window is published: a proposed invitee is not yet invited", () => {
    expect(supplierSees({ publicOpportunity: false, windowPublished: false, linkedParty: true })).toEqual({ seen: false });
  });
});

describe("a sign-up for a briefing or site visit", () => {
  const base = { event: { startsAt: klAt("2026-11-06", "10:00"), cancelled: false, heldOn: null as string | null }, phase: "OPEN_FOR_PURCHASE" as WindowPhase, path: "ADVERTISED" as const, invited: false, representative: "Aminah Binti Yusof", existing: null, now: NOW };

  it("is accepted for an event ahead, on a window that is open, with a name", () => expect(signUpFaults(base)).toEqual([]));
  it("is accepted before the sale starts (the window is published)", () => expect(signUpFaults({ ...base, phase: "PUBLISHED" })).toEqual([]));
  it("is refused for a cancelled event, a held event and one that has begun", () => {
    expect(codes(signUpFaults({ ...base, event: { ...base.event, cancelled: true } }))).toEqual(["EVENT_CANCELLED"]);
    expect(codes(signUpFaults({ ...base, event: { ...base.event, heldOn: "2026-11-01" } }))).toEqual(["EVENT_HELD"]);
    expect(codes(signUpFaults({ ...base, now: klAt("2026-11-06", "10:00") }))).toEqual(["EVENT_STARTED"]);
    expect(codes(signUpFaults({ ...base, now: klAt("2026-11-06", "09:59") }))).toEqual([]);
  });
  it("is refused for an event with no start", () => expect(codes(signUpFaults({ ...base, event: { ...base.event, startsAt: null } }))).toEqual(["EVENT_NOT_DATED"]));
  it("is refused on a window that is not published, closed, cancelled or cannot be dated (an unset zone is not UTC)", () => {
    expect(codes(signUpFaults({ ...base, phase: "NOT_PUBLISHED" }))).toEqual(["NOT_PUBLISHED"]);
    expect(codes(signUpFaults({ ...base, phase: "CLOSED" }))).toEqual(["WINDOW_CLOSED"]);
    expect(codes(signUpFaults({ ...base, phase: "CANCELLED" }))).toEqual(["EXERCISE_CANCELLED"]);
    expect(codes(signUpFaults({ ...base, phase: "UNKNOWN" }))).toEqual(["WINDOW_NOT_DATED"]);
  });
  it("on the invited path accepts only an invitee whose letter was issued", () => {
    expect(codes(signUpFaults({ ...base, path: "INVITED", invited: false }))).toEqual(["NOT_INVITED"]);
    expect(signUpFaults({ ...base, path: "INVITED", invited: true })).toEqual([]);
  });
  it("asks for a name of a sensible length, and refuses a second sign-up that stands", () => {
    expect(codes(signUpFaults({ ...base, representative: "   " }))).toEqual(["REPRESENTATIVE_REQUIRED"]);
    expect(codes(signUpFaults({ ...base, representative: "x".repeat(241) }))).toEqual(["REPRESENTATIVE_TOO_LONG"]);
    expect(codes(signUpFaults({ ...base, existing: { endedAt: null } }))).toEqual(["ALREADY_SIGNED_UP"]);
    // After a withdrawal it may be made again.
    expect(signUpFaults({ ...base, existing: { endedAt: NOW } })).toEqual([]);
  });

  it("is withdrawn only while it stands and before the event begins", () => {
    const w = { event: base.event, phase: base.phase, now: NOW };
    expect(withdrawFaults({ ...w, existing: { endedAt: null } })).toEqual([]);
    expect(codes(withdrawFaults({ ...w, existing: null }))).toEqual(["NOT_SIGNED_UP"]);
    expect(codes(withdrawFaults({ ...w, existing: { endedAt: NOW } }))).toEqual(["NOT_SIGNED_UP"]);
    expect(codes(withdrawFaults({ ...w, existing: { endedAt: null }, now: klAt("2026-11-06", "10:30") }))).toEqual(["EVENT_STARTED"]);
  });

  it("reads its state for display", () => {
    const e = base.event;
    expect(signUpState(e, null, NOW)).toBe("NONE");
    expect(signUpState(e, { endedAt: null }, NOW)).toBe("SIGNED_UP");
    expect(signUpState(e, { endedAt: NOW }, NOW)).toBe("WITHDRAWN");
    expect(signUpState({ ...e, cancelled: true }, { endedAt: null }, NOW)).toBe("EVENT_CANCELLED");
    expect(signUpState({ ...e, heldOn: "2026-11-06" }, { endedAt: null }, NOW)).toBe("EVENT_OVER");
  });

  it("every phase is judged, and only the published ones can be acted on", () => {
    for (const p of WINDOW_PHASES) {
      const f = windowFault(p);
      expect(f == null, p).toBe(p === "PUBLISHED" || p === "OPEN_FOR_PURCHASE" || p === "CLOSED_FOR_PURCHASE");
    }
  });
});

describe("a sign-up is not attendance", () => {
  it("a mandatory event still refuses a purchase when the only thing done is a sign-up", () => {
    // The purchase gate reads the officer's register (attendeePartyIds), which no sign-up writes: a supplier that signed up and was not recorded as attending is refused.
    const ev = event({ mandatory: true, heldOn: "2026-11-06", attendeePartyIds: [] });
    expect(codes(attendanceFaults("p1", [ev], true))).toEqual(["ATTENDANCE_REQUIRED"]);
    expect(attendanceFaults("p1", [{ ...ev, attendeePartyIds: ["p1"] }], true)).toEqual([]);
  });
});

describe("an acknowledgement of an addendum", () => {
  const base = { addendum: { status: "ISSUED" }, phase: "OPEN_FOR_PURCHASE" as WindowPhase, holdsCopy: true, alreadyAcknowledged: false };
  it("is allowed once, to a purchaser who holds a copy, on an issued addendum", () => expect(acknowledgeFaults(base)).toEqual([]));
  it("is refused to a supplier whose parties hold no copy: it may read the addendum, not acknowledge it", () => expect(codes(acknowledgeFaults({ ...base, holdsCopy: false }))).toEqual(["NOT_A_PURCHASER"]));
  it("is refused for a draft or voided addendum", () => {
    expect(codes(acknowledgeFaults({ ...base, addendum: { status: "DRAFT" } }))).toEqual(["ADDENDUM_NOT_ISSUED"]);
    expect(codes(acknowledgeFaults({ ...base, addendum: { status: "VOID" } }))).toEqual(["ADDENDUM_NOT_ISSUED"]);
  });
  it("is refused twice, and after the closing or a cancellation", () => {
    expect(codes(acknowledgeFaults({ ...base, alreadyAcknowledged: true }))).toEqual(["ALREADY_ACKNOWLEDGED"]);
    expect(codes(acknowledgeFaults({ ...base, phase: "CLOSED" }))).toEqual(["WINDOW_CLOSED"]);
    expect(codes(acknowledgeFaults({ ...base, phase: "CANCELLED" }))).toEqual(["EXERCISE_CANCELLED"]);
  });
});

describe("the pre-sale checks (FR-ADV-010)", () => {
  const clear = saleStandingCheck({ status: "REGISTERED", standing: "ACTIVE", lapseRuleNotSet: false, cancelled: false, barredOtherwise: false }, { registerRequiredForSale: true });
  const base: PreSaleInput = { phase: "OPEN_FOR_PURCHASE", path: "ADVERTISED", invited: false, register: clear, restrictedTender: false, restrictionLabel: null, events: [], permitted: null, partyId: null, alreadyBought: false };
  const by = (cs: ReturnType<typeof preSaleChecks>, key: string) => cs.find((c) => c.key === key);

  it("passes a registered supplier on an open sale, and asks it to bring proof of authority", () => {
    const cs = preSaleChecks(base);
    expect(blockingChecks(cs)).toEqual([]);
    expect(by(cs, "ON_SALE")?.state).toBe("PASS");
    expect(by(cs, "REGISTER")?.state).toBe("PASS");
    // The officer sights papers at the counter: authority is never shown as passed.
    expect(by(cs, "AUTHORITY")?.state).toBe("BRING");
    expect(by(cs, "RESTRICTION")).toBeUndefined();
  });
  it("a restricted tender asks for the status certificate, never marking it passed", () => {
    const c = by(preSaleChecks({ ...base, restrictedTender: true, restrictionLabel: "Bumiputera class A" }), "RESTRICTION");
    expect(c?.state).toBe("BRING");
    expect(c?.detail).toContain("Bumiputera class A");
    expect(by(preSaleChecks({ ...base, restrictedTender: true }), "RESTRICTION")?.detail).toContain("original");
  });
  it("stops a supplier that is not registered, suspended, blacklisted or cancelled, in its own words", () => {
    const notReg = saleStandingCheck({ status: "APPLICANT", standing: "NOT_REGISTERED", lapseRuleNotSet: false, cancelled: false, barredOtherwise: false }, { registerRequiredForSale: true });
    expect(by(preSaleChecks({ ...base, register: notReg }), "REGISTER")).toMatchObject({ state: "BLOCK" });
    expect(by(preSaleChecks({ ...base, register: notReg }), "REGISTER")?.detail).toContain("not on the supplier register");
    for (const standing of ["SUSPENDED", "BLACKLISTED", "CANCELLED", "SUSPENDED_ON_LAPSE"] as const) {
      const barred = saleStandingCheck({ status: "REGISTERED", standing, lapseRuleNotSet: false, cancelled: standing === "CANCELLED", barredOtherwise: standing !== "CANCELLED" }, { registerRequiredForSale: true });
      const c = by(preSaleChecks({ ...base, register: barred }), "REGISTER");
      expect(c?.state, standing).toBe("BLOCK");
      expect(c?.detail, standing).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
  });
  it("says so when a lapsed document leaves the lapse rule unset, and does not stop the request", () => {
    const lapse = saleStandingCheck({ status: "REGISTERED", standing: "ACTIVE", lapseRuleNotSet: true, cancelled: false, barredOtherwise: false }, { registerRequiredForSale: true });
    const c = by(preSaleChecks({ ...base, register: lapse }), "REGISTER");
    expect(c?.state).toBe("PASS");
    expect(c?.detail).toContain("has not set whether that suspends");
  });
  it("stops a request when the sale is not open, in each phase but the open one", () => {
    for (const p of WINDOW_PHASES) {
      const c = by(preSaleChecks({ ...base, phase: p }), "ON_SALE");
      expect(c?.state, p).toBe(p === "OPEN_FOR_PURCHASE" ? "PASS" : "BLOCK");
    }
  });
  it("on the invited path stops anyone not on the list", () => {
    expect(by(preSaleChecks({ ...base, path: "INVITED", invited: false }), "INVITED")?.state).toBe("BLOCK");
    expect(by(preSaleChecks({ ...base, path: "INVITED", invited: true }), "INVITED")?.state).toBe("PASS");
    expect(by(preSaleChecks(base), "INVITED")).toBeUndefined();
  });
  it("a mandatory event stops a purchase until the officer's register has the supplier, and a sign-up does not satisfy it", () => {
    const ev = event({ mandatory: true, heldOn: null });
    expect(by(preSaleChecks({ ...base, events: [ev], permitted: true }), "ATTENDANCE")?.detail).toContain("has not been held yet");
    const held = { ...ev, heldOn: "2026-11-06" };
    const notOn = by(preSaleChecks({ ...base, events: [held], permitted: true, partyId: "p1" }), "ATTENDANCE");
    expect(notOn?.state).toBe("BLOCK");
    expect(notOn?.detail).toContain("Signing up online does not count as attending");
    expect(by(preSaleChecks({ ...base, events: [{ ...held, attendeePartyIds: ["p1"] }], permitted: true, partyId: "p1" }), "ATTENDANCE")?.state).toBe("PASS");
    // A supplier with no party the office linked is not on any register.
    expect(by(preSaleChecks({ ...base, events: [held], permitted: true, partyId: null }), "ATTENDANCE")?.state).toBe("BLOCK");
  });
  it("mandatory attendance not permitted, or not set, gates nothing and shows nothing", () => {
    const ev = event({ mandatory: true, heldOn: "2026-11-06" });
    expect(by(preSaleChecks({ ...base, events: [ev], permitted: null }), "ATTENDANCE")).toBeUndefined();
    expect(by(preSaleChecks({ ...base, events: [ev], permitted: false }), "ATTENDANCE")).toBeUndefined();
  });
  it("tells a supplier that has already bought, without blocking", () => {
    const c = by(preSaleChecks({ ...base, alreadyBought: true }), "ALREADY");
    expect(c?.state).toBe("INFO");
    expect(blockingChecks(preSaleChecks({ ...base, alreadyBought: true }))).toEqual([]);
  });

  describe("what a request does", () => {
    const passing = preSaleChecks(base);
    const blocked = preSaleChecks({ ...base, phase: "CLOSED" });
    it("is made when the checks pass and a collector is named", () => expect(judgeRequest({ checks: passing, collectorName: "Lim Wei", standing: false, alreadyBought: false })).toEqual({ outcome: "MAKE" }));
    it("is kept as a refused attempt when a check stops it", () => expect(judgeRequest({ checks: blocked, collectorName: "Lim Wei", standing: false, alreadyBought: false })).toEqual({ outcome: "REFUSED" }));
    it("asks for the collector's name first, so a wrong form is not recorded as a refusal", () => {
      const j = judgeRequest({ checks: blocked, collectorName: " ", standing: false, alreadyBought: false });
      expect(j.outcome).toBe("FAULTS");
      expect(j.outcome === "FAULTS" && codes(j.faults)).toEqual(["COLLECTOR_REQUIRED"]);
    });
    it("is not made twice while one stands, nor after a sale", () => {
      const a = judgeRequest({ checks: passing, collectorName: "Lim Wei", standing: true, alreadyBought: false });
      expect(a.outcome === "FAULTS" && codes(a.faults)).toEqual(["REQUEST_STANDS"]);
      const b = judgeRequest({ checks: passing, collectorName: "Lim Wei", standing: false, alreadyBought: true });
      expect(b.outcome === "FAULTS" && codes(b.faults)).toEqual(["ALREADY_BOUGHT"]);
    });
    it("is never made on no checks at all: an empty list is no clearance", () => {
      const j = judgeRequest({ checks: [], collectorName: "Lim Wei", standing: false, alreadyBought: false });
      expect(j.outcome === "FAULTS" && codes(j.faults)).toEqual(["WINDOW_NOT_DATED"]);
    });
    it("where the organisation's day cannot be read, the one check blocks and says so, whatever the phase said", () => {
      for (const phase of ["OPEN_FOR_PURCHASE", "PUBLISHED", "CLOSED_FOR_PURCHASE", "UNKNOWN"] as const) {
        const cs = undatedChecks(phase);
        expect(cs).toHaveLength(1);
        expect(cs[0]).toMatchObject({ key: "ON_SALE", state: "BLOCK" });
        expect(cs[0]!.detail).toContain("dates of the sale are not complete");
      }
      // A cancelled exercise still says it was cancelled.
      expect(undatedChecks("CANCELLED")[0]!.detail).toContain("cancelled");
    });
    it("reads its state: refused, withdrawn, bought, waiting", () => {
      expect(requestState({ refusedAt: NOW, endedAt: null }, false)).toBe("REFUSED");
      expect(requestState({ refusedAt: null, endedAt: NOW }, true)).toBe("WITHDRAWN");
      expect(requestState({ refusedAt: null, endedAt: null }, true)).toBe("BOUGHT");
      expect(requestState({ refusedAt: null, endedAt: null }, false)).toBe("WAITING");
    });
  });
});

describe("the tender documents: when they are released online", () => {
  const sale = { voidedAt: null as Date | null, financeReceiptNo: "R-100" as string | null };
  it("not set means nothing is released online, and is not the same as off", () => {
    expect(releaseState({ simulatorAllowed: true, setting: null, sale, phase: "OPEN_FOR_PURCHASE" })).toBe("NOT_SET");
    expect(releaseState({ simulatorAllowed: true, setting: false, sale, phase: "OPEN_FOR_PURCHASE" })).toBe("OFF");
    expect(releaseWords.NOT_SET.detail).toContain("has not set");
    expect(releaseWords.OFF.detail).not.toContain("has not set");
  });
  it("needs a sale that stands and a recorded payment receipt", () => {
    expect(releaseState({ simulatorAllowed: true, setting: true, sale: null, phase: "OPEN_FOR_PURCHASE" })).toBe("NO_SALE");
    expect(releaseState({ simulatorAllowed: true, setting: true, sale: { ...sale, voidedAt: NOW }, phase: "OPEN_FOR_PURCHASE" })).toBe("NO_SALE");
    expect(releaseState({ simulatorAllowed: true, setting: true, sale: { ...sale, financeReceiptNo: null }, phase: "OPEN_FOR_PURCHASE" })).toBe("AWAITING_RECEIPT");
    expect(releaseState({ simulatorAllowed: true, setting: true, sale: { ...sale, financeReceiptNo: "  " }, phase: "OPEN_FOR_PURCHASE" })).toBe("AWAITING_RECEIPT");
    expect(releaseState({ simulatorAllowed: true, setting: true, sale, phase: "OPEN_FOR_PURCHASE" })).toBe("READY");
  });
  it("is released from publication to the closing only, and never for a cancelled exercise", () => {
    for (const p of WINDOW_PHASES) {
      expect(releaseState({ simulatorAllowed: true, setting: true, sale, phase: p }) === "READY", p).toBe(p === "PUBLISHED" || p === "OPEN_FOR_PURCHASE" || p === "CLOSED_FOR_PURCHASE");
    }
  });
});

describe("inspecting the Tender Table Document (FR-DOC-010)", () => {
  it("is open only while available and approved", () => {
    expect(inspectionReading("AVAILABLE", { approved: true })).toEqual({ open: true });
    expect(inspectionReading("AVAILABLE", { approved: false })).toMatchObject({ open: false });
    expect(inspectionReading("AVAILABLE", null)).toMatchObject({ open: false });
    expect(inspectionReading("NOT_YET", { approved: true })).toMatchObject({ open: false, headline: "Not available yet" });
    expect(inspectionReading("WITHDRAWN", { approved: true })).toMatchObject({ open: false, headline: "No longer available" });
    expect(inspectionReading("UNKNOWN", { approved: true })).toMatchObject({ open: false });
  });
});

describe("how often an opening is written to the inspection log (Phase 4d review)", () => {
  const t0 = new Date("2026-11-02T09:00:00.000Z");
  const after = (s: number) => new Date(t0.getTime() + s * 1000);
  it("the first opening of a version is always logged", () => expect(isRepeatInspection(null, t0)).toBe(false));
  it("the same supplier opening the same version again inside the interval adds no row", () => {
    expect(isRepeatInspection(t0, after(0))).toBe(true);
    expect(isRepeatInspection(t0, after(INSPECTION_REPEAT_SECONDS - 1))).toBe(true);
  });
  it("an opening at or after the interval is a new sitting and is logged", () => {
    expect(isRepeatInspection(t0, after(INSPECTION_REPEAT_SECONDS))).toBe(false);
    expect(isRepeatInspection(t0, after(3600))).toBe(false);
  });
});

describe("where a supplier's own bid stands", () => {
  // `inResults` is new in the Phase 4d review (the award is published under Results): these cases are of a public exercise, as they always were.
  const base = { status: "OPENED" as const, closed: true, opened: true, award: null, inResults: true };
  it("before the closing the portal says bids are on paper and shows nothing of a bid", () => {
    const s = bidStanding({ ...base, status: "ADVERTISED", closed: false, opened: false });
    expect(s.stage).toBe("NOT_CLOSED");
    expect(s.detail).toContain("does not take bids");
  });
  it("after the closing, with no bid linked, says what is missing rather than that no bid was made", () => {
    const s = bidStanding({ ...base, opened: false });
    expect(s.stage).toBe("NOT_NAMED");
    expect(s.detail).toContain("linked the purchase");
    expect(s.headline).not.toMatch(/rejected|eliminated|disqualified/i);
  });
  it("shows the stage of the exercise, not the fate of the bid", () => {
    expect(bidStanding(base).stage).toBe("OPENED");
    expect(bidStanding({ ...base, status: "UNDER_EVALUATION" }).stage).toBe("UNDER_EVALUATION");
    expect(bidStanding({ ...base, status: "EVALUATED" }).stage).toBe("EVALUATED");
    for (const status of ["OPENED", "UNDER_EVALUATION", "EVALUATED"] as const) {
      const s = bidStanding({ ...base, status });
      expect(`${s.headline} ${s.detail}`, status).not.toMatch(/reject|eliminat|disqualif|score|rank|price|lowest|highest/i);
    }
  });
  it("tells whether the award went to this supplier, only once issued", () => {
    expect(bidStanding({ ...base, award: { issued: true, awardeeIsYou: true } }).stage).toBe("AWARDED_TO_YOU");
    expect(bidStanding({ ...base, award: { issued: true, awardeeIsYou: false } }).stage).toBe("AWARDED_ELSEWHERE");
    expect(bidStanding({ ...base, status: "EVALUATED", award: { issued: false, awardeeIsYou: true } }).stage).toBe("EVALUATED");
  });
  it("on an invited or confidential exercise a bidder is not told it lost, and nothing points to Results, where the award is not", () => {
    const s = bidStanding({ ...base, inResults: false, award: { issued: true, awardeeIsYou: false } });
    expect(s.stage).toBe("AWARD_ISSUED");
    expect(`${s.headline} ${s.detail}`).not.toMatch(/another company|Results|not successful|lost|eliminat|reject/i);
    // The awardee is told it won, public or not.
    expect(bidStanding({ ...base, inResults: false, award: { issued: true, awardeeIsYou: true } }).stage).toBe("AWARDED_TO_YOU");
    // A public exercise says where the award is published.
    expect(bidStanding({ ...base, award: { issued: true, awardeeIsYou: false } }).detail).toContain("Results");
  });
  it("a cancelled exercise reads as cancelled whatever else is true", () => expect(bidStanding({ ...base, status: "CANCELLED", award: { issued: true, awardeeIsYou: true } }).stage).toBe("CANCELLED"));
});

describe("the notice of non-award (FR-AWD-010, policy D7)", () => {
  const on = { nonAwardNotices: true, debriefIncludesReason: true };
  const award = { status: "ISSUED", awardeePartyId: "p-win" };
  const base = { policy: on, award, partyId: "p-lose", unsuccessful: ["p-lose", "p-other"], alreadyIssued: false, reason: "The price was above the estimate." };

  it("nothing is issued while the decision is not made, and the words say that D7 is not set", () => {
    const f = issueFaults({ ...base, policy: { nonAwardNotices: null, debriefIncludesReason: null } });
    expect(codes(f)).toEqual(["D7_NOT_SET"]);
    expect(nonAwardFaultText(f[0]!)).toContain("policy D7 is not set");
    expect(nonAwardSetting({ nonAwardNotices: null, debriefIncludesReason: null })).toBe("NOT_SET");
  });
  it("nothing is issued when the decision was against, and that reads differently from not set", () => {
    const f = issueFaults({ ...base, policy: { nonAwardNotices: false, debriefIncludesReason: null } });
    expect(codes(f)).toEqual(["D7_OFF"]);
    expect(nonAwardFaultText(f[0]!)).not.toContain("is not set");
  });
  it("is issued for an unsuccessful tenderer once the award stands", () => {
    expect(issueFaults(base)).toEqual([]);
    expect(awardStands("ISSUED")).toBe(true);
    expect(awardStands("ACCEPTED")).toBe(true);
    for (const s of ["DRAFT", "PENDING_APPROVAL", "CANCELLED", "DECLINED"]) expect(awardStands(s), s).toBe(false);
    expect(codes(issueFaults({ ...base, award: { status: "DRAFT", awardeePartyId: "p-win" } }))).toEqual(["AWARD_NOT_ISSUED"]);
  });
  it("is refused for the winner, a stranger, and an award that names no party", () => {
    expect(codes(issueFaults({ ...base, partyId: "p-win" }))).toEqual(["NOT_UNSUCCESSFUL"]);
    expect(codes(issueFaults({ ...base, partyId: "p-never" }))).toEqual(["NOT_UNSUCCESSFUL"]);
    expect(codes(issueFaults({ ...base, award: { status: "ISSUED", awardeePartyId: null } }))).toEqual(["AWARDEE_NOT_NAMED"]);
  });
  it("is issued once", () => expect(codes(issueFaults({ ...base, alreadyIssued: true }))).toEqual(["ALREADY_ISSUED"]));
  it("asks for a reason only where the debrief carries one, and caps it", () => {
    expect(codes(issueFaults({ ...base, reason: "  " }))).toEqual(["REASON_REQUIRED"]);
    expect(codes(issueFaults({ ...base, reason: "x".repeat(REASON_MAX + 1) }))).toEqual(["REASON_TOO_LONG"]);
    for (const p of [{ nonAwardNotices: true, debriefIncludesReason: false }, { nonAwardNotices: true, debriefIncludesReason: null }]) {
      expect(issueFaults({ ...base, policy: p, reason: "" }), JSON.stringify(p)).toEqual([]);
      // Whatever was typed is not frozen where the debrief carries no reason.
      expect(reasonToFreeze(p, "typed anyway")).toBe("");
      expect(carriesReason(p)).toBe(false);
    }
    expect(reasonToFreeze(on, "  The price was above the estimate.  ")).toBe("The price was above the estimate.");
  });
  it("names as unsuccessful the parties on an opened bid other than the awardee, once each", () => {
    expect(unsuccessfulPartyIds([{ partyId: "a" }, { partyId: "b" }, { partyId: "b" }, { partyId: "w" }], "w")).toEqual(["a", "b"]);
    expect(unsuccessfulPartyIds([{ partyId: "a" }], null)).toEqual([]);
  });
  it("words the outcome without a figure or the awardee, and says what the setting is", () => {
    const t = outcomeText({ reference: "TND/2026/0007", title: "Pipe replacement" });
    expect(t).toContain("TND/2026/0007");
    expect(t).not.toMatch(/RM|\d+\.\d{2}|score|rank/i);
    expect(nonAwardSettingWords({ nonAwardNotices: null, debriefIncludesReason: null })).toContain("Not decided");
    expect(nonAwardSettingWords(on)).toContain("with the reason you state");
    expect(nonAwardSettingWords({ nonAwardNotices: true, debriefIncludesReason: null })).toContain("carries none");
    expect(policySnapshot(on, "ASSUMED")).toEqual({ nonAwardNotices: true, debriefIncludesReason: true, provenance: "ASSUMED" });
  });
  it("every finding it can return has words", () => {
    for (const c of ["D7_NOT_SET", "D7_OFF", "AWARD_NOT_ISSUED", "AWARDEE_NOT_NAMED", "NOT_UNSUCCESSFUL", "ALREADY_ISSUED", "REASON_REQUIRED", "REASON_TOO_LONG"]) expect(hasNonAwardFaultText(c), c).toBe(true);
  });
});

describe("the notices a supplier is shown", () => {
  const n = (over: Partial<PortalNotice>): PortalNotice => ({ key: "k", kind: "ADDENDUM", exerciseId: "e1", exerciseReference: "TND/1", exerciseTitle: "T", on: "2026-11-01", title: "t", body: "b", ...over });
  it("orders newest first, then by kind and key, whatever order they arrive in", () => {
    const a = n({ key: "a", on: "2026-11-01" });
    const b = n({ key: "b", on: "2026-11-03", kind: "CLOSING_CHANGED" });
    const c = n({ key: "c", on: "2026-11-03", kind: "EXERCISE_CANCELLED" });
    const d = n({ key: "d", on: "2026-11-03", kind: "NON_AWARD" });
    expect(sortNotices([a, b, c, d]).map((x) => x.key)).toEqual(["d", "c", "b", "a"]);
    expect(sortNotices([d, c, b, a]).map((x) => x.key)).toEqual(["d", "c", "b", "a"]);
  });
  it("counts the addenda not yet acknowledged, and only addenda", () => {
    const list = [n({ key: "1", addendum: { id: "x", acknowledgedOn: null, canAcknowledge: true } }), n({ key: "2", addendum: { id: "y", acknowledgedOn: "2026-11-02", canAcknowledge: true } }), n({ key: "3", kind: "CLOSING_CHANGED" })];
    expect(unacknowledged(list)).toBe(1);
  });
  it("does not count an addendum whose time has passed: after the closing it is no longer a thing to do (Phase 4d review)", () => {
    const list = [n({ key: "1", addendum: { id: "x", acknowledgedOn: null, canAcknowledge: false } }), n({ key: "2", addendum: { id: "y", acknowledgedOn: null, canAcknowledge: true } })];
    expect(unacknowledged(list)).toBe(1);
  });
  it("has a label for every kind", () => expect(Object.keys(NOTICE_KIND_WORDS).sort()).toEqual(["ADDENDUM", "CLOSING_CHANGED", "EXERCISE_CANCELLED", "NON_AWARD"]));
});

describe("the words", () => {
  const all: BidFault[] = [
    "NOT_FOUND", "NOT_PUBLISHED", "EXERCISE_CANCELLED", "WINDOW_CLOSED", "WINDOW_NOT_DATED", "NOT_INVITED", "REPRESENTATIVE_REQUIRED", "REPRESENTATIVE_TOO_LONG", "EVENT_NOT_FOUND", "EVENT_CANCELLED", "EVENT_HELD", "EVENT_STARTED", "EVENT_NOT_DATED",
    "ALREADY_SIGNED_UP", "NOT_SIGNED_UP", "ADDENDUM_NOT_FOUND", "ADDENDUM_NOT_ISSUED", "NOT_A_PURCHASER", "ALREADY_ACKNOWLEDGED", "COLLECTOR_REQUIRED", "COLLECTOR_TOO_LONG", "REQUEST_STANDS", "NO_REQUEST", "ALREADY_BOUGHT", "REQUEST_REFUSED",
  ];
  it("every finding has English and Malay, and no code reaches a screen", () => {
    for (const code of all) {
      expect(hasBidFaultText(code), code).toBe(true);
      const t = bidFaultText({ code });
      expect(t.en.length, code).toBeGreaterThan(10);
      expect(t.ms.length, code).toBeGreaterThan(10);
      expect(t.en, code).not.toMatch(/\b[A-Z]{2,}(?:_[A-Z]+)+\b/);
    }
    expect(bidFaultViews([{ code: "ALREADY_SIGNED_UP", level: "block" }])).toEqual([{ field: null, level: "block", message: "Your company is already signed up for this.", messageMs: expect.any(String) }]);
  });
  it("says on which day an addendum was acknowledged", () => expect(bidFaultText({ code: "ALREADY_ACKNOWLEDGED", data: { on: "2026-11-02" } }).en).toContain("2026"));
});
