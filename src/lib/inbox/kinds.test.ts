import { describe, expect, it } from "vitest";

import { markedReadByOpening, READ_WHEN_ACTED_ON, STAFF_NOTICE_KINDS } from "./kinds";

/// AC-47: opening a notice marks it read, except a closed list of one kind.
describe("which notices opening marks read", () => {
  it("exempts exactly the back-dated signature to confirm", () => {
    expect(READ_WHEN_ACTED_ON).toEqual(["BACKDATE_TO_CONFIRM"]);
    expect(STAFF_NOTICE_KINDS.filter((k) => !markedReadByOpening(k))).toEqual(["BACKDATE_TO_CONFIRM"]);
  });
});
