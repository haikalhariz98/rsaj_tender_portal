import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * My Bids' three route handlers (Phase 4d), end to end through a bare `Request`: the guards in front of each (the public copy, the Origin guard, the body bound, the signed form token, who is
 * signed in), what each refuses, and what each hands the stores. The stores behind them are stand-ins; what they are asked is recorded. The database-backed half of the same promises (the
 * rules judged on the locked rows, the append-only records) is `src/lib/portal/bids/bids.db.test.ts`.
 */

const h = vi.hoisted(() => ({
  readSession: vi.fn(),
  signUp: vi.fn(),
  withdrawSignUp: vi.fn(),
  acknowledge: vi.fn(),
  requestDocuments: vi.fn(),
  withdrawRequest: vi.fn(),
  startPurchase: vi.fn(),
  settlePayment: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", () => ({ readSupplierSession: h.readSession, signOutSupplierToken: vi.fn() }));
vi.mock("@/lib/portal/bids/signup-store", async (orig) => ({ ...(await orig<typeof import("@/lib/portal/bids/signup-store")>()), signUp: h.signUp, withdrawSignUp: h.withdrawSignUp }));
vi.mock("@/lib/portal/bids/acknowledge-store", () => ({ acknowledgeAddendum: h.acknowledge }));
vi.mock("@/lib/portal/bids/request-store", () => ({ requestDocuments: h.requestDocuments, withdrawRequest: h.withdrawRequest }));
// Wave 3a (SR-10): buying and paying for the documents online go through the same door.
vi.mock("@/lib/portal/bids/purchase-store", () => ({ startPurchase: h.startPurchase, settlePayment: h.settlePayment }));

import { FORM_SECRET_MIN_LENGTH, signFormToken, type FormPurpose } from "@/lib/auth/form-token";
import type { SupplierActor } from "@/lib/auth/types";
import { BidRefused } from "@/lib/portal/bids/types";

import { POST as acknowledge } from "./acknowledge/route";
import { POST as event } from "./event/route";
import { POST as request } from "./request/route";

const KEY = "s".repeat(FORM_SECRET_MIN_LENGTH);
const SAME_ORIGIN = { "sec-fetch-site": "same-origin", origin: "http://portal.example", host: "portal.example" };
const ACTOR: SupplierActor = {
  kind: "SUPPLIER",
  accountId: "acc1",
  sessionId: "ses1",
  contactId: "c1",
  displayName: "Aini",
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
const token = (purpose: FormPurpose = "bids") => signFormToken(KEY, purpose, new Date());

function post(url: string, fields: Record<string, unknown> = {}, o: { headers?: Record<string, string>; body?: string; token?: string | null } = {}) {
  const t = o.token !== undefined ? o.token : token();
  const body = o.body ?? JSON.stringify({ ...fields, ...(t ? { formToken: t } : {}) });
  return new Request(`http://portal.example${url}`, { method: "POST", body, headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), ...SAME_ORIGIN, ...o.headers } });
}

const EX = "exercise_0001";
const EV = "event_000001";
const AD = "addendum_0001";
const GOOD = { event: { exerciseId: EX, eventId: EV, action: "signup", representative: "Aminah" }, acknowledge: { exerciseId: EX, addendumId: AD }, request: { exerciseId: EX, action: "request", collectorName: "Lim Wei" } };
const DOORS: [string, (r: Request) => Promise<Response>, string, Record<string, unknown>][] = [
  ["event", event, "/supplier/bids/event", GOOD.event],
  ["acknowledge", acknowledge, "/supplier/bids/acknowledge", GOOD.acknowledge],
  ["request", request, "/supplier/bids/request", GOOD.request],
];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  for (const f of Object.values(h)) f.mockReset();
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
  h.signUp.mockResolvedValue({ registrationId: "r1" });
  h.withdrawSignUp.mockResolvedValue({ registrationId: "r1" });
  h.acknowledge.mockResolvedValue({ acknowledgementId: "a1", on: "2026-10-09" });
  h.requestDocuments.mockResolvedValue({ outcome: "MADE", requestId: "q1", checks: [] });
  h.withdrawRequest.mockResolvedValue({ requestId: "q1" });
});

const nothingDone = () => {
  for (const f of [h.signUp, h.withdrawSignUp, h.acknowledge, h.requestDocuments, h.withdrawRequest]) expect(f).not.toHaveBeenCalled();
};

describe.each(DOORS)("%s: what a post must pass before anything is read or written", (_name, handler, url, good) => {
  it("is not found on the staff copy, where nobody is a supplier", async () => {
    vi.stubEnv("PORTAL_SURFACE", "");
    const res = await handler(post(url, good));
    expect([res.status, (await res.json()).code]).toEqual([404, "NOT_FOUND"]);
    expect(h.readSession).not.toHaveBeenCalled();
    nothingDone();
  });

  it("refuses another site, a post with no origin, a foreign origin and a body that is not JSON", async () => {
    const cross = await handler(post(url, good, { headers: { "sec-fetch-site": "cross-site" } }));
    expect([cross.status, (await cross.json()).code]).toEqual([403, "CROSS_SITE"]);
    expect((await handler(post(url, good, { headers: { "sec-fetch-site": "", origin: "" } }))).status).toBe(403);
    const foreign = await handler(post(url, good, { headers: { origin: "http://evil.example" } }));
    expect([foreign.status, (await foreign.json()).code]).toEqual([403, "WRONG_ORIGIN"]);
    const plain = await handler(post(url, good, { headers: { "content-type": "text/plain" } }));
    expect([plain.status, (await plain.json()).code]).toEqual([415, "WRONG_CONTENT_TYPE"]);
    expect(h.readSession).not.toHaveBeenCalled();
    nothingDone();
  });

  it("refuses a form with no token, a token for another form, a forged one and an old one", async () => {
    const tokens = [null, token("registration"), token("company"), signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), "bids", new Date()), signFormToken(KEY, "bids", new Date(Date.now() - 25 * 60 * 60 * 1000))];
    for (const t of tokens) {
      const res = await handler(post(url, good, { token: t }));
      expect([res.status, (await res.json()).code]).toEqual([400, "FORM_EXPIRED"]);
    }
    expect(h.readSession).not.toHaveBeenCalled();
    nothingDone();
  });

  it("refuses a body of no stated size, one past the bound, and one that states less than it sends", async () => {
    const noLength = post(url, good);
    noLength.headers.delete("content-length");
    expect((await handler(noLength)).status).toBe(411);
    expect((await handler(post(url, { ...good, padding: "x".repeat(8 * 1024) }))).status).toBe(413);
    expect((await handler(post(url, { ...good, padding: "x".repeat(8 * 1024) }, { headers: { "content-length": "100" } }))).status).toBe(413);
    nothingDone();
  });

  it("tells nobody signed in so, and does nothing", async () => {
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    const res = await handler(post(url, good));
    expect([res.status, (await res.json()).code]).toEqual([401, "NOT_SIGNED_IN"]);
    nothingDone();
  });

  it("ignores a supplier, an organisation, an account or a day named in the body: the stores are given the session's", async () => {
    const res = await handler(post(url, { ...good, supplierId: "sup_someone_else", organisationId: "o_other", accountId: "acc_other", supplierAccountId: "acc_other", acknowledgedOn: "2000-01-01", requestedAt: "2000-01-01", signedOn: "2000-01-01" }));
    expect(res.status).toBe(200);
    const calls = [h.signUp, h.withdrawSignUp, h.acknowledge, h.requestDocuments, h.withdrawRequest].flatMap((f) => f.mock.calls);
    expect(calls).toHaveLength(1);
    const [actor, input] = calls[0]!;
    expect(actor).toBe(ACTOR);
    expect(JSON.stringify(input)).not.toMatch(/sup_someone_else|o_other|acc_other|2000-01-01/);
  });
});

describe("what each hands its store", () => {
  it("event: a sign-up with the name as typed, and a withdrawal without one", async () => {
    expect((await event(post("/supplier/bids/event", GOOD.event))).status).toBe(200);
    expect(h.signUp).toHaveBeenCalledWith(ACTOR, { exerciseId: EX, eventId: EV, representative: "Aminah" });
    expect((await event(post("/supplier/bids/event", { ...GOOD.event, action: "withdraw" }))).status).toBe(200);
    expect(h.withdrawSignUp).toHaveBeenCalledWith(ACTOR, { exerciseId: EX, eventId: EV });
  });

  it("acknowledge: the exercise and the addendum, and the day the server stamped is what comes back", async () => {
    const res = await acknowledge(post("/supplier/bids/acknowledge", GOOD.acknowledge));
    expect(await res.json()).toEqual({ ok: true, on: "2026-10-09" });
    expect(h.acknowledge).toHaveBeenCalledWith(ACTOR, { exerciseId: EX, addendumId: AD });
  });

  it("request: an ask with the collector, a withdrawal without one, and a refusal by the checks answered with its reasons, never a code", async () => {
    expect((await request(post("/supplier/bids/request", GOOD.request))).status).toBe(200);
    expect(h.requestDocuments).toHaveBeenCalledWith(ACTOR, { exerciseId: EX, collectorName: "Lim Wei" });
    expect((await request(post("/supplier/bids/request", { exerciseId: EX, action: "withdraw" }))).status).toBe(200);
    expect(h.withdrawRequest).toHaveBeenCalledWith(ACTOR, { exerciseId: EX });
    h.requestDocuments.mockResolvedValue({ outcome: "REFUSED", requestId: "q2", recorded: true, checks: [{ key: "REGISTER", state: "BLOCK", detail: "Your company is not on the supplier register yet." }, { key: "AUTHORITY", state: "BRING", detail: "Bring proof." }] });
    const res = await request(post("/supplier/bids/request", GOOD.request));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, code: "REFUSED", reasons: ["Your company is not on the supplier register yet."], recorded: true });
  });
});

describe("buying and paying online (SR-10), through the same door", () => {
  it("buy: the exercise and nothing else is handed to the store, and a refusal by the checks is answered with its reasons", async () => {
    h.startPurchase.mockResolvedValue({ outcome: "MADE", purchaseId: "p1" });
    const ok = await request(post("/supplier/bids/request", { exerciseId: EX, action: "buy", supplierId: "sup_other", collectorName: "ignored" }));
    expect(ok.status).toBe(200);
    expect(h.startPurchase).toHaveBeenCalledWith(ACTOR, { exerciseId: EX });
    h.startPurchase.mockResolvedValue({ outcome: "REFUSED", recorded: true, reasons: ["Your company is suspended."] });
    const res = await request(post("/supplier/bids/request", { exerciseId: EX, action: "buy" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, code: "REFUSED", reasons: ["Your company is suspended."], recorded: true });
  });

  it("pay: the method and the choice are handed over; a paid answer carries the simulated reference, and a failure is an answer (200) that says it failed, with its words", async () => {
    h.settlePayment.mockResolvedValue({ outcome: "PAID", reference: "SIM-1", method: "Card", already: false });
    const paid = await request(post("/supplier/bids/request", { exerciseId: EX, action: "pay", method: "Card", choice: "PAY" }));
    expect(paid.status).toBe(200);
    expect(await paid.json()).toMatchObject({ ok: true, reference: "SIM-1" });
    expect(h.settlePayment).toHaveBeenCalledWith(ACTOR, { exerciseId: EX, method: "Card", choice: "PAY" });
    h.settlePayment.mockResolvedValue({ outcome: "FAILED", reference: "SIM-2", method: "Card", failureText: "The simulated provider declined the payment. No money moved." });
    const failed = await request(post("/supplier/bids/request", { exerciseId: EX, action: "pay", method: "Card", choice: "FAIL" }));
    expect(failed.status).toBe(200);
    expect(await failed.json()).toMatchObject({ ok: false, code: "PAYMENT_FAILED", message: expect.stringContaining("No money moved") });
  });

  it("pay: a rule's refusal (the simulator is off) is 422 with its words, never a code", async () => {
    h.settlePayment.mockRejectedValue(new BidRefused([{ code: "PAYMENT_UNAVAILABLE", level: "block", data: { words: "Online payment is switched off, so documents cannot be paid for here." } }]));
    const res = await request(post("/supplier/bids/request", { exerciseId: EX, action: "pay", method: "Card", choice: "PAY" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toContain("switched off");
    expect(body.message).not.toMatch(/PAYMENT_UNAVAILABLE/);
  });
});

describe("what a store refuses, said in words", () => {
  it("a thing that is not the supplier's to see is 404 with the same words whether it exists or not", async () => {
    h.signUp.mockRejectedValue(new BidRefused([{ code: "NOT_FOUND", level: "block" }], 404));
    const a = await event(post("/supplier/bids/event", GOOD.event));
    h.signUp.mockRejectedValue(new BidRefused([{ code: "EVENT_NOT_FOUND", level: "block" }], 404));
    const b = await event(post("/supplier/bids/event", GOOD.event));
    expect(a.status).toBe(404);
    expect(await a.json()).toEqual(await b.json());
  });

  it("a rule's refusal is 422 with its message, and the codes never reach the answer", async () => {
    h.acknowledge.mockRejectedValue(new BidRefused([{ code: "NOT_A_PURCHASER", level: "block" }]));
    const res = await acknowledge(post("/supplier/bids/acknowledge", GOOD.acknowledge));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toContain("Addenda are sent to the companies that bought the documents");
    expect(body.message).not.toMatch(/NOT_A_PURCHASER/);
  });

  it("a body that is not what the handler expects is refused before a store is asked", async () => {
    for (const bad of [{ ...GOOD.event, exerciseId: "x" }, { ...GOOD.event, action: "delete" }, { ...GOOD.event, representative: 12 }, { exerciseId: EX }]) {
      expect((await event(post("/supplier/bids/event", bad))).status).toBe(400);
    }
    expect((await acknowledge(post("/supplier/bids/acknowledge", { exerciseId: EX }))).status).toBe(400);
    // Wave 3a (SR-10): "buy" and "pay" are now actions of this door (an online sale's), so a body naming one is read; an action it does not know is still refused.
    expect((await request(post("/supplier/bids/request", { exerciseId: EX, action: "delete" }))).status).toBe(400);
    expect((await request(post("/supplier/bids/request", { exerciseId: EX, action: "pay", method: "Card", choice: "MAYBE" }))).status).toBe(400);
    nothingDone();
  });
});
