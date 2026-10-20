import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { organisation: { findUnique } } }));

import { loadPortalBranding } from "./portal-load";

const NOW = new Date("2027-03-01T12:00:00Z");

beforeEach(() => {
  findUnique.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the supplier portal's front door, read for one organisation", () => {
  it("with nothing configured: the organisation's name, the product's own headline, no line, no highlights, no address", async () => {
    findUnique.mockResolvedValueOnce({ name: "Example Utilities Sdn Bhd", shortName: "Example", timeZone: null, logo: null, signInPage: null, portalPage: null });
    const b = await loadPortalBranding("org-1", NOW);
    expect(b.organisationName).toBe("Example");
    expect(b.year).toBe("2027");
    expect(b.logo).toBeNull();
    expect(b.links).toEqual([]);
    expect(b.view).toEqual({ headline: "Supplier portal", line: null, highlights: [], publicAddress: null });
  });

  it("carries the ordinary logo with its size, the footer links of the sign-in page and the portal's own words", async () => {
    findUnique.mockResolvedValueOnce({
      name: "Example",
      shortName: null,
      timeZone: null,
      logo: { sha256: "abc", width: 512, height: 512 },
      signInPage: { privacyUrl: "https://example.com/privacy" },
      portalPage: { headline: "Join us", line: "Register online.", highlight1: "Register", highlight1Icon: "building", publicAddress: "https://suppliers.example.com/x" },
    });
    const b = await loadPortalBranding("org-1", NOW);
    expect(b.logo).toEqual({ sha: "abc", width: 512, height: 512 });
    expect(b.links).toEqual([{ label: "Privacy", href: "https://example.com/privacy" }]);
    expect(b.view.headline).toBe("Join us");
    expect(b.view.highlights).toEqual([{ text: "Register", icon: "building" }]);
    expect(b.view.publicAddress).toBe("https://suppliers.example.com");
  });

  it("reads only the ordinary logo: never the staff picture or the dark logo, which the public copy refuses", async () => {
    findUnique.mockResolvedValueOnce({ name: "Example", shortName: null, timeZone: null, logo: null, signInPage: null, portalPage: null });
    await loadPortalBranding("org-1", NOW);
    const select = findUnique.mock.calls[0]![0].select as Record<string, unknown>;
    expect(Object.keys(select)).not.toContain("signInImage");
    expect(Object.keys(select)).not.toContain("signInDarkLogo");
  });

  it("draws the bare product state, with the name, when the words cannot be read, and never throws", async () => {
    findUnique.mockRejectedValueOnce(new Error('relation "OrganisationPortalPage" does not exist'));
    findUnique.mockResolvedValueOnce({ name: "Example Utilities Sdn Bhd", shortName: "Example", timeZone: "Asia/Kuala_Lumpur" });
    const b = await loadPortalBranding("org-1", NOW);
    expect(b.organisationName).toBe("Example");
    expect(b.view.headline).toBe("Supplier portal");
    expect(b.logo).toBeNull();
  });

  it("is nameless, and still draws, when nothing at all can be read", async () => {
    findUnique.mockRejectedValue(new Error("database is down"));
    const b = await loadPortalBranding("org-1", NOW);
    expect(b.organisationName).toBe("");
    expect(b.view.headline).toBe("Supplier portal");
  });

  it("with no organisation named, draws the bare state", async () => {
    const b = await loadPortalBranding(null, NOW);
    expect(b.organisationName).toBe("");
    expect(findUnique).not.toHaveBeenCalled();
  });
});
