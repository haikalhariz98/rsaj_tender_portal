import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { logAccess, findFirst, dispositionFilename, scanner } = vi.hoisted(() => ({
  logAccess: vi.fn(async (...args: unknown[]) => void args),
  findFirst: vi.fn(),
  dispositionFilename: vi.fn(),
  scanner: { configured: false, result: "CLEAN" as string, scans: 0 },
}));

// Phase 1b: the route asks who is signed in before anything else. These tests are about the download, so a signed-in officer stands in (the guard has its own tests, src/app/_auth/route.test.ts).
vi.mock("@/app/_auth/route", async () => (await import("@/lib/test-support/staff")).routeModule());
vi.mock("@/lib/documents/service", () => ({ documentOrg: async () => ({ id: "org1" }), logAccess: (e: unknown) => logAccess(e) }));
// Phase 3a: the route asks which restricted exercises the reader may not see (none here), so the exercise table answers an empty list.
vi.mock("@/lib/db", () => ({ db: { documentVersion: { findFirst: (a: unknown) => findFirst(a) }, sourcingExercise: { findMany: async () => [] } } }));
vi.mock("@/lib/documents/access", async (orig) => {
  const actual = await orig<typeof import("@/lib/documents/access")>();
  dispositionFilename.mockImplementation(actual.dispositionFilename);
  return { ...actual, dispositionFilename: (...a: Parameters<typeof actual.dispositionFilename>) => dispositionFilename(...a) };
});

const BYTES = new Uint8Array([37, 80, 68, 70, 45, 49]);
const SHA = createHash("sha256").update(BYTES).digest("hex");
vi.mock("@/lib/documents/store", async () => {
  const { createHash: h } = await import("node:crypto");
  return {
    blobStore: () => ({ store: { get: async () => new Uint8Array([37, 80, 68, 70, 45, 49]) } }),
    sha256Hex: (b: Uint8Array) => h("sha256").update(b).digest("hex"),
    malwareScanner: () => scanner,
    runScan: async (s: typeof scanner) => {
      if (!s.configured) return "NOT_SCANNED";
      s.scans += 1;
      return s.result;
    },
  };
});

import { downloadLimiter } from "@/lib/documents/concurrency";

import { GET, HEAD } from "./route";

const call = (headers: Record<string, string> = {}) => GET(new Request("http://localhost/api/documents/versions/v1", { headers }) as never, { params: Promise.resolve({ id: "v1" }) } as never);
const version = (originalFilename: string) => ({ id: "v1", sha256: SHA, byteSize: 6n, mediaType: "application/pdf", originalFilename, scanState: "NOT_SCANNED", document: { classificationSnapshot: "PUBLIC" } });
const downloads = () => logAccess.mock.calls.filter((c) => (c[0] as { kind: string }).kind === "DOWNLOADED");

beforeEach(() => {
  logAccess.mockClear();
  findFirst.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("the download route's file name (audit M-2)", () => {
  it("an emoji at the old cut is served and logged once, with a name that decodes", async () => {
    findFirst.mockResolvedValue(version("a".repeat(179) + "😀.pdf"));
    const res = await call();
    expect(res.status).toBe(200);
    expect(downloads()).toHaveLength(1);
    const encoded = /filename\*=UTF-8''(.+)$/.exec(res.headers.get("content-disposition")!)![1];
    expect(decodeURIComponent(encoded).endsWith(".pdf")).toBe(true);
  });

  it("a lone surrogate never reaches encodeURIComponent", async () => {
    findFirst.mockResolvedValue(version("a\ud800b\udc00.pdf"));
    const seen: string[] = [];
    const real = globalThis.encodeURIComponent;
    vi.spyOn(globalThis, "encodeURIComponent").mockImplementation((s) => {
      seen.push(String(s));
      return real(s);
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) expect(s.isWellFormed()).toBe(true);
  });

  it("a response that cannot be built logs no download and serves no bytes", async () => {
    findFirst.mockResolvedValue(version("x.pdf"));
    dispositionFilename.mockImplementationOnce(() => {
      throw new URIError("URI malformed");
    });
    const res = await call();
    expect(res.status).toBe(500);
    expect(downloads()).toHaveLength(0);
    expect(logAccess).not.toHaveBeenCalled();
    expect((await res.text()).length).toBeGreaterThan(0);
    expect(res.headers.get("content-disposition")).toBeNull();
  });
});

describe("what the download route refuses before it reads or logs anything (audit C-2)", () => {
  it("HEAD is 405, reads nothing and logs nothing", async () => {
    const res = await HEAD();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
    expect(findFirst).not.toHaveBeenCalled();
    expect(logAccess).not.toHaveBeenCalled();
  });
  it("a cross-site GET is 403, reads nothing and logs nothing", async () => {
    findFirst.mockResolvedValue(version("x.pdf"));
    const res = await call({ "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
    expect(logAccess).not.toHaveBeenCalled();
  });
  it("a same-origin GET, and one with no header, are served and logged", async () => {
    findFirst.mockResolvedValue(version("x.pdf"));
    expect((await call({ "sec-fetch-site": "same-origin" })).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect(downloads()).toHaveLength(2);
  });
});

describe("the cap on downloads in flight (audit C-1)", () => {
  it("over it is 503 with Retry-After, reads nothing and logs nothing; under it, served again", async () => {
    findFirst.mockResolvedValue(version("x.pdf"));
    const l = downloadLimiter();
    const held: (() => void)[] = [];
    for (let s = l.tryAcquire(); s; s = l.tryAcquire()) held.push(s);
    try {
      const res = await call();
      expect(res.status).toBe(503);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(findFirst).not.toHaveBeenCalled();
      expect(logAccess).not.toHaveBeenCalled();
    } finally {
      held.forEach((r) => r());
    }
    expect((await call()).status).toBe(200);
    expect(l.active()).toBe(0);
  });
});

describe("a file sent by someone not signed in (RSEC-2)", () => {
  const applicant = (scanState = "NOT_SCANNED") => ({ ...version("certificate.pdf"), scanState, recordedByPortalApplicationId: "pa1" });
  const confirmed = () => GET(new Request("http://localhost/api/documents/versions/v1?unscanned=1") as never, { params: Promise.resolve({ id: "v1" }) } as never);
  const refusals = () => logAccess.mock.calls.map((c) => c[0] as { kind: string; reasonCode?: string }).filter((e) => e.kind === "REFUSED").map((e) => e.reasonCode);
  beforeEach(() => {
    scanner.configured = false;
    scanner.result = "CLEAN";
    scanner.scans = 0;
  });

  it("with no scanner, is refused until the request confirms it, then served; never as clean", async () => {
    findFirst.mockResolvedValue(applicant());
    const asked = await call();
    expect(asked.status).toBe(409);
    expect(await asked.text()).toMatch(/^Not scanned\. Sent by someone not signed in\./);
    expect(refusals()).toEqual(["UNCONFIRMED"]);
    const served = await confirmed();
    expect(served.status).toBe(200);
    expect(downloads()).toHaveLength(1);
  });

  it("with a scanner, takes a fresh scan: refused on a threat found now, a failed scan, or one stored, and served when clean without asking", async () => {
    scanner.configured = true;
    findFirst.mockResolvedValue(applicant());
    scanner.result = "THREAT";
    expect((await call()).status).toBe(403);
    scanner.result = "ERROR";
    expect((await call()).status).toBe(403);
    scanner.result = "CLEAN";
    findFirst.mockResolvedValue(applicant("THREAT"));
    expect((await confirmed()).status).toBe(403);
    expect(refusals()).toEqual(["THREAT", "SCAN_ERROR", "THREAT"]);
    findFirst.mockResolvedValue(applicant());
    expect((await call()).status).toBe(200);
    expect(scanner.scans).toBe(3);
  });

  it("an officer's own file is served as before, with no scan and no question", async () => {
    findFirst.mockResolvedValue({ ...version("minutes.pdf"), recordedByPortalApplicationId: null });
    expect((await call()).status).toBe(200);
    expect(scanner.scans).toBe(0);
  });
});
