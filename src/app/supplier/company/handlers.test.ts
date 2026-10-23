import { beforeEach, describe, expect, it, vi } from "vitest";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * The Company workspace's two route handlers (Phase 4c), end to end through a bare `Request`: the guards in front of each (the public copy, the Origin guard, the signed form token for THIS
 * workspace, who is signed in), the settings and the body bound (an unset setting refuses and names itself, a body of no stated size or past the bound is cut off, a program renamed to a
 * `.pdf` is refused by its own bytes), what each hands the stores (the session's supplier, never one the form names), and what each answers (words, never a rule's code). The stores are
 * stand-ins; what they are asked is recorded. The database half (the locked rows, the quota, the two that arrive together, the signed change) is `company.db.test.ts`.
 */

const h = vi.hoisted(() => ({
  readSession: vi.fn(),
  confirm: vi.fn(),
  storeReplacement: vi.fn(),
  sendBankChange: vi.fn(),
  judge: vi.fn(),
  loadUploadSettings: vi.fn(),
  loadRegistrationSettings: vi.fn(),
  documentOrg: vi.fn(),
  logAccess: vi.fn(),
  blobStore: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", () => ({ readSupplierSession: h.readSession, signOutSupplierToken: vi.fn() }));
vi.mock("@/lib/auth/supplier-identity", () => ({ confirmSupplierPassword: h.confirm }));
vi.mock("@/lib/portal/company/replace-store", () => ({ storeReplacement: h.storeReplacement, waitingUsage: vi.fn() }));
vi.mock("@/lib/portal/company/bank-store", () => ({ sendBankChange: h.sendBankChange, judge: h.judge }));
vi.mock("@/lib/portal/registration/context-store", async (orig) => ({ ...(await orig<typeof import("@/lib/portal/registration/context-store")>()), loadRegistrationSettings: h.loadRegistrationSettings }));
vi.mock("@/lib/portal/registration/upload-settings", () => ({ loadUploadSettings: h.loadUploadSettings }));
vi.mock("@/lib/documents/service", async (orig) => ({ ...(await orig<typeof import("@/lib/documents/service")>()), documentOrg: h.documentOrg, logAccess: h.logAccess }));
vi.mock("@/lib/documents/store", async (orig) => ({ ...(await orig<typeof import("@/lib/documents/store")>()), blobStore: h.blobStore }));

import { AttributionRefused } from "@/lib/auth/attribution-store";
import { FORM_SECRET_MIN_LENGTH, signFormToken, type FormPurpose } from "@/lib/auth/form-token";
import type { SupplierActor } from "@/lib/auth/types";
import { UploadRefusal } from "@/lib/documents/service";
import { CompanyRefused } from "@/lib/portal/company/errors";
import { CREDITOR_FIELDS } from "@/lib/portal/registration/types";

import { POST as bank } from "./bank/route";
import { POST as document } from "./document/route";

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
const token = (purpose: FormPurpose = "company") => signFormToken(KEY, purpose, new Date());

const BOUNDARY = "----companytest";
function multipart(fields: Record<string, string | string[]>, f: { name: string; type: string; bytes: Uint8Array } | null): Buffer {
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) parts.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${one}\r\n`));
  if (f) parts.push(Buffer.concat([Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`), Buffer.from(f.bytes), Buffer.from("\r\n")]));
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(parts);
}
function request(path: string, body: Buffer | null, o: { headers?: Record<string, string>; token?: string | null; length?: string | null } = {}) {
  const t = o.token !== undefined ? o.token : token();
  const headers: Record<string, string> = { "content-type": `multipart/form-data; boundary=${BOUNDARY}`, ...SAME_ORIGIN, ...(t ? { "x-form-token": t } : {}), ...o.headers };
  if (o.length !== null && body) headers["content-length"] = o.length ?? String(body.length);
  return new Request(`http://portal.example${path}`, { method: "POST", body: body ? new Uint8Array(body) : null, headers });
}

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n");
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00]);
const SETTINGS = {
  store: { allowedTypes: ["application/pdf"], capBytes: 1024n },
  document: { classId: "cls1", maxFiles: 3, maxBytes: 5000n },
  statement: { classId: "cls2", classIsSulit: true, maxFiles: 3, maxBytes: 5000n },
};
const DOC_FIELDS = { target: "renew", targetId: "doc_abcdefgh", reference: "R-2", issuingAuthority: "Board", expiresOn: "2028-06-30" };
const docBody = (extra: Record<string, string | string[]> = {}) => multipart({ ...DOC_FIELDS, ...extra }, { name: "cert.pdf", type: "application/pdf", bytes: PDF });
const send = (extra: Record<string, string | string[]> = {}, o: Parameters<typeof request>[2] = {}) => document(request("/supplier/company/document", docBody(extra), o));

const BANK_FIELDS: Record<string, string> = {
  ...Object.fromEntries(CREDITOR_FIELDS.map((k) => [k, `value of ${k}`])),
  giroTextVersionId: "text_abcdefgh",
  giroTextSha256: "a".repeat(64),
  signatoryName: "Aini",
  signatoryDesignation: "Director",
  giroConfirmed: "true",
  password: "correct horse battery",
};
const bankBody = (extra: Record<string, string> = {}) => multipart({ ...BANK_FIELDS, ...extra }, { name: "statement.pdf", type: "application/pdf", bytes: PDF });
const change = (extra: Record<string, string> = {}, o: Parameters<typeof request>[2] = {}) => bank(request("/supplier/company/bank", bankBody(extra), o));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  for (const f of Object.values(h)) f.mockReset();
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
  h.documentOrg.mockResolvedValue({ id: "o1" });
  h.blobStore.mockReturnValue({ store: {} });
  h.loadRegistrationSettings.mockResolvedValue({ org: { id: "o1" }, policy: {} });
  h.loadUploadSettings.mockResolvedValue(SETTINGS);
  h.logAccess.mockResolvedValue(undefined);
  h.judge.mockResolvedValue([]);
  h.storeReplacement.mockResolvedValue({ documentId: "doc_new", label: "Works board certificate", byteSize: "49", scanState: "NOT_SCANNED", warnings: [] });
  h.sendBankChange.mockResolvedValue({ profileId: "cp2", version: 2, sentOn: "2026-10-09" });
  h.confirm.mockResolvedValue({ ok: true, at: new Date("2026-10-09T01:00:00Z") });
});

const DOORS: [string, (r: Request) => Promise<Response>, string, () => Buffer][] = [
  ["document", document, "/supplier/company/document", () => docBody()],
  ["bank", bank, "/supplier/company/bank", () => bankBody()],
];

describe("what both posts must pass before a byte of the body is read", () => {
  it.each(DOORS)("%s: is not found on the staff copy, where nobody is a supplier", async (_n, handler, url, body) => {
    vi.stubEnv("PORTAL_SURFACE", "");
    const res = await handler(request(url, body()));
    expect([res.status, (await res.json()).code]).toEqual([404, "NOT_FOUND"]);
    expect(h.readSession).not.toHaveBeenCalled();
  });

  it.each(DOORS)("%s: refuses another site, a post with no origin, a foreign origin, and a body that is not multipart", async (_n, handler, url, body) => {
    const cross = await handler(request(url, body(), { headers: { "sec-fetch-site": "cross-site" } }));
    expect([cross.status, (await cross.json()).code]).toEqual([403, "CROSS_SITE"]);
    expect((await handler(request(url, body(), { headers: { "sec-fetch-site": "", origin: "" } }))).status).toBe(403);
    const foreign = await handler(request(url, body(), { headers: { origin: "http://evil.example" } }));
    expect([foreign.status, (await foreign.json()).code]).toEqual([403, "WRONG_ORIGIN"]);
    const json = await handler(request(url, body(), { headers: { "content-type": "application/json" } }));
    expect([json.status, (await json.json()).code]).toEqual([415, "WRONG_CONTENT_TYPE"]);
    expect(h.readSession).not.toHaveBeenCalled();
    expect(h.loadUploadSettings).not.toHaveBeenCalled();
  });

  it.each(DOORS)("%s: refuses a form with no token, a token for another form (the registration's is not this one's), a forged one and an old one", async (_n, handler, url, body) => {
    const tokens = [null, token("registration"), token("sign-in"), signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), "company", new Date()), signFormToken(KEY, "company", new Date(Date.now() - 25 * 60 * 60 * 1000))];
    for (const t of tokens) {
      const res = await handler(request(url, body(), { token: t }));
      expect([res.status, (await res.json()).code]).toEqual([400, "FORM_EXPIRED"]);
    }
    expect(h.readSession).not.toHaveBeenCalled();
  });

  it.each(DOORS)("%s: tells nobody signed in so, and reads no setting and does nothing", async (_n, handler, url, body) => {
    h.readSession.mockResolvedValue({ ok: false, reason: "UNKNOWN" });
    const res = await handler(request(url, body()));
    expect([res.status, (await res.json()).code]).toEqual([401, "NOT_SIGNED_IN"]);
    expect(h.loadUploadSettings).not.toHaveBeenCalled();
    expect(h.storeReplacement).not.toHaveBeenCalled();
    expect(h.sendBankChange).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
  });
});

describe("the settings and the body, judged before the file is read", () => {
  it.each(DOORS)("%s: an upload with no stated length is refused, and so is one past the cap or that states less than it sends", async (_n, handler, url, body) => {
    expect((await handler(request(url, body(), { length: null }))).status).toBe(411);
    expect((await handler(request(url, body(), { length: "999999" }))).status).toBe(413);
    const lying = multipart({ ...DOC_FIELDS, padding: "x".repeat(200 * 1024) }, { name: "a.pdf", type: "application/pdf", bytes: PDF });
    expect((await handler(request(url, lying, { length: "100" }))).status).toBe(413);
    expect(h.storeReplacement).not.toHaveBeenCalled();
    expect(h.sendBankChange).not.toHaveBeenCalled();
  });

  it("an unset setting refuses the upload and names itself, and logs the refusal", async () => {
    h.loadUploadSettings.mockResolvedValue({ ...SETTINGS, document: { ...SETTINGS.document, maxFiles: null } });
    const quota = await send();
    expect([quota.status, (await quota.json()).message]).toEqual([422, expect.stringMatching(/has not set how many files/)]);
    h.loadUploadSettings.mockResolvedValue({ ...SETTINGS, document: { ...SETTINGS.document, classId: null } });
    expect((await (await send()).json()).message).toMatch(/document class/);
    h.loadUploadSettings.mockResolvedValue({ ...SETTINGS, store: { allowedTypes: [], capBytes: null } });
    expect((await (await send()).json()).message).toMatch(/which kinds of file/);
    h.loadUploadSettings.mockResolvedValue({ ...SETTINGS, statement: { ...SETTINGS.statement, classIsSulit: false } });
    expect((await (await change()).json()).message).toMatch(/SULIT/);
    expect(h.logAccess).toHaveBeenCalled();
    expect(h.storeReplacement).not.toHaveBeenCalled();
    expect(h.sendBankChange).not.toHaveBeenCalled();
  });

  it("a program renamed to a .pdf is refused by its own bytes, and a file named for a program is refused too", async () => {
    const renamed = await document(request("/supplier/company/document", multipart(DOC_FIELDS, { name: "cert.pdf", type: "application/pdf", bytes: EXE }), {}));
    expect(renamed.status).toBe(415);
    const named = await document(request("/supplier/company/document", multipart(DOC_FIELDS, { name: "cert.exe", type: "application/pdf", bytes: PDF }), {}));
    expect(named.status).toBe(415);
    expect((await named.json()).message).toMatch(/kind of file is not accepted/);
    expect(h.storeReplacement).not.toHaveBeenCalled();
  });
});

describe("a document", () => {
  it("is stored for the session's supplier, and a supplier, organisation, day or time named in the form is not read", async () => {
    const res = await send({ supplierId: "sup_other", organisationId: "o2", accountId: "acc9", lodgedOn: "2020-01-01", recordedAt: "2020-01-01", valueIds: ["val_abcdefgh", "../etc"] });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, scanState: "NOT_SCANNED" });
    const [actor, input] = h.storeReplacement.mock.calls[0]!;
    expect(actor).toBe(ACTOR);
    expect(input.target).toEqual({ kind: "renew", documentId: "doc_abcdefgh" });
    expect(input.details).toEqual({ reference: "R-2", issuingAuthority: "Board", expiresOn: "2028-06-30", ratePercent: "", title: "", valueIds: ["val_abcdefgh"] });
    expect(JSON.stringify(input.details)).not.toMatch(/sup_other|acc9|"o2"|2020-01-01/);
  });

  it("says which document it is for, by a kind and a well-formed id", async () => {
    for (const bad of [{ target: "", targetId: "" }, { target: "everything", targetId: "doc_abcdefgh" }, { target: "renew", targetId: "../../x" }, { target: "item", targetId: "a" }]) {
      expect((await send(bad)).status).toBe(400);
    }
    expect(h.storeReplacement).not.toHaveBeenCalled();
  });

  it("answers what the rules refused in words, and never a rule's code; another supplier's document is simply not found", async () => {
    h.storeReplacement.mockRejectedValueOnce(new CompanyRefused([{ code: "RENEWAL_NOT_LATER", level: "block", field: "expiresOn", data: { type: "Form 9", expiresOn: "2027-01-01" } }]));
    const refused = await send();
    expect(refused.status).toBe(422);
    const body = await refused.json();
    expect(body).toMatchObject({ ok: false, code: "VALIDATION", faults: [{ field: "expiresOn", level: "block" }] });
    expect(JSON.stringify(body)).not.toContain("RENEWAL_NOT_LATER");
    expect(body.message).toMatch(/must expire after the one it replaces/);
    h.storeReplacement.mockRejectedValueOnce(new CompanyRefused([{ code: "RENEWS_NOTHING", level: "block" }], 404));
    const missing = await send();
    expect([missing.status, (await missing.json()).code]).toEqual([404, "NOT_FOUND"]);
  });

  it("answers the store's own refusal (the quota is full) in the portal's words", async () => {
    h.storeReplacement.mockRejectedValueOnce(new UploadRefusal({ code: "QUOTA_FILES", level: "block", data: { max: 3 } }, 422));
    const res = await send();
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/already holds as many files as it may \(3\)/);
  });

  it("gives the same reply whether or not the organisation already holds the same bytes (threat model C-6)", async () => {
    const first = await (await send()).json();
    h.storeReplacement.mockResolvedValueOnce({ documentId: "doc_other", label: "Works board certificate", byteSize: "49", scanState: "NOT_SCANNED", warnings: [] });
    const again = await (await send()).json();
    expect(Object.keys(again).sort()).toEqual(Object.keys(first).sort());
    expect(again.scanState).toBe(first.scanState);
  });

  it("does not hold the upload slot after it answers", async () => {
    h.storeReplacement.mockRejectedValueOnce(new Error("the store fell over"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await send();
    expect(failed.status).toBe(500);
    // The log holds the kind of failure, never its message (a database error prints its arguments, bank details among them).
    expect(JSON.stringify(log.mock.calls)).not.toContain("the store fell over");
    log.mockRestore();
    expect((await send()).status).toBe(201);
  });
});

describe("a change of bank details", () => {
  it("is judged before the password is asked, so a wrong password is never counted for a change that could not be sent", async () => {
    h.judge.mockResolvedValue([{ code: "CHANGE_WAITING", level: "block", data: { version: 2 } }]);
    const res = await change();
    expect([res.status, (await res.json()).code]).toEqual([422, "VALIDATION"]);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.sendBankChange).not.toHaveBeenCalled();
  });

  it("asks the password, and a wrong one, a locked account and a throttled address send nothing", async () => {
    for (const [kind, status] of [["FAILED", 403], ["LOCKED", 403], ["THROTTLED", 429], ["POLICY_NOT_SET", 503]] as const) {
      h.confirm.mockResolvedValueOnce({ ok: false, kind });
      const res = await change();
      expect(res.status, kind).toBe(status);
    }
    expect(h.sendBankChange).not.toHaveBeenCalled();
    expect(h.confirm).toHaveBeenCalledWith(ACTOR, "correct horse battery", expect.anything());
  });

  it("sends for the session's supplier with the stamp of the password just asked, and the password reaches no store", async () => {
    const res = await change({ supplierId: "sup_other", signedOn: "2020-01-01" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, version: 2, sentOn: "2026-10-09" });
    const [actor, input] = h.sendBankChange.mock.calls[0]!;
    expect(actor).toBe(ACTOR);
    expect(input.stepUpAt).toEqual(new Date("2026-10-09T01:00:00Z"));
    expect(input.change.giro).toEqual({ textVersionId: "text_abcdefgh", textSha256: "a".repeat(64), signatoryName: "Aini", signatoryDesignation: "Director", confirmed: true });
    expect(input.change.creditor.bankAccountNo).toBe("value of bankAccountNo");
    expect(JSON.stringify(input.change)).not.toMatch(/correct horse battery|sup_other|2020-01-01/);
    // The judgement before the password was asked was told the password was given, and was not given it.
    expect(h.judge.mock.calls[0]![3]).toBe(true);
    expect(JSON.stringify(h.judge.mock.calls[0]!.slice(1, 3))).not.toContain("correct horse battery");
  });

  it("with no password in the form the change is refused in words and the password is never asked", async () => {
    h.judge.mockImplementation(async (_tx: unknown, _a: unknown, _c: unknown, given: boolean) => (given ? [] : [{ code: "PASSWORD_REQUIRED", level: "block", field: "password" }]));
    const res = await change({ password: "" });
    expect(res.status).toBe(422);
    expect((await res.json()).faults[0]).toMatchObject({ field: "password" });
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("answers what the locked rows refused in words, the store's refusal, and a signature refused, and writes the bank values to no answer", async () => {
    h.sendBankChange.mockRejectedValueOnce(new CompanyRefused([{ code: "TEXT_STALE", level: "block", field: "giro" }]));
    const stale = await change();
    expect(stale.status).toBe(422);
    const body = await stale.json();
    expect(JSON.stringify(body)).not.toMatch(/TEXT_STALE|value of bankAccountNo/);
    expect(body.message).toMatch(/wording has been changed/);
    h.sendBankChange.mockRejectedValueOnce(new UploadRefusal({ code: "STATEMENT_CLASS_NOT_SULIT", level: "block", data: {} }, 422));
    expect((await (await change()).json()).message).toMatch(/not classified SULIT/);
    h.sendBankChange.mockRejectedValueOnce(new AttributionRefused([{ code: "STEP_UP_STALE", en: "Enter your password again to sign this." }]));
    const signature = await change();
    expect([signature.status, (await signature.json()).code]).toEqual([403, "SIGNATURE_REFUSED"]);
  });
});
