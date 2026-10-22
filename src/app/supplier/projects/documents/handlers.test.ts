import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The contractor's Project workspace routes (plan step 5), end to end through a bare `Request` with the portal's REAL guards: the three JSON acts, the staging upload and the file download.
 * What each refuses before anything is read or written (the public copy, the Origin guard, the bound, the signed form token, who is signed in), what a posted `kind` and an unknown field
 * do (422, 400: nothing is done), and that the stores are handed the session's actor and nothing the body named. The stores behind them are stand-ins; what they are asked is recorded.
 * The database-backed half (the rules on the locked rows, the 404s, the window, the download log) is `src/lib/project-docs/portal.db.test.ts`.
 */

const h = vi.hoisted(() => ({
  readSession: vi.fn(),
  create: vi.fn(),
  version: vi.fn(),
  request: vi.fn(),
  preflight: vi.fn(),
  find: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", () => ({ readSupplierSession: h.readSession, signOutSupplierToken: vi.fn() }));
vi.mock("@/lib/project-docs/portal-acts", () => ({ contractorCreate: h.create, contractorVersion: h.version, contractorRequest: h.request }));
vi.mock("@/lib/project-docs/portal-file", () => ({ findProjectFile: h.find }));
vi.mock("@/lib/project-docs/portal-upload", async (orig) => ({ ...(await orig<typeof import("@/lib/project-docs/portal-upload")>()), preflightProjectUpload: h.preflight }));

import { FORM_SECRET_MIN_LENGTH, signFormToken, type FormPurpose } from "@/lib/auth/form-token";
import type { SupplierActor } from "@/lib/auth/types";

import { GET as file, HEAD as fileHead } from "./file/[attachmentId]/route";
import { POST as create } from "./create/route";
import { POST as request } from "./request/route";
import { POST as upload } from "./upload/route";
import { POST as version } from "./version/route";

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
const DOC = "document_0001";
const V1 = "version_00001";
const GOOD = {
  create: { contractId: CON, title: "Method statement", mode: "upload", versionIds: [V1], versionNote: "First issue." },
  version: { contractId: CON, documentId: DOC, versionIds: [V1], note: "Corrected." },
  request: { contractId: CON, documentId: DOC, note: "Please send it again." },
};
const DOORS: [string, (r: Request) => Promise<Response>, string, Record<string, unknown>, typeof h.create][] = [
  ["create", create, "/supplier/projects/documents/create", GOOD.create, h.create],
  ["version", version, "/supplier/projects/documents/version", GOOD.version, h.version],
  ["request", request, "/supplier/projects/documents/request", GOOD.request, h.request],
];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  for (const f of Object.values(h)) f.mockReset();
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
  for (const f of [h.create, h.version, h.request]) f.mockResolvedValue({ status: 201, body: { ok: true } });
});

const nothingDone = () => {
  for (const f of [h.create, h.version, h.request, h.preflight, h.find]) expect(f).not.toHaveBeenCalled();
};

describe.each(DOORS)("%s: what a post must pass before anything is read or written", (_name, handler, url, good, store) => {
  it("is not found on the staff copy, where nobody is a supplier", async () => {
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
    expect(h.readSession).not.toHaveBeenCalled();
    nothingDone();
  });

  it("refuses a form with no token, a token for another form, a forged one and an old one", async () => {
    for (const t of [null, token("bids"), token("registration"), signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), "projects", new Date()), signFormToken(KEY, "projects", new Date(Date.now() - 25 * 60 * 60 * 1000))]) {
      const res = await handler(post(url, good, { token: t }));
      expect([res.status, (await res.json()).code]).toEqual([400, "FORM_EXPIRED"]);
    }
    nothingDone();
  });

  it("refuses a body of no stated size and one past the bound", async () => {
    const noLength = post(url, good);
    noLength.headers.delete("content-length");
    expect((await handler(noLength)).status).toBe(411);
    expect((await handler(post(url, { ...good, padding: "x".repeat(70 * 1024) }))).status).toBe(413);
    nothingDone();
  });

  it("tells nobody signed in so, and does nothing", async () => {
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    const res = await handler(post(url, good));
    expect([res.status, (await res.json()).code]).toEqual([401, "NOT_SIGNED_IN"]);
    nothingDone();
  });

  it("refuses a posted kind 422 and an unknown field 400, with a stable code and the field named, and does nothing", async () => {
    const kind = await handler(post(url, { ...good, kind: "INTERIM_CLAIM" }));
    expect([kind.status, (await kind.json()).code]).toEqual([422, "KIND_NOT_AVAILABLE"]);
    const unknown = await handler(post(url, { ...good, supplierId: "sup_someone_else", approverPersonIds: ["p1"] }));
    const body = await unknown.json();
    expect([unknown.status, body.code]).toEqual([400, "VALIDATION"]);
    expect(Object.keys(body.errors).sort()).toEqual(["approverPersonIds", "supplierId"]);
    nothingDone();
  });

  it("hands the store the session's actor and only what the body is allowed to say, and answers what the store answered", async () => {
    const res = await handler(post(url, good));
    expect(res.status).toBe(201);
    expect(store).toHaveBeenCalledTimes(1);
    const [actor, input] = store.mock.calls[0]!;
    expect(actor).toBe(ACTOR);
    expect(input).toMatchObject({ contractId: CON });
    store.mockResolvedValue({ status: 404, body: { ok: false, code: "NOT_FOUND", message: "That is not something you can open." } });
    expect((await handler(post(url, good))).status).toBe(404);
  });
});

describe("the staging upload", () => {
  const multipart = async (url: string, o: { headers?: Record<string, string>; token?: string | null; fields?: Record<string, string> } = {}) => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array([37, 80, 68, 70])], "a.pdf", { type: "application/pdf" }));
    for (const [k, v] of Object.entries(o.fields ?? {})) fd.append(k, v);
    const probe = new Response(fd);
    const body = new Uint8Array(await probe.arrayBuffer());
    const t = o.token !== undefined ? o.token : token();
    return new Request(`http://portal.example${url}`, { method: "POST", body, headers: { "content-type": probe.headers.get("content-type")!, "content-length": String(body.byteLength), ...(t ? { "x-form-token": t } : {}), ...SAME_ORIGIN, ...o.headers } });
  };
  const URL_ = `/supplier/projects/documents/upload?contractId=${CON}`;

  it("is not found on the staff copy, refuses another site and a missing or wrong token, and tells nobody signed in so; nothing is read", async () => {
    vi.stubEnv("PORTAL_SURFACE", "");
    expect((await upload(await multipart(URL_))).status).toBe(404);
    vi.stubEnv("PORTAL_SURFACE", "public");
    expect((await upload(await multipart(URL_, { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect((await upload(await multipart(URL_, { token: null }))).status).toBe(400);
    expect((await upload(await multipart(URL_, { token: token("bids") }))).status).toBe(400);
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    expect((await upload(await multipart(URL_))).status).toBe(401);
    nothingDone();
  });

  it("refuses a posted kind (in the address or in the form) 422 and an unknown address or form field 400, before the contract is looked at", async () => {
    expect((await upload(await multipart(`${URL_}&kind=INTERIM_CLAIM`))).status).toBe(422);
    expect((await upload(await multipart(`${URL_}&supplierId=sup_x`))).status).toBe(400);
    expect((await upload(await multipart("/supplier/projects/documents/upload"))).status).toBe(400);
    expect(h.preflight).not.toHaveBeenCalled();
  });

  it("looks at the contract as the session's supplier before it reads the body, and writes nothing where it is not theirs", async () => {
    h.preflight.mockResolvedValue({ ok: false, outcome: { status: 404, body: { ok: false, code: "NOT_FOUND", message: "That is not something you can open." }, logReason: "NOT_FOUND" } });
    const res = await upload(await multipart(URL_));
    expect([res.status, (await res.json()).code]).toEqual([404, "NOT_FOUND"]);
    expect(h.preflight).toHaveBeenCalledWith(ACTOR, CON);
  });
});

describe("the file download", () => {
  const get = (id: string, o: { headers?: Record<string, string>; t?: string | null } = {}) => {
    const t = o.t !== undefined ? o.t : token();
    return file(new Request(`http://portal.example/supplier/projects/documents/file/${id}${t ? `?t=${encodeURIComponent(t)}` : ""}`, { headers: { "sec-fetch-site": "same-origin", ...o.headers } }), { params: Promise.resolve({ attachmentId: id }) } as never);
  };

  it("is not found on the staff copy, refuses another site and a missing or wrong token, and tells nobody signed in so; the file is never looked up", async () => {
    vi.stubEnv("PORTAL_SURFACE", "");
    expect((await get("attachment_0001")).status).toBe(404);
    vi.stubEnv("PORTAL_SURFACE", "public");
    expect((await get("attachment_0001", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await get("attachment_0001", { t: null })).status).toBe(400);
    expect((await get("attachment_0001", { t: token("bids") })).status).toBe(400);
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    expect((await get("attachment_0001")).status).toBe(401);
    expect(h.find).not.toHaveBeenCalled();
  });

  it("answers a HEAD 405 and reads nothing", async () => {
    const res = await fileHead();
    expect(res.status).toBe(405);
    expect(h.find).not.toHaveBeenCalled();
  });
});
