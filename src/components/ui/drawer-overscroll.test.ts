import { describe, expect, it } from "vitest";

import { CONFIRM_SCRIM, DRAWER_SCRIM, confirmPanelClass, drawerPanelClass } from "./drawer";

/// N3 reviewer run 1, AC-63: a modal never scrolls the page behind it (overscroll-behavior: contain), on the scrim and on the panel.
describe("drawers and confirmation boxes contain overscroll", () => {
  it.each([
    ["drawer scrim", DRAWER_SCRIM],
    ["confirm scrim", CONFIRM_SCRIM],
    ["drawer panel", drawerPanelClass("md")],
    ["confirm panel", confirmPanelClass()],
  ])("%s", (_name, cls) => {
    expect(cls.split(/\s+/)).toContain("overscroll-contain");
  });
});
