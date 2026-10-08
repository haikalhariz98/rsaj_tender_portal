import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The supplier portal's route handlers (Phase 4a), end to end through a bare `Request`: the guards in front of each (the public copy, the Origin guard, the JSON body, the
 * signed form token), and what each answers. The stores behind them are stand-ins; what they are asked is recorded.
 */

const h = vi.hoisted(() => ({
  authenticate: vi.fn(),
  redeem: vi.fn(),
  change: vi.fn(),
  acknowledge: vi.fn(),
  signOutEverywhere: vi.fn(),
  signOutToken: vi.fn(),
  readSession: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-identity", () => ({
  SupplierCredentials: { authenticate: h.authenticate },
  supplierSignOutEverywhere: h.signOutEverywhere,
}));
vi.mock("@/lib/auth/supplier-account-store", () => ({
  redeemSupplierCode: h.redeem,
  changeSupplierPassword: h.change,
  acknowledgeSupplierResetNotice: h.acknowledge,
}));
vi.mock("@/lib/auth/supplier-session-store", () => ({
  readSupplierSession: h.readSession,
  signOutSupplierToken: h.signOutToken,
}));

import { FORM_SECRET_MIN_LENGTH, signFormToken, type FormPurpose } from "@/lib/auth/form-token";
import { SUPPLIER_COOKIE } from "@/lib/auth/routes";
import type { SupplierActor } from "@/lib/auth/types";

import { POST as acknowledge } from "./account/acknowledge/route";
import { POST as changePassword } from "./account/password/route";
import { POST as signOutEverywhere } from "./account/sign-out-everywhere/route";
import { POST as activate } from "./activate/submit/route";
import { POST as reset } from "./reset/submit/route";
import { POST as signIn } from "./sign-in/submit/route";
import { POST as signOut } from "./sign-out/route";

const KEY = "s".repeat(FORM_SECRET_MIN_LENGTH);
const TOKEN = "T".repeat(43);
const SAME_ORIGIN = { "sec-fetch-site": "same-origin", origin: "http://portal.example", host: "portal.example" };

const ACTOR: SupplierActor = {
  kind: "SUPPLIER",
  accountId: "acc1",
  sessionId: "ses1",
  contactId: "c1",
  contactName: "Aini",
  supplierId: "sup_mine",
  supplierName: "Sampel Works",
  loginName: "aini",
  organisationId: "o1",
  organisationTimeZone: "Asia/Kuala_Lumpur",
  stepUpAt: null,
  sessionCreatedAt: new Date("2026-10-12T00:00:00Z"),
  sourceAddress: null,
  mustChangePassword: false,
  resetNoticePending: false,
};

/// A JSON post from a page of this origin, with a token for `purpose`. `headers` and `body` override.
function post(url: string, purpose: FormPurpose | null, fields: Record<string, unknown> = {}, o: { headers?: Record<string, string>; body?: string; token?: string | null } = {}) {
  const token = o.token !== undefined ? o.token : purpose ? signFormToken(KEY, purpose, new Date()) : null;
  const body = o.body ?? JSON.stringify({ ...fields, ...(token ? { formToken: token } : {}) });
  return new Request(`http://portal.example${url}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), ...SAME_ORIGIN, ...o.headers },
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  for (const f of Object.values(h)) f.mockReset();
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
});

describe("what every portal post must pass before anything is read or written", () => {
  const doors: [string, (r: Request) => Promise<Response>, string, FormPurpose][] = [
    ["sign-in", signIn, "/supplier/sign-in/submit", "sign-in"],
    ["activate", activate, "/supplier/activate/submit", "activate"],
    ["reset", reset, "/supplier/reset/submit", "reset"],
    ["change password", changePassword, "/supplier/account/password", "account"],
    ["sign out everywhere", signOutEverywhere, "/supplier/account/sign-out-everywhere", "account"],
    ["acknowledge", acknowledge, "/supplier/account/acknowledge", "account"],
  ];

  it.each(doors)("%s: is not found on the staff copy, where nobody is a supplier", async (_n, handler, url, purpose) => {
    vi.stubEnv("PORTAL_SURFACE", "");
    const res = await handler(post(url, purpose, { loginName: "aini", password: "x" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(h.authenticate).not.toHaveBeenCalled();
    expect(h.readSession).not.toHaveBeenCalled();
  });

  it.each(doors)("%s: refuses another site, a post with no origin, a foreign origin and a text/plain body", async (_n, handler, url, purpose) => {
    const cross = await handler(post(url, purpose, {}, { headers: { "sec-fetch-site": "cross-site" } }));
    expect([cross.status, (await cross.json()).code]).toEqual([403, "CROSS_SITE"]);
    const none = await handler(post(url, purpose, {}, { headers: { "sec-fetch-site": "", origin: "" } }));
    expect(none.status).toBe(403);
    const foreign = await handler(post(url, purpose, {}, { headers: { origin: "http://evil.example" } }));
    expect([foreign.status, (await foreign.json()).code]).toEqual([403, "WRONG_ORIGIN"]);
    const plain = await handler(post(url, purpose, {}, { headers: { "content-type": "text/plain" } }));
    expect([plain.status, (await plain.json()).code]).toEqual([415, "WRONG_CONTENT_TYPE"]);
    expect(h.readSession).not.toHaveBeenCalled();
    expect(h.authenticate).not.toHaveBeenCalled();
    expect(h.redeem).not.toHaveBeenCalled();
  });

  it.each(doors)("%s: refuses a body of no stated size, a body past the limit and one that is not a JSON object", async (_n, handler, url, purpose) => {
    const noLength = post(url, purpose);
    noLength.headers.delete("content-length");
    expect((await handler(noLength)).status).toBe(411);
    const big = post(url, purpose, { padding: "x".repeat(9000) });
    expect((await handler(big)).status).toBe(413);
    // A body that states less than it sends is cut off while it is read.
    const lying = post(url, purpose, { padding: "x".repeat(9000) }, { headers: { "content-length": "100" } });
    expect((await handler(lying)).status).toBe(413);
    for (const body of ["not json", "[]", "null", '"text"']) expect((await handler(post(url, purpose, {}, { body }))).status, body).toBe(400);
  });

  it.each(doors)("%s: refuses a form with no token, a token for another form, a forged one and an old one", async (_n, handler, url, purpose) => {
    const other: FormPurpose = purpose === "account" ? "sign-in" : "account";
    const tokens = [null, signFormToken(KEY, other, new Date()), signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), purpose, new Date()), signFormToken(KEY, purpose, new Date(Date.now() - 25 * 60 * 60 * 1000))];
    for (const token of tokens) {
      const res = await handler(post(url, null, { loginName: "aini", password: "x" }, { token }));
      expect([res.status, (await res.json()).code]).toEqual([400, "FORM_EXPIRED"]);
    }
    expect(h.authenticate).not.toHaveBeenCalled();
    expect(h.readSession).not.toHaveBeenCalled();
  });

  it.each(doors)("%s: is closed, and says so, while the deployment's form key is not set", async (_n, handler, url, purpose) => {
    const request = post(url, purpose);
    vi.stubEnv("PORTAL_FORM_SECRET", "");
    const res = await handler(request);
    expect([res.status, (await res.json()).code]).toEqual([503, "CLOSED"]);
  });
});

describe("signing in", () => {
  const FIELDS = { loginName: "aini", password: "a long enough password" };

  it("sets the session cookie as a header on a good sign-in, and sends the browser to the account page", async () => {
    h.authenticate.mockResolvedValue({ ok: true, token: "tok", maxAgeSeconds: 3600, mustChangePassword: false, resetNoticePending: false, accountId: "acc1" });
    const res = await signIn(post("/supplier/sign-in/submit", "sign-in", FIELDS, { headers: { cookie: `${SUPPLIER_COOKIE}=${"o".repeat(43)}` } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, href: "/supplier/account" });
    expect(res.headers.get("set-cookie")).toBe(`${SUPPLIER_COOKIE}=tok; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // The cookie the browser already held is handed on to be replaced, never reused.
    expect(h.authenticate).toHaveBeenCalledWith(FIELDS, { request: expect.objectContaining({ userAgent: "" }), replacingToken: "o".repeat(43) });
  });

  it("answers one sentence whatever was wrong, with no cookie", async () => {
    h.authenticate.mockResolvedValue({ ok: false, kind: "FAILED" });
    const res = await signIn(post("/supplier/sign-in/submit", "sign-in", FIELDS));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: "SIGN_IN_FAILED", message: expect.stringMatching(/Sign-in failed/) });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("names the settings a closed sign-in waits for, in words", async () => {
    h.authenticate.mockResolvedValue({ ok: false, kind: "POLICY_NOT_SET", unset: ["supplierIdleMinutes"] });
    const res = await signIn(post("/supplier/sign-in/submit", "sign-in", FIELDS));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.message).toContain("Supplier idle time before a session ends");
    expect(body.message).not.toContain("supplierIdleMinutes");
  });

  it("refuses a field it does not take, and a missing one, by name, before it asks the store", async () => {
    const extra = await signIn(post("/supplier/sign-in/submit", "sign-in", { ...FIELDS, supplierId: "sup_other" }));
    expect(extra.status).toBe(400);
    expect((await extra.json()).errors).toHaveProperty("supplierId");
    const missing = await signIn(post("/supplier/sign-in/submit", "sign-in", { loginName: "aini" }));
    expect((await missing.json()).errors).toHaveProperty("password");
    const nonText = await signIn(post("/supplier/sign-in/submit", "sign-in", { loginName: 1, password: "x" }));
    expect((await nonText.json()).errors).toHaveProperty("loginName");
    expect(h.authenticate).not.toHaveBeenCalled();
  });
});

describe("activating, and resetting", () => {
  const FIELDS = { loginName: "aini", code: "ABCD-EFGH-JKMN-PQRS-TVWX-YZ", password: "a long enough password", confirm: "a long enough password" };

  it("each is told which door its code was brought to", async () => {
    h.redeem.mockResolvedValue({ ok: true });
    await activate(post("/supplier/activate/submit", "activate", FIELDS));
    await reset(post("/supplier/reset/submit", "reset", FIELDS));
    expect(h.redeem.mock.calls.map((c) => c[0].purpose)).toEqual(["ACTIVATION", "RESET"]);
  });

  it("sends the browser to sign in after a code is used, and says one thing when it fails", async () => {
    h.redeem.mockResolvedValueOnce({ ok: true });
    const ok = await activate(post("/supplier/activate/submit", "activate", FIELDS));
    expect(await ok.json()).toEqual({ ok: true, href: "/supplier/sign-in?password=set" });
    h.redeem.mockResolvedValueOnce({ ok: false, kind: "FAILED" });
    const bad = await reset(post("/supplier/reset/submit", "reset", FIELDS));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "CODE_FAILED" });
    h.redeem.mockResolvedValueOnce({ ok: false, kind: "FIELDS", faults: { password: { code: "TOO_SHORT", en: "Too short.", ms: "Terlalu pendek." } } });
    const fields = await activate(post("/supplier/activate/submit", "activate", FIELDS));
    expect((await fields.json()).errors).toEqual({ password: "Too short." });
  });

  it("refuses two passwords that differ before it asks the store", async () => {
    const res = await activate(post("/supplier/activate/submit", "activate", { ...FIELDS, confirm: "another one entirely" }));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toHaveProperty("confirm");
    expect(h.redeem).not.toHaveBeenCalled();
  });
});

describe("the account's own posts", () => {
  it("are told nobody is signed in when the cookie is no session, and do nothing", async () => {
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    for (const [handler, url] of [
      [changePassword, "/supplier/account/password"],
      [signOutEverywhere, "/supplier/account/sign-out-everywhere"],
      [acknowledge, "/supplier/account/acknowledge"],
    ] as const) {
      const res = await handler(post(url, "account", url.endsWith("password") ? { current: "a", password: "b", confirm: "b" } : {}));
      expect(res.status, url).toBe(401);
      expect(await res.json()).toMatchObject({ ok: false, code: "NOT_SIGNED_IN" });
    }
    expect(h.change).not.toHaveBeenCalled();
    expect(h.signOutEverywhere).not.toHaveBeenCalled();
    expect(h.acknowledge).not.toHaveBeenCalled();
  });

  it("act for the session's supplier, and take no supplier from the request", async () => {
    h.change.mockResolvedValue({ ok: true, token: "newtok", maxAgeSeconds: 100 });
    const res = await changePassword(post("/supplier/account/password", "account", { current: "old password here", password: "a new long password", confirm: "a new long password" }, { headers: { cookie: `${SUPPLIER_COOKIE}=${"c".repeat(43)}` } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(`${SUPPLIER_COOKIE}=newtok`);
    expect(h.change).toHaveBeenCalledWith(ACTOR, { current: "old password here", next: "a new long password" }, expect.anything());
    // The cookie the request carried is what was judged.
    expect(h.readSession.mock.calls[0][0]).toBe("c".repeat(43));
    // A supplier named in the body is a field the form does not take.
    const named = await changePassword(post("/supplier/account/password", "account", { current: "a", password: "b", confirm: "b", supplierId: "sup_other" }));
    expect(named.status).toBe(400);
    expect((await named.json()).errors).toHaveProperty("supplierId");
    expect(h.change).toHaveBeenCalledTimes(1);
  });

  it("ends every session and clears the cookie on sign out everywhere", async () => {
    h.signOutEverywhere.mockResolvedValue(2);
    const res = await signOutEverywhere(post("/supplier/account/sign-out-everywhere", "account"));
    expect(await res.json()).toEqual({ ok: true, href: "/supplier/sign-in" });
    expect(res.headers.get("set-cookie")).toBe(`${SUPPLIER_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
    expect(h.signOutEverywhere).toHaveBeenCalledWith(ACTOR, expect.anything());
  });

  it("acknowledges the reset notice for the signed-in account", async () => {
    const res = await acknowledge(post("/supplier/account/acknowledge", "account"));
    expect(res.status).toBe(200);
    expect(h.acknowledge).toHaveBeenCalledWith(ACTOR, expect.anything());
  });
});

describe("signing out", () => {
  const form = (headers: Record<string, string> = {}) =>
    new Request("http://portal.example/supplier/sign-out", { method: "POST", body: "", headers: { "content-type": "application/x-www-form-urlencoded", ...SAME_ORIGIN, ...headers } });

  it("ends the session the cookie carries, clears the cookie and sends the browser to sign in", async () => {
    const res = await signOut(form({ cookie: `${SUPPLIER_COOKIE}=${TOKEN}` }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/supplier/sign-in");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(h.signOutToken).toHaveBeenCalledWith(TOKEN, expect.anything());
  });

  it("works for someone with no session at all, and refuses another site and the staff copy", async () => {
    expect((await signOut(form())).status).toBe(303);
    const cross = await signOut(form({ "sec-fetch-site": "cross-site" }));
    expect(cross.status).toBe(403);
    vi.stubEnv("PORTAL_SURFACE", "");
    expect((await signOut(form())).status).toBe(404);
    // A link anyone can be sent to does not end a session: it is a POST of a plain form, from this origin.
    vi.stubEnv("PORTAL_SURFACE", "public");
    const json = await signOut(new Request("http://portal.example/supplier/sign-out", { method: "POST", body: "{}", headers: { "content-type": "application/json", ...SAME_ORIGIN } }));
    expect(json.status).toBe(415);
  });
});
