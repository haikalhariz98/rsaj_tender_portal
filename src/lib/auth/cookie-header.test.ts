import { describe, expect, it } from "vitest";

import { clearedCookieHeader, readCookie, sessionCookieHeader } from "./cookie-header";
import { STAFF_COOKIE, SUPPLIER_COOKIE } from "./routes";

describe("the session cookie as a header", () => {
  it("carries the attributes the staff cookie has: host-bound, HttpOnly, Secure, Lax", () => {
    const h = sessionCookieHeader(SUPPLIER_COOKIE, "tok", 3600.9);
    expect(h).toBe("__Host-perolehan-supplier=tok; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax");
    // A __Host- cookie has no Domain and its Path is /.
    expect(h).not.toMatch(/Domain/i);
    expect(h).toContain("Path=/");
    expect(h.startsWith("__Host-")).toBe(true);
  });

  it("is cleared by the same attributes and no life, never by a different name", () => {
    expect(clearedCookieHeader(SUPPLIER_COOKIE)).toBe("__Host-perolehan-supplier=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
    expect(sessionCookieHeader(SUPPLIER_COOKIE, "tok", -5)).toContain("Max-Age=0");
  });

  it("reads one cookie out of the request's header, and takes the right store's", () => {
    const header = `a=1; ${STAFF_COOKIE}=staffTok; ${SUPPLIER_COOKIE}=supplierTok; b=2`;
    expect(readCookie(header, SUPPLIER_COOKIE)).toBe("supplierTok");
    expect(readCookie(header, STAFF_COOKIE)).toBe("staffTok");
    expect(readCookie(header, "missing")).toBeNull();
    expect(readCookie(null, SUPPLIER_COOKIE)).toBeNull();
    expect(readCookie(`${SUPPLIER_COOKIE}=`, SUPPLIER_COOKIE)).toBeNull();
    // A cookie whose name merely ends with the name is not that cookie.
    expect(readCookie(`x${SUPPLIER_COOKIE}=evil`, SUPPLIER_COOKIE)).toBeNull();
  });
});
