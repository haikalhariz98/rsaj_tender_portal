import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { proxy } from "./proxy";

const call = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => proxy(new NextRequest(`http://portal.example${url}`, init));
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

afterEach(() => {
  delete process.env.PORTAL_SURFACE;
});

describe("the route boundary", () => {
  it("passes everything on the staff copy", () => {
    expect(passes(call("/sourcing/demo_sx18"))).toBe(true);
    expect(passes(call("/configuration/awards", { method: "POST", headers: { "next-action": "abc" } }))).toBe(true);
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
    expect(root.headers.get("location")).toBe("/supplier");
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
