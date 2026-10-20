/**
 * Writing the supplier portal's front-door words, and recording it (design note 0006, rulings L3 and L4).
 *
 * The same path as the sign-in page's words: the configuration screen's editor calls this, and so does any loader script, so the audit row is the same whichever
 * way the change was made. It runs under the organisation's row lock, so the trail's "before" is what the write replaced, and the write and its audit row are one
 * transaction.
 */
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { db } from "@/lib/db";

import { normalisePortalPage, PORTAL_FIELDS, portalPageFaults, portalValueLabel, type PortalField, type PortalPageInput } from "./portal-page";
import type { Subject } from "./sign-in-store";

type Client = Pick<typeof db, "$transaction">;

async function lockOrganisation(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${id} FOR UPDATE`;
}

export type PortalOutcome = { ok: true; changed: boolean } | { ok: false; errors: Partial<Record<PortalField, string>> };

/// Save the portal's address, headline, line and highlights. Refused, field by field, with what to fix; blank clears a setting.
export async function storePortalPage(client: Client, who: Subject, input: PortalPageInput, reason = ""): Promise<PortalOutcome> {
  const faults = portalPageFaults(input);
  if (Object.keys(faults).length > 0) return { ok: false, errors: faults };
  const after = normalisePortalPage(input);
  const changed = await client.$transaction(async (tx) => {
    await lockOrganisation(tx, who.organisationId);
    const prior = await tx.organisationPortalPage.findUnique({ where: { organisationId: who.organisationId } });
    // An icon is a setting key and reads in the trail by its label ("Building"), as the sign-in page's icons do.
    const changes = diffFields(
      Object.fromEntries(PORTAL_FIELDS.map((f) => [f, portalValueLabel(f, prior?.[f] ?? null)])),
      Object.fromEntries(PORTAL_FIELDS.map((f) => [f, portalValueLabel(f, after[f])])),
    );
    if (changes.length === 0) return false;
    const saved = await tx.organisationPortalPage.upsert({
      where: { organisationId: who.organisationId },
      create: { organisationId: who.organisationId, ...after },
      update: after,
      select: { id: true },
    });
    await writeAudit(tx, { actor: who.actor, organisationId: who.organisationId, entity: "OrganisationPortalPage", entityId: saved.id, entityLabel: who.organisationName, reason }, prior ? "UPDATE" : "CREATE", changes);
    return true;
  });
  return { ok: true, changed };
}
