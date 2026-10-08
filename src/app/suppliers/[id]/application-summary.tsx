import { RegistrationSummaryCards } from "@/components/registration-summary";
import { sulitGate } from "@/app/_auth/sulit";
import { CREDITOR_PROFILE_FIELDS } from "@/lib/auth/creditor-access-store";
import { through, type Sulit } from "@/lib/auth/sulit-access";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { registrationSummary, type SummaryCreditor, type SummaryRecord } from "@/lib/portal/registration/summary";
import { creditorSummaryOf, loadCompanySummary, loadContactsSummary, loadCreditorRows, loadDeclarationsSummary, loadSentDocumentsSummary } from "@/lib/portal/registration/summary-store";
import type { LoadedSupplier } from "@/lib/suppliers/repo";

/**
 * The application summary of a registration the supplier sent (Phase 4b, B5): the one `registrationSummary` projection the applicant read at step 5, drawn read-only for the officer, with every
 * field it entered, each document with its expiry, "Not scanned", who lodged it and the officer's check, the codes as "code — name", the Bumiputera reading, the signed declarations (the
 * wording's version, the signatory, the server's time), and the bank details. The SULIT parts are the reader's to see or not: the contacts by the supplier gate, the bank details by the
 * creditor profile's own. Read only while the Applications tab is open: the readings it logs are the tab's.
 */
export async function ApplicationSummary({ actor, l, applicationId, contactsGate }: { actor: StaffActor; l: LoadedSupplier; applicationId: string; contactsGate: Sulit<true> }) {
  const s = l.supplier;
  const scope = { organisationId: l.org.id, supplierId: s.id };
  const [company, documents, declarations, rows] = await Promise.all([
    loadCompanySummary(db, scope, "REGISTER"),
    loadSentDocumentsSummary(db, scope, { applicationId }),
    loadDeclarationsSummary(db, scope, l.org.timeZone, { applicationId }),
    loadCreditorRows(db, scope),
  ]);
  // The contacts: the supplier gate's one answer, the details read only where it is granted.
  const contacts: Sulit<Awaited<ReturnType<typeof loadContactsSummary>>> = contactsGate.state === "GRANTED" ? through(contactsGate, await loadContactsSummary(db, scope)) : contactsGate;
  // The bank details: the latest version the supplier sent, judged by the creditor profile's own gate.
  const latest = rows.find((r) => r.submittedAt != null) ?? null;
  let creditor: Sulit<SummaryCreditor | null>;
  if (!latest) creditor = { state: "GRANTED", value: null, basis: "NAMED_ON_RECORD" };
  else {
    const gate = await sulitGate(actor, { scope: "creditorProfile", id: latest.id, label: `${s.reference} · Creditor's profile`, supplierId: s.id, verifiedByPersonId: latest.verifiedByPersonId }, CREDITOR_PROFILE_FIELDS);
    creditor = gate.state === "GRANTED" ? through(gate, await creditorSummaryOf(db, l.org.id, latest)) : gate;
  }
  const record: SummaryRecord = {
    company: company ?? { registeredName: s.registeredName, registrationNo: s.registrationNo, formatChecked: null, entityTypeName: null, countryName: null, addressLines: [], incorporatedOn: null, companyEmail: s.companyEmail, bumiputera: { kind: "NO_CLAIM", claim: null, reference: null, verification: null } },
    contacts,
    documents,
    creditor,
    declarations,
  };
  return <RegistrationSummaryCards sections={registrationSummary(record, { day: formatDate })} />;
}
