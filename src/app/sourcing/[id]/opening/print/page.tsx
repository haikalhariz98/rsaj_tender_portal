import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/app/awards/[id]/print/[kind]/print-button";
import { PrinterIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { VALUE_SULIT_LABEL } from "@/lib/documents/labels";
import { scheduleSection } from "@/lib/opening/read";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

const NOT_FINALISED = "Not finalised";

/**
 * The schedule of tenders (Jadual Tawaran) in print (6.7 plan §5): once the opening is finalised,
 * only its frozen copy, never recomputed. Before then, the rows as read so far with the company
 * estimate sealed, marked "Not finalised" on every page: the paper the panel signs. Prices are SULIT
 * and say so; this is the only paper route while a SULIT scan cannot be downloaded.
 */
export default async function OpeningPrintPage(props: PageProps<"/sourcing/[id]/opening/print">) {
  await requireStaff();
  const { id } = await props.params;
  const wanted = (await props.searchParams).opening;
  const d = await scheduleSection(id);
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
        <h1 className="mb-1 text-[22px] leading-tight font-bold text-ink">Schedule of tenders</h1>
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
          Prices as read <Chip tone="err">{VALUE_SULIT_LABEL}</Chip>
        </p>
        <Table>
          <THead>
            <Th>Bil.</Th>
            <Th>Bidder</Th>
            <Th>Class and status</Th>
            <Th numeric>Price as read</Th>
            <Th>Completion period</Th>
          </THead>
          <tbody>
            {o.rows.length === 0 && (
              <Tr>
                <Td className="text-ink-3">No offer read yet.</Td>
              </Tr>
            )}
            {o.rows.map((r) => (
              <Tr key={r.listingNo}>
                <Td label="Bil.">{r.listingNo}</Td>
                <Td label="Bidder">{r.alternative ? `${r.bidderName} (${r.alternative.toLowerCase()})` : r.bidderName}</Td>
                <Td label="Class and status">{[r.registrationClass, r.registrationStatus].filter(Boolean).join(" · ") || "—"}</Td>
                <Td numeric label="Price as read">{r.openingPrice}</Td>
                <Td label="Completion period">{r.period}</Td>
              </Tr>
            ))}
            {o.benchmark && (
              <Tr>
                <Td label="Bil.">—</Td>
                <Td label="Bidder">{o.benchmark.sealed ? "Company estimate" : o.benchmark.label}</Td>
                <Td label="Class and status">—</Td>
                <Td numeric label="Price as read">{o.benchmark.sealed ? o.benchmark.text : o.benchmark.companyEstimate}</Td>
                <Td label="Completion period">—</Td>
              </Tr>
            )}
          </tbody>
        </Table>
        {o.summary && (
          <>
            <h2 className="mt-10 mb-3 text-[17px] font-bold text-ink">Grand Summary</h2>
            <Table>
              <THead>
                <Th>Bil.</Th>
                <Th>Bidder</Th>
                <Th numeric>Price as read</Th>
                <Th>At the opening</Th>
              </THead>
              <tbody>
                {o.summary.rows.map((r) => (
                  <Tr key={r.listingNo}>
                    <Td label="Bil.">{r.listingNo}</Td>
                    <Td label="Bidder">{r.bidderName}</Td>
                    <Td numeric label="Price as read">{r.openingPrice}</Td>
                    <Td label="At the opening">{r.label}</Td>
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
