import { describe, expect, it } from "vitest";

import { applicationStatusWords, requestWords, supplierStatusWords } from "./registration-status";
import { readRequest, type ReadingItem } from "./request-reading";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const BY = "2026-10-20";
const day = (d: string) => `D(${d})`;
const answer = (id: string, verification: "NOT_CHECKED" | "VERIFIED" | "NOT_IN_ORDER", lodgedOn = "2026-10-12") => ({ id, verification, lodgedOn });
const items = (...answers: ReadingItem["answers"][number][][]): ReadingItem[] => answers.map((a, n) => ({ id: `i${n + 1}`, answers: a }));

describe("where the office's request stands for the supplier (FR-VND-007 online)", () => {
  it("before the date, an item with nothing sent waits for the supplier", () => {
    expect(readRequest(items([], [answer("a", "NOT_CHECKED")]), BY, "2026-10-15")).toEqual({ kind: "WAITING", needing: 1 });
  });
  it("before the date, everything sent and none found not in order is answered", () => {
    expect(readRequest(items([answer("a", "NOT_CHECKED")], [answer("b", "VERIFIED")]), BY, "2026-10-15")).toEqual({ kind: "ANSWERED" });
  });
  it("before the date, an answer found not in order is still waiting for the supplier: the date is running", () => {
    expect(readRequest(items([answer("a", "NOT_IN_ORDER")], [answer("b", "VERIFIED")]), BY, "2026-10-15")).toEqual({ kind: "WAITING", needing: 1 });
  });
  it("only the newest answer to an item counts: a corrected one sent after one found not in order", () => {
    expect(readRequest(items([answer("a", "NOT_IN_ORDER", "2026-10-11"), answer("b", "NOT_CHECKED", "2026-10-13")]), BY, "2026-10-15")).toEqual({ kind: "ANSWERED" });
  });
  it("after the date with nothing sent, the date has passed: it is NOT answered, whatever the supplier can still do", () => {
    expect(readRequest(items([], []), BY, "2026-10-21")).toEqual({ kind: "DATE_PASSED", unanswered: 2 });
    expect(readRequest(items([answer("a", "NOT_CHECKED")], []), BY, "2026-10-21")).toEqual({ kind: "DATE_PASSED", unanswered: 1 });
  });
  it("the deadline day itself is still before the date", () => {
    expect(readRequest(items([]), BY, BY)).toEqual({ kind: "WAITING", needing: 1 });
  });
  it("after the date, every item answered in time is answered, as the office's lapse rule reads it (even one found not in order: the office decides)", () => {
    expect(readRequest(items([answer("a", "NOT_IN_ORDER", "2026-10-19")], [answer("b", "VERIFIED", BY)]), BY, "2026-10-25")).toEqual({ kind: "ANSWERED" });
  });
  it("with no day known nothing is said to have passed", () => {
    expect(readRequest(items([]), BY, null)).toEqual({ kind: "WAITING", needing: 1 });
  });
});

describe("what the supplier is told of it", () => {
  it("a date passed with nothing sent is never told as answered or as safe, in both languages", () => {
    const reading = readRequest(items([], []), BY, "2026-10-21");
    const t = requestWords(reading, BY, day);
    expect(t.title.en).toBe("The date to answer the office has passed");
    expect(t.title.en + t.detail.en).not.toMatch(/answered the office|do not need to do anything/i);
    expect(t.detail.en).toContain("D(2026-10-20)");
    expect(t.detail.en).toMatch(/2 of the things it asked for were not sent/);
    expect(t.tone).toBe("warn");
    // The account page reads the same words.
    expect(applicationStatusWords({ status: "RESUBMISSION_REQUESTED", resubmitBy: BY, reading }, day).title.en).toBe(t.title.en);
    expect(supplierStatusWords({ status: "APPLICANT", registeredOn: null }, { status: "RESUBMISSION_REQUESTED", resubmitBy: BY, reading }, day).title.en).toBe("The date to answer has passed");
  });
  it("an answer found not in order before the date is told as still waiting for the supplier, with the count", () => {
    const reading = readRequest(items([answer("a", "NOT_IN_ORDER")], [answer("b", "VERIFIED")]), BY, "2026-10-12");
    const t = requestWords(reading, BY, day);
    expect(t.title.en).toBe("The office has asked for more");
    expect(t.detail.en).toMatch(/1 thing is waiting for you/);
    expect(t.tone).toBe("warn");
    expect(supplierStatusWords({ status: "APPLICANT", registeredOn: null }, { status: "RESUBMISSION_REQUESTED", resubmitBy: BY, reading }, day).title.en).toBe("Waiting for you");
  });
});
