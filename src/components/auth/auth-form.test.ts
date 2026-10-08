// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/components/record-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import { AuthForm } from "./auth-form";
import { withoutError } from "./form-errors";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIELDS = [
  { name: "loginName", label: "Sign-in name", autoComplete: "username" },
  { name: "password", label: "Password", type: "password" as const, autoComplete: "current-password" },
];

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

/// Draws the form with an action that answers as the sign-in action does: each empty field is refused with "is needed".
function mount(answer: (data: FormData) => FormState) {
  const posted: FormData[] = [];
  const action = vi.fn(async (_prev: FormState, data: FormData) => {
    posted.push(data);
    return answer(data);
  });
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(AuthForm, { action, fields: FIELDS, submitLabel: "Sign in" })));
  const input = (name: string) => host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  const submit = async () => {
    await act(async () => {
      host.querySelector("form")!.requestSubmit();
    });
  };
  return { host, input, submit, posted, action };
}

const refuseEmpty = (data: FormData): FormState => {
  const errors: Record<string, string> = {};
  for (const f of FIELDS) if (!String(data.get(f.name) ?? "").trim()) errors[f.name] = `${f.label} is needed.`;
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: false, message: "Sign-in failed." };
};

/// A browser's autofill sets a field's value and then says so with an input event (and a change event).
function autofill(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("what is posted is what the fields hold", () => {
  it("sends a value that was put in the field without any typing, as a browser's autofill does", async () => {
    const form = mount(() => ({ ok: false, message: "Sign-in failed." }));
    // No event at all: the value is simply there, as it is when a browser filled it before the page's script ran.
    form.input("loginName").value = "haikal.admin";
    form.input("password").value = "a-long-password";
    await form.submit();
    expect(form.posted).toHaveLength(1);
    expect(form.posted[0].get("loginName")).toBe("haikal.admin");
    expect(form.posted[0].get("password")).toBe("a-long-password");
  });

  it("sends a value that was autofilled with its events too", async () => {
    const form = mount(() => ({ ok: false, message: "Sign-in failed." }));
    autofill(form.input("loginName"), "haikal.admin");
    autofill(form.input("password"), "a-long-password");
    await form.submit();
    expect(form.posted[0].get("loginName")).toBe("haikal.admin");
  });
});

describe("a refusal is said only until the field is changed", () => {
  it("shows both refusals for an empty submit, and the name's goes when the name is filled in (the screen in the founder's screenshot)", async () => {
    const form = mount(refuseEmpty);
    await form.submit();
    expect(form.host.textContent).toContain("Sign-in name is needed.");
    expect(form.host.textContent).toContain("Password is needed.");

    autofill(form.input("loginName"), "haikal.admin");

    expect(form.host.textContent).not.toContain("Sign-in name is needed.");
    // The field that was not touched is still refused.
    expect(form.host.textContent).toContain("Password is needed.");
    expect(form.input("loginName").getAttribute("aria-invalid")).not.toBe("true");
    expect(form.input("password").getAttribute("aria-invalid")).toBe("true");
  });

  it("a keystroke in a field that was not refused changes nothing", async () => {
    const form = mount(refuseEmpty);
    autofill(form.input("loginName"), "someone");
    await form.submit();
    expect(form.host.textContent).toContain("Password is needed.");
    autofill(form.input("loginName"), "someone.else");
    expect(form.host.textContent).toContain("Password is needed.");
  });

  it("is sent again from the fields, so the corrected name goes with the next try", async () => {
    const form = mount(refuseEmpty);
    await form.submit();
    autofill(form.input("loginName"), "haikal.admin");
    autofill(form.input("password"), "a-long-password");
    await form.submit();
    expect(form.posted[1].get("loginName")).toBe("haikal.admin");
    expect(form.host.textContent).not.toContain("is needed.");
  });
});

describe("withoutError", () => {
  it("drops one field's answer and keeps the rest", () => {
    const s: FormState = { ok: false, errors: { a: "A is needed.", b: "B is needed." } };
    expect(withoutError(s, "a")).toEqual({ ok: false, errors: { b: "B is needed." } });
  });

  it("returns the very same answer when it said nothing about the field", () => {
    const s: FormState = { ok: false, errors: { a: "A is needed." } };
    expect(withoutError(s, "z")).toBe(s);
    const none: FormState = { ok: false, message: "Failed." };
    expect(withoutError(none, "a")).toBe(none);
  });
});
