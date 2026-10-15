import { describe, expect, it } from "vitest";

import { MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";

import { MAX_PASSWORD_CHARS, parseSubmitBody, parseWithdrawBody } from "./submit-parse";

const ID = "ex_12345678";
const good = () => ({ exerciseId: ID, kind: "BID", fileIds: ["file_0001aa"], declaration: { price: "100.00", completionPeriod: 3, completionUnit: "MONTHS" }, password: "a password" });

describe("parseSubmitBody (the API rules: validate at the edge, reject unknown fields)", () => {
  it("takes a good body, and an absent parent or replaced id as none", () => {
    const p = parseSubmitBody(good());
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.parentOnlineBidId).toBeNull();
      expect(p.value.replacesOnlineBidId).toBeNull();
      expect(p.value.declaration).toEqual({ ok: true, value: { price: "100.00", completionPeriod: 3, completionUnit: "MONTHS" } });
    }
  });

  it("names every wrong field and never what was in it", () => {
    const p = parseSubmitBody({ ...good(), exerciseId: "x", kind: "BOTH", fileIds: "no", password: "", extra: "SECRET-VALUE" });
    expect(p).toEqual({ ok: false, fields: expect.arrayContaining(["unknown", "exerciseId", "kind", "fileIds", "password"]) });
    expect(JSON.stringify(p)).not.toContain("SECRET-VALUE");
    expect(JSON.stringify(p)).not.toContain("extra");
  });

  it("refuses an unknown field inside the declaration, a repeated or too many file ids, and a password that is too long", () => {
    expect(parseSubmitBody({ ...good(), declaration: { ...good().declaration, note: "x" } })).toEqual({ ok: false, fields: ["declaration"] });
    expect(parseSubmitBody({ ...good(), fileIds: ["file_0001aa", "file_0001aa"] })).toEqual({ ok: false, fields: ["fileIds"] });
    expect(parseSubmitBody({ ...good(), fileIds: Array.from({ length: MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE + 1 }, (_, n) => `file_${String(n).padStart(6, "0")}`) })).toEqual({ ok: false, fields: ["fileIds"] });
    expect(parseSubmitBody({ ...good(), password: "p".repeat(MAX_PASSWORD_CHARS + 1) })).toEqual({ ok: false, fields: ["password"] });
  });

  it("hands a declaration the rules refuse on as its faults, not as a bad body", () => {
    const p = parseSubmitBody({ ...good(), declaration: { price: "-1", completionPeriod: 0, completionUnit: "YEARS" } });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.declaration).toEqual({ ok: false, faults: ["PRICE_INVALID", "PERIOD_INVALID", "UNIT_NOT_SET"] });
  });

  it("refuses a replaced or parent id that is not an id", () => {
    expect(parseSubmitBody({ ...good(), replacesOnlineBidId: "no" })).toEqual({ ok: false, fields: ["replacesOnlineBidId"] });
    expect(parseSubmitBody({ ...good(), parentOnlineBidId: 7 })).toEqual({ ok: false, fields: ["parentOnlineBidId"] });
  });
});

describe("parseWithdrawBody", () => {
  it("takes a good body, with the alternatives to withdraw as none when absent", () => {
    expect(parseWithdrawBody({ onlineBidId: ID, password: "pw" })).toEqual({ ok: true, value: { onlineBidId: ID, alsoWithdraw: [], password: "pw" } });
    expect(parseWithdrawBody({ onlineBidId: ID, alsoWithdraw: ["alt_0000001"], password: "pw" })).toEqual({ ok: true, value: { onlineBidId: ID, alsoWithdraw: ["alt_0000001"], password: "pw" } });
  });

  it("refuses unknown fields, a repeated id and a missing password", () => {
    expect(parseWithdrawBody({ onlineBidId: ID, password: "pw", exerciseId: ID })).toEqual({ ok: false, fields: ["unknown"] });
    expect(parseWithdrawBody({ onlineBidId: ID, alsoWithdraw: ["alt_0000001", "alt_0000001"], password: "pw" })).toEqual({ ok: false, fields: ["alsoWithdraw"] });
    expect(parseWithdrawBody({ onlineBidId: ID })).toEqual({ ok: false, fields: ["password"] });
  });
});
