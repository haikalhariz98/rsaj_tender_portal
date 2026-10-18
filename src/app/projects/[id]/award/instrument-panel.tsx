import { FileIcon, PrinterIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { type AwardEvaluation } from "@/lib/award/evaluate";
import { DOCUMENT_LABEL, DOCUMENT_SLUG, INSTRUMENT_LABEL, LANGUAGE_LABEL } from "@/lib/award/labels";
import { mergeFieldLabel } from "@/lib/award/fields";
import { type LoadedAward } from "@/lib/award/repo";
import type { InstrumentKind } from "@/lib/award/types";
import { formatDate, formatOrgDay } from "@/lib/format";


export function InstrumentPanel({ l, ev }: { l: LoadedAward; ev: AwardEvaluation }) {
  const { award } = l;
  const issued = award.documents.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <Callout tone="info" title={issued ? "As issued" : "Generated when issued"}>
        {issued
          ? "Each document is printed from the text frozen when it was issued, never from today's template. It is the portal's text of the instrument, not the controlled printed form: print it, have it signed on paper, and record what comes back."
          : "The documents are generated from the configured templates and frozen when the instrument is issued. Until then a preview shows how they read today, marked as a draft."}
      </Callout>
      <Card className="overflow-hidden">
        <CardHeader icon={<FileIcon size={17} />} title="Documents" subtitle={INSTRUMENT_LABEL[award.instrumentKind as InstrumentKind]} />
        <ul className="divide-y divide-line/70">
          {issued
            ? award.documents.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <div className="font-semibold break-words text-ink">{DOCUMENT_LABEL[d.kind]}</div>
                    <div className="text-[12.5px] break-words text-ink-3">{`${d.templateName}${d.templateFormCode ? ` · form ${d.templateFormCode}` : ""}${d.templateRevisionDate ? `, revised ${formatDate(d.templateRevisionDate)}` : ""} · text version ${d.templateBodyVersion} · ${LANGUAGE_LABEL[d.language]} · frozen ${formatOrgDay(d.frozenAt, l.org.timeZone)}`}</div>
                  </div>
                  <ButtonLink href={`/awards/${award.id}/print/${DOCUMENT_SLUG[d.kind]}`} variant="secondary" size="sm" icon={<PrinterIcon size={15} />}>
                    Print
                  </ButtonLink>
                </li>
              ))
            : ev.documents.map((d) => (
                <li key={d.kind} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <div className="font-semibold break-words text-ink">{DOCUMENT_LABEL[d.kind]}</div>
                    <div className="text-[12.5px] break-words text-ink-3">
                      {d.state === "TEMPLATE_NOT_SET"
                        ? "No template is set for it."
                        : d.state === "NO_TEXT"
                          ? `“${d.templateName}” has no text configured.`
                          : d.state === "NO_LANGUAGE"
                            ? `“${d.templateName}” has text in both languages and no language set to issue first.`
                            : `${d.templateName} · ${LANGUAGE_LABEL[d.language!]}${d.missing.length ? ` · not yet recorded: ${d.missing.map((k) => mergeFieldLabel(k).toLowerCase()).join(", ")}` : " · every field it names is filled"}`}
                    </div>
                  </div>
                  {d.state === "OK" && (
                    <ButtonLink href={`/awards/${award.id}/print/${DOCUMENT_SLUG[d.kind]}`} variant="secondary" size="sm" icon={<PrinterIcon size={15} />}>
                      Preview
                    </ButtonLink>
                  )}
                </li>
              ))}
        </ul>
      </Card>
    </div>
  );
}
