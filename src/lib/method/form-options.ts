/**
 * What the exercise form offers, in force on a day. Read-only; names, never codes, are
 * shown, and nothing is pre-selected.
 */

import { db } from "@/lib/db";

import { DELIVERABLE_LABEL } from "./labels";
import { loadMethodConfig } from "./repo";
import { DELIVERABLE_KINDS } from "./types";

const live = (x: { retiredOn: Date | null }, on: Date) => x.retiredOn == null || x.retiredOn > on;

export async function exerciseFormOptions(organisationId: string, on: Date, posture: string | null) {
  const { config } = await loadMethodConfig(organisationId);
  const people = await db.person.findMany({ where: { organisationId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return {
    methods: config.methods
      .filter((m) => live(m, on))
      .map((m) => ({
        code: m.code,
        name: m.nameEn,
        requiresJustification: m.requiresJustification,
        justificationPrompt: m.justificationPrompt,
        requiresDossier: m.requiresDossier,
        requiresCoordinationRecord: m.requiresCoordinationRecord,
        requiresFreshSourcing: m.requiresFreshSourcing,
        requiresProposal: m.requiresProposal,
        requiresNameApproval: m.requiresNameApproval,
        restrictedAccess: m.restrictedAccess,
      })),
    types: config.types.filter((t) => live(t, on)).map((t) => ({ code: t.code, name: t.nameEn })),
    bases: config.bases.filter((b) => live(b, on)).map((b) => ({ code: b.code, name: b.nameEn })),
    reasons: config.reasons.filter((r) => live(r, on)).map((r) => ({ code: r.code, name: r.nameEn, methodCode: r.sourcingMethodCode })),
    people,
    kinds: DELIVERABLE_KINDS.map((k) => ({ value: k, label: DELIVERABLE_LABEL[k] })),
    routeSetExternally: posture === "ROUTE_SET_EXTERNALLY",
  };
}
