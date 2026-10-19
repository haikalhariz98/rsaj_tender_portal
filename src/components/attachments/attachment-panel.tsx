"use client";

import { useState } from "react";

import { DataList, type Column, type Row } from "@/components/data-list";
import { FileIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, ToneNote } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import type { AttachmentItemView, PanelView, SlotView } from "@/lib/documents/views";

import { DocumentButton } from "./document-drawer";
import { NewVersionButton, UploadButton, type Notice, type OwnerKey } from "./upload-actions";

/**
 * The one place a record's documents are shown and changed, for every owner (plan §6):
 * a sitting's signed minutes, an exercise's dossier and scope, an award's returned
 * scans, a delegation's recommendation. It decides nothing: each slot's state, each
 * row's download, detach and replace decisions arrive from `read.ts` with the words
 * why, and a disabled act shows that reason beside it.
 *
 * The access statement is said once, here: it says who opens a document that is SULIT, and that every download is logged.
 */
export function AttachmentPanel({
  title = "Documents",
  subtitle,
  owner,
  slots,
  frozen,
  items,
  past,
  upload,
  statement,
  onChanged,
  compact,
}: PanelView & { title?: string; subtitle?: string; /// Called after any act succeeds or reports, for a host that holds its own copy of the panel (a drawer).
  onChanged?: () => void;
  /// Founder, 2026-10-05 (a sitting's minutes): only the slots, each with its upload and its download.
  /// The access statement moves behind the information button beside the title; the full list of
  /// versions and what was taken off stay on the Documents screen.
  compact?: boolean }) {
  const [notice, setNoticeState] = useState<Notice | null>(null);
  const setNotice = (n: Notice | null) => {
    setNoticeState(n);
    if (n) onChanged?.();
  };
  const key: OwnerKey = owner;
  const refused = upload.refusals.length > 0;
  const byId = new Map(items.map((i) => [i.attachmentId, i]));

  const columns: Column[] = [
    { key: "doc", label: "Document", mobile: "primary" },
    { key: "class", label: "Classification", width: "112px", mobile: "meta" },
    // Wide enough for the malware chip, "Not scanned for malware — scanning not built", on one line.
    { key: "version", label: "Version and scan", width: "348px", mobile: "meta" },
    { key: "received", label: "Received on", width: "132px", mobile: "meta" },
  ];

  const rows: Row[] = items.map((i) => ({
    id: i.attachmentId,
    cells: {
      doc: { kind: "stack", title: i.title, sub: `${i.purposeLabel} · ${i.className} · ${i.size}, ${i.typeLabel} · ${i.fingerprintShort}` },
      class: { kind: "badge", text: i.classification, tone: i.classificationTone === "neutral" ? undefined : i.classificationTone },
      version: {
        kind: "chips",
        items: [
          { text: `Version ${i.versionNo}` },
          ...(i.withdrawn ? [{ text: `Withdrawn ${i.withdrawn.on}`, tone: "err" as const }] : []),
          ...(i.newerVersionNo ? [{ text: `Version ${i.newerVersionNo} exists, not pinned`, tone: "info" as const }] : []),
          ...(i.hold ? [{ text: "Legal hold", tone: "err" as const }] : []),
          { text: i.scan.text, tone: i.scan.tone === "neutral" ? undefined : i.scan.tone, nowrap: true },
        ],
      },
      received: { kind: "stack", title: i.receivedOn ?? "Not recorded", sub: i.recordedBy },
    },
    search: `${i.title} ${i.className} ${i.purposeLabel} ${i.fileName}`,
    note: i.download.allowed ? undefined : i.download.reason,
  }));

  const pastColumns: Column[] = [
    { key: "doc", label: "Document", mobile: "primary" },
    { key: "on", label: "Taken off", width: "130px", mobile: "meta", nowrap: true },
    { key: "why", label: "Why", mobile: "meta" },
  ];
  const pastRows: Row[] = past.map((i) => ({
    id: i.attachmentId,
    cells: {
      doc: { kind: "stack", title: i.title, sub: `${i.purposeLabel} · version ${i.versionNo}` },
      on: { kind: "text", text: i.takenOff?.on ?? "—" },
      why: { kind: "text", text: i.takenOff?.reason || "No reason recorded" },
    },
    search: `${i.title} ${i.purposeLabel}`,
  }));

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FileIcon size={17} />}
        title={
          <span className="inline-flex items-center gap-2">
            {title}
            <span className="sr-only">{statement}</span>
            <MoreText text={statement} title="Who can open these" variant="note" label="Who can open these" />
          </span>
        }
        subtitle={subtitle}
      />
      <CardBody className="flex flex-col gap-4">

        {notice && (
          <ToneNote tone={notice.tone} action={<Button size="sm" variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button>}>
            {notice.text}
          </ToneNote>
        )}
        {refused && (
          <Callout tone="warn" title="Uploads are refused until this is set">
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {upload.refusals.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Callout>
        )}
        {frozen && <Callout tone="warn">{frozen.reason}</Callout>}
        <ul className="flex flex-col divide-y divide-line/70 rounded-2xl border border-line">
          {slots.map((s) => (
            <SlotRow key={s.purpose} s={s} item={items.find((i) => i.purpose === s.purpose) ?? null} owner={key} upload={upload} refused={refused} showReason={!frozen} onNotice={setNotice} download={compact} />
          ))}
          {slots.length === 0 && <li className="px-4 py-3 text-[13.5px] text-ink-3">No document is kept against this record.</li>}
        </ul>
      </CardBody>

      {!compact && (
      <div className="border-t border-line">
        {/* Phase 1 carry D5: five columns and an actions column need more than the record's content column at
            1024 (688px beside the sidebar), so the list stacks below xl rather than scrolling inside its card. */}
        <DataList
          flat
          stackBelow="xl"
          selectable={false}
          searchable={items.length > 8}
          toolbar={items.length > 8}
          columns={columns}
          rows={rows}
          actionsWidth={160}
          exportName="documents"
          emptyTitle="Nothing is attached yet"
          emptyBody={
            slots.some((s) => s.state === "OPEN" && s.attachedBy == null)
              ? "Upload one on its line above."
              : slots.length > 0 && slots.every((s) => s.attachedBy != null)
                ? "Attached by the step named above."
                : "Attachable once the record allows it."
          }
          actions={(id) => <RowActions item={byId.get(id)!} owner={key} upload={upload} onNotice={setNotice} />}
        />
      </div>
      )}

      {!compact && past.length > 0 && (
        <div className="border-t border-line">
          <div className="px-5 pt-4 sm:px-6">
            <h4 className="text-[13px] font-bold text-ink">Taken off or replaced</h4>
            <p className="text-[12.5px] text-ink-3">What stood here before, and why.</p>
          </div>
          <DataList flat stackBelow="xl" selectable={false} searchable={false} toolbar={false} columns={pastColumns} rows={pastRows} exportName="documents-taken-off" />
        </div>
      )}
    </Card>
  );
}

function SlotRow({ s, item, owner, upload, refused, showReason, onNotice, download }: { s: SlotView; item: AttachmentItemView | null; owner: OwnerKey; upload: PanelView["upload"]; refused: boolean; showReason: boolean; onNotice: (n: Notice) => void; download?: boolean }) {
  const open = s.state === "OPEN" && !refused && s.attachedBy == null;
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5">
      <div className="min-w-[min(100%,14rem)] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-ink">{s.label}</span>
          <Badge tone={s.status.tone}>{s.status.text}</Badge>
          <span className="text-[12.5px] text-ink-3">{s.required ? "Required" : "Optional"}</span>
        </div>
        {s.reason && showReason && <p className="mt-1 text-[13px] text-ink-3">{s.reason}</p>}
        {s.attachedBy && <p className="mt-1 text-[13px] text-ink-3">{s.attachedBy}</p>}
        {s.findings.map((f) => (
          <p key={f.text} className={f.tone === "err" ? "mt-1 text-[13px] font-medium text-rose-700" : f.tone === "warn" ? "mt-1 text-[13px] font-medium text-amber-800" : "mt-1 text-[13px] text-ink-3"}>
            {f.text}
          </p>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 max-sm:w-full">
        {download && item && (item.download.allowed ? (
          <a href={item.download.href} className={buttonClass("secondary", "sm")} aria-label={`Download ${item.title}`}>
            Download
          </a>
        ) : (
          <Button size="sm" variant="secondary" disabled aria-label={`Download ${item.title}`} title={item.download.reason ?? undefined}>
            Download
          </Button>
        ))}
        <SlotButton s={s} item={item} owner={owner} upload={upload} refused={refused} open={open} onNotice={onNotice} />
      </div>
    </li>
  );
}

/// A row carries what a reader reaches for: the file, and the details. Verifying, replacing and
/// taking off are acts on this record, so they sit in the drawer, beside the reasons they may be
/// unavailable; a disabled download's reason is the row's note.
function RowActions({ item, owner, upload, onNotice }: { item: AttachmentItemView; owner: OwnerKey; upload: PanelView["upload"]; onNotice: (n: Notice) => void }) {
  return (
    <>
      {item.download.allowed ? (
        <a href={item.download.href} className={buttonClass("secondary", "sm")} aria-label={`Download ${item.title}`}>
          Download
        </a>
      ) : (
        <Button size="sm" variant="secondary" disabled aria-label={`Download ${item.title}`}>
          Download
        </Button>
      )}
      <DocumentButton documentId={item.documentId} label={item.title} onRecord={{ owner, item, upload, onNotice }} iconOnly />
    </>
  );
}

/// The slot's one button: Upload while it is empty, then what its capacity says (`slotAct`):
/// a new version of the one document, or another document.
function SlotButton({ s, item, owner, upload, refused, open, onNotice }: { s: SlotView; item: AttachmentItemView | null; owner: OwnerKey; upload: PanelView["upload"]; refused: boolean; open: boolean; onNotice: (n: Notice) => void }) {
  // Attached by the owner's own act (a bill's import): that act is the only way in, and it says where.
  if (s.attachedBy != null) return null;
  if (s.act === "NEW_VERSION" && item?.newVersion) {
    return item.newVersion.allowed && !refused ? (
      <NewVersionButton owner={owner} item={item} upload={upload} onNotice={onNotice} prominent />
    ) : (
      <Button size="sm" variant="secondary" disabled aria-label={`New version of ${item.title}`} title={item.newVersion.allowed ? upload.refusals[0] : item.newVersion.reason}>
        New version
      </Button>
    );
  }
  const label = s.act === "ADD_ANOTHER" ? "Add another" : "Upload";
  return open ? (
    <UploadButton owner={owner} slot={s} upload={upload} onNotice={onNotice} label={label} />
  ) : (
    <Button size="sm" variant="secondary" disabled aria-label={`${label} ${s.label}`} title={s.reason ?? "Uploads are refused until the setting above is made"}>
      {label}
    </Button>
  );
}
