import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { documentOrg, logAccess, storeUpload } = vi.hoisted(() => ({
  documentOrg: vi.fn(async () => ({ id: "org1", timeZone: "Asia/Kuala_Lumpur", today: "2026-10-01" })),
  logAccess: vi.fn(async (...args: unknown[]) => void args),
  storeUpload: vi.fn(async (...args: unknown[]) => ({ documentId: "d1", versionId: "v1", versionNo: 1, sha256: "x", byteSize: "0", mediaType: "application/pdf", status: "STAGED", warnings: [], args })),
}));

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
    const input = storeUpload.mock.calls[0][0] as { bytes: Uint8Array; originalFilename: string; title: string; mediaType: string };
    expect(input.bytes.byteLength).toBe(500);
    expect(input.originalFilename).toBe("a.pdf");
    expect(input.title).toBe("A title");
    expect(input.mediaType).toBe("application/pdf");
  });

  it("a cross-site request is refused before anything is read, and writes nothing (audit M-3)", async () => {
    const res = await POST(formRequest(PDF(500), "a.pdf", { ...SAME_SITE, "sec-fetch-site": "cross-site" }) as never);
    expect(res.status).toBe(403);
    expect(documentOrg).not.toHaveBeenCalled();
    expect(logAccess).not.toHaveBeenCalled();
    expect(storeUpload).not.toHaveBeenCalled();
  });

  it("a request without the upload header is refused and writes nothing", async () => {
    const res = await POST(formRequest(PDF(500), "a.pdf", { origin: SAME_SITE.origin, host: SAME_SITE.host, "sec-fetch-site": "same-origin" }) as never);
    expect(res.status).toBe(403);
    expect(logAccess).not.toHaveBeenCalled();
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
