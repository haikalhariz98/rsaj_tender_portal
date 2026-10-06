import Link from "next/link";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { Badge } from "@/components/ui/badge";
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

export const dynamic = "force-dynamic";

const STATUS = { RECEIVED: { text: "Waiting for an officer", tone: "info" }, ACCEPTED: { text: "Recorded as a supplier", tone: "ok" }, DISCARDED: { text: "Set aside", tone: "neutral" } } as const;

/**
 * One online application, in full, for an officer: what the applicant typed, what the register holds
 * against its number, and the two things that can be done with it (record the supplier from it, or set
 * it aside). Once decided, the applicant's words are erased and only the outcome stays.
 */
export default async function OnlineApplicationPage(props: PageProps<"/suppliers/online/[id]">) {
  const { id } = await props.params;
  const org = await supplierOrg();
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
  const status = STATUS[a.status];
  const waiting = a.status === "RECEIVED";
  const stops = blocksRecording(flags);

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

      {erased ? (
        <Card>
          <CardHeader title="What is kept" subtitle="The applicant's own words are erased once an application is decided: nothing is kept twice." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Outcome", value: status.text },
                { label: "Decided", value: formatOrgDay(a.decidedAt, org.timeZone) },
                { label: "By", value: a.decidedBy?.name ?? "—" },
                ...(a.status === "ACCEPTED" && a.acceptedSupplier ? [{ label: "Supplier", value: <Link href={`/suppliers/${a.acceptedSupplier.id}`}>{a.acceptedSupplier.registeredName} ({a.acceptedSupplier.reference})</Link> }] : []),
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
                  { label: "Company email", value: a.companyEmail },
                  { label: "Registered address", value: <span className="whitespace-pre-line">{a.registeredAddress}</span> },
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
                  { label: "Name", value: a.contactName },
                  { label: "Position", value: a.contactDesignation || "—" },
                  { label: "Email", value: a.contactEmail || "—" },
                  { label: "Telephone", value: a.contactPhone || "—" },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
