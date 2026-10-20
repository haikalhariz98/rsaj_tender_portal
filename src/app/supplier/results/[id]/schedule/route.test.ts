import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The anonymous schedule download (go-live R4a, SEC-5): after the file is judged public and its bytes are proved, a fresh scan is taken at release. A configured scanner that
 * did not check the file, a scan that failed, and a deployment that requires a scanner but has none each give the same plain 404 and are logged. Stand-in stores; what is asked is recorded.
 */

const BYTES = new TextEncoder().encode("schedule");
const SHA = createHash("sha256").update(BYTES).digest("hex");

const h = vi.hoisted(() => ({
  loadResultSchedule: vi.fn(),
  logAccess: vi.fn(),
  scanner: { configured: false, scan: vi.fn() },
  required: false,
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/portal/repo", () => ({ loadResultSchedule: h.loadResultSchedule }));
vi.mock("@/lib/documents/service", () => ({ logAccess: h.logAccess }));
vi.mock("@/lib/integration/sealing-deployment", () => ({ liveAllowedByDeployment: () => h.required }));
vi.mock("@/lib/documents/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/documents/store")>()),
  blobStore: () => ({ store: { get: async () => BYTES } }),
  malwareScanner: () => h.scanner,
}));

import { GET } from "./route";

const found = (scanState: string) => ({
  organisationId: "org",
  schedule: { version: { id: "v1", sha256: SHA, mediaType: "application/pdf", originalFilename: "jadual.pdf", scanState, document: { classificationSnapshot: "PUBLIC" } } },
});
const get = () => GET(new Request("http://x/supplier/results/e1/schedule"), { params: Promise.resolve({ id: "e1" }) } as never);

describe("GET /supplier/results/[id]/schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.scanner.configured = false;
    h.required = false;
  });
  it("sends a Public file when no scanner is configured or required", async () => {
    h.loadResultSchedule.mockResolvedValue(found("NOT_SCANNED"));
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment/);
  });
  it("is a 404 for a result with no schedule", async () => {
    h.loadResultSchedule.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });
  it("is a 404, logged, when a scanner is configured and the file comes back unchecked", async () => {
    h.scanner.configured = true;
    h.scanner.scan.mockResolvedValue("NOT_SCANNED");
    h.loadResultSchedule.mockResolvedValue(found("CLEAN"));
    expect((await get()).status).toBe(404);
    expect(h.logAccess).toHaveBeenCalledWith(expect.objectContaining({ kind: "REFUSED", reasonCode: "NOT_SCANNED" }));
  });
  it("is a 404 when the scan fails", async () => {
    h.scanner.configured = true;
    h.scanner.scan.mockRejectedValue(new Error("down"));
    h.loadResultSchedule.mockResolvedValue(found("CLEAN"));
    expect((await get()).status).toBe(404);
    expect(h.logAccess).toHaveBeenCalledWith(expect.objectContaining({ reasonCode: "SCAN_ERROR" }));
  });
  it("is a 404 when the deployment requires a scanner and there is none", async () => {
    h.required = true;
    h.loadResultSchedule.mockResolvedValue(found("NOT_SCANNED"));
    expect((await get()).status).toBe(404);
    expect(h.logAccess).toHaveBeenCalledWith(expect.objectContaining({ reasonCode: "SCAN_ERROR" }));
  });
  it("sends the file when the scanner finds it clean", async () => {
    h.scanner.configured = true;
    h.scanner.scan.mockResolvedValue("CLEAN");
    h.loadResultSchedule.mockResolvedValue(found("NOT_SCANNED"));
    expect((await get()).status).toBe(200);
  });
});
