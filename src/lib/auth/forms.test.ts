import { describe, expect, it } from "vitest";

import { parseAccountAct, parseChangePassword, parseCodeForm, parseCreateAccount, parseIssueCode, parseNoFields, parseSetContractorSigner, parseSignIn, type Entries } from "./forms";

const form = (o: Record<string, string>): Entries => Object.entries(o);

describe("parseSignIn", () => {
  it("takes a name and a password, trims the name and never the password", () => {
    expect(parseSignIn(form({ loginName: "  Ahmad.Z  ", password: " pass word " }))).toEqual({ ok: true, value: { loginName: "Ahmad.Z", password: " pass word " } });
  });

  it("says what is missing, field by field", () => {
    expect(parseSignIn(form({ loginName: "", password: "" }))).toEqual({ ok: false, errors: { loginName: "The sign-in name is needed.", password: "The password is needed." } });
    expect(parseSignIn(form({ loginName: "   ", password: "x" }))).toMatchObject({ ok: false, errors: { loginName: "The sign-in name is needed." } });
    expect(parseSignIn(form({ password: "x" }))).toMatchObject({ ok: false, errors: { loginName: "The sign-in name is needed." } });
  });

  it("refuses a field the form does not take, without echoing its value", () => {
    const result = parseSignIn(form({ loginName: "a", password: "b", isAdministrator: "true" }));
    expect(result).toEqual({ ok: false, errors: { isAdministrator: "This form does not take this field." } });
    expect(JSON.stringify(result)).not.toContain("true");
  });

  it("lets the framework's own hidden fields through", () => {
    expect(parseSignIn(form({ loginName: "a", password: "b", $ACTION_ID_abc: "", $ACTION_KEY: "k" })).ok).toBe(true);
  });

  it("refuses a file, a repeated field and an over-long value", () => {
    expect(parseSignIn([["loginName", new File(["x"], "x.txt")], ["password", "b"]])).toMatchObject({ ok: false, errors: { loginName: "This field takes text." } });
    expect(parseSignIn([["loginName", "a"], ["loginName", "b"], ["password", "p"]])).toMatchObject({ ok: false, errors: { loginName: "This field was sent more than once." } });
    expect(parseSignIn(form({ loginName: "a".repeat(129), password: "b" }))).toMatchObject({ ok: false, errors: { loginName: "The sign-in name is too long." } });
    expect(parseSignIn(form({ loginName: "a", password: "b".repeat(1025) }))).toMatchObject({ ok: false, errors: { password: "The password is too long." } });
  });

  it("never puts the password in an error", () => {
    const secret = "s3cret-" + "x".repeat(2000);
    expect(JSON.stringify(parseSignIn(form({ loginName: "a", password: secret })))).not.toContain("s3cret");
  });
});

describe("parseCodeForm", () => {
  const good = { loginName: "ahmad", code: "ABCD-EFGH", password: "a long enough one", confirm: "a long enough one" };
  it("takes the name, the code and the password twice", () => {
    expect(parseCodeForm(form(good))).toEqual({ ok: true, value: good });
  });
  it("asks for the two passwords to match", () => {
    expect(parseCodeForm(form({ ...good, confirm: "different" }))).toEqual({ ok: false, errors: { confirm: "The two passwords are not the same." } });
  });
  it("refuses an unknown field", () => {
    expect(parseCodeForm(form({ ...good, purpose: "ACTIVATION" }))).toMatchObject({ ok: false, errors: { purpose: expect.any(String) } });
  });
});

describe("parseChangePassword", () => {
  it("takes the current password and the new one twice", () => {
    expect(parseChangePassword(form({ current: "old", password: "new one here", confirm: "new one here" }))).toMatchObject({ ok: true });
    expect(parseChangePassword(form({ current: "", password: "x", confirm: "y" }))).toEqual({
      ok: false,
      errors: { current: "The current password is needed.", confirm: "The two passwords are not the same." },
    });
  });
});

describe("parseNoFields", () => {
  it("takes a form with nothing in it, and refuses one with something", () => {
    expect(parseNoFields(form({ $ACTION_ID_x: "" }))).toEqual({ ok: true, value: {} });
    expect(parseNoFields(form({ personId: "p1" }))).toMatchObject({ ok: false });
  });
});

describe("the account administration forms (Phase 1b)", () => {
  it("creating takes a person and a sign-in name, trims the name, and refuses any other field", () => {
    expect(parseCreateAccount(form({ personId: "p1", loginName: "  ahmad.z " }))).toEqual({ ok: true, value: { personId: "p1", loginName: "ahmad.z" } });
    expect(parseCreateAccount(form({ personId: "p1", loginName: "a.b.c", isAdministrator: "yes" }))).toEqual({ ok: false, errors: { isAdministrator: "This form does not take this field." } });
    expect(parseCreateAccount(form({ personId: "", loginName: "" }))).toMatchObject({ ok: false, errors: { personId: expect.any(String), loginName: expect.any(String) } });
  });

  it("disabling, putting back and unlocking take an account and a reason, and the reason is trimmed and required", () => {
    expect(parseAccountAct(form({ accountId: "a1", reason: "  left  " }))).toEqual({ ok: true, value: { accountId: "a1", reason: "left" } });
    expect(parseAccountAct(form({ accountId: "a1", reason: "   " }))).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
    // The acting person is the session's, never a field.
    expect(parseAccountAct(form({ accountId: "a1", reason: "x", actorPersonId: "p9" }))).toMatchObject({ ok: false, errors: { actorPersonId: expect.any(String) } });
  });

  it("issuing names what the code is for, and only activation or reset", () => {
    expect(parseIssueCode(form({ accountId: "a1", purpose: "RESET", reason: "forgot it" }))).toEqual({ ok: true, value: { accountId: "a1", purpose: "RESET", reason: "forgot it" } });
    expect(parseIssueCode(form({ accountId: "a1", purpose: "ACTIVATION", reason: "new" }))).toMatchObject({ ok: true });
    expect(parseIssueCode(form({ accountId: "a1", purpose: "ADMIN", reason: "x" }))).toMatchObject({ ok: false, errors: { purpose: expect.any(String) } });
  });

  it("refuses a field sent twice, and a file where text is taken", () => {
    expect(parseAccountAct([["accountId", "a1"], ["accountId", "a2"], ["reason", "x"]])).toMatchObject({ ok: false, errors: { accountId: "This field was sent more than once." } });
    expect(parseAccountAct([["accountId", new File(["x"], "f.txt")], ["reason", "x"]])).toMatchObject({ ok: false, errors: { accountId: "This field takes text." } });
  });
});

// Decisions log, 2026-10-09, ruling on 1928(3): an officer marks who may sign for the contractor's company.
describe("parseSetContractorSigner", () => {
  const base = { supplierId: "s1", contactId: "c1", reason: "Named by the board" };
  it("reads yes, no and not decided, and always needs the reason", () => {
    expect(parseSetContractorSigner(form({ ...base, mark: "yes" }))).toEqual({ ok: true, value: { supplierId: "s1", contactId: "c1", mark: true, reason: "Named by the board" } });
    expect(parseSetContractorSigner(form({ ...base, mark: "no" }))).toMatchObject({ ok: true, value: { mark: false } });
    expect(parseSetContractorSigner(form({ ...base, mark: "unset" }))).toMatchObject({ ok: true, value: { mark: null } });
    expect(parseSetContractorSigner(form({ supplierId: "s1", contactId: "c1", mark: "yes" }))).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
  });
  it("refuses any other answer, and a person field (the officer is the session's, never a field)", () => {
    expect(parseSetContractorSigner(form({ ...base, mark: "maybe" }))).toMatchObject({ ok: false, errors: { mark: expect.any(String) } });
    expect(parseSetContractorSigner(form({ ...base, mark: "yes", actorPersonId: "p9" }))).toMatchObject({ ok: false, errors: { actorPersonId: expect.any(String) } });
  });
});
