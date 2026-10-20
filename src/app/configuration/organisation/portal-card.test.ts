// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./sign-in-actions", () => ({ savePortalPage: async () => ({ ok: true }) }));

import { normalisePortalPage, PORTAL_CARD_ID } from "@/lib/organisation/portal-page";

import { PortalPageCard } from "./portal-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function draw(settings: Parameters<typeof PortalPageCard>[0]["settings"]) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(PortalPageCard, { settings })));
  return host;
}

describe("the supplier portal's settings card", () => {
  it("is the anchor the officers' copy links to, titled Supplier portal", () => {
    const host = draw(normalisePortalPage({}));
    expect(host.querySelector(`#${PORTAL_CARD_ID}`)).not.toBeNull();
    expect(host.textContent).toContain("Supplier portal");
    expect(host.textContent).toContain("Shown beside supplier sign-in and register.");
  });

  it("with nothing set says so, and shows every setting as not set rather than blank", () => {
    const host = draw(normalisePortalPage({}));
    // The warning chip, and one "Not set" for each of the six unset words and the address.
    expect(host.textContent!.match(/Not set/g)).toHaveLength(7);
    expect(host.textContent).toContain("Public portal address");
    expect(host.textContent).toContain("Not chosen: a plain tick");
  });

  it("with words set shows them, and no longer says the card is not set", () => {
    const host = draw(normalisePortalPage({ publicAddress: "https://suppliers.example.com/x", headline: "Join us", highlight1Icon: "building" }));
    expect(host.textContent).toContain("https://suppliers.example.com");
    expect(host.textContent).not.toContain("suppliers.example.com/x");
    expect(host.textContent).toContain("Join us");
    expect(host.textContent).toContain("Building");
    // No warning chip: only the four unset words (line and three highlights) still read "Not set".
    expect(host.textContent!.match(/Not set/g)).toHaveLength(4);
  });
});
