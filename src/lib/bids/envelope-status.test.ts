import { describe, expect, it } from "vitest";

import { finaliseFaults } from "@/lib/opening/finalise";
import { withdrawalsResolved } from "@/lib/opening/withdrawals";

import { bidCount } from "./count";
import { admittedEnvelopeIdsOf, ONLINE_STATUS_OF, openingStateOf, outOfPlay, returnable, shownInRegister, standing, unopenedInTime } from "./envelope-status";
import { envelope, exercise } from "./fixture";
import { bidFindingText } from "./labels";
import { admission, lateAdmissionFault, lateMatterFault, needsAdmission, type LateMatter } from "./late";
import { receivedView, registerNumbers } from "./online/received";
import type { EnvelopeChannel, EnvelopeStatus } from "./types";
import { returnFaults, withdrawFaults } from "./withdrawal";

/**
 * Wave 3b step 12: every reader of the envelope register handles every status, paper and online (ADR 0036 D7, D12; rulings 20u, 20y). One bid of each status, crossed with the
 * channel, goes through each reader, so a new status or channel without a decision fails here and nowhere quieter.
 */

const STATUSES: EnvelopeStatus[] = ["RECEIVED", "OPENED", "WITHDRAWN", "SUPERSEDED"];
const CHANNELS: EnvelopeChannel[] = ["COUNTER", "ONLINE"];
// SUPERSEDED exists for ONLINE only (a CHECK in the database), so a paper one is not a case.
const real = CHANNELS.flatMap((channel) => STATUSES.map((status) => ({ channel, status }))).filter((c) => c.status !== "SUPERSEDED" || c.channel === "ONLINE");

describe("which envelopes stand", () => {
  it.each(real)("$channel $status", ({ status }) => {
    expect(standing({ status })).toBe(status === "RECEIVED" || status === "OPENED");
    expect(outOfPlay({ status })).toBe(!standing({ status }));
  });
  it("an online bid's status is the envelope's, with REPLACED for SUPERSEDED", () => {
    expect(ONLINE_STATUS_OF).toEqual({ RECEIVED: "SUBMITTED", OPENED: "OPENED", WITHDRAWN: "WITHDRAWN", SUPERSEDED: "REPLACED" });
  });
});

describe("the count (FR-BID-011)", () => {
  it("a replaced online bid is neither a bid nor a withdrawal", () => {
    const c = bidCount([envelope({ channel: "ONLINE", status: "SUPERSEDED" }), envelope({ channel: "ONLINE" }), envelope({ channel: "ONLINE", status: "WITHDRAWN" })], true);
    expect(c).toEqual({ inTime: 1, late: 0, alternatives: 0, withdrawn: 1 });
  });
  it("before the opening starts, an online withdrawal is not counted (20u), a paper one is", () => {
    const rows = [envelope({ channel: "ONLINE", status: "WITHDRAWN" }), envelope({ status: "WITHDRAWN" }), envelope({ channel: "ONLINE" })];
    expect(bidCount(rows, false).withdrawn).toBe(1);
    expect(bidCount(rows, true).withdrawn).toBe(2);
  });
  it("a replaced bid never lifts the in-time count", () => {
    expect(bidCount([envelope({ channel: "ONLINE" }), envelope({ channel: "ONLINE", status: "SUPERSEDED" })]).inTime).toBe(1);
  });
});

describe("the register before and after the opening starts (20u)", () => {
  it.each(real)("$channel $status is shown before the start only where it is paper or standing", ({ channel, status }) => {
    expect(shownInRegister({ channel, status }, false)).toBe(channel !== "ONLINE" || status === "RECEIVED" || status === "OPENED");
    expect(shownInRegister({ channel, status }, true)).toBe(true);
  });
});

describe("the Opening page's word for an envelope", () => {
  it.each([
    ["RECEIVED", false, "Sealed", "warn"],
    ["OPENED", false, "Opened as No. 3", "ok"],
    ["WITHDRAWN", false, "Withdrawn, not opened", "neutral"],
    ["SUPERSEDED", false, "Replaced, not opened", "neutral"],
    ["RECEIVED", true, "Withdrawn, not opened", "neutral"],
  ] as const)("%s (letter: %s) reads %s", (status, letter, state, tone) => {
    expect(openingStateOf({ status }, { listingNo: 3 }, letter)).toEqual({ state, tone });
  });
});

describe("a return is offered for a paper withdrawn envelope only", () => {
  it.each(real)("$channel $status", ({ channel, status }) => {
    const e = { channel, status, returnedUnopenedOn: null };
    expect(returnable(e, false)).toBe(channel !== "ONLINE" && status === "WITHDRAWN");
    expect(returnable({ ...e, returnedUnopenedOn: new Date() }, false)).toBe(false);
    expect(returnable(e, true)).toBe(false);
  });

  it.each(["WITHDRAWN", "SUPERSEDED"] as const)("returnFaults refuses an online %s envelope, in words (nothing is handed back)", (status) => {
    const fs = returnFaults({ envelope: { status, returnedUnopenedOn: null, channel: "ONLINE" }, withdrawnOn: null, day: "2026-11-12", today: "2026-11-20", cancelled: false });
    expect(fs.map((f) => f.code)).toEqual(["ONLINE_NOTHING_TO_RETURN"]);
    expect(bidFindingText(fs[0])).toMatch(/never handed in on paper/);
  });
  it("a paper withdrawn envelope is still handed back", () => {
    expect(returnFaults({ envelope: { status: "WITHDRAWN", returnedUnopenedOn: null, channel: "COUNTER" }, withdrawnOn: null, day: "2026-11-12", today: "2026-11-20", cancelled: false })).toEqual([]);
  });
});

describe("an officer's withdrawal letter cannot withdraw an online bid", () => {
  it("is refused in words, and a paper envelope is unchanged", () => {
    const base = { exercise: exercise(), now: new Date("2026-11-17T05:00:00Z"), markings: "Letter", personActive: true };
    const online = withdrawFaults({ ...base, envelope: { kind: "BID", late: false, status: "RECEIVED", withdrawn: false, channel: "ONLINE" } });
    expect(online.map((f) => f.code)).toEqual(["ONLINE_WITHDRAWS_ITSELF"]);
    expect(bidFindingText(online[0])).toMatch(/withdrawn by its supplier in the portal/);
    expect(withdrawFaults({ ...base, envelope: { kind: "BID", late: false, status: "RECEIVED", withdrawn: false, channel: "COUNTER" } })).toEqual([]);
  });
});

describe("the late envelopes that need the committee (20y)", () => {
  it.each(real)("a late $channel $status envelope needs admission only while it stands", ({ channel, status }) => {
    expect(needsAdmission(envelope({ late: true, channel, status }))).toBe(status === "RECEIVED" || status === "OPENED");
  });
  it("an online late envelope is tabled, decided and gated exactly as a paper one", () => {
    const on = envelope({ late: true, channel: "ONLINE" });
    const paper = envelope({ late: true });
    const matter = (e: { id: string }, outcome: LateMatter["outcome"]): LateMatter => ({ id: `m-${e.id}`, bidEnvelopeId: e.id, withdrawn: false, sittingCancelled: false, tabledAt: new Date(), outcome, decisionDate: new Date() });
    expect(admission(on.id, []).state).toBe("NOT_TABLED");
    expect(lateAdmissionFault([on], [], true)).toMatchObject({ code: "LATE_UNDECIDED", data: { count: 1 } });
    expect(lateAdmissionFault([on], [matter(on, "CARRIED")], true)).toBeNull();
    expect(lateAdmissionFault([on], [matter(on, "NOT_CARRIED")], true)).toBeNull();
    expect(lateAdmissionFault([on, paper], [matter(on, "CARRIED")], true)).toMatchObject({ data: { count: 1 } });
    const sitting = { committeeCode: "C", frozen: false };
    const tabled = (e: typeof on) => lateMatterFault({ exerciseCancelled: false, committeeCode: "C", envelope: e, matters: [], sitting }).map((f) => f.code);
    expect(tabled(on)).toEqual(tabled(paper));
    expect(tabled(on)).toEqual([]);
  });
  it("a replaced or withdrawn late envelope waits for nobody and is not tabled", () => {
    for (const status of ["SUPERSEDED", "WITHDRAWN"] as const) {
      const e = envelope({ late: true, channel: "ONLINE", status });
      expect(lateAdmissionFault([e], [], true)).toBeNull();
      expect(lateMatterFault({ exerciseCancelled: false, committeeCode: "C", envelope: e, matters: [], sitting: { committeeCode: "C", frozen: false } }).map((f) => f.code)).toContain("WITHDRAWN");
    }
  });
});

describe("admittedEnvelopeIds (20y)", () => {
  const matter = (id: string, outcome: "CARRIED" | "NOT_CARRIED" | "DEFERRED" | null, withdrawn = false) => ({ bidEnvelopeId: id, withdrawn, outcome });
  it.each(real)("a carried late $channel $status envelope is waited for only while it stands", ({ channel, status }) => {
    const e = envelope({ late: true, channel, status });
    expect(admittedEnvelopeIdsOf([e], [matter(e.id, "CARRIED")])).toEqual(status === "RECEIVED" || status === "OPENED" ? [e.id] : []);
  });
  it("only a carried, unwithdrawn matter on a late bid or alternative admits", () => {
    const late = envelope({ late: true, channel: "ONLINE" });
    const inTime = envelope({ channel: "ONLINE" });
    const est = envelope({ late: true, kind: "COMPANY_ESTIMATE" });
    const all = [late, inTime, est];
    expect(admittedEnvelopeIdsOf(all, [matter(late.id, "NOT_CARRIED"), matter(inTime.id, "CARRIED"), matter(est.id, "CARRIED")])).toEqual([]);
    expect(admittedEnvelopeIdsOf(all, [matter(late.id, "DEFERRED"), matter(late.id, null)])).toEqual([]);
    expect(admittedEnvelopeIdsOf(all, [matter(late.id, "CARRIED", true)])).toEqual([]);
    expect(admittedEnvelopeIdsOf(all, [matter(late.id, "CARRIED")])).toEqual([late.id]);
  });
});

const FINALISE: Parameters<typeof finaliseFaults>[0] = {
  state: { kind: "MAIN", finalised: false, started: true, sitting: true } as never,
  bids: [],
  present: [],
  signed: [],
  pages: 1,
  checklist: { items: [], notJudged: [], notReturned: [] } as never,
  withdrawals: [],
  unopened: 0,
  admittedOpened: false,
  completenessEliminates: true,
  unpurchased: null,
  invitedReading: "PURCHASERS" as never,
  estimate: { required: false, lodged: false, paperAnswered: false },
  personActive: true,
};

describe("finalising reads every status", () => {
  it("the envelopes in time still sealed are the RECEIVED ones, of either channel", () => {
    const rows = real.flatMap((c) => [envelope({ ...c }), envelope({ ...c, late: true })]).concat(envelope({ kind: "COMPANY_ESTIMATE" }));
    // RECEIVED paper and RECEIVED online, in time: two. Opened, withdrawn, replaced, late and the estimate are not.
    expect(unopenedInTime(rows)).toBe(2);
  });
  it("an online withdrawal has no letter, so nothing waits to be matched or explained", () => {
    expect(withdrawalsResolved([])).toBeNull();
    expect(withdrawalsResolved([{ id: "w", envelopeId: null, unmatchedFinding: "" }])).toMatchObject({ code: "WITHDRAWAL_UNRESOLVED", data: { count: 1 } });
  });
  it("ENVELOPE_UNOPENED counts the sealed online bids at a main opening and not the replaced or withdrawn ones", () => {
    const unopened = (envelopes: ReturnType<typeof envelope>[]) => finaliseFaults({ ...FINALISE, unopened: unopenedInTime(envelopes) }).find((f) => f.code === "ENVELOPE_UNOPENED");
    expect(unopened([envelope({ channel: "ONLINE", status: "SUPERSEDED" }), envelope({ channel: "ONLINE", status: "WITHDRAWN" }), envelope({ channel: "ONLINE", status: "OPENED" })])).toBeUndefined();
    expect(unopened([envelope({ channel: "ONLINE" }), envelope({ channel: "ONLINE", status: "SUPERSEDED" })])).toMatchObject({ data: { count: 1 } });
  });
});

describe("Received carries no supplier field", () => {
  const t = (s: string) => new Date(`2026-11-04T${s}Z`);
  it("neither the view nor the numbers name a supplier, party, account or name", () => {
    const view = receivedView([{ sequence: 4, receivedAt: t("01:00:00"), late: false, status: "SUBMITTED" }], false);
    const numbers = registerNumbers([{ id: "x", sequence: 4, receivedAt: t("01:00:00"), status: "SUBMITTED" }], false);
    const keys = [...Object.keys(view), ...view.standing.flatMap((r) => Object.keys(r)), ...[...numbers.values()].flatMap((r) => Object.keys(r))];
    expect(keys.filter((k) => /supplier|party|account|name|bidder|submitted/i.test(k))).toEqual([]);
  });
  it("the numbers: the ordinal before the start, the receipt number from it, none for a bid not standing", () => {
    const rows = [
      { id: "a", sequence: 1, receivedAt: t("01:00:00"), status: "SUBMITTED" as const },
      { id: "b", sequence: 2, receivedAt: t("01:30:00"), status: "REPLACED" as const },
      { id: "c", sequence: 3, receivedAt: t("02:00:00"), status: "WITHDRAWN" as const },
      { id: "d", sequence: 4, receivedAt: t("02:30:00"), status: "SUBMITTED" as const },
    ];
    expect([...registerNumbers(rows, false)]).toEqual([["a", { number: 1, isOrdinal: true }], ["d", { number: 2, isOrdinal: true }]]);
    expect([...registerNumbers(rows, true)]).toEqual([["a", { number: 1, isOrdinal: false }], ["d", { number: 4, isOrdinal: false }]]);
  });
});
