import { actFormFromJson, attributionRefusalState, beginActFromWith, beginActWith, parseSlotKey, readActForm, type ActDeps } from "@/lib/auth/act-begin";
import { ACT_FIELDS, actFieldNames } from "@/lib/auth/act-field-names";
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

/// One attribution a test act wrote: what `act.write` / `writeAlso` was asked to record, for the test to read.
export interface WrittenAttribution {
  entity: string;
  entityId: string;
  slot: string;
  subjectPersonId: string | null;
  mode: string;
  paperReference: string | undefined;
  reason: string | undefined;
  roleCode: string | null | undefined;
  document: { entity: string; id: string } | null | undefined;
}

/**
 * What `@/app/_auth/act` answers with in a test of a server action or a route: the real reading of the form (`act-begin.ts`, so a person a form names is
 * read exactly as in a request, and an act recorded for someone else needs its paper), with the three things it asks of the world faked: the organisation's
 * switch for a signature recorded from paper (`paperSignatureRecording`, unset by default, so a paper signature is refused as in a fresh organisation), the
 * password (any password signs; a test of a refusal passes `stepUp`), and the write, which is recorded in `written` for the test to read.
 *
 *   const { module: actMod, written } = actModule();
 *   vi.mock("@/app/_auth/act", () => actMod)   // hoisted: build it in vi.hoisted
 */
export function actModule(opts: { now?: Date; paperSignatureRecording?: "ALLOWED" | "REFUSED" | null; stepUp?: ActDeps["stepUp"] } = {}) {
  const written: WrittenAttribution[] = [];
  const deps: ActDeps = {
    now: () => opts.now ?? new Date("2026-10-07T04:00:00Z"),
    paperSignatureRecording: async () => opts.paperSignatureRecording ?? null,
    stepUp: opts.stepUp ?? (async () => ({ ok: true as const, at: new Date("2026-10-07T04:00:00Z") })),
    attribute: async (_tx, i) => {
      written.push({
        entity: i.entity,
        entityId: i.entityId,
        slot: i.slot,
        subjectPersonId: i.subject.kind === "PERSON" ? i.subject.personId : null,
        mode: i.mode,
        paperReference: i.paperReference,
        reason: i.reason,
        roleCode: i.roleCode,
        document: i.document,
      });
    },
  };
  const actMod = {
    beginAct: (actor: StaffActor, data: FormData, key: string, o: Parameters<typeof beginActWith>[4]) => beginActWith(deps, actor, data, key, o),
    beginActFrom: (actor: StaffActor, form: Parameters<typeof beginActFromWith>[2], key: string, o: Parameters<typeof beginActFromWith>[4]) => beginActFromWith(deps, actor, form, key, o),
    actFormFromJson,
    attributionRefusalState,
    parseSlotKey,
    readActForm,
    actFieldNames,
    ACT_FIELDS,
  };
  return { module: actMod, written };
}
