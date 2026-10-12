import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/app/awards/[id]/print/[kind]/print-button";
import { PrinterIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Callout } from "@/components/ui/feedback";
import { loadExercise } from "@/lib/method/repo";
import { saleRegister } from "@/lib/window/read";
import { requireStaff } from "@/app/_auth/actor";
import { exerciseIsHidden } from "@/app/_auth/sulit";

export const dynamic = "force-dynamic";

/**
 * The label that goes on a set of the documents (FR-ADV-011): the purchaser's particulars, the
 * closing as stated and the officer who issued it, from the annotation frozen with the sale. It
 * reads "recorded on behalf of the officer, not signed": nobody is signed in.
 */
export default async function SaleLabelPage(props: PageProps<"/sourcing/[id]/label/[saleId]">) {
  const actor = await requireStaff();
  const { id, saleId } = await props.params;
  // FR-MTD-007: an exercise restricted to its named people reads as one that does not exist to anyone else, and the attempt is logged.
  if (await exerciseIsHidden(actor, id)) notFound();
  const [l, register] = await Promise.all([loadExercise(actor.organisationId, id), saleRegister(actor.organisationId, id)]);
  const sale = register?.rows.find((r) => r.id === saleId);
  if (!l || !sale) notFound();
  const back = `/sourcing/${id}?tab=bids&section=sales`;
  return (
    <>
      <RecordCrumb label={l.ex.reference} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back}>Back to the sale register</Link>
        <PrintButton icon={<PrinterIcon size={15} />} />
      </div>
      {sale.voided && (
        <Callout tone="warn" className="mb-5 print:hidden" title="This sale is void">
          {sale.voided} The label is not to be used.
        </Callout>
      )}
      <article className="mx-auto max-w-[640px] rounded-card border-2 border-ink bg-surface px-8 py-8 shadow-card print:max-w-none print:rounded-none print:shadow-none">
        <h1 className="mb-4 border-b border-line pb-3 text-[20px] font-bold text-ink">{l.ex.title}</h1>
        <dl className="flex flex-col gap-2 text-[15px] text-ink">
          {sale.label.map((line) => {
            const at = line.indexOf(": ");
            return (
              <div key={line} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="font-semibold sm:w-32 sm:shrink-0">{line.slice(0, at)}</dt>
                <dd className="min-w-0 break-words">{line.slice(at + 2)}</dd>
              </div>
            );
          })}
        </dl>
      </article>
    </>
  );
}
