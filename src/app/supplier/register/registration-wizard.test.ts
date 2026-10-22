// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/supplier/register" }));

import { APPLY } from "@/lib/portal/labels";
import { config, heldState } from "@/lib/portal/register/fixture";
import type { WizardState } from "@/lib/portal/register/wizard";

import { RegistrationWizard } from "./registration-wizard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The public form in a browser (plan step 3's tests): Next blocks with the words beside the field; Submit is blocked until both ticks; a refusal by the rules goes back to the first step
 * at fault with everything kept; an out-of-date token is swapped and the application sent once more; the browser's warning is armed by the first change and gone after Submit.
 */

const TOKEN = `${Date.now()}.${"A".repeat(22)}.${"B".repeat(43)}`;
const FRESH = `${Date.now()}.${"F".repeat(22)}.${"B".repeat(43)}`;

/// A stand-in for XMLHttpRequest: each send is recorded with its token and parts, and answered from the queue.
interface Sent {
  token: string | null;
  parts: string[];
}
let replies: { status: number; body: unknown }[] = [];
let sent: Sent[] = [];
class FakeXhr {
  status = 0;
  responseText = "";
  upload: { onprogress: ((e: { loaded: number; total: number; lengthComputable: boolean }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private headers: Record<string, string> = {};
  open() {}
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }
  send(form: FormData) {
    sent.push({ token: this.headers["x-form-token"] ?? null, parts: [...form.keys()] });
    const r = replies.shift() ?? { status: 0, body: null };
    setTimeout(() => {
      this.upload.onprogress?.({ loaded: 1, total: 1, lengthComputable: true });
      this.status = r.status;
      this.responseText = r.body == null ? "" : JSON.stringify(r.body);
      if (r.status === 0) this.onerror?.();
      else this.onload?.();
    }, 0);
  }
}

const file = (name: string) => new File(["%PDF-1.4 test"], name, { type: "application/pdf" });
/// The whole application held, as `heldState`, with real files, at a step.
const held = (o: Partial<WizardState<File>> = {}): WizardState<File> => {
  const s = heldState();
  return { ...s, files: { "new:reg": [file("registry.pdf")], "new:works": [file("board.pdf")] }, statement: [file("statement.pdf")], ...o } as WizardState<File>;
};

let root: Root | null = null;
let host: HTMLElement;
beforeEach(() => {
  replies = [];
  sent = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, token: FRESH }), { status: 200, headers: { "content-type": "application/json" } })));
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function mount(initialState?: WizardState<File>) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(RegistrationWizard, { config: config(), token: TOKEN, initialState })));
}
const text = () => host.textContent ?? "";
const button = (label: string | RegExp) => [...host.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? "")));
const click = async (el: Element | undefined) => {
  if (!el) throw new Error("no such control");
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const settle = async () => {
  for (let i = 0; i < 5; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};
const checkbox = (label: string) => [...host.querySelectorAll("label")].find((l) => l.textContent?.includes(label))?.querySelector("input[type=checkbox]") as HTMLInputElement | undefined;
const beforeUnloadPrevented = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};
function type(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the public registration form (ADR 0041, plan 4.2)", () => {
  it("Next runs the step's rules in the page: it stays, and says each fault beside its field", async () => {
    mount();
    expect(text()).toContain("Step 1 of 5: Company Information");
    await click(button("Next"));
    expect(text()).toContain("Step 1 of 5: Company Information");
    expect(text()).toContain("Enter the company's registered name.");
    const name = host.querySelector<HTMLInputElement>('input[autocomplete="organization"]')!;
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(sent).toHaveLength(0);
  });

  it("a field's finding goes as soon as the field changes, and the summary above counts what is left (the step-3 rehearsal: filled in, still red)", async () => {
    mount();
    await click(button("Next"));
    const first = text().match(/(\d+) things stand in the way/);
    expect(first).not.toBeNull();
    const before = Number(first![1]);
    const name = host.querySelector<HTMLInputElement>('input[autocomplete="organization"]')!;
    type(name, "Rehearsal Contractors Sdn Bhd");
    expect(text()).not.toContain("Enter the company's registered name.");
    expect(name.getAttribute("aria-invalid")).not.toBe("true");
    expect(text()).toContain(`${before - 1} things stand in the way`);
    // Next checks again: the step's findings are that check's.
    await click(button("Next"));
    expect(text()).toContain(`${before - 1} things stand in the way`);
    expect(text()).not.toContain("Enter the company's registered name.");
  });

  it("the server's findings from Submit go the same way, and its refusal with them once none is left", async () => {
    replies = [{ status: 422, body: { ok: false, code: "VALIDATION", message: "Nothing was sent. Check the fields marked below and send it again.", faults: [{ step: "review", field: "terms", level: "block", message: "Read the terms again." }] } }];
    mount(held({ step: "review", reached: 4 }));
    await click(button("Submit"));
    await settle();
    expect(text()).toContain("Step 5 of 5: Review & Submit");
    expect(text()).toContain("Nothing was sent");
    expect(text()).toContain("Read the terms again.");
    await click(checkbox("I confirm I have read and agree"));
    expect(text()).not.toContain("Read the terms again.");
    expect(text()).not.toContain("Nothing was sent");
  });

  it("step 5: Submit is blocked, with its reason, until the declaration and the terms are both ticked", async () => {
    mount(held({ step: "review", reached: 4, falseDeclaration: false, terms: false }));
    expect(text()).toContain("Step 5 of 5: Review & Submit");
    expect(text()).toContain("Terms and conditions");
    expect(text()).toContain("I confirm I have read and agree to the Terms and Conditions and the Personal Data Notice");
    expect(button("Submit")?.disabled).toBe(true);
    expect(text()).toContain("Tick the declaration to submit.");
    await click(checkbox("I have read this declaration and confirm it."));
    expect(button("Submit")?.disabled).toBe(true);
    expect(text()).toContain("Tick the agreement to submit.");
    await click(checkbox("I confirm I have read and agree"));
    expect(button("Submit")?.disabled).toBe(false);
    // The review says agreed, never signed; the declarations are the ticks below it, not a section of their own.
    expect(text()).not.toMatch(/Signed|signature/);
  });

  it("a refusal by the rules goes back to the first step at fault, with every field and file kept", async () => {
    replies = [{ status: 422, body: { ok: false, code: "VALIDATION", message: "Nothing was sent. Check the fields marked below and send it again.", faults: [{ step: "documents", field: "documents.new:reg.expiresOn", level: "block", message: "The expiry date has passed." }, { step: "review", field: "terms", level: "block", message: "Read the terms again." }] } }];
    mount(held({ step: "review", reached: 4 }));
    await click(button("Submit"));
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.token).toBe(TOKEN);
    expect(sent[0]!.parts).toEqual(["application", "doc.new:reg", "doc.new:works", "statement", "website2"]);
    expect(text()).toContain("Step 2 of 5: Compliance Documents");
    expect(text()).toContain("The expiry date has passed.");
    expect(text()).toContain("registry.pdf");
    expect([...host.querySelectorAll<HTMLInputElement>("input")].some((i) => i.value === "R-1")).toBe(true);
  });

  it("out of date and not spent: a fresh token, and the application sent once more, then received", async () => {
    replies = [
      { status: 400, body: { ok: false, code: "FORM_EXPIRED", message: "This form is out of date. Nothing was sent. Submit again." } },
      { status: 200, body: { ok: true, reference: "PA-2026-0001" } },
    ];
    mount(held({ step: "review", reached: 4 }));
    await click(button("Submit"));
    await settle();
    expect(sent.map((s) => s.token)).toEqual([TOKEN, FRESH]);
    expect(text()).toContain("PA-2026-0001");
    expect(text()).toContain("Keep this reference.");
    expect(text()).toContain("The office checks your registration.");
    expect(text()).not.toMatch(/account page/i);
  });

  it("no answer: sent again with the same token, never a fresh one; then read-only, offering only Send again, until an answer settles it (RSEC-5)", async () => {
    replies = [{ status: 0, body: null }, { status: 500, body: { ok: false, code: "TRY_AGAIN", message: "Something went wrong. Nothing was sent. Try again in a few minutes." } }];
    mount(held({ step: "review", reached: 4 }));
    await click(button("Submit"));
    await settle();
    expect(sent.map((s) => s.token)).toEqual([TOKEN, TOKEN]);
    // It may have landed: the form says so, never "nothing was sent", and nothing in it can be changed.
    expect(text()).toContain(APPLY.mayHaveArrived.en);
    expect(text()).not.toContain("Nothing was sent.");
    // Inside the disabled fieldset: the browser treats it as disabled, whatever its own attribute says.
    expect(button("Submit")?.matches(":disabled") ?? true).toBe(true);
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    expect(text()).toContain("Step 5 of 5");
    // Send again: the same token; the answer that it landed shows the reference and when the first send arrived.
    replies = [{ status: 200, body: { ok: true, reference: "PA-2026-0009", firstReceived: "22 Oct 2026, 09:15" } }];
    await click(button(APPLY.sendAgain.en));
    await settle();
    expect(sent.at(-1)?.token).toBe(TOKEN);
    expect(text()).toContain("PA-2026-0009");
    expect(text()).toContain(APPLY.firstReceived("22 Oct 2026, 09:15").en);
  });

  it("an answer that proves the token unspent opens the form again (RSEC-5)", async () => {
    replies = [{ status: 0, body: null }, { status: 0, body: null }];
    mount(held({ step: "review", reached: 4 }));
    await click(button("Submit"));
    await settle();
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    replies = [{ status: 422, body: { ok: false, code: "VALIDATION", message: "Nothing was sent.", faults: [{ step: "review", field: "terms", level: "block", message: "Tick the agreement to submit." }] } }];
    await click(button(APPLY.sendAgain.en));
    await settle();
    expect(host.querySelector("fieldset")?.disabled).toBe(false);
    expect(button(APPLY.sendAgain.en)).toBeFalsy();
  });

  it("the browser's warning is armed by the first change and gone once the application is received", async () => {
    replies = [{ status: 200, body: { ok: true, reference: "PA-2026-0002" } }];
    mount();
    expect(beforeUnloadPrevented()).toBe(false);
    type(host.querySelector<HTMLInputElement>('input[autocomplete="organization"]')!, "Demonstration Contractors");
    expect(beforeUnloadPrevented()).toBe(true);
    act(() => root!.unmount());
    root = null;
    host.remove();
    mount(held({ step: "review", reached: 4 }));
    expect(beforeUnloadPrevented()).toBe(true);
    await click(button("Submit"));
    await settle();
    expect(text()).toContain("PA-2026-0002");
    expect(beforeUnloadPrevented()).toBe(false);
  });

  it("a link out of the page asks first while anything is held; Stay keeps everything", async () => {
    mount(held({ step: "documents", reached: 4 }));
    const a = document.createElement("a");
    a.href = "/supplier";
    a.textContent = "Back";
    document.body.append(a);
    await click(a);
    expect(document.body.textContent).toContain("Leave? Nothing you entered is kept.");
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Stay"));
    expect(document.body.textContent).not.toContain("Leave? Nothing you entered is kept.");
    expect(text()).toContain("registry.pdf");
  });
});
