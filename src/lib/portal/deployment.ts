import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { loadShell } from "@/lib/shell";

/**
 * The deployment's one organisation (ADR 0034 D10), for what runs before anyone has signed in: the anonymous public pages, the sign-in
 * screens and the frame drawn around them, and a loader script's acts.
 *
 * After sign-in nothing reads this: the actor's organisation (`actor.organisationId`, `actor.organisationCode`) scopes every query. This
 * module is the one place outside `prisma/` and `scripts/` that may read `ORGANISATION_CODE`; `tenant-scan.test.ts` refuses it anywhere else.
 * A supplier's session, when the portal gets sign-in (Phase 4a), must belong to this same organisation.
 */

export interface DeploymentOrganisation {
  id: string;
  code: string;
  timeZone: string | null;
}

/// Null while the deployment's organisation has not been set up.
export async function deploymentOrganisation(client: Tx = db): Promise<DeploymentOrganisation | null> {
  return client.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, code: true, timeZone: true } });
}

/// The frame of a public page: the deployment's organisation, and no counts (they are the staff's to see).
export async function loadPublicShell() {
  const organisation = await deploymentOrganisation().catch(() => null);
  return loadShell({ organisationId: organisation?.id ?? null, counts: false });
}
