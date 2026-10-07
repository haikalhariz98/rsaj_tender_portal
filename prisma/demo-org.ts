import type { OrgScope } from "../src/lib/org-scope";

/**
 * The demonstration's organisation, as the product's readers now ask for it (ADR 0034 D10: every read and every lock is scoped to an
 * organisation, the signed-in actor's on a screen). A loader acts for the deployment's one organisation, named by `ORGANISATION_CODE`
 * (`src/lib/portal/deployment.ts`), as its acts already do through the loader's actor (`src/app/_auth/loader.ts`).
 *
 * Imported lazily, as the other loaders read the product's client: `prisma/demo-acts.ts` installs its own before the product's is first read.
 */
let cached: OrgScope | null = null;

export async function demoScope(): Promise<OrgScope> {
  if (cached) return cached;
  const { deploymentOrganisation } = await import("../src/lib/portal/deployment");
  const org = await deploymentOrganisation();
  if (!org) throw new Error("The demonstration's organisation is not set up: run npm run setup first.");
  cached = { organisationId: org.id, organisationCode: org.code };
  return cached;
}

export async function demoOrgId(): Promise<string> {
  return (await demoScope()).organisationId;
}

/// The demonstration as a reader: a loader run, which is the operator's own process and not a person (ADR 0034 D14). It is hidden from nothing and is shown no
/// SULIT value; its reads of one, where a check makes them, are logged under its label.
export async function demoReader() {
  const scope = await demoScope();
  const { deploymentOrganisation } = await import("../src/lib/portal/deployment");
  const org = await deploymentOrganisation();
  return { ...scope, personId: "", isAdministrator: false, system: { label: "demo loader" }, sessionId: "", sourceAddress: null, organisationTimeZone: org?.timeZone ?? null };
}

/// For a loader's read-back of its own seed (a check that the load did what it says, never a screen): the answer a screen would be handed after asking whether the
/// reader may read a record's SULIT values. A loader is not a person and is shown no value by the product's rule; here it reads its own rows, to check them, and
/// nothing is displayed or sent. The basis is the nearest honest one and is never read.
export async function loaderGate() {
  const { sulitGranted } = await import("../src/lib/auth/sulit-access");
  return sulitGranted(true as const, "NAMED_ON_RECORD");
}
