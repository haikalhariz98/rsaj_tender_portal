import type { Prisma } from "@/generated/prisma/client";
import type { AuditActor } from "@/lib/auth/types";

/// Who recorded, entered or agreed something that came with an online application (ADR 0041 D3): its sender, who was not signed in. Never "the supplier's own portal account", and
/// never called a signature. One wording for the trail, the documents and the registration summary.
export const APPLICANT_WORDS = "Applicant, not signed in";

/**
 * The AuditEntry columns that say who acted (ADR 0034 D11). Pure.
 *
 * With no actor the row is written as it always was: unattributed, and the CHECK AuditEntry_actor_matches_kind holds
 * that to mean `actorKind` null. With one, `unattributed` is false and exactly the references the kind needs are set.
 * An actor that does not fit the CHECK is a defect found here, not as a database error in the middle of a write.
 */
export function actorColumns(actor: AuditActor | undefined): Pick<
  Prisma.AuditEntryUncheckedCreateInput,
  "unattributed" | "actorKind" | "actorPersonId" | "actorSupplierAccountId" | "actorSystemLabel" | "actorPortalApplicationId" | "actorSessionId" | "actorOffices" | "sourceAddress"
> {
  if (!actor) return { unattributed: true, actorPersonId: null };
  switch (actor.kind) {
    case "STAFF":
      if (!actor.personId) throw new Error("A staff actor names its person.");
      return {
        unattributed: false,
        actorKind: "STAFF",
        actorPersonId: actor.personId,
        actorSessionId: actor.sessionId,
        actorOffices: actor.offices.map((o) => ({ roleCode: o.roleCode, scope: o.scope })) as unknown as Prisma.InputJsonValue,
        sourceAddress: actor.sourceAddress,
      };
    case "SUPPLIER":
      if (!actor.supplierAccountId) throw new Error("A supplier actor names its account.");
      return { unattributed: false, actorKind: "SUPPLIER", actorSupplierAccountId: actor.supplierAccountId, actorSessionId: actor.sessionId, sourceAddress: actor.sourceAddress };
    case "SYSTEM":
      if (!actor.label.trim()) throw new Error("A system actor says what ran: it needs a label.");
      return { unattributed: false, actorKind: "SYSTEM", actorSystemLabel: actor.label };
    case "APPLICANT":
      if (!actor.portalApplicationId) throw new Error("An applicant actor names its application.");
      return { unattributed: false, actorKind: "APPLICANT", actorPortalApplicationId: actor.portalApplicationId, sourceAddress: actor.sourceAddress };
  }
}

/**
 * Who an entry says acted, in words: the person by name; the system by what ran ("System: bootstrap command"), so that a row it wrote is never read as a
 * person who is gone. Null where neither is named. One rule for History and for the export, so the two cannot disagree.
 */
export function actorDisplayName(row: { actorPerson?: { name: string } | null; actorSystemLabel?: string | null; actorKind?: string | null }): string | null {
  // A supplier's own act (Phase 4a) is named for what it is, not for a person: the supplier's contact is SULIT and the trail does not carry the account's sign-in name.
  // The sender of an online application (ADR 0041 D3) was not signed in: said so, never as a supplier's account.
  return row.actorPerson?.name ?? (row.actorSystemLabel ? `System: ${row.actorSystemLabel}` : row.actorKind === "SUPPLIER" ? "A supplier's portal account" : row.actorKind === "APPLICANT" ? APPLICANT_WORDS : null);
}
