import type { ReactNode } from "react";

/**
 * The tender documents on a page, in print order (ADR 0008): the one rendering the officers' print view and the supplier portal's inspection of the Tender Table Document share, so a part reads the same on
 * both sides. It takes the print view's own shape (`printView`), so it holds no rule: what is shown, and when, is decided by the caller. A draft carries its watermark on every page; the supplier portal never
 * passes one (it shows only the approved, frozen version).
 */

export interface TenderPart {
  printedNumber: number | string;
  label: string;
  omitted: string | null;
  texts: { language: string; paragraphs: string[]; fidelity: string }[];
  files: { title: string; versionNo: number }[];
  stampNote: string | null;
}

export interface TenderDocumentView {
  exercise: { reference: string; title: string };
  title: string;
  version: number;
  document: string;
  form: string;
  watermark: string | null;
  stamp: string | null;
  approvedLine?: string | null;
  parts: TenderPart[];
}

export function TenderDocumentArticle({ v, table, notes, footer }: { v: TenderDocumentView; table: boolean; notes?: ReactNode; footer?: string }) {
  return (
    <article className="relative mx-auto max-w-[800px] overflow-hidden rounded-card border border-line bg-surface px-6 py-10 shadow-card sm:px-14 print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
      {v.watermark && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden select-none [container-type:size] print:fixed">
          <span className="-rotate-30 text-center text-[5.4cqw] leading-none font-bold tracking-wider whitespace-nowrap text-ink/[0.09]">{v.watermark}</span>
        </div>
      )}
      <h1 className={`${table ? "mb-2" : "mb-6"} text-[22px] leading-tight font-bold text-ink`}>{table ? `Tender Table Document: ${v.exercise.title}` : v.title}</h1>
      {notes}
      <header className="mb-8 flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line pb-3 text-[11.5px] text-ink-3">
        <span>{v.exercise.reference}</span>
        <span>{v.document}</span>
        <span>{v.form}</span>
        <span>Version {v.version}</span>
        {v.watermark && <span>{v.watermark}</span>}
        {v.approvedLine && <span className="basis-full">{v.approvedLine}</span>}
      </header>
      {v.stamp && <p className="mb-8 border-2 border-ink px-4 py-2 text-center text-[15px] font-bold tracking-wide break-words text-ink">{v.stamp}</p>}
      {v.parts.length === 0 && <p className="text-[13.5px] text-ink-3">{table ? "No part of this version is in the Tender Table Document." : "This version has no parts."}</p>}
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
                    File bound in: {f.title}, version {f.versionNo}.
                  </li>
                ))}
              </ul>
            )}
            {p.stampNote && <p className="mt-1 text-[13px] font-semibold text-ink-2">{p.stampNote}.</p>}
            {p.texts.length === 0 && p.files.length === 0 && !p.omitted && <p className="text-[13.5px] text-ink-3">Nothing to print yet for this part.</p>}
          </section>
        ))}
      </div>
      <footer className="mt-10 border-t border-line pt-3 text-[11.5px] text-ink-3">{footer ?? (v.watermark ? `${v.watermark}. Not a controlled copy.` : "Printed from the text frozen at submission. Files are bound in separately; layout and paging are not reproduced.")}</footer>
    </article>
  );
}
