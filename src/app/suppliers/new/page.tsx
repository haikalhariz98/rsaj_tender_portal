import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { storedDay } from "@/lib/dates";
import { flagWords } from "@/lib/portal/queue";
import { formatDate } from "@/lib/format";
import { loadPortalApplication } from "@/lib/portal/queue-repo";
import { CHANNEL_LABEL, PAPER_CALLOUT } from "@/lib/suppliers/labels";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";
import { PAPER_CHANNELS } from "@/lib/suppliers/types";

import { ApplicationForm } from "./application-form";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/// Recording a supplier from its paper application (FR-VND-001, a1). The supplier cannot sign in yet.
export default async function NewSupplierApplicationPage(props: { searchParams: Promise<{ from?: string }> }) {
  const actor = await requireStaff();
  const { from } = await props.searchParams;
  const header = <PageHeader eyebrow={<Link href="/suppliers">Suppliers</Link>} title={from ? "Record a supplier from an online application" : "Record a paper application"} subtitle={from ? "An officer checks what the applicant sent against its certificate, then records the supplier." : "A new supplier, recorded by an officer from the application it handed in."} />;
  const org = await supplierOrg(actor.organisationId);
  if (!org) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const cfg = await loadSupplierConfig(org.id);
  const list = (kind: "ENTITY_TYPE" | "COUNTRY") => cfg.lists.filter((l) => l.list === kind && cfg.live(l, org.today)).map((l) => ({ value: l.code, label: l.nameEn }));
  // From an online application: the form opens with what the applicant typed, and the portal fixes the channel and the day.
  const online = from ? await loadPortalApplication(org.id, from) : null;
  if (from && (!online || online.application.status !== "RECEIVED")) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title={online ? "This online application is not waiting any more" : "No such online application"}>
            {online ? "It was recorded as a supplier or set aside already." : "It may have been recorded or removed."} <Link href="/suppliers?tab=portal">Back to the online applications</Link>
          </EmptyState>
        </Card>
      </>
    );
  }
  const a = online?.application;
  return (
    <>
      {header}
      {a ? (
        <Callout tone="info" className="mb-6" title={`Online application ${a.reference}`}>
          Sent through the supplier portal on {formatDate(storedDay(a.receivedOn))}. Nothing here is on the register until you record it. Its documents are lodged and checked on the supplier&apos;s record once it is recorded.
        </Callout>
      ) : (
        <Callout tone="info" className="mb-6" title="Recorded on paper">
          {PAPER_CALLOUT.en} Its documents are lodged and checked on its record once it is recorded.
        </Callout>
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
        channels={PAPER_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c].en }))}
       
        formatExample={cfg.format?.example || null}
        today={org.today}
        portal={a ? { id: a.id, reference: a.reference, receivedOn: storedDay(a.receivedOn), initial: { registeredName: a.registeredName, registrationNo: a.registrationNo, entityTypeCode: a.entityTypeCode, countryCode: a.countryCode, registeredAddress: a.registeredAddress, companyEmail: a.companyEmail, contactName: a.contactName, contactDesignation: a.contactDesignation, contactEmail: a.contactEmail, contactPhone: a.contactPhone } } : undefined}
      />
    </>
  );
}
