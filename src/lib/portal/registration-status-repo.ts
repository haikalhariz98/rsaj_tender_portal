import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import type { SupplierActor } from "@/lib/auth/types";

import type { StatusApplication, StatusSupplier } from "./registration-status";

/**
 * A signed-in supplier's own registration, read for its own account page (FR-VND-001, Phase 4a). The supplier is the SESSION's (`actor.supplierId`), never anything the
 * request names, and every read also names the actor's organisation, so no other supplier's record can come back. Only the supplier's words are read: no officer, no route
 * step, no verification note.
 */
export interface RegistrationStatusView {
  supplier: StatusSupplier & { registeredName: string; reference: string };
  applications: StatusApplication[];
}

export async function loadRegistrationStatus(actor: SupplierActor): Promise<RegistrationStatusView | null> {
  const supplier = await db.supplier.findFirst({
    where: { id: actor.supplierId, organisationId: actor.organisationId },
    select: {
      status: true,
      registeredOn: true,
      registeredName: true,
      reference: true,
      applications: {
        orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          kind: true,
          channel: true,
          status: true,
          receivedOn: true,
          resubmitBy: true,
          decisions: {
            orderBy: { decidedAt: "desc" },
            select: { id: true, outcome: true, decidedOn: true, remarks: true, resubmitBy: true, items: { select: { labelSnapshot: true, remarks: true } } },
          },
        },
      },
    },
  });
  if (!supplier) return null;
  return {
    supplier: { status: supplier.status, registeredOn: supplier.registeredOn ? storedDay(supplier.registeredOn) : null, registeredName: supplier.registeredName, reference: supplier.reference },
    applications: supplier.applications.map((a) => ({
      id: a.id,
      kind: a.kind,
      channel: a.channel,
      status: a.status,
      receivedOn: storedDay(a.receivedOn),
      resubmitBy: a.resubmitBy ? storedDay(a.resubmitBy) : null,
      decisions: a.decisions.map((d) => ({ id: d.id, outcome: d.outcome, decidedOn: storedDay(d.decidedOn), remarks: d.remarks, resubmitBy: d.resubmitBy ? storedDay(d.resubmitBy) : null, items: d.items.map((i) => ({ label: i.labelSnapshot, remarks: i.remarks })) })),
    })),
  };
}
