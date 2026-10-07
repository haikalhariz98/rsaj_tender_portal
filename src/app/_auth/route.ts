import { administrationConflict, type AdministratorAct } from "@/lib/auth/administration-conflict";
import type { StaffActor } from "@/lib/auth/types";
import { refusalBody, REFUSAL_STATUS, type RouteRefusalCode } from "@/lib/auth/route-refusal";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

import { currentStaffOrNull } from "./actor";
import { refuseForeignPost } from "./cookies";

/**
 * The guard on a route handler (Phase 1b, threat model F3 and F9): the first call in every handler that is not a public entry point.
 *
 * Asks who is signed in and, for a handler that changes anything, whether the request came from a page of this origin with a body of a type the
 * route accepts (`text/plain`, the type a cross-site form can send without a preflight, is never accepted). Answers a structured refusal the handler
 * returns as it is. A handler that reads only (GET, HEAD) names no `contentTypes`.
 *
 *   const guard = await staffRoute({ contentTypes: ["application/json"] });
 *   if (!guard.ok) return guard.response;
 */

export function refusalResponse(code: RouteRefusalCode, message?: string, headers: Record<string, string> = {}): Response {
  return Response.json(refusalBody(code, message), { status: REFUSAL_STATUS[code], headers: { "Cache-Control": "no-store", ...headers } });
}

export async function staffRoute(opts: { contentTypes?: readonly string[]; holder?: AdministratorAct } = {}): Promise<{ ok: true; actor: StaffActor } | { ok: false; response: Response }> {
  // The public copy has no staff handlers at all (the proxy already says so; this is the same answer from inside).
  if (surfaceOf(process.env[SURFACE_ENV]) === "public") return { ok: false, response: refusalResponse("NOT_FOUND", "Not found") };
  const actor = await currentStaffOrNull();
  if (!actor) return { ok: false, response: refusalResponse("NOT_SIGNED_IN") };
  // A loader run has no request to judge.
  if (opts.contentTypes && !actor.system) {
    const fault = await refuseForeignPost(opts.contentTypes);
    if (fault) return { ok: false, response: refusalResponse(fault.code, fault.message) };
  }
  // An act only an office holder may do (a vote, a signature): an administrator account is refused it (ADR 0034 D9, Phase 2a).
  if (opts.holder) {
    const fault = administrationConflict({ kind: "ACT", act: opts.holder, actorIsAdministrator: actor.isAdministrator });
    if (fault) return { ok: false, response: refusalResponse("FORBIDDEN", fault.en) };
  }
  return { ok: true, actor };
}
