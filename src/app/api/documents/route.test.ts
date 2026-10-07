import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { documentOrg, logAccess, storeUpload, guard } = vi.hoisted(() => ({
  // What the shared route guard answers (Phase 1b): null lets the request through as a signed-in officer; a code refuses it as the guard would. The guard has its own tests, src/app/_auth/route.test.ts.
  guard: { refuse: null as null | { code: string; status: number } },
  documentOrg: vi.fn(async () => ({ id: "org1", timeZone: "Asia/Kuala_Lumpur", today: "2026-10-01" })),
  logAccess: vi.fn(async (...args: unknown[]) => void args),
  storeUpload: vi.fn(async (...args: unknown[]) => ({ documentId: "d1", versionId: "v1", versionNo: 1, sha256: "x", byteSize: "0", mediaType: "application/pdf", status: "STAGED", warnings: [], args })),
}));

vi.mock("@/app/_auth/actor", async () => (await import("@/lib/test-support/staff")).actorModule());
// Phase 2b: every act is attributed to the signed-in person (`beginAct`). The real reading of the form stands, with the organisation's switch, the password and the write faked.
vi.mock("@/app/_auth/act", async () => (await import("@/lib/test-support/staff")).actModule().module);
vi.mock("@/app/_auth/route", async () => {
  const support = await import("@/lib/test-support/staff");
  const real = support.routeModule();
  return { ...real, staffRoute: async () => (guard.refuse ? { ok: false as const, response: Response.json({ ok: false, code: guard.refuse.code }, { status: guard.refuse.status }) } : { ok: true as const, actor: support.STAFF_FIXTURE }) };
});
vi.mock("@/lib/documents/service", () => ({
  documentOrg,
  logAccess,
  storeUpload,
  loadStorePolicy: async () => ({ id: "p", allowedMediaTypes: ["application/pdf"], maxBytes: 1000n, provenance: null, notes: "" }),
  UploadRefusal: class extends Error {},
}));
vi.mock("@/lib/documents/store", async () => {
  const { createHash } = await import("node:crypto");
  return {
    blobStore: () => ({ store: { transactional: true } }),
    deploymentCeiling: () => ({ ceiling: 100_000n }),
    sha256Hex: (b: Uint8Array) => createHash("sha256").update(b).digest("hex"),
  };
});

import { uploadLimiter } from "@/lib/documents/concurrency";

import { POST } from "./route";

const SAME_SITE = { origin: "http://localhost:3000", host: "localhost:3000", "sec-fetch-site": "same-origin", "x-perolehan-upload": "1" };
const PDF = (n: number) => {
  const b = new Uint8Array(n).fill(32);
  b.set(new TextEncoder().encode("%PDF-1.4"));
  return b;
};
function formRequest(file: Uint8Array, name: string, headers: Record<string, string> = SAME_SITE) {
  const form = new FormData();
  form.set("file", new File([file as Uint8Array<ArrayBuffer>], name, { type: "application/pdf" }));
  form.set("title", " A title ");
  form.set("documentClassId", "c1");
  form.set("recordedByPersonId", "p1");
  return new Request("http://localhost:3000/api/documents", { method: "POST", body: form, headers });
}
const refused = () => logAccess.mock.calls.map((c) => c[0] as { kind: string; reasonCode: string; offeredBytes: bigint | null });

beforeEach(() => {
  guard.refuse = null;
  documentOrg.mockClear();
  logAccess.mockClear();
  storeUpload.mockClear();
});
afterEach(() => {
  const l = uploadLimiter();
  expect(l.active()).toBe(0);
});

describe("POST /api/documents", () => {
  it("parses the multipart once and hands the file's bytes and fields to the store", async () => {
    const res = await POST(formRequest(PDF(500), "a.pdf") as never);
    expect(res.status).toBe(201);
    // The first argument is who acted (the signed-in officer), the second the upload.
    expect(storeUpload.mock.calls[0][0]).toMatchObject({ kind: "STAFF", personId: "person_test" });
    const input = storeUpload.mock.calls[0][1] as { bytes: Uint8Array; originalFilename: string; title: string; mediaType: string };
    expect(input.bytes.byteLength).toBe(500);
    expect(input.originalFilename).toBe("a.pdf");
    expect(input.title).toBe("A title");
    expect(input.mediaType).toBe("application/pdf");
  });

  it("a request the shared guard refuses (cross-site, or not multipart) is refused before anything is read, and writes nothing (audit M-3, F9)", async () => {
    guard.refuse = { code: "CROSS_SITE", status: 403 };
    const res = await POST(formRequest(PDF(500), "a.pdf", { ...SAME_SITE, "sec-fetch-site": "cross-site" }) as never);
    expect(res.status).toBe(403);
    expect(documentOrg).not.toHaveBeenCalled();
    expect(logAccess).not.toHaveBeenCalled();
    expect(storeUpload).not.toHaveBeenCalled();
  });

  // Phase 1b: the `X-Perolehan-Upload` header check this replaced is the shared guard's now (same-origin and a multipart body, plus a signed-in officer).
  it("nobody signed in is refused 401 and writes nothing", async () => {
    guard.refuse = { code: "NOT_SIGNED_IN", status: 401 };
    const res = await POST(formRequest(PDF(500), "a.pdf") as never);
    expect(res.status).toBe(401);
    expect(logAccess).not.toHaveBeenCalled();
    expect(storeUpload).not.toHaveBeenCalled();
  });

  it("a name over the storage limit is refused, logged, and never cut (audit M-1)", async () => {
    const res = await POST(formRequest(PDF(500), "n".repeat(256) + ".pdf") as never);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("NAME_TOO_LONG");
    expect(storeUpload).not.toHaveBeenCalled();
    expect(refused().map((e) => e.reasonCode)).toEqual(["NAME_TOO_LONG"]);
  });

  it("a body over the cap with no declared length is cut off as it arrives (audit C-1)", async () => {
    const chunk = new Uint8Array(40_000).fill(1);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent++ < 20) c.enqueue(chunk);
        else c.close();
      },
    });
    const req = new Request("http://localhost:3000/api/documents", { method: "POST", body, headers: { ...SAME_SITE, "content-type": "multipart/form-data; boundary=x" }, duplex: "half" } as RequestInit);
    const res = await POST(req as never);
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(20);
    expect(refused()[0].reasonCode).toBe("TOO_LARGE");
    expect(storeUpload).not.toHaveBeenCalled();
  });

  it("over the cap on uploads in flight it is 503 with Retry-After, and not an access event (audit C-1)", async () => {
    const l = uploadLimiter();
    const held: (() => void)[] = [];
    for (let s = l.tryAcquire(); s; s = l.tryAcquire()) held.push(s);
    try {
      const res = await POST(formRequest(PDF(500), "a.pdf") as never);
      expect(res.status).toBe(503);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(logAccess).not.toHaveBeenCalled();
      expect(documentOrg).not.toHaveBeenCalled();
    } finally {
      held.forEach((r) => r());
    }
    expect((await POST(formRequest(PDF(500), "a.pdf") as never)).status).toBe(201);
  });

  it("a failed upload frees its slot", async () => {
    storeUpload.mockRejectedValueOnce(new Error("database down"));
    await expect(POST(formRequest(PDF(500), "a.pdf") as never)).rejects.toThrow("database down");
    expect(uploadLimiter().active()).toBe(0);
  });
});
