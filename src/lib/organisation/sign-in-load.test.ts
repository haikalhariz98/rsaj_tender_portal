import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { organisation: { findUnique } } }));

import { loadSignInBranding } from "./sign-in-load";

const NOW = new Date("2027-03-01T12:00:00Z");

beforeEach(() => {
  findUnique.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the organisation the sign-in page names", () => {
  it("is named as the shell names it: by its short name", async () => {
    findUnique.mockResolvedValueOnce({ name: "Example Utilities Sdn Bhd", shortName: "Example", timeZone: null, logo: null, signInImage: null, signInPage: null });
    const { view } = await loadSignInBranding("org-1", NOW);
    expect(view.organisationName).toBe("Example");
  });

  it("falls back to the legal name when there is no short name", async () => {
    findUnique.mockResolvedValueOnce({ name: "Example Utilities Sdn Bhd", shortName: " ", timeZone: null, logo: null, signInImage: null, signInPage: null });
    const { view } = await loadSignInBranding("org-1", NOW);
    expect(view.organisationName).toBe("Example Utilities Sdn Bhd");
  });

  it("still has the name when the picture and words cannot be read", async () => {
    findUnique.mockRejectedValueOnce(new Error("relation does not exist"));
    findUnique.mockResolvedValueOnce({ name: "Example Utilities Sdn Bhd", shortName: "Example", timeZone: "Asia/Kuala_Lumpur" });
    const branding = await loadSignInBranding("org-1", NOW);
    expect(branding.view.organisationName).toBe("Example");
    expect(branding.view.hasPanel).toBe(false);
    expect(branding.imageSha).toBeNull();
    expect(branding.logo).toBeNull();
  });

  it("is nameless, and the form still shows, when nothing at all can be read", async () => {
    findUnique.mockRejectedValue(new Error("database is down"));
    const branding = await loadSignInBranding("org-1", NOW);
    expect(branding.view.organisationName).toBe("");
    expect(branding.view.hasPanel).toBe(false);
  });

  it("carries the logo's own size, so the page can reserve its room", async () => {
    findUnique.mockResolvedValueOnce({ name: "Example", shortName: null, timeZone: null, logo: { sha256: "abc", width: 512, height: 512 }, signInImage: null, signInPage: null });
    const { logo } = await loadSignInBranding("org-1", NOW);
    expect(logo).toEqual({ sha: "abc", width: 512, height: 512 });
  });

  it("carries the logo for dark backgrounds when one is set, and null when it is not (nothing stands in for it)", async () => {
    findUnique.mockResolvedValueOnce({ name: "Example", shortName: null, timeZone: null, logo: { sha256: "abc", width: 512, height: 512 }, signInDarkLogo: { sha256: "def", width: 400, height: 120 }, signInImage: null, signInPage: null });
    expect((await loadSignInBranding("org-1", NOW)).darkLogo).toEqual({ sha: "def", width: 400, height: 120 });
    findUnique.mockResolvedValueOnce({ name: "Example", shortName: null, timeZone: null, logo: { sha256: "abc", width: 512, height: 512 }, signInImage: null, signInPage: null });
    expect((await loadSignInBranding("org-1", NOW)).darkLogo).toBeNull();
  });

  it("a logo for dark backgrounds alone is enough for a panel", async () => {
    findUnique.mockResolvedValueOnce({ name: "Example", shortName: null, timeZone: null, logo: null, signInDarkLogo: { sha256: "def", width: 400, height: 120 }, signInImage: null, signInPage: null });
    expect((await loadSignInBranding("org-1", NOW)).view.hasPanel).toBe(true);
  });
});
