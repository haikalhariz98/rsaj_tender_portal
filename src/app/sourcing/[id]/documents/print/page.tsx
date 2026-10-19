import { MoreText } from "@/components/ui/more-text";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/app/awards/[id]/print/[kind]/print-button";
import { PrinterIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { TenderDocumentArticle } from "@/components/tender-document";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Callout, EmptyState, Note } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { printView } from "@/lib/tender-docs/read";
import { tableDocumentNote } from "@/lib/window/read";
import { requireStaff } from "@/app/_auth/actor";
import { exerciseIsHidden } from "@/app/_auth/sulit";

export const dynamic = "force-dynamic";

/**
 * The tender documents in print order (ADR 0008). Once submitted, only the frozen text is
 * rendered, never today's templates, with its source and when it was frozen. A draft renders
 * live and is marked on every page. The bill of quantities is issued unpriced.
 */
export default async function PackPrintPage(props: PageProps<"/sourcing/[id]/documents/print">) {
  const actor = await requireStaff();
  const { id } = await props.params;
  // FR-MTD-007: an exercise restricted to its named people reads as one that does not exist to anyone else, and the attempt is logged.
  if (await exerciseIsHidden(actor, id)) notFound();
  // FR-DOC-010 (the part built here): the same pack, only the parts in the Tender Table Document.
  const table = (await props.searchParams).set === "table";
  const [v, tableNote] = await Promise.all([printView(actor.organisationId, id, table ? "table" : "pack"), table ? tableDocumentNote(actor.organisationId, id) : null]);
  if (!v) notFound();
  // FR-DOC-010: the Tender Table Document is printed only while it is available for inspection.
  if (table && tableNote?.refusal) {
    return (
      <>
        <RecordCrumb label={v.exercise.reference} />
        <PageHeader eyebrow={<Link href={`/sourcing/${id}?tab=documents`}>Back to the tender documents</Link>} title="The Tender Table Document is not available" meta={[<span key="ref" className="font-mono text-[12.5px]">{v.exercise.reference}</span>, v.exercise.title]} />
        <Card>
          <EmptyState
            title={tableNote.text}
            action={
              <span className="flex flex-wrap justify-center gap-2">
                <ButtonLink href={`/sourcing/${id}?tab=documents`} variant="secondary" size="sm">Back to the tender documents</ButtonLink>
                <ButtonLink href={`/sourcing/${id}/documents/print`} variant="ghost" size="sm">Print the whole pack</ButtonLink>
              </span>
            }
          />
          <CardBody><MoreText text={tableNote.refusal} label="Why" /></CardBody>
        </Card>
      </>
    );
  }
  if ("none" in v) {
    return (
      <>
        <RecordCrumb label={v.exercise.reference} />
        <PageHeader eyebrow={<Link href={`/sourcing/${id}?tab=documents`}>Back to the tender documents</Link>} title="Nothing to print" meta={[<span key="ref" className="font-mono text-[12.5px]">{v.exercise.reference}</span>, v.exercise.title]} />
        <Card>
          <EmptyState title="No tender documents to print" action={<ButtonLink href={`/sourcing/${id}?tab=documents`} variant="secondary" size="sm">Back to the tender documents</ButtonLink>} />
          <CardBody>{v.why ? <MoreText text={v.why} label="Why" /> : null}</CardBody>
        </Card>
      </>
    );
  }
  const draft = v.watermark != null;
  const frozen = !draft || v.watermark === "With approval, not issued";
  return (
    <>
      <RecordCrumb label={v.exercise.reference} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/sourcing/${id}?tab=documents`}>Back to the tender documents</Link>
        <span className="flex flex-wrap items-center gap-3">
          <Link href={table ? `/sourcing/${id}/documents/print` : `/sourcing/${id}/documents/print?set=table`}>{table ? "The whole pack" : "The Tender Table Document"}</Link>
          <PrintButton icon={<PrinterIcon size={15} />} />
        </span>
      </div>
      {v.watermark ? (
        <Callout tone="warn" className="mb-5 print:hidden">
          {frozen ? "Frozen at submission. Not issued until approved." : "A draft, read with today's templates. Frozen on submission."}
        </Callout>
      ) : (
        <Note className="mb-5 print:hidden">
          As approved: the text frozen when the version was submitted. It is the portal&apos;s text of the documents, not the controlled printed forms.
        </Note>
      )}
      <TenderDocumentArticle
        v={v}
        table={table}
        notes={
          table && (
            <div className="mb-6 flex flex-col gap-1 text-[13.5px] text-ink-2">
              <p>Only the parts of this pack flagged for the Tender Table Document, in print order. The whole pack is the other link above.</p>
              {tableNote && <p className="font-semibold">{tableNote.text}.</p>}
              {tableNote?.sinceApproved.map((l) => <p key={l}>{l}</p>)}
            </div>
          )
        }
      />
    </>
  );
}
