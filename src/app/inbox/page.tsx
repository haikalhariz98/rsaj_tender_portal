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
import { decodeCursor, encodeCursor } from "@/lib/inbox/paging";
import { inboxTotals, loadInboxPage } from "@/lib/inbox/store";

import { markNoticesRead } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The staff inbox (FR-APR-018, Phase 3c): the notices raised for the person signed in, and nobody else's. Email is not connected (INT-09), so this is where a
 * step moved to your office, a recall, a delegation to you or a not-approved memo is told, and every screen of it says so. A notice about a restricted exercise
 * is left out for anyone not named on it. What is waiting for you to decide is on My approvals, not here.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const actor = await requireStaff();
  const { before } = await searchParams;
  const viewer = { organisationId: actor.organisationId, personId: actor.personId };
  const hidden = await hiddenExercises(actor);
  // The page is drawn at one moment: "Mark all as read" marks what was raised by then, so a notice that arrives while it is open is not marked unseen.
  const drawnAt = new Date();
  const [{ notices, more }, totals] = await Promise.all([loadInboxPage(db, viewer, hidden, { before: decodeCursor(before) }), inboxTotals(db, viewer, hidden)]);
  const last = notices[notices.length - 1];
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
        meta={[`${totals.unread} unread`, `${totals.total} ${totals.total === 1 ? "notice" : "notices"}`]}
        actions={<ButtonLink href="/approvals?tab=mine" size="sm">Open my steps</ButtonLink>}
      />
      <Callout tone="neutral" className="mb-6" title="Delivery">
        {NOTICE_DELIVERY_STATEMENT}
      </Callout>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<InboxIcon size={17} />}
          title="Notices"
          subtitle={before ? `Newest first, older than the ones before. Showing ${notices.length} of ${totals.total}.` : more ? `Newest first. Showing the latest ${notices.length} of ${totals.total}.` : "Newest first."}
          actions={
            totals.unread > 0 ? (
              <form action={markNoticesRead}>
                <input type="hidden" name="upTo" value={drawnAt.toISOString()} />
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
        {(more || before) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            {before ? (
              <ButtonLink href="/inbox" size="sm" variant="secondary">
                Back to the newest
              </ButtonLink>
            ) : (
              <span />
            )}
            {more && last && (
              <ButtonLink href={`/inbox?before=${encodeURIComponent(encodeCursor(last))}`} size="sm" variant="secondary">
                Older notices
              </ButtonLink>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
