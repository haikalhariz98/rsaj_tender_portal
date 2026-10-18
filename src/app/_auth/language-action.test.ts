import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";

const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh: () => refresh() }));
const requireStaff = vi.fn();
vi.mock("./actor", () => ({ requireStaff: (o: unknown) => requireStaff(o) }));
const refuseForeignPost = vi.fn();
vi.mock("./cookies", () => ({ refuseForeignPost: () => refuseForeignPost() }));
const setStaffLanguage = vi.fn();
vi.mock("@/lib/auth/account-store", () => ({ setStaffLanguage: (...a: unknown[]) => setStaffLanguage(...a) }));

import { setLanguageAction } from "./language-action";

const actor = { kind: "STAFF", accountId: "a1" } as StaffActor;
const form = (v?: string | Blob) => {
  const f = new FormData();
  if (v !== undefined) f.set("language", v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  requireStaff.mockResolvedValue(actor);
  refuseForeignPost.mockResolvedValue(null);
  setStaffLanguage.mockResolvedValue({ changed: true });
});

describe("setLanguageAction", () => {
  it("saves a recognised language and refreshes once, asking for no permission", async () => {
    expect(await setLanguageAction(form("ms"))).toEqual({ ok: true });
    expect(requireStaff).toHaveBeenCalledWith({ on: "throw" });
    expect(setStaffLanguage).toHaveBeenCalledWith(actor, "ms");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "", "MS", "fr", new Blob(["ms"])])("refuses %j with a pair of words, saves nothing and never refreshes", async (bad) => {
    const result = await setLanguageAction(form(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.en.length).toBeGreaterThan(0);
      expect(result.message.ms.length).toBeGreaterThan(0);
    }
    expect(setStaffLanguage).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses a foreign origin without saving or refreshing", async () => {
    refuseForeignPost.mockResolvedValue({ code: "FOREIGN" });
    expect((await setLanguageAction(form("ms"))).ok).toBe(false);
    expect(setStaffLanguage).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("lets nobody-signed-in propagate and does not refresh", async () => {
    requireStaff.mockRejectedValue(new Error("NOT_SIGNED_IN"));
    await expect(setLanguageAction(form("ms"))).rejects.toThrow("NOT_SIGNED_IN");
    expect(refresh).not.toHaveBeenCalled();
  });
});
