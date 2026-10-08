import Link from "next/link";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { sulitGate } from "@/app/_auth/sulit";
import { through } from "@/lib/auth/sulit-access";
import { CONTACT_FIELDS } from "@/lib/suppliers/contact-fields";
import { bumiputeraReading, bumiputeraWords } from "@/lib/suppliers/bumiputera";
import { companyDifferences, contactDifferences } from "@/lib/portal/differences";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { blocksRecording, flagWords } from "@/lib/portal/queue";
import { loadPortalApplication } from "@/lib/portal/queue-repo";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";

import { DiscardOnlineApplicationDrawer } from "./discard-drawer";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

const STATUS = { RECEIVED: { text: "Waiting for an officer", tone: "info" }, RECORDED: { text: "Recorded as a supplier", tone: "ok" }, DISCARDED: { text: "Set aside", tone: "neutral" } } as const;

/**
 * One online application, in full, for an officer: what the applicant typed, what the register holds
 * against its number, and the two things that can be done with it (record the supplier from it, or set
 * it aside). Phase 4a: once recorded as a supplier the applicant's words are KEPT and shown beside the register's
 * entry with every difference the officer made listed; they are erased only when the application is set aside (and on the
 * applications recorded before Phase 4a, which were erased when they were recorded).
 */
export default async function OnlineApplicationPage(props: PageProps<"/suppliers/online/[id]">) {
  const actor = await requireStaff();
  const { id } = await props.params;
  const org = await supplierOrg(actor.organisationId);
  const back = <Link href="/suppliers?tab=portal">Suppliers</Link>;
  const loaded = org ? await loadPortalApplication(org.id, id) : null;
  if (!org || !loaded) {
    return (
      <>
        <PageHeader eyebrow={back} title="Online application" subtitle="Sent through the supplier portal." />
        <Card>
          <EmptyState title="No such online application">It may have been removed. <Link href="/suppliers?tab=portal">Back to the online applications</Link></EmptyState>
        </Card>
      </>
    );
  }
  const { application: a, erased, flags } = loaded;
  const [cfg, people] = await Promise.all([loadSupplierConfig(org.id), db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  // The applicant's contact is SULIT as a supplier's is (6.15 condition 2): a supplier keeps no list of who is named, so only the organisation-wide permission opens it. Judged once, logged.
  const contact = await sulitGate(actor, { scope: "supplier", entity: "PortalApplication", id: a.id, label: a.reference }, CONTACT_FIELDS);
  const status = STATUS[a.status];
  const waiting = a.status === "RECEIVED";
  const stops = blocksRecording(flags);
  // The Bumiputera claim is the applicant's declaration, read as declared with nothing yet lodged to check it (BD-615-1: the effective status is the verified evidence document).
  const claim = a.bumiputeraClaimCode ? (cfg.listName("BUMIPUTERA_STATUS", a.bumiputeraClaimCode) ?? "A status no longer listed") : null;
  const reading = bumiputeraWords(bumiputeraReading(claim, cfg.policy?.restrictionEvidenceTypeId != null, null, "APPLICATION")).en;
  const stateName = a.stateCode ? (cfg.listName("STATE", a.stateCode) ?? "A state no longer listed") : null;
  // What the officer changed, once the supplier is on the register: the company's differences, and the contact's for a reader the contact is open to.
  const entry = a.status === "RECORDED" && !erased ? a.acceptedSupplier : null;
  const names = { nameOf: (kind: "ENTITY_TYPE" | "COUNTRY" | "STATE" | "BUMIPUTERA_STATUS", code: string) => cfg.listName(kind, code), day: (d: string) => formatDate(d) };
  const company = (x: { registeredName: string; registrationNo: string; entityTypeCode: string; countryCode: string; addressLine1: string; addressLine2: string; city: string; postcode: string; stateCode: string; bumiputeraClaimCode: string; incorporatedOn: Date | null; companyEmail: string }) => ({
    registeredName: x.registeredName, registrationNo: x.registrationNo, entityTypeCode: x.entityTypeCode, countryCode: x.countryCode, addressLine1: x.addressLine1, addressLine2: x.addressLine2, city: x.city, postcode: x.postcode, stateCode: x.stateCode, bumiputeraClaimCode: x.bumiputeraClaimCode, incorporatedOn: x.incorporatedOn ? storedDay(x.incorporatedOn) : null, companyEmail: x.companyEmail,
  });
  const differences = entry ? companyDifferences(company(a), company(entry), names) : [];
  const registerContact = entry?.contacts[0] ?? null;
  const contactChanges = entry && registerContact && contact.state === "GRANTED" ? contactDifferences({ name: a.contactName, designation: a.contactDesignation, email: a.contactEmail, phone: a.contactPhone }, registerContact) : [];

  return (
    <>
      <RecordCrumb label={a.reference} />
      <PageHeader
        eyebrow={back}
        title={erased ? `Online application ${a.reference}` : a.registeredName}
        badge={<Badge tone={status.tone} dot>{status.text}</Badge>}
        subtitle={erased ? "The applicant's details have been erased." : `Registration number ${a.registrationNo}`}
        meta={[<span key="ref" className="font-mono text-[12.5px]">{a.reference}</span>, `Sent ${formatDate(storedDay(a.receivedOn))}`, a.decidedAt && a.decidedBy ? `By ${a.decidedBy.name}` : null]}
        actionsNoteId="online-note"
        actionsNote={waiting && stops ? "This number is already on the register, so no new supplier can be recorded from it. Set the application aside, or record a further application on the supplier that holds it." : undefined}
        actions={
          waiting ? (
            <span className="flex flex-wrap items-center gap-2">
              <DiscardOnlineApplicationDrawer id={a.id} reference={a.reference} people={people.map((p) => ({ value: p.id, label: p.name }))} />
              {stops ? (
                <Button variant="primary" size="md" disabled aria-describedby="online-note">Record the supplier</Button>
              ) : (
                <ButtonLink href={`/suppliers/new?from=${a.id}`} variant="primary" size="md">Record the supplier</ButtonLink>
              )}
            </span>
          ) : undefined
        }
      />
      <div className="mb-6 flex flex-col gap-3">
        {flags.map((f) => {
          const w = flagWords(f);
          return (
            <Callout key={f.code} tone={w.tone} title={f.code === "NUMBER_ON_REGISTER" ? "Number already on the register" : "Sent more than once"}>
              {w.text}
            </Callout>
          );
        })}
        {waiting && !stops && flags.length === 0 && (
          <Callout tone="info" title="Nothing on the register clashes with this number">
            It is not held by any supplier, and no other online application waits with it. Check it against the certificate before recording.
          </Callout>
        )}
      </div>

      {entry && (
        <Card className="mb-6">
          <CardHeader title="What the officer changed" subtitle="The applicant's words are kept beside the register's entry. Each field the officer corrected when recording the supplier is listed here." />
          <CardBody>
            <p className="mb-3 text-[13.5px] text-ink-2">
              On the register as <Link href={`/suppliers/${entry.id}`}>{entry.registeredName} ({entry.reference})</Link>.
            </p>
            {differences.length + contactChanges.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">{contact.state === "GRANTED" ? "Nothing was changed: the register holds what the applicant typed." : "Nothing about the company was changed. The contact's details are withheld from you, so whether they were corrected is not shown."}</p>
            ) : (
              <KeyValues columns={1} items={[...differences, ...contactChanges].map((d) => ({ label: d.label, value: <span>Applicant: {d.applicant}. Register: {d.register}.</span> }))} />
            )}
          </CardBody>
        </Card>
      )}
      {erased ? (
        <Card>
          <CardHeader title="What is kept" subtitle="The applicant's own words are not kept on an application that was set aside, or recorded before they were kept." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Outcome", value: status.text },
                { label: "Decided", value: formatOrgDay(a.decidedAt, org.timeZone) },
                { label: "By", value: a.decidedBy?.name ?? "—" },
                ...(a.status === "RECORDED" && a.acceptedSupplier ? [{ label: "Supplier", value: <Link href={`/suppliers/${a.acceptedSupplier.id}`}>{a.acceptedSupplier.registeredName} ({a.acceptedSupplier.reference})</Link> }] : []),
                ...(a.status === "DISCARDED" ? [{ label: "Why it was set aside", value: <span className="whitespace-pre-line">{a.discardReason}</span> }] : []),
              ]}
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="The company" subtitle="As the applicant typed it. Nothing here has been checked." />
            <CardBody>
              <KeyValues
                columns={2}
                items={[
                  { label: "Registered name", value: a.registeredName },
                  { label: "Registration number", value: a.registrationNo },
                  { label: "Type of company", value: cfg.listName("ENTITY_TYPE", a.entityTypeCode) ?? "A type no longer listed" },
                  { label: "Country", value: cfg.listName("COUNTRY", a.countryCode) ?? "A country no longer listed" },
                  { label: "Date incorporated", value: a.incorporatedOn ? formatDate(storedDay(a.incorporatedOn)) : "Not given" },
                  { label: "Bumiputera status", value: reading },
                  { label: "Company email", value: <span className="inline-flex flex-wrap items-center gap-2">{a.companyEmail}<Chip tone="neutral">Not verified</Chip></span> },
                  // An application received before step one asked for the address in parts holds it as one text.
                  { label: "Registered address", value: <span className="whitespace-pre-line">{a.addressLine1 ? [a.addressLine1, a.addressLine2, [a.postcode, a.city].filter(Boolean).join(" "), stateName].filter(Boolean).join("\n") : a.registeredAddress}</span> },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Who to reach" subtitle="A person at the company, as the applicant typed. Not a user of the portal." />
            <CardBody>
              <KeyValues
                columns={2}
                items={[
                  { label: "Name", value: <SulitValue of={through(contact, a.contactName)} /> },
                  { label: "Position", value: <SulitValue of={through(contact, a.contactDesignation || "—")} /> },
                  { label: "Email", value: <SulitValue of={through(contact, a.contactEmail || "—")} /> },
                  { label: "Telephone", value: <SulitValue of={through(contact, a.contactPhone || "—")} /> },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
