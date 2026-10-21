import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The registration wizard's route handlers (Phase 4b, B6), end to end through a bare `Request`: the guards in front of each (the public copy, the Origin guard, the body bound, the signed
 * form token, who is signed in), what each refuses, and what each hands the stores. The stores behind them are stand-ins; what they are asked is recorded. The database-backed half of the
 * same promises (the quota under the lock, the frozen draft, the signed acts) is `src/lib/portal/registration/registration.db.test.ts`.
 */

const h = vi.hoisted(() => ({
  readSession: vi.fn(),
  confirm: vi.fn(),
  saveSection: vi.fn(),
  loadWizardState: vi.fn(),
  loadDraftView: vi.fn(),
  contextFor: vi.fn(),
  registrationFaults: vi.fn(),
  submitRegistration: vi.fn(),
  storeSupplierUpload: vi.fn(),
  withdrawDraftFile: vi.fn(),
  loadUploadSettings: vi.fn(),
  loadRegistrationSettings: vi.fn(),
  documentOrg: vi.fn(),
  logAccess: vi.fn(),
  blobStore: vi.fn(),
  findOwnVersion: vi.fn(),
  storeGet: vi.fn(),
  writeSulitEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", () => ({ readSupplierSession: h.readSession, signOutSupplierToken: vi.fn() }));
vi.mock("@/lib/auth/supplier-identity", () => ({ confirmSupplierPassword: h.confirm }));
vi.mock("@/lib/portal/registration/draft-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/portal/registration/draft-store")>()),
  saveSection: h.saveSection,
  loadWizardState: h.loadWizardState,
  loadDraftView: h.loadDraftView,
  draftOf: () => ({ documents: [], creditor: {}, statementCount: 0 }),
}));
vi.mock("@/lib/portal/registration/context-store", async (orig) => ({ ...(await orig<typeof import("@/lib/portal/registration/context-store")>()), contextFor: h.contextFor, loadRegistrationSettings: h.loadRegistrationSettings }));
vi.mock("@/lib/portal/registration/faults", async (orig) => ({ ...(await orig<typeof import("@/lib/portal/registration/faults")>()), registrationFaults: h.registrationFaults }));
vi.mock("@/lib/portal/registration/submit-store", () => ({ submitRegistration: h.submitRegistration }));
vi.mock("@/lib/portal/registration/upload-store", () => ({ storeSupplierUpload: h.storeSupplierUpload, withdrawDraftFile: h.withdrawDraftFile }));
vi.mock("@/lib/portal/registration/upload-settings", () => ({ loadUploadSettings: h.loadUploadSettings }));
vi.mock("@/lib/portal/registration/own-file-store", () => ({ findOwnVersion: h.findOwnVersion }));
vi.mock("@/lib/documents/service", async (orig) => ({ ...(await orig<typeof import("@/lib/documents/service")>()), documentOrg: h.documentOrg, logAccess: h.logAccess }));
vi.mock("@/lib/documents/store", async (orig) => ({ ...(await orig<typeof import("@/lib/documents/store")>()), blobStore: h.blobStore }));
vi.mock("@/lib/auth/creditor-access-store", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/creditor-access-store")>()), writeSupplierSulitEvent: h.writeSulitEvent }));

import { FORM_SECRET_MIN_LENGTH, signFormToken, type FormPurpose } from "@/lib/auth/form-token";
import type { SupplierActor } from "@/lib/auth/types";
import { UploadRefusal } from "@/lib/documents/service";
import { DraftRefused } from "@/lib/portal/registration/draft-store";
import { sha256Hex } from "@/lib/documents/store";

import { GET as file, HEAD as fileHead } from "./file/route";
import { POST as save } from "./save/route";
import { POST as submit } from "./submit/route";
import { POST as upload } from "./upload/route";
import { GET as values } from "./values/route";
import { POST as withdraw } from "./withdraw-file/route";

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

const token = (purpose: FormPurpose = "registration") => signFormToken(KEY, purpose, new Date());

/// A JSON post from a page of this origin, with a token. `headers` and `body` override.
function post(url: string, fields: Record<string, unknown> = {}, o: { headers?: Record<string, string>; body?: string; token?: string | null } = {}) {
  const t = o.token !== undefined ? o.token : token();
  const body = o.body ?? JSON.stringify({ ...fields, ...(t ? { formToken: t } : {}) });
  return new Request(`http://portal.example${url}`, { method: "POST", body, headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), ...SAME_ORIGIN, ...o.headers } });
}

const BOUNDARY = "----registrationtest";
/// A multipart body assembled by hand, so the length and the parts are exactly what a test says.
function multipart(fields: Record<string, string>, f: { name: string; type: string; bytes: Uint8Array } | null): Buffer {
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (f) parts.push(Buffer.concat([Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`), Buffer.from(f.bytes), Buffer.from("\r\n")]));
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(parts);
}
function uploadRequest(body: Buffer | null, o: { query?: string; headers?: Record<string, string>; token?: string | null; length?: string | null } = {}) {
  const t = o.token !== undefined ? o.token : token();
  const headers: Record<string, string> = { "content-type": `multipart/form-data; boundary=${BOUNDARY}`, ...SAME_ORIGIN, ...(t ? { "x-form-token": t } : {}), ...o.headers };
  if (o.length !== null && body) headers["content-length"] = o.length ?? String(body.length);
  return new Request(`http://portal.example/supplier/registration/upload${o.query ?? "?kind=document"}`, { method: "POST", body: body ? new Uint8Array(body) : null, headers });
}

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n");
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00]);
const SETTINGS = {
  store: { allowedTypes: ["application/pdf"], capBytes: 1024n },
  document: { classId: "cls1", maxFiles: 3, maxBytes: 5000n },
  statement: { classId: "cls2", classIsSulit: true, maxFiles: 3, maxBytes: 5000n },
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  for (const f of Object.values(h)) f.mockReset();
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
  h.documentOrg.mockResolvedValue({ id: "o1" });
  h.blobStore.mockReturnValue({ store: { get: h.storeGet } });
  h.loadRegistrationSettings.mockResolvedValue({ org: { id: "o1" }, policy: {} });
  h.loadUploadSettings.mockResolvedValue(SETTINGS);
  h.logAccess.mockResolvedValue(undefined);
  h.loadWizardState.mockResolvedValue("OPEN");
  h.loadDraftView.mockResolvedValue({ version: 5, documents: [] });
  h.contextFor.mockResolvedValue({});
  h.registrationFaults.mockReturnValue([]);
});

const JSON_DOORS: [string, (r: Request) => Promise<Response>, string][] = [
  ["save", save, "/supplier/registration/save"],
  ["upload withdrawal", withdraw, "/supplier/registration/withdraw-file"],
  ["submit", submit, "/supplier/registration/submit"],
];

describe("what every registration post must pass before anything is read or written", () => {
  it.each(JSON_DOORS)("%s: is not found on the staff copy, where nobody is a supplier", async (_n, handler, url) => {
    vi.stubEnv("PORTAL_SURFACE", "");
    const res = await handler(post(url));
    expect([res.status, (await res.json()).code]).toEqual([404, "NOT_FOUND"]);
    expect(h.readSession).not.toHaveBeenCalled();
  });

  it.each(JSON_DOORS)("%s: refuses another site, a post with no origin, a foreign origin and a body that is not JSON", async (_n, handler, url) => {
    const cross = await handler(post(url, {}, { headers: { "sec-fetch-site": "cross-site" } }));
    expect([cross.status, (await cross.json()).code]).toEqual([403, "CROSS_SITE"]);
    expect((await handler(post(url, {}, { headers: { "sec-fetch-site": "", origin: "" } }))).status).toBe(403);
    const foreign = await handler(post(url, {}, { headers: { origin: "http://evil.example" } }));
    expect([foreign.status, (await foreign.json()).code]).toEqual([403, "WRONG_ORIGIN"]);
    const plain = await handler(post(url, {}, { headers: { "content-type": "text/plain" } }));
    expect([plain.status, (await plain.json()).code]).toEqual([415, "WRONG_CONTENT_TYPE"]);
    expect(h.readSession).not.toHaveBeenCalled();
    expect(h.saveSection).not.toHaveBeenCalled();
    expect(h.submitRegistration).not.toHaveBeenCalled();
  });

  it.each(JSON_DOORS)("%s: refuses a form with no token, a token for another form, a forged one and an old one", async (_n, handler, url) => {
    const tokens = [null, token("sign-in"), signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), "registration", new Date()), signFormToken(KEY, "registration", new Date(Date.now() - 25 * 60 * 60 * 1000))];
    for (const t of tokens) {
      const res = await handler(post(url, { version: 1 }, { token: t }));
      expect([res.status, (await res.json()).code]).toEqual([400, "FORM_EXPIRED"]);
    }
    expect(h.readSession).not.toHaveBeenCalled();
  });

  it.each(JSON_DOORS)("%s: refuses a body of no stated size, one past the bound, and one that states less than it sends", async (_n, handler, url) => {
    const noLength = post(url);
    noLength.headers.delete("content-length");
    expect((await handler(noLength)).status).toBe(411);
    const big = post(url, { padding: "x".repeat(200 * 1024) });
    expect((await handler(big)).status).toBe(413);
    const lying = post(url, { padding: "x".repeat(200 * 1024) }, { headers: { "content-length": "100" } });
    expect((await handler(lying)).status).toBe(413);
  });

  it.each(JSON_DOORS)("%s: tells nobody signed in so, and does nothing", async (_n, handler, url) => {
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    const res = await handler(post(url, { version: 1 }));
    expect([res.status, (await res.json()).code]).toEqual([401, "NOT_SIGNED_IN"]);
    expect(h.saveSection).not.toHaveBeenCalled();
    expect(h.withdrawDraftFile).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.submitRegistration).not.toHaveBeenCalled();
  });

  it("the upload: the same doors, with the token in a header and a multipart body", async () => {
    const body = multipart({ version: "1" }, { name: "a.pdf", type: "application/pdf", bytes: PDF });
    vi.stubEnv("PORTAL_SURFACE", "");
    expect((await upload(uploadRequest(body))).status).toBe(404);
    vi.stubEnv("PORTAL_SURFACE", "public");
    const cross = await upload(uploadRequest(body, { headers: { "sec-fetch-site": "cross-site" } }));
    expect([cross.status, (await cross.json()).code]).toEqual([403, "CROSS_SITE"]);
    expect((await upload(uploadRequest(body, { headers: { origin: "http://evil.example" } }))).status).toBe(403);
    const json = await upload(uploadRequest(body, { headers: { "content-type": "application/json" } }));
    expect([json.status, (await json.json()).code]).toEqual([415, "WRONG_CONTENT_TYPE"]);
    for (const t of [null, token("sign-in"), signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), "registration", new Date())]) {
      const res = await upload(uploadRequest(body, { token: t }));
      expect([res.status, (await res.json()).code]).toEqual([400, "FORM_EXPIRED"]);
    }
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    expect((await upload(uploadRequest(body))).status).toBe(401);
    expect(h.storeSupplierUpload).not.toHaveBeenCalled();
    expect(h.loadUploadSettings).not.toHaveBeenCalled();
  });

  it("the reads: a search and a download are refused from another site, with no token and with nobody signed in", async () => {
    const get = (url: string, headers: Record<string, string> = {}) => new Request(`http://portal.example${url}`, { headers: { "sec-fetch-site": "same-origin", "x-form-token": token(), ...headers } });
    for (const [handler, url] of [[values, "/supplier/registration/values?body=body12345"], [file, "/supplier/registration/file?id=version1234"]] as const) {
      expect((await handler(get(url, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
      expect((await handler(get(url, { "x-form-token": "" }))).status).toBe(400);
      h.readSession.mockResolvedValueOnce({ ok: false, reason: "UNKNOWN" });
      expect((await handler(get(url))).status).toBe(401);
    }
    vi.stubEnv("PORTAL_SURFACE", "");
    expect((await values(get("/supplier/registration/values?body=body12345"))).status).toBe(404);
    expect(h.findOwnVersion).not.toHaveBeenCalled();
  });

  it("a HEAD is refused for a file: no read, no log entry", async () => {
    const res = await fileHead();
    expect(res.status).toBe(405);
    expect(h.findOwnVersion).not.toHaveBeenCalled();
    expect(h.logAccess).not.toHaveBeenCalled();
  });
});

describe("saving a section", () => {
  const body = { step: "documents", version: 3, section: { step: "documents", documents: [] } };

  it("acts for the session's supplier, and a supplier or organisation named in the body is not read", async () => {
    h.saveSection.mockResolvedValue({ version: 4, created: {}, faults: [] });
    const res = await save(post("/supplier/registration/save", { ...body, supplierId: "sup_other", organisationId: "o2", accountId: "acc9" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, version: 4 });
    const [actor, input] = h.saveSection.mock.calls[0]!;
    expect(actor).toBe(ACTOR);
    expect(Object.keys(input).sort()).toEqual(["remove", "section", "version"]);
    expect(JSON.stringify(input)).not.toMatch(/sup_other|acc9|"o2"/);
  });

  it("a GIRO tick says which wording it was made on, by hash; a tick with none, or with a malformed one, is refused before the store", async () => {
    h.saveSection.mockResolvedValue({ version: 4, created: {}, faults: [] });
    const epayment = (section: Record<string, unknown>) => post("/supplier/registration/save", { step: "epayment", version: 3, section: { creditor: {}, ...section } });
    expect((await save(epayment({ giroConfirmed: true }))).status).toBe(400);
    expect((await save(epayment({ giroConfirmed: true, giroTextSha256: "not-a-hash" }))).status).toBe(400);
    expect(h.saveSection).not.toHaveBeenCalled();
    expect((await save(epayment({ giroConfirmed: true, giroTextSha256: SHA }))).status).toBe(200);
    expect(h.saveSection.mock.calls[0]![1].section).toMatchObject({ giroConfirmed: true, giroTextSha256: SHA });
    // unticking needs no hash
    expect((await save(epayment({ giroConfirmed: false }))).status).toBe(200);
  });

  it("refuses a signature that does not say which wording it was shown, by hash", async () => {
    for (const textSha256 of [undefined, "", "abc", "Z".repeat(64)]) {
      const res = await submit(post("/supplier/registration/submit", { version: 5, password: "correct horse battery", declarations: [{ kind: "FALSE_DECLARATION", textVersionId: "text5678", textSha256, signatoryName: "Aini", signatoryDesignation: "Director", confirmed: true }] }));
      expect(res.status).toBe(400);
    }
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("refuses a body of the wrong shape by name, before it asks the store", async () => {
    for (const bad of [{ ...body, version: "3" }, { ...body, step: "company" }, { ...body, section: null }, { step: "documents", version: 3, section: { documents: [{ id: "x" }] } }]) {
      expect((await save(post("/supplier/registration/save", bad))).status).toBe(400);
    }
    expect(h.saveSection).not.toHaveBeenCalled();
  });

  it("answers 409 and writes nothing when the page is stale, and when the registration was already sent", async () => {
    h.saveSection.mockRejectedValueOnce(new DraftRefused("STALE"));
    const stale = await save(post("/supplier/registration/save", body));
    expect([stale.status, (await stale.json()).code]).toEqual([409, "STALE"]);
    h.saveSection.mockRejectedValueOnce(new DraftRefused("SENT"));
    const sent = await save(post("/supplier/registration/save", body));
    expect([sent.status, (await sent.json()).code]).toEqual([409, "DECIDED"]);
    h.saveSection.mockRejectedValueOnce(new DraftRefused("NOT_OPEN"));
    expect((await save(post("/supplier/registration/save", body))).status).toBe(409);
  });

  it("answers a row that is not on the supplier's own draft as not found, never as someone else's", async () => {
    h.saveSection.mockRejectedValueOnce(new DraftRefused("NOT_FOUND"));
    const res = await save(post("/supplier/registration/save", body));
    expect([res.status, (await res.json()).code]).toEqual([404, "NOT_FOUND"]);
  });

  it("says what stands in the way only when asked to go on", async () => {
    const fault = { step: "documents", code: "DOCUMENT_REQUIRED", level: "block", field: "type.t1", data: { type: "Company certificate" } };
    h.saveSection.mockResolvedValue({ version: 4, created: {}, faults: [fault] });
    const quiet = await (await save(post("/supplier/registration/save", body))).json();
    expect(quiet).toMatchObject({ ok: true, faults: [], advance: false });
    const next = await (await save(post("/supplier/registration/save", { ...body, next: true }))).json();
    expect(next.advance).toBe(false);
    expect(next.faults[0]).toMatchObject({ step: "documents", level: "block", field: "type.t1" });
    // The answer carries the words, never the code of the rule.
    expect(JSON.stringify(next.faults)).not.toContain("DOCUMENT_REQUIRED");
  });
});

describe("withdrawing a file", () => {
  it("names the version of the draft the page saw, refuses a stale one, and takes no supplier from the body", async () => {
    h.withdrawDraftFile.mockResolvedValueOnce({ version: 7 });
    const ok = await withdraw(post("/supplier/registration/withdraw-file", { version: 6, versionId: "ver_abcdefgh", supplierId: "sup_other" }));
    expect(await ok.json()).toEqual({ ok: true, version: 7 });
    expect(h.withdrawDraftFile).toHaveBeenCalledWith(ACTOR, { version: 6, versionId: "ver_abcdefgh" });
    h.withdrawDraftFile.mockRejectedValueOnce(new DraftRefused("STALE"));
    expect((await withdraw(post("/supplier/registration/withdraw-file", { version: 1, versionId: "ver_abcdefgh" }))).status).toBe(409);
    expect((await withdraw(post("/supplier/registration/withdraw-file", { version: 1, versionId: "../etc" }))).status).toBe(400);
  });
});

const SHA = "a".repeat(64);

describe("sending the registration", () => {
  const DECLARATIONS = [
    { kind: "GIRO_AUTHORISATION", textVersionId: "text1234", textSha256: SHA, signatoryName: "Aini", signatoryDesignation: "Director", confirmed: true },
    { kind: "FALSE_DECLARATION", textVersionId: "text5678", textSha256: SHA, signatoryName: "Aini", signatoryDesignation: "Director", confirmed: true },
    { kind: "TERMS_AND_CONDITIONS", textVersionId: "text9012", textSha256: SHA, signatoryName: "Aini", signatoryDesignation: "Director", confirmed: true },
  ];
  /// The hash of the Personal Data Notice the page showed with the terms (ADR 0041 D4).
  const NOTICE_SHA = "b".repeat(64);
  const send = (over: Record<string, unknown> = {}) => submit(post("/supplier/registration/submit", { version: 5, password: "correct horse battery", declarations: DECLARATIONS, noticeSha256: NOTICE_SHA, ...over }));

  it("asks the password only for a registration that can be sent, and a wrong one sends nothing", async () => {
    h.registrationFaults.mockReturnValue([{ step: "documents", code: "DOCUMENT_REQUIRED", level: "block", field: "type.t1", data: { type: "Company certificate" } }]);
    const blocked = await send();
    expect([blocked.status, (await blocked.json()).code]).toEqual([422, "VALIDATION"]);
    expect(h.confirm).not.toHaveBeenCalled();
    h.registrationFaults.mockReturnValue([]);
    h.confirm.mockResolvedValue({ ok: false, kind: "FAILED" });
    const wrong = await send();
    expect([wrong.status, (await wrong.json()).code]).toEqual([403, "WRONG_PASSWORD"]);
    expect(h.submitRegistration).not.toHaveBeenCalled();
  });

  it("refuses while the account is locked or the address is held back, and while the sign-in settings are unset", async () => {
    h.confirm.mockResolvedValueOnce({ ok: false, kind: "LOCKED" });
    expect((await send()).status).toBe(403);
    h.confirm.mockResolvedValueOnce({ ok: false, kind: "THROTTLED" });
    expect((await send()).status).toBe(429);
    h.confirm.mockResolvedValueOnce({ ok: false, kind: "POLICY_NOT_SET" });
    expect((await send()).status).toBe(503);
    expect(h.submitRegistration).not.toHaveBeenCalled();
  });

  it("is refused as decided when it was already sent, before the password is asked", async () => {
    h.loadWizardState.mockResolvedValue("SENT");
    const res = await send();
    expect([res.status, (await res.json()).code]).toEqual([409, "DECIDED"]);
    h.loadWizardState.mockResolvedValue("WITH_OFFICE");
    expect((await send()).status).toBe(409);
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("refuses a notice hash that is not a SHA-256, before the password is asked (REG-4)", async () => {
    const res = await send({ noticeSha256: "not-a-hash" });
    expect(res.status).toBe(400);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.submitRegistration).not.toHaveBeenCalled();
  });

  it("is refused on a stale page, before the password is asked", async () => {
    const res = await send({ version: 4 });
    expect([res.status, (await res.json()).code]).toEqual([409, "STALE"]);
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("hands the store the declarations as sent, the version, and the moment the password was asked, never a day or a supplier from the body", async () => {
    const at = new Date("2026-10-12T03:04:05Z");
    h.confirm.mockResolvedValue({ ok: true, at });
    h.submitRegistration.mockResolvedValue({ sentOn: "2026-10-12", applicationId: "app1" });
    const res = await send({ sentOn: "2020-01-01", supplierId: "sup_other", signedAt: "2020-01-01T00:00:00Z" });
    expect(await res.json()).toEqual({ ok: true, sentOn: "2026-10-12" });
    expect(h.submitRegistration).toHaveBeenCalledWith(ACTOR, { version: 5, declarations: DECLARATIONS, noticeSha256: NOTICE_SHA, stepUpAt: at });
    // The rules judge the terms tick against the notice the page showed.
    expect(h.registrationFaults.mock.calls.at(-1)![3]).toBe(NOTICE_SHA);
    expect(JSON.stringify(h.submitRegistration.mock.calls[0])).not.toMatch(/sup_other|2020-01-01/);
    // The password was checked for the session's own account.
    expect(h.confirm.mock.calls[0]![0]).toBe(ACTOR);
  });

  it("answers a stale or forged text, or a signature the session cannot support, as a refusal and not as an error", async () => {
    h.confirm.mockResolvedValue({ ok: true, at: new Date() });
    h.submitRegistration.mockRejectedValueOnce(new DraftRefused("INVALID", [{ step: "review", code: "TEXT_NOT_SET", level: "block", field: "declaration" }]));
    expect((await send()).status).toBe(422);
    h.submitRegistration.mockRejectedValueOnce(new DraftRefused("STALE"));
    expect((await send()).status).toBe(409);
  });
});

describe("uploading a file", () => {
  const pdfUpload = (over: Record<string, string> = {}, o: Parameters<typeof uploadRequest>[1] = {}) => uploadRequest(multipart({ version: "5", documentId: "row_abcdefgh", ...over }, { name: "cert.pdf", type: "application/pdf", bytes: PDF }), o);
  const STORED = { versionId: "v1", rowId: "row_abcdefgh", label: "cert.pdf", byteSize: "60", scanState: "NOT_SCANNED", version: 6 };

  it("stores a good file as the type its bytes say, for the session's supplier, and answers Not scanned", async () => {
    h.storeSupplierUpload.mockResolvedValue(STORED);
    const res = await upload(pdfUpload({ supplierId: "sup_other" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, ...STORED });
    const [actor, input] = h.storeSupplierUpload.mock.calls[0]!;
    expect(actor).toBe(ACTOR);
    expect(input).toMatchObject({ version: 5, mediaType: "application/pdf", originalFilename: "cert.pdf", target: { kind: "document", documentId: "row_abcdefgh" }, sha256: sha256Hex(PDF) });
    expect(input.policy).toBe(SETTINGS.document);
    expect(JSON.stringify(Object.keys(input))).not.toContain("supplier");
  });

  it("takes the statement on the statement's own class, and a kind it does not know is refused", async () => {
    h.storeSupplierUpload.mockResolvedValue(STORED);
    await upload(uploadRequest(multipart({ version: "5" }, { name: "s.pdf", type: "application/pdf", bytes: PDF }), { query: "?kind=statement" }));
    expect(h.storeSupplierUpload.mock.calls[0]![1]).toMatchObject({ target: { kind: "statement" }, policy: SETTINGS.statement });
    const none = await upload(uploadRequest(multipart({ version: "5" }, { name: "s.pdf", type: "application/pdf", bytes: PDF }), { query: "" }));
    expect(none.status).toBe(400);
    expect((await upload(uploadRequest(multipart({ version: "5" }, { name: "s.pdf", type: "application/pdf", bytes: PDF }), { query: "?kind=other" }))).status).toBe(400);
  });

  it("refuses a program that is named a PDF, by what its bytes are, and logs the refusal", async () => {
    const res = await upload(uploadRequest(multipart({ version: "5" }, { name: "invoice.pdf", type: "application/pdf", bytes: EXE })));
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ ok: false, code: "REFUSED" });
    expect(h.storeSupplierUpload).not.toHaveBeenCalled();
    expect(h.logAccess).toHaveBeenCalledWith(expect.objectContaining({ kind: "REFUSED", reasonCode: "TYPE_NOT_ALLOWED", offeredFilename: "invoice.pdf", actor: expect.objectContaining({ supplierAccountId: "acc1" }) }));
  });

  it("refuses a PDF that is named something else, and a file that declares another type than its bytes", async () => {
    for (const [name, type] of [["cert.exe", "application/pdf"], ["cert.png", "application/pdf"], ["cert.pdf", "image/png"]] as const) {
      const res = await upload(uploadRequest(multipart({ version: "5" }, { name, type, bytes: PDF })));
      expect(res.status, `${name} ${type}`).toBe(415);
    }
    expect(h.storeSupplierUpload).not.toHaveBeenCalled();
  });

  it("refuses an empty file, and a request with no file", async () => {
    expect((await upload(uploadRequest(multipart({ version: "5" }, { name: "e.pdf", type: "application/pdf", bytes: new Uint8Array() })))).status).toBe(415);
    const none = await upload(uploadRequest(multipart({ version: "5" }, null)));
    expect([none.status, (await none.json()).code]).toEqual([400, "VALIDATION"]);
    expect(h.storeSupplierUpload).not.toHaveBeenCalled();
  });

  it("refuses a request that does not say how large it is, before it reads it", async () => {
    const res = await upload(pdfUpload({}, { length: null }));
    expect([res.status, (await res.json()).code]).toEqual([411, "NO_LENGTH"]);
    expect(h.storeSupplierUpload).not.toHaveBeenCalled();
  });

  it("refuses a request that states a size past the limit, and one that sends more than it states, cut off while it is read", async () => {
    const stated = await upload(pdfUpload({}, { length: String(1024 + 65_536 + 1) }));
    expect([stated.status, (await stated.json()).code]).toEqual([413, "TOO_LARGE"]);
    const big = multipart({ version: "5" }, { name: "big.pdf", type: "application/pdf", bytes: new Uint8Array(200_000).fill(0x41) });
    const lying = await upload(uploadRequest(big, { length: "1000" }));
    expect([lying.status, (await lying.json()).code]).toEqual([413, "TOO_LARGE"]);
    expect(h.storeSupplierUpload).not.toHaveBeenCalled();
    expect(h.logAccess).toHaveBeenCalledWith(expect.objectContaining({ kind: "REFUSED", reasonCode: "TOO_LARGE" }));
  });

  it("is closed, naming the setting, while a setting the upload needs is not set", async () => {
    h.loadUploadSettings.mockResolvedValue({ ...SETTINGS, document: { ...SETTINGS.document, classId: null } });
    const noClass = await upload(pdfUpload());
    expect(noClass.status).toBe(422);
    expect((await noClass.json()).message).toMatch(/document class/i);
    h.loadUploadSettings.mockResolvedValue({ ...SETTINGS, document: { ...SETTINGS.document, maxFiles: null } });
    expect((await upload(pdfUpload())).status).toBe(422);
    h.loadUploadSettings.mockResolvedValue({ ...SETTINGS, store: { allowedTypes: [], capBytes: null } });
    expect((await upload(pdfUpload())).status).toBe(422);
    h.loadUploadSettings.mockResolvedValue({ ...SETTINGS, statement: { ...SETTINGS.statement, classIsSulit: false } });
    expect((await upload(uploadRequest(multipart({ version: "5" }, { name: "s.pdf", type: "application/pdf", bytes: PDF }), { query: "?kind=statement" }))).status).toBe(422);
    expect(h.storeSupplierUpload).not.toHaveBeenCalled();
  });

  it("is closed while the document store is not set up", async () => {
    h.blobStore.mockReturnValue({ fault: "DRIVER_NOT_SET" });
    const res = await upload(pdfUpload());
    expect([res.status, (await res.json()).code]).toEqual([503, "CLOSED"]);
    expect(h.storeSupplierUpload).not.toHaveBeenCalled();
  });

  it("answers a stale page with 409, and the quota the store judged under the lock with its own status", async () => {
    h.storeSupplierUpload.mockRejectedValueOnce(new DraftRefused("STALE"));
    expect((await upload(pdfUpload())).status).toBe(409);
    h.storeSupplierUpload.mockRejectedValueOnce(new UploadRefusal({ code: "QUOTA_FILES", level: "block", data: { max: 3 } } as never, 422));
    const quota = await upload(pdfUpload());
    expect(quota.status).toBe(422);
    expect(h.logAccess).toHaveBeenCalledWith(expect.objectContaining({ kind: "REFUSED", reasonCode: "QUOTA_FILES" }));
  });

  it("answers the same whether or not the organisation already holds the same bytes", async () => {
    // The route hands the store the digest and takes whatever it makes: it has no branch on a copy already held, so a second upload of the same file is answered exactly as the first.
    h.storeSupplierUpload.mockResolvedValueOnce({ ...STORED, versionId: "v1" }).mockResolvedValueOnce({ ...STORED, versionId: "v2", version: 7 });
    const first = await upload(pdfUpload());
    const second = await upload(pdfUpload());
    expect(second.status).toBe(first.status);
    expect(Object.keys(await second.json()).sort()).toEqual(Object.keys(await first.json()).sort());
    expect(h.storeSupplierUpload.mock.calls[1]![1].sha256).toBe(h.storeSupplierUpload.mock.calls[0]![1].sha256);
  });
});

describe("opening a file and searching the codes", () => {
  const get = (url: string, headers: Record<string, string> = {}) => new Request(`http://portal.example${url}`, { headers: { "sec-fetch-site": "same-origin", "x-form-token": token(), ...headers } });
  const VERSION = { id: "ver_abcdefgh", sha256: sha256Hex(PDF), mediaType: "application/pdf", originalFilename: "cert.pdf", creditorProfileId: null };

  it("serves one of the supplier's own files as an attachment that is never opened inline, and logs it with the account", async () => {
    h.findOwnVersion.mockResolvedValue(VERSION);
    h.storeGet.mockResolvedValue(PDF);
    const res = await file(get("/supplier/registration/file?id=ver_abcdefgh"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(h.findOwnVersion).toHaveBeenCalledWith(expect.anything(), ACTOR, "ver_abcdefgh");
    expect(h.logAccess).toHaveBeenCalledWith(expect.objectContaining({ kind: "DOWNLOADED", versionId: "ver_abcdefgh", actor: expect.objectContaining({ supplierAccountId: "acc1" }) }));
    expect(h.writeSulitEvent).not.toHaveBeenCalled();
  });

  it("logs a bank statement's opening as the supplier's own reading of its creditor profile", async () => {
    h.findOwnVersion.mockResolvedValue({ ...VERSION, creditorProfileId: "cpr1" });
    h.storeGet.mockResolvedValue(PDF);
    await file(get("/supplier/registration/file?id=ver_abcdefgh"));
    expect(h.writeSulitEvent).toHaveBeenCalledTimes(1);
    expect(h.writeSulitEvent.mock.calls[0]![2]).toMatchObject({ scope: "creditorProfile", entityId: "cpr1", fields: ["documentBytes"], decision: { state: "GRANTED", basis: "OWN_RECORD" } });
  });

  it("answers another supplier's file, and one that does not exist, alike: not found, with nothing logged as served", async () => {
    h.findOwnVersion.mockResolvedValue(null);
    const other = await file(get("/supplier/registration/file?id=ver_abcdefgh"));
    expect(other.status).toBe(404);
    expect(await other.text()).toBe("No such file.");
    expect((await file(get("/supplier/registration/file?id=../../etc"))).status).toBe(404);
    expect(h.logAccess).not.toHaveBeenCalled();
    expect(h.storeGet).not.toHaveBeenCalled();
  });

  it("will not serve bytes that no longer match their fingerprint, and logs that", async () => {
    h.findOwnVersion.mockResolvedValue(VERSION);
    h.storeGet.mockResolvedValue(new TextEncoder().encode("tampered"));
    const res = await file(get("/supplier/registration/file?id=ver_abcdefgh"));
    expect(res.status).toBe(500);
    expect(h.logAccess).toHaveBeenCalledWith(expect.objectContaining({ kind: "INTEGRITY_FAILED", reasonCode: "DIGEST_MISMATCH" }));
  });

  it("the code search refuses a request that does not say which list to search", async () => {
    const res = await values(get("/supplier/registration/values"));
    expect([res.status, (await res.json()).code]).toEqual([400, "VALIDATION"]);
  });
});
