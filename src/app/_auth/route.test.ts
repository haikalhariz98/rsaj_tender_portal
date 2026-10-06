import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STAFF_FIXTURE } from "@/lib/test-support/staff";
import type { StaffActor } from "@/lib/auth/types";

/**
 * The guard on every route handler (Phase 1b, threat model F3 and F9): who is signed in, and for a handler that changes anything, that the request came
 * from a page of this origin with a body of a type the route accepts. The session and the request's headers are stood in for; their own logic is tested
 * where it lives (`origin.test.ts`, the sign-in database tests).
 */

const h = vi.hoisted(() => ({ who: null as unknown, headers: new Headers() }));

vi.mock("./actor", () => ({ currentStaffOrNull: async () => h.who }));
vi.mock("next/headers", () => ({ headers: async () => h.headers, cookies: async () => ({ get: () => undefined }) }));

import { staffRoute } from "./route";

const ME: StaffActor = STAFF_FIXTURE;
const sameOrigin = (type: string) => new Headers({ host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin", "content-type": type });

beforeEach(() => {
  h.who = ME;
  h.headers = sameOrigin("application/json");
});
afterEach(() => {
  delete process.env.PORTAL_SURFACE;
});

const refused = async (g: Awaited<ReturnType<typeof staffRoute>>) => {
  if (g.ok) throw new Error("expected a refusal");
  return { status: g.response.status, body: (await g.response.json()) as { ok: boolean; code: string; message: string; error: string } };
};

describe("staffRoute", () => {
  it("nobody signed in is refused 401, with a stable code and a message, in the shape every route's answers carry", async () => {
    h.who = null;
    const r = await refused(await staffRoute());
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ ok: false, code: "NOT_SIGNED_IN" });
    expect(r.body.message).toBe(r.body.error);
    expect(r.body.message.length).toBeGreaterThan(5);
  });

  it("is checked before the request's origin: a cross-site post by nobody is told to sign in, and nothing about the request is judged", async () => {
    h.who = null;
    h.headers = new Headers({ "sec-fetch-site": "cross-site" });
    expect((await refused(await staffRoute({ contentTypes: ["application/json"] }))).status).toBe(401);
  });

  it("a read needs only a signed-in person, and names no content type", async () => {
    h.headers = new Headers();
    const g = await staffRoute();
    expect(g.ok && g.actor.personId).toBe(ME.personId);
  });

  it("a post from a page of this origin with a body the route accepts passes, charset or boundary parameters notwithstanding", async () => {
    expect((await staffRoute({ contentTypes: ["application/json"] })).ok).toBe(true);
    h.headers = sameOrigin("multipart/form-data; boundary=----x");
    expect((await staffRoute({ contentTypes: ["multipart/form-data"] })).ok).toBe(true);
    h.headers = sameOrigin("application/json; charset=utf-8");
    expect((await staffRoute({ contentTypes: ["application/json"] })).ok).toBe(true);
  });

  it("a cross-site post is refused 403 whatever it carries", async () => {
    h.headers = new Headers({ host: "localhost:3000", origin: "http://evil.example", "sec-fetch-site": "cross-site", "content-type": "application/json" });
    const r = await refused(await staffRoute({ contentTypes: ["application/json"] }));
    expect(r).toMatchObject({ status: 403, body: { code: "CROSS_SITE" } });
  });

  it("a post naming another origin, where the browser sent no Sec-Fetch-Site, is refused 403", async () => {
    h.headers = new Headers({ host: "localhost:3000", origin: "http://evil.example", "content-type": "application/json" });
    expect(await refused(await staffRoute({ contentTypes: ["application/json"] }))).toMatchObject({ status: 403, body: { code: "WRONG_ORIGIN" } });
  });

  it("text/plain, the type a cross-site form can send with no preflight, is never accepted, nor any type the route does not name", async () => {
    h.headers = sameOrigin("text/plain");
    expect(await refused(await staffRoute({ contentTypes: ["application/json"] }))).toMatchObject({ status: 415, body: { code: "WRONG_CONTENT_TYPE" } });
    h.headers = sameOrigin("application/x-www-form-urlencoded");
    expect((await refused(await staffRoute({ contentTypes: ["multipart/form-data"] }))).status).toBe(415);
    h.headers = sameOrigin("");
    expect((await refused(await staffRoute({ contentTypes: ["application/json"] }))).status).toBe(415);
  });

  it("the public copy has no staff handlers: not found, signed in or not", async () => {
    process.env.PORTAL_SURFACE = "public";
    expect(await refused(await staffRoute())).toMatchObject({ status: 404, body: { code: "NOT_FOUND" } });
  });

  it("a loader run (the demo, outside any request) has no request to judge, only the actor", async () => {
    h.who = { ...ME, system: { label: "demo loader" } };
    h.headers = new Headers();
    const g = await staffRoute({ contentTypes: ["application/json"] });
    expect(g.ok).toBe(true);
  });
});
