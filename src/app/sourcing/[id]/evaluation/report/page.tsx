import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PrintButton } from "@/app/awards/[id]/print/[kind]/print-button";
import { PrinterIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { db } from "@/lib/db";
import { ROUTE_LABEL, SIDE_LABEL, STAGE_KIND_LABEL, SULIT_CHIP } from "@/lib/evaluation/labels";
import { reportFromSnapshot, type ReportSnapshot } from "@/lib/evaluation/report";
import type { EvaluationRoute, Side, StageKind } from "@/lib/evaluation/types";
import { formatMoney, parseSen } from "@/lib/money";
import { exerciseOrg } from "@/lib/method/repo";

export const dynamic = "force-dynamic";

/**
 * The evaluation report in print (6.8 plan §5; FR-EVL-017): only the frozen copy issued, never
 * recomputed — the version asked for, else the latest issued. Every figure is SULIT and says so; this
 * is the paper route while an uploaded SULIT scan cannot be downloaded (E-3, E-11).
 */
export default async function EvaluationReportPrint(props: PageProps<"/sourcing/[id]/evaluation/report">) {
  const { id } = await props.params;
  const wanted = Number((await props.searchParams).version) || null;
  const org = await exerciseOrg();
  if (!org) notFound();
  const ex = await db.sourcingExercise.findFirst({ where: { id, organisationId: org.id }, select: { id: true, reference: true } });
  if (!ex) notFound();
  const back = `/sourcing/${id}?tab=evaluation&section=report`;
  const issued = await db.evaluation.findMany({ where: { exerciseId: id, issuedAt: { not: null } }, orderBy: { version: "desc" }, select: { version: true, state: true, reportSnapshot: true } });
  const row = (wanted ? issued.find((e) => e.version === wanted) : null) ?? issued[0] ?? null;
  const r = row ? reportFromSnapshot(row.reportSnapshot) : null;
  if (!row || !r) {
    return (
      <>
        <RecordCrumb label={ex.reference} />
        <PageHeader eyebrow={<Link href={back}>Back to the report</Link>} title="Nothing to print" />
        <Card>
          <EmptyState title="No report is issued" action={<ButtonLink href={back} variant="secondary" size="sm">Back to the report</ButtonLink>}>
            The evaluation report is printed once it is issued: only its frozen copy is printed.
          </EmptyState>
        </Card>
      </>
    );
  }
  return (
    <>
      <RecordCrumb label={ex.reference} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back}>Back to the report</Link>
        <PrintButton icon={<PrinterIcon size={15} />} />
      </div>
      <Callout tone={row.state === "ISSUED" ? "info" : "warn"} className="mb-5 print:hidden">
        {row.state === "ISSUED" ? `As issued ${r.issuedOn}: the copy frozen then, never recomputed.` : `Version ${r.version}'s report, as issued ${r.issuedOn}. It no longer stands: a later version superseded it, or the exercise was cancelled.`}
      </Callout>
      <ReportArticle r={r} />
    </>
  );
}

const Sulit = () => <Chip tone="err">{SULIT_CHIP}</Chip>;
const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-8 mb-3 text-[16px] font-bold text-ink">{children}</h2>;

function ReportArticle({ r }: { r: ReportSnapshot }) {
  const annex = (k: string) => r.annexes.find((a) => a.key === k);
  type StageA = { stage: string; kind: StageKind; bidders: { listingNo: number; bidder: string; figure: string | null; passed: boolean | null; band: string | null; outOfRunning: boolean; excluded: string | null; criteria: { criterion: string; marks: string | null; passed: boolean | null; carried: boolean }[] }[] }[];
  type RowB = { listingNo: number; bidder: string; asRead: string; corrected: string | null; evaluated: string; negotiated: string | null; vsEstimate: { difference: string; percent: string | null } | string; vsLowest: { difference: string; percent: string | null } | null; rank: number | null; period: string; excluded: string | null };
  const a = (annex("A")?.body ?? []) as StageA;
  const b = (annex("B")?.body ?? []) as RowB[];
  const c = annex("C")?.body as { rows?: { listingNo: number; bidderName: string; openingPrice: string }[] } | null;
  const d = annex("D")?.body as { source: string; bidders: { listingNo: number; bidder: string; cpr: string | null; band: string | null }[] } | null;
  const e = (annex("E")?.body ?? []) as { label: string; day: string | null; attendees: string[] }[];
  const f = (annex("F")?.body ?? []) as { title: string; versionNo: number }[];
  const label = (k: string) => `Annex ${k}: ${annex(k)?.label ?? ""}`;
  return (
    <article className="mx-auto max-w-[960px] overflow-hidden rounded-card border border-line bg-surface px-6 py-10 shadow-card sm:px-12 print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
      <h1 className="mb-1 text-[22px] leading-tight font-bold text-ink">Evaluation report</h1>
      <p className="mb-6 text-[13.5px] text-ink-2">{`${r.exercise.reference} · ${r.exercise.title}`}</p>
      <dl className="mb-6 grid gap-x-8 gap-y-2 text-[13.5px] sm:grid-cols-2">
        {[
          ["Reference", r.reference],
          ["Issued", `${r.issuedOn}, by ${r.issuedBy} (recorded on their behalf, not signed)`],
          ["Evaluation version", String(r.version)],
          ["Model", `${r.model.name}, version ${r.model.version} (${ROUTE_LABEL[r.model.route as EvaluationRoute] ?? r.model.route})`],
          ["Team", r.team.map((t) => `${t.name} (${SIDE_LABEL[t.side as Side] ?? ""})`).join("; ")],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-[12px] text-ink-3">{k}</dt>
            <dd className="break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mb-6 text-[13.5px] whitespace-pre-line text-ink">{r.text.body}</div>
      <H2>The recommendation</H2>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3"><Sulit /></p>
      <dl className="grid gap-x-8 gap-y-2 text-[13.5px] sm:grid-cols-2">
        {[
          ["Recommended tenderer", `No. ${r.recommendation.listingNo}, ${r.recommendation.bidder} (${r.recommendation.registrationNo})`],
          ["Price", r.recommendation.price],
          ["Completion period", r.recommendation.period],
          ["Top-ranked", r.recommendation.topRanked ? "Yes" : `No: ${r.recommendation.justification}`],
          ["Saving against the company estimate", r.saving.state === "STATED" ? `${r.saving.amount}${r.saving.percent ? ` (${r.saving.percent})` : ""}` : r.saving.state === "SEALED" ? "The estimate was sealed" : "No company estimate"],
          ["Formed", `${r.recommendation.formedOn}, by ${r.recommendation.formedBy}`],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-[12px] text-ink-3">{k}</dt>
            <dd className="break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <H2>{label("A")}</H2>
      {a.map((s) => (
        <div key={s.stage} className="mb-5">
          <p className="mb-2 text-[13.5px] font-semibold text-ink">{`${s.stage} (${STAGE_KIND_LABEL[s.kind] ?? ""})`}</p>
          <Table>
            <THead>
              <Th>Bid</Th>
              <Th>Scores</Th>
              <Th numeric>Figure</Th>
              <Th>Result</Th>
            </THead>
            <tbody>
              {s.bidders.map((x) => (
                <Tr key={x.listingNo}>
                  <Td>{`No. ${x.listingNo}, ${x.bidder}`}</Td>
                  <Td>{x.excluded ? x.excluded : x.criteria.map((cr) => `${cr.criterion}: ${cr.marks ?? (cr.passed == null ? "—" : cr.passed ? "pass" : "fail")}${cr.carried ? " (carried)" : ""}`).join("; ") || "—"}</Td>
                  <Td numeric>{x.figure ? `${x.figure}%` : "—"}</Td>
                  <Td>{[x.passed == null ? null : x.passed ? "Passes" : "Fails", x.band, x.outOfRunning ? "Out of the running" : null].filter(Boolean).join(" · ") || "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ))}

      <H2>{label("B")}</H2>
      <Table>
        <THead>
          <Th>Bid</Th>
          <Th numeric>As read</Th>
          <Th numeric>Evaluated</Th>
          <Th>Against the estimate</Th>
          <Th>Against the lowest</Th>
          <Th numeric>Rank</Th>
        </THead>
        <tbody>
          {b.map((x) => (
            <Tr key={x.listingNo}>
              <Td>{`No. ${x.listingNo}, ${x.bidder}`}</Td>
              <Td numeric>{x.asRead}</Td>
              <Td numeric>{`${x.evaluated}${x.negotiated ? `; ${x.negotiated} after negotiation` : ""}`}</Td>
              <Td>{typeof x.vsEstimate === "string" ? x.vsEstimate : `${x.vsEstimate.difference}${x.vsEstimate.percent ? ` (${x.vsEstimate.percent})` : ""}`}</Td>
              <Td>{x.vsLowest ? `${x.vsLowest.difference}${x.vsLowest.percent ? ` (${x.vsLowest.percent})` : ""}` : "—"}</Td>
              <Td numeric>{x.rank ?? (x.excluded ? "Excluded" : "—")}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <H2>{label("C")}</H2>
      {c?.rows?.length ? (
        <Table>
          <THead>
            <Th>Bil.</Th>
            <Th>Bidder</Th>
            <Th numeric>Price as read</Th>
          </THead>
          <tbody>
            {c.rows.map((x) => (
              <Tr key={x.listingNo}>
                <Td>{x.listingNo}</Td>
                <Td>{x.bidderName}</Td>
                <Td numeric>{formatMoney(parseSen(x.openingPrice))}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="text-[13px] text-ink-3">As frozen at the opening.</p>
      )}

      <H2>{label("D")}</H2>
      {d?.bidders.length ? (
        <>
          <p className="mb-2 text-[12.5px] text-ink-3">{d.source}</p>
          <Table>
            <THead>
              <Th>Bid</Th>
              <Th numeric>Performance</Th>
              <Th>Band</Th>
            </THead>
            <tbody>
              {d.bidders.map((x) => (
                <Tr key={x.listingNo}>
                  <Td>{`No. ${x.listingNo}, ${x.bidder}`}</Td>
                  <Td numeric>{x.cpr ? `${x.cpr}%` : "—"}</Td>
                  <Td>{x.band ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      ) : (
        <p className="text-[13px] text-ink-3">None recorded.</p>
      )}

      <H2>{label("E")}</H2>
      {e.length ? e.map((x) => <p key={x.label} className="mb-2 text-[13.5px]">{`${x.label}${x.day ? `, ${x.day}` : ""}: ${x.attendees.join("; ") || "nobody recorded"}`}</p>) : <p className="text-[13px] text-ink-3">No site visit.</p>}

      <H2>{label("F")}</H2>
      {f.length ? <ul className="list-disc pl-5 text-[13.5px]">{f.map((x) => <li key={`${x.title}-${x.versionNo}`}>{`${x.title}, version ${x.versionNo}`}</li>)}</ul> : <p className="text-[13px] text-ink-3">No drawing attached. Drawings are SULIT and not downloadable until sign-in.</p>}
    </article>
  );
}
