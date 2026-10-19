import { describe, expect, it } from "vitest";

import { finaliseFaults, markFaults, recordFaults, scheduleScanFault, type BidForFinalise } from "./finalise";
import { CHECKLIST, PANEL, open } from "./fixture";
import { openingFindingText } from "./labels";

/** FR-OPN-005, 006, 011, C-5: everything the paper carries is on the record before finalising. */

const bid = (listingNo: number, over: Partial<BidForFinalise> = {}): BidForFinalise => ({ listingNo, initials: ["p1", "p2"], unanswered: 0, verdict: "PASS", unpurchased: false, ...over });
const present = [{ personId: "p1", name: "Aminah" }, { personId: "p2", name: "Bala" }];
const base: Parameters<typeof finaliseFaults>[0] = { state: open(), bids: [bid(1), bid(2), bid(3)], present, signed: ["p1", "p2"], pages: 2, checklist: CHECKLIST, withdrawals: [], unopened: 0, admittedOpened: true, completenessEliminates: false, unpurchased: "REPORT", invitedReading: "PURCHASERS", estimate: { required: true, lodged: true, paperAnswered: true }, personActive: true };
describe("an online opening (review, stage C)", () => {
  it("the paper finalise refuses it in words, whatever else is ready, before any price is read", () => {
    const f = finaliseFaults({ ...base, state: open({ online: true, required: 3 }) });
    expect(f.map((x) => x.code)).toEqual(["ONLINE_FINALISE_ELSEWHERE"]);
    expect(openingFindingText(f[0])).toMatch(/Online bids finalise only under Finalising/);
    expect(finaliseFaults({ ...base, state: open({ online: true, finalised: true }) }).map((x) => x.code)).toEqual(["FINALISED"]);
  });
});

describe("the online finalise judges an online opening by the same faults (step 15)", () => {
  const online = { ...base, state: open({ online: true, required: 2 }), online: true };
  it("is not refused as elsewhere, and everything ready is clear", () => expect(finaliseFaults(online).map((x) => x.code)).toEqual([]));
  it("needs every named officer's signature, by name", () => {
    expect(finaliseFaults({ ...online, signed: ["p1"] })).toEqual([{ code: "SIGNATURE_MISSING", level: "block", data: { person: "Bala" } }]);
    expect(finaliseFaults({ ...online, signed: [] }).map((x) => x.code)).toEqual(["SIGNATURE_MISSING", "SIGNATURE_MISSING"]);
  });
  it("keeps the paper's other faults: a checklist item unanswered, a verdict unset, the pages", () => {
    expect(finaliseFaults({ ...online, bids: [bid(1, { unanswered: 1 }), bid(2, { verdict: null })], pages: null }).map((x) => x.code)).toEqual(["CHECKLIST_UNANSWERED", "VERDICT_UNSET", "PAGES_NOT_SET"]);
  });
  it("an estimate lodged but no sealed copy read says so in its own words, and a copy read clears it", () => {
    const f = finaliseFaults({ ...online, estimate: { required: true, lodged: true, paperAnswered: false } });
    expect(f.map((x) => x.code)).toEqual(["ESTIMATE_COPY_NOT_ANSWERED"]);
    expect(openingFindingText(f[0])).toMatch(/sealed estimate copy/);
    expect(openingFindingText(f[0])).not.toMatch(/paper copy from the box/);
    expect(finaliseFaults({ ...online, estimate: { required: true, lodged: true, paperAnswered: true } })).toEqual([]);
  });
  it("is refused for a paper opening, and the paper finalise still refuses an online one", () => {
    expect(finaliseFaults({ ...base, online: true }).map((x) => x.code)).toEqual(["NOT_ONLINE"]);
    expect(finaliseFaults({ ...base, state: open({ online: true, required: 2 }) }).map((x) => x.code)).toEqual(["ONLINE_FINALISE_ELSEWHERE"]);
  });
  it("the paper refusal names the online finalise's screen", () => {
    expect(openingFindingText({ code: "ONLINE_FINALISE_ELSEWHERE", level: "block" })).toMatch(/under Finalising on this tab/);
  });
});

const codes = (x: Partial<typeof base>) => finaliseFaults({ ...base, ...x }).map((f) => f.code);

describe("finalising", () => {
  it("all clear → []", () => expect(codes({})).toEqual([]));
  it("Bil. 3 lacking member 2's initial → INITIAL_MISSING (3, member)", () => {
    const f = finaliseFaults({ ...base, bids: [bid(1), bid(2), bid(3, { initials: ["p1"] })] });
    expect(f).toEqual([{ code: "INITIAL_MISSING", level: "block", data: { listingNo: 3, person: "Bala" } }]);
  });
  it("a present member unsigned → SIGNATURE_MISSING; pages unset → PAGES_NOT_SET", () => {
    expect(codes({ signed: ["p1"] })).toEqual(["SIGNATURE_MISSING"]);
    expect(codes({ pages: null })).toEqual(["PAGES_NOT_SET"]);
  });
  it("any checklist item unanswered, any verdict unset, any withdrawal unresolved", () => {
    expect(codes({ bids: [bid(1, { unanswered: 2 })] })).toEqual(["CHECKLIST_UNANSWERED"]);
    expect(codes({ bids: [bid(1, { verdict: null })] })).toEqual(["VERDICT_UNSET"]);
    expect(codes({ withdrawals: [{ id: "w1", envelopeId: null, unmatchedFinding: "" }] })).toEqual(["WITHDRAWAL_UNRESOLVED"]);
  });
  it("the copy unanswered where an estimate is required and lodged; never where none is required", () => {
    expect(codes({ estimate: { required: true, lodged: true, paperAnswered: false } })).toEqual(["ESTIMATE_COPY_NOT_ANSWERED"]);
    expect(codes({ estimate: { required: false, lodged: true, paperAnswered: false } })).toEqual([]);
  });
  it("the completeness consequence unset; the unpurchased one only where such a bid exists; the reading unset", () => {
    expect(codes({ completenessEliminates: null })).toEqual(["CONSEQUENCE_NOT_SET"]);
    expect(codes({ unpurchased: null })).toEqual([]);
    expect(codes({ unpurchased: null, bids: [bid(1, { unpurchased: true })] })).toEqual(["UNPURCHASED_CONSEQUENCE_NOT_SET"]);
    expect(codes({ invitedReading: null })).toEqual(["READING_NOT_SET"]);
  });
  it("every in-time envelope opened or withdrawn at the main opening; the admitted one at a supplementary opening", () => {
    expect(codes({ unopened: 1 })).toEqual(["ENVELOPE_UNOPENED"]);
    expect(codes({ state: open({ kind: "SUPPLEMENTARY" }), unopened: 1, admittedOpened: false })).toEqual(["ADMITTED_NOT_OPENED"]);
  });
  it("completeness not judgeable blocks (6.6 ruling)", () => expect(codes({ checklist: { ...CHECKLIST, notJudged: ["Specification"] } })).toEqual(["CHECKLIST_NOT_JUDGED"]));
  it("an empty box finalises (the exit is cancelling, C-9)", () => expect(codes({ bids: [] })).toEqual([]));
  it("a finalised opening has no update path", () => expect(codes({ state: open({ finalised: true }) })).toEqual(["FINALISED"]));
});

describe("the signed schedule's scan (C-5)", () => {
  it("refused before finalisation; once finalised, its absence holds 6.8 and the award", () => {
    expect(scheduleScanFault({ finalised: false, liveScans: 0 })?.code).toBe("SEALED_FIGURE_ON_PAPER");
    expect(scheduleScanFault({ finalised: true, liveScans: 0 })?.code).toBe("SIGNED_SCHEDULE_NOT_ATTACHED");
    expect(scheduleScanFault({ finalised: true, liveScans: 1 })).toBeNull();
  });
});

describe("initials and signatures (FR-OPN-006)", () => {
  const f = (x: Partial<Parameters<typeof markFaults>[0]>) => markFaults({ state: open(), panel: PANEL, personId: "p1", already: false, sameOpening: true, ...x }).map((y) => y.code);
  it("by a present panel member, once", () => {
    expect(f({})).toEqual([]);
    expect(f({ personId: "p3" })).toEqual(["ABSENT"]);
    expect(f({ personId: "x" })).toEqual(["NOT_ON_PANEL"]);
    expect(f({ already: true })).toEqual(["ALREADY_RECORDED"]);
  });
  it("a signature carries the paper's day: not in the future, not before the opening", () => {
    expect(f({ signedOn: { day: "2026-11-17", today: "2026-11-17", startDay: "2026-11-17" } })).toEqual([]);
    expect(f({ signedOn: { day: "2026-11-18", today: "2026-11-17", startDay: "2026-11-17" } })).toEqual(["DAY_IN_FUTURE"]);
    expect(f({ signedOn: { day: "2026-11-16", today: "2026-11-17", startDay: "2026-11-17" } })).toEqual(["DAY_BEFORE_OPENING"]);
    expect(f({ signedOn: { day: null, today: null, startDay: null } })).toEqual(["TIME_ZONE_NOT_SET", "DAY_REQUIRED"]);
  });
  it("pages one or more", () => {
    expect(recordFaults({ state: open(), pages: 0 }).map((y) => y.code)).toEqual(["PAGES_POSITIVE"]);
    expect(recordFaults({ state: open() })).toEqual([]);
  });
});
