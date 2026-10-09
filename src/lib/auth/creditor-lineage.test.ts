import { describe, expect, it } from "vitest";

import { lineageApplication } from "./creditor-lineage";

describe("which application names a creditor profile (Phase 4c)", () => {
  const parents = new Map<string, string | null>([["v3", "v2"], ["v2", "v1"], ["v1", null]]);

  it("a profile sent with an application is named by it", () => {
    expect(lineageApplication("v1", parents, new Map([["v1", "appA"]]))).toBe("appA");
  });
  it("a later version takes the application of the nearest earlier one that has one", () => {
    expect(lineageApplication("v3", parents, new Map([["v1", "appA"]]))).toBe("appA");
    expect(lineageApplication("v3", parents, new Map([["v1", "appA"], ["v2", "appB"]]))).toBe("appB");
  });
  it("its own application wins over an earlier one", () => {
    expect(lineageApplication("v2", parents, new Map([["v1", "appA"], ["v2", "appB"]]))).toBe("appB");
  });
  it("a chain no application reaches names none, and a cycle in corrupt data ends", () => {
    expect(lineageApplication("v3", parents, new Map())).toBeNull();
    const loop = new Map<string, string | null>([["a", "b"], ["b", "a"]]);
    expect(lineageApplication("a", loop, new Map())).toBeNull();
  });
});
