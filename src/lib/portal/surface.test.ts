import { describe, expect, it } from "vitest";

import { publicAllows, surfaceOf, type PublicRequest } from "./surface";

const get = (pathname: string, o: Partial<PublicRequest> = {}) => publicAllows({ method: "GET", pathname, hasServerAction: false, ...o });

describe("which copy this is", () => {
  it("is the staff copy only when nothing, or internal, is said", () => {
    expect(surfaceOf(undefined)).toBe("internal");
    expect(surfaceOf("")).toBe("internal");
    expect(surfaceOf("Internal")).toBe("internal");
    expect(surfaceOf("public")).toBe("public");
  });
  it("closes the door on a misspelling", () => {
    expect(surfaceOf("publc")).toBe("public");
    expect(surfaceOf("1")).toBe("public");
  });
});

describe("the public copy", () => {
  it("serves the portal's pages, an opportunity by id, the logo and the platform files", () => {
    for (const p of ["/supplier", "/supplier/", "/supplier/opportunities", "/supplier/opportunities/demo_sx18", "/supplier/results", "/supplier/register", "/supplier/bids", "/supplier/company", "/supplier/projects", "/organisation/logo/ab12CD", "/_next/static/chunks/a.js", "/favicon.ico"]) {
      expect(get(p), p).toBe(true);
    }
  });

  it("refuses every staff screen, including the exercise under the id the portal hands out", () => {
    for (const p of ["/", "/sourcing/demo_sx18", "/sourcing", "/suppliers", "/suppliers/abc", "/suppliers/new", "/configuration/awards", "/awards", "/approvals", "/committees", "/documents", "/projects", "/requisitions", "/securities", "/organisation", "/api/documents", "/api/authority/resolve", "/api/method/determine"]) {
      expect(get(p), p).toBe(false);
    }
  });

  it("refuses a look-alike path: a deeper path, a traversal, an encoded slash, a different case", () => {
    for (const p of ["/supplier/opportunities/demo_sx18/documents", "/supplier/opportunities/../../sourcing/x", "/supplier/opportunities/..%2Fsourcing%2Fx", "/supplier/opportunities/a/b", "/Supplier", "/supplier//opportunities", "/supplier/register/submit/x", "/supplierx", "/supplier/anything", "/organisation/logo", "/organisation/logo/a/b", "/_nextx/a", "//sourcing/x"]) {
      expect(get(p), p).toBe(false);
    }
  });

  it("takes one write from a stranger, at the submit route, and no other", () => {
    expect(publicAllows({ method: "POST", pathname: "/supplier/register/submit", hasServerAction: false })).toBe(true);
    for (const p of ["/supplier/register", "/sourcing/demo_sx18", "/configuration/awards", "/suppliers/new", "/supplier/opportunities/x"]) {
      expect(publicAllows({ method: "POST", pathname: p, hasServerAction: false }), p).toBe(false);
    }
    for (const m of ["PUT", "PATCH", "DELETE", "OPTIONS"]) expect(publicAllows({ method: m, pathname: "/supplier/register/submit", hasServerAction: false })).toBe(false);
  });

  it("refuses every request that names a server action, wherever it is posted", () => {
    expect(publicAllows({ method: "POST", pathname: "/supplier/register", hasServerAction: true })).toBe(false);
    expect(publicAllows({ method: "POST", pathname: "/supplier/register/submit", hasServerAction: true })).toBe(false);
    expect(get("/supplier", { hasServerAction: true })).toBe(false);
  });
});
