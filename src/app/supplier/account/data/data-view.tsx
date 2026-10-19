import type { ReactNode } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { SUPPLIER_REGISTRATION_GETS } from "@/lib/auth/routes";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { formatBytes } from "@/lib/documents/labels";
import type { ExportRow, SupplierExport } from "@/lib/suppliers/data-export";
import { EXPORT_PAGE_WORDS } from "@/lib/suppliers/data-export-words";

/// A row's value: a day, a moment (in the organisation's zone), or text as it is; or the plain "nothing on record".
function Value({ row, timeZone }: { row: ExportRow; timeZone: string | null }): ReactNode {
  if (row.value === null) return <>{EXPORT_PAGE_WORDS.nothing}</>;
  if (row.kind === "day") return <>{formatDate(row.value)}</>;
  if (row.kind === "instant") return <>{formatOrgDateTime(new Date(row.value), timeZone)}</>;
  return <span className="whitespace-pre-line">{row.value}</span>;
}

/// One record: its facts, its files (each a link made with the page's own token, never one saved in a file), and what belongs to it.
function RowView({ row, fileToken, liveLinks, timeZone }: { row: ExportRow; fileToken: string | null; liveLinks: ReadonlyMap<string, true>; timeZone: string | null }) {
  const files = row.files ?? [];
  return (
    <div className="flex flex-col gap-3">
      <KeyValues
        items={[
          {
            label: row.label,
            value: (
              <span className="flex flex-col gap-1">
                <Value row={row} timeZone={timeZone} />
                {files.map((f) => (
                  <span key={f.versionId} className="text-[13px] text-ink-2">
                    {fileToken && liveLinks.has(f.versionId) ? (
                      <a className="break-all font-medium text-brand-700 hover:underline print:text-ink" href={`${SUPPLIER_REGISTRATION_GETS.file}?id=${encodeURIComponent(f.versionId)}&t=${encodeURIComponent(fileToken)}`}>
                        {f.name}
                      </a>
                    ) : (
                      <span className="break-all font-medium">{f.name}</span>
                    )}
                    {` · ${f.type} · ${f.size ? formatBytes(f.size) : ""} · ${f.lodgedOn ? formatOrgDateTime(new Date(f.lodgedOn), timeZone) : ""}`}
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
            <RowView key={i} row={r} fileToken={fileToken} liveLinks={liveLinks} timeZone={timeZone} />
          ))}
        </div>
      )}
    </div>
  );
}

/// The export as a screen: one card per section, then what the record leaves out. Shown on the printable page.
export function DataExportView({ data, fileToken, liveLinks, timeZone }: { data: SupplierExport; fileToken: string | null; liveLinks: ReadonlyMap<string, true>; timeZone: string | null }) {
  return (
    <div className="flex flex-col gap-5">
      {data.sections.map((s) => (
        <Card key={s.key} className="break-inside-avoid-page print:shadow-none">
          <CardHeader title={s.title} />
          <CardBody>
            {s.rows.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">{EXPORT_PAGE_WORDS.nothing}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {s.rows.map((r, i) => (
                  <RowView key={i} row={r} fileToken={fileToken} liveLinks={liveLinks} timeZone={timeZone} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ))}
      <Callout tone="info">
        {data.leftOut.map((x, i) => (
          <span key={i}>{x}</span>
        ))}
      </Callout>
    </div>
  );
}
