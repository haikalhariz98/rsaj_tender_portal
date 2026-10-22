import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The public registration's one submission, guard by guard (ADR 0041, plan 3.1 and 8.2). The database and the document store are stood in; the real guards, the real parser, the real
 * file checks and the real rules run. Where a guard turns a request away before its body is needed, the test proves the body was never pulled.
 */

const h = vi.hoisted(() => ({
  register: null as unknown,
  lastDay: 0,
  spent: new Map<string, string>(),
  spentLookups: 0,
  received: [] as unknown[],
  outcome: null as unknown,
  ctxCalls: 0,
}));

vi.mock("@/lib/db", () => ({ db: { portalApplication: { count: async () => h.lastDay } } }));
vi.mock("@/lib/portal/deployment", () => ({ deploymentOrganisation: async () => ({ id: "org-public-1", code: "ORG", timeZone: "Asia/Kuala_Lumpur" }) }));
vi.mock("@/lib/portal/apply-repo", () => ({ loadRegisterSettings: async () => h.register }));
vi.mock("@/lib/portal/register/token-store", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/portal/register/token-store")>();
  return {
    ...real,
    findSpent: async (_c: unknown, _org: string, sha: string) => {
      h.spentLookups += 1;
      const reference = h.spent.get(sha);
      return reference ? { reference } : null;
    },
  };
});
vi.mock("@/lib/portal/registration/context-store", () => ({
  registrationContextFor: async () => {
    h.ctxCalls += 1;
    return CTX;
  },
}));
vi.mock("@/lib/portal/register/receive-store", () => ({
  receivePublicApplication: async (i: unknown) => {
    h.received.push(i);
    return h.outcome;
  },
}));
vi.mock("@/lib/documents/store", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/documents/store")>();
  return { ...real, blobStore: () => ({ store: { transactional: true } }) };
});

import { FORM_SECRET_MIN_LENGTH, signFormToken } from "@/lib/auth/form-token";
import { STAFF_COOKIE, SUPPLIER_COOKIE } from "@/lib/auth/routes";
import { uploadLimiter } from "@/lib/documents/concurrency";
import { sha256Hex } from "@/lib/documents/store";
import { HONEYPOT_FIELD, type RegisterReadiness } from "@/lib/portal/apply";
import type { RegisterSettings } from "@/lib/portal/apply-repo";
import { registerBodyCeiling } from "@/lib/portal/register/ceiling";
import { documentFilePart, REGISTER_APPLICATION_PART, STATEMENT_FILE_PART, type PublicApplicationBody } from "@/lib/portal/register/contract";
import { body as baseBody, step1 } from "@/lib/portal/register/fixture";
import type { HeldFile, ReceiveInput } from "@/lib/portal/register/receive-store";
import { tokenSha256 } from "@/lib/portal/register/token-store";
import { ctx, type, value } from "@/lib/portal/registration/fixture";
import { toPosix } from "@/lib/scan/files";

import { config } from "../../../../proxy";
import { POST } from "./route";

const KEY = "k".repeat(FORM_SECRET_MIN_LENGTH);
const URL_ = "http://portal.example/supplier/register/submit";
/// What a browser sends with a form posted from a page of the same origin.
const SAME_ORIGIN = { "sec-fetch-site": "same-origin", origin: "http://portal.example", host: "portal.example" };
const MB = 1024n * 1024n;

// ---- the organisation's configuration, with ids of the length a stored row's id has (the parser reads only those)
const T_REG = "type-registry-0001";
const T_WORKS = "type-works-board-01";
const V_G1 = "value-grade-1-0001";
const V_B = "value-buildings-001";
const BODY_ID = "body-works-board-01";
const CTX = ctx({
  types: [type({ id: T_REG, nameEn: "Companies registry certificate" }), type({ id: T_WORKS, nameEn: "Works board certificate", bodyId: BODY_ID, valueKinds: ["GRADE", "CATEGORY"] })],
  bodies: [{ id: BODY_ID, nameEn: "Works board" }],
  values: [value({ id: V_G1, code: "G1", nameEn: "Grade 1", kind: "GRADE", bodyId: BODY_ID }), value({ id: V_B, code: "B", nameEn: "Buildings", kind: "CATEGORY", bodyId: BODY_ID })],
  available: [{ bodyId: BODY_ID, kind: "GRADE" }, { bodyId: BODY_ID, kind: "CATEGORY" }],
});
const application = (o: Partial<PublicApplicationBody> = {}): PublicApplicationBody =>
  baseBody({
    documents: [
      { clientKey: "new:reg", typeId: T_REG, title: "", reference: "R-1", issuingAuthority: "An authority", expiresOn: "2027-06-30", notApplicable: false, ratePercent: "", valueIds: [] },
      { clientKey: "new:works", typeId: T_WORKS, title: "", reference: "W-1", issuingAuthority: "A board", expiresOn: "2027-06-30", notApplicable: false, ratePercent: "", valueIds: [V_G1, V_B] },
    ],
    ...o,
  });

const READY: RegisterReadiness = {
  today: "2026-10-09", entityTypeCodes: ["demo_private"], countryCodes: ["demo_home"], stateCodes: ["demo_state"], numberingReady: true, noticeSet: true, termsTextSet: true,
  falseDeclarationTextSet: true, giroTextSet: true, verificationNoticeSet: true, documentTypesSet: true, banksSet: true, accountTypesSet: true, storeRulesSet: true, ceilingSet: true,
  documentClassSet: true, statementClassSet: true, quotasSet: true, limitsSet: true, onlineDeclarationAccepted: true, storeDriverSet: true, formKeySet: true,
};

/// The register as `loadRegisterSettings` would read it: open, with these upload rules.
function register(o: { capBytes?: bigint; maxFiles?: number; maxBytes?: bigint; missing?: boolean; daily?: number } = {}): RegisterSettings {
  const capBytes = o.capBytes ?? 1n * MB;
  const maxFiles = o.maxFiles ?? 6;
  const maxBytes = o.maxBytes ?? 4n * MB;
  return {
    org: { id: "org-public-1", code: "ORG", timeZone: "Asia/Kuala_Lumpur", today: "2026-10-09", name: "Demonstration Authority" },
    settings: { org: { id: "org-public-1", name: "Demonstration Authority", timeZone: "Asia/Kuala_Lumpur", today: "2026-10-09" }, policy: {} as never },
    step1: step1(),
    stateName: () => "Demo State",
    callingCode: () => "+60",
    context: CTX,
    upload: {
      store: { allowedTypes: ["application/pdf"], capBytes },
      document: { classId: "class-certificates", maxFiles, maxBytes },
      statement: { classId: "class-statements", classIsSulit: true, maxFiles, maxBytes },
    },
    ceiling: registerBodyCeiling({ capBytes, maxFiles, maxBytes }),
    limits: { daily: o.daily ?? 50, perNumber: 3 },
    readiness: READY,
    missing: o.missing ? [{ en: "the Terms and Conditions" }] : [],
  };
}

// ---- files and bodies
const pdf = (size: number, fill = 0x20) => {
  const b = new Uint8Array(size).fill(fill);
  b.set(new TextEncoder().encode("%PDF-1.4\n"));
  return b;
};
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const asFile = (bytes: Uint8Array, name = "file.pdf", mediaType = "application/pdf") => new File([bytes as BlobPart], name, { type: mediaType });

type Part = [string, string | File];
/// A whole application: the JSON part, one file for each row and one statement, unless told otherwise.
function parts(o: { body?: PublicApplicationBody; files?: Part[]; extra?: Part[] } = {}): Part[] {
  const b = o.body ?? application();
  const files = o.files ?? [[documentFilePart("new:reg"), asFile(pdf(2000), "registry.pdf")], [documentFilePart("new:works"), asFile(pdf(3000), "works.pdf")], [STATEMENT_FILE_PART, asFile(pdf(4000), "statement.pdf")]];
  return [[REGISTER_APPLICATION_PART, JSON.stringify(b)], ...files, ...(o.extra ?? [])];
}

const token = (at = new Date(), nonce = "AAAAAAAAAAAAAAAAAAAAAA") => signFormToken(KEY, "register", at, nonce);

/**
 * A request whose body is a stream that records whether anyone pulled it (`highWaterMark: 0`: nothing is read ahead). `length` is what the request states; by default the true length.
 */
async function request(ps: Part[], o: { length?: string | null; headers?: Record<string, string>; origin?: Record<string, string>; token?: string | null; extraBytes?: number } = {}) {
  const fd = new FormData();
  for (const [k, v] of ps) fd.append(k, v);
  const encoded = new Response(fd);
  const contentType = encoded.headers.get("content-type")!;
  let bytes = new Uint8Array(await encoded.arrayBuffer());
  if (o.extraBytes) {
    const longer = new Uint8Array(bytes.byteLength + o.extraBytes).fill(0x41);
    longer.set(bytes);
    bytes = longer;
  }
  const pulled = { value: false };
  let at = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        pulled.value = true;
        if (at >= bytes.byteLength) return c.close();
        const next = bytes.subarray(at, at + 256 * 1024);
        at += next.byteLength;
        c.enqueue(next);
      },
    },
    { highWaterMark: 0 },
  );
  const t = o.token === undefined ? token() : o.token;
  const headers: Record<string, string> = { ...(o.origin ?? SAME_ORIGIN), "content-type": contentType, ...(t ? { "x-form-token": t } : {}), ...(o.headers ?? {}) };
  const length = o.length === undefined ? String(bytes.byteLength) : o.length;
  if (length != null) headers["content-length"] = length;
  const req = new Request(URL_, { method: "POST", body: stream, headers, duplex: "half" } as RequestInit);
  return { req, pulled, bytes };
}

const send = async (ps: Part[] = parts(), o: Parameters<typeof request>[1] = {}) => {
  const r = await request(ps, o);
  const res = await POST(r.req);
  return { res, json: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text(), pulled: r.pulled.value };
};

beforeEach(() => {
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  vi.stubEnv("PORTAL_SURFACE", "public");
  h.register = register();
  h.lastDay = 0;
  h.spent = new Map();
  h.spentLookups = 0;
  h.received = [];
  h.ctxCalls = 0;
  h.outcome = { ok: true, reference: "DEMO/APP/0007/2026" };
});
afterEach(() => vi.unstubAllEnvs());

describe("a whole application", () => {
  it("is taken whole, files and all, and answered with its reference, never cached", async () => {
    const { res, json, pulled } = await send();
    expect(res.status).toBe(200);
    // The stand-in body records a read: the guards below that answer "never pulled" are measured by the same flag.
    expect(pulled).toBe(true);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(json).toEqual({ ok: true, reference: "DEMO/APP/0007/2026" });
    const got = h.received[0] as ReceiveInput;
    expect(got.body.company.registeredName).toBe("Demonstration Contractors");
    expect([...got.files.keys()].sort()).toEqual(["new:reg", "new:works"]);
    expect(got.statement).toHaveLength(1);
    expect(got.statement[0]!.mediaType).toBe("application/pdf");
    // The token's digest is stored, never the token; and the moment it was made.
    expect(got.token.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("answers the store's own refusals in words: busy, closed, and a rule judged again under its lock", async () => {
    h.outcome = { ok: false, kind: "BUSY" };
    expect((await send()).json).toMatchObject({ ok: false, code: "BUSY" });
    h.outcome = { ok: false, kind: "CLOSED" };
    expect((await send()).json).toMatchObject({ ok: false, code: "CLOSED" });
    h.outcome = { ok: false, kind: "VALIDATION", faults: [{ step: "review", code: "TEXT_STALE", level: "block", field: "terms", data: { kind: "Terms and conditions" } }] };
    const stale = await send();
    expect(stale.res.status).toBe(422);
    expect(stale.json.faults).toEqual([expect.objectContaining({ step: "review", field: "terms", level: "block" })]);
    expect(JSON.stringify(stale.json)).not.toMatch(/TEXT_STALE/);
  });
});

describe("guard order: each refusal comes before the body is pulled (plan 8.2.1)", () => {
  it("the boundary: a staff cookie on the public copy, a server action, and a supplier cookie on the staff copy are not found", async () => {
    const refused: Record<string, string>[] = [{ cookie: `${STAFF_COOKIE}=${"A".repeat(43)}` }, { "next-action": "40abcdef" }];
    for (const headers of refused) {
      const r = await send(parts(), { headers });
      expect([r.res.status, r.pulled]).toEqual([404, false]);
    }
    vi.stubEnv("PORTAL_SURFACE", "internal");
    const r = await send(parts(), { headers: { cookie: `${SUPPLIER_COOKIE}=${"B".repeat(43)}` } });
    expect([r.res.status, r.pulled]).toEqual([404, false]);
    expect(h.spentLookups).toBe(0);
  });

  it("the Origin guard: another site, no origin, a foreign origin, a text body", async () => {
    for (const [origin, code] of [[{ ...SAME_ORIGIN, "sec-fetch-site": "cross-site" }, "CROSS_SITE"], [{ host: "portal.example" }, "NO_ORIGIN"], [{ ...SAME_ORIGIN, origin: "http://evil.example" }, "WRONG_ORIGIN"]] as const) {
      const r = await send(parts(), { origin });
      expect([r.res.status, r.json.code, r.pulled]).toEqual([403, code, false]);
    }
    const plain = await send(parts(), { headers: { "content-type": "text/plain" } });
    expect([plain.res.status, plain.json.code, plain.pulled]).toEqual([415, "WRONG_CONTENT_TYPE", false]);
    expect(h.spentLookups).toBe(0);
  });

  it("no slot of the upload limiter: busy, with Retry-After", async () => {
    const held: (() => void)[] = [];
    for (let s = uploadLimiter().tryAcquire(); s; s = uploadLimiter().tryAcquire()) held.push(s);
    try {
      const r = await send();
      expect([r.res.status, r.json.code, r.pulled]).toEqual([503, "BUSY", false]);
      expect(Number(r.res.headers.get("retry-after"))).toBeGreaterThan(0);
    } finally {
      for (const release of held) release();
    }
  });

  it("the register not open: closed, naming nothing", async () => {
    h.register = register({ missing: true });
    const r = await send();
    expect([r.res.status, r.json.code, r.pulled]).toEqual([503, "CLOSED", false]);
    h.register = null;
    expect((await send()).json.code).toBe("CLOSED");
  });

  it("the day's applications already taken: busy, before the body", async () => {
    h.lastDay = 50;
    const r = await send();
    expect([r.res.status, r.json.code, r.pulled]).toEqual([503, "BUSY", false]);
  });

  it("no stated length: 411; not digits: 400; over the ceiling: 413 in words, naming the limit", async () => {
    const none = await send(parts(), { length: null });
    expect([none.res.status, none.json.code, none.pulled]).toEqual([411, "NO_LENGTH", false]);
    const odd = await send(parts(), { length: "12x" });
    expect([odd.res.status, odd.json.code, odd.pulled]).toEqual([400, "UNREADABLE", false]);
    const ceiling = (h.register as RegisterSettings).ceiling!;
    const over = await send(parts(), { length: String(ceiling + 1n) });
    expect([over.res.status, over.json.code, over.pulled]).toEqual([413, "TOO_LARGE", false]);
    expect(over.json.message).toMatch(/^Too large to send\. The limit is [\d.,]+ (KB|MB)\. Nothing was sent\.$/);
    expect(h.received).toHaveLength(0);
  });
});

describe("the form token (plan 8.2.2, ADR 0041 D8)", () => {
  it("missing, forged, for another form, nonce-less or expired: out of date, in words that keep what was typed", async () => {
    const tokens = [null, signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), "register", new Date(), "AAAAAAAAAAAAAAAAAAAAAA"), signFormToken(KEY, "sign-in", new Date()), `${Date.now()}.${signFormToken(KEY, "sign-in", new Date()).split(".")[1]}`, token(new Date(Date.now() - 25 * 60 * 60 * 1000))];
    for (const t of tokens) {
      const r = await send(parts(), { token: t });
      expect([r.res.status, r.json.code, r.pulled], String(t)).toEqual([400, "FORM_EXPIRED", false]);
      expect(r.json.message).not.toMatch(/reload/i);
    }
    expect(h.received).toHaveLength(0);
  });

  it("a spent token that now fails its signature (the key rotated) is still answered with its reference, never 'out of date' (which the page reads as unspent)", async () => {
    const t = signFormToken("y".repeat(FORM_SECRET_MIN_LENGTH), "register", new Date(), "BBBBBBBBBBBBBBBBBBBBBB");
    h.spent.set(tokenSha256(t), "DEMO/APP/0005/2026");
    const r = await send(parts(), { token: t });
    expect([r.res.status, r.json, r.pulled]).toEqual([200, { ok: true, reference: "DEMO/APP/0005/2026" }, false]);
    expect(h.received).toHaveLength(0);
  });

  it("a token not of the register's shape is never looked up", async () => {
    const before = h.spentLookups;
    for (const t of [signFormToken(KEY, "sign-in", new Date()), "garbage"]) expect((await send(parts(), { token: t })).json.code).toBe("FORM_EXPIRED");
    expect(h.spentLookups).toBe(before);
  });

  it("the deployment's form key not set: closed", async () => {
    vi.stubEnv("PORTAL_FORM_SECRET", "");
    const r = await send();
    expect([r.res.status, r.json.code, r.pulled]).toEqual([503, "CLOSED", false]);
  });

  it("a spent token gets the same reply and reference, with the body unread and nothing received again", async () => {
    const t = token();
    h.spent.set(tokenSha256(t), "DEMO/APP/0003/2026");
    const r = await send(parts(), { token: t });
    expect([r.res.status, r.json, r.pulled]).toEqual([200, { ok: true, reference: "DEMO/APP/0003/2026" }, false]);
    expect(h.received).toHaveLength(0);
  });

  it("a spent token gets its reference even when the limit its own first send took is reached, the register has since closed, or the token has since expired", async () => {
    const t = token(new Date(Date.now() - 25 * 60 * 60 * 1000));
    h.spent.set(tokenSha256(t), "DEMO/APP/0004/2026");
    h.lastDay = 50;
    h.register = register({ missing: true });
    const r = await send(parts(), { token: t, length: null });
    expect([r.res.status, r.json, r.pulled]).toEqual([200, { ok: true, reference: "DEMO/APP/0004/2026" }, false]);
  });
});

describe("the body as it is read (plan 8.2.3 and 8.2.4)", () => {
  it("a stated length that lies: the body is cut off where the ceiling allows, and refused in words", async () => {
    h.register = register({ capBytes: 100_000n, maxFiles: 2, maxBytes: 150_000n });
    const ceiling = (h.register as RegisterSettings).ceiling!;
    const r = await send(parts(), { length: "1000", extraBytes: Number(ceiling) + 200_000 });
    expect([r.res.status, r.json.code]).toEqual([413, "TOO_LARGE"]);
    expect(r.json.message).toMatch(/Nothing was sent/);
    expect(h.received).toHaveLength(0);
  });

  it("a body that is not a form is unreadable", async () => {
    const bad = new Request(URL_, { method: "POST", body: "not a form", headers: { ...SAME_ORIGIN, "content-type": "multipart/form-data; boundary=x", "x-form-token": token(), "content-length": "10" } });
    const res = await POST(bad);
    expect([res.status, (await res.json()).code]).toEqual([400, "UNREADABLE"]);
  });

  it("the bait field filled: answered as received, with no reference; nothing is received and the token is not spent", async () => {
    const r = await send(parts({ extra: [[HONEYPOT_FIELD, "http://spam.example"]] }));
    expect([r.res.status, r.json]).toEqual([200, { ok: true, reference: null }]);
    expect(h.received).toHaveLength(0);
    expect(h.ctxCalls).toBe(0);
  });

  it("a malformed application, an unknown key, a part that names no row, or text where a file belongs: unreadable, and nothing received", async () => {
    const cases: Part[][] = [
      [[REGISTER_APPLICATION_PART, "{not json"]],
      [[REGISTER_APPLICATION_PART, JSON.stringify({ ...application(), extra: 1 })]],
      parts({ extra: [[documentFilePart("new:nobody"), asFile(pdf(100))]] }),
      parts({ extra: [["supplierId", "x"]] }),
      parts({ extra: [[STATEMENT_FILE_PART, "text, not a file"]] }),
      parts({ files: [] }).filter(([k]) => k !== REGISTER_APPLICATION_PART),
    ];
    for (const ps of cases) {
      const r = await send(ps);
      expect([r.res.status, r.json.code], JSON.stringify(ps.map(([k]) => k))).toEqual([400, "UNREADABLE"]);
    }
    expect(h.received).toHaveLength(0);
  });
});

describe("each file, by its own bytes (plan 8.2.5)", () => {
  const faultAt = async (files: Part[], o: Parameters<typeof register>[0] = {}) => {
    h.register = register(o);
    const r = await send(parts({ files }));
    expect([r.res.status, r.json.code]).toEqual([422, "VALIDATION"]);
    expect(h.received).toHaveLength(0);
    return r.json.faults as { step: string; field: string; level: string; message: string }[];
  };
  const OTHERS: Part[] = [[documentFilePart("new:works"), asFile(pdf(3000), "works.pdf")], [STATEMENT_FILE_PART, asFile(pdf(4000), "statement.pdf")]];

  it("a name or declared type that disagrees with the bytes", async () => {
    const fs = await faultAt([[documentFilePart("new:reg"), asFile(pdf(2000), "registry.png", "image/png")], ...OTHERS]);
    expect(fs).toContainEqual(expect.objectContaining({ step: "documents", field: "documents.new:reg.file", level: "block", message: expect.stringMatching(/not accepted/) }));
  });

  it("a type the office does not take", async () => {
    const fs = await faultAt([[documentFilePart("new:reg"), asFile(png(), "registry.png", "image/png")], ...OTHERS]);
    expect(fs).toContainEqual(expect.objectContaining({ field: "documents.new:reg.file", message: expect.stringMatching(/not accepted/) }));
  });

  it("a file over the per-file cap", async () => {
    const fs = await faultAt([[documentFilePart("new:works"), asFile(pdf(3000), "works.pdf")], [documentFilePart("new:reg"), asFile(pdf(2000), "registry.pdf")], [STATEMENT_FILE_PART, asFile(pdf(150_000), "statement.pdf")]], { capBytes: 100_000n });
    expect(fs).toContainEqual(expect.objectContaining({ step: "epayment", field: "creditor.statement", message: expect.stringMatching(/larger than/) }));
  });

  it("one file past the count quota, counted across the whole application", async () => {
    const fs = await faultAt([...OTHERS, [documentFilePart("new:reg"), asFile(pdf(2000), "registry.pdf")]], { maxFiles: 2 });
    expect(fs.filter((f) => f.level === "block" && /as many files/.test(f.message))).toEqual([expect.objectContaining({ field: "documents.new:reg.file" })]);
  });

  it("a file past the byte quota, counted across the whole application", async () => {
    const fs = await faultAt([[documentFilePart("new:reg"), asFile(pdf(60_000), "registry.pdf")], [documentFilePart("new:works"), asFile(pdf(60_000), "works.pdf")], [STATEMENT_FILE_PART, asFile(pdf(60_000), "statement.pdf")]], { maxBytes: 150_000n });
    expect(fs.filter((f) => /size limit/.test(f.message))).toEqual([expect.objectContaining({ step: "epayment", field: "creditor.statement" })]);
  });
});

describe("every step's rules, by step and field (plan 8.2.6)", () => {
  it("returns each fault with its step and field and words, never a code, and receives nothing", async () => {
    const b = application({
      company: { ...application().company, registeredName: "" },
      creditor: { ...application().creditor, bankCode: "" },
      agreements: application().agreements.map((a) => (a.kind === "TERMS_AND_CONDITIONS" ? { ...a, confirmed: false } : a)),
    });
    const r = await send(parts({ body: b, files: [[documentFilePart("new:works"), asFile(pdf(3000), "works.pdf")]] }));
    expect([r.res.status, r.json.code]).toEqual([422, "VALIDATION"]);
    const at = (r.json.faults as { step: string; field: string | null; level: string }[]).filter((f) => f.level === "block").map((f) => [f.step, f.field]);
    expect(at).toEqual(expect.arrayContaining([["company", "registeredName"], ["documents", "documents.new:reg.file"], ["epayment", "creditor.bankCode"], ["epayment", "creditor.statement"], ["review", "terms"]]));
    expect(JSON.stringify(r.json)).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    expect(h.received).toHaveLength(0);
  });
});

describe("over 10 MB (plan 8.2.7; REG-2: arrives whole or is refused in words, never cut short)", () => {
  const big = pdf(11 * 1024 * 1024, 0x37);
  const files = (): Part[] => [[documentFilePart("new:reg"), asFile(pdf(2000), "registry.pdf")], [documentFilePart("new:works"), asFile(pdf(3000), "works.pdf")], [STATEMENT_FILE_PART, asFile(big, "statement.pdf")]];

  it("with settings that allow it, an 11 MB statement arrives whole: what is stored is what was sent", async () => {
    h.register = register({ capBytes: 20n * MB, maxFiles: 5, maxBytes: 50n * MB });
    const r = await send(parts({ files: files() }));
    expect([r.res.status, r.json]).toEqual([200, { ok: true, reference: "DEMO/APP/0007/2026" }]);
    const got = (h.received[0] as ReceiveInput).statement[0] as HeldFile;
    expect(got.bytes.byteLength).toBe(big.byteLength);
    expect(got.sha256).toBe(sha256Hex(big));
  });

  it("with a 5 MB cap and quota, the same body is refused before it is read: 413, too large, in words", async () => {
    h.register = register({ capBytes: 5n * MB, maxFiles: 5, maxBytes: 5n * MB });
    expect((h.register as RegisterSettings).ceiling!).toBeLessThan(11n * MB);
    const r = await send(parts({ files: files() }));
    expect([r.res.status, r.json.code, r.pulled]).toEqual([413, "TOO_LARGE", false]);
    expect(r.json.message).toMatch(/^Too large to send\. The limit is .+\. Nothing was sent\.$/);
    expect(h.received).toHaveLength(0);
  });

  it("with a 5 MB cap per file and room in all, the statement alone is refused, beside its field", async () => {
    h.register = register({ capBytes: 5n * MB, maxFiles: 5, maxBytes: 50n * MB });
    const r = await send(parts({ files: files() }));
    expect([r.res.status, r.json.code]).toEqual([422, "VALIDATION"]);
    expect(r.json.faults).toContainEqual(expect.objectContaining({ field: "creditor.statement", message: expect.stringMatching(/larger than/) }));
  });

  it("the route bypasses the proxy, which would keep only the first 10 MB (Next's own matcher compiler)", () => {
    const { getMiddlewareMatchers } = createRequire(import.meta.url)("next/dist/build/analysis/get-page-static-info") as { getMiddlewareMatchers: (matcher: unknown, nextConfig: object) => { regexp: string }[] };
    const [compiled] = getMiddlewareMatchers(config.matcher, {});
    expect(new RegExp(compiled!.regexp).test("/supplier/register/submit")).toBe(false);
    expect(new RegExp(compiled!.regexp).test("/supplier/register")).toBe(true);
  });
});

describe("the portal's own folder", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [toPosix(join(dir, f))]));
  it("holds no server action: the public copy refuses every one, so the form posts to a route", () => {
    const offenders = files(join(process.cwd(), "src", "app", "supplier"))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
      .filter((f) => /^\s*["']use server["']/m.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
