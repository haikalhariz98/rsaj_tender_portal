import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STAFF_COOKIE, SUPPLIER_COOKIE } from "@/lib/auth/routes";

import { proxy } from "./proxy";

const call = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => proxy(new NextRequest(`http://portal.example${url}`, init));
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";
// The redirect is built from the request's address (Next relativises one to its own host before it answers), so a test reads where it goes, not how it is spelled.
const pathOf = (res: Response) => new URL(res.headers.get("location") ?? "", "http://portal.example").pathname;
const STAFF = { cookie: `${STAFF_COOKIE}=${"A".repeat(43)}` };


afterEach(() => {
  delete process.env.PORTAL_SURFACE;
});

describe("the route boundary", () => {
  // Phase 1b (the plan changes this): the staff copy no longer passes everything. It passes what a request with a staff session cookie asks for (the
  // guards in every page, action and route handler judge the cookie), and what needs no session: the sign-in screens, the portal's pages and the platform's files.
  it("passes what carries a staff cookie on the staff copy, whatever it asks for (the guards judge the cookie)", () => {
    expect(passes(call("/sourcing/demo_sx18", { headers: STAFF }))).toBe(true);
    expect(passes(call("/configuration/awards", { method: "POST", headers: { "next-action": "abc", ...STAFF } }))).toBe(true);
    expect(passes(call("/api/documents", { method: "POST", headers: STAFF }))).toBe(true);
  });

  it("sends a page request with no staff cookie to sign in, and answers a post or an API call 401", async () => {
    const page = call("/sourcing/demo_sx18");
    expect(page.status).toBe(307);
    expect(pathOf(page)).toBe("/sign-in");
    expect(pathOf(call("/"))).toBe("/sign-in");
    const post = call("/configuration/awards", { method: "POST", headers: { "next-action": "abc" } });
    expect(post.status).toBe(401);
    expect((await post.json()).code).toBe("NOT_SIGNED_IN");
    expect(call("/api/documents", { method: "POST" }).status).toBe(401);
    expect(call("/api/authority/resolve?domain=payment").status).toBe(401);
    expect(call("/requisitions/line-import", { method: "POST" }).status).toBe(401);
  });

  it("lets through, with no cookie, only the sign-in screens, the portal, the logo and the platform's files", () => {
    for (const path of ["/sign-in", "/sign-in/code", "/sign-in/image/" + "a".repeat(64), "/supplier", "/supplier/opportunities/demo_sx18", "/organisation/logo/abc123", "/_next/static/chunks/a.js", "/favicon.ico"]) expect(passes(call(path)), path).toBe(true);
    // The sign-in screens post their own actions with no cookie.
    expect(passes(call("/sign-in", { method: "POST", headers: { "next-action": "abc" } }))).toBe(true);
    expect(passes(call("/supplier/register/submit", { method: "POST" }))).toBe(true);
    // Not what looks like them.
    for (const path of ["/sign-in-not", "/account", "/welcome", "/_next/image?url=%2Fx&w=64&q=75", "/organisation/logo", "/supplierx"]) expect(passes(call(path)), path).toBe(false);
  });

  it("refuses a supplier's cookie on the staff copy, as not found", () => {
    const res = call("/sourcing/demo_sx18", { headers: { cookie: `${STAFF_COOKIE}=${"A".repeat(43)}; ${SUPPLIER_COOKIE}=${"B".repeat(43)}` } });
    expect(res.status).toBe(404);
    expect(call("/sign-in", { headers: { cookie: `${SUPPLIER_COOKIE}=${"B".repeat(43)}` } }).status).toBe(404);
  });

  it("lets the development server's own channels through unsigned, in development only", () => {
    expect(passes(call("/_next/webpack-hmr"))).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(passes(call("/_next/webpack-hmr"))).toBe(true);
    vi.unstubAllEnvs();
  });

  it("on the public copy: the portal passes and a staff path is not found", () => {
    process.env.PORTAL_SURFACE = "public";
    expect(passes(call("/supplier/opportunities/demo_sx18"))).toBe(true);
    expect(passes(call("/_next/static/chunks/a.js"))).toBe(true);
    expect(call("/_next/image?url=%2Fapi%2Fdocuments%2Fx&w=640&q=75").status).toBe(404);
    const staff = call("/sourcing/demo_sx18");
    expect(staff.status).toBe(404);
    expect(passes(staff)).toBe(false);
    expect(call("/suppliers/abc").status).toBe(404);
    expect(call("/configuration/awards").status).toBe(404);
  });

  it("on the public copy: the root is the portal's front door, nothing else is", () => {
    process.env.PORTAL_SURFACE = "public";
    const root = call("/");
    expect(root.status).toBe(307);
    expect(pathOf(root)).toBe("/supplier");
    expect(call("/", { method: "POST" }).status).toBe(404);
  });

  it("on the public copy: a staff server action posted to the portal's own form is refused", () => {
    process.env.PORTAL_SURFACE = "public";
    for (const path of ["/supplier/register", "/supplier/register/submit", "/configuration/awards", "/sourcing/demo_sx18"]) {
      expect(call(path, { method: "POST", headers: { "next-action": "40abcdef" } }).status, path).toBe(404);
    }
  });

  it("on the public copy: the one write is the submit route", () => {
    process.env.PORTAL_SURFACE = "public";
    expect(passes(call("/supplier/register/submit", { method: "POST" }))).toBe(true);
    expect(call("/supplier/register", { method: "POST" }).status).toBe(404);
  });
});

describe("staff sign-in is not on the public copy (Phase 1a)", () => {
  const staffAuth = ["/sign-in", "/sign-in/code", "/account", "/welcome"];

  it("answers every staff sign-in and account path with 404, to a read and to a post", () => {
    process.env.PORTAL_SURFACE = "public";
    for (const path of staffAuth) {
      expect(call(path).status, `GET ${path}`).toBe(404);
      expect(call(path, { method: "POST" }).status, `POST ${path}`).toBe(404);
      expect(call(path, { method: "POST", headers: { "next-action": "40abcdef" } }).status, `action ${path}`).toBe(404);
    }
  });

  it("a staff session cookie does not open anything on the public copy", () => {
    process.env.PORTAL_SURFACE = "public";
    const cookie = { cookie: "__Host-perolehan-staff=" + "A".repeat(43) };
    for (const path of [...staffAuth, "/sourcing/demo_sx18", "/configuration/security"]) expect(call(path, { headers: cookie }).status, path).toBe(404);
  });

  it("on the staff copy the sign-in screens pass through with no cookie (what they are shown to is the page's own check); the account pages need one", () => {
    for (const path of ["/sign-in", "/sign-in/code"]) expect(passes(call(path)), path).toBe(true);
    for (const path of ["/account", "/welcome"]) {
      expect(call(path).status, path).toBe(307);
      expect(passes(call(path, { headers: { cookie: `${STAFF_COOKIE}=${"A".repeat(43)}` } })), path).toBe(true);
    }
  });

  it("a staff cookie is refused on the portal's own pages and post on the public copy too", () => {
    process.env.PORTAL_SURFACE = "public";
    const cookie = { cookie: `${STAFF_COOKIE}=${"A".repeat(43)}` };
    expect(call("/supplier", { headers: cookie }).status).toBe(404);
    expect(call("/supplier/register/submit", { method: "POST", headers: cookie }).status).toBe(404);
    expect(call("/", { headers: cookie }).status).toBe(404);
    expect(passes(call("/supplier"))).toBe(true);
  });
});
