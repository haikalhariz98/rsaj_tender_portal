import { cache } from "react";
import { redirect } from "next/navigation";

import { clearedCookieHeader, readCookie, sessionCookieHeader } from "@/lib/auth/cookie-header";
import { checkFormToken, formSecret } from "@/lib/auth/form-secret";
import { FORM_TOKEN_FIELD, type FormPurpose } from "@/lib/auth/form-token";
import { FORM_TOKEN_HEADER } from "@/lib/auth/form-token-shape";
import { readJsonBody } from "@/lib/auth/json-body";
import { requestFacts, type RequestFacts } from "@/lib/auth/request";
import { foreignRequestFault } from "@/lib/auth/request-guard";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { refusalBody, REFUSAL_STATUS, type RouteRefusalCode } from "@/lib/auth/route-refusal";
import { SUPPLIER_COOKIE, SUPPLIER_SIGN_IN_PATH } from "@/lib/auth/routes";
import { readSupplierSession } from "@/lib/auth/supplier-session-store";
import { settingLabels } from "@/lib/auth/policy";
import type { AuditActor, SecurityPolicyKey, SupplierActor } from "@/lib/auth/types";
import { AUTH_WORDS } from "@/lib/auth/words";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

import { currentRequestFacts, supplierToken } from "./cookies";

/**
 * The one way to ask which supplier is signed in (ADR 0034 D7, Phase 4a): the supplier store's `requireStaff`.
 *
 * - A PAGE calls `requireSupplier()` first: nobody signed in is sent to the supplier sign-in page. The session is read once per request (`cache()`), from the database,
 *   re-checking the account, the contact and the deployment every time.
 * - A ROUTE HANDLER calls `supplierPost()` (a POST that changes something, from a page of this origin, carrying a form token) and the actor comes back with the
 *   request's facts. Handlers read the cookie from the request and answer their cookie as a `Set-Cookie` header, so none touches `next/headers`.
 *
 * The supplier's id is the session's, and only the session's: nothing in a request names the supplier an actor acts for, and a source scan holds the supplier
 * handlers and pages to that (`supplier-reach.test.ts`). Suppliers sign in on the PUBLIC copy only: on the internal copy nobody is ever a supplier, and the
 * proxy refuses a supplier cookie there.
 */

export const currentSupplierOrNull = cache(async (): Promise<SupplierActor | null> => {
  if (surfaceOf(process.env[SURFACE_ENV]) !== "public") return null;
  const token = await supplierToken();
  if (!token) return null;
  const read = await readSupplierSession(token, await currentRequestFacts());
  return read.ok ? read.actor : null;
});

/// The signed-in supplier, or the sign-in page. Asked first, before anything is read.
export async function requireSupplier(): Promise<SupplierActor> {
  const actor = await currentSupplierOrNull();
  if (!actor) redirect(SUPPLIER_SIGN_IN_PATH);
  return actor;
}

/// The actor an audit row is written with, for a supplier's own act.
export function toSupplierAuditActor(actor: SupplierActor): AuditActor {
  return { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress };
}

// ------------------------------------------------------------------------------------------------------------- route handlers

const refuse = (code: RouteRefusalCode, message?: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  Response.json({ ...refusalBody(code, message), ...extra }, { status: REFUSAL_STATUS[code], headers: { "Cache-Control": "no-store", ...headers } });

/// An answer from a portal handler: JSON, never cached, with the cookie it sets (if any) as a header.
export function portalReply(body: Record<string, unknown>, status = 200, cookie?: string): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
}

/// A form that did not pass: 400, one plain sentence per field.
export const validationReply = (errors: Record<string, string>) => portalReply({ ok: false, code: "VALIDATION", message: "Check the fields marked below.", error: "validation", errors }, 400);

/// The settings a closed sign-in is waiting for, in words.
export const closedReply = (unset: SecurityPolicyKey[]) =>
  portalReply({ ok: false, code: "CLOSED", message: `${AUTH_WORDS.policyNotSet.en}: ${settingLabels(unset).join("; ")}.`, error: "closed" }, 503);

export const supplierCookieHeader = (token: string, maxAgeSeconds: number) => sessionCookieHeader(SUPPLIER_COOKIE, token, maxAgeSeconds);
export const supplierCookieCleared = () => clearedCookieHeader(SUPPLIER_COOKIE);

export interface PortalPost {
  /// The form's fields, the token taken out.
  fields: Record<string, unknown>;
  facts: RequestFacts;
  /// The supplier cookie the request carried, or null.
  token: string | null;
}

/**
 * The first thing every portal POST does, before anything is read or written: this copy serves the portal (suppliers sign in on the public copy only), the request
 * came from a page of this origin with a JSON body, the body is a bounded JSON object, and it carries a good form token for this form. A refusal is a structured answer
 * (a stable `code` and a human `message`) the handler returns as it is.
 */
export async function readPortalPost(request: Request, purpose: FormPurpose, env: Record<string, string | undefined> = process.env, opts: { maxBytes?: number } = {}): Promise<{ ok: true; post: PortalPost } | { ok: false; response: Response }> {
  if (surfaceOf(env[SURFACE_ENV]) !== "public") return { ok: false, response: refuse("NOT_FOUND", "Not found") };
  const fault = foreignRequestFault(request, ["application/json"], env);
  if (fault) return { ok: false, response: refuse(fault.code, fault.message) };
  const read = await readJsonBody(request, opts.maxBytes);
  if (!read.ok) return { ok: false, response: Response.json({ ok: false, code: read.code, message: read.code === "TOO_LARGE" ? "That request is too large." : "That request could not be read.", error: "bad request" }, { status: read.status, headers: { "Cache-Control": "no-store" } }) };
  const { [FORM_TOKEN_FIELD]: token, ...fields } = read.body;
  const verdict = checkFormToken(purpose, typeof token === "string" ? token : null, new Date(), formSecret(env));
  if (verdict === "KEY_NOT_SET") return { ok: false, response: Response.json({ ok: false, code: "CLOSED", message: AUTH_WORDS.portalFormsClosed.en, error: "closed" }, { status: 503, headers: { "Cache-Control": "no-store" } }) };
  if (verdict !== "OK") return { ok: false, response: Response.json({ ok: false, code: "FORM_EXPIRED", message: AUTH_WORDS.formExpired.en, error: "form expired" }, { status: 400, headers: { "Cache-Control": "no-store" } }) };
  return { ok: true, post: { fields, facts: requestFacts((n) => request.headers.get(n)), token: readCookie(request.headers.get("cookie"), SUPPLIER_COOKIE) } };
}

/**
 * A POST from a signed-in supplier: the portal checks above, then who is signed in, read from the cookie the request carries and checked against the database. Nobody
 * signed in is told so (401). The actor's supplier is the session's.
 */
export async function supplierPost(request: Request, purpose: FormPurpose, opts: { maxBytes?: number } = {}): Promise<{ ok: true; actor: SupplierActor; post: PortalPost } | { ok: false; response: Response }> {
  const first = await readPortalPost(request, purpose, process.env, opts);
  if (!first.ok) return first;
  const read = await readSupplierSession(first.post.token, first.post.facts);
  if (!read.ok) return { ok: false, response: refuse("NOT_SIGNED_IN") };
  return { ok: true, actor: read.actor, post: first.post };
}

/// The header a multipart upload carries its form token in: the token cannot ride in a body that is not read until the guards have passed. Defined once, where the browser may read it.
export { FORM_TOKEN_HEADER };

type Guarded = { ok: true; actor: SupplierActor; facts: RequestFacts } | { ok: false; response: Response };

/**
 * A multipart upload from a signed-in supplier (Phase 4b), guarded in the same order as every portal POST and before a byte of the body is read: this copy serves the portal, the request
 * came from a page of this origin with a multipart body, it carries a good form token (in `x-form-token`, which a cross-site page cannot add without a preflight the portal never
 * answers), and a supplier is signed in. The supplier is the session's.
 */
export async function supplierUploadPost(request: Request, purpose: FormPurpose, env: Record<string, string | undefined> = process.env): Promise<Guarded> {
  if (surfaceOf(env[SURFACE_ENV]) !== "public") return { ok: false, response: refuse("NOT_FOUND", "Not found") };
  const fault = foreignRequestFault(request, ["multipart/form-data"], env);
  if (fault) return { ok: false, response: refuse(fault.code, fault.message) };
  const tokenFault = tokenRefusal(purpose, request.headers.get(FORM_TOKEN_HEADER), env);
  if (tokenFault) return { ok: false, response: tokenFault };
  const facts = requestFacts((n) => request.headers.get(n));
  const read = await readSupplierSession(readCookie(request.headers.get("cookie"), SUPPLIER_COOKIE), facts);
  if (!read.ok) return { ok: false, response: refuse("NOT_SIGNED_IN") };
  return { ok: true, actor: read.actor, facts };
}

/**
 * A read by a signed-in supplier (a search of codes, one of its own files): the copy, a request that no other site started (`Sec-Fetch-Site` is not `cross-site`; a typed address or a
 * link on the portal's own page passes), a good form token (in `x-form-token` or the query's `t`: a link cannot set a header), and a supplier signed in. A refusal writes nothing.
 */
export async function supplierGet(request: Request, purpose: FormPurpose, env: Record<string, string | undefined> = process.env): Promise<Guarded> {
  if (surfaceOf(env[SURFACE_ENV]) !== "public") return { ok: false, response: refuse("NOT_FOUND", "Not found") };
  if (downloadRequestFault(request.headers.get("sec-fetch-site"))) return { ok: false, response: refuse("CROSS_SITE", AUTH_WORDS.wrongOrigin.en) };
  const token = request.headers.get(FORM_TOKEN_HEADER) ?? new URL(request.url).searchParams.get("t");
  const tokenFault = tokenRefusal(purpose, token, env);
  if (tokenFault) return { ok: false, response: tokenFault };
  const facts = requestFacts((n) => request.headers.get(n));
  const read = await readSupplierSession(readCookie(request.headers.get("cookie"), SUPPLIER_COOKIE), facts);
  if (!read.ok) return { ok: false, response: refuse("NOT_SIGNED_IN") };
  return { ok: true, actor: read.actor, facts };
}

function tokenRefusal(purpose: FormPurpose, token: string | null, env: Record<string, string | undefined>): Response | null {
  const verdict = checkFormToken(purpose, token, new Date(), formSecret(env));
  if (verdict === "OK") return null;
  if (verdict === "KEY_NOT_SET") return Response.json({ ok: false, code: "CLOSED", message: AUTH_WORDS.portalFormsClosed.en, error: "closed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json({ ok: false, code: "FORM_EXPIRED", message: AUTH_WORDS.formExpired.en, error: "form expired" }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export { SUPPLIER_SIGN_IN_PATH };
