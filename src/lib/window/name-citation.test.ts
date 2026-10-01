import { describe, expect, it } from "vitest";

import { windowFindingText } from "./labels";
import { nameCitationFault } from "./name-citation";

/**
 * OD-12: a committee step on a name route is discharged only by citing the committee's decision on
 * a matter tabled against this exercise, on the approval of the name. Each refusal, alone.
 */

const matter = { id: "d1", exerciseId: "x1", matterKind: "EXERCISE", domain: "name_approval", act: "MR", committeeCode: "TBC", decidedOn: "2026-09-20" };
const step = { committeeCode: "TBC", act: "MR" };
const opened = "2026-09-15";

describe("citing a decision on a name route's committee step", () => {
  it("a matter of this exercise, on the name, before the step's committee, for its act, decided after the route opened, discharges it", () => {
    expect(nameCitationFault(matter, step, "x1", opened, [])).toBeNull();
  });
  it("another exercise's matter is refused", () => expect(nameCitationFault({ ...matter, exerciseId: "x2" }, step, "x1", opened, [])).toBe("NOT_THIS_EXERCISE"));
  it("a matter not tabled as an exercise matter is refused", () => expect(nameCitationFault({ ...matter, matterKind: null }, step, "x1", opened, [])).toBe("NOT_A_NAME_MATTER"));
  it("an exercise matter on another domain (the appointment) is refused", () => expect(nameCitationFault({ ...matter, domain: "appointment" }, step, "x1", opened, [])).toBe("NOT_A_NAME_MATTER"));
  it("another committee's matter is refused", () => expect(nameCitationFault({ ...matter, committeeCode: "QC" }, step, "x1", opened, [])).toBe("OTHER_COMMITTEE"));
  it("a matter tabled for another act is refused", () => expect(nameCitationFault({ ...matter, act: "A" }, step, "x1", opened, [])).toBe("OTHER_ACT"));
  it("a decision already discharging a step is refused: one decision, one step", () => expect(nameCitationFault(matter, step, "x1", opened, ["d1"])).toBe("ALREADY_CITED"));
  it("a decision taken before the route opened is refused", () => expect(nameCitationFault({ ...matter, decidedOn: "2026-09-14" }, step, "x1", opened, [])).toBe("DECIDED_BEFORE_ROUTE"));
  it("decided the day the route opened is not before it", () => expect(nameCitationFault({ ...matter, decidedOn: "2026-09-15" }, step, "x1", opened, [])).toBeNull());
  it("each refusal has words", () => {
    for (const code of ["NOT_THIS_EXERCISE", "NOT_A_NAME_MATTER", "OTHER_COMMITTEE", "OTHER_ACT", "ALREADY_CITED", "DECIDED_BEFORE_ROUTE"]) expect(windowFindingText({ code, level: "block" })).not.toBe("This cannot be done now.");
  });
});
