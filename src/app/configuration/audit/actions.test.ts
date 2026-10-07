import { describe, expect, it, vi } from "vitest";

const { findOrganisation } = vi.hoisted(() => ({ findOrganisation: vi.fn(async () => null) }));

vi.mock("@/app/_auth/actor", async () => (await import("@/lib/test-support/staff")).actorModule());
vi.mock("@/lib/db", () => ({ db: { organisation: { findUnique: findOrganisation } } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { EXPORT_NOT_ADMINISTRATOR_TEXT } from "@/lib/audit/export";

import { exportAuditTrail } from "./actions";

/**
 * The export holds the sign-in accounts' history, which History shows to administrators only (Phase 1b review): the signed-in officer of these tests is not
 * one, so the export is refused before anything is read.
 */
describe("exporting the audit trail", () => {
  it("is refused to a signed-in person who is not an administrator, before any row is read", async () => {
    const form = new FormData();
    form.set("fromDay", "2026-09-01");
    form.set("toDay", "2026-09-30");
    const result = await exportAuditTrail({ ok: false }, form);
    expect(result).toEqual({ ok: false, message: EXPORT_NOT_ADMINISTRATOR_TEXT });
    expect(findOrganisation).not.toHaveBeenCalled();
  });
});
