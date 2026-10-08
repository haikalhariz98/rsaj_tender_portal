// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./sign-in-actions", () => {
  const act = async () => ({ ok: true });
  return { removeDarkLogo: act, removeSignInImage: act, saveSignInPage: act, uploadDarkLogo: act, uploadSignInImage: act };
});

import { normaliseSignInPage } from "@/lib/organisation/sign-in-page";

import { SignInPageCards } from "./sign-in-cards";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function draw(props: Parameters<typeof SignInPageCards>[0]) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(SignInPageCards, props)));
  return host;
}

const NO_SETTINGS = normaliseSignInPage({});

describe("the sign-in page's settings cards", () => {
  it("say, with nothing uploaded, that the logo for dark backgrounds is not set and what the page shows instead", () => {
    const host = draw({ image: null, darkLogo: null, settings: NO_SETTINGS });
    expect(host.textContent).toContain("Logo for dark backgrounds: not set — the sign-in page shows your logo on a light backdrop");
  });

  it("show a logo for dark backgrounds that is set, on a dark ground, and not the 'not set' line", () => {
    const host = draw({ image: null, darkLogo: { sha: "a".repeat(64), mediaType: "image/png", sizeKb: 12, width: 400, height: 120, uploadedOn: "8 Oct 2026" }, settings: NO_SETTINGS });
    expect(host.textContent).not.toContain("not set — the sign-in page shows");
    expect(host.querySelector(`img[src="/sign-in/image/${"a".repeat(64)}"]`)).not.toBeNull();
    expect(host.textContent).toContain("PNG, 400 × 120 px, 12 KB");
  });

  it("show a chosen icon by its label, never by its key, and an unchosen one as a plain tick", () => {
    const host = draw({ image: null, darkLogo: null, settings: normaliseSignInPage({ highlight1: "One", highlight1Icon: "shield", highlight2: "Two" }) });
    const text = host.textContent ?? "";
    expect(text).toContain("Shield with a tick");
    expect(text).not.toMatch(/\bshield\b/);
    expect(text).toContain("Not chosen: a plain tick");
  });
});
