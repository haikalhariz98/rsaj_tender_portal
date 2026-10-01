import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/app/awards/[id]/print/[kind]/print-button";
import { PrinterIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Callout } from "@/components/ui/feedback";
import { printView } from "@/lib/tender-docs/read";

export const dynamic = "force-dynamic";

/**
 * The tender documents in print order (ADR 0008). Once submitted, only the frozen text is
 * rendered, never today's templates, with its source and when it was frozen. A draft renders
 * live and is marked on every page. The bill of quantities is issued unpriced.
 */
export default async function PackPrintPage(props: PageProps<"/sourcing/[id]/documents/print">) {
  const { id } = await props.params;
  const v = await printView(id);
  if (!v) notFound();
  const draft = v.watermark != null;
  const frozen = !draft || v.watermark === "With approval, not issued";
  return (
    <>
      <RecordCrumb label={v.exercise.reference} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/sourcing/${id}?tab=documents`}>Back to the tender documents</Link>
        <PrintButton icon={<PrinterIcon size={15} />} />
      </div>
      {v.watermark ? (
        <Callout tone="warn" className="mb-5 print:hidden">
          {frozen ? "With approval: the text frozen when the version was submitted. It is not issued until approved for tendering." : "A draft: how the documents read with today's templates, bill and Appendix. The text is frozen when the version is submitted."}
        </Callout>
      ) : (
        <Callout tone="info" className="mb-5 print:hidden">
          As approved: the text frozen when the version was submitted. It is the portal&apos;s text of the documents, not the controlled printed forms.
        </Callout>
      )}
      <article className="relative mx-auto max-w-[800px] overflow-hidden rounded-card border border-line bg-surface px-6 py-10 shadow-card sm:px-14 print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
        {v.watermark && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden select-none [container-type:size] print:fixed">
            <span className="-rotate-30 text-center text-[7cqw] leading-none font-bold tracking-wider whitespace-nowrap text-ink/[0.09]">{v.watermark}</span>
          </div>
        )}
        <header className="mb-8 flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line pb-3 text-[11.5px] text-ink-3">
          <span>{v.exercise.reference}</span>
          <span>{v.form}</span>
          <span>Version {v.version}</span>
          {v.watermark && <span>{v.watermark}</span>}
        </header>
        <div className="relative flex flex-col gap-10">
          {v.parts.map((p) => (
            <section key={p.printedNumber} id={`part-${p.printedNumber}`} className="scroll-mt-24 break-inside-avoid-page">
              <h2 className="mb-3 text-[17px] font-bold text-ink">
                {p.printedNumber}. {p.label}
              </h2>
              {p.omitted && <p className="text-[13.5px] text-ink-3">{p.omitted}</p>}
              {p.texts.map((t) => (
                <div key={t.language} className="mb-4 flex flex-col gap-3 text-[14.5px] leading-relaxed break-words whitespace-pre-line text-ink">
                  {p.texts.length > 1 && <p className="text-[12px] font-semibold text-ink-3">{t.language}</p>}
                  {t.paragraphs.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                  <p className="text-[11.5px] text-ink-3">{t.fidelity}</p>
                </div>
              ))}
              {p.files.length > 0 && (
                <ul className="text-[13px] text-ink-2">
                  {p.files.map((f) => (
                    <li key={f.title}>
                      File bound in: {f.title}, version {f.versionNo}. Fingerprint {f.fingerprint.slice(0, 12)}.
                    </li>
                  ))}
                </ul>
              )}
              {p.texts.length === 0 && p.files.length === 0 && !p.omitted && <p className="text-[13.5px] text-ink-3">Nothing to print yet for this part.</p>}
            </section>
          ))}
        </div>
        <footer className="mt-10 border-t border-line pt-3 text-[11.5px] text-ink-3">{v.watermark ? `${v.watermark}. Not a controlled copy.` : "Printed from the text frozen at submission. Files are bound in separately; layout and paging are not reproduced."}</footer>
      </article>
    </>
  );
}
