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
import { db } from "@/lib/db";
import { storedDay } from "@/lib/dates";
import { SULIT_CHIP } from "@/lib/evaluation/labels";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";

export const dynamic = "force-dynamic";

/**
 * The Kertas Cadangan in print (6.8 plan §5; FR-CTE-013): only its frozen text, never re-rendered,
 * with its checking and recommending officers as recorded (on their behalf, not signed).
 */
export default async function ProposalPrint(props: PageProps<"/sourcing/[id]/evaluation/proposal">) {
  const { id } = await props.params;
  const org = await exerciseOrg();
  if (!org) notFound();
  const ex = await db.sourcingExercise.findFirst({ where: { id, organisationId: org.id }, select: { id: true, reference: true } });
  if (!ex) notFound();
  const back = `/sourcing/${id}?tab=evaluation&section=report`;
  const p = await db.proposalPaper.findFirst({ where: { evaluation: { exerciseId: id } }, orderBy: { frozenAt: "desc" }, include: { checkedBy: { select: { name: true } }, recommendedBy: { select: { name: true } }, evaluation: { select: { version: true, state: true, reportReference: true } } } });
  if (!p) {
    return (
      <>
        <RecordCrumb label={ex.reference} />
        <PageHeader eyebrow={<Link href={back}>Back to the report</Link>} title="Nothing to print" />
        <Card>
          <EmptyState title="No Kertas Cadangan is produced" action={<ButtonLink href={back} variant="secondary" size="sm">Back to the report</ButtonLink>}>
            It is printed once produced from the issued report: only its frozen text.
          </EmptyState>
        </Card>
      </>
    );
  }
  const roles = await db.authorityRole.findMany({ where: { organisationId: org.id, code: { in: [p.checkerRoleCode, p.recommenderRoleCode] } }, select: { code: true, nameEn: true } });
  const office = (code: string) => roles.find((r) => r.code === code)?.nameEn ?? "An office no longer configured";
  return (
    <>
      <RecordCrumb label={ex.reference} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back}>Back to the report</Link>
        <PrintButton icon={<PrinterIcon size={15} />} />
      </div>
      <Callout tone={p.evaluation.state === "ISSUED" ? "info" : "warn"} className="mb-5 print:hidden">
        {p.evaluation.state === "ISSUED" ? `Frozen ${formatOrgDateTime(p.frozenAt, org.timeZone)} from report ${p.evaluation.reportReference}.` : `Produced from version ${p.evaluation.version}'s report, which no longer stands.`}
      </Callout>
      <article className="mx-auto max-w-[900px] rounded-card border border-line bg-surface px-6 py-10 shadow-card sm:px-12 print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
        <p className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-3"><Chip tone="err">{SULIT_CHIP}</Chip></p>
        <div className="text-[13.5px] whitespace-pre-line text-ink">{p.renderedText}</div>
        <dl className="mt-10 grid gap-x-8 gap-y-4 text-[13.5px] sm:grid-cols-2">
          <div className="flex flex-col">
            <dt className="text-[12px] text-ink-3">{`Checked by (${office(p.checkerRoleCode)})`}</dt>
            <dd className="text-ink">{p.checkedBy ? `${p.checkedBy.name}, ${p.checkedOn ? formatDate(storedDay(p.checkedOn)) : ""}` : "Not recorded"}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-[12px] text-ink-3">{`Recommended by (${office(p.recommenderRoleCode)})`}</dt>
            <dd className="text-ink">{p.recommendedBy ? `${p.recommendedBy.name}, ${p.recommendedOn ? formatDate(storedDay(p.recommendedOn)) : ""}` : "Not recorded"}</dd>
          </div>
        </dl>
      </article>
    </>
  );
}
