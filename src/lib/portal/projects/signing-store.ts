import type { Tx } from "@/lib/audit/record";
import { loadPostAwardPolicy } from "@/lib/supervision/load";

import { contractorSigningFault } from "./certificates";
import { inOrder } from "@/lib/series";

/**
 * Why a contractor's signed-in contact may not sign from the portal, or null where it may (the organisation's switch, and the contact's own mark: decisions log, 2026-10-09, ruling on 1928(3)).
 * Read in the act's transaction by every act that binds the company: the contractor's block on a certificate, and its notice that the statutory declaration is lodged. The contact is the
 * SESSION's, never a request's.
 */
export async function contractorSigningFaultOf(tx: Tx, who: { organisationId: string; contactId: string }) {
  const [policy, contact] = await inOrder(
    () => loadPostAwardPolicy(who.organisationId, tx),
    () => tx.supplierContact.findFirst({ where: { id: who.contactId, organisationId: who.organisationId }, select: { authorisedToSignForContractor: true } }));
  return contractorSigningFault(policy?.contractorPortalSigning, contact?.authorisedToSignForContractor);
}
