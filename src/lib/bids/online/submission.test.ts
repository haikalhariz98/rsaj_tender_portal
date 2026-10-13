import { describe, expect, it } from "vitest";

import { PeriodUnit } from "@/generated/prisma/enums";
import { MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";
import { onlineSubmissionAllowed } from "@/lib/sealing/switch";

import { DECLARED_UNITS, parseDeclaration, submitFaults, withdrawalEffect, withdrawFaults } from "./submission";
import type { BidPartRule } from "./types";
import { SUBMIT_FAULT_WORDS } from "./words";

/**
 * The online submission's door, a replace and a withdrawal (ADR 0036 D5, D7, D8; rulings 17c, 20b, 20e, 20h, 20m; build plan step 5). A worked example: the
 * closing is 4 November 2026 at 12:00:00 noon in Kuala Lumpur, which is 04:00:00 UTC. A bid stamped 04:00:00 is in time; one stamped 04:00:01 is late.
 */

const CLOSING = new Date("2026-11-04T04:00:00Z");
const at = (iso: string) => new Date(iso);
const RULES: BidPartRule[] = [
  { packPartId: "form", label: "Borang Tender", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "10485760", openingCheck: true },
  { packPartId: "summary", label: "Grand Summary", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "10485760", openingCheck: true },
  { packPartId: "brochure", label: "Brochure", mandatory: false, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "10485760", openingCheck: false },
  { packPartId: "conditions", label: "Conditions of Contract", mandatory: true, returnedByBidder: false, acceptedMediaTypes: [], maxBytes: "", openingCheck: false },
];
const base = {
  channel: "ONLINE" as const, online: onlineSubmissionAllowed("LIVE", { demoAllowed: false, liveAllowed: true }, "SUBMIT"), published: true, cancelled: false, keyLive: true,
  saleStands: true, invitedPath: false, onInviteeList: false,
  stamp: at("2026-11-04T03:00:00Z"), closing: CLOSING, mainOpeningStartedAt: null as Date | null,
  liveMainInTime: false, kind: "BID" as "BID" | "ALTERNATIVE",
  replaces: null as { status: "SUBMITTED" | "REPLACED" | "WITHDRAWN" | "OPENED"; mine: boolean } | null,
  parent: "NONE_NAMED" as { status: "SUBMITTED" | "REPLACED" | "WITHDRAWN" | "OPENED"; mine: boolean } | null | "NONE_NAMED",
  alternativesPermitted: true as boolean | null,
  files: [{ mine: true, state: "DRAFT" as const, packPartId: "form" }, { mine: true, state: "DRAFT" as const, packPartId: "summary" }] as { mine: boolean; state: "DRAFT" | "SUBMITTED" | "DISCARDED"; packPartId: string }[],
  rules: RULES,
  submissionsBySupplier: 0,
};
const judge = (over: Partial<typeof base>) => submitFaults({ ...base, ...over });

describe("the declaration (Harga and Tempoh Kerja, D5): only what the finalise can write", () => {
  it("takes a decimal string price above zero, a whole period from 1, and a known unit", () => {
    expect(parseDeclaration({ price: "1250000.50", completionPeriod: 52, completionUnit: "WEEKS" })).toEqual({ ok: true, value: { price: "1250000.50", completionPeriod: 52, completionUnit: "WEEKS" } });
    expect(parseDeclaration({ price: "0.01", completionPeriod: 1, completionUnit: "DAYS" }).ok).toBe(true);
    expect(parseDeclaration({ price: "9999999999999999.99", completionPeriod: 2147483647, completionUnit: "MONTHS" }).ok).toBe(true);
  });

  it.each(["0", "0.00", "-5.00", "+5", "1e6", "1,000.00", " 100", "100 ", "100.123", ".5", "5.", "00.5", "10000000000000000", "RM100", ""])("refuses the price %j", (price) => {
    expect(parseDeclaration({ price, completionPeriod: 10, completionUnit: "DAYS" })).toEqual({ ok: false, faults: ["PRICE_INVALID"] });
  });

  it("refuses a price given as a number: money is never a float", () => {
    expect(parseDeclaration({ price: 100.5, completionPeriod: 10, completionUnit: "DAYS" })).toEqual({ ok: false, faults: ["PRICE_INVALID"] });
  });

  it.each([0, -1, 1.5, 2147483648, "10", null])("refuses the period %j", (completionPeriod) => {
    expect(parseDeclaration({ price: "100.00", completionPeriod, completionUnit: "DAYS" })).toEqual({ ok: false, faults: ["PERIOD_INVALID"] });
  });

  it("refuses an unset or unknown unit, and says every fault at once", () => {
    expect(parseDeclaration({ price: "100.00", completionPeriod: 3 })).toEqual({ ok: false, faults: ["UNIT_NOT_SET"] });
    expect(parseDeclaration({ price: "100.00", completionPeriod: 3, completionUnit: "YEARS" })).toEqual({ ok: false, faults: ["UNIT_NOT_SET"] });
    expect(parseDeclaration(null)).toEqual({ ok: false, faults: ["PRICE_INVALID", "PERIOD_INVALID", "UNIT_NOT_SET"] });
    expect(parseDeclaration([1, 2])).toEqual({ ok: false, faults: ["PRICE_INVALID", "PERIOD_INVALID", "UNIT_NOT_SET"] });
  });

  it("carries no field it does not know", () => {
    const r = parseDeclaration({ price: "10.00", completionPeriod: 3, completionUnit: "DAYS", note: "cheapest", bidder: "X Sdn Bhd" });
    expect(r).toEqual({ ok: true, value: { price: "10.00", completionPeriod: 3, completionUnit: "DAYS" } });
  });

  it("the units are PeriodUnit's, exactly", () => expect([...DECLARED_UNITS].sort()).toEqual(Object.values(PeriodUnit).sort()));
});

describe("lateness, judged on the act's own stamp (FR-BID-002, 20b)", () => {
  it("the closing second is in time, and the next second is late", () => {
    expect(judge({ stamp: at("2026-11-04T04:00:00Z") })).toMatchObject({ faults: [], late: false });
    expect(judge({ stamp: at("2026-11-04T04:00:01Z") })).toMatchObject({ faults: [], late: true });
  });

  it("a late bid is accepted until the main opening is started, and refused from it; so is every submission once it has started", () => {
    expect(judge({ stamp: at("2026-11-04T05:00:00Z"), mainOpeningStartedAt: null })).toMatchObject({ faults: [], late: true });
    expect(judge({ stamp: at("2026-11-04T05:00:00Z"), mainOpeningStartedAt: at("2026-11-04T04:30:00Z") }).faults).toEqual(["LATE_CLOSED"]);
    expect(judge({ stamp: at("2026-11-04T03:00:00Z"), mainOpeningStartedAt: at("2026-11-04T04:30:00Z") }).faults).toEqual(["LATE_CLOSED"]);
  });

  it("a supplier with a live in-time bid may not add another, in time or late (FR-BID-005); it replaces it instead", () => {
    expect(judge({ liveMainInTime: true }).faults).toEqual(["LIVE_BID_HELD"]);
    expect(judge({ liveMainInTime: true, stamp: at("2026-11-04T04:00:01Z") }).faults).toEqual(["LIVE_BID_HELD"]);
    expect(judge({ liveMainInTime: true, replaces: { status: "SUBMITTED", mine: true } })).toMatchObject({ faults: [], warnings: [{ code: "REPLACE_REUPLOADS_ALL" }] });
  });
});

describe("a replace (D7)", () => {
  it("is the supplier's own live bid, up to and including the closing second", () => {
    expect(judge({ replaces: { status: "SUBMITTED", mine: true }, stamp: CLOSING }).faults).toEqual([]);
    expect(judge({ replaces: { status: "SUBMITTED", mine: true }, stamp: at("2026-11-04T04:00:01Z") }).faults).toEqual(["REPLACE_AFTER_CLOSING"]);
    expect(judge({ replaces: { status: "SUBMITTED", mine: false } }).faults).toEqual(["NOTHING_TO_REPLACE"]);
    expect(judge({ replaces: { status: "WITHDRAWN", mine: true } }).faults).toEqual(["NOTHING_TO_REPLACE"]);
    expect(judge({ replaces: { status: "REPLACED", mine: true } }).faults).toEqual(["NOTHING_TO_REPLACE"]);
  });
});

describe("alternatives (20h)", () => {
  it("need no main bid, and are accepted and marked not considered where alternatives are not permitted, with a warning before submitting", () => {
    expect(judge({ kind: "ALTERNATIVE", alternativesPermitted: true })).toMatchObject({ faults: [], alternativeNotConsidered: false });
    expect(judge({ kind: "ALTERNATIVE", alternativesPermitted: false })).toMatchObject({ faults: [], alternativeNotConsidered: true, warnings: [{ code: "ALTERNATIVE_NOT_CONSIDERED" }] });
  });

  it("are refused, defensively, where alternatives are not stated", () => expect(judge({ kind: "ALTERNATIVE", alternativesPermitted: null }).faults).toEqual(["ALTERNATIVES_NOT_STATED"]));

  it("may name a parent only if it is the supplier's own live bid; one that is not is refused", () => {
    expect(judge({ kind: "ALTERNATIVE", parent: { status: "SUBMITTED", mine: true } }).faults).toEqual([]);
    expect(judge({ kind: "ALTERNATIVE", parent: { status: "SUBMITTED", mine: false } }).faults).toEqual(["PARENT_NOT_YOUR_LIVE_BID"]);
    expect(judge({ kind: "ALTERNATIVE", parent: { status: "WITHDRAWN", mine: true } }).faults).toEqual(["PARENT_NOT_YOUR_LIVE_BID"]);
    expect(judge({ kind: "ALTERNATIVE", parent: { status: "REPLACED", mine: true } }).faults).toEqual(["PARENT_NOT_YOUR_LIVE_BID"]);
    expect(judge({ kind: "ALTERNATIVE", parent: null }).faults).toEqual(["PARENT_NOT_YOUR_LIVE_BID"]);
  });

  it("a main bid names no parent", () => expect(judge({ kind: "BID", parent: { status: "SUBMITTED", mine: true } }).faults).toEqual(["PARENT_NOT_YOUR_LIVE_BID"]));

  it("an alternative beside a live in-time bid is taken: FR-BID-005 limits bids", () => expect(judge({ kind: "ALTERNATIVE", liveMainInTime: true }).faults).toEqual([]));
});

describe("the door's other refusals, in words", () => {
  it.each([
    [{ channel: "PAPER" as const }, ["CHANNEL_NOT_ONLINE"]],
    [{ channel: null }, ["CHANNEL_NOT_ONLINE"]],
    [{ online: onlineSubmissionAllowed(null, { demoAllowed: true, liveAllowed: true }, "SUBMIT") }, ["ONLINE_NOT_SET"]],
    [{ online: onlineSubmissionAllowed("DEMONSTRATION", { demoAllowed: false, liveAllowed: true }, "SUBMIT") }, ["ONLINE_NOT_ALLOWED"]],
    [{ published: false }, ["NOT_PUBLISHED"]],
    [{ cancelled: true }, ["CANCELLED"]],
    [{ keyLive: false }, ["KEY_NOT_LIVE"]],
    [{ saleStands: false }, ["NO_LIVE_SALE"]],
    [{ invitedPath: true, onInviteeList: false }, ["NOT_ON_INVITEE_LIST"]],
    [{ files: [] }, ["NO_FILES"]],
    [{ files: [{ mine: false, state: "DRAFT" as const, packPartId: "form" }] }, ["FILE_NOT_YOURS"]],
    [{ files: [{ mine: true, state: "SUBMITTED" as const, packPartId: "form" }] }, ["FILE_NOT_DRAFT"]],
    [{ files: [{ mine: true, state: "DISCARDED" as const, packPartId: "form" }] }, ["FILE_NOT_DRAFT"]],
    [{ files: [{ mine: true, state: "DRAFT" as const, packPartId: "nowhere" }] }, ["PART_UNKNOWN"]],
    [{ files: [{ mine: true, state: "DRAFT" as const, packPartId: "conditions" }] }, ["PART_UNKNOWN"]],
  ] as const)("%o refuses with %o", (over, faults) => {
    expect(judge(over as Partial<typeof base>).faults).toEqual(faults);
  });

  it("each refusal has words, never a code", () => {
    for (const [k, w] of Object.entries(SUBMIT_FAULT_WORDS)) {
      expect(w.length, k).toBeGreaterThan(15);
      expect(w, k).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    }
  });
});

describe("missing parts are warned about, never refused (FR-BID-007)", () => {
  it("each mandatory returned part with no file is named", () => {
    const r = judge({ files: [{ mine: true, state: "DRAFT", packPartId: "brochure" }] });
    expect(r.faults).toEqual([]);
    expect(r.warnings).toEqual([
      { code: "MANDATORY_PART_MISSING", packPartId: "form", label: "Borang Tender" },
      { code: "MANDATORY_PART_MISSING", packPartId: "summary", label: "Grand Summary" },
    ]);
  });
});

describe("the cap per supplier per exercise (20e)", () => {
  it("refuses a submission past it, and says the last submission stands", () => {
    expect(judge({ submissionsBySupplier: MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE - 1 }).faults).toEqual([]);
    expect(judge({ submissionsBySupplier: MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE }).faults).toEqual(["TOO_MANY_SUBMISSIONS"]);
    expect(SUBMIT_FAULT_WORDS.TOO_MANY_SUBMISSIONS).toMatch(/last submission stands/);
  });
});

describe("a withdrawal (D7, FR-BID-004)", () => {
  const w = { mine: true, status: "SUBMITTED" as const, stamp: at("2026-11-04T03:00:00Z"), closing: CLOSING, cancelled: false, alsoWithdraw: [] as { mine: boolean; linkedToThis: boolean }[] };
  it("is allowed up to and including the closing second, and refused from the next", () => {
    expect(withdrawFaults({ ...w, stamp: CLOSING })).toEqual([]);
    expect(withdrawFaults({ ...w, stamp: at("2026-11-04T04:00:01Z") })).toEqual(["AFTER_CLOSING"]);
  });
  it("is the supplier's own live bid, on an exercise not cancelled, with only its own linked alternatives", () => {
    expect(withdrawFaults({ ...w, mine: false })).toEqual(["NOT_YOURS"]);
    expect(withdrawFaults({ ...w, status: "REPLACED" })).toEqual(["NOT_LIVE"]);
    expect(withdrawFaults({ ...w, status: "OPENED" })).toEqual(["NOT_LIVE"]);
    expect(withdrawFaults({ ...w, cancelled: true })).toEqual(["CANCELLED"]);
    expect(withdrawFaults({ ...w, alsoWithdraw: [{ mine: true, linkedToThis: true }] })).toEqual([]);
    expect(withdrawFaults({ ...w, alsoWithdraw: [{ mine: true, linkedToThis: false }] })).toEqual(["ALTERNATIVE_NOT_LINKED"]);
    expect(withdrawFaults({ ...w, alsoWithdraw: [{ mine: false, linkedToThis: true }] })).toEqual(["ALTERNATIVE_NOT_LINKED"]);
  });
  it("is never blocked by the cap on submissions", () => {
    expect(Object.keys(w)).not.toContain("submissionsBySupplier");
  });
});

describe("what a withdrawal does to the alternatives linked to it (20h)", () => {
  it("withdraws those named, and keeps the rest with their link cleared", () => {
    expect(withdrawalEffect("bid1", ["alt1", "alt2", "alt3"], ["alt2"])).toEqual({ withdraw: ["bid1", "alt2"], clearLink: ["alt1", "alt3"] });
    expect(withdrawalEffect("bid1", ["alt1", "alt2"], [])).toEqual({ withdraw: ["bid1"], clearLink: ["alt1", "alt2"] });
    expect(withdrawalEffect("bid1", ["alt1", "alt2"], ["alt1", "alt2"])).toEqual({ withdraw: ["bid1", "alt1", "alt2"], clearLink: [] });
  });
  it("a name that is not linked touches nothing; no link is left pointing at the withdrawn bid", () => {
    const r = withdrawalEffect("bid1", ["alt1"], ["alt9"]);
    expect(r).toEqual({ withdraw: ["bid1"], clearLink: ["alt1"] });
    expect([...r.withdraw, ...r.clearLink].sort()).toEqual(["alt1", "bid1"]);
  });
});
