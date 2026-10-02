"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { stage, STORED_NOT_FILED, useStagedRef } from "@/components/attachments/upload-actions";
import { EMPTY_FORM_STATE, RecordEditor, type SaveAction } from "@/components/record-editor";
import { Button, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/field";
import { ON_BEHALF_HINT } from "@/lib/documents/labels";
import { formatSen } from "@/lib/money";
import { exportToSave, importBlock, importNotices, importSummary, parseBqCsv, type ParsedBqCsv } from "@/lib/scope/csv";
import { csvFaultText, IMPORT_BLOCK_TEXT, keyedMismatchText } from "@/lib/scope/labels";

import { exportBqCsv, importBqCsv, type BqExportResult } from "./actions";

/**
 * The bill's CSV, both ways (OD-5, Q-3). Importing reads the chosen file here first, with
 * the same rule the server runs (`parseBqCsv`), so the officer sees every line's problem and
 * what would be added before anything is stored. Only a file with no blocking problem is
 * sent: to the document store's upload Route Handler (a Server Action caps a body at 1 MB),
 * as a received document of the class chosen, and then the import act reads it back from
 * the store, parses it again and writes the lines with the file attached, in one step.
 *
 * Exporting asks the server for the file: it is built there, from the bill's lines only,
 * recorded with its digest, and saved here exactly as sent.
 */

type Option = { value: string; label: string };
type Allowed = { allowed: true } | { allowed: false; reason: string };

/// What the chosen file would add, read in the browser with the server's own rule.
function Preview({ parsed }: { parsed: ParsedBqCsv | null }) {
  if (!parsed) return <p className="text-[13px] text-ink-3">Choose a file to see what it holds before anything is stored.</p>;
  const blocks = parsed.faults.filter((f) => f.level === "block");
  const notices = importNotices(parsed);
  const s = importSummary(parsed);
  return (
    <div className="flex flex-col gap-2">
      {blocks.length > 0 ? (
        <Callout tone="err" title="This file cannot be imported">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {blocks.slice(0, 12).map((f, i) => (
              <li key={i}>{csvFaultText(f)}</li>
            ))}
            {blocks.length > 12 && <li>And {blocks.length - 12} more.</li>}
          </ul>
        </Callout>
      ) : (
        <Callout tone="ok" title="Ready to import">
          {s.lines} {s.lines === 1 ? "line" : "lines"} in {s.sections} {s.sections === 1 ? "section" : "sections"}.{" "}
          {s.priced ? `Total ${formatSen(s.total)}${s.incompleteLines ? `; ${s.incompleteLines} without a rate or quantity yet` : ""}.` : "The file has no Rate column: rates are entered after it is imported."}
        </Callout>
      )}
      {(notices.mismatches.length > 0 || notices.amountFaults.length > 0) && (
        <Callout tone="warn" title="Amounts in the file were ignored">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {notices.amountFaults.map((f, i) => (
              <li key={`a${i}`}>{csvFaultText(f)}</li>
            ))}
            {notices.mismatches.slice(0, 8).map((m) => (
              <li key={`m${m.line}`}>{keyedMismatchText(m)}</li>
            ))}
            {notices.mismatches.length > 8 && <li>And {notices.mismatches.length - 8} more.</li>}
          </ul>
        </Callout>
      )}
      {notices.other.length > 0 && (
        <Callout tone="warn" title="Also noticed in the file">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {notices.other.map((f, i) => (
              <li key={`w${i}`}>{csvFaultText(f)}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}

/// Listens to the drawer's form: the file chosen (read here, nothing is sent) and the Replace
/// switch. When the drawer closes the form is gone, so what it held is forgotten.
function FormWatcher({ onParsed, onReplace }: { onParsed: (p: ParsedBqCsv | null) => void; onReplace: (on: boolean) => void }) {
  const at = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = at.current?.closest("form");
    const input = form?.querySelector<HTMLInputElement>('input[type="file"][name="file"]');
    if (!form || !input) return;
    const read = async () => {
      const f = input.files?.[0];
      if (!f) return onParsed(null);
      const bytes = new Uint8Array(await f.arrayBuffer());
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
      } catch {
        return onParsed({ sections: [], faults: [{ code: "NOT_UTF8", level: "block", line: 1 }], keyedMismatches: [], priced: false, lineCount: 0 });
      }
      onParsed(parseBqCsv(text));
    };
    const replace = () => onReplace(!!form.querySelector<HTMLInputElement>('input[name="replace"]')?.checked);
    input.addEventListener("change", read);
    form.addEventListener("change", replace);
    return () => {
      input.removeEventListener("change", read);
      form.removeEventListener("change", replace);
      onParsed(null);
      onReplace(false);
    };
  }, [onParsed, onReplace]);
  return <span ref={at} hidden />;
}

export function ImportCsvDrawer({
  exerciseId,
  draft,
  upload,
  allowed,
  note,
}: {
  exerciseId: string;
  draft: { id: string; versionNo: number; lines: number; sections: number } | null;
  upload: { classes: Option[]; people: Option[]; capText: string | null } | null;
  allowed: Allowed;
  note: string;
}) {
  const stagedRef = useStagedRef();
  const [parsed, setParsed] = useState<ParsedBqCsv | null>(null);
  const onParsed = useCallback((p: ParsedBqCsv | null) => setParsed(p), []);
  const [replace, setReplace] = useState(false);
  const onReplace = useCallback((on: boolean) => setReplace(on), []);
  // Judged by lib in the order the server judges, so the button is off for the reason the server would give.
  const block = importBlock(parsed, { draftLines: draft?.lines ?? 0, replace });
  const action = useCallback<SaveAction>(
    async (_prev, data) => {
      const file = data.get("file");
      if (!(file instanceof File) || !file.name) return { ok: false, errors: { file: "Choose the bill's CSV file." } };
      // The same rule the server runs: a file it would refuse is not sent at all.
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(await file.arrayBuffer())).replace(/^﻿/, "");
      } catch {
        return { ok: false, errors: { file: csvFaultText({ code: "NOT_UTF8", level: "block" }) } };
      }
      const p = parseBqCsv(text);
      const blocks = p.faults.filter((f) => f.level === "block");
      if (blocks.length) return { ok: false, errors: { file: `Nothing was stored. ${blocks.slice(0, 3).map(csvFaultText).join(" ")}${blocks.length > 3 ? ` And ${blocks.length - 3} more, listed below.` : ""}` } };
      const s = await stage(data, stagedRef, {});
      if (!s.ok) return s.state;
      const fd = new FormData();
      fd.set("exerciseId", exerciseId);
      fd.set("bqVersionId", draft!.id);
      fd.set("versionId", s.versionId);
      if (data.get("replace") === "on") fd.set("replace", "on");
      const r = await importBqCsv(EMPTY_FORM_STATE, fd);
      if (!r.ok) return { ...r, message: `${r.message ?? "Importing was refused."} ${STORED_NOT_FILED}` };
      stagedRef.current = null;
      setParsed(null);
      return r;
    },
    [exerciseId, draft, stagedRef],
  );
  if (!allowed.allowed || !draft || !upload) {
    return (
      <Button size="sm" variant="secondary" disabled title={allowed.allowed ? "Uploads are not available." : allowed.reason}>
        Import from CSV
      </Button>
    );
  }
  return (
    <RecordEditor
      title={`Import lines into version ${draft.versionNo} from CSV`}
      description={note}
      fields={[
        { kind: "file", name: "file", label: "The bill as a CSV file", required: true, accept: ".csv,text/csv", hint: `Columns: Section, Section title, Item, Description, Unit, Kind, Quantity, Rate, Amount, Provisional. Saved from a spreadsheet as “CSV UTF-8”.${upload.capText ? ` ${upload.capText}` : ""}` },
        { kind: "text", name: "title", label: "Title", required: true, hint: "What the kept file is called in lists." },
        { kind: "select", name: "documentClassId", label: "Class", required: true, placeholder: "Choose a class", options: upload.classes, hint: "Decides its classification and how long it is kept. A priced bill may be SULIT to the organisation; choose accordingly." },
        { kind: "select", name: "recordedByPersonId", label: "Recorded by", required: true, placeholder: "Choose who is recording it", options: upload.people, hint: ON_BEHALF_HINT },
        { kind: "date", name: "receivedOn", label: "Received on", hint: "The day the department's bill was received. Leave it blank if it is not known." },
        ...(draft.lines === 0 && draft.sections > 0 ? [{ kind: "note" as const, text: `The draft's ${draft.sections} empty ${draft.sections === 1 ? "section is" : "sections are"} removed and the file's sections take their place. Each removal is kept in the history.` }] : []),
        ...(draft.lines > 0 ? [{ kind: "switch" as const, name: "replace", label: `Replace the draft's ${draft.lines} ${draft.lines === 1 ? "line" : "lines"}`, hint: "Each removed line is kept in the history. Without this, a draft that has lines is not imported into." }] : []),
      ]}
      values={{ title: `Bill of quantities, version ${draft.versionNo}, as received` }}
      sections={
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-[12px] font-semibold text-ink-3">What the file holds</p>
          <FormWatcher onParsed={onParsed} onReplace={onReplace} />
          <Preview parsed={parsed} />
        </div>
      }
      action={action}
      submitLabel="Upload and import"
      submitBlock={block ? IMPORT_BLOCK_TEXT[block] : null}
      trigger={{ label: "Import from CSV", className: buttonClass("secondary", "sm") }}
      size="lg"
    />
  );
}

/// Ask the server for the bill as CSV, priced or unpriced, and save the file it built.
export function ExportCsvForm({ exerciseId, versions, note }: { exerciseId: string; versions: Option[]; note: string }) {
  const [state, action, pending] = useActionState<BqExportResult, FormData>(exportBqCsv, { ok: false });
  const [saved, setSaved] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!exportToSave(state, last.current) || !state.file || !state.fileName) return;
    last.current = state.exportId ?? null;
    const url = URL.createObjectURL(new Blob([state.file], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = state.fileName;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(state.fileName);
  }, [state]);
  if (versions.length === 0) return null;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="exerciseId" value={exerciseId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Version" htmlFor="bq-export-version">
          <Select id="bq-export-version" name="bqVersionId" defaultValue={versions[0].value}>
            {versions.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="As" htmlFor="bq-export-priced" hint="The unpriced file is the bill as tenderers receive it.">
          <Select id="bq-export-priced" name="priced" defaultValue="no">
            <option value="no">Unpriced: no rate or amount</option>
            <option value="yes">Priced: rates and amounts</option>
          </Select>
        </Field>
      </div>
      <p className="text-[12.5px] text-ink-3">{note}</p>
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Building the file…" : "Export as CSV"}
        </Button>
      </div>
      {state.message && !state.ok && <Callout tone="err">{state.message}</Callout>}
      {state.ok && saved && (
        <Callout tone="ok" title={`Saved ${saved}`}>
          SHA-256 of the file: <span className="font-mono text-[12px] break-all">{state.sha256}</span>. The export is recorded in the exercise&apos;s history.
        </Callout>
      )}
    </form>
  );
}
