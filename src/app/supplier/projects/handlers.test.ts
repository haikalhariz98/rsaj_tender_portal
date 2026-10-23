import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * My Projects' three route handlers (Phase 4e), end to end through a bare `Request`: the guards in front of each (the public copy, the Origin guard, the body bound, the signed form token,
 * who is signed in), the password asked again for a signature and nothing done on a wrong one, what each refuses, and what each hands the stores. The stores and the password check behind
 * them are stand-ins; what they are asked is recorded. The database-backed half of the same promises (the rules judged on the locked rows, the attribution) is `src/lib/portal/projects/projects.db.test.ts`.
 *
 * REWRITTEN FOR PLAN STEP 6 (PW-11, PW-23): the submit route is closed, and the six kinds are sent from the Documents list. Each guarantee of the old submit tests that still applies keeps a test:
 * - the guards in front of the submit route still hold, in the same order (the door stays, so a stale page is told the same way as every other post): kept unchanged, below;
 * - past its guards, the submit route answers 410 "Send it from Documents", reads no body, asks no password and calls no store: new, replacing what it sent;
 * - a statutory declaration's password, asked before the store and never handed to it, a wrong, locked or throttled one sending nothing: moved to the create and version routes
 *   (`documents/handlers.test.ts`), where the declaration is now sent;
 * - a store's 404 has one set of words, a rule's refusal is 422 in words with no code, a bad body is refused before a store is asked: kept, on the diary and the certificate.
 */

const h = vi.hoisted(() => ({
  readSession: vi.fn(),
  confirm: vi.fn(),
  attest: vi.fn(),
  dispute: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", () => ({ readSupplierSession: h.readSession, signOutSupplierToken: vi.fn() }));
vi.mock("@/lib/auth/supplier-identity", () => ({ confirmSupplierPassword: h.confirm }));
vi.mock("@/lib/portal/projects/diary-store", () => ({ attestDiaryAsAgent: h.attest, disputeDiaryAsAgent: h.dispute }));
vi.mock("@/lib/portal/projects/certificate-store", () => ({ signContractorBlock: h.sign }));

import { FORM_SECRET_MIN_LENGTH, signFormToken, type FormPurpose } from "@/lib/auth/form-token";
import type { SupplierActor } from "@/lib/auth/types";
import { ProjectRefused } from "@/lib/portal/projects/types";

import { POST as certificate } from "./certificate/route";
import { POST as diary } from "./diary/route";
import { POST as submit } from "./submit/route";

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
const token = (purpose: FormPurpose = "projects") => signFormToken(KEY, purpose, new Date());

function post(url: string, fields: Record<string, unknown> = {}, o: { headers?: Record<string, string>; body?: string; token?: string | null } = {}) {
  const t = o.token !== undefined ? o.token : token();
  const body = o.body ?? JSON.stringify({ ...fields, ...(t ? { formToken: t } : {}) });
  return new Request(`http://portal.example${url}`, { method: "POST", body, headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), ...SAME_ORIGIN, ...o.headers } });
}

const CON = "contract_0001";
const ENTRY = "entry_000001";
const CERT = "cert_00000001";
const GOOD = {
  submit: { contractId: CON, kind: "INTERIM_CLAIM", title: "Claim 4", body: "Work to 30 September.", amount: "12500.00", aboutDay: "2026-09-30" },
  diary: { contractId: CON, entryId: ENTRY, action: "dispute", disagreement: "The rain stopped work at noon." },
  certificate: { contractId: CON, certificateId: CERT, action: "sign", password: "pw" },
};
const DOORS: [string, (r: Request) => Promise<Response>, string, Record<string, unknown>][] = [
  ["submit", submit, "/supplier/projects/submit", GOOD.submit],
  ["diary", diary, "/supplier/projects/diary", GOOD.diary],
  ["certificate", certificate, "/supplier/projects/certificate", GOOD.certificate],
];
const AT = new Date("2026-10-12T01:00:00Z");

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  for (const f of Object.values(h)) f.mockReset();
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
  h.confirm.mockResolvedValue({ ok: true, at: AT });
  h.attest.mockResolvedValue({ entryId: ENTRY, day: "2026-10-11" });
  h.dispute.mockResolvedValue({ entryId: ENTRY, day: "2026-10-11" });
  h.sign.mockResolvedValue({ certificateId: CERT, blockOrder: 3 });
});

const nothingDone = () => {
  for (const f of [h.attest, h.dispute, h.sign]) expect(f).not.toHaveBeenCalled();
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
    const tokens = [null, token("bids"), token("company"), signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), "projects", new Date()), signFormToken(KEY, "projects", new Date(Date.now() - 25 * 60 * 60 * 1000))];
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
    expect((await handler(post(url, { ...good, padding: "x".repeat(70 * 1024) }))).status).toBe(413);
    expect((await handler(post(url, { ...good, padding: "x".repeat(70 * 1024) }, { headers: { "content-length": "100" } }))).status).toBe(413);
    nothingDone();
  });

  it("tells nobody signed in so, and does nothing", async () => {
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    const res = await handler(post(url, good));
    expect([res.status, (await res.json()).code]).toEqual([401, "NOT_SIGNED_IN"]);
    expect(h.confirm).not.toHaveBeenCalled();
    nothingDone();
  });

  it("ignores a supplier, an organisation, an account or a day named in the body: the stores are given the session's", async () => {
    const res = await handler(post(url, { ...good, supplierId: "sup_someone_else", organisationId: "o_other", accountId: "acc_other", supplierAccountId: "acc_other", submittedOn: "2000-01-01", signedOn: "2000-01-01", agentAttestedOn: "2000-01-01" }));
    // Plan step 6 (PW-11): the closed submit route hands nothing to any store at all, which holds the promise trivially; `the submit route is closed` below says so outright.
    if (url === "/supplier/projects/submit") {
      expect(res.status).toBe(410);
      nothingDone();
      return;
    }
    expect([200, 201]).toContain(res.status);
    const calls = [h.attest, h.dispute, h.sign].flatMap((f) => f.mock.calls);
    expect(calls).toHaveLength(1);
    const [actor, input] = calls[0]!;
    expect(actor).toBe(ACTOR);
    expect(JSON.stringify(input)).not.toMatch(/sup_someone_else|o_other|acc_other|2000-01-01/);
  });
});

describe("the submit route is closed (plan step 6; PW-11, PW-23)", () => {
  it("past its guards it answers 410, saying to send it from Documents, and asks no password and no store, whatever the body says", async () => {
    for (const body of [GOOD.submit, { contractId: CON, kind: "STATUTORY_DECLARATION", title: "Declaration", body: "I declare.", password: "pw" }, { contractId: "x", kind: "PAY_ME" }, {}]) {
      const res = await submit(post("/supplier/projects/submit", body));
      const json = await res.json();
      expect([res.status, json.code], JSON.stringify(body)).toEqual([410, "GONE"]);
      expect(json.message).toContain("Send it from Documents");
      expect(JSON.stringify(json)).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
    }
    expect(h.confirm).not.toHaveBeenCalled();
    nothingDone();
  });
});

describe("a signature asks the password again, and a wrong one does nothing", () => {

  it("attesting a diary entry is signed; a disagreement is not", async () => {
    expect((await diary(post("/supplier/projects/diary", { contractId: CON, entryId: ENTRY, action: "attest", password: "pw" }))).status).toBe(200);
    expect(h.attest).toHaveBeenCalledWith(ACTOR, { contractId: CON, entryId: ENTRY, stepUpAt: AT });
    expect((await diary(post("/supplier/projects/diary", { contractId: CON, entryId: ENTRY, action: "attest" }))).status).toBe(422);
    h.confirm.mockResolvedValue({ ok: false, kind: "WRONG" });
    expect((await diary(post("/supplier/projects/diary", { contractId: CON, entryId: ENTRY, action: "attest", password: "x" }))).status).toBe(403);
    expect(h.attest).toHaveBeenCalledTimes(1);
    expect((await diary(post("/supplier/projects/diary", GOOD.diary))).status).toBe(200);
    expect(h.dispute).toHaveBeenCalledWith(ACTOR, { contractId: CON, entryId: ENTRY, disagreement: "The rain stopped work at noon." });
  });

  it("signing or disputing a certificate's block is signed, both ways", async () => {
    expect((await certificate(post("/supplier/projects/certificate", GOOD.certificate))).status).toBe(200);
    expect(h.sign).toHaveBeenCalledWith(ACTOR, { contractId: CON, certificateId: CERT, action: "sign", note: "", stepUpAt: AT });
    expect((await certificate(post("/supplier/projects/certificate", { contractId: CON, certificateId: CERT, action: "dispute", note: "Overstated.", password: "pw" }))).status).toBe(200);
    expect(h.sign).toHaveBeenLastCalledWith(ACTOR, { contractId: CON, certificateId: CERT, action: "dispute", note: "Overstated.", stepUpAt: AT });
    expect((await certificate(post("/supplier/projects/certificate", { contractId: CON, certificateId: CERT, action: "sign" }))).status).toBe(422);
    expect(h.sign).toHaveBeenCalledTimes(2);
  });
});

describe("what a store refuses, said in words", () => {
  // Rewritten for plan step 6 (PW-11): the submit route calls no store, so these are held on the diary and the certificate, whose stores answer the same way.
  it("a thing that is not the contractor's to see is 404 with the same words whether it exists or not", async () => {
    h.sign.mockRejectedValue(new ProjectRefused([{ code: "NOT_FOUND", level: "block" }], 404));
    const a = await certificate(post("/supplier/projects/certificate", GOOD.certificate));
    h.dispute.mockRejectedValue(new ProjectRefused([{ code: "ENTRY_NOT_FOUND", level: "block" }], 404));
    const b = await diary(post("/supplier/projects/diary", GOOD.diary));
    expect(a.status).toBe(404);
    expect(await a.json()).toEqual(await b.json());
  });

  it("a rule's refusal is 422 with its message, and the codes never reach the answer", async () => {
    h.dispute.mockRejectedValue(new ProjectRefused([{ code: "CONTRACT_NOT_ACTIVE", level: "block" }]));
    const res = await diary(post("/supplier/projects/diary", GOOD.diary));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toContain("not being administered");
    expect(body.message).not.toMatch(/CONTRACT_NOT_ACTIVE/);
  });

  it("a body that is not what the handler expects is refused before a store is asked", async () => {
    for (const bad of [{ ...GOOD.diary, contractId: "x" }, { contractId: CON }]) {
      expect((await diary(post("/supplier/projects/diary", bad))).status).toBe(400);
    }
    expect((await diary(post("/supplier/projects/diary", { contractId: CON, entryId: ENTRY, action: "sign" }))).status).toBe(400);
    expect((await certificate(post("/supplier/projects/certificate", { contractId: CON, certificateId: CERT, action: "approve", password: "pw" }))).status).toBe(400);
    expect(h.confirm).not.toHaveBeenCalled();
    nothingDone();
  });
});
