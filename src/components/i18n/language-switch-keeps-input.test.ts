// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/components/record-editor";

// NFR-LNG-001 acceptance: "A user switching language mid-task sees the whole interface in the selected language and loses no entered data."
// The switch is clicked inside a real RecordEditor drawer (the top bar is unreachable while a drawer is open, ruling 20bt). The server action
// is mocked to resolve ok and, as `refresh()` does in place, the same tree is drawn again with the new language.

const mocked = vi.hoisted(() => ({ rerender: null as null | (() => void), setLanguageAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/configuration/budget" }));

import { LanguageProvider } from "@/components/i18n/language-context";
import { RecordEditor } from "@/components/record-editor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  mocked.setLanguageAction.mockReset();
  mocked.rerender = null;
});

const FIELDS = [
  { kind: "text" as const, name: "title", label: "Title" },
  {
    kind: "select" as const,
    name: "method",
    label: "Method",
    options: [
      { value: "open", label: "Open" },
      { value: "limited", label: "Limited" },
    ],
  },
  { kind: "textarea" as const, name: "notes", label: "Notes" },
];

function mount() {
  const action = vi.fn(async (): Promise<FormState> => ({ ok: true }));
  const submitted = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const tree = (language: "en" | "ms"): ReactElement =>
    createElement(
      LanguageProvider,
      { language, choice: language, canSwitch: true, setLanguage: mocked.setLanguageAction },
      createElement(RecordEditor, { title: "Edit budget", fields: FIELDS, action, trigger: { label: "Edit" } }),
    );
  mocked.rerender = () => root!.render(tree("ms"));
  act(() => root!.render(tree("en")));
  return { host, action, submitted };
}

/// A typed value, the way a browser reports it: the native setter, then an input event (React ignores a bare assignment).
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function choose(el: HTMLSelectElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("switching the language inside an open drawer (NFR-LNG-001)", () => {
  it("keeps every typed value, keeps the drawer open, submits nothing, and speaks Malay afterwards", async () => {
    const { host, action, submitted } = mount();
    const open = [...host.querySelectorAll("button")].find((b) => b.textContent === "Edit")!;
    act(() => open.click());

    const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog()).not.toBeNull();
    const form = dialog().querySelector("form")!;
    form.addEventListener("submit", submitted);

    const field = (name: string) => form.querySelector<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(`[name="${name}"]`)!;
    type(field("title"), "Roads, phase 2");
    choose(field("method"), "limited");
    type(field("notes"), "Line one\nLine two");

    // English before the switch.
    const header = () => dialog().querySelector("header")!;
    expect(header().querySelector('button[aria-label="Close"]')).not.toBeNull();
    expect(dialog().textContent).toContain("Cancel");

    // The switch is in the drawer's own header, and is the control that is clicked.
    mocked.setLanguageAction.mockImplementation(async (data: FormData) => {
      expect(data.get("language")).toBe("ms");
      mocked.rerender!();
      return { ok: true };
    });
    const malay = [...header().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Bahasa Malaysia")!;
    expect(malay.type).toBe("button");
    expect(malay.getAttribute("aria-pressed")).toBe("false");
    await act(async () => malay.click());

    expect(mocked.setLanguageAction).toHaveBeenCalledTimes(1);
    // The same drawer, the same form, the same typed values.
    expect(dialog()).not.toBeNull();
    expect(dialog().querySelector("form")).toBe(form);
    expect(field("title").value).toBe("Roads, phase 2");
    expect(field("method").value).toBe("limited");
    expect(field("notes").value).toBe("Line one\nLine two");
    // Nothing was submitted or saved.
    expect(submitted).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    // The drawer's own words are Malay now, and the switch shows the choice.
    expect(header().querySelector('button[aria-label="Tutup"]')).not.toBeNull();
    expect(header().querySelector('button[aria-label="Close"]')).toBeNull();
    expect(dialog().textContent).toContain("Batal");
    expect(dialog().textContent).toContain("Simpan");
    const pressed = [...header().querySelectorAll<HTMLButtonElement>("button[aria-pressed=true]")].map((b) => b.textContent);
    expect(pressed).toEqual(["Bahasa Malaysia"]);
  });

  it("the switch has no submit button, no formAction and no form of its own", async () => {
    const { host } = mount();
    act(() => [...host.querySelectorAll("button")].find((b) => b.textContent === "Edit")!.click());
    const header = document.querySelector('[role="dialog"] header')!;
    const buttons = [...header.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const b of buttons) {
      expect(b.type, b.textContent || b.ariaLabel || "").toBe("button");
      expect(b.hasAttribute("formaction")).toBe(false);
    }
    expect(header.querySelector("form")).toBeNull();
    // The one form around the header is the drawer's own.
    expect(document.querySelectorAll('[role="dialog"] form')).toHaveLength(1);
  });

  it("offers no switch to a person who may not choose (nobody signed in)", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const action = vi.fn(async (): Promise<FormState> => ({ ok: true }));
    act(() =>
      root!.render(
        createElement(
          LanguageProvider,
          { language: "en", choice: null, canSwitch: false },
          createElement(RecordEditor, { title: "Edit budget", fields: FIELDS, action, trigger: { label: "Edit" } }),
        ),
      ),
    );
    act(() => [...host.querySelectorAll("button")].find((b) => b.textContent === "Edit")!.click());
    expect(document.querySelector('[role="dialog"] header')!.textContent).not.toContain("Bahasa Malaysia");
  });
});
