import { describe, expect, it } from "vitest";

import { NOT_ON_PANEL, ONLINE_INITIAL_OWN, onlineInitialFault, panelActorFault } from "./actor";

const panel = [{ personId: "a", present: true }, { personId: "b", present: false }];

describe("who may write at an opening", () => {
  it("a present panel member may; an absent member and a stranger may not", () => {
    expect(panelActorFault(panel, "a")).toBeNull();
    expect(panelActorFault(panel, "b")).toBe(NOT_ON_PANEL);
    expect(panelActorFault(panel, "z")).toBe(NOT_ON_PANEL);
    expect(panelActorFault([], "a")).toBe(NOT_ON_PANEL);
  });
  it("an online initial is the officer's own; paper may be recorded for another", () => {
    expect(onlineInitialFault("ONLINE", "a", "a")).toBeNull();
    expect(onlineInitialFault("ONLINE", "a", "z")).toBe(ONLINE_INITIAL_OWN);
    expect(onlineInitialFault("PAPER", "a", "z")).toBeNull();
  });
});
