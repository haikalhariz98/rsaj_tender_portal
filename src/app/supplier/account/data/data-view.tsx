import type { ReactNode } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import type { Words } from "@/lib/contract/labels";
import { SUPPLIER_REGISTRATION_GETS } from "@/lib/auth/routes";
import type { ExportRow, SupplierExport } from "@/lib/suppliers/data-export";
import { EXPORT_PAGE_WORDS } from "@/lib/suppliers/data-export-words";

const isWords = (v: string | Words): v is Words => typeof v === "object";

/// A row's value: words in both languages, or text as it is, or the plain "nothing on record".
function Value({ row }: { row: ExportRow }): ReactNode {
  if (row.value === null) return <>{EXPORT_PAGE_WORDS.nothing}</>;
  return isWords(row.value) ? <>{row.value.en}</> : <span className="whitespace-pre-line">{row.value}</span>;
}

/// One record: its facts, its files (each a link made with the page's own token, never one saved in a file), and what belongs to it.
function RowView({ row, fileToken, liveLinks }: { row: ExportRow; fileToken: string | null; liveLinks: ReadonlyMap<string, true> }) {
  const files = row.files ?? [];
  return (
    <div className="flex flex-col gap-3">
      <KeyValues
        items={[
          {
            label: row.label.en,
            value: (
              <span className="flex flex-col gap-1">
                <Value row={row} />
                {files.map((f) => (
                  <span key={f.versionId} className="text-[13px] text-ink-2">
                    {fileToken && liveLinks.has(f.versionId) ? (
                      <a className="break-all font-medium text-brand-700 hover:underline print:text-ink" href={`${SUPPLIER_REGISTRATION_GETS.file}?id=${encodeURIComponent(f.versionId)}&t=${encodeURIComponent(fileToken)}`}>
                        {f.name}
                      </a>
                    ) : (
                      <span className="break-all font-medium">{f.name}</span>
                    )}
                    {` · ${f.type} · ${f.size} · ${f.lodgedOn}`}
                  </span>
                ))}
              </span>
            ),
          },
        ]}
      />
      {row.rows && row.rows.length > 0 && (
        <div className="ml-3 flex flex-col gap-3 border-l border-line pl-4">
          {row.rows.map((r, i) => (
            <RowView key={i} row={r} fileToken={fileToken} liveLinks={liveLinks} />
          ))}
        </div>
      )}
    </div>
  );
}

/// The export as a screen: one card per section, then what the record leaves out. Shown on the printable page.
export function DataExportView({ data, fileToken, liveLinks }: { data: SupplierExport; fileToken: string | null; liveLinks: ReadonlyMap<string, true> }) {
  return (
    <div className="flex flex-col gap-5">
      {data.sections.map((s) => (
        <Card key={s.key} className="break-inside-avoid-page print:shadow-none">
          <CardHeader title={s.title.en} />
          <CardBody>
            {s.rows.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">{EXPORT_PAGE_WORDS.nothing}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {s.rows.map((r, i) => (
                  <RowView key={i} row={r} fileToken={fileToken} liveLinks={liveLinks} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ))}
      <Callout tone="info" title={EXPORT_PAGE_WORDS.leftOutTitle}>
        <div className="flex flex-col gap-2">
          {data.leftOut.map((x, i) => (
            <p key={i}>{x.en}</p>
          ))}
        </div>
      </Callout>
    </div>
  );
}
