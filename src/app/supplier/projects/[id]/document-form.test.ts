import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

import { kindChoices } from "@/lib/project-docs/labels";

import { KindFields } from "./document-drawers";
import { chosenKind, createBody, kindOffered, passwordShown, versionBody } from "./document-form";

const kinds = kindChoices();
const BASE = { contractId: "c1", title: "Notice", note: "", versionIds: ["v1"], kinds };

describe("which fields the contractor's forms show (PW-9, PW-10)", () => {
  it("the kind is offered with a file sent, never with a request, and never when no kinds were given", () => {
    expect(kindOffered("upload", kinds)).toBe(true);
    expect(kindOffered("request", kinds)).toBe(false);
    expect(kindOffered("upload", [])).toBe(false);
  });

  it("the password shows only where the act is signed: a declaration chosen, or a document the page says asks it", () => {
    expect(kinds.filter((k) => k.asksPassword).map((k) => k.label)).toEqual(["Notice that the statutory declaration is lodged"]);
    const declaration = kinds.find((k) => k.asksPassword)!.value;
    expect(passwordShown(kinds, declaration)).toBe(true);
    expect(passwordShown(kinds, "DELAY_NOTICE")).toBe(false);
    expect(passwordShown(kinds, "")).toBe(false);
    expect(passwordShown([], "", true)).toBe(true);
    expect(chosenKind(kinds, "not a kind")).toBeNull();
  });
});

describe("what the new document form posts", () => {
  const declaration = kinds.find((k) => k.asksPassword)!.value;

  it("an ordinary document posts neither a kind nor a password, even if one was typed", () => {
    expect(createBody({ ...BASE, mode: "upload", kind: "", password: "secret" })).toEqual({ contractId: "c1", title: "Notice", note: "", mode: "upload", versionIds: ["v1"] });
  });

  it("a kind with a file posts the kind and no password unless it is signed", () => {
    expect(createBody({ ...BASE, mode: "upload", kind: "DELAY_NOTICE", password: "secret" })).toMatchObject({ kind: "DELAY_NOTICE" });
    expect(createBody({ ...BASE, mode: "upload", kind: "DELAY_NOTICE", password: "secret" })).not.toHaveProperty("password");
    expect(createBody({ ...BASE, mode: "upload", kind: declaration, password: "secret" })).toMatchObject({ kind: declaration, password: "secret" });
  });

  it("a request never carries a kind, a password or files, whatever was chosen before the mode changed", () => {
    const body = createBody({ ...BASE, mode: "request", kind: declaration, password: "secret" });
    expect(body).toEqual({ contractId: "c1", title: "Notice", note: "", mode: "request" });
  });
});

describe("what the new version form posts", () => {
  const V = { contractId: "c1", documentId: "d1", versionIds: ["v1"], note: "", kinds };

  it("a plain version posts no kind and no password", () => {
    expect(versionBody({ ...V, mayPickKind: false, kind: "DELAY_NOTICE", pageAsksPassword: false, password: "secret" })).toEqual({ contractId: "c1", documentId: "d1", versionIds: ["v1"], note: "" });
  });

  it("the first version of a document asked for may pick a kind; a declaration, chosen or already so, is signed", () => {
    expect(versionBody({ ...V, mayPickKind: true, kind: "DELAY_NOTICE", pageAsksPassword: false, password: "secret" })).toEqual({ contractId: "c1", documentId: "d1", versionIds: ["v1"], note: "", kind: "DELAY_NOTICE" });
    const declaration = kinds.find((k) => k.asksPassword)!.value;
    expect(versionBody({ ...V, mayPickKind: true, kind: declaration, pageAsksPassword: false, password: "secret" })).toMatchObject({ kind: declaration, password: "secret" });
    expect(versionBody({ ...V, mayPickKind: false, kind: "", pageAsksPassword: true, password: "secret" })).toMatchObject({ password: "secret" });
    expect(versionBody({ ...V, mayPickKind: false, kind: "", pageAsksPassword: true, password: "secret" })).not.toHaveProperty("kind");
  });
});

describe("the kind picker and the password field, as drawn", () => {
  const fields = (o: Partial<Parameters<typeof KindFields>[0]> = {}) => renderToStaticMarkup(h(KindFields, { id: "f", kinds, kind: "", onKind: () => undefined, showKind: true, showPassword: false, password: "", onPassword: () => undefined, errors: {}, ...o }));

  it("lists the six kinds by name, defaulting to none, with a label bound to the select", () => {
    const html = fields();
    for (const k of kinds) expect(html).toContain(`>${k.label}</option>`);
    expect(html).toContain("None, an ordinary document");
    expect(html).toMatch(/<label[^>]*for="f-kind"/);
    expect(html).toContain('id="f-kind"');
    expect(html).not.toContain('type="password"');
  });

  it("a declaration asks for the password: a labelled password input that asks for the current password, with no value written back", () => {
    const html = fields({ kind: kinds.find((k) => k.asksPassword)!.value, showPassword: true, password: "" });
    expect(html).toMatch(/<label[^>]*for="f-password"/);
    expect(html).toMatch(/type="password"/);
    expect(html.toLowerCase()).toContain('autocomplete="current-password"');
  });

  it("the server's words sit beside the field they name, never a code", () => {
    const html = fields({ showPassword: true, errors: { kind: "Not one of the six kinds.", password: "Enter your password to sign the notice." } });
    expect(html).toContain("Not one of the six kinds.");
    expect(html).toContain("Enter your password to sign the notice.");
    expect(html).not.toMatch(/WRONG_PASSWORD|VALIDATION|THROTTLED|SIGNATURE_REFUSED|KIND_NOT_AVAILABLE/);
  });

  it("with no kind to pick and no signature, nothing extra is drawn", () => {
    expect(fields({ showKind: false, showPassword: false })).not.toMatch(/select|input/);
  });
});
