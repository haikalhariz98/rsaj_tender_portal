import { hiddenExercises } from "@/app/_auth/sulit";
import { requireStaff } from "@/app/_auth/actor";
import { ENGLISH } from "@/lib/i18n/language";
import { DataList, type Row } from "@/components/data-list";
import { InboxIcon } from "@/components/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { Words } from "@/lib/contract/labels";
import { db } from "@/lib/db";
import { formatOrgDateTime } from "@/lib/format";
import { STAFF_NOTICE_KIND_LABEL, type StaffNoticeKind } from "@/lib/inbox/kinds";
import { decodeCursor, encodeCursor } from "@/lib/inbox/paging";
import { inboxTotals, loadInboxPage } from "@/lib/inbox/store";
import { INBOX_WORDS as I } from "@/lib/i18n/catalogues/inbox";
import { say, sayWith } from "@/lib/i18n/say";

import { markNoticesRead, openNoticeAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

/**
 * The staff inbox (FR-APR-018, Phase 3c): the notices raised for the person signed in, and nobody else's. Email is not connected (INT-09), so this is where a
 * step moved to your office, a recall, a delegation to you or a not-approved memo is told. AC-14 (GN-05): the page no longer carries "Open my steps" or the
 * Delivery box; the fact that notices are not emailed stays as one clause of the subtitle. A notice about a restricted exercise
 * is left out for anyone not named on it. What is waiting for you to decide is on My approvals, not here.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const actor = await requireStaff();
  const lang = ENGLISH;
  const t = (words: Words) => say(words, lang);
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
      notice: n.href ? { kind: "open", text: n.title, action: openNoticeAction, fields: { id: n.id }, sub: n.body } : { kind: "stack", title: n.title, sub: n.body },
      what: { kind: "chip", text: t(STAFF_NOTICE_KIND_LABEL[n.kind as StaffNoticeKind] ?? I.otherKind), tone: "brand" },
      received: { kind: "text", text: formatOrgDateTime(n.raisedAt, actor.organisationTimeZone, lang) },
      status: n.readAt ? { kind: "chip", text: t(I.read) } : { kind: "chip", text: t(I.unread), tone: "info" },
    },
  }));

  return (
    <>
      <PageHeader
        title={t(I.title)}
        info={{ title: t(I.infoTitle), text: t(I.more) }}
        meta={[sayWith(I.unreadCount, lang, { count: String(totals.unread) }), sayWith(totals.total === 1 ? I.noticeCount : I.noticesCount, lang, { count: String(totals.total) })] }
      />
      <Card className="overflow-hidden">
        <CardHeader
          icon={<InboxIcon size={17} />}
          title={t(I.notices)}
          subtitle={before ? sayWith(I.subtitleOlder, lang, { shown: String(notices.length), total: String(totals.total) }) : more ? sayWith(I.subtitleMore, lang, { shown: String(notices.length), total: String(totals.total) }) : t(I.subtitleNewest)}
          actions={
            totals.unread > 0 ? (
              <form action={markNoticesRead}>
                <input type="hidden" name="upTo" value={drawnAt.toISOString()} />
                <Button type="submit" size="sm" variant="secondary">
                  {t(I.markAllRead)}
                </Button>
              </form>
            ) : undefined
          }
          divided={false}
        />
        {rows.length === 0 ? (
          <EmptyState title={t(I.emptyTitle)} action={<ButtonLink href="/approvals" size="sm" variant="secondary">Go to my approvals</ButtonLink>} />
        ) : (
          <DataList
            flat
            selectable={false}
            exportName="inbox"
            searchPlaceholder={t(I.searchNotices)}
            emptyTitle={t(I.listEmptyTitle)}
            views={[
              { id: "unread", label: t(I.unread) },
              { id: "read", label: t(I.read) },
            ]}
            rowOpens
            columns={[
              { key: "notice", label: t(I.colNotice), mobile: "primary" },
              { key: "what", label: t(I.colWhat), width: "210px", hideBelow: "md", mobile: "meta" },
              { key: "received", label: t(I.colReceived), width: "190px", sortable: true, mobile: "meta" },
              { key: "status", label: t(I.colStatus), width: "130px", mobile: "meta" },
            ]}
            rows={rows}
          />
        )}
        {(more || before) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            {before ? (
              <ButtonLink href="/inbox" size="sm" variant="secondary">
                {t(I.backToNewest)}
              </ButtonLink>
            ) : (
              <span />
            )}
            {more && last && (
              <ButtonLink href={`/inbox?before=${encodeURIComponent(encodeCursor(last))}`} size="sm" variant="secondary">
                {t(I.olderNotices)}
              </ButtonLink>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
