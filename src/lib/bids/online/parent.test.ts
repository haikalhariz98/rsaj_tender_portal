import { describe, expect, it } from "vitest";

import { parentReachable } from "./parent";

/**
 * The unseal's parent check (D7, M2, 20h). A worked example: supplier A's alternative ALT named its bid A1 as parent. A1 was replaced by A2, and A2 by A3; each
 * replace moved ALT's link on (trigger 6). At the unseal ALT's row names A3, and its sealed manifest names A1: A3 is reached from A1 by following replacements.
 */

const REPLACED_BY: Record<string, string | null> = { A1: "A2", A2: "A3", A3: null, B1: null };
const replacedBy = (id: string) => REPLACED_BY[id] ?? null;

describe("the current parent is reached from the sealed one", () => {
  it("follows a replace chain to the current parent, at any depth", () => {
    expect(parentReachable("A1", "A1", replacedBy, false)).toBe(true);
    expect(parentReachable("A1", "A2", replacedBy, false)).toBe(true);
    expect(parentReachable("A1", "A3", replacedBy, false)).toBe(true);
  });

  it("refuses a jump to another supplier's bid, or back up the chain", () => {
    expect(parentReachable("A1", "B1", replacedBy, false)).toBe(false);
    expect(parentReachable("A2", "A1", replacedBy, false)).toBe(false);
  });

  it("none after a recorded withdrawal cleared the link; none otherwise is refused", () => {
    expect(parentReachable("A1", null, replacedBy, true)).toBe(true);
    expect(parentReachable("A1", null, replacedBy, false)).toBe(false);
  });

  it("an alternative sealed with no parent has none now", () => {
    expect(parentReachable(null, null, replacedBy, false)).toBe(true);
    expect(parentReachable(null, "A1", replacedBy, false)).toBe(false);
  });

  it("a loop in the chain ends rather than running for ever", () => {
    const loop = (id: string) => ({ X: "Y", Y: "X" })[id as "X" | "Y"] ?? null;
    expect(parentReachable("X", "Z", loop, false)).toBe(false);
  });
});
