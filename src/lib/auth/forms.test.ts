import { describe, expect, it } from "vitest";

import { parseChangePassword, parseCodeForm, parseNoFields, parseSignIn, type Entries } from "./forms";

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
