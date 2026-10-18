// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/components/i18n/language-context";
import { LanguageSwitch } from "@/components/shell/language-switch";
import type { LanguageChoice } from "@/lib/i18n/language";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function mount(choice: LanguageChoice, action: (d: FormData) => Promise<{ ok: true }>) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(LanguageProvider, { language: choice ?? "en", choice, canSwitch: true, setLanguage: action }, createElement(LanguageSwitch))));
  return host;
}
const press = (host: HTMLElement, name: string) => {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent === name)!;
  act(() => b.click());
  return b;
};

describe("pressing a language", () => {
  it("records English as a choice when nothing was ever chosen", async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    const host = mount(null, action);
    press(host, "English");
    await act(async () => {});
    expect(action).toHaveBeenCalledTimes(1);
    expect((action.mock.calls[0] as unknown as [FormData])[0].get("language")).toBe("en");
  });
  it("does nothing when that language is already the stored choice", () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    press(mount("ms", action), "Bahasa Malaysia");
    expect(action).not.toHaveBeenCalled();
  });
  it("never disables the pressed button while the save is out, so keyboard focus stays", async () => {
    let release: () => void = () => {};
    const action = vi.fn(() => new Promise<{ ok: true }>((r) => (release = () => r({ ok: true }))));
    const host = mount("en", action);
    const b = press(host, "Bahasa Malaysia");
    expect(b.disabled).toBe(false);
    expect(host.querySelector("[aria-busy='true']")).not.toBeNull();
    press(host, "Bahasa Malaysia");
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });
});
