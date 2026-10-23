import { describe, expect, it } from "vitest";

import { splitStateLabel } from "./splitting";

describe("a stored split check (FR-REQ-015 removed; past checks kept)", () => {
  it("reads a stored NOT_SET as not assessed, never as clear", () => {
    expect(splitStateLabel("NOT_SET").label).not.toBe(splitStateLabel("CLEAR").label);
    expect(splitStateLabel("NOT_SET").label).toMatch(/Not assessed/);
  });
});
