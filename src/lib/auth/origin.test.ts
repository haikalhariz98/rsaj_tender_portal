import { describe, expect, it } from "vitest";

import { originFault, type OriginCheck } from "./origin";

const request = (headers: Record<string, string>, over: Partial<OriginCheck> = {}): OriginCheck => ({
  method: "POST",
  header: (name) => headers[name.toLowerCase()] ?? null,
  contentTypes: ["application/json"],
  ...over,
});
const page = { host: "app.example", origin: "https://app.example", "sec-fetch-site": "same-origin", "content-type": "application/json" };
/// A browser that sends no Fetch Metadata.
const older = { host: page.host, origin: page.origin, "content-type": page["content-type"] };

describe("originFault", () => {
  it("lets a post from a page of this origin through", () => {
    expect(originFault(request(page))).toBeNull();
  });

  it("never judges a read", () => {
    expect(originFault(request({}, { method: "GET" }))).toBeNull();
    expect(originFault(request({ "sec-fetch-site": "cross-site" }, { method: "HEAD" }))).toBeNull();
  });

  it("refuses another site, and the address bar, which never posts", () => {
    expect(originFault(request({ ...page, "sec-fetch-site": "cross-site" }))?.code).toBe("CROSS_SITE");
    expect(originFault(request({ ...page, "sec-fetch-site": "same-site" }))?.code).toBe("CROSS_SITE");
    expect(originFault(request({ ...page, "sec-fetch-site": "none" }))?.code).toBe("CROSS_SITE");
  });

  it("refuses an origin that is not the host, a sibling subdomain included", () => {
    expect(originFault(request({ ...older, origin: "https://evil.example" }))?.code).toBe("WRONG_ORIGIN");
    expect(originFault(request({ ...older, origin: "https://other.app.example" }))?.code).toBe("WRONG_ORIGIN");
    expect(originFault(request({ ...older, origin: "not a url" }))?.code).toBe("WRONG_ORIGIN");
    // Same-origin metadata with a mismatched origin is still a mismatch.
    expect(originFault(request({ ...page, origin: "https://evil.example" }))?.code).toBe("WRONG_ORIGIN");
  });

  it("accepts the public host of a proxy that rewrites the Host header, when it is named in the configured list (Phase 1b review)", () => {
    // The browser is on perolehan.example.org; the proxy forwards to the app as its internal name, so Host differs from Origin.
    const proxied = { ...page, host: "app.internal:3000", origin: "https://perolehan.example.org" };
    expect(originFault(request(proxied))?.code).toBe("WRONG_ORIGIN");
    expect(originFault(request(proxied, { allowedHosts: ["perolehan.example.org"] }))).toBeNull();
    expect(originFault(request(proxied, { allowedHosts: ["PEROLEHAN.example.org"] }))).toBeNull();
    // Only the host named: not another, and not a sibling of it.
    expect(originFault(request({ ...proxied, origin: "https://evil.example" }, { allowedHosts: ["perolehan.example.org"] }))?.code).toBe("WRONG_ORIGIN");
    expect(originFault(request({ ...proxied, origin: "https://other.perolehan.example.org" }, { allowedHosts: ["perolehan.example.org"] }))?.code).toBe("WRONG_ORIGIN");
    // The list never lets another site through: Fetch Metadata and the content type are still judged.
    expect(originFault(request({ ...proxied, "sec-fetch-site": "cross-site" }, { allowedHosts: ["perolehan.example.org"] }))?.code).toBe("CROSS_SITE");
    expect(originFault(request({ ...proxied, "content-type": "text/plain" }, { allowedHosts: ["perolehan.example.org"] }))?.code).toBe("WRONG_CONTENT_TYPE");
  });

  it("accepts a browser that sends no Fetch Metadata when the origin matches, and refuses one that says nothing at all", () => {
    expect(originFault(request(older))).toBeNull();
    expect(originFault(request({ host: "app.example", "content-type": "application/json" }))?.code).toBe("NO_ORIGIN");
  });

  it("refuses text/plain, the type a cross-site form can send, and any type the route did not name", () => {
    expect(originFault(request({ ...page, "content-type": "text/plain" }))?.code).toBe("WRONG_CONTENT_TYPE");
    expect(originFault(request({ ...page, "content-type": "text/plain;charset=UTF-8" }))?.code).toBe("WRONG_CONTENT_TYPE");
    expect(originFault(request({ ...page, "content-type": "" }))?.code).toBe("WRONG_CONTENT_TYPE");
    expect(originFault(request({ ...page, "content-type": "Application/JSON; charset=utf-8" }))).toBeNull();
    expect(originFault(request({ ...page, "content-type": "multipart/form-data; boundary=x" }, { contentTypes: ["application/json", "multipart/form-data"] }))).toBeNull();
  });

  it("leaves the body of a server action to Next, which posts multipart or text/plain by design", () => {
    expect(originFault(request({ ...page, "content-type": "text/plain;charset=UTF-8" }, { contentTypes: null }))).toBeNull();
    expect(originFault(request({ ...page, "sec-fetch-site": "cross-site" }, { contentTypes: null }))?.code).toBe("CROSS_SITE");
  });

  it("believes X-Forwarded-Host only behind a trusted proxy", () => {
    const behind = { ...page, host: "internal:3000", "x-forwarded-host": "app.example" };
    expect(originFault(request(behind))?.code).toBe("WRONG_ORIGIN");
    expect(originFault(request(behind, { trustForwardedHost: true }))).toBeNull();
  });
});
