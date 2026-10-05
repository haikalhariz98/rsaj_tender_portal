"use client";

import { useEffect, useRef, useState } from "react";

import { DownloadIcon, UploadIcon } from "@/components/icons";
import { Button, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { CONFIRM_SCRIM, confirmPanelClass } from "@/components/ui/drawer";
import type { ImportedLine, ImportProblem } from "@/lib/requisition/line-import";
import { confirmReplace, LINE_UPLOAD_WORDS as W, linesRead } from "@/lib/requisition/line-import-labels";

/**
 * Download the line-item template, fill it in, upload it. The file is read on the server
 * (a route handler: an action's body is capped at 1 MB); what comes back is lines and
 * problems, handed to the form. Nothing is saved here.
 */
export function LineUpload({
  typedLines,
  onApply,
}: {
  /// How many lines the form already holds that someone has typed in.
  typedLines: number;
  onApply: (lines: ImportedLine[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ lines: ImportedLine[]; name: string; left: number } | null>(null);

  const apply = (lines: ImportedLine[], name: string) => {
    onApply(lines);
    setStatus(linesRead(lines.length, name).en);
  };

  async function onFile(file: File) {
    setBusy(true);
    setStatus(null);
    setProblems([]);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/requisitions/line-import", { method: "POST", body });
      const out = (await res.json()) as { lines: ImportedLine[]; problems: ImportProblem[] };
      setProblems(out.problems);
      if (out.lines.length === 0) return;
      if (typedLines > 0) setAsking({ lines: out.lines, name: file.name, left: out.problems.length });
      else apply(out.lines, file.name);
    } catch {
      setProblems([{ row: null, text: W.failed }]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button size="sm" icon={<UploadIcon size={15} />} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? W.uploading.en : W.upload.en}
        </Button>
        <input
          ref={input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label={W.upload.en}
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
          {W.template.en}:
          <a href="/requisitions/line-template" download className={buttonClass("secondary", "sm")}>
            <DownloadIcon size={14} />
            {W.excel.en}
          </a>
          <a href="/requisitions/line-template?format=csv" download className={buttonClass("secondary", "sm")}>
            <DownloadIcon size={14} />
            {W.csv.en}
          </a>
        </span>
      </div>
      <p className="text-[12.5px] text-ink-3">{W.help.en}</p>
      <div aria-live="polite" className="text-[13px] text-ink-2">
        {status}
      </div>
      {problems.length > 0 && (
        <Callout
          tone={status ? "warn" : "err"}
          title={status || asking ? W.problemsTitle.en : W.nothingTitle.en}
          action={
            <Button size="sm" variant="ghost" onClick={() => setProblems([])}>
              {W.dismiss.en}
            </Button>
          }
        >
          <ul className="list-disc pl-5">
            {problems.map((p, i) => (
              <li key={i}>{p.text.en}</li>
            ))}
          </ul>
          <span className="mt-1.5 block">{W.fixHint.en}</span>
        </Callout>
      )}
      {asking && (
        <ReplaceConfirm
          words={confirmReplace(typedLines, asking.lines.length, asking.left).en}
          onReplace={() => {
            apply(asking.lines, asking.name);
            setAsking(null);
          }}
          onKeep={() => setAsking(null)}
        />
      )}
    </div>
  );
}

/// A small centred box: replacing typed lines is asked, never done silently.
function ReplaceConfirm({ words, onReplace, onKeep }: { words: string; onReplace: () => void; onKeep: () => void }) {
  const latest = useRef(onKeep);
  useEffect(() => {
    latest.current = onKeep;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latest.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className={CONFIRM_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && onKeep()}>
      <div className={confirmPanelClass()} role="alertdialog" aria-modal="true" aria-labelledby="line-replace-title" aria-describedby="line-replace-words">
        <div className="flex flex-col gap-2 px-6 pt-5 pb-4">
          <h2 id="line-replace-title" className="text-[18px] leading-snug font-bold tracking-tight text-ink">
            {W.confirmTitle.en}
          </h2>
          <p id="line-replace-words" className="text-[14px] text-ink-2">
            {words}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">
          <Button autoFocus variant="ghost" onClick={onKeep}>
            {W.keep.en}
          </Button>
          <Button variant="primary" onClick={onReplace}>
            {W.replace.en}
          </Button>
        </div>
      </div>
    </div>
  );
}
