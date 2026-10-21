import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PortalBranding } from "@/lib/organisation/portal-load";
import { portalView } from "@/lib/organisation/portal-page";

import type { PortalPage } from "./portal-frame";
import { SignInScreen } from "./sign-in-screen";
import { StaffPortalCard } from "./staff-portal-card";

const SHA_LOGO = "1".repeat(64);

function branding(over: Partial<PortalBranding> & { settings?: Parameters<typeof portalView>[0] } = {}): PortalBranding {
  const { settings, ...rest } = over;
  return { organisationName: "Example", year: "2027", links: [{ label: "Privacy", href: "https://example.com/privacy" }], logo: null, view: portalView(settings ?? null), ...rest };
}

function html(page: PortalPage, b: PortalBranding, children = createElement("form")) {
  // eslint-disable-next-line react/no-children-prop
  return renderToStaticMarkup(createElement(SignInScreen, { variant: "portal", page, branding: b, children }));
}

describe("the supplier portal's front door (design note 0006, founder 2026-10-20)", () => {
  it("with nothing configured: the organisation's name, the product's own headline and the illustration, and no line or highlights", () => {
    const out = html("sign-in", branding());
    expect(out).toContain("Example");
    expect(out).toContain("Supplier portal");
    expect(out).toContain("<svg");
    expect(out).not.toContain("<ul");
  });

  it("draws the configured line and highlights, with their icons, and only those that are set", () => {
    const out = html("sign-in", branding({ settings: { headline: "Join us", line: "Register online.", highlight1: "Register online", highlight1Icon: "building", highlight2: "See results", highlight2Icon: "globe" } }));
    expect(out).toContain("Join us");
    expect(out).toContain("Register online.");
    expect(out).toContain("See results");
    expect(out.match(/<li /g)).toHaveLength(2);
  });

  it("names only the ordinary logo: the staff picture and the logo for dark backgrounds are refused on the public copy", () => {
    const out = html("sign-in", branding({ logo: { sha: SHA_LOGO, width: 500, height: 500 } }));
    expect(out).toContain(`/organisation/logo/${SHA_LOGO}`);
    expect(out).not.toContain("/sign-in/image/");
  });

  it("is one page on both copies: a Register button under the card and the footer, and no top links", () => {
    const out = html("sign-in", branding());
    expect(out).not.toContain('href="/supplier/opportunities"');
    expect(out).not.toContain('href="/supplier/results"');
    expect(out).toContain("New supplier?");
    expect(out).toContain('href="/supplier/register"');
    expect(out).toContain("© 2027 Example");
    expect(out).toContain("Privacy");
  });

  it("on register: a wider column, no top links, no card and no second Register button", () => {
    const out = html("register", branding());
    expect(out).toContain("lg:grid-cols-[40fr_60fr]");
    expect(out).not.toContain('href="/supplier/sign-in"');
    expect(out).not.toContain('href="/supplier/opportunities"');
    expect(out).not.toContain("New supplier?");
  });

  it("links the logo, or the name without one, to the portal's home", () => {
    expect(html("sign-in", branding())).toMatch(/<a [^>]*href="\/supplier">Example<\/a>/);
    expect(html("sign-in", branding({ logo: { sha: SHA_LOGO, width: 500, height: 500 } }))).toMatch(/<a [^>]*href="\/supplier"><img/);
  });

  it("the left panel holds no button and no link out to a third party", () => {
    const aside = /<aside[\s\S]*?<\/aside>/.exec(html("sign-in", branding()))![0];
    expect(aside).not.toContain("<button");
    expect(aside).not.toMatch(/https?:/);
  });

  it("never draws a stand-in for what the organisation left unset", () => {
    const out = html("sign-in", branding({ organisationName: "" }));
    expect(out).not.toContain("©  ");
    expect(out).not.toMatch(/Welcome|Bid online/);
  });
});

describe("the card the officers' copy shows in place of a form", () => {
  const card = (props: { address: string | null; canSet: boolean }) => renderToStaticMarkup(createElement(StaffPortalCard, { path: "/supplier/sign-in", ...props }));

  it("with the public address set: one primary button to the same page there, in a new tab, and no line", () => {
    const out = card({ address: "https://suppliers.example.com", canSet: false });
    expect(out).toContain("Suppliers use the public portal");
    expect(out).toContain('href="https://suppliers.example.com/supplier/sign-in"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("Open supplier portal");
    expect(out).toContain("(opens in a new tab)");
    expect(out).not.toContain("not set");
  });

  it("with no address, for someone who may propose configuration: says so and offers the way to set it", () => {
    const out = card({ address: null, canSet: true });
    expect(out).toContain("Public portal address not set.");
    expect(out).toContain('href="/configuration/organisation?tab=details#supplier-portal"');
    expect(out).toContain("Set it");
    expect(out).not.toContain("Open supplier portal");
  });

  it("with no address, for anyone else: says who sets it, and offers no link", () => {
    const out = card({ address: null, canSet: false });
    expect(out).toContain("An administrator sets it in Configuration.");
    expect(out).not.toContain("Set it");
    expect(out).not.toContain("<a ");
  });

  it("never turns an address a link may not point at into a link", () => {
    const out = card({ address: "javascript:alert(1)", canSet: false });
    expect(out).not.toContain("javascript:");
    expect(out).toContain("Public portal address not set.");
  });

  it("holds no form and no sign-in", () => {
    const out = card({ address: "https://suppliers.example.com", canSet: true });
    expect(out).not.toMatch(/<form|<input|type="password"/);
  });
});
