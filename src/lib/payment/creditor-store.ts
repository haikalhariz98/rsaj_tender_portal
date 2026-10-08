import type { Tx } from "@/lib/audit/record";

import type { CreditorVerification } from "./creditor";
import type { CreditorFacts } from "./eligibility";

/**
 * The bank details of the contractor a payment is made out to, read (BD-613-44, Phase 4b). Server-only: called inside the transaction that issues the certificate, so the profile it judges is
 * the one standing in that transaction. Reads only the version, whether it was sent and whether an officer checked it: never a bank value, which is SULIT and which a payment's decision
 * does not need. The supplier is the award's (`Award.vendorId`), never a name typed on the certificate.
 */
export async function creditorFactsOf(client: Tx, organisationId: string, vendorId: string | null): Promise<CreditorFacts> {
  if (!vendorId) return { onRegister: false, versions: [] };
  const rows = await client.creditorProfile.findMany({ where: { organisationId, supplierId: vendorId }, select: { version: true, submittedAt: true, verification: true } });
  return { onRegister: true, versions: rows.map((r) => ({ version: r.version, sent: r.submittedAt != null, verification: r.verification as CreditorVerification })) };
}
