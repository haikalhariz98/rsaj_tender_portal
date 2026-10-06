import type { Prisma } from "@/generated/prisma/client";
import type { AuditActor } from "@/lib/auth/types";

/**
 * The AuditEntry columns that say who acted (ADR 0034 D11). Pure.
 *
 * With no actor the row is written as it always was: unattributed, and the CHECK AuditEntry_actor_matches_kind holds
 * that to mean `actorKind` null. With one, `unattributed` is false and exactly the references the kind needs are set.
 * An actor that does not fit the CHECK is a defect found here, not as a database error in the middle of a write.
 */
export function actorColumns(actor: AuditActor | undefined): Pick<
  Prisma.AuditEntryUncheckedCreateInput,
  "unattributed" | "actorKind" | "actorPersonId" | "actorSupplierAccountId" | "actorSystemLabel" | "actorSessionId" | "actorOffices" | "sourceAddress"
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
  }
}
