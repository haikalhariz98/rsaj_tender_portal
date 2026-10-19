import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionKey, StaffActor } from "@/lib/auth/types";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * The guard a configuration editor asks first (review of Phase 2a): an officer without the permission is refused, in words, as the form's own state; one who holds it
 * is let through. The session, the cookie and the lookup that words a refusal are stood in for: what is under test is the guard's decision and what it hands back.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("./cookies", () => ({ staffToken: async () => "token", currentRequestFacts: async () => ({ sourceAddress: null, userAgent: "vitest" }), refuseForeignPost: async () => null }));
vi.mock("@/lib/auth/session-store", () => ({ readStaffSession: async () => (who.actor ? { ok: true, actor: who.actor } : { ok: false }) }));
vi.mock("@/lib/auth/permission-store", () => ({ explainRefusal: async () => ({ words: { en: "Nobody at the organisation has decided who holds this permission." } }) }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/identity", () => ({ confirmStaffPassword: async () => ({ ok: false, kind: "WRONG" }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirected to ${to}`);
  },
}));

const actor = (over: Partial<StaffActor> = {}): StaffActor => ({
  kind: "STAFF",
  accountId: "a",
  sessionId: "s",
  personId: "p",
  personName: "Officer",
  jobTitle: null,
  isAdministrator: false,
  organisationId: "o",
  organisationCode: "O",
  organisationTimeZone: "Asia/Kuala_Lumpur",
  offices: [],
  permissions: new Set<PermissionKey>(),
  stepUpAt: null,
  sessionCreatedAt: new Date(),
  sourceAddress: null,
  mustChangePassword: false,
  ...over,
});

beforeEach(() => {
  who.actor = null;
});

describe("staffForPermission", () => {
  it("refuses an officer who holds no permission, in words the form shows, and an issue the same", async () => {
    const { staffForPermission } = await import("./actor");
    who.actor = actor();
    for (const key of ["configuration.draft", "configuration.issue"] as const) {
      const guard = await staffForPermission(key);
      expect(guard.ok).toBe(false);
      if (!guard.ok) expect(guard.state).toEqual({ ok: false, message: "Nobody at the organisation has decided who holds this permission." });
    }
  });

  it("lets an administrator through, who holds both through the flag, and an officer the organisation has granted the one", async () => {
    const { staffForPermission } = await import("./actor");
    who.actor = actor({ isAdministrator: true, permissions: new Set<PermissionKey>(["configuration.draft", "configuration.issue"]) });
    expect((await staffForPermission("configuration.draft")).ok).toBe(true);
    expect((await staffForPermission("configuration.issue")).ok).toBe(true);
    who.actor = actor({ permissions: new Set<PermissionKey>(["configuration.draft"]) });
    expect((await staffForPermission("configuration.draft")).ok).toBe(true);
    expect((await staffForPermission("configuration.issue")).ok).toBe(false);
  });

  it("sends nobody signed in to sign-in rather than answering a state", async () => {
    const { staffForPermission } = await import("./actor");
    who.actor = null;
    await expect(staffForPermission("configuration.draft")).rejects.toThrow(/redirected to \/sign-in/);
  });
});
