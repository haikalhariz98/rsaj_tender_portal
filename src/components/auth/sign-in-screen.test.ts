import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SignInBranding } from "@/lib/organisation/sign-in-load";
import { signInView } from "@/lib/organisation/sign-in-page";

import { SignInScreen } from "./sign-in-screen";

const SHA_LOGO = "1".repeat(64);
const SHA_DARK = "2".repeat(64);
const SHA_IMAGE = "3".repeat(64);

function html(over: Partial<SignInBranding> & { settings?: Parameters<typeof signInView>[0] }) {
  const { settings, ...branding } = over;
  const logo = branding.logo === undefined ? null : branding.logo;
  const darkLogo = branding.darkLogo === undefined ? null : branding.darkLogo;
  const imageSha = branding.imageSha ?? null;
  const view = signInView(settings ?? { headline: "A headline", tagline: "A tagline", highlight1: "One", highlight1Icon: "document", highlight2: "Two", highlight3: "Three", highlight3Icon: "shield" }, {
    organisationName: "Example",
    hasImage: imageSha != null,
    hasLogo: logo != null || darkLogo != null,
    now: new Date("2027-01-01T00:00:00Z"),
    timeZone: null,
  });
  // The screen takes its form as a required `children` prop, which createElement only types when it is passed as a prop.
  // eslint-disable-next-line react/no-children-prop
  return renderToStaticMarkup(createElement(SignInScreen, { branding: { view, imageSha, logo, darkLogo }, children: createElement("form") }));
}

const LOGO = { sha: SHA_LOGO, width: 500, height: 500 };
const DARK = { sha: SHA_DARK, width: 400, height: 120 };

describe("the logo on the sign-in page's panel", () => {
  it("with a logo for dark backgrounds: that file as it is, with no backdrop around it", () => {
    const out = html({ logo: LOGO, darkLogo: DARK });
    expect(out).toContain(`/sign-in/image/${SHA_DARK}`);
    expect(out).not.toContain(`/organisation/logo/${SHA_LOGO}`);
    expect(out).not.toContain("backdrop-blur");
    expect(out).not.toContain("bg-white/90");
  });

  it("without one: the ordinary logo with no box behind it, only a light halo that follows its outline", () => {
    const out = html({ logo: LOGO, darkLogo: null });
    expect(out).toContain(`/organisation/logo/${SHA_LOGO}`);
    expect(out).not.toMatch(/bg-white|backdrop-blur|ring-white/);
    expect(out).toMatch(/<img[^>]*organisation\/logo[^>]*drop-shadow/);
    expect(out).toMatch(/drop-shadow[^"]*drop-shadow/);
  });

  it("never recolours the logo", () => {
    for (const out of [html({ logo: LOGO, darkLogo: null }), html({ logo: LOGO, darkLogo: DARK })]) {
      expect(out).not.toMatch(/brightness-|invert|grayscale|sepia|hue-rotate|contrast-|mix-blend/);
    }
  });

  it("with neither: no logo is drawn at all", () => {
    const out = html({ logo: null, darkLogo: null });
    expect(out).not.toContain("/organisation/logo/");
    expect(out).not.toContain(`/sign-in/image/${SHA_DARK}`);
  });
});

describe("the highlights", () => {
  it("let a long word break inside its column instead of running into the next icon", () => {
    const out = html({ settings: { highlight1: "Kebertanggungjawaban", highlight1Icon: "document" } });
    expect(out).toMatch(/<li[^>]*\[overflow-wrap:anywhere\][^>]*>/);
  });

  it("draw a drawing in a round icon beside each, and the neutral tick where no icon was chosen", () => {
    const out = html({});
    // Three round icons, one per highlight.
    expect(out.match(/rounded-full/g)).toHaveLength(3);
    // The words are the organisation's own and the icon names never appear on the screen.
    expect(out).toContain(">One<");
    expect(out).not.toMatch(/>(document|people|shield|check)</);
  });
});

describe("the picture", () => {
  it("is decoration, drawn in the panel only, with the shading behind the words and none across the whole panel", () => {
    const out = html({ imageSha: SHA_IMAGE });
    expect(out).toContain(`/sign-in/image/${SHA_IMAGE}`);
    expect(out).toContain('alt=""');
    // Two shades (the text block and the tagline), each with its own mask; no full-panel gradient overlay.
    expect(out.match(/mask-composite:intersect/g)).toHaveLength(2);
    expect(out).not.toMatch(/bg-linear-to-/);
  });
});
