import type { StaffActor } from "@/lib/auth/types";

/**
 * The one way the product's own acts run with nobody signed in: a loader (the demo loaders, `prisma/demo*.ts`) calls the real server actions
 * in its own process, outside any request, to make history by the same rules as the screens. It names itself once, and the acts then write
 * their audit rows as that system actor (`{ kind: "SYSTEM", label }`), never as a person.
 *
 * This is a state of the process, set by the loader script that runs in it. The running server never calls `installLoader`, and nothing a request
 * carries can reach it: a source scan (`auth-reach.test.ts`) holds every use of this module to `prisma/`, `scripts/` and `src/app/_auth/`.
 */

const KEY = Symbol.for("perolehan.loader.label");

/// Called by a loader script, once, before it runs any act.
export function installLoader(label: string): void {
  if (!label.trim()) throw new Error("A loader says what it is: it needs a label.");
  (globalThis as Record<symbol, unknown>)[KEY] = label.trim();
}

export function loaderLabel(): string | null {
  const v = (globalThis as Record<symbol, unknown>)[KEY];
  return typeof v === "string" ? v : null;
}

let cached: { label: string; actor: StaffActor } | null = null;

/// The actor the acts see in a loader run: the organisation, and no person (the acts' own form-picked persons are what they attest, as ever).
export async function loaderActor(label: string): Promise<StaffActor> {
  if (cached?.label === label) return cached.actor;
  // Imported here, not above: a loader installs its own database client before the product's is first read (prisma/demo-acts.ts).
  const [{ db }, { ORGANISATION_CODE }] = await Promise.all([import("@/lib/db"), import("@/lib/org")]);
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, code: true, timeZone: true } });
  if (!org) throw new Error(`The loader "${label}" found no organisation with the code ${ORGANISATION_CODE}.`);
  const actor: StaffActor = {
    kind: "STAFF",
    accountId: "",
    sessionId: "",
    personId: "",
    personName: label,
    jobTitle: null,
    isAdministrator: false,
    organisationId: org.id,
    organisationCode: org.code,
    organisationTimeZone: org.timeZone,
    offices: [],
    permissions: new Set(),
    stepUpAt: null,
    sessionCreatedAt: new Date(0),
    sourceAddress: null,
    mustChangePassword: false,
    system: { label },
  };
  cached = { label, actor };
  return actor;
}
