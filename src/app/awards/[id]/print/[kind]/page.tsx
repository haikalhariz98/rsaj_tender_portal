import Link from "next/link";
import { notFound } from "next/navigation";

import { PrinterIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Callout } from "@/components/ui/feedback";
import { evaluateAward } from "@/lib/award/evaluate";
import { DOCUMENT_LABEL, kindOfSlug, LANGUAGE_LABEL } from "@/lib/award/labels";
import { awardFacts, loadAward } from "@/lib/award/repo";
import { formatDate, formatOrgDay } from "@/lib/format";

import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * A document of an award, printable (ADR 0008). Once issued, only the text frozen at
 * issue is rendered — never today's template — with its reference, version, form code
 * and revision, the moment it was frozen, and a statement of its fidelity. Before issue
 * the text is rendered live and marked as a draft on every page.
 */
export default async function PrintPage(props: PageProps<"/awards/[id]/print/[kind]">) {
  const { id, kind: slug } = await props.params;
  const kind = kindOfSlug(slug);
  const l = await loadAward(id);
  if (!l || !kind) notFound();
  const { award, org } = l;
  const frozen = award.documents.find((d) => d.kind === kind) ?? null;
  let paragraphs: string[];
  let meta: string[];
  if (frozen) {
    paragraphs = frozen.renderedText.split("\n\n");
    meta = [
      award.reference,
      `${frozen.templateName}${frozen.templateFormCode ? ` · form ${frozen.templateFormCode}` : ""}${frozen.templateRevisionDate ? `, revised ${formatDate(frozen.templateRevisionDate)}` : ""}`,
      `Text version ${frozen.templateBodyVersion} · ${LANGUAGE_LABEL[frozen.language]} · issue version ${frozen.version}`,
      `Frozen ${formatOrgDay(frozen.frozenAt, org.timeZone)}`,
    ];
  } else {
    if (award.documents.length > 0) notFound();
    const f = await awardFacts(l);
    const d = evaluateAward(f.facts).documents.find((x) => x.kind === kind);
    if (!d || d.state !== "OK" || !d.rendered) notFound();
    paragraphs = d.rendered.paragraphs;
    meta = [award.reference, `${d.template!.nameEn}${d.template!.formCode ? ` · form ${d.template!.formCode}` : ""}`, `Text version ${d.template!.bodyVersion} · ${LANGUAGE_LABEL[d.language!]}`, "Not issued"];
  }
  return (
    <>
      <RecordCrumb label={`${award.reference} · ${DOCUMENT_LABEL[kind]}`} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/awards/${award.id}?tab=instrument`}>Back to the award</Link>
        <PrintButton icon={<PrinterIcon size={15} />} />
      </div>
      {frozen ? (
        <Callout tone="info" className="mb-5 print:hidden">
          As issued: the text frozen when the instrument was issued. It is the portal&apos;s text of the instrument, not the controlled printed form.
        </Callout>
      ) : (
        <Callout tone="warn" className="mb-5 print:hidden">
          A draft: how the document reads with today&apos;s template and today&apos;s record. The issued text is frozen when the instrument is issued.
        </Callout>
      )}
      <article className="relative mx-auto max-w-[800px] overflow-hidden rounded-card border border-line bg-surface px-6 py-10 shadow-card sm:px-14 print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
        {!frozen && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden select-none print:fixed">
            <span className="-rotate-30 text-[64px] font-bold tracking-widest whitespace-nowrap text-ink/[0.07] sm:text-[96px]">Draft — not issued</span>
          </div>
        )}
        <header className="mb-8 flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line pb-3 text-[11.5px] text-ink-3">
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </header>
        <div className="relative flex flex-col gap-4 text-[14.5px] leading-relaxed break-words whitespace-pre-line text-ink">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <footer className="mt-10 border-t border-line pt-3 text-[11.5px] text-ink-3">
          {frozen
            ? "Printed from the text frozen at issue. The portal's text of the issued instrument, not the controlled printed form: layout, paging and form conventions are not reproduced. Signed on paper; the return is recorded in the portal."
            : "Draft — not issued. Not a controlled copy."}
        </footer>
      </article>
    </>
  );
}
