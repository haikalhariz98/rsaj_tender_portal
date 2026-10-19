import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The data-export file route (N2, the PDPA right of access), end to end through a bare `Request`: the guards in front of it, and what it sends. The store behind it is a stand-in that, like the
 * real one, keeps the SHA-256 of the file's UTF-8 bytes beside the row; the database-backed half (the row, its audit entry, the SULIT events) is `src/lib/portal/data-export.db.test.ts`.
 */

const h = vi.hoisted(() => ({ readSession: vi.fn(), exportData: vi.fn(), rows: [] as { form: string; sha256: string | null }[] }));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", () => ({ readSupplierSession: h.readSession, signOutSupplierToken: vi.fn() }));
vi.mock("@/lib/portal/data-export-store", () => ({ exportSupplierData: h.exportData }));

import { FORM_SECRET_MIN_LENGTH, signFormToken, type FormPurpose } from "@/lib/auth/form-token";
import { SUPPLIER_DATA_EXPORT } from "@/lib/auth/routes";
import type { SupplierActor } from "@/lib/auth/types";

import { GET, HEAD } from "./route";

const KEY = "s".repeat(FORM_SECRET_MIN_LENGTH);
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
const JSON_TEXT = `${JSON.stringify({ format: "perolehan-supplier-export", version: 1, supplier: { name: "Sampel Kerja Sdn Bhd – Ä é 日本" } }, null, 2)}\n`;
const token = (purpose: FormPurpose = "data-export") => signFormToken(KEY, purpose, new Date());
const get = (o: { headers?: Record<string, string>; token?: string | null } = {}) => {
  const t = o.token !== undefined ? o.token : token();
  return new Request(`http://portal.example${SUPPLIER_DATA_EXPORT.file}${t ? `?t=${t}` : ""}`, { headers: { "sec-fetch-site": "same-origin", ...o.headers } });
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  h.readSession.mockReset();
  h.exportData.mockReset();
  h.rows.length = 0;
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
  h.exportData.mockImplementation(async (_actor: SupplierActor, form: "FILE" | "PAGE") => {
    h.rows.push({ form, sha256: form === "FILE" ? createHash("sha256").update(Buffer.from(JSON_TEXT, "utf8")).digest("hex") : null });
    return { export: {}, json: JSON_TEXT, fileName: "supplier-data-S-0001-2026-10-19.json", liveLinks: new Map() };
  });
});

describe("the data-export file route", () => {
  it("is not found on the staff copy", async () => {
    vi.stubEnv("PORTAL_SURFACE", "");
    const res = await GET(get());
    expect(res.status).toBe(404);
    expect(h.readSession).not.toHaveBeenCalled();
    expect(h.exportData).not.toHaveBeenCalled();
  });

  it("is refused when nobody is signed in, and nothing is exported", async () => {
    h.readSession.mockResolvedValue({ ok: false });
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(h.exportData).not.toHaveBeenCalled();
  });

  it("is refused on a request another site started, and nothing is read or exported", async () => {
    const res = await GET(get({ headers: { "sec-fetch-site": "cross-site" } }));
    expect([res.status, (await res.json()).code]).toEqual([403, "CROSS_SITE"]);
    expect(h.readSession).not.toHaveBeenCalled();
    expect(h.exportData).not.toHaveBeenCalled();
  });

  it("is refused without a token for this form, or with one made for another", async () => {
    for (const t of [null, token("bids"), token("projects")]) {
      const res = await GET(get({ token: t }));
      expect([res.status, (await res.json()).code], String(t)).toEqual([400, "FORM_EXPIRED"]);
    }
    expect(h.exportData).not.toHaveBeenCalled();
  });

  it("sends the file as an attachment, never cached, and its digest is the stored row's", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="supplier-data-S-0001-2026-10-19.json"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(res.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(JSON.parse(bytes.toString("utf8")).format).toBe("perolehan-supplier-export");
    expect(h.exportData).toHaveBeenCalledTimes(1);
    expect(h.exportData.mock.calls[0]).toEqual([ACTOR, "FILE"]);
    expect(h.rows).toHaveLength(1);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(h.rows[0].sha256);
  });

  it("answers 404 when the supplier is gone, and a HEAD reads and records nothing", async () => {
    h.exportData.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(404);
    h.exportData.mockClear();
    expect((await HEAD()).status).toBe(405);
    expect(h.exportData).not.toHaveBeenCalled();
  });
});
