import { describe, expect, it } from "vitest";

import { labelOfChoice, remoteNote, remoteSearchUrl, UNKNOWN_CHOICE_LABEL } from "./select-logic";

describe("searching a list on the server (the shared Select, Phase 4b)", () => {
  it("asks for the typed text, encoded, and for the first page when nothing is typed", () => {
    expect(remoteSearchUrl("/supplier/registration/values?body=b1&kind=GRADE", "")).toBe("/supplier/registration/values?body=b1&kind=GRADE");
    expect(remoteSearchUrl("/supplier/registration/values?body=b1", "  g 1 ")).toBe("/supplier/registration/values?body=b1&q=g%201");
    expect(remoteSearchUrl("/values", "a&b=c")).toBe("/values?q=a%26b%3Dc");
  });

  it("says what it is doing in place of rows: it wants more typing, it is searching, it failed, nothing matched", () => {
    const base = { count: 0, more: false, minChars: 2, query: "" };
    expect(remoteNote({ ...base, status: "idle" })).toBe("Type at least 2 characters to search");
    expect(remoteNote({ ...base, minChars: 1, status: "idle" })).toBe("Type to search");
    expect(remoteNote({ ...base, query: "ab", status: "loading" })).toBe("Searching…");
    expect(remoteNote({ ...base, query: "ab", status: "error" })).toContain("could not be loaded");
    expect(remoteNote({ ...base, query: "ab", status: "ready" })).toBe("Nothing matches “ab”");
    expect(remoteNote({ ...base, minChars: 0, status: "ready" })).toBe("Nothing to choose yet");
  });

  it("keeps the rows on screen while it searches again, and says the first page is not the whole list", () => {
    expect(remoteNote({ status: "loading", count: 5, more: false, minChars: 0, query: "ab" })).toBeNull();
    expect(remoteNote({ status: "ready", count: 30, more: true, minChars: 0, query: "" })).toBe("Showing the first 30. Type to narrow the list.");
    expect(remoteNote({ status: "ready", count: 3, more: false, minChars: 0, query: "" })).toBeNull();
  });

  it("names a chosen value from the page's own labels or what a search returned, and never as the stored value", () => {
    expect(labelOfChoice("v1", { v1: "G3 — Grade 3" })).toBe("G3 — Grade 3");
    expect(labelOfChoice("v2", { v1: "x" }, new Map([["v2", "B — Buildings"]]))).toBe("B — Buildings");
    expect(labelOfChoice("cm1abc", {}, undefined)).toBe(UNKNOWN_CHOICE_LABEL);
    expect(UNKNOWN_CHOICE_LABEL).not.toMatch(/\d{3}/);
  });
});
