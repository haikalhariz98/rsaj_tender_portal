import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/app/awards/[id]/print/[kind]/print-button";
import { PrinterIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { SulitTag, SulitValue } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { kelasText, OPENING_DOWNLOAD_TITLE, readText, SCHEDULE_COLUMNS, SUMMARY_COLUMNS } from "@/lib/opening/download";
import { scheduleSection } from "@/lib/opening/read";
import { requireStaff } from "@/app/_auth/actor";
import { exerciseIsHidden, sulitExerciseGate } from "@/app/_auth/sulit";
import { PRICE_FIELDS } from "../workspace";

export const dynamic = "force-dynamic";

const NOT_FINALISED = "Not finalised";

/**
 * The schedule of tenders (Jadual Tawaran) in print (6.7 plan §5): once the opening is finalised,
 * only its frozen copy, never recomputed. Before then, the rows as read so far with the company
 * estimate sealed, marked "Not finalised" on every page: the paper the panel signs. Prices are SULIT
 * and say so; this is the only paper route while a SULIT scan cannot be downloaded.
 */
export default async function OpeningPrintPage(props: PageProps<"/sourcing/[id]/opening/print">) {
  const actor = await requireStaff();
  const { id } = await props.params;
  // FR-MTD-007: an exercise restricted to its named people reads as one that does not exist to anyone else, and the attempt is logged.
  if (await exerciseIsHidden(actor, id)) notFound();
  const wanted = (await props.searchParams).opening;
  const d = await scheduleSection(actor, id, await sulitExerciseGate(actor, id, "exercise", PRICE_FIELDS));
  if (!d) notFound();
  const back = `/sourcing/${id}?tab=bids&section=schedule`;
  const o = d.openings.find((x) => x.id === wanted) ?? d.openings[0] ?? null;
  if (!o) {
    return (
      <>
        <RecordCrumb label={d.reference} />
        <PageHeader eyebrow={<Link href={back}>Back to the schedule</Link>} title="Nothing to print" meta={[<span key="ref" className="font-mono text-[12.5px]">{d.reference}</span>]} />
        <Card>
          <EmptyState title="No opening has started" action={<ButtonLink href={back} variant="secondary" size="sm">Back to the schedule</ButtonLink>}>
            The schedule of tenders is printed once the opening has started.
          </EmptyState>
        </Card>
      </>
    );
  }
  const schedule = new Map(o.rows.map((r) => [r.listingNo, r] as const));
  const watermark = o.finalised ? null : NOT_FINALISED;
  return (
    <>
      <RecordCrumb label={d.reference} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back}>Back to the schedule</Link>
        <PrintButton icon={<PrinterIcon size={15} />} />
      </div>
      <Callout tone={watermark ? "warn" : "info"} className="mb-5 print:hidden">
        {watermark ? "Not finalised: the offers as read so far, with the company estimate sealed. It is frozen when the opening is finalised." : `As finalised ${o.finalisedAt}: the copy frozen then, never recomputed.`}
      </Callout>
      <article className="relative mx-auto max-w-[900px] overflow-hidden rounded-card border border-line bg-surface px-6 py-10 shadow-card sm:px-12 print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
        {watermark && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden select-none [container-type:size] print:fixed">
            <span className="-rotate-30 text-center text-[9cqw] leading-none font-bold tracking-wider whitespace-nowrap text-ink/[0.09]">{watermark}</span>
          </div>
        )}
        <h1 className="mb-1 text-[22px] leading-tight font-bold text-ink">{OPENING_DOWNLOAD_TITLE.schedule}</h1>
        <p className="mb-6 text-[13.5px] text-ink-2">{o.title}</p>
        <dl className="mb-8 grid gap-x-8 gap-y-2 text-[13.5px] sm:grid-cols-2">
          {o.header.map((h) => (
            <div key={h.label} className="flex flex-col">
              <dt className="text-[12px] text-ink-3">{h.label}</dt>
              <dd className="break-words text-ink">{h.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          Prices as read <SulitTag />
        </p>
        <Table>
          <THead>
            <Th>{SCHEDULE_COLUMNS.listing}</Th>
            <Th>{SCHEDULE_COLUMNS.bidder}</Th>
            <Th>{SCHEDULE_COLUMNS.kelas}</Th>
            <Th>{SCHEDULE_COLUMNS.classAsRead}</Th>
            <Th>{SCHEDULE_COLUMNS.status}</Th>
            <Th numeric>{SCHEDULE_COLUMNS.price}</Th>
            <Th>{SCHEDULE_COLUMNS.period}</Th>
          </THead>
          <tbody>
            {o.rows.length === 0 && (
              <Tr>
                <Td className="text-ink-3">No offer read yet.</Td>
              </Tr>
            )}
            {o.rows.map((r) => (
              <Tr key={r.listingNo}>
                <Td label={SCHEDULE_COLUMNS.listing}>{r.listingNo}</Td>
                <Td label={SCHEDULE_COLUMNS.bidder}>{r.alternative ? `${r.bidderName} (${r.alternative.toLowerCase()})` : r.bidderName}</Td>
                <Td label={SCHEDULE_COLUMNS.kelas}>{kelasText(r.registerClass)}</Td>
                <Td label={SCHEDULE_COLUMNS.classAsRead}>{readText(r.registrationClass)}</Td>
                <Td label={SCHEDULE_COLUMNS.status}>{readText(r.registrationStatus)}</Td>
                <Td numeric label={SCHEDULE_COLUMNS.price}><SulitValue of={r.openingPrice} /></Td>
                <Td label={SCHEDULE_COLUMNS.period}>{r.period}</Td>
              </Tr>
            ))}
            {o.benchmark && (
              <Tr>
                <Td label={SCHEDULE_COLUMNS.listing}>—</Td>
                <Td label={SCHEDULE_COLUMNS.bidder}>{o.benchmark.sealed ? "Company estimate" : o.benchmark.label}</Td>
                <Td label={SCHEDULE_COLUMNS.kelas}>—</Td>
                <Td label={SCHEDULE_COLUMNS.classAsRead}>—</Td>
                <Td label={SCHEDULE_COLUMNS.status}>—</Td>
                <Td numeric label={SCHEDULE_COLUMNS.price}>{o.benchmark.sealed ? o.benchmark.text : <SulitValue of={o.benchmark.companyEstimate} />}</Td>
                <Td label={SCHEDULE_COLUMNS.period}>—</Td>
              </Tr>
            )}
          </tbody>
        </Table>
        {o.summary && (
          <>
            {/* The Grand Summary's Kelas and period are the schedule row's of the same Bil. (SR-15). */}
            <h2 className="mt-10 mb-3 text-[17px] font-bold text-ink">{OPENING_DOWNLOAD_TITLE.summary}</h2>
            <Table>
              <THead>
                <Th>{SUMMARY_COLUMNS.listing}</Th>
                <Th>{SUMMARY_COLUMNS.bidder}</Th>
                <Th>{SUMMARY_COLUMNS.kelas}</Th>
                <Th numeric>{SUMMARY_COLUMNS.price}</Th>
                <Th>{SUMMARY_COLUMNS.period}</Th>
                <Th>{SUMMARY_COLUMNS.label}</Th>
              </THead>
              <tbody>
                {o.summary.rows.map((r) => (
                  <Tr key={r.listingNo}>
                    <Td label={SUMMARY_COLUMNS.listing}>{r.listingNo}</Td>
                    <Td label={SUMMARY_COLUMNS.bidder}>{r.bidderName}</Td>
                    <Td label={SUMMARY_COLUMNS.kelas}>{kelasText(schedule.get(r.listingNo)?.registerClass ?? null)}</Td>
                    <Td numeric label={SUMMARY_COLUMNS.price}><SulitValue of={r.openingPrice} /></Td>
                    <Td label={SUMMARY_COLUMNS.period}>{schedule.get(r.listingNo)?.period ?? ""}</Td>
                    <Td label={SUMMARY_COLUMNS.label}>{r.label}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
        {o.copy && <p className="mt-8 text-[13px] text-ink-2">{o.copy.text}.{o.explanation ? ` Explained: ${o.explanation.text}` : ""}</p>}
        <footer className="mt-10 border-t border-line pt-3 text-[11.5px] text-ink-3">{watermark ? `${watermark}. Printed from the record as it stands; SULIT.` : "Printed from the copy frozen at finalising; SULIT. The signed paper is the record of the panel's signatures."}</footer>
      </article>
    </>
  );
}
