"use client";

import Link from "next/link";

import { DataList, type Row } from "@/components/data-list";
import { OwnerDocumentsButton } from "@/components/attachments/owner-documents-button";
import { buttonClass } from "@/components/ui/button";

import { MarkReadyDrawer, OmitPartDrawer, PickTemplateDrawer, ReopenPartDrawer } from "./editors";

/// A part as the read model gives it (src/lib/tender-docs/read.ts), trimmed to what the list shows.
export interface PartRow {
  id: string;
  printedNumber: string;
  label: string;
  role: string;
  content: string;
  source: string;
  /// Where the tender is restricted and the part is an uploaded file: the portal does not stamp it.
  uploadNote: string | null;
  preparedBy: string;
  mandatory: string;
  inTableDocument: string;
  state: string;
  stateTone: "ok" | "warn" | undefined;
  omittedBecause: string | null;
  template: string | null;
  isUpload: boolean;
  files: { title: string; versionNo: number; live: boolean; fingerprint?: string }[];
  hasFrozenText: boolean;
  markReady: { allowed: true } | { allowed: false; reason: string };
  omit: { allowed: true } | { allowed: false; reason: string };
  reopen: { allowed: true } | { allowed: false; reason: string };
  pickTemplate: { allowed: true; options: { value: string; label: string }[] } | { allowed: false; reason: string };
  templateId: string;
}

/**
 * The parts of the pack in print order, on the shared DataList. A row's acts open drawers;
 * where one cannot proceed its reason is stated under the row. The list is a client
 * component because its row actions are functions of the row.
 */
export function PartsList({ exerciseId, parts, printHref }: { exerciseId: string; parts: PartRow[]; printHref: string }) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const rows: Row[] = parts.map((p) => {
    const tableText = p.inTableDocument === "Yes" ? "In the Tender Table Document" : p.inTableDocument === "No" ? "Not in the Tender Table Document" : "Tender Table Document: not set";
    const sub = [p.role, tableText, p.preparedBy === "Not set" ? null : `Prepared by ${p.preparedBy}`, p.template ? (p.template === "Not set" ? "No template chosen" : `Template: ${p.template}`) : null, p.omittedBecause ? `Omitted: ${p.omittedBecause}` : null].filter(Boolean).join(" · ");
    const liveFiles = p.files.filter((f) => f.live);
    const note = [p.state === "Not ready" && !p.markReady.allowed ? p.markReady.reason : null, p.uploadNote ? `${p.uploadNote}.` : null].filter(Boolean).join(" ") || undefined;
    return {
      id: p.id,
      search: `${p.printedNumber} ${p.label}`,
      note,
      cells: {
        part: { kind: "stack", title: `${p.printedNumber}. ${p.label}`, sub },
        what: {
          kind: "stack",
          title: `${p.mandatory === "Yes" ? "Mandatory" : p.mandatory === "No" ? "Optional" : "Mandatory: not set"} · ${p.content}`,
          sub: `${p.source}${p.isUpload ? ` · ${liveFiles.length === 0 ? (p.mandatory === "Yes" ? "Required: no file attached" : "No file attached") : `${liveFiles.length} file${liveFiles.length === 1 ? "" : "s"}`}` : ""}`,
        },
        state: { kind: "badge", text: p.state, tone: p.stateTone },
      },
    };
  });
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      exportName="tender-document-parts"
      emptyTitle="No parts"
      actionsWidth={270}
      stackBelow="xl"
      columns={[
        { key: "part", label: "Part", mobile: "primary" },
        { key: "what", label: "Content and source", width: "230px", mobile: "meta" },
        { key: "state", label: "State", width: "110px", mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const p = byId.get(id)!;
        const edits = p.pickTemplate.allowed || p.markReady.allowed || p.omit.allowed || p.reopen.allowed;
        return (
          <span className="flex flex-wrap items-center justify-end gap-1">
            {p.pickTemplate.allowed && <PickTemplateDrawer exerciseId={exerciseId} partId={p.id} partLabel={`${p.printedNumber}. ${p.label}`} options={p.pickTemplate.options} current={p.templateId} />}
            {p.isUpload && <OwnerDocumentsButton owner={{ kind: "tenderPackPart", id: p.id }} label={`${p.printedNumber}. ${p.label}`} title="Files for this part" subtitle="Kept in the document store. A part's files freeze with its version." options={{ only: ["TENDER_PART"] }} />}
            {p.state === "Not ready" && <MarkReadyDrawer exerciseId={exerciseId} partId={p.id} partLabel={`${p.printedNumber}. ${p.label}`} allowed={p.markReady} />}
            {p.state === "Not ready" && <OmitPartDrawer exerciseId={exerciseId} partId={p.id} partLabel={`${p.printedNumber}. ${p.label}`} allowed={p.omit} />}
            {p.state !== "Not ready" && p.reopen.allowed && <ReopenPartDrawer exerciseId={exerciseId} partId={p.id} partLabel={`${p.printedNumber}. ${p.label}`} state={p.state} />}
            {p.hasFrozenText && !edits && !p.isUpload && (
              <Link href={`${printHref}#part-${p.printedNumber}`} className={buttonClass("ghost", "sm")} aria-label={`View ${p.printedNumber}. ${p.label} as frozen`}>
                View as frozen
              </Link>
            )}
          </span>
        );
      }}
    />
  );
}
