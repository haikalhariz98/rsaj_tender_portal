import { db } from "@/lib/db";

import { loadRegisterSettings } from "./apply-repo";
import { deploymentOrganisation } from "./deployment";

/// The one line the public is given to ask: the configured email and telephone, or null while neither is set.
export async function loadHelpContact(): Promise<string | null> {
  const org = await deploymentOrganisation().catch(() => null);
  if (!org) return null;
  const p = await db.supplierPolicy.findUnique({ where: { organisationId: org.id }, select: { helpEmail: true, helpPhone: true } }).catch(() => null);
  return [p?.helpEmail, p?.helpPhone].map((x) => x?.trim()).filter(Boolean).join(" or ") || null;
}

/// What the portal home draws itself by. Gaps become "closed" or "left out" here; the words for what is missing never leave the staff side.
export async function loadPortalFacts(): Promise<{ registerOpen: boolean; channel: "PAPER" | "ONLINE" | null }> {
  const org = await deploymentOrganisation().catch(() => null);
  if (!org) return { registerOpen: false, channel: null };
  const [register, window] = await Promise.all([
    loadRegisterSettings().catch(() => null),
    db.windowPolicy.findUnique({ where: { organisationId: org.id }, select: { submissionChannel: true } }).catch(() => null),
  ]);
  return { registerOpen: register != null && register.missing.length === 0, channel: window?.submissionChannel ?? null };
}
