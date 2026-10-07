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
