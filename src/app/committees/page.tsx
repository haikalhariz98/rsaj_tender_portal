import { CalendarIcon } from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { matterCount, MEETING_STATUS_LABEL, MEETING_STATUS_TONE } from "@/lib/committee/labels";
import { listSittings, organisationId, SITTINGS_PAGE } from "@/lib/committee/sittings";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { patternFaults } from "@/lib/numbering/series";

import { ScheduleSitting } from "./editors";

export const dynamic = "force-dynamic";

const TONE = { info: "info", brand: "brand", ok: "ok", neutral: undefined } as const;

/**
 * Committee sittings: the running of committees, apart from their setup.
 *
 * Not in the prototype, which only shows a committee's votes on each matter's own
 * record. That view arrives with the modules that own the matters; this list works
 * before them (ruling 5.1).
 */
export default async function SittingsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: raw } = await searchParams;
  const requested = Math.max(0, Number.parseInt(raw ?? "0", 10) || 0);
  const { sittings, committees, total, page, counts } = await listSittings(requested);
  const pages = Math.max(1, Math.ceil(total / SITTINGS_PAGE));
  const orgId = await organisationId();
  const series = orgId
    ? await db.numberingSeries.findUnique({ where: { organisationId_key: { organisationId: orgId, key: "meeting" } } })
    : null;
  const numbered = series != null && patternFaults(series).length === 0;

  // Counted across every sitting, not only this page.
  const { upcoming, awaiting, pending } = counts;
  const schedulable = committees.filter((c) => c.retiredOn == null || c.retiredOn > new Date());

  const rows: Row[] = sittings.map((s) => ({
    id: s.id,
    views: [
      ...(s.status === "SCHEDULED" ? ["upcoming"] : []),
      ...(s.status === "IN_PROGRESS" ? ["awaiting"] : []),
    ],
    search: [s.committeeName, s.reference, MEETING_STATUS_LABEL[s.status]].join(" "),
    sortKeys: { date: s.meetingDate.getTime(), matters: s.matters },
    cells: {
      committee: { kind: "text", text: s.committeeName },
      reference: { kind: "link", text: s.reference, href: `/committees/${s.id}` },
      date: { kind: "text", text: formatDate(s.meetingDate) },
      status: { kind: "badge", text: MEETING_STATUS_LABEL[s.status], tone: TONE[MEETING_STATUS_TONE[s.status]] },
      matters: {
        kind: "text",
        text: matterCount(s.matters, s.pending),
        dim: s.matters === 0,
      },
      quorum:
        s.status === "CANCELLED"
          ? { kind: "text", text: "—", dim: true }
          : s.quorum == null
          ? { kind: "badge", text: "Not set", tone: "warn" }
          : s.status === "SCHEDULED"
            ? { kind: "text", text: `${s.quorum} required`, dim: true }
            : { kind: "badge", text: `${s.present} of ${s.quorum}`, tone: s.quorumState === "MET" ? "ok" : "warn" },
    },
  }));

  return (
    <>
      <PageHeader
        title="Committee sittings"
        subtitle="Sittings, their registers, the matters tabled, each member's vote and the minutes."
        meta={[
          `${upcoming} upcoming`,
          `${awaiting} awaiting minutes`,
          `${pending} ${pending === 1 ? "matter" : "matters"} pending`,
        ]}
        actions={schedulable.length > 0 ? <ScheduleSitting committees={schedulable} numbered={numbered} /> : undefined}
      />

      <Card className="overflow-hidden">
        <CardHeader
          icon={<CalendarIcon size={17} />}
          title="Sittings"
          subtitle={
            committees.length === 0
              ? "No committee is configured, so nothing can sit."
              : "Newest first. Open a sitting to take its register and record its decisions."
          }
          divided={false}
        />
        <DataList
          flat
          selectable={false}
          exportName="sittings"
          searchPlaceholder="Search sittings"
          emptyTitle="No sittings recorded"
          emptyBody={
            committees.length === 0
              ? "Configure a committee under Configuration, Committees before scheduling a sitting."
              : "Schedule a sitting to begin."
          }
          views={[
            { id: "upcoming", label: "Upcoming" },
            { id: "awaiting", label: "Awaiting minutes" },
          ]}
          filters={[{ key: "committee", label: "Committee" }]}
          rowAction={{ label: "Open", hrefTemplate: "/committees/{id}" }}
          rowOpens
          columns={[
            { key: "committee", label: "Committee", sortable: true, mobile: "meta" },
            { key: "reference", label: "Reference", width: "176px", nowrap: true, sortable: true, mobile: "primary" },
            { key: "date", label: "Date", width: "128px", nowrap: true, sortable: true, mobile: "meta" },
            { key: "status", label: "Status", width: "128px", sortable: true, mobile: "meta" },
            { key: "matters", label: "Matters", width: "176px", sortable: true, mobile: "meta" },
            { key: "quorum", label: "Quorum", width: "96px", mobile: "meta" },
          ]}
          rows={rows}
        />
        {pages > 1 && (
          <CardFooter className="flex items-center justify-between text-[12.5px] text-ink-3">
            <span>
              Sittings {page * SITTINGS_PAGE + 1}–{Math.min(total, (page + 1) * SITTINGS_PAGE)} of {total}
            </span>
            <span className="flex gap-2">
              {page > 0 && (
                <ButtonLink href={`/committees?page=${page - 1}`} size="sm" variant="ghost">
                  Newer
                </ButtonLink>
              )}
              {page + 1 < pages && (
                <ButtonLink href={`/committees?page=${page + 1}`} size="sm" variant="ghost">
                  Older
                </ButtonLink>
              )}
            </span>
          </CardFooter>
        )}
      </Card>
    </>
  );
}
