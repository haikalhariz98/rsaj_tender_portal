// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Language, LanguageChoice } from "@/lib/i18n/language";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/app/_auth/shell-counts", () => ({ shellCountsAction: vi.fn(async () => ({})) }));

import { LanguageProvider } from "@/components/i18n/language-context";
import { AppShell } from "@/components/shell/app-shell";
import { UserMenu } from "@/components/shell/user-menu";
import { NOT_CONVERTED_NOTICE, PARTLY_NOTICE } from "@/lib/i18n/coverage";
import type { ShellUser } from "@/lib/shell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const reset = () => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
};
afterEach(reset);

const STAFF: ShellUser = { name: "Aisyah Rahman", jobTitle: "Procurement officer", jobTitleMs: "Pegawai perolehan", kind: "staff" };

function shell(path: string, language: Language, opts: { user?: ShellUser | null; portalOnly?: boolean } = {}) {
  reset();
  nav.pathname = path;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      createElement(
        LanguageProvider,
        { language, choice: language, canSwitch: true, setLanguage: async () => ({ ok: true as const }) },
        createElement(
          AppShell,
          {
            organisation: { name: "Test organisation", logo: null },
            strapline: "",
            counts: {},
            user: opts.user === undefined ? STAFF : opts.user,
            portalOnly: opts.portalOnly,
            signOut: async () => {},
          } as unknown as ComponentProps<typeof AppShell>,
          createElement("p", null, "page body"),
        ),
      ),
    ),
  );
  return host;
}

const NOTE = 'main [role="note"]';

describe("the not-converted callout", () => {
  it("shows both languages on a screen not yet converted, when Malay is chosen", () => {
    const note = shell("/requisitions", "ms").querySelector(NOTE)!;
    expect(note).not.toBeNull();
    expect(note.textContent).toContain(NOT_CONVERTED_NOTICE.en);
    expect(note.textContent).toContain(NOT_CONVERTED_NOTICE.ms);
  });
  it("says parts of the screen on a partly converted one", () => {
    expect(shell("/inbox", "ms").querySelector(NOTE)!.textContent).toContain(PARTLY_NOTICE.ms);
  });
  it("is not shown when English is read", () => {
    expect(shell("/requisitions", "en").querySelector(NOTE)).toBeNull();
  });
  it("is not shown on a converted screen", () => {
    expect(shell("/", "ms").querySelector(NOTE)).toBeNull();
  });
  it("is not shown to someone who is not staff, or on the public copy", () => {
    expect(shell("/requisitions", "ms", { user: null }).querySelector(NOTE)).toBeNull();
    expect(shell("/requisitions", "ms", { portalOnly: true }).querySelector(NOTE)).toBeNull();
  });
  it("leaves the page body where it was", () => {
    expect(shell("/requisitions", "ms").querySelector("main")!.textContent).toContain("page body");
  });
});

describe("the top bar and the sidebar read in the chosen language", () => {
  it("names the navigation in Malay, and in English", () => {
    expect(shell("/", "ms").querySelector("nav[aria-label=Main]")!.textContent).toContain("Papan Pemuka");
    const en = shell("/", "en").querySelector("nav[aria-label=Main]")!.textContent!;
    expect(en).toContain("Dashboard");
    expect(en).not.toContain("Papan Pemuka");
  });
  it("offers the switch in the top bar, with no fixed EN mark", () => {
    const bar = shell("/", "en").querySelector("header")!;
    expect([...bar.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent)).toEqual(["English", "Bahasa Malaysia"]);
    expect(bar.textContent).not.toMatch(/\bEN\b/);
  });
});

function menu(language: Language, choice: LanguageChoice, user: ShellUser = STAFF) {
  reset();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(LanguageProvider, { language, choice, canSwitch: true, setLanguage: async () => ({ ok: true as const }) }, createElement(UserMenu, { user, signOut: async () => {} }))));
  act(() => host.querySelector<HTMLButtonElement>("button[aria-haspopup=menu]")!.click());
  return host.querySelector('[role="menu"]')!.textContent!;
}

describe("the user menu", () => {
  it("says English is the default and was not chosen, when the choice is null", () => {
    expect(menu("en", null)).toContain("English, the default: not chosen");
  });
  it("says so in Malay too, if Malay is being read with no stored choice", () => {
    expect(menu("ms", null)).toContain("Bahasa Inggeris, lalai: belum dipilih");
  });
  it("names a stated choice", () => {
    expect(menu("ms", "ms")).toContain("Bahasa Malaysia, pilihan anda");
    expect(menu("en", "en")).toContain("English, as you chose");
  });
  it("shows the Malay job title when Malay is chosen and one is recorded, else the title as recorded", () => {
    expect(menu("ms", "ms")).toContain("Pegawai perolehan");
    expect(menu("en", "en")).toContain("Procurement officer");
    expect(menu("ms", "ms", { ...STAFF, jobTitleMs: null })).toContain("Procurement officer");
  });
});
