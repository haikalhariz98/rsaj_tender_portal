import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

import { kindChoices } from "@/lib/project-docs/labels";

import { KindFields } from "./document-drawers";
import { chosenKind, createBody, filesBody, kindOffered, passwordShown, purposesComplete, takesPurposes, titleFieldLabel, versionBody } from "./document-form";
import { invoiceChip } from "./document-words";

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
    const html = fields({ showPassword: true, errors: { kind: "Not a kind that can be sent.", password: "Enter your password to sign the notice." } });
    expect(html).toContain("Not a kind that can be sent.");
    expect(html).toContain("Enter your password to sign the notice.");
    expect(html).not.toMatch(/WRONG_PASSWORD|VALIDATION|THROTTLED|SIGNATURE_REFUSED|KIND_NOT_AVAILABLE/);
  });

  it("with no kind to pick and no signature, nothing extra is drawn", () => {
    expect(fields({ showKind: false, showPassword: false })).not.toMatch(/select|input/);
  });
});

describe("a delivery order and invoice (WV-11, WV-12)", () => {
  it("is offered only on the delivery-order route, and not beside interim or materials claims", () => {
    const on = kindChoices("DELIVERY_ORDER_INVOICE").map((k) => k.value);
    expect(on).toContain("SUPPLY_CLAIM");
    expect(on).not.toContain("INTERIM_CLAIM");
    expect(on).not.toContain("MATERIALS_ON_SITE");
    expect(kindChoices().map((k) => k.value)).not.toContain("SUPPLY_CLAIM");
    expect(kindChoices("CERTIFIED_CLAIM")).toEqual(kindChoices());
  });

  it("asks the invoice number as the title, only for that kind", () => {
    expect(titleFieldLabel("SUPPLY_CLAIM")).toBe("Invoice number");
    expect(titleFieldLabel("DELAY_NOTICE")).toBe("Title");
    expect(titleFieldLabel("")).toBe("Title");
    expect(takesPurposes("SUPPLY_CLAIM")).toBe(true);
    expect(takesPurposes("")).toBe(false);
  });

  it("is ready only when every file has a purpose and both are used", () => {
    expect(purposesComplete(0, [])).toBe(false);
    expect(purposesComplete(2, ["DELIVERY_ORDER"])).toBe(false);
    expect(purposesComplete(2, ["DELIVERY_ORDER", "DELIVERY_ORDER"])).toBe(false);
    expect(purposesComplete(2, ["DELIVERY_ORDER", "SUPPLY_INVOICE"])).toBe(true);
    expect(purposesComplete(3, ["SUPPLY_INVOICE", "DELIVERY_ORDER", "SUPPLY_INVOICE"])).toBe(true);
    expect(purposesComplete(3, ["SUPPLY_INVOICE", "DELIVERY_ORDER", ""])).toBe(false);
  });

  const picked = kindChoices("DELIVERY_ORDER_INVOICE");
  const purposes = ["DELIVERY_ORDER", "SUPPLY_INVOICE"];

  it("posts `files` with a purpose each in place of `versionIds`, on create and on a version", () => {
    expect(filesBody(["a", "b"], purposes)).toEqual([{ versionId: "a", purpose: "DELIVERY_ORDER" }, { versionId: "b", purpose: "SUPPLY_INVOICE" }]);
    const create = createBody({ contractId: "c1", title: "INV-1", note: "", mode: "upload", versionIds: ["a", "b"], purposes, kinds: picked, kind: "SUPPLY_CLAIM", password: "" });
    expect(create).toMatchObject({ kind: "SUPPLY_CLAIM", files: [{ versionId: "a", purpose: "DELIVERY_ORDER" }, { versionId: "b", purpose: "SUPPLY_INVOICE" }] });
    expect(create).not.toHaveProperty("versionIds");
    const later = versionBody({ contractId: "c1", documentId: "d1", versionIds: ["a", "b"], purposes, takesPurposes: true, note: "", mayPickKind: false, kinds: picked, kind: "", pageAsksPassword: false, password: "" });
    expect(later).toMatchObject({ files: [{ versionId: "a", purpose: "DELIVERY_ORDER" }, { versionId: "b", purpose: "SUPPLY_INVOICE" }] });
    expect(later).not.toHaveProperty("versionIds");
    expect(later).not.toHaveProperty("kind");
  });

  it("reads each state in the contractor's words", () => {
    const paid = { paidText: "3 Mar 2026", batchNo: "B-9" };
    expect(invoiceChip({ state: "WITH_ORGANISATION", payment: null })).toEqual({ text: "Sent", tone: "info" });
    expect(invoiceChip({ state: "RETURNED", payment: null }).text).toBe("Returned with remarks");
    expect(invoiceChip({ state: "VERIFIED", payment: null }).text).toBe("Verified");
    expect(invoiceChip({ state: "PAID", payment: paid }).text).toBe("Paid on 3 Mar 2026, batch B-9");
  });
});
