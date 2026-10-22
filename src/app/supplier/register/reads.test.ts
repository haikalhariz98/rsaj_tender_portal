import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The public registration's two reads (ADR 0041, plan 2.4): a fresh form token, and a search of the registration codes. The database is stood in; the guards run.
 */

const h = vi.hoisted(() => ({ where: null as unknown, take: 0, rows: [] as unknown[] }));
vi.mock("@/lib/db", () => ({
  db: {
    registrationValue: {
      findMany: async (q: { where: unknown; take: number }) => {
        h.where = q.where;
        h.take = q.take;
        return h.rows;
      },
    },
  },
}));
vi.mock("@/lib/portal/deployment", () => ({ deploymentOrganisation: async () => ({ id: "org-public-1", code: "ORG", timeZone: "Asia/Kuala_Lumpur" }) }));

import { checkFormToken } from "@/lib/auth/form-secret";
import { FORM_SECRET_MIN_LENGTH, signFormToken } from "@/lib/auth/form-token";
import { REGISTER_VALUES_MAX_HITS } from "@/lib/portal/register/contract";

import { GET as token } from "./token/route";
import { GET as values } from "./values/route";

const KEY = "k".repeat(FORM_SECRET_MIN_LENGTH);
const registerToken = () => signFormToken(KEY, "register", new Date(), "AAAAAAAAAAAAAAAAAAAAAA");
const ask = (path: string, headers: Record<string, string> = {}) => new Request(`http://portal.example${path}`, { headers: { "sec-fetch-site": "same-origin", ...headers } });

beforeEach(() => {
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  h.where = null;
  h.rows = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("a fresh form token", () => {
  it("is a register token with its own nonce, good now, never cached; two in a row differ", async () => {
    const a = await token(ask("/supplier/register/token"));
    const b = await token(ask("/supplier/register/token"));
    expect(a.headers.get("cache-control")).toBe("no-store");
    const [ja, jb] = [await a.json(), await b.json()];
    expect(ja.ok).toBe(true);
    expect(ja.token).toMatch(/^\d+\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(checkFormToken("register", ja.token)).toBe("OK");
    expect(ja.token).not.toBe(jb.token);
  });

  it("is refused to a request another site started, and closed while the form key is not set", async () => {
    const cross = await token(ask("/supplier/register/token", { "sec-fetch-site": "cross-site" }));
    expect([cross.status, (await cross.json()).code]).toEqual([403, "CROSS_SITE"]);
    vi.stubEnv("PORTAL_FORM_SECRET", "");
    const closed = await token(ask("/supplier/register/token"));
    expect([closed.status, (await closed.json()).code]).toEqual([503, "CLOSED"]);
  });
});

describe("the code search", () => {
  const path = "/supplier/register/values?body=body-works-board-01&kind=GRADE&q=gr";

  it("answers live values of the deployment's organisation, at most fifty, each with its code and name", async () => {
    h.rows = [{ id: "value-grade-1-0001", kind: "GRADE", code: "G1", nameEn: "Grade 1", bodyId: "body-works-board-01" }];
    const res = await values(ask(path, { "x-form-token": registerToken() }));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, hits: [{ id: "value-grade-1-0001", code: "G1", name: "Grade 1", kind: "GRADE", bodyId: "body-works-board-01" }] });
    expect(h.take).toBe(REGISTER_VALUES_MAX_HITS);
    expect(h.where).toMatchObject({ organisationId: "org-public-1", bodyId: "body-works-board-01", kind: "GRADE" });
    expect(JSON.stringify(h.where)).toMatch(/"retiredOn":null/);
  });

  it("needs the register token: none, another form's, or a forged one is out of date; no key is closed", async () => {
    for (const t of [null, signFormToken(KEY, "registration", new Date()), signFormToken("x".repeat(FORM_SECRET_MIN_LENGTH), "register", new Date(), "AAAAAAAAAAAAAAAAAAAAAA")]) {
      const res = await values(ask(path, t ? { "x-form-token": t } : {}));
      expect([res.status, (await res.json()).code]).toEqual([400, "FORM_EXPIRED"]);
    }
    expect(h.where).toBeNull();
    vi.stubEnv("PORTAL_FORM_SECRET", "");
    expect((await values(ask(path))).status).toBe(503);
  });

  it("refuses another site, a search under two characters, and a list it cannot name, reading nothing", async () => {
    const cross = await values(ask(path, { "sec-fetch-site": "cross-site", "x-form-token": registerToken() }));
    expect(cross.status).toBe(403);
    for (const p of ["/supplier/register/values?body=body-works-board-01&q=g", "/supplier/register/values?body=body-works-board-01", "/supplier/register/values?body=x&q=grade"]) {
      const res = await values(ask(p, { "x-form-token": registerToken() }));
      expect([res.status, (await res.json()).code], p).toEqual([400, "VALIDATION"]);
    }
    expect(h.where).toBeNull();
  });
});
