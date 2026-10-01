import { describe, expect, it } from "vitest";

import { REGISTER_STATUS_TONE } from "@/lib/award/labels";
import { OUTCOME_TONE } from "@/lib/committee/labels";
import { GATE_STATE_TONE, STATUS_TONE } from "@/lib/requisition/labels";

import { ROUTE_STATUS_TONE, STEP_DECISION_TONE, routeTone, stepTone } from "./status-tone";

describe("one tone per meaning", () => {
  it("shows a rejection in the same red everywhere it appears", () => {
    expect(ROUTE_STATUS_TONE.REJECTED).toBe("err");
    expect(STEP_DECISION_TONE.REJECTED).toBe("err");
    expect(STATUS_TONE.REJECTED).toBe("err");
    expect(REGISTER_STATUS_TONE.REJECTED).toBe("err");
    expect(OUTCOME_TONE.NOT_CARRIED).toBe("err");
  });
  it("shows approval and completion in the same green", () => {
    expect(ROUTE_STATUS_TONE.APPROVED).toBe("ok");
    expect(STATUS_TONE.APPROVED).toBe("ok");
    expect(STEP_DECISION_TONE.DONE).toBe("ok");
    expect(GATE_STATE_TONE.PASSED).toBe("ok");
    expect(OUTCOME_TONE.CARRIED).toBe("ok");
  });
  it("shows a recall as a warning on the route and on the requisition alike", () => {
    expect(ROUTE_STATUS_TONE.RECALLED).toBe("warn");
    expect(STATUS_TONE.RECALLED).toBe("warn");
    expect(GATE_STATE_TONE.RETURNED).toBe("warn");
  });
  it("shows a gate that ended, and one with no outcome recorded, as refused", () => {
    expect(GATE_STATE_TONE.ENDED).toBe("err");
    expect(GATE_STATE_TONE.OUTCOME_NOT_RECORDED).toBe("err");
  });
  it("reads an unknown status as neutral, never as a colour with a meaning", () => {
    expect(routeTone("SOMETHING_NEW")).toBe("neutral");
    expect(stepTone("SOMETHING_NEW")).toBe("neutral");
  });
});
