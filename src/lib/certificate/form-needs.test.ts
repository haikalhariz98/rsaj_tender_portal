import { describe, expect, it } from "vitest";

import { formNeedFault, formNeeds, NEED_STATE_WORDS, type NeedsInput } from "./form-needs";
import { CERTIFICATE_KINDS } from "./types";

const written = { id: "t1", nameEn: "Demo interim certificate", bodyEn: "Text", bodyMs: null };
const empty = { id: "t2", nameEn: "Demo notice of termination", bodyEn: " ", bodyMs: null };
const none = { letter: null, notice: null };

describe("a form a module needs (FR-CRT-012)", () => {
  it("none chosen refuses TEMPLATE_NOT_SET naming the need; chosen with no text, TEMPLATE_BODY_EMPTY naming the form", () => {
    // 614b-C6 (stricter): the finding carries the need in both languages and where it is set.
    expect(formNeedFault(null, { en: "Notice of termination", ms: "Notis penamatan" })).toEqual({ code: "TEMPLATE_NOT_SET", level: "block", data: { need: "Notice of termination", needMs: "Notis penamatan", setAt: "POST_AWARD" } });
    expect(formNeedFault(empty, { en: "Notice of termination", ms: "Notis penamatan" })).toEqual({ code: "TEMPLATE_BODY_EMPTY", level: "block", data: { form: "Demo notice of termination" } });
    expect(formNeedFault(written, { en: "x", ms: "x" })).toBeNull();
  });
});

describe("the forms the certificates need, listed", () => {
  const input: NeedsInput = { kinds: { INTERIM_PAYMENT: written, NON_COMPLETION: empty }, delegation: { CONVENTIONAL: { letter: written, notice: null }, DESIGN_AND_BUILD: none }, sheets: [{ id: "s1", labelEn: "Interim sheet", labelMs: null, form: null }] };
  const needs = formNeeds(input);
  it("every kind is listed (the delegation pair once per contract-type variant), then every sheet", () => {
    expect(needs).toHaveLength(CERTIFICATE_KINDS.length - 2 + 4 + 1);
    expect(needs.map((n) => n.key).slice(0, 4)).toEqual(["DELEGATION_LETTER:CONVENTIONAL", "DELEGATION_LETTER:DESIGN_AND_BUILD", "DELEGATION_NOTICE:CONVENTIONAL", "DELEGATION_NOTICE:DESIGN_AND_BUILD"]);
    expect(needs.at(-1)).toMatchObject({ key: "sheet:s1", setAt: "ROUTING_SHEETS", state: "NOT_SET" });
  });
  it("each with its state: written, with no text, or not chosen; never a guess", () => {
    const byKey = Object.fromEntries(needs.map((n) => [n.key, n.state]));
    expect(byKey.INTERIM_PAYMENT).toBe("READY");
    expect(byKey.NON_COMPLETION).toBe("BODY_EMPTY");
    expect(byKey.VARIATION).toBe("NOT_SET");
    expect(byKey["DELEGATION_LETTER:CONVENTIONAL"]).toBe("READY");
    expect(byKey["DELEGATION_NOTICE:CONVENTIONAL"]).toBe("NOT_SET");
    for (const s of ["NOT_SET", "BODY_EMPTY", "READY"] as const) expect(NEED_STATE_WORDS[s].ms).toBeTruthy();
  });
});
