import { describe, expect, it } from "vitest";

import { NOT_ON_PANEL, panelActorFault } from "./actor";
import { matrixActorFaults } from "./matrix";

const panel = [{ personId: "a", present: true }, { personId: "b", present: false }];

describe("who may write at an opening", () => {
  it("a present panel member may; an absent member and a stranger may not", () => {
    expect(panelActorFault(panel, "a")).toBeNull();
    expect(panelActorFault(panel, "b")).toBe(NOT_ON_PANEL);
    expect(panelActorFault(panel, "z")).toBe(NOT_ON_PANEL);
    expect(panelActorFault([], "a")).toBe(NOT_ON_PANEL);
  });
  it("an online initial is the officer's own; paper may be recorded for another", () => {
    // Ruling 22, 20cp: the rule is `matrixActorFaults` now (the old per-channel check is gone).
    const own = (online: boolean, subject: string, actor: string) => matrixActorFaults({ online, act: "CONFIRM", administrator: false, actorPersonId: actor, subjectPersonId: subject, officers: ["a", "z"] }).map((f) => f.code);
    expect(own(true, "a", "a")).toEqual([]);
    expect(own(true, "a", "z")).toEqual(["NOT_OWN_ACT"]);
    expect(own(false, "a", "z")).toEqual([]);
  });
});
