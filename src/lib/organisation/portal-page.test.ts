import { describe, expect, it } from "vitest";

import { normalisePortalPage, PORTAL_DEFAULT_HEADLINE, PORTAL_FIELDS, PORTAL_MAX, portalOrigin, portalPageFaults, portalValueLabel, portalView, publicPortalHref } from "./portal-page";

describe("what is stored from the supplier portal's settings form", () => {
  it("trims, collapses spaces and stores blank as null", () => {
    const s = normalisePortalPage({ headline: "  Join   us ", line: "   " });
    expect(s.headline).toBe("Join us");
    expect(s.line).toBeNull();
    expect(Object.keys(s)).toEqual([...PORTAL_FIELDS]);
  });

  it("stores the address as its origin and gives a bare domain https", () => {
    expect(normalisePortalPage({ publicAddress: "https://suppliers.example.com/sign-in?x=1#top" }).publicAddress).toBe("https://suppliers.example.com");
    expect(normalisePortalPage({ publicAddress: "suppliers.example.com/path" }).publicAddress).toBe("https://suppliers.example.com");
    expect(normalisePortalPage({ publicAddress: "http://localhost:3001/" }).publicAddress).toBe("http://localhost:3001");
  });

  it("never makes a link of a script, credentials or a hostless address", () => {
    for (const bad of ["javascript:alert(1)", "https://user:pass@example.com", "ftp://example.com", "https://intranet", "not an address"]) {
      expect(portalPageFaults({ publicAddress: bad }).publicAddress, bad).toMatch(/web address/);
      expect(portalOrigin(bad), bad).toBeNull();
    }
  });

  it("holds each field to its limit and the icons to the set", () => {
    expect(portalPageFaults({ headline: "x".repeat(PORTAL_MAX.headline + 1) }).headline).toMatch(/at most 60/);
    expect(portalPageFaults({ line: "x".repeat(121) }).line).toMatch(/at most 120/);
    expect(portalPageFaults({ highlight2: "x".repeat(41) }).highlight2).toMatch(/at most 40/);
    expect(portalPageFaults({ highlight1Icon: "skull" }).highlight1Icon).toMatch(/one of the icons/);
    expect(portalPageFaults({ highlight1Icon: "Building", headline: "Join" })).toEqual({});
  });

  it("reads an icon by its label in the change history", () => {
    expect(portalValueLabel("highlight1Icon", "globe")).toBe("Globe");
    expect(portalValueLabel("headline", "globe")).toBe("globe");
    expect(portalValueLabel("highlight1Icon", null)).toBeNull();
  });
});

describe("what the landing draws", () => {
  it("with nothing set: the product's own word, no line, no highlights, no address", () => {
    expect(portalView(null)).toEqual({ headline: PORTAL_DEFAULT_HEADLINE, line: null, highlights: [], publicAddress: null });
    expect(PORTAL_DEFAULT_HEADLINE).toBe("Supplier portal");
  });

  it("draws only the highlights that have words, each with its chosen icon or none", () => {
    const v = portalView({ highlight1: "Register online", highlight1Icon: "building", highlight2Icon: "globe", highlight3: "See results" });
    expect(v.highlights).toEqual([
      { text: "Register online", icon: "building" },
      { text: "See results", icon: null },
    ]);
  });

  it("judges the address again when drawn, so a value written some other way is no link", () => {
    expect(portalView({ publicAddress: "javascript:alert(1)" }).publicAddress).toBeNull();
    expect(portalView({ publicAddress: "https://suppliers.example.com/x" }).publicAddress).toBe("https://suppliers.example.com");
  });

  it("builds the public link from the origin and the same path, and none without an address", () => {
    expect(publicPortalHref("https://suppliers.example.com", "/supplier/sign-in")).toBe("https://suppliers.example.com/supplier/sign-in");
    expect(publicPortalHref(null, "/supplier/sign-in")).toBeNull();
  });
});
