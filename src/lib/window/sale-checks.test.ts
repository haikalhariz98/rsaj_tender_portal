import { describe, expect, it } from "vitest";

import { saleChecks } from "./sale-checks";

const sale = { authoritySighted: true, certSighted: "ORIGINAL" as const, certValidUntil: "2026-10-06", registrationCheck: "NOT_CHECKED" as const, suspensionCheck: "NOT_CHECKED" as const };
const cert = (closing: string | null, over = {}) => saleChecks({ ...sale, ...over }, closing).find((c) => c.text.startsWith("Status certificate"))!;

describe("the sale register's checks", () => {
  it("a certificate that expires before the closing warns, naming the closing's day", () => {
    const c = cert("2026-10-14");
    expect(c.warn).toBe(true);
    expect(c.text).toContain("expires before the closing (14 Oct 2026)");
  });
  it("is re-judged when the closing moves: an extension warns, a correction back clears", () => {
    expect(cert("2026-10-06").warn).toBe(false);
    expect(cert("2026-10-13").warn).toBe(true);
    expect(cert("2026-10-06").text).not.toContain("expires before");
  });
  it("a certificate valid past the closing is clear; one with no expiry, or not shown, warns", () => {
    expect(cert("2026-10-01").warn).toBe(false);
    expect(cert("2026-10-01", { certValidUntil: null }).warn).toBe(true);
    expect(cert("2026-10-01", { certSighted: "NOT_SHOWN" }).warn).toBe(true);
  });
  it("no certificate line where none was asked; the supplier register's checks are not-checked warnings", () => {
    const cs = saleChecks({ ...sale, certSighted: null }, "2026-10-14");
    expect(cs.map((c) => c.text)).toEqual(["Authority: sighted", "Registration: not checked", "Suspension: not checked"]);
    expect(cs.map((c) => c.warn)).toEqual([false, true, true]);
  });
});
