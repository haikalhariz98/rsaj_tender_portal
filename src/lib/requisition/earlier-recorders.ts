import type { Tx } from "@/lib/audit/record";
import { loadRecorders, recordersOf } from "@/lib/auth/attribution-recorders";
import type { SlotQuery } from "@/lib/auth/attribution-read";

import type { EarlierRecorders } from "./holders";

/// The application a supplier registration's route decides: a paper or signed-in wizard one (`SupplierApplication`), or a whole online one (`PortalApplication`).
export type RegistrationSubject = { supplierApplicationId: string } | { portalApplicationId: string };

type Client = Pick<Tx, "actAttribution" | "requisitionEndorsement" | "supplierDocument" | "registrationDeclaration" | "creditorProfile" | "portalApplicationDocument" | "portalApplicationCreditor">;

/**
 * Who keyed the earlier acts of a matter for someone else (Phase 2b review), read for `deciderFaults` in the decision's own transaction. Each caller names what it
 * has: the requisition (whose requesting officer may have been recorded for, and whose endorsements are read with it), and the other steps of the route that are decided. A matter with
 * none of the first two (a supplier's application, a certificate: their submitter is the signed-in officer's own) names only its steps.
 *
 * A supplier registration's route also names its application (`registration`, RSEC-3(b)): whoever checked a certificate or the bank details ON THAT APPLICATION, as the officer
 * named on the check or as the one who recorded it for them, decides no step of it. "On that application" is read through the rows that link to it, never by a window of time: a
 * paper or wizard application's certificates are those lodged with it (`SupplierDocument.applicationId`) and its bank details the profile its GIRO authorisation was signed for
 * (`RegistrationDeclaration.creditorProfileId`); a whole online application's are the rows held on it.
 */
export async function earlierRecordersOf(
  client: Client,
  organisationId: string,
  of: { requisitionId?: string | null; otherStepIds: readonly string[]; registration?: RegistrationSubject },
): Promise<EarlierRecorders> {
  // The requisition's endorsements are read here, whichever shape the caller loaded the requisition in.
  const endorsementIds = of.requisitionId ? (await client.requisitionEndorsement.findMany({ where: { requisitionId: of.requisitionId, requisition: { organisationId } }, select: { id: true } })).map((e) => e.id) : [];
  const checks = of.registration ? await registrationChecks(client, organisationId, of.registration) : null;
  const recorders = await loadRecorders(client, organisationId, [
    { entity: "Requisition", slot: "requestingPerson", ids: of.requisitionId ? [of.requisitionId] : [] },
    { entity: "RequisitionEndorsement", slot: "person", ids: endorsementIds },
    { entity: "ApprovalStep", slot: "decidedBy", ids: of.otherStepIds },
    ...(checks?.slots ?? []),
  ]);
  return {
    requesterRecorderIds: recordersOf(recorders, "Requisition", "requestingPerson", of.requisitionId ? [of.requisitionId] : []),
    endorsementRecorderIds: recordersOf(recorders, "RequisitionEndorsement", "person", endorsementIds),
    otherDeciderRecorderIds: recordersOf(recorders, "ApprovalStep", "decidedBy", of.otherStepIds),
    ...(checks ? { verifierIds: [...new Set([...checks.named, ...checks.slots.flatMap((q) => recordersOf(recorders, q.entity, q.slot, q.ids))])] } : {}),
  };
}

/// The checks recorded on a registration's application: the officers they name, and the slots that say who keyed each.
async function registrationChecks(client: Client, organisationId: string, subject: RegistrationSubject): Promise<{ named: string[]; slots: SlotQuery[] }> {
  const checked = { verifiedByPersonId: { not: null } } as const;
  const select = { id: true, verifiedByPersonId: true } as const;
  if ("portalApplicationId" in subject) {
    const docs = await client.portalApplicationDocument.findMany({ where: { organisationId, portalApplicationId: subject.portalApplicationId, ...checked }, select });
    const bank = await client.portalApplicationCreditor.findMany({ where: { organisationId, portalApplicationId: subject.portalApplicationId, ...checked }, select });
    return {
      named: [...docs, ...bank].map((r) => r.verifiedByPersonId!),
      slots: [{ entity: "PortalApplicationDocument", slot: "verifiedBy", ids: docs.map((r) => r.id) }, { entity: "PortalApplicationCreditor", slot: "verifiedBy", ids: bank.map((r) => r.id) }],
    };
  }
  const docs = await client.supplierDocument.findMany({ where: { organisationId, applicationId: subject.supplierApplicationId, ...checked }, select });
  const giro = await client.registrationDeclaration.findMany({ where: { organisationId, applicationId: subject.supplierApplicationId, creditorProfileId: { not: null } }, select: { creditorProfileId: true } });
  const profileIds = [...new Set(giro.map((g) => g.creditorProfileId!))];
  const bank = profileIds.length ? await client.creditorProfile.findMany({ where: { organisationId, id: { in: profileIds }, ...checked }, select }) : [];
  return {
    named: [...docs, ...bank].map((r) => r.verifiedByPersonId!),
    slots: [{ entity: "SupplierDocument", slot: "verifiedBy", ids: docs.map((r) => r.id) }, { entity: "CreditorProfile", slot: "verifiedBy", ids: bank.map((r) => r.id) }],
  };
}
