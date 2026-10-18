import { DataList, type Row } from "@/components/data-list";
import { sulitText } from "@/components/sulit-cell";
import { ButtonLink } from "@/components/ui/button";
import { FLOW_LABEL } from "@/lib/method/flow";
import { classAsReadText, kelasText, readText, SCHEDULE_COLUMNS, statusAsReadText, SUMMARY_COLUMNS } from "@/lib/opening/download";
import type { ScheduleSectionView } from "@/lib/opening/read";

/**
 * The SR-15 tables of one opening, the schedule of tenders (Jadual Tawaran) and the Grand Summary, with the two downloads beside them. ONE copy: the Schedule section renders it and, once the
 * opening is finalised, so does Received (SR-15 "Where: Received", ruling 20ct). Both screens read the same `scheduleSection`, so they cannot show different rows or columns.
 */

export type ScheduleOpening = ScheduleSectionView["openings"][number];

/// The two CSV downloads. Offered once the opening is finalised.
export function ScheduleDownloads({ exerciseId, o }: { exerciseId: string; o: ScheduleOpening }) {
  if (!o.finalised) return null;
  return (
    <>
      <ButtonLink href={`/sourcing/${exerciseId}/opening/download/schedule?opening=${o.id}`} variant="secondary" size="sm">Download {FLOW_LABEL.JADUAL} (CSV)</ButtonLink>
      <ButtonLink href={`/sourcing/${exerciseId}/opening/download/summary?opening=${o.id}`} variant="secondary" size="sm">Download Grand Summary (CSV)</ButtonLink>
    </>
  );
}

/// The schedule of tenders.
export function ScheduleList({ o }: { o: ScheduleOpening }) {
  const rows: Row[] = o.rows.map((r) => ({
    id: String(r.listingNo),
    search: `${r.listingNo} ${r.bidderName}`,
    sortKeys: { listing: r.listingNo },
    cells: {
      listing: { kind: "text", text: `No. ${r.listingNo}` },
      bidder: { kind: "stack", title: r.bidderName, sub: r.alternative || undefined },
      kelas: { kind: "text", text: kelasText(r.registerClass) },
      classAsRead: { kind: "text", text: classAsReadText(r.registrationClass, o.online) },
      status: { kind: "text", text: statusAsReadText({ value: r.registrationStatus, online: o.online, held: r.statusHeld, registerStanding: r.registerStanding }) },
      openingPrice: sulitText(r.openingPrice),
      period: { kind: "text", text: r.period },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      exportName="schedule-of-tenders"
      emptyTitle="No offer read yet"
      emptyBody="Each offer opened is listed in opening order."
      columns={[
        { key: "listing", label: SCHEDULE_COLUMNS.listing, width: "90px", sortable: true, mobile: "primary" },
        { key: "bidder", label: SCHEDULE_COLUMNS.bidder, mobile: "meta" },
        { key: "kelas", label: SCHEDULE_COLUMNS.kelas, width: "170px", mobile: "meta" },
        { key: "classAsRead", label: SCHEDULE_COLUMNS.classAsRead, width: "140px", mobile: "meta" },
        { key: "status", label: SCHEDULE_COLUMNS.status, width: "120px", mobile: "meta" },
        { key: "openingPrice", label: SCHEDULE_COLUMNS.price, width: "170px", sulit: true, mobile: "meta" },
        { key: "period", label: SCHEDULE_COLUMNS.period, width: "150px", mobile: "meta" },
      ]}
      rows={rows}
    />
  );
}

/// The Grand Summary, once the opening has one.
export function GrandSummaryList({ o }: { o: ScheduleOpening }) {
  if (!o.summary) return null;
  // SR-15: the Grand Summary's Kelas and Tempoh Kerja are the schedule row's of the same Bil.
  const scheduleRow = new Map(o.rows.map((r) => [r.listingNo, r] as const));
  const summary: Row[] = o.summary.rows.map((r) => ({
    id: `s${r.listingNo}`,
    search: `${r.listingNo} ${r.bidderName}`,
    cells: {
      listing: { kind: "text", text: `No. ${r.listingNo}` },
      bidder: { kind: "text", text: r.bidderName },
      kelas: { kind: "text", text: kelasText(scheduleRow.get(r.listingNo)?.registerClass ?? null) },
      period: { kind: "text", text: scheduleRow.get(r.listingNo)?.period ?? "" },
      openingPrice: sulitText(r.openingPrice),
      label: { kind: "badge", text: r.label, tone: r.lowest ? "brand" : r.qualified ? "ok" : undefined },
    },
  }));
  return (
    <div className="border-t border-line">
      <h3 className="px-5 pt-4 text-[13.5px] font-semibold text-ink sm:px-6">Grand Summary</h3>
      <DataList
        flat
        selectable={false}
        searchable={false}
        toolbar={false}
        exportName="grand-summary"
        emptyTitle="No offer"
        emptyBody="No offer was read."
        columns={[
          { key: "listing", label: SUMMARY_COLUMNS.listing, width: "90px", mobile: "primary" },
          { key: "bidder", label: SUMMARY_COLUMNS.bidder, mobile: "meta" },
          { key: "kelas", label: SUMMARY_COLUMNS.kelas, width: "190px", mobile: "meta" },
          { key: "openingPrice", label: SUMMARY_COLUMNS.price, width: "170px", sulit: true, mobile: "meta" },
          { key: "period", label: SUMMARY_COLUMNS.period, width: "150px", mobile: "meta" },
          { key: "label", label: SUMMARY_COLUMNS.label, width: "200px", mobile: "meta" },
        ]}
        rows={summary}
      />
    </div>
  );
}
