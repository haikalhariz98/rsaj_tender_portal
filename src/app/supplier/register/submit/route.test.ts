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

/// The HTTP layer states a body's size; a bare Request does not, so the test says it.
const post = async (body: BodyInit, headers: Record<string, string> = {}) => {
  const req = new Request("http://portal.example/supplier/register/submit", { method: "POST", body, headers });
  const size = (await req.clone().arrayBuffer()).byteLength;
  return POST(new Request(req, { headers: { ...Object.fromEntries(req.headers), ...headers, "content-length": String(size) } }));
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

  it("refuses a body of no stated size or past the limit before reading it", async () => {
    h.received = 0;
    const big = await post("x".repeat(40 * 1024), { "content-type": "text/plain" });
    expect(big.status).toBe(413);
    expect(h.received).toBe(0);
  });

  it("refuses a body that is not a form", async () => {
    const res = await post("{}", { "content-type": "application/json" });
    expect(res.status).toBe(400);
  });
});

describe("the portal's own folder", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  it("holds no server action: the public copy refuses every one, so the form posts to a route", () => {
    const offenders = files(join(process.cwd(), "src", "app", "supplier"))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
      .filter((f) => /^\s*["']use server["']/m.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
