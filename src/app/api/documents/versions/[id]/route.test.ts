import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { logAccess, findFirst, dispositionFilename } = vi.hoisted(() => ({
  logAccess: vi.fn(async (...args: unknown[]) => void args),
  findFirst: vi.fn(),
  dispositionFilename: vi.fn(),
}));

vi.mock("@/lib/documents/service", () => ({ documentOrg: async () => ({ id: "org1" }), logAccess: (e: unknown) => logAccess(e) }));
vi.mock("@/lib/db", () => ({ db: { documentVersion: { findFirst: (a: unknown) => findFirst(a) } } }));
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
  };
});

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
