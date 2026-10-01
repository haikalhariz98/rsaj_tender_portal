import { describe, expect, it } from "vitest";

import { MATTER_KIND_LABEL, MATTER_KINDS, SITTING_TABLED_MATTER_KINDS } from "./labels";

describe("matter kinds (ruling 5.3, 6.2 OD-9)", () => {
  it("every kind has words, the scope matter included", () => {
    for (const k of MATTER_KINDS) expect(MATTER_KIND_LABEL[k]).toBeTruthy();
    expect(MATTER_KIND_LABEL.SCOPE).toBe("Scope (bill of quantities)");
  });
  it("a scope matter is tabled from the exercise, which names the bill version; the sitting's drawer neither offers nor accepts it", () => {
    expect(SITTING_TABLED_MATTER_KINDS).not.toContain("SCOPE");
    expect(SITTING_TABLED_MATTER_KINDS).toEqual(MATTER_KINDS.filter((k) => k !== "SCOPE"));
  });
});
