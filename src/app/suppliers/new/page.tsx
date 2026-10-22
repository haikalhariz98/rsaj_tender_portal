import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { PageHeader } from "@/components/ui/page-header";
import { LOGIN_NAME } from "@/lib/auth/login-name";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { flagWords } from "@/lib/portal/queue";
import { formatDate } from "@/lib/format";
import { loadPortalApplication } from "@/lib/portal/queue-repo";
import { CHANNEL_LABEL, PAPER_CALLOUT } from "@/lib/suppliers/labels";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";
import { PAPER_CHANNELS } from "@/lib/suppliers/types";

import { ApplicationForm } from "./application-form";
import { requireStaff } from "@/app/_auth/actor";
import { sulitGate } from "@/app/_auth/sulit";
import { CONTACT_FIELDS } from "@/lib/suppliers/contact-fields";

export const dynamic = "force-dynamic";

/// Recording a supplier from its paper application (FR-VND-001, a1). The supplier cannot sign in yet.
export default async function NewSupplierApplicationPage(props: { searchParams: Promise<{ from?: string }> }) {
  const actor = await requireStaff();
  const { from } = await props.searchParams;
  const header = <PageHeader eyebrow={<Link href="/suppliers">Suppliers</Link>} title={from ? "Record a supplier from an online application" : "Record a paper application"} subtitle={from ? "Check against the certificate, then record." : "Recorded from the paper application."} />;
  const org = await supplierOrg(actor.organisationId);
  if (!org) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="No organisation configured" />
        </Card>
      </>
    );
  }
  const cfg = await loadSupplierConfig(org.id);
  const list = (kind: "ENTITY_TYPE" | "COUNTRY" | "STATE" | "BUMIPUTERA_STATUS") => cfg.lists.filter((l) => l.list === kind && cfg.live(l, org.today)).map((l) => ({ value: l.code, label: l.nameEn }));
  // From an online application: the form opens with what the applicant typed, and the portal fixes the channel and the day.
  const online = from ? await loadPortalApplication(org.id, from) : null;
  if (from && (!online || online.application.status !== "RECEIVED")) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title={online ? "Online application no longer waiting" : "No such online application"} action={<Link href="/suppliers?tab=portal">Back to the online applications</Link>} />
        </Card>
      </>
    );
  }
  // ADR 0041: a whole application is decided on its own page, on its route; no supplier is recorded from it here.
  if (online?.application.form === "WHOLE") {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="Decided on its own page" action={<Link href={`/suppliers/online/${online.application.id}`}>Open {online.application.reference}</Link>} />
        </Card>
      </>
    );
  }
  const a = online?.application;
  // Opening the contact's portal account while recording (Phase 4a): offered only to an officer who holds the permission, and only while the code's validity is set.
  const policy = await loadSecurityPolicy(db, org.id);
  // The applicant's contact is SULIT (6.15 condition 2): it is put into the form only for a reader it is open to (the form's payload is the page's), and the others type it.
  const contact = a ? await sulitGate(actor, { scope: "supplier", entity: "PortalApplication", id: a.id, label: a.reference }, CONTACT_FIELDS) : null;
  const contactEmail = contact?.state === "GRANTED" && a ? a.contactEmail : "";
  return (
    <>
      {header}
      {a ? (
        <div className="mb-6"><InfoChip tone="brand" detail="Not on the register until you record it.">{`Online ${a.reference} · ${formatDate(storedDay(a.receivedOn))}`}</InfoChip></div>
      ) : (
        <div className="mb-6"><InfoChip tone="brand" detail={PAPER_CALLOUT.en}>Recorded on paper</InfoChip></div>
      )}
      {online && online.flags.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {online.flags.map((f) => {
            const w = flagWords(f);
            return (
              <Callout key={f.code} tone={w.tone}>
                {w.text}
              </Callout>
            );
          })}
        </div>
      )}
      <ApplicationForm
        entityTypes={list("ENTITY_TYPE")}
        countries={list("COUNTRY")}
        states={list("STATE")}
        bumiputeraStatuses={list("BUMIPUTERA_STATUS")}
        contactNeedsEmailAndPhone={cfg.policy?.contactNeedsEmailAndPhone === true}
        account={a ? { permitted: actor.permissions.has("supplierAccounts.manage"), validitySet: policy?.resetCodeValidityMinutes != null, suggestedLoginName: LOGIN_NAME.test(contactEmail.trim()) ? contactEmail.trim().toLowerCase() : "" } : undefined}
        channels={PAPER_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c].en }))}
       
        formatExample={cfg.format?.example || null}
        today={org.today}
        portal={a ? { id: a.id, reference: a.reference, receivedOn: storedDay(a.receivedOn), initial: { registeredName: a.registeredName, registrationNo: a.registrationNo, entityTypeCode: a.entityTypeCode, countryCode: a.countryCode, addressLine1: a.addressLine1 || a.registeredAddress, addressLine2: a.addressLine2, city: a.city, postcode: a.postcode, stateCode: a.stateCode, bumiputeraClaimCode: a.bumiputeraClaimCode, incorporatedOn: a.incorporatedOn ? storedDay(a.incorporatedOn) : "", companyEmail: a.companyEmail, contactName: contact?.state === "GRANTED" ? a.contactName : "", contactDesignation: contact?.state === "GRANTED" ? a.contactDesignation : "", contactEmail: contact?.state === "GRANTED" ? a.contactEmail : "", contactPhone: contact?.state === "GRANTED" ? a.contactPhone : "" } } : undefined}
      />
    </>
  );
}
