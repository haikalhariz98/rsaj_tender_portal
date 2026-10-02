import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CLOSING, exercise, PUBLISHED, S } from "./fixture";
import { judgeReceipt, receiptFaults, type ReceiptInput } from "./receipt";

const before = new Date(CLOSING.getTime() - 600 * S);
const after = new Date(CLOSING.getTime() + 600 * S);
const base: ReceiptInput = { exercise: exercise(), kind: "BID", channel: "COUNTER", markings: "Tender SX/1, closing 17 Nov 2026", personActive: true, now: before, stated: null };
const codes = (i: Partial<ReceiptInput>, level: "block" | "warn" = "block") => receiptFaults({ ...base, ...i }).filter((f) => f.level === level).map((f) => f.code);

describe("recording a receipt (FR-BID-002)", () => {
  it("a server-stamped receipt before the closing passes", () => expect(receiptFaults(base)).toEqual([]));
  it("refuses without a zone, a closing, publication, or once the box is opened; a cancelled exercise refuses alone", () => {
    expect(codes({ exercise: exercise({ timeZone: null }) })).toEqual(["TIME_ZONE_UNSET"]);
    expect(codes({ exercise: exercise({ closing: null }) })).toEqual(["CLOSING_NOT_SET"]);
    expect(codes({ exercise: exercise({ status: "APPROVED_FOR_TENDERING" }) })).toEqual(["NOT_PUBLISHED"]);
    expect(codes({ exercise: exercise({ openingStarted: true }) })).toEqual(["AFTER_OPENING"]);
    expect(codes({ exercise: exercise({ status: "CANCELLED" }) })).toEqual(["CANCELLED"]);
  });
  it("refuses no markings, no officer, the box channel and the estimate", () => {
    expect(codes({ markings: " " })).toEqual(["MARKINGS_REQUIRED"]);
    expect(codes({ personActive: false })).toEqual(["PERSON_REQUIRED"]);
    expect(codes({ channel: "BOX" })).toEqual(["CHANNEL_NOT_FOR_OFFICER"]);
    expect(codes({ kind: "COMPANY_ESTIMATE" })).toEqual(["KIND_NOT_FOR_RECEIPT"]);
  });
  it("an alternative may name a bid as its parent; nothing else names one", () => {
    expect(codes({ kind: "ALTERNATIVE", parent: { kind: "BID", status: "RECEIVED" } })).toEqual([]);
    expect(codes({ kind: "ALTERNATIVE", parent: null })).toEqual(["PARENT_NOT_A_BID"]);
    expect(codes({ kind: "BID", parent: { kind: "BID", status: "RECEIVED" } })).toEqual(["PARENT_ONLY_FOR_ALTERNATIVE"]);
  });
});

describe("a late envelope is recorded, never refused for its time (FR-BID-003)", () => {
  it("after the closing: no block, a warning, and judged late against the closing as it stood", () => {
    expect(codes({ now: after })).toEqual([]);
    expect(codes({ now: after }, "warn")).toEqual(["RECORDED_AFTER_CLOSING"]);
    expect(judgeReceipt(after, CLOSING)).toEqual({ receivedAt: after, late: true, recordedAfterClosing: true, closingAtJudged: CLOSING });
  });
  it("in time: not late", () => expect(judgeReceipt(before, CLOSING).late).toBe(false));
  it("the stamp is stored to the second", () => expect(judgeReceipt(new Date(before.getTime() + 450), CLOSING).receivedAt).toEqual(before));
});

describe("recorded after the event (OD-3 as amended: the server stamp alone decides)", () => {
  it("a stated time with a reason passes, and the stamp still decides", () => {
    expect(codes({ stated: { at: new Date(before.getTime() - 60 * S), reason: "Counter clerk recorded it after lunch" } })).toEqual([]);
  });
  it("stated before the closing, recorded after: late, and both are said", () => {
    const stated = { at: new Date(CLOSING.getTime() - 60 * S), reason: "Handed in at 14:29; system down" };
    expect(codes({ now: after, stated })).toEqual([]);
    expect(codes({ now: after, stated }, "warn")).toEqual(["RECORDED_AFTER_CLOSING", "STATED_BEFORE_CLOSING"]);
    expect(judgeReceipt(after, CLOSING).late).toBe(true);
  });
  it("refuses no reason, a stated time not before recording, and a time before publication", () => {
    expect(codes({ stated: { at: new Date(before.getTime() - 60 * S), reason: "" } })).toEqual(["REASON_REQUIRED"]);
    expect(codes({ stated: { at: before, reason: "x" } })).toEqual(["ENTERED_NOT_BEFORE_RECORDING"]);
    expect(codes({ stated: { at: new Date(before.getTime() + 60 * S), reason: "x" } })).toEqual(["ENTERED_NOT_BEFORE_RECORDING"]);
    expect(codes({ stated: { at: new Date(PUBLISHED.getTime() - 60 * S), reason: "x" } })).toEqual(["BEFORE_WINDOW"]);
  });
});

describe("the actions take no client time on the server-stamped path (source test)", () => {
  const src = readFileSync(join(__dirname, "..", "..", "app", "sourcing", "[id]", "bids", "actions.ts"), "utf8");
  const body = (name: string) => {
    const from = src.indexOf(`export async function ${name}(`);
    const to = src.indexOf("export async function", from + 10);
    return src.slice(from, to === -1 ? undefined : to);
  };
  it("recordReceiptNow reads no time from the form and stamps inside the transaction", () => {
    const b = body("recordReceiptNow");
    expect(b.length).toBeGreaterThan(0);
    expect(b).not.toMatch(/data\.get\("(statedAt|receivedAt|time|day)"/);
    expect(b).not.toMatch(/r\.(date|text)\("(statedAt|receivedAt|statedDay|statedTime)"/);
  });
  it("only the after-the-fact path reads a stated time, and it is stored as the stated time, never as the stamp", () => {
    const b = body("recordReceiptAfterTheFact");
    expect(b).toMatch(/statedDay/);
    expect(src).not.toMatch(/receivedAt:\s*stated/);
  });
});
