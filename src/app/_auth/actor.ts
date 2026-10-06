import { cache } from "react";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/record-editor";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import { confirmStaffPassword } from "@/lib/auth/identity";
import { AUTH_WORDS } from "@/lib/auth/words";
import { readStaffSession } from "@/lib/auth/session-store";
import type { AuditActor, PermissionKey, StaffActor } from "@/lib/auth/types";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

import { currentRequestFacts, staffToken } from "./cookies";
import { loaderActor, loaderLabel } from "./loader";

/**
 * The one way to ask who is signed in (ADR 0034 D7).
 *
 * The session is read once per request (`cache()`), however many pages, layouts and actions ask. Every read goes to the database and re-checks the
 * account, the person and their offices, so a change that makes someone unfit takes effect on their next request, not at the end of their session.
 *
 * - A page or a server action calls `requireStaff()`, first: nobody signed in is sent to `/sign-in`. For an action that is the stale tab (a session that ended, a cookie
 *   that expired): Next carries the redirect to the browser, which lands on sign-in, rather than a form showing a message it cannot act on (Phase 1b, ADR 0034 D7
 *   asked for `AuthRefusal`; the account actions, which have a message to give, still use `{ on: "throw" }` and `refusalState`).
 * - A route handler calls `staffRoute()` (`route.ts`), which answers a structured 401 rather than redirecting.
 *
 * `unauthorized()` and `forbidden()` are experimental in this version of Next and are not used.
 *
 * The public copy of the product serves strangers and has no staff sign-in at all: there, nobody is ever signed in, and the staff cookie is not even read.
 */

export class AuthRefusal extends Error {
  constructor(
    readonly code: "NOT_SIGNED_IN" | "FORBIDDEN" | "FOREIGN_POST",
    message: string,
  ) {
    super(message);
    this.name = "AuthRefusal";
  }
}

/// Whoever is signed in on this request, or null. Never throws and never redirects: for the shell, which must render for everyone.
export const currentStaffOrNull = cache(async (): Promise<StaffActor | null> => {
  // A loader script runs the acts outside any request, as the system (see loader.ts). A running server never has this set.
  const loader = loaderLabel();
  if (loader) return loaderActor(loader);
  if (surfaceOf(process.env[SURFACE_ENV]) === "public") return null;
  const token = await staffToken();
  if (!token) return null;
  const read = await readStaffSession(token, await currentRequestFacts());
  return read.ok ? read.actor : null;
});

export async function requireStaff(opts: { permission?: PermissionKey; on?: "redirect" | "throw" } = {}): Promise<StaffActor> {
  const actor = await currentStaffOrNull();
  if (!actor) {
    if (opts.on === "throw") throw new AuthRefusal("NOT_SIGNED_IN", AUTH_WORDS.notSignedIn.en);
    redirect("/sign-in");
  }
  if (opts.permission && !actor.permissions.has(opts.permission)) {
    throw new AuthRefusal("FORBIDDEN", "You do not hold the permission this needs.");
  }
  return actor;
}

/// The actor an audit row is written with.
export const toAuditActor: (actor: StaffActor) => AuditActor = auditActorOfStaff;

/// What a form shows when an action was refused for who is asking, not for what was asked.
export function refusalState(error: unknown): FormState | null {
  return error instanceof AuthRefusal ? { ok: false, message: error.message } : null;
}

/**
 * The signed-in person gives their password again, for an act that asks it (approve, sign, unseal, issue, a checker's decision). Asked every
 * time, with no window. A wrong password counts towards the account's lockout. A second sign-in factor, when the founder authorises one, attaches here.
 */
export async function stepUp(actor: StaffActor, password: string): Promise<{ ok: true; at: Date } | { ok: false; message: string }> {
  const result = await confirmStaffPassword(actor, password, await currentRequestFacts());
  if (result.ok) return result;
  return {
    ok: false,
    message:
      result.kind === "LOCKED"
        ? "This account is locked after too many wrong passwords. Try again later."
        : result.kind === "POLICY_NOT_SET"
          ? "The organisation's sign-in settings are not set, so the password cannot be checked."
          : "That password is not right.",
  };
}
