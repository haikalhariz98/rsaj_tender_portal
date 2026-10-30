import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The contractor's five JSON work routes (workspace 3b step 4), end to end through a bare `Request`: the portal's guards in front of each (the public copy, who is signed in, the form
 * token), the field-level 400 for a body that is not the shape (unknown fields refused, named), what the store is handed, and how its refusals are answered (an unshared item and
 * another's are the one 404; a throttle is 429 and says so; a change that came first is 409). The stores are stand-ins; the rules behind them are `portal.db.test.ts`.
 */

const h = vi.hoisted(() => ({ readSession: vi.fn(), raise: vi.fn(), reply: vi.fn(), move: vi.fn(), answer: vi.fn(), attach: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/supplier-session-store", () => ({ readSupplierSession: h.readSession, signOutSupplierToken: vi.fn() }));
vi.mock("@/lib/work/portal-store", () => ({ raiseAsContractor: h.raise, replyAsContractor: h.reply, moveAsContractor: h.move, answerAsContractor: h.answer, attachAsContractor: h.attach }));

import { FORM_SECRET_MIN_LENGTH, signFormToken } from "@/lib/auth/form-token";
import type { SupplierActor } from "@/lib/auth/types";
import { WorkRefused } from "@/lib/work/store";

import { POST as answer } from "./answer/route";
import { POST as attach } from "./attach/route";
import { POST as move } from "./move/route";
import { POST as raise } from "./raise/route";
import { POST as reply } from "./reply/route";

const KEY = "s".repeat(FORM_SECRET_MIN_LENGTH);
const SAME_ORIGIN = { "sec-fetch-site": "same-origin", origin: "http://portal.example", host: "portal.example" };
const ACTOR = { kind: "SUPPLIER", accountId: "acc1", sessionId: "ses1", supplierId: "sup_mine", organisationId: "o1" } as unknown as SupplierActor;
const CON = "contract_0001";

function post(url: string, fields: Record<string, unknown>, o: { token?: string | null } = {}) {
  const t = o.token !== undefined ? o.token : signFormToken(KEY, "projects", new Date());
  const body = JSON.stringify({ ...fields, ...(t ? { formToken: t } : {}) });
  return new Request(`http://portal.example${url}`, { method: "POST", body, headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), ...SAME_ORIGIN } });
}

const DOORS: [string, (r: Request) => Promise<Response>, string, Record<string, unknown>, ReturnType<typeof vi.fn>][] = [
  ["raise", raise, "/supplier/projects/work/raise", { contractId: CON, type: "RFI", title: "Level at grid C4?", dueOn: "2026-11-20" }, h.raise],
  ["reply", reply, "/supplier/projects/work/reply", { contractId: CON, item: "RFI-1", body: "Noted." }, h.reply],
  ["move", move, "/supplier/projects/work/move", { contractId: CON, item: "RFI-1", action: "SEND_FOR_CHECKING", expectedFrom: "TO_DO" }, h.move],
  ["answer", answer, "/supplier/projects/work/answer", { contractId: CON, item: "RFI-1", answer: "20 mm bars." }, h.answer],
  ["attach", attach, "/supplier/projects/work/attach", { contractId: CON, item: "RFI-1", stagedVersionIds: ["version_0001"] }, h.attach],
];

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PORTAL_SURFACE", "public");
  vi.stubEnv("PORTAL_FORM_SECRET", KEY);
  for (const f of Object.values(h)) f.mockReset();
  h.readSession.mockResolvedValue({ ok: true, actor: ACTOR, session: { id: "ses1", createdAt: new Date(), lastSeenAt: new Date(), absoluteExpiresAt: new Date() } });
  h.raise.mockResolvedValue({ id: "i1", ref: "RFI-1" });
  h.attach.mockResolvedValue({ count: 1 });
});

describe.each(DOORS)("%s", (_name, handler, url, good, store) => {
  it("is not found on the staff copy, refuses nobody signed in (401) and a form with no token, and reads nothing before the guard", async () => {
    vi.stubEnv("PORTAL_SURFACE", "");
    expect((await handler(post(url, good))).status).toBe(404);
    vi.stubEnv("PORTAL_SURFACE", "public");
    expect((await handler(post(url, good, { token: null }))).status).toBe(400);
    h.readSession.mockResolvedValue({ ok: false });
    expect((await handler(post(url, good))).status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });

  it("refuses an unknown field and a missing one with a field-level 400, and asks no store", async () => {
    const res = await handler(post(url, { ...good, supplierId: "sup_other", contractId: "x" }));
    const body = await res.json();
    expect([res.status, body.code]).toEqual([400, "VALIDATION"]);
    expect(body.errors).toMatchObject({ supplierId: "Not a field of this request.", contractId: expect.any(String) });
    expect(store).not.toHaveBeenCalled();
  });

  it("hands the store the session's actor and the parsed body, and answers ok", async () => {
    const res = await handler(post(url, good));
    expect([res.status, (await res.json()).ok]).toEqual([_name === "raise" ? 201 : 200, true]);
    expect(store.mock.calls[0][0]).toBe(ACTOR);
  });

  it("answers an unshared item's, another's and an unknown one's refusal as the one 404; a throttle as 429; a change that came first as 409", async () => {
    store.mockRejectedValueOnce(new WorkRefused("That item no longer exists.", 404));
    const missing = await handler(post(url, good));
    expect([missing.status, await missing.json()]).toEqual([404, { ok: false, code: "NOT_FOUND", message: "That is not something you can open." }]);
    store.mockRejectedValueOnce(new WorkRefused("You can raise 20 items in 60 minutes. Try again in 12 minutes.", 429));
    const slow = await handler(post(url, good));
    expect([slow.status, (await slow.json()).code]).toEqual([429, "THROTTLED"]);
    store.mockRejectedValueOnce(new WorkRefused("This changed a moment ago. Open it again to see where it is.", 409));
    const late = await handler(post(url, good));
    expect([late.status, (await late.json()).code]).toEqual([409, "CHANGED"]);
  });
});
