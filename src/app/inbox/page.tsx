import { hiddenExercises } from "@/app/_auth/sulit";
import { requireStaff } from "@/app/_auth/actor";
import { DataList, type Row } from "@/components/data-list";
import { InboxIcon } from "@/components/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { Card, CardHeader } from "@/components/ui/card";
import { LeadWithMore } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { formatOrgDateTime } from "@/lib/format";
import { NOTICE_DELIVERY_STATEMENT, STAFF_NOTICE_KIND_LABEL, type StaffNoticeKind } from "@/lib/inbox/kinds";
import { loadInbox } from "@/lib/inbox/store";

import { markNoticesRead } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The staff inbox (FR-APR-018, Phase 3c): the notices raised for the person signed in, and nobody else's. Email is not connected (INT-09), so this is where a
 * step moved to your office, a recall, a delegation to you or a not-approved memo is told, and every screen of it says so. A notice about a restricted exercise
 * is left out for anyone not named on it. What is waiting for you to decide is on My approvals, not here.
 */
export default async function InboxPage() {
  const actor = await requireStaff();
  const notices = await loadInbox(db, { organisationId: actor.organisationId, personId: actor.personId }, await hiddenExercises(actor));
  const unread = notices.filter((n) => !n.readAt);
  const rows: Row[] = notices.map((n) => ({
    id: n.id,
    views: [n.readAt ? "read" : "unread"],
    search: [n.title, n.body].join(" "),
    sortKeys: { received: n.raisedAt.getTime() },
    cells: {
      notice: n.href ? { kind: "link", text: n.title, href: n.href, sub: n.body } : { kind: "stack", title: n.title, sub: n.body },
      what: { kind: "chip", text: STAFF_NOTICE_KIND_LABEL[n.kind as StaffNoticeKind] ?? "Notice", tone: "brand" },
      received: { kind: "text", text: formatOrgDateTime(n.raisedAt, actor.organisationTimeZone) },
      status: n.readAt ? { kind: "chip", text: "Read" } : { kind: "chip", text: "Unread", tone: "info" },
    },
  }));

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={<LeadWithMore lead="What has been told to you in the portal." more="A step that arrived, was moved or was withdrawn, a delegation given to you, and a memo that a matter was not approved. What is waiting for you to decide is on My approvals." />}
        meta={[`${unread.length} unread`, `${notices.length} ${notices.length === 1 ? "notice" : "notices"}`]}
        actions={<ButtonLink href="/approvals?tab=mine" size="sm">Open my steps</ButtonLink>}
      />
      <Callout tone="neutral" className="mb-6" title="Delivery">
        {NOTICE_DELIVERY_STATEMENT}
      </Callout>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<InboxIcon size={17} />}
          title="Notices"
          subtitle="Newest first."
          actions={
            unread.length > 0 ? (
              <form action={markNoticesRead}>
                {unread.map((n) => (
                  <input key={n.id} type="hidden" name="id" value={n.id} />
                ))}
                <Button type="submit" size="sm" variant="secondary">
                  Mark all as read
                </Button>
              </form>
            ) : undefined
          }
          divided={false}
        />
        {rows.length === 0 ? (
          <EmptyState title="Nothing has been told to you">Notices appear here when an act of someone else concerns your office or your work.</EmptyState>
        ) : (
          <DataList
            flat
            selectable={false}
            exportName="inbox"
            searchPlaceholder="Search notices"
            emptyTitle="Nothing here"
            emptyBody="No notice in this view."
            views={[
              { id: "unread", label: "Unread" },
              { id: "read", label: "Read" },
            ]}
            rowOpens
            columns={[
              { key: "notice", label: "Notice", mobile: "primary" },
              { key: "what", label: "What", width: "210px", hideBelow: "md", mobile: "meta" },
              { key: "received", label: "Received", width: "190px", sortable: true, mobile: "meta" },
              { key: "status", label: "Status", width: "100px", mobile: "meta" },
            ]}
            rows={rows}
          />
        )}
      </Card>
    </>
  );
}
