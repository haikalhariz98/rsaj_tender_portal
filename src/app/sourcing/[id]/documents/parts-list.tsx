"use client";

import Link from "next/link";

import { DataList, type Row } from "@/components/data-list";
import { OwnerDocumentsButton } from "@/components/attachments/owner-documents-button";
import { Blocked } from "@/components/ui/blocked";
import { Button, buttonClass } from "@/components/ui/button";

import { PickTemplateDrawer } from "./editors";

type Allowed = { allowed: true } | { allowed: false; reason: string };

/// A part as the read model gives it (src/lib/tender-docs/read.ts), trimmed to what the list shows.
export interface PartRow {
  id: string;
  printedNumber: string;
  label: string;
  /// The Appendix stays a form (SR-12): its line says "Fill in", not the four file acts.
  isAppendix: boolean;
  appendixHref: string | null;
  role: string;
  content: string;
  source: string;
  /// How the part is issued, in words: a file, merged text, the form, or the bill.
  issuedAs: string;
  /// Where the tender is restricted and the part is an uploaded file: the portal does not stamp it.
  uploadNote: string | null;
  preparedBy: string;
  mandatory: string;
  inTableDocument: string;
  state: string;
  stateTone: "ok" | "warn" | undefined;
  omittedBecause: string | null;
  /// A draft part an officer once omitted, with the reason given: it is issued by its content now (ruling 14).
  earlierOmission: string | null;
  /// What a part that is not ready lacks, or says an optional part will be recorded Not issued.
  missing: string | null;
  template: string | null;
  files: { title: string; versionNo: number; live: boolean }[];
  /// SR-11: the four acts. Each says whether it can be done now and, if not, why.
  actions: {
    template:
      | { kind: "MERGED"; pick: { allowed: true; options: { value: string; label: string }[]; current: string } | { allowed: false; reason: string }; draftHref: string | null; file: { filename: string; href: string } | null }
      | { kind: "FILE"; file: { filename: string; href: string } }
      | { kind: "NONE"; reason: string };
    upload: Allowed;
    replace: Allowed;
    download: { allowed: true; href: string; name: string; more: number } | { allowed: false; reason: string };
  };
}

/// Why each act that cannot be done now cannot, by the act's name, with the acts that share a reason grouped: what the disabled buttons point at (review U2), so the reason is on the page and not only in a tooltip.
function blockedReasons(p: PartRow): { text: string; id: string } | null {
  const t = p.actions.template;
  const all: [string, string | null][] = [
    ["Template", t.kind === "MERGED" ? (t.pick.allowed ? null : t.pick.reason) : t.kind === "NONE" ? t.reason : null],
    ["Upload", p.actions.upload.allowed ? null : p.actions.upload.reason],
    ["Download", p.actions.download.allowed ? null : p.actions.download.reason],
    ["Replace", p.actions.replace.allowed ? null : p.actions.replace.reason],
  ];
  const byReason = new Map<string, string[]>();
  for (const [name, reason] of all) if (reason) byReason.set(reason, [...(byReason.get(reason) ?? []), name]);
  if (byReason.size === 0) return null;
  const text = [...byReason].map(([reason, names]) => `${names.join(" and ")}: ${reason.replace(/.$/, "")}.`).join(" ");
  return { text, id: `part-${p.id}-reasons` };
}

/**
 * The parts of the pack in print order, on the shared DataList (SR-11, ruling 14). Every line offers Template, Upload, Download and Replace; there is no Open, Mark ready,
 * Omit, Reopen or View as frozen. A part is ready as soon as its content is in order, so its state is read, not set. Where an act cannot be done now it is disabled with its
 * reason. The Appendix stays a form with a "Fill in" link (SR-12). The list is a client component because its row actions are functions of the row.
 */
export function PartsList({ exerciseId, parts }: { exerciseId: string; parts: PartRow[] }) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const rows: Row[] = parts.map((p) => {
    const tableText = p.inTableDocument === "Yes" ? "In the Tender Table Document" : p.inTableDocument === "No" ? "Not in the Tender Table Document" : "Tender Table Document: not set";
    const sub = [p.role, tableText, p.preparedBy === "Not set" ? null : `Prepared by ${p.preparedBy}`, p.template ? (p.template === "Not set" ? "No template chosen" : `Template: ${p.template}`) : null, p.omittedBecause ? `Omitted: ${p.omittedBecause}` : null, p.earlierOmission ? `Left out earlier by an officer: ${p.earlierOmission}` : null].filter(Boolean).join(" · ");
    const liveFiles = p.files.filter((f) => f.live);
    const note = [p.missing, p.uploadNote ? `${p.uploadNote}.` : null].filter(Boolean).join(" ") || undefined;
    return {
      id: p.id,
      search: `${p.printedNumber} ${p.label}`,
      note,
      cells: {
        part: { kind: "stack", title: `${p.printedNumber}. ${p.label}`, sub },
        what: {
          kind: "stack",
          title: `${p.mandatory === "Yes" ? "Mandatory" : p.mandatory === "No" ? "Optional" : "Mandatory: not set"} · ${p.content}`,
          sub: `${p.issuedAs}${liveFiles.length > 0 ? ` · ${liveFiles.length} file${liveFiles.length === 1 ? "" : "s"}` : ""}`,
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
      actionsPlacement="below"
      stackBelow="xl"
      columns={[
        { key: "part", label: "Part", mobile: "primary" },
        { key: "what", label: "Content and source", width: "250px", mobile: "meta" },
        { key: "state", label: "State", width: "110px", mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const p = byId.get(id)!;
        const name = `${p.printedNumber}. ${p.label}`;
        if (p.isAppendix)
          return (
            <span className="flex flex-wrap items-center justify-end gap-1">
              {p.appendixHref ? (
                <Link href={p.appendixHref} className={buttonClass("secondary", "sm")} aria-label={`Fill in ${name}`}>
                  Fill in
                </Link>
              ) : (
                <Blocked label="Fill in" reason="The Appendix is entered once the version is started." ariaLabel={`Fill in ${name}`} />
              )}
            </span>
          );
        const t = p.actions.template;
        const upload = p.actions.upload;
        const replace = p.actions.replace;
        const dl = p.actions.download;
        const why = blockedReasons(p);
        return (
          <span className="flex flex-wrap items-center justify-end gap-1">
            {t.kind === "MERGED" ? (
              t.pick.allowed ? (
                <PickTemplateDrawer exerciseId={exerciseId} partId={p.id} partLabel={name} options={t.pick.options} current={t.pick.current} draftHref={t.draftHref} file={t.file} />
              ) : (
                <Blocked label="Template" reason={t.pick.reason} noteId={why!.id} ariaLabel={`Template for ${name}`} />
              )
            ) : t.kind === "FILE" ? (
              <a href={t.file.href} className={buttonClass("ghost", "sm")} aria-label={`Download the template file for ${name}: ${t.file.filename}`} title={t.file.filename}>
                Template
              </a>
            ) : (
              <Blocked label="Template" reason={t.reason} noteId={why!.id} ariaLabel={`Template for ${name}`} />
            )}
            {upload.allowed ? (
              <OwnerDocumentsButton owner={{ kind: "tenderPackPart", id: p.id }} label={name} triggerLabel="Upload" title="Upload a file to this part" subtitle="Kept in the document store, with its fingerprint. The part is ready as soon as a file is uploaded, and the file freezes with the version." options={{ only: ["TENDER_PART"] }} />
            ) : (
              <Blocked label="Upload" reason={upload.reason} noteId={why!.id} ariaLabel={`Upload to ${name}`} />
            )}
            {dl.allowed ? (
              <a href={dl.href} className={buttonClass("ghost", "sm")} aria-label={`Download ${dl.name} for ${name}${dl.more > 0 ? `; ${dl.more} more in Upload` : ""}`} title={dl.more > 0 ? `${dl.name}. ${dl.more} more file${dl.more === 1 ? "" : "s"} are listed under Upload.` : dl.name}>
                Download
              </a>
            ) : (
              <Blocked label="Download" reason={dl.reason} noteId={why!.id} ariaLabel={`Download for ${name}`} />
            )}
            {replace.allowed ? (
              <OwnerDocumentsButton owner={{ kind: "tenderPackPart", id: p.id }} label={name} triggerLabel="Replace" title="Replace the file of this part" subtitle="A corrected file goes in place of the one now attached, as a new version of the same document. The earlier version stays on the record." options={{ only: ["TENDER_PART"] }} />
            ) : (
              <Blocked label="Replace" reason={replace.reason} noteId={why!.id} ariaLabel={`Replace for ${name}`} />
            )}
            {why && (
              <span id={why.id} className="basis-full text-right text-[12.5px] leading-snug text-ink-3">
                {why.text}
              </span>
            )}
          </span>
        );
      }}
    />
  );
}
