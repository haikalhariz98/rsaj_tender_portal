import { describe, expect, it, vi } from "vitest";

import { DOWNLOAD_POLICY, headerRules, SECURITY_HEADERS } from "./security-headers";

const value = (k: string) => SECURITY_HEADERS.find((h) => h.key === k)?.value;

describe("app-wide security headers (audit C-7)", () => {
  it("sets the four, with these values", () => {
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("Referrer-Policy")).toBe("same-origin");
    expect(value("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(value("Content-Security-Policy")).toBe("frame-ancestors 'self'");
  });
  it("the policy is the frame-ancestors directive only, so it cannot block what Next injects", () => {
    expect(value("Content-Security-Policy")!.split(";").map((d) => d.trim().split(" ")[0])).toEqual(["frame-ancestors"]);
  });
  it("sets no header twice", () => {
    const keys = SECURITY_HEADERS.map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("the rules handed to Next", () => {
  it("apply the four to every path", () => {
    const [all] = headerRules();
    expect(all.source).toBe("/:path*");
    expect(all.headers).toEqual(SECURITY_HEADERS);
  });
  it("add HSTS in production only", () => {
    expect(headerRules()[0].headers.some((h) => h.key === "Strict-Transport-Security")).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(headerRules()[0].headers).toContainEqual({ key: "Strict-Transport-Security", value: "max-age=31536000" });
    vi.unstubAllEnvs();
  });
  it("keep the download's own strict policy, which a general rule would otherwise replace", () => {
    const rules = headerRules();
    const dl = rules.find((r) => r.source === "/api/documents/versions/:path*")!;
    expect(dl.source).toBe("/api/documents/versions/:path*");
    expect(dl.headers).toEqual([{ key: "Content-Security-Policy", value: DOWNLOAD_POLICY }]);
    expect(DOWNLOAD_POLICY).toMatch(/default-src 'none'/);
    expect(DOWNLOAD_POLICY).toMatch(/\bsandbox\b/);
    expect(DOWNLOAD_POLICY).toMatch(/frame-ancestors 'self'/);
  });
  it("give the supplier's file routes the same strict policy (N2 review)", () => {
    for (const source of ["/supplier/account/data/file", "/supplier/registration/file", "/supplier/results/:id/schedule", "/supplier/bids/:id/download"]) {
      expect(headerRules().find((r) => r.source === source)?.headers).toEqual([{ key: "Content-Security-Policy", value: DOWNLOAD_POLICY }]);
    }
  });
  it("give the officer's sealed-file download the same strict policy (wave 3b step 14)", () => {
    const rule = headerRules().find((r) => r.source === "/api/opening/sealed-file");
    expect(rule?.headers).toEqual([{ key: "Content-Security-Policy", value: DOWNLOAD_POLICY }]);
  });
});
