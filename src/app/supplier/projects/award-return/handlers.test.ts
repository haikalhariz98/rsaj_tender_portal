import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The contractor's online award return and question routes (Wave V, V3), end to end through a bare `Request` with the portal's REAL guards. What each refuses before anything is read or
 * written (the public copy, the Origin guard, the bound, the signed form token, who is signed in), what an unknown field does, the order of the password step-up, and how the library's
 * refusals are answered. The stores are stand-ins and what they are asked is recorded; the database-backed half is the V2 store's own db test.
 */

const h = vi.hoisted(() => ({
  readSession: vi.fn(),
  lodge: vi.fn(),
  ask: vi.fn(),
  reach: vi.fn(),
  confirm: vi.fn(),
  preflight: vi.fn(),
  store: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", () => ({ readSupplierSession: h.readSession, signOutSupplierToken: vi.fn() }));
vi.mock("@/lib/award/online-return-store", () => ({ lodgeOnlineReturn: h.lodge, askAwardQuery: h.ask }));
vi.mock("@/lib/award/online-return-reach", () => ({ lodgeReach: h.reach }));
vi.mock("@/lib/award/return-upload", () => ({ preflightReturnUpload: h.preflight, storeReturnFile: h.store }));
vi.mock("@/lib/documents/service", async (orig) => ({ ...(await orig<typeof import("@/lib/documents/service")>()), logAccess: h.log }));
vi.mock("@/lib/auth/supplier-identity", () => ({ confirmSupplierPassword: h.confirm }));

import { FORM_SECRET_MIN_LENGTH, signFormToken, type FormPurpose } from "@/lib/auth/form-token";
import type { SupplierActor } from "@/lib/auth/types";
import { AwardReturnRefused } from "@/lib/award/online-return-words";
import { ProjectRefused } from "@/lib/portal/projects/types";
import { WindowRefused } from "@/lib/project-docs/portal-upload";

import { POST as query } from "../award-query/route";
import { POST as submit } from "./submit/route";
import { POST as upload } from "./upload/route";

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
const AT = new Date("2026-10-24T01:00:00Z");
const token = (purpose: FormPurpose = "projects") => signFormToken(KEY, purpose, new Date());

function post(url: string, fields: Record<string, unknown> = {}, o: { headers?: Record<string, string>; token?: string | null } = {}) {
  const t = o.token !== undefined ? o.token : token();
  const body = JSON.stringify({ ...fields, ...(t ? { formToken: t } : {}) });
  return new Request(`http://portal.example${url}`, { method: "POST", body, headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), ...SAME_ORIGIN, ...o.headers } });
}

const CON = "contract_0001";
const V1 = "version_00001";
const PAGE = { signatoryContactId: "contact_0001", icNumber: "900101-14-5678", occupation: "Director", address: "1 Jalan Satu", capacity: "Director", witnessName: "Bakar", contractorSigned: true, stampAffixed: true, witnessSigned: true };
const SUBMIT = { contractId: CON, files: { ACCEPTANCE_PAGE: V1 }, page: PAGE, password: "pw" };
const SUBMIT_URL = "/supplier/projects/award-return/submit";
const QUERY_URL = "/supplier/projects/award-query";
const UPLOAD_URL = `/supplier/projects/award-return/upload?contractId=${CON}&scan=ACCEPTANCE_PAGE`;

const DOORS: [string, (r: Request) => Promise<Response>, string, Record<string, unknown>][] = [
  ["submit", submit, SUBMIT_URL, SUBMIT],
  ["query", query, QUERY_URL, { contractId: CON, body: "When is the indent valid until?", requestKey: "key_00000001" }],
];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  for (const f of Object.values(h)) f.mockReset();
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
  h.lodge.mockResolvedValue({ onlineReturnId: "ret_1" });
  h.ask.mockResolvedValue({ queryId: "qry_1" });
  h.reach.mockResolvedValue({ ok: true, instrument: "WORK_INDENT" });
  h.confirm.mockResolvedValue({ ok: true, at: AT });
});

const nothingDone = () => {
  for (const f of [h.lodge, h.ask, h.reach, h.confirm, h.preflight, h.store]) expect(f).not.toHaveBeenCalled();
};

describe.each(DOORS)("%s: what a post must pass before anything is read or written", (_n, handler, url, good) => {
  it("is not found on the staff copy", async () => {
    vi.stubEnv("PORTAL_SURFACE", "");
    const res = await handler(post(url, good));
    expect([res.status, (await res.json()).code]).toEqual([404, "NOT_FOUND"]);
    expect(h.readSession).not.toHaveBeenCalled();
    nothingDone();
  });

  it("refuses another site, a post with no origin, a foreign origin and a body that is not JSON", async () => {
    expect((await handler(post(url, good, { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect((await handler(post(url, good, { headers: { "sec-fetch-site": "", origin: "" } }))).status).toBe(403);
    expect((await handler(post(url, good, { headers: { origin: "http://evil.example" } }))).status).toBe(403);
    expect((await handler(post(url, good, { headers: { "content-type": "text/plain" } }))).status).toBe(415);
    nothingDone();
  });

  it("refuses a missing, foreign or old form token", async () => {
    for (const t of [null, token("bids"), signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), "projects", new Date())]) {
      const res = await handler(post(url, good, { token: t }));
      expect([res.status, (await res.json()).code]).toEqual([400, "FORM_EXPIRED"]);
    }
    nothingDone();
  });

  it("refuses a body past the bound and tells nobody signed in so", async () => {
    expect((await handler(post(url, { ...good, padding: "x".repeat(70 * 1024) }))).status).toBe(413);
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    const res = await handler(post(url, good));
    expect([res.status, (await res.json()).code]).toEqual([401, "NOT_SIGNED_IN"]);
    nothingDone();
  });

  it("refuses an unknown field, named, and a supplier or account the body names", async () => {
    const res = await handler(post(url, { ...good, supplierId: "sup_other", organisationId: "o2" }));
    const body = await res.json();
    expect([res.status, body.code]).toEqual([400, "VALIDATION"]);
    expect(Object.keys(body.errors).sort()).toEqual(["organisationId", "supplierId"]);
    nothingDone();
  });
});

describe("submit: the lodge", () => {
  it("asks the password after the read-only reach and before the lodge, and hands the lodge the session's actor, the moment and never the password", async () => {
    const res = await submit(post(SUBMIT_URL, SUBMIT));
    expect([res.status, await res.json()]).toEqual([201, { ok: true, onlineReturnId: "ret_1" }]);
    expect(h.reach.mock.invocationCallOrder[0]).toBeLessThan(h.confirm.mock.invocationCallOrder[0]!);
    expect(h.confirm.mock.invocationCallOrder[0]).toBeLessThan(h.lodge.mock.invocationCallOrder[0]!);
    expect(h.confirm.mock.calls[0]![1]).toBe("pw");
    expect(h.lodge).toHaveBeenCalledWith(ACTOR, { contractId: CON, files: { ACCEPTANCE_PAGE: V1 }, page: PAGE, stepUpAt: AT });
    expect(JSON.stringify(h.lodge.mock.calls)).not.toContain('"pw"');
  });

  it("404 alike for a contract that is not the supplier's, and asks no password", async () => {
    h.reach.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    const res = await submit(post(SUBMIT_URL, SUBMIT));
    expect([res.status, (await res.json()).code]).toEqual([404, "NOT_FOUND"]);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.lodge).not.toHaveBeenCalled();
  });

  it("403 for an account that may not sign, before the password is asked", async () => {
    h.reach.mockResolvedValue({ ok: false, reason: "NOT_SIGNING_AUTHORITY", fault: "SIGNER_NOT_AUTHORISED" });
    const res = await submit(post(SUBMIT_URL, SUBMIT));
    expect([res.status, (await res.json()).code]).toEqual([403, "NOT_SIGNING_AUTHORITY"]);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.lodge).not.toHaveBeenCalled();
  });

  it("a wrong password is 403, a locked account 403, a throttled one 429; nothing is lodged", async () => {
    for (const [kind, status] of [["WRONG", 403], ["LOCKED", 403], ["THROTTLED", 429]] as const) {
      h.confirm.mockResolvedValue({ ok: false, kind });
      expect((await submit(post(SUBMIT_URL, SUBMIT))).status).toBe(status);
    }
    expect(h.lodge).not.toHaveBeenCalled();
  });

  it("a page posted on a Letter of Acceptance is 400, and no password is asked", async () => {
    h.reach.mockResolvedValue({ ok: true, instrument: "LETTER_OF_ACCEPTANCE" });
    const res = await submit(post(SUBMIT_URL, { ...SUBMIT, files: { SIGNED_LETTER: V1 } }));
    const body = await res.json();
    expect([res.status, Object.keys(body.errors)]).toEqual([400, ["page"]]);
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("a scan the award never takes, a malformed page, a missing password and a non-boolean tick are 400 and ask nothing", async () => {
    const bad = [
      { ...SUBMIT, files: { PASSPORT: V1 } },
      { ...SUBMIT, files: { ACCEPTANCE_PAGE: "x" } },
      { ...SUBMIT, files: {} },
      { ...SUBMIT, page: { ...PAGE, extra: 1 } },
      { ...SUBMIT, page: { ...PAGE, stampAffixed: "yes" } },
      { ...SUBMIT, page: { ...PAGE, address: undefined } },
      // Security review M1: the signatory is a contact id, never a typed name.
      { ...SUBMIT, page: { ...PAGE, signatoryName: "Somebody Else" } },
      { ...SUBMIT, page: { ...PAGE, signatoryContactId: undefined } },
      { ...SUBMIT, page: { ...PAGE, signatoryContactId: "x" } },
      { ...SUBMIT, password: "" },
      { ...SUBMIT, password: undefined },
    ];
    for (const b of bad) expect([(await submit(post(SUBMIT_URL, b))).status, JSON.stringify(b)]).toEqual([400, JSON.stringify(b)]);
    nothingDone();
  });

  it("answers the library's refusals in its own words and status", async () => {
    const cases: [unknown, number, string][] = [
      [new AwardReturnRefused([], 404), 404, "NOT_FOUND"],
      [new AwardReturnRefused([{ code: "NOT_SIGNING_AUTHORITY", level: "block", data: { fault: "SIGNER_NOT_AUTHORISED" } }], 403), 403, "NOT_SIGNING_AUTHORITY"],
      [new AwardReturnRefused([{ code: "ALREADY_WAITING", level: "block" }], 409), 409, "CHANGED"],
      [new AwardReturnRefused([{ code: "SCAN_MISSING", level: "block", data: { scan: "ACCEPTANCE_PAGE" } }], 422), 422, "VALIDATION"],
      [new AwardReturnRefused([{ code: "SIGNATORY_UNKNOWN", level: "block" }], 422), 422, "VALIDATION"],
      [new ProjectRefused([{ code: "NOT_FOUND", level: "block" }], 404), 404, "NOT_FOUND"],
      [new ProjectRefused([{ code: "DAY_NOT_KNOWN", level: "block" }], 422), 422, "VALIDATION"],
    ];
    for (const [err, status, code] of cases) {
      h.lodge.mockRejectedValueOnce(err);
      const res = await submit(post(SUBMIT_URL, SUBMIT));
      const body = await res.json();
      expect([res.status, body.code]).toEqual([status, code]);
      expect(typeof body.message).toBe("string");
    }
  });

  it("a failure nobody expected is a quiet 500 that tells nothing of the cause", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.lodge.mockRejectedValueOnce(new Error("insert failed for IC 900101-14-5678"));
    const res = await submit(post(SUBMIT_URL, SUBMIT));
    expect([res.status, JSON.stringify(await res.json())]).toEqual([500, expect.not.stringContaining("900101")]);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("900101");
  });
});

describe("query: the question", () => {
  const GOOD = { contractId: CON, body: "When is the indent valid until?", requestKey: "6f1c2b9e-0d4a-4c1e-9b7a-2f3e4d5c6b7a" };

  it("is handed the session's actor and the three fields, and answers 201 with the id", async () => {
    const res = await query(post(QUERY_URL, GOOD));
    expect([res.status, await res.json()]).toEqual([201, { ok: true, queryId: "qry_1" }]);
    expect(h.ask).toHaveBeenCalledWith(ACTOR, GOOD);
  });

  it("a question of 2,001 characters is 400, 2,000 is taken", async () => {
    expect((await query(post(QUERY_URL, { ...GOOD, body: "x".repeat(2001) }))).status).toBe(400);
    expect(h.ask).not.toHaveBeenCalled();
    expect((await query(post(QUERY_URL, { ...GOOD, body: "x".repeat(2000) }))).status).toBe(201);
  });

  it("a missing question is 400", async () => {
    expect((await query(post(QUERY_URL, { contractId: CON, requestKey: GOOD.requestKey }))).status).toBe(400);
    expect(h.ask).not.toHaveBeenCalled();
  });

  it("a question without its one-time key, or with a malformed one, is 400 (security review L2)", async () => {
    expect((await query(post(QUERY_URL, { contractId: CON, body: GOOD.body }))).status).toBe(400);
    expect((await query(post(QUERY_URL, { ...GOOD, requestKey: "short" }))).status).toBe(400);
    expect(h.ask).not.toHaveBeenCalled();
  });

  it("too many questions waiting is 429, in its words", async () => {
    h.ask.mockRejectedValueOnce(new AwardReturnRefused([{ code: "TOO_MANY_OPEN", level: "block", data: { max: 5 } }], 429));
    const res = await query(post(QUERY_URL, GOOD));
    expect([res.status, (await res.json()).code]).toEqual([429, "THROTTLED"]);
  });

  it("answers not found alike, an award not issued 422, and a barred standing in its words", async () => {
    h.ask.mockRejectedValueOnce(new ProjectRefused([{ code: "NOT_FOUND", level: "block" }], 404));
    expect((await query(post(QUERY_URL, GOOD))).status).toBe(404);
    h.ask.mockRejectedValueOnce(new AwardReturnRefused([{ code: "NOT_ISSUED", level: "block" }], 422));
    const res = await query(post(QUERY_URL, GOOD));
    expect([res.status, (await res.json()).message]).toEqual([422, "The award is not issued, so this cannot be done now."]);
  });
});

describe("upload: staging one signed scan", () => {
  const form = (extra: Record<string, string> = {}, file: File | null = new File([new Uint8Array([37, 80, 68, 70, 45])], "scan.pdf", { type: "application/pdf" })) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    if (file) f.set("file", file);
    return f;
  };
  const req = (url: string, f: FormData, headers: Record<string, string> = {}) => {
    const r = new Request(`http://portal.example${url}`, { method: "POST", body: f, headers: { "x-form-token": token(), ...SAME_ORIGIN, ...headers } });
    return r;
  };

  it("is not found on the staff copy, refuses another site and a missing token, and tells nobody signed in so; nothing is read", async () => {
    vi.stubEnv("PORTAL_SURFACE", "");
    expect((await upload(req(UPLOAD_URL, form()))).status).toBe(404);
    vi.stubEnv("PORTAL_SURFACE", "public");
    expect((await upload(req(UPLOAD_URL, form(), { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await upload(req(UPLOAD_URL, form(), { "x-form-token": "" }))).status).toBe(400);
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    expect((await upload(req(UPLOAD_URL, form()))).status).toBe(401);
    nothingDone();
  });

  it("refuses an address with an unknown scan, no contract or a stray parameter 400, before the contract is looked at", async () => {
    for (const u of [`/supplier/projects/award-return/upload?contractId=${CON}&scan=PASSPORT`, `/supplier/projects/award-return/upload?scan=SIGNED_LETTER`, `${UPLOAD_URL}&supplierId=x`]) {
      const res = await upload(req(u, form()));
      expect([res.status, (await res.json()).code]).toEqual([400, "VALIDATION"]);
    }
    nothingDone();
  });

  it("answers the preflight's refusal as it is, and reads no body: another's contract 404, a scan the award does not take 400, a return already waiting 409, a window 429", async () => {
    for (const status of [404, 400, 409, 422, 429, 403]) {
      h.preflight.mockResolvedValueOnce({ ok: false, outcome: { status, body: { ok: false, code: "X", message: "No." }, logReason: "NOT_FOUND" } });
      expect((await upload(req(UPLOAD_URL, form()))).status).toBe(status);
    }
    expect(h.store).not.toHaveBeenCalled();
  });

  const PRE = { ok: true, value: { org: { id: "o1" }, store: {}, classId: "cls1", scan: "ACCEPTANCE_PAGE", cap: 100000n, capFrom: "POLICY", allowedTypes: ["application/pdf"], orgName: "Office" } };
  const PDF = () => new File([new TextEncoder().encode("%PDF-1.4 1 0 obj <<>> endobj %%EOF")], "scan.pdf", { type: "application/pdf" });
  // A multipart request with its length stated, as a browser sends one.
  const sized = async (f: FormData, headers: Record<string, string> = {}) => {
    const r = new Response(f);
    const body = new Uint8Array(await r.arrayBuffer());
    return new Request(`http://portal.example${UPLOAD_URL}`, { method: "POST", body, headers: { "content-type": r.headers.get("content-type")!, "content-length": String(body.length), "x-form-token": token(), ...SAME_ORIGIN, ...headers } });
  };

  it("stages the file for the session's account and answers 201 with the version", async () => {
    h.preflight.mockResolvedValue(PRE);
    h.store.mockResolvedValue({ versionId: "ver_00001", byteSize: 36n });
    const res = await upload(await sized(form({ contractId: CON, scan: "ACCEPTANCE_PAGE" }, PDF())));
    expect([res.status, await res.json()]).toEqual([201, { ok: true, versionId: "ver_00001", name: "scan.pdf", bytes: 36 }]);
    expect(h.preflight.mock.calls[0]!.slice(0, 3)).toEqual([ACTOR, CON, "ACCEPTANCE_PAGE"]);
    expect(h.store.mock.calls[0]![0]).toBe(ACTOR);
  });

  it("refuses a body with no stated length 411, and a form that names another contract, a stray field or two files 400, storing nothing", async () => {
    h.preflight.mockResolvedValue(PRE);
    const noLength = await sized(form({}, PDF()));
    noLength.headers.delete("content-length");
    expect((await upload(noLength)).status).toBe(411);
    for (const f of [form({ contractId: "contract_0002" }, PDF()), form({ supplierId: "x" }, PDF()), form({}, null)]) {
      const res = await upload(await sized(f));
      expect([res.status, (await res.json()).code]).toEqual([400, "VALIDATION"]);
    }
    expect(h.store).not.toHaveBeenCalled();
  });

  it("a window that fills between the preflight and the locked store is 429 and logged", async () => {
    h.preflight.mockResolvedValue(PRE);
    h.store.mockRejectedValue(new WindowRefused([{ code: "WINDOW_FILES", level: "block", data: { limit: 60 } } as never]));
    const res = await upload(await sized(form({}, PDF())));
    expect(res.status).toBe(429);
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ kind: "REFUSED" }));
  });
});
