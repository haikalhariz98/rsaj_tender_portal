import { describe, expect, it } from "vitest";

import { normaliseSignInPage, safeLinkHref, SIGN_IN_DEFAULT_TITLE, SIGN_IN_FIELDS, SIGN_IN_MAX, signInPageFaults, signInView } from "./sign-in-page";

const NOW = new Date("2027-01-01T00:30:00Z");
const ctx = { organisationName: "Example Organisation", hasImage: false, hasLogo: false, now: NOW, timeZone: null as string | null };

describe("what is stored from the sign-in settings form", () => {
  it("trims, collapses spaces, and stores blank as null", () => {
    const s = normaliseSignInPage({ headline: "  Buying   made  clear ", tagline: "   ", portalName: undefined });
    expect(s.headline).toBe("Buying made clear");
    expect(s.tagline).toBeNull();
    expect(s.portalName).toBeNull();
    expect(Object.keys(s).sort()).toEqual([...SIGN_IN_FIELDS].sort());
  });

  it("gives a bare domain https and leaves a written address alone", () => {
    expect(normaliseSignInPage({ privacyUrl: "example.com/privacy" }).privacyUrl).toBe("https://example.com/privacy");
    expect(normaliseSignInPage({ termsUrl: "http://example.com/terms" }).termsUrl).toBe("http://example.com/terms");
    expect(normaliseSignInPage({ helpDeskUrl: "localhost:3000/help" }).helpDeskUrl).toBe("https://localhost:3000/help");
  });
});

describe("links are web addresses only", () => {
  it("accepts http and https with a host", () => {
    expect(safeLinkHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeLinkHref("http://help.example.org")).toBe("http://help.example.org/");
  });

  it("refuses a script, data, mail, file or relative address, however it is dressed", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "javascript://%0aalert(1)", "data:text/html,<b>x</b>", "mailto:a@b.com", "file:///etc/passwd", "//evil.example.com", "/help", "https://", "https://user:pass@example.com", "https://exa mple.com", "https://intranet", "", null, undefined]) {
      expect(safeLinkHref(bad), String(bad)).toBeNull();
    }
  });

  it("the form refuses what a link may not be, with words, and accepts what it may", () => {
    expect(signInPageFaults({ privacyUrl: "javascript:alert(1)" }).privacyUrl).toMatch(/web address/);
    expect(signInPageFaults({ termsUrl: "mailto:a@b.com" }).termsUrl).toMatch(/web address/);
    expect(signInPageFaults({ helpDeskUrl: "example.com/help", privacyUrl: "https://example.com/p" })).toEqual({});
    expect(signInPageFaults({})).toEqual({});
  });

  it("the form refuses text over its length, naming the field and the count", () => {
    const f = signInPageFaults({ headline: "x".repeat(SIGN_IN_MAX.headline + 1) });
    expect(f.headline).toBe(`Headline can be at most ${SIGN_IN_MAX.headline} characters. This is ${SIGN_IN_MAX.headline + 1}.`);
  });
});

describe("what the page draws", () => {
  it("with nothing set: the neutral title, no words, no links, no panel", () => {
    const v = signInView(null, ctx);
    expect(v).toMatchObject({ title: SIGN_IN_DEFAULT_TITLE, portalName: null, headline: null, supportingText: null, highlights: [], tagline: null, links: [], hasPanel: false });
  });

  it("an image alone, or a logo alone, is enough for a panel", () => {
    expect(signInView(null, { ...ctx, hasImage: true }).hasPanel).toBe(true);
    expect(signInView(null, { ...ctx, hasLogo: true }).hasPanel).toBe(true);
  });

  it("any one of the panel's words is enough", () => {
    expect(signInView({ tagline: "Something" }, ctx).hasPanel).toBe(true);
    expect(signInView({ highlight3: "Third" }, ctx).hasPanel).toBe(true);
  });

  it("the portal name becomes the title; highlights keep their order and drop the blanks", () => {
    const v = signInView({ portalName: "Example Portal", highlight1: "One", highlight2: "  ", highlight3: "Three" }, ctx);
    expect(v.title).toBe("Example Portal");
    expect(v.highlights).toEqual(["One", "Three"]);
  });

  it("shows only the links that are set and safe, in the footer's order", () => {
    const v = signInView({ helpDeskUrl: "https://example.com/help", termsUrl: "javascript:alert(1)", privacyUrl: "https://example.com/privacy" }, ctx);
    expect(v.links).toEqual([
      { label: "Privacy", href: "https://example.com/privacy" },
      { label: "Help Desk", href: "https://example.com/help" },
    ]);
  });

  it("the footer year is the organisation's own year, not UTC's", () => {
    expect(signInView(null, { ...ctx, timeZone: null }).year).toBe("2027");
    expect(signInView(null, { ...ctx, timeZone: "America/New_York" }).year).toBe("2026");
    expect(signInView(null, { ...ctx, timeZone: "Asia/Kuala_Lumpur" }).year).toBe("2027");
  });
});
