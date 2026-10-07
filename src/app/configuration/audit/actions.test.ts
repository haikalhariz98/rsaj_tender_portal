import { describe, expect, it, vi } from "vitest";

const { findOrganisation } = vi.hoisted(() => ({ findOrganisation: vi.fn(async () => null) }));

vi.mock("@/app/_auth/actor", async () => (await import("@/lib/test-support/staff")).actorModule());
vi.mock("@/lib/db", () => ({ db: { organisation: { findUnique: findOrganisation } } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { exportAuditTrail } from "./actions";

/**
 * The export holds the sign-in accounts' history, so it needs the permission to read and export the trail (Phase 3b: audit.read): the signed-in officer of these tests holds
 * no permission, so the export is refused before anything is read.
 */
describe("exporting the audit trail", () => {
  it("is refused to a signed-in person who does not hold audit.read, before any row is read", async () => {
    const form = new FormData();
    form.set("fromDay", "2026-09-01");
    form.set("toDay", "2026-09-30");
    const result = await exportAuditTrail({ ok: false }, form);
    expect(result).toEqual({ ok: false, message: "Not permitted: audit.read" });
    expect(findOrganisation).not.toHaveBeenCalled();
  });
});
