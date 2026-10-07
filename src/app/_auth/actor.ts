import { cache } from "react";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/record-editor";
import { administrationConflict, type AdministratorAct } from "@/lib/auth/administration-conflict";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import { confirmStaffPassword } from "@/lib/auth/identity";
import { explainRefusal } from "@/lib/auth/permission-store";
import { db } from "@/lib/db";
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

/**
 * Who is signed in, or the sign-in page. Two refusals a caller can ask for, both for who is asking and not for what was asked (Phase 2a):
 *
 * - `permission`: the actor must hold the product permission (ADR 0034 D8). Refused with `AuthRefusal("FORBIDDEN")` whose message says, in words, which
 *   permission and why the person does not hold it (undecided by the organisation, withheld from their role, held only for a department). A page that wants to
 *   show that rather than fail calls `permissionGate`; an action that answers a form catches it with `refusalState`.
 * - `holder`: the act is one that only the holder of an office may do, a signature or an unsealing, so an administrator account is refused
 *   (`administrationConflict`, ADR 0034 D9). An action that answers a form uses `staffForAct`, which hands the refusal back as a form state instead of throwing.
 *
 * `stepUp` is deliberately not refused an administrator: the checker's decision on an administrator grant is made by one.
 */
export async function requireStaff(opts: { permission?: PermissionKey; holder?: AdministratorAct; on?: "redirect" | "throw" } = {}): Promise<StaffActor> {
  const actor = await currentStaffOrNull();
  if (!actor) {
    if (opts.on === "throw") throw new AuthRefusal("NOT_SIGNED_IN", AUTH_WORDS.notSignedIn.en);
    redirect("/sign-in");
  }
  if (opts.holder) {
    const fault = administrationConflict({ kind: "ACT", act: opts.holder, actorIsAdministrator: actor.isAdministrator });
    if (fault) throw new AuthRefusal("FORBIDDEN", fault.en);
  }
  if (opts.permission) {
    const gate = await permissionGate(actor, opts.permission);
    if (!gate.ok) throw new AuthRefusal("FORBIDDEN", gate.message);
  }
  return actor;
}

/// Whether the actor holds a permission, and if not why, in words. For a page: it renders the message in place of its content rather than throwing.
export async function permissionGate(actor: StaffActor, key: PermissionKey): Promise<{ ok: true } | { ok: false; message: string }> {
  if (actor.permissions.has(key)) return { ok: true };
  // A loader run is not a person and holds nothing: say so without a lookup that has no person to make.
  if (actor.system) return { ok: false, message: "A loader run holds no product permission." };
  const { words } = await explainRefusal(db, { organisationId: actor.organisationId, personId: actor.personId, isAdministrator: actor.isAdministrator, timeZone: actor.organisationTimeZone, now: new Date() }, key);
  return { ok: false, message: words.en };
}

/**
 * For a server action that answers a form and performs an act that only an office holder may (an approval, a signature, an unsealing): the signed-in
 * actor, or the refusal as the form's own state when the account is an administrator's. Asked first, like `requireStaff`, which it calls.
 *
 *   const guard = await staffForAct("SIGNATURE");
 *   if (!guard.ok) return guard.state;
 *   const actor = guard.actor;
 */
export async function staffForAct(act: AdministratorAct): Promise<{ ok: true; actor: StaffActor } | { ok: false; state: FormState }> {
  const actor = await requireStaff();
  const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: actor.isAdministrator });
  return fault ? { ok: false, state: { ok: false, message: fault.en } } : { ok: true, actor };
}

/**
 * For a server action that answers a form and that only someone holding a product permission may do (drafting or issuing configuration, granting an
 * office): the signed-in actor, or the refusal as the form's own state, in words that say which permission and why it is not held (review of Phase 2a).
 * Asked first, like `requireStaff`, which it calls. The administrator flag confers the permissions an administrator may hold; nobody else holds one
 * until the organisation grants it to a role.
 *
 *   const guard = await staffForPermission("configuration.draft");
 *   if (!guard.ok) return guard.state;
 *   const actor = guard.actor;
 */
export async function staffForPermission(key: PermissionKey): Promise<{ ok: true; actor: StaffActor } | { ok: false; state: FormState }> {
  const actor = await requireStaff();
  const gate = await permissionGate(actor, key);
  return gate.ok ? { ok: true, actor } : { ok: false, state: { ok: false, message: gate.message } };
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
