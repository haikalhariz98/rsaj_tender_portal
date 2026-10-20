import { describe, expect, it } from "vitest";

import { isPortalLandingPath, isSignInPath, PORTAL_LANDING_PATHS } from "./routes";

describe("the supplier portal's front-door pages (design note 0006)", () => {
  it("are the four literal paths, drawn without the staff frame", () => {
    expect([...PORTAL_LANDING_PATHS]).toEqual(["/supplier/sign-in", "/supplier/register", "/supplier/activate", "/supplier/reset"]);
    for (const p of PORTAL_LANDING_PATHS) expect(isPortalLandingPath(p), p).toBe(true);
  });

  it("are not any other supplier page, a post below them, or a lookalike", () => {
    for (const p of ["/supplier", "/supplier/account", "/supplier/registration", "/supplier/register/submit", "/supplier/sign-in/submit", "/supplier/sign-in/x", "/supplier/opportunities", "/supplier/results", "/Supplier/sign-in", "/sign-in", "/"]) {
      expect(isPortalLandingPath(p), p).toBe(false);
    }
  });

  it("do not widen the staff sign-in screens", () => {
    expect(isSignInPath("/supplier/sign-in")).toBe(false);
  });
});
