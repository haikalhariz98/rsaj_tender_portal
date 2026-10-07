import { administrationConflict, type AdministratorAct } from "@/lib/auth/administration-conflict";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import type { PermissionKey, StaffActor } from "@/lib/auth/types";

/**
 * A signed-in person for the tests of server actions and route handlers, which now ask who is signed in before anything else (Phase 1b). The
 * guards read the session from the database, so a test that is not about sign-in stands in for them: `actorModule()` is what
 * `vi.mock("@/app/_auth/actor", …)` answers with, and it carries the real pure part (`toAuditActor`), so the audit rows a test reads
 * name this person exactly as a request's would.
 */

export const STAFF_FIXTURE: StaffActor = {
  kind: "STAFF",
  accountId: "acct_test",
  sessionId: "sess_test",
  personId: "person_test",
  personName: "Test Officer",
  jobTitle: null,
  isAdministrator: false,
  organisationId: "org_test",
  organisationCode: "ORG",
  organisationTimeZone: "Asia/Kuala_Lumpur",
  offices: [],
  permissions: new Set(),
  stepUpAt: null,
  sessionCreatedAt: new Date("2026-10-06T00:00:00Z"),
  sourceAddress: null,
  mustChangePassword: false,
};

export class RefusalForTest extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AuthRefusal";
  }
}

export function actorModule(who: StaffActor | null = STAFF_FIXTURE) {
  const signedIn = (): StaffActor => {
    if (!who) throw new RefusalForTest("NOT_SIGNED_IN", "Sign in to continue.");
    return who;
  };
  return {
    // The two wrappers an action asks for who may act (`staffForAct`, `staffForPermission`), with the real rules: the pure administration rule, and the
    // permissions the actor carries. A test that signs in an administrator at a holder-checked act is refused, as it would be.
    staffForAct: async (act: AdministratorAct) => {
      const actor = signedIn();
      const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: actor.isAdministrator });
      return fault ? { ok: false as const, state: { ok: false as const, message: fault.en } } : { ok: true as const, actor };
    },
    staffForPermission: async (key: PermissionKey) => {
      const actor = signedIn();
      return actor.permissions.has(key) ? { ok: true as const, actor } : { ok: false as const, state: { ok: false as const, message: `Not permitted: ${key}` } };
    },
    AuthRefusal: RefusalForTest,
    currentStaffOrNull: async () => who,
    requireStaff: async () => {
      if (!who) throw new RefusalForTest("NOT_SIGNED_IN", "Sign in to continue.");
      return who;
    },
    toAuditActor: auditActorOfStaff,
    refusalState: (e: unknown) => (e instanceof RefusalForTest ? { ok: false, message: e.message } : null),
    stepUp: async () => ({ ok: true as const, at: new Date() }),
  };
}

/// What `@/app/_auth/route` answers with when nobody is asking the guard anything: the request is let through as this person.
export function routeModule(who: StaffActor = STAFF_FIXTURE) {
  return {
    refusalResponse: (code: string, message?: string) => Response.json({ ok: false, code, message: message ?? code, error: message ?? code }, { status: code === "NOT_SIGNED_IN" ? 401 : 403 }),
    staffRoute: async () => ({ ok: true as const, actor: who }),
  };
}
