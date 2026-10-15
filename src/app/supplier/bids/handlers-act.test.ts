import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The submit and withdraw routes (SR-13, ADR 0036 D5, D7; build plan step 10), end to end through a bare `Request`: the guards in front, the body parsed in one place, the order of
 * the stamp and the password (20aa), the password counting, each answer in English and Malay, and the 20w rate rule. The stores are stood in for (they are the database's, tested in
 * `submit-store.db.test.ts`); the routes, the parsing and the words run for real.
 */

const h = vi.hoisted(() => ({
  readSession: vi.fn(),
  countAndJudge: vi.fn(),
  confirm: vi.fn(),
  takeStamp: vi.fn(),
  submit: vi.fn(),
  withdraw: vi.fn(),
  refusal: vi.fn(),
  withdrawRefusal: vi.fn(),
  order: [] as string[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", () => ({ readSupplierSession: h.readSession, signOutSupplierToken: vi.fn() }));
vi.mock("@/lib/auth/supplier-identity", () => ({ confirmSupplierPassword: h.confirm }));
vi.mock("@/lib/portal/bids/rate-store", () => ({ countAndJudgeCounted: h.countAndJudge }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/bids/online/upload-store", () => ({ logPartRefusal: h.refusal }));
vi.mock("@/lib/bids/online/submit-store", () => ({ takeStamp: h.takeStamp, submitBid: h.submit, withdrawBid: h.withdraw, logWithdrawRefusal: h.withdrawRefusal }));

import { FORM_SECRET_MIN_LENGTH, FORM_TOKEN_FIELD, signFormToken, type FormPurpose } from "@/lib/auth/form-token";
import type { SupplierActor } from "@/lib/auth/types";
import { SUBMIT_FAULT_WORDS, WITHDRAW_FAULT_WORDS } from "@/lib/bids/online/words";
import { RATE_LIMITS } from "@/lib/portal/bids/limits";

import { POST as submit } from "./submit/route";
import { POST as withdraw } from "./withdraw/route";

const KEY = "s".repeat(FORM_SECRET_MIN_LENGTH);
const SAME_ORIGIN = { "sec-fetch-site": "same-origin", origin: "http://portal.example", host: "portal.example", "content-type": "application/json" };
const ACTOR: SupplierActor = {
  kind: "SUPPLIER", accountId: "acc1", sessionId: "ses1", contactId: "c1", displayName: "Aini", supplierId: "sup_mine", supplierName: "Sampel Works", loginName: "aini",
  organisationId: "o1", organisationTimeZone: "Asia/Kuala_Lumpur", stepUpAt: null, sessionCreatedAt: new Date("2026-10-12T00:00:00Z"), sourceAddress: null, mustChangePassword: false, resetNoticePending: false,
};
const token = (purpose: FormPurpose = "bids") => signFormToken(KEY, purpose, new Date());
const EX = "exercise_0001";
const BID = "onlinebid_001";
const STAMP = new Date("2026-10-15T04:00:00.000Z");
const GOOD = { exerciseId: EX, kind: "BID", fileIds: ["file_0000001"], declaration: { price: "1000.00", completionPeriod: 6, completionUnit: "MONTHS" }, password: "correct horse" };

function post(path: "submit" | "withdraw", body: unknown, o: { token?: string | null; headers?: Record<string, string> } = {}) {
  const t = o.token !== undefined ? o.token : token();
  const text = typeof body === "string" ? body : JSON.stringify({ ...(body as object), ...(t ? { [FORM_TOKEN_FIELD]: t } : {}) });
  return new Request(`http://portal.example/supplier/bids/${path}`, { method: "POST", body: text, headers: { "content-length": String(Buffer.byteLength(text)), ...SAME_ORIGIN, ...o.headers } });
}
const RECEIPT = { exerciseId: EX, submissionNumber: 3, receivedAt: STAMP.toISOString(), late: false, keyFingerprint: "f".repeat(64), receiptDigest: "d".repeat(64), demonstration: false, alternativeNotConsidered: false };

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  for (const f of [h.readSession, h.countAndJudge, h.confirm, h.takeStamp, h.submit, h.withdraw, h.refusal, h.withdrawRefusal]) f.mockReset();
  h.order.length = 0;
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
  h.countAndJudge.mockResolvedValue({ limited: false, count: 1 });
  h.takeStamp.mockImplementation(async () => { h.order.push("stamp"); return STAMP; });
  h.confirm.mockImplementation(async () => { h.order.push("password"); return { ok: true, at: new Date("2026-10-15T04:00:02.000Z") }; });
  h.submit.mockImplementation(async () => { h.order.push("store"); return { ok: true, receipt: RECEIPT, warnings: [{ code: "REPLACE_REUPLOADS_ALL" }], onlineBidId: BID }; });
  h.withdraw.mockImplementation(async () => { h.order.push("store"); return { ok: true, withdrawn: [BID], linksCleared: [] }; });
});

describe.each([
  ["submit", submit, GOOD],
  ["withdraw", withdraw, { onlineBidId: BID, alsoWithdraw: [], password: "correct horse" }],
] as const)("the %s route: the guards, before anything is read", (name, route, good) => {
  it("is not found on the staff copy", async () => {
    vi.stubEnv("PORTAL_SURFACE", "");
    const res = await route(post(name, good));
    expect([res.status, (await res.json()).code]).toEqual([404, "NOT_FOUND"]);
    expect(h.readSession).not.toHaveBeenCalled();
  });
  it("refuses another site, a body that is not JSON, a missing token, another form's token, and nobody signed in, and takes no stamp", async () => {
    expect((await route(post(name, good, { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect((await route(post(name, "x=1", { headers: { "content-type": "text/plain" } }))).status).toBe(415);
    for (const t of [null, token("registration")]) expect((await route(post(name, good, { token: t }))).status).toBe(400);
    h.readSession.mockResolvedValue({ ok: false });
    expect((await route(post(name, good))).status).toBe(401);
    expect(h.takeStamp).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.refusal).not.toHaveBeenCalled();
  });
  it("refuses a body over its limit before it is parsed", async () => {
    const res = await route(post(name, { ...good, padding: "x".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(h.takeStamp).not.toHaveBeenCalled();
  });
  it("names the wrong fields and never what was in them, and takes neither the stamp nor the password", async () => {
    const res = await route(post(name, { ...good, surprise: "SECRET-VALUE" }));
    const body = await res.json();
    expect([res.status, body.code, body.fields]).toEqual([400, "VALIDATION", ["unknown"]]);
    expect(JSON.stringify(body)).not.toContain("SECRET-VALUE");
    expect(body.message).toBeTruthy();
    expect(body.messageMs).toBeTruthy();
    expect(h.takeStamp).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
  });
});

describe("the submit route", () => {
  it("takes the stamp after the body is read and before the password is checked, then submits with them both", async () => {
    const res = await submit(post("submit", { ...GOOD, replacesOnlineBidId: "replaced_0001" }));
    const body = await res.json();
    expect([res.status, body.ok, body.receipt.submissionNumber, body.receipt.receiptDigest]).toEqual([201, true, 3, "d".repeat(64)]);
    expect(h.order).toEqual(["stamp", "password", "store"]);
    const input = h.submit.mock.calls[0][1];
    expect(input).toMatchObject({ exerciseId: EX, kind: "BID", replacesOnlineBidId: "replaced_0001", parentOnlineBidId: null, fileIds: ["file_0000001"], stamp: STAMP, stepUpAt: new Date("2026-10-15T04:00:02.000Z") });
    expect(h.confirm.mock.calls[0][1]).toBe("correct horse");
    // The warning is said in both languages.
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0].message).toBeTruthy();
    expect(body.warnings[0].messageMs).toBeTruthy();
  });

  it("the actor is the session's: nothing in the body names a supplier", async () => {
    await submit(post("submit", { ...GOOD }));
    expect(h.submit.mock.calls[0][0]).toBe(ACTOR);
    expect((await submit(post("submit", { ...GOOD, supplierId: "sup_other" }))).status).toBe(400);
  });

  it("refuses a declaration the rules refuse, in words in both languages, before the stamp and the password", async () => {
    const res = await submit(post("submit", { ...GOOD, declaration: { price: "-5", completionPeriod: 0, completionUnit: "DAYS" } }));
    const body = await res.json();
    expect([res.status, body.code]).toEqual([422, "PRICE_INVALID"]);
    expect(body.message).toBe(SUBMIT_FAULT_WORDS.PRICE_INVALID.en);
    expect(body.messageMs).toBe(SUBMIT_FAULT_WORDS.PRICE_INVALID.ms);
    expect(body.faults).toHaveLength(2);
    expect(h.takeStamp).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it.each([
    ["WRONG", 403, "WRONG_PASSWORD"],
    ["LOCKED", 403, "LOCKED"],
    ["THROTTLED", 429, "THROTTLED"],
    ["POLICY_NOT_SET", 503, "ACT_CLOSED"],
  ] as const)("a password answered %s submits nothing and says so in both languages", async (kind, status, code) => {
    h.confirm.mockResolvedValue({ ok: false, kind });
    const res = await submit(post("submit", GOOD));
    const body = await res.json();
    expect([res.status, body.code]).toEqual([status, code]);
    expect(body.message).toBeTruthy();
    expect(body.messageMs).toBeTruthy();
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("answers 404 for an exercise that is not the supplier's, in the portal's words", async () => {
    h.submit.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    const res = await submit(post("submit", GOOD));
    expect([res.status, (await res.json()).code]).toEqual([404, "NOT_FOUND"]);
  });

  it("says the rules' faults in both languages: 422 for a rule, 409 for a stale stamp, a rival and a refusal at the commit", async () => {
    h.submit.mockResolvedValue({ ok: false, reason: "REFUSED", faults: ["NO_FILES"] });
    let body = await (await submit(post("submit", GOOD))).json();
    expect([body.code, body.message, body.messageMs]).toEqual(["NO_FILES", SUBMIT_FAULT_WORDS.NO_FILES.en, SUBMIT_FAULT_WORDS.NO_FILES.ms]);
    for (const fault of ["STAMP_STALE", "NOT_TAKEN", "LIVE_BID_HELD"] as const) {
      h.submit.mockResolvedValue({ ok: false, reason: "REFUSED", faults: [fault] });
      const res = await submit(post("submit", GOOD));
      body = await res.json();
      expect([res.status, body.message, body.messageMs]).toEqual([409, SUBMIT_FAULT_WORDS[fault].en, SUBMIT_FAULT_WORDS[fault].ms]);
    }
    h.submit.mockResolvedValue({ ok: false, reason: "REFUSED", faults: ["NO_FILES"] });
    expect((await submit(post("submit", GOOD))).status).toBe(422);
  });

  it("repeated rate refusals in one window write exactly one access event (20w)", async () => {
    const limit = RATE_LIMITS["bid-submit"].limit;
    for (let n = limit + 1; n <= limit + 5; n++) {
      h.countAndJudge.mockResolvedValue({ limited: true, retryAfterSeconds: 7, count: n });
      const res = await submit(post("submit", GOOD));
      expect([res.status, res.headers.get("retry-after"), (await res.json()).code]).toEqual([429, "7", "SUBMIT_RATE_LIMITED"]);
    }
    expect(h.refusal).toHaveBeenCalledTimes(1);
    expect(h.refusal).toHaveBeenCalledWith(ACTOR, EX, "SUBMIT", "RATE_LIMITED");
    expect(h.takeStamp).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
  });
});

describe("the withdraw route", () => {
  const body = { onlineBidId: BID, alsoWithdraw: ["alt_0000001"], password: "correct horse" };

  it("takes the stamp before the password, then withdraws with it", async () => {
    const res = await withdraw(post("withdraw", body));
    const answer = await res.json();
    expect([res.status, answer.ok, answer.withdrawn, answer.linksCleared]).toEqual([200, true, [BID], []]);
    expect(h.order).toEqual(["stamp", "password", "store"]);
    expect(h.withdraw.mock.calls[0][1]).toEqual({ onlineBidId: BID, alsoWithdraw: ["alt_0000001"], stamp: STAMP });
  });

  it("a wrong password withdraws nothing", async () => {
    h.confirm.mockResolvedValue({ ok: false, kind: "WRONG" });
    const res = await withdraw(post("withdraw", body));
    expect([res.status, (await res.json()).code]).toEqual([403, "WRONG_PASSWORD"]);
    expect(h.withdraw).not.toHaveBeenCalled();
  });

  it("answers 404 for a submission that is not the supplier's, and says the rules' faults in both languages", async () => {
    h.withdraw.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    expect((await withdraw(post("withdraw", body))).status).toBe(404);
    for (const fault of ["AFTER_CLOSING", "STAMP_STALE", "NOT_TAKEN"] as const) {
      h.withdraw.mockResolvedValue({ ok: false, reason: "REFUSED", faults: [fault] });
      const res = await withdraw(post("withdraw", body));
      const answer = await res.json();
      expect([res.status, answer.message, answer.messageMs]).toEqual([fault === "AFTER_CLOSING" ? 422 : 409, WITHDRAW_FAULT_WORDS[fault].en, WITHDRAW_FAULT_WORDS[fault].ms]);
    }
  });

  it("repeated rate refusals in one window write exactly one access event (20w)", async () => {
    const limit = RATE_LIMITS["bid-withdraw"].limit;
    for (let n = limit + 1; n <= limit + 4; n++) {
      h.countAndJudge.mockResolvedValue({ limited: true, retryAfterSeconds: 9, count: n });
      expect((await withdraw(post("withdraw", body))).status).toBe(429);
    }
    expect(h.withdrawRefusal).toHaveBeenCalledTimes(1);
    expect(h.withdrawRefusal).toHaveBeenCalledWith(ACTOR, BID, "RATE_LIMITED");
    expect(h.takeStamp).not.toHaveBeenCalled();
  });
});
