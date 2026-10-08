import { describe, expect, it } from "vitest";

import { gate, publicAllows, surfaceOf, type GateRequest, type PublicRequest } from "./surface";

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

  it("serves the platform's static files and not its image optimiser or its data routes", () => {
    expect(get("/_next/static/media/font.woff2")).toBe(true);
    for (const p of ["/_next/image", "/_next/data/x.json", "/_next", "/_next/", "/_next/server/app/x.js", "/_nextx/static/a"]) expect(get(p), p).toBe(false);
  });

  it("refuses a look-alike path: a deeper path, a traversal, an encoded slash, a different case", () => {
    for (const p of ["/supplier/opportunities/demo_sx18/documents", "/supplier/opportunities/../../sourcing/x", "/supplier/opportunities/..%2Fsourcing%2Fx", "/supplier/opportunities/a/b", "/Supplier", "/supplier//opportunities", "/supplier/register/submit/x", "/supplierx", "/supplier/anything", "/organisation/logo", "/organisation/logo/a/b", "/sign-in", "/sign-in/image/abc", "/_nextx/a", "//sourcing/x"]) {
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

  it("serves the supplier portal's sign-in, activation, reset and account pages, each at its one literal path (Phase 4a)", () => {
    for (const p of ["/supplier/sign-in", "/supplier/activate", "/supplier/reset", "/supplier/account", "/supplier/account/"]) expect(get(p), p).toBe(true);
    for (const p of ["/supplier/sign-in/submit", "/supplier/account/password", "/supplier/sign-in/", "/supplier/accounts", "/supplier/account/x", "/supplier/sign-in/x", "/supplier/Activate"]) expect(get(p), p).toBe(p === "/supplier/sign-in/");
  });

  it("takes the supplier portal's writes at their literal paths and no others, and no other method (Phase 4a)", () => {
    const posts = ["/supplier/sign-in/submit", "/supplier/sign-out", "/supplier/activate/submit", "/supplier/reset/submit", "/supplier/account/password", "/supplier/account/sign-out-everywhere", "/supplier/account/acknowledge"];
    for (const p of posts) {
      expect(publicAllows({ method: "POST", pathname: p, hasServerAction: false }), p).toBe(true);
      expect(publicAllows({ method: "POST", pathname: p, hasServerAction: true }), `${p} as an action`).toBe(false);
      for (const m of ["PUT", "PATCH", "DELETE", "OPTIONS"]) expect(publicAllows({ method: m, pathname: p, hasServerAction: false }), `${m} ${p}`).toBe(false);
    }
    // The handlers are POSTs: a GET for one is not a page, so it is not found.
    for (const p of posts) expect(get(p), `GET ${p}`).toBe(false);
    for (const p of ["/supplier/sign-in", "/supplier/activate", "/supplier/reset", "/supplier/account", "/supplier/sign-in/submit/x", "/supplier/account/passwords", "/supplier/sign-out/x"]) {
      expect(publicAllows({ method: "POST", pathname: p, hasServerAction: false }), p).toBe(false);
    }
  });

  it("refuses every request that names a server action, wherever it is posted", () => {
    expect(publicAllows({ method: "POST", pathname: "/supplier/register", hasServerAction: true })).toBe(false);
    expect(publicAllows({ method: "POST", pathname: "/supplier/register/submit", hasServerAction: true })).toBe(false);
    expect(get("/supplier", { hasServerAction: true })).toBe(false);
  });
});

const ask = (o: Partial<GateRequest> & { pathname: string }) => gate({ surface: "internal", method: "GET", hasServerAction: false, staffCookie: false, supplierCookie: false, ...o }).kind;

describe("the route boundary with sign-in (Phase 1b)", () => {
  it("the staff copy: no cookie, a page goes to sign in, a post or an API call is told so", () => {
    expect(ask({ pathname: "/" })).toBe("signIn");
    expect(ask({ pathname: "/sourcing/x", method: "HEAD" })).toBe("signIn");
    expect(ask({ pathname: "/configuration/awards", method: "POST", hasServerAction: true })).toBe("unauthorised");
    expect(ask({ pathname: "/api/documents" })).toBe("unauthorised");
    expect(ask({ pathname: "/requisitions/line-template" })).toBe("signIn");
  });

  it("the staff copy: a cookie passes everything (the guards judge it); a supplier's cookie is not found", () => {
    for (const pathname of ["/", "/sourcing/x", "/api/documents", "/configuration/accounts"]) expect(ask({ pathname, staffCookie: true })).toBe("next");
    expect(ask({ pathname: "/sourcing/x", staffCookie: true, supplierCookie: true })).toBe("notFound");
    expect(ask({ pathname: "/sign-in", supplierCookie: true })).toBe("notFound");
  });

  it("the staff copy: with no cookie only the sign-in screens, the portal, the logo and the platform's files", () => {
    for (const pathname of ["/sign-in", "/sign-in/code", "/sign-in/image/abc", "/supplier", "/supplier/results", "/organisation/logo/abc", "/_next/static/a.js", "/favicon.ico"]) expect(ask({ pathname }), pathname).toBe("next");
    expect(ask({ pathname: "/sign-in", method: "POST", hasServerAction: true })).toBe("next");
    expect(ask({ pathname: "/supplier/register/submit", method: "POST" })).toBe("next");
    for (const pathname of ["/account", "/welcome", "/supplier/anything", "/_next/image", "/_next/data/x.json"]) expect(ask({ pathname }), pathname).not.toBe("next");
  });

  it("the development server's channels are open only in development", () => {
    expect(ask({ pathname: "/_next/webpack-hmr" })).toBe("signIn");
    expect(ask({ pathname: "/_next/webpack-hmr", development: true })).toBe("next");
    expect(ask({ pathname: "/__nextjs_original-stack-frames", development: true })).toBe("next");
    expect(ask({ pathname: "/sourcing/x", development: true })).toBe("signIn");
  });

  it("the supplier portal's sign-in is open to a stranger on both copies, and a supplier's cookie is the public copy's alone (Phase 4a)", () => {
    for (const pathname of ["/supplier/sign-in", "/supplier/activate", "/supplier/reset", "/supplier/account"]) {
      expect(ask({ surface: "public", pathname }), pathname).toBe("next");
      expect(ask({ surface: "public", pathname, supplierCookie: true }), pathname).toBe("next");
      expect(ask({ pathname }), pathname).toBe("next");
      // On the staff copy a supplier's cookie means nothing, so the whole request is not found.
      expect(ask({ pathname, supplierCookie: true }), pathname).toBe("notFound");
    }
    expect(ask({ surface: "public", pathname: "/supplier/sign-in/submit", method: "POST" })).toBe("next");
    expect(ask({ surface: "public", pathname: "/supplier/account/password", method: "POST", supplierCookie: true })).toBe("next");
    // A staff cookie on the public copy is still not found, even at the portal's own sign-in.
    expect(ask({ surface: "public", pathname: "/supplier/sign-in", staffCookie: true })).toBe("notFound");
  });

  it("the public copy: a staff cookie is not found, whatever it asks for; sign-in is not served at all", () => {
    expect(ask({ surface: "public", pathname: "/supplier", staffCookie: true })).toBe("notFound");
    expect(ask({ surface: "public", pathname: "/supplier" })).toBe("next");
    for (const pathname of ["/sign-in", "/sign-in/code", "/account", "/welcome"]) expect(ask({ surface: "public", pathname })).toBe("notFound");
    expect(ask({ surface: "public", pathname: "/sign-in", method: "POST", hasServerAction: true })).toBe("notFound");
  });
});

describe("the registration wizard (Phase 4b)", () => {
  const GETS = ["/supplier/registration", "/supplier/registration/values", "/supplier/registration/file"];
  const POSTS = ["/supplier/registration/save", "/supplier/registration/upload", "/supplier/registration/withdraw-file", "/supplier/registration/submit"];

  it("serves its page and its two reads on the public copy, each at one literal path", () => {
    for (const p of GETS) expect(get(p), p).toBe(true);
    for (const p of [...GETS.map((g) => `${g}/x`), "/supplier/registration/", "/supplier/Registration", "/supplier/registrations", "/supplier/registration/save/x", "/supplier/registration//file", "/supplier/registration/../account"]) {
      expect(get(p), p).toBe(p === "/supplier/registration/");
    }
  });

  it("takes its four writes at their literal paths, as route handlers only, and no other method", () => {
    for (const p of POSTS) {
      expect(publicAllows({ method: "POST", pathname: p, hasServerAction: false }), p).toBe(true);
      expect(publicAllows({ method: "POST", pathname: p, hasServerAction: true }), `${p} as an action`).toBe(false);
      for (const m of ["PUT", "PATCH", "DELETE", "OPTIONS"]) expect(publicAllows({ method: m, pathname: p, hasServerAction: false }), `${m} ${p}`).toBe(false);
      expect(get(p), `GET ${p}`).toBe(false);
    }
    // The reads take no write, and the page takes none.
    for (const p of GETS) expect(publicAllows({ method: "POST", pathname: p, hasServerAction: false }), `POST ${p}`).toBe(false);
  });

  it("is a supplier's alone: the staff copy has no such page for a supplier's cookie, and a staff cookie is not found on the public copy", () => {
    for (const pathname of [...GETS, ...POSTS]) {
      expect(ask({ pathname, supplierCookie: true }), `staff copy ${pathname}`).toBe("notFound");
      expect(ask({ surface: "public", pathname, staffCookie: true }), `public copy, staff cookie ${pathname}`).toBe("notFound");
      expect(ask({ surface: "public", pathname, supplierCookie: true, method: POSTS.includes(pathname) ? "POST" : "GET" }), `public copy ${pathname}`).toBe("next");
    }
  });
});
