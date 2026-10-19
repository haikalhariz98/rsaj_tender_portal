import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ received: 0 }));
vi.mock("../receive", () => ({
  receiveApplication: async () => {
    h.received += 1;
    return { ok: true, reference: "R-1" };
  },
}));

import { POST } from "./route";
import { toPosix } from "@/lib/scan/files";

/// What a browser sends with a form posted from a page of the same origin. Phase 4a: the route passes the Origin guard, so a test that means to be let in says where it came from.
const SAME_ORIGIN = { "sec-fetch-site": "same-origin", origin: "http://portal.example", host: "portal.example" };

/// The HTTP layer states a body's size; a bare Request does not, so the test says it.
const post = async (body: BodyInit, headers: Record<string, string> = {}, origin: Record<string, string> = SAME_ORIGIN) => {
  const req = new Request("http://portal.example/supplier/register/submit", { method: "POST", body, headers: { ...origin, ...headers } });
  const size = (await req.clone().arrayBuffer()).byteLength;
  return POST(new Request(req, { headers: { ...Object.fromEntries(req.headers), ...origin, ...headers, "content-length": String(size) } }));
};

describe("the public registration route", () => {
  it("answers a form with the application's state, never cached", async () => {
    const f = new FormData();
    f.set("registeredName", "Sampel");
    const res = await post(f);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, reference: "R-1" });
  });

  it("refuses a post from another site, one that does not say where it came from and one of the wrong type, before reading anything", async () => {
    h.received = 0;
    const f = () => {
      const x = new FormData();
      x.set("registeredName", "Sampel");
      return x;
    };
    const cross = await post(f(), {}, { ...SAME_ORIGIN, "sec-fetch-site": "cross-site" });
    expect(cross.status).toBe(403);
    expect(await cross.json()).toMatchObject({ ok: false, code: "CROSS_SITE" });
    const noOrigin = await post(f(), {}, { host: "portal.example" });
    expect(noOrigin.status).toBe(403);
    expect(await noOrigin.json()).toMatchObject({ ok: false, code: "NO_ORIGIN" });
    const elsewhere = await post(f(), {}, { ...SAME_ORIGIN, origin: "http://evil.example" });
    expect(elsewhere.status).toBe(403);
    expect(await elsewhere.json()).toMatchObject({ ok: false, code: "WRONG_ORIGIN" });
    const plain = await post("registeredName=Sampel", { "content-type": "text/plain" });
    expect(plain.status).toBe(415);
    expect(await plain.json()).toMatchObject({ ok: false, code: "WRONG_CONTENT_TYPE" });
    expect(h.received).toBe(0);
  });

  it("refuses a body of no stated size or past the limit before reading it", async () => {
    h.received = 0;
    const big = await post("x".repeat(40 * 1024), { "content-type": "multipart/form-data; boundary=x" });
    expect(big.status).toBe(413);
    expect(h.received).toBe(0);
  });

  it("refuses a body that is not a form", async () => {
    // JSON is not a type this route accepts at all (its body is a form), so it is turned away at the guard.
    const res = await post("{}", { "content-type": "application/json" });
    expect(res.status).toBe(415);
    // A multipart body that is not one is a bad request, once it has passed the guard.
    const bad = await post("not a form", { "content-type": "multipart/form-data; boundary=x" });
    expect(bad.status).toBe(400);
  });
});

describe("the portal's own folder", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [toPosix(join(dir, f))]));
  it("holds no server action: the public copy refuses every one, so the form posts to a route", () => {
    const offenders = files(join(process.cwd(), "src", "app", "supplier"))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
      .filter((f) => /^\s*["']use server["']/m.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
