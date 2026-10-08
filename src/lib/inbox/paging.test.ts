import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor, INBOX_PAGE_SIZE, markUpTo } from "./paging";

describe("the inbox cursor", () => {
  it("round-trips a notice's time and id", () => {
    const c = { raisedAt: new Date("2026-10-09T01:02:03.456Z"), id: "clx9abc_DEF-1" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("is no cursor where it is absent or not exactly the written form", () => {
    for (const raw of [undefined, null, "", "garbage", "2026-10-09~x", "2026-10-09T01:02:03.456Z~", "2026-10-09T01:02:03.456Z~a b", "2026-10-09T01:02:03.456Z~x'; DROP", "2026-13-45T99:99:99.999Z~abc"]) {
      expect(decodeCursor(raw), String(raw)).toBeNull();
    }
  });

  it("has a page size, so that no list is read whole", () => {
    expect(INBOX_PAGE_SIZE).toBeGreaterThan(0);
  });
});

describe("'Mark all as read' is for what the page showed", () => {
  const now = new Date("2026-10-09T10:00:00.000Z");

  it("marks up to the time the page was drawn", () => {
    expect(markUpTo("2026-10-09T09:59:00.000Z", now)).toEqual(new Date("2026-10-09T09:59:00.000Z"));
  });

  it("marks nothing where the time is missing or unreadable", () => {
    expect(markUpTo(null, now)).toBeNull();
    expect(markUpTo("", now)).toBeNull();
    expect(markUpTo("yesterday", now)).toBeNull();
  });

  it("never reaches past now: a forged future time marks no more than the person's own notices up to this moment", () => {
    expect(markUpTo("2999-01-01T00:00:00.000Z", now)).toEqual(now);
  });
});
