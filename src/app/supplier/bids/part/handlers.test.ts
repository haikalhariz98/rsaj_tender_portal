import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * The bid part's upload and discard routes (SR-13, ADR 0036 D5, D6; build plan step 9), end to end through a bare `Request`: the guards in front, each refusal, the scan
 * (a scanner that fails refuses in both modes), a slow body, another supplier's exercise, the supplier's one place, the 20w rate rule, and that the bytes handed to the store
 * hold nothing of the plain file. The exercise's facts are stood in for (`loadUploadFacts` is the database's, tested in `upload-store.db.test.ts`); the sealing, the store's
 * transaction and the audit row run for real against a recording stand-in for the transaction.
 */

const h = vi.hoisted(() => ({
  readSession: vi.fn(),
  countAndJudge: vi.fn(),
  loadFacts: vi.fn(),
  refusal: vi.fn(),
  discard: vi.fn(),
  put: vi.fn(),
  scan: vi.fn(),
  scannerConfigured: { value: true },
  created: [] as unknown[],
  audits: [] as unknown[],
  events: [] as unknown[],
  txs: 0,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", () => ({ readSupplierSession: h.readSession, signOutSupplierToken: vi.fn() }));
vi.mock("@/lib/portal/bids/rate-store", () => ({ countAndJudgeCounted: h.countAndJudge }));
vi.mock("@/lib/db", () => {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    exerciseSealingKey: { findFirst: vi.fn(async () => ({ id: "key_0000001" })) },
    onlineBidFile: { count: vi.fn(async () => 0), create: vi.fn(async (a: unknown) => { h.created.push(a); return {}; }) },
    auditEntry: { create: vi.fn(async (a: unknown) => { h.audits.push(a); return {}; }) },
    sealedAccessEvent: { create: vi.fn(async (a: unknown) => { h.events.push(a); return {}; }) },
  };
  return { db: { $transaction: async (fn: (t: typeof tx) => unknown) => { h.txs += 1; return fn(tx); } } };
});
vi.mock("@/lib/bids/online/upload-store", async (orig) => ({ ...(await orig<typeof import("@/lib/bids/online/upload-store")>()), loadUploadFacts: h.loadFacts, logPartRefusal: h.refusal, discardPart: h.discard }));
vi.mock("@/lib/documents/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/documents/store")>()),
  blobStore: () => ({ store: { driver: "postgres", transactional: true, put: h.put, get: vi.fn() } }),
  deploymentCeiling: () => ({ ceiling: 10_000_000n }),
  malwareScanner: () => ({ configured: h.scannerConfigured.value, scan: h.scan }),
}));

import { FORM_SECRET_MIN_LENGTH, signFormToken, type FormPurpose } from "@/lib/auth/form-token";
import type { SupplierActor } from "@/lib/auth/types";
import { generateX25519 } from "@/lib/sealing/x25519";
import { unpackHpke } from "@/lib/sealing/hpke";
import { hpkeOpen, gcmOpen } from "@/lib/sealing/open";
import { fileBodyAad, fileDekAad } from "@/lib/sealing/file-seal";
import { tryBeginBidUpload } from "@/lib/bids/online/upload-gate";
import { RATE_LIMITS } from "@/lib/portal/bids/limits";
import type { UploadFacts } from "@/lib/bids/online/upload-store";
import type { BidPartRule } from "@/lib/bids/online/types";

import { POST as discard } from "./discard/route";
import { POST as upload } from "./route";

const KEY = "s".repeat(FORM_SECRET_MIN_LENGTH);
const SAME_ORIGIN = { "sec-fetch-site": "same-origin", origin: "http://portal.example", host: "portal.example" };
const ACTOR: SupplierActor = {
  kind: "SUPPLIER", accountId: "acc1", sessionId: "ses1", contactId: "c1", displayName: "Aini", supplierId: "sup_mine", supplierName: "Sampel Works", loginName: "aini",
  organisationId: "o1", organisationTimeZone: "Asia/Kuala_Lumpur", stepUpAt: null, sessionCreatedAt: new Date("2026-10-12T00:00:00Z"), sourceAddress: null, mustChangePassword: false, resetNoticePending: false,
};
const token = (purpose: FormPurpose = "bids") => signFormToken(KEY, purpose, new Date());
const EX = "exercise_0001";
const PART = "part_00000001";
const PDF = "application/pdf";
const RULE: BidPartRule = { packPartId: PART, label: "Form of Tender", mandatory: true, returnedByBidder: true, acceptedMediaTypes: [PDF], maxBytes: "100000", openingCheck: true };
const pair = generateX25519();
const PLAIN = Buffer.from("%PDF-1.7\nTHE-PLAIN-MARKER-OF-THIS-BID-FILE\n");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const facts = (over: Partial<UploadFacts> = {}): UploadFacts => ({
  organisationId: "o1", exerciseId: EX, reference: "EX/2026/1", channel: "ONLINE", mode: "LIVE", demonstration: false, gate: [],
  key: { id: "key_0000001", publicKey: pair.publicKey, fingerprint: "f".repeat(64) }, rule: RULE, draftFiles: 0, ...over,
});

interface Over { headers?: Record<string, string>; token?: string | null; query?: string; fields?: Record<string, string>; file?: Uint8Array; name?: string; sha?: string; body?: BodyInit; noLength?: boolean }
function uploadRequest(o: Over = {}) {
  const form = new FormData();
  const bytes = o.file ?? PLAIN;
  form.append("contentSha256", o.sha ?? sha(bytes));
  for (const [k, v] of Object.entries(o.fields ?? {})) form.append(k, v);
  form.append("file", new File([bytes as BlobPart], o.name ?? "tender.pdf", { type: PDF }));
  const t = o.token !== undefined ? o.token : token();
  const req = new Request(`http://portal.example/supplier/bids/part?${o.query ?? `exerciseId=${EX}&packPartId=${PART}`}`, {
    method: "POST",
    body: o.body ?? form,
    headers: { ...SAME_ORIGIN, ...(t ? { "x-form-token": t } : {}), ...o.headers },
  });
  return req;
}
/// A Request with the multipart body and the length it states, which a `Request` built from a FormData does not set.
async function sized(o: Over = {}) {
  const req = uploadRequest(o);
  const buf = new Uint8Array(await req.clone().arrayBuffer());
  const headers = new Headers(req.headers);
  if (!o.noLength) headers.set("content-length", String(buf.byteLength));
  return new Request(req.url, { method: "POST", body: buf, headers });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  for (const f of [h.readSession, h.countAndJudge, h.loadFacts, h.refusal, h.discard, h.put, h.scan]) f.mockReset();
  h.created.length = 0;
  h.audits.length = 0;
  h.events.length = 0;
  h.txs = 0;
  h.scannerConfigured.value = true;
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
  h.countAndJudge.mockResolvedValue({ limited: false, count: 1 });
  h.loadFacts.mockResolvedValue(facts());
  h.scan.mockResolvedValue("CLEAN");
});

describe("the guards, before anything is read", () => {
  it("is not found on the staff copy", async () => {
    vi.stubEnv("PORTAL_SURFACE", "");
    const res = await upload(await sized());
    expect([res.status, (await res.json()).code]).toEqual([404, "NOT_FOUND"]);
    expect(h.readSession).not.toHaveBeenCalled();
  });
  it("refuses another site and a body that is not multipart", async () => {
    expect((await upload(await sized({ headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    const json = new Request("http://portal.example/supplier/bids/part", { method: "POST", body: "{}", headers: { ...SAME_ORIGIN, "content-type": "application/json", "x-form-token": token() } });
    expect((await upload(json)).status).toBe(415);
    expect(h.readSession).not.toHaveBeenCalled();
  });
  it("refuses a missing token, another form's token, and nobody signed in", async () => {
    for (const t of [null, token("registration")]) expect((await upload(await sized({ token: t }))).status).toBe(400);
    h.readSession.mockResolvedValue({ ok: false });
    expect((await upload(await sized())).status).toBe(401);
    expect(h.loadFacts).not.toHaveBeenCalled();
    expect(h.put).not.toHaveBeenCalled();
  });
  it("writes no access event for a request before the session check", async () => {
    await upload(await sized({ token: null }));
    expect(h.refusal).not.toHaveBeenCalled();
    expect(h.events).toEqual([]);
  });
});

describe("the happy path", () => {
  it("seals the part, stores only ciphertext, and answers with ids and digests", async () => {
    const res = await upload(await sized());
    const body = await res.json();
    expect([res.status, body.ok, body.plainSha256, body.plainBytes, body.scan, body.packPartId]).toEqual([201, true, sha(PLAIN), PLAIN.length, "CLEAN", PART]);
    expect(h.put).toHaveBeenCalledTimes(1);
    // Nothing plain reaches the store, and what does is addressed by its own digest.
    const [, org, address, cipher] = h.put.mock.calls[0] as [unknown, string, string, Uint8Array];
    expect(org).toBe("o1");
    expect(address).toBe(sha(cipher));
    expect(Buffer.from(cipher).includes(Buffer.from("THE-PLAIN-MARKER"))).toBe(false);
    expect(Buffer.from(cipher).includes(Buffer.from("%PDF"))).toBe(false);
    // The row holds three ciphertexts and no filename; the key opens them.
    const row = (h.created[0] as { data: Record<string, unknown> }).data;
    expect(row.state).toBe("DRAFT");
    expect(row.scan).toBe("CLEAN");
    expect(JSON.stringify(row, (_k, v) => (typeof v === "bigint" ? String(v) : v))).not.toContain("tender.pdf");
    const ctx = { organisationId: "o1", exerciseId: EX, keyId: "key_0000001", fileId: row.id as string, packPartId: PART };
    const dek = hpkeOpen(pair.privateKey, unpackHpke(row.sealedDek as Uint8Array), fileDekAad(ctx));
    const plain = gcmOpen(dek, { iv: row.bodyIv as Uint8Array, ct: cipher.slice(0, cipher.length - 16), tag: cipher.slice(cipher.length - 16) }, fileBodyAad(ctx));
    expect(Buffer.from(plain).equals(PLAIN)).toBe(true);
    // The audit row and the access event name ids and the digest, never the file's name.
    expect(JSON.stringify(h.audits)).not.toContain("tender.pdf");
    expect(JSON.stringify(h.audits)).not.toContain("THE-PLAIN-MARKER");
    expect(h.audits).toHaveLength(1);
    expect(h.events).toHaveLength(1);
    expect((h.events[0] as { data: Record<string, unknown> }).data).toMatchObject({ kind: "PART_UPLOAD", outcome: "GRANTED", supplierAccountId: "acc1", recordId: row.id });
  });
  it("takes a DEMONSTRATION exercise's file with no scanner configured, as NOT_SCANNED", async () => {
    h.scannerConfigured.value = false;
    h.scan.mockResolvedValue("NOT_SCANNED");
    h.loadFacts.mockResolvedValue(facts({ mode: "DEMONSTRATION", demonstration: true }));
    const res = await upload(await sized());
    expect([res.status, (await res.json()).scan]).toEqual([201, "NOT_SCANNED"]);
  });
});

describe("each refusal says so in words and stores nothing", () => {
  const refused = async (res: Response, status: number, code: string) => {
    const body = await res.json();
    expect([res.status, body.code]).toEqual([status, code]);
    expect(body.message).toBeTruthy();
    expect(h.put).not.toHaveBeenCalled();
    expect(h.created).toEqual([]);
  };
  it("another supplier's or an unknown exercise is 404, and writes no event", async () => {
    h.loadFacts.mockResolvedValue(null);
    await refused(await upload(await sized()), 404, "NOT_FOUND");
    expect(h.refusal).not.toHaveBeenCalled();
  });
  it("a door that is shut", async () => {
    h.loadFacts.mockResolvedValue(facts({ gate: ["NO_LIVE_SALE"] }));
    await refused(await upload(await sized()), 422, "NO_LIVE_SALE");
    expect(h.refusal).toHaveBeenCalledWith(expect.anything(), EX, "PART_UPLOAD", "NO_LIVE_SALE");
  });
  it("a part the pack does not return", async () => {
    h.loadFacts.mockResolvedValue(facts({ rule: null }));
    await refused(await upload(await sized()), 422, "PART_UNKNOWN");
  });
  it("a body with no stated length is 411", async () => {
    await refused(await upload(await sized({ noLength: true })), 411, "NO_LENGTH");
  });
  it("a stated length past the part's limit is 413", async () => {
    h.loadFacts.mockResolvedValue(facts({ rule: { ...RULE, maxBytes: "10" } }));
    const req = await sized();
    await refused(await upload(new Request(req.url, { method: "POST", headers: new Headers({ ...Object.fromEntries(req.headers), "content-length": String(10 + 64 * 1024 + 1) }), body: await req.arrayBuffer() })), 413, "TOO_LARGE");
  });
  it("a file over the part's limit is 413", async () => {
    h.loadFacts.mockResolvedValue(facts({ rule: { ...RULE, maxBytes: "10" } }));
    await refused(await upload(await sized()), 413, "TOO_LARGE");
  });
  it("a type the bytes do not say is refused whatever the name", async () => {
    await refused(await upload(await sized({ file: Buffer.from("MZ not a pdf at all"), name: "tender.pdf" })), 422, "TYPE_NOT_ACCEPTED");
  });
  it("a hash the browser did not compute of these bytes", async () => {
    await refused(await upload(await sized({ sha: "0".repeat(64) })), 422, "HASH_MISMATCH");
  });
  it("a threat", async () => {
    h.scan.mockResolvedValue("THREAT");
    await refused(await upload(await sized()), 422, "THREAT");
  });
  it.each(["LIVE", "DEMONSTRATION"] as const)("a scanner that throws is ERROR and refuses under %s", async (mode) => {
    h.scan.mockRejectedValue(new Error("scanner down"));
    h.loadFacts.mockResolvedValue(facts({ mode, demonstration: mode === "DEMONSTRATION" }));
    await refused(await upload(await sized()), 422, "SCAN_ERROR");
  });
  it.each(["LIVE", "DEMONSTRATION"] as const)("a scanner that answers ERROR refuses under %s", async (mode) => {
    h.scan.mockResolvedValue("ERROR");
    h.loadFacts.mockResolvedValue(facts({ mode, demonstration: mode === "DEMONSTRATION" }));
    await refused(await upload(await sized()), 422, "SCAN_ERROR");
  });
  it("a file that was not scanned is refused under LIVE", async () => {
    h.scannerConfigured.value = false;
    h.scan.mockResolvedValue("NOT_SCANNED");
    await refused(await upload(await sized()), 422, "SCAN_ERROR");
  });
  it("a form with an unknown field, and ids that disagree with the query", async () => {
    await refused(await upload(await sized({ fields: { extra: "1" } })), 400, "UNREADABLE");
    await refused(await upload(await sized({ fields: { exerciseId: "someone_else_1" } })), 400, "FIELDS_DISAGREE");
    await refused(await upload(await sized({ query: "exerciseId=x" })), 400, "FIELDS_DISAGREE");
  });
  it("a key re-made between the read and the write is said as the rule, with nothing stored", async () => {
    h.loadFacts.mockResolvedValue(facts({ key: { id: "key_0000000", publicKey: pair.publicKey, fingerprint: "f".repeat(64) } }));
    await refused(await upload(await sized()), 409, "KEY_NOT_LIVE"); // 409, as PartRefused says (review of stage B): a conflict, not a malformed part
  });
});

describe("a slow body", () => {
  it("is cut off at the deadline and answers 408 with nothing stored", async () => {
    vi.useFakeTimers();
    try {
      const slow = new ReadableStream<Uint8Array>({ start() { /* never sends */ } });
      const req = new Request(`http://portal.example/supplier/bids/part?exerciseId=${EX}&packPartId=${PART}`, {
        method: "POST",
        body: slow,
        // @ts-expect-error duplex is required for a streamed request body
        duplex: "half",
        headers: { ...SAME_ORIGIN, "x-form-token": token(), "content-type": "multipart/form-data; boundary=x", "content-length": "5000" },
      });
      const pending = upload(req);
      await vi.advanceTimersByTimeAsync(301_000);
      const res = await pending;
      expect([res.status, (await res.json()).code]).toEqual([408, "BODY_TOO_SLOW"]);
      expect(h.put).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the supplier's one place", () => {
  it("a second upload while the first is in flight answers BUSY, and a different supplier is not held", async () => {
    const held = tryBeginBidUpload("o1", "sup_mine");
    expect(held).not.toBeNull();
    try {
      const res = await upload(await sized());
      const body = await res.json();
      expect([res.status, body.code, res.headers.get("retry-after")]).toEqual([503, "BUSY", "5"]);
      expect(h.loadFacts).not.toHaveBeenCalled();
      const other = tryBeginBidUpload("o1", "sup_other");
      expect(other).not.toBeNull();
      other!();
    } finally {
      held!();
    }
    expect((await upload(await sized())).status).toBe(201);
  });
});

describe("the rate limit (20w)", () => {
  it("refuses over the limit with 429 and writes exactly one event in the window", async () => {
    const { limit } = RATE_LIMITS["bid-part-upload"];
    for (let count = limit + 1; count <= limit + 10; count++) {
      h.countAndJudge.mockResolvedValue({ limited: true, retryAfterSeconds: 30, count });
      const res = await upload(await sized());
      const body = await res.json();
      expect([res.status, body.code, res.headers.get("retry-after")]).toEqual([429, "RATE_LIMITED", "30"]);
    }
    expect(h.refusal).toHaveBeenCalledTimes(1);
    expect(h.refusal).toHaveBeenCalledWith(expect.anything(), EX, "PART_UPLOAD", "RATE_LIMITED");
    expect(h.loadFacts).not.toHaveBeenCalled();
    expect(h.put).not.toHaveBeenCalled();
  });
});

describe("discard", () => {
  const post = (fields: Record<string, unknown>, t: string | null = token()) => {
    const body = JSON.stringify({ ...fields, ...(t ? { formToken: t } : {}) });
    return new Request("http://portal.example/supplier/bids/part/discard", { method: "POST", body, headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), ...SAME_ORIGIN } });
  };
  it("passes the guards, then discards the session supplier's own file", async () => {
    h.discard.mockResolvedValue({ ok: true, changed: true });
    const res = await discard(post({ exerciseId: EX, fileId: "file_0000001" }));
    expect([res.status, (await res.json()).ok]).toEqual([200, true]);
    expect(h.discard).toHaveBeenCalledWith(ACTOR, { exerciseId: EX, fileId: "file_0000001" });
  });
  it("answers 404 for a file that is not the supplier's, in words", async () => {
    h.discard.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    const res = await discard(post({ exerciseId: EX, fileId: "file_0000001" }));
    const body = await res.json();
    expect([res.status, body.code, Boolean(body.message)]).toEqual([404, "NOT_FOUND", true]);
  });
  it("answers 409 for a file a submission took", async () => {
    h.discard.mockResolvedValue({ ok: false, reason: "FILE_NOT_DRAFT" });
    expect((await discard(post({ exerciseId: EX, fileId: "file_0000001" }))).status).toBe(409);
  });
  it("refuses an unknown field, a missing id, no token and nobody signed in, and discards nothing", async () => {
    expect((await discard(post({ exerciseId: EX, fileId: "file_0000001", supplierId: "x" }))).status).toBe(400);
    expect((await discard(post({ exerciseId: EX }))).status).toBe(400);
    expect((await discard(post({ exerciseId: EX, fileId: "file_0000001" }, null))).status).toBe(400);
    h.readSession.mockResolvedValue({ ok: false });
    expect((await discard(post({ exerciseId: EX, fileId: "file_0000001" }))).status).toBe(401);
    expect(h.discard).not.toHaveBeenCalled();
  });
});
