"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";

import { exportAuditTrail, type ExportResult } from "./actions";

/**
 * Choose the days and export. The file the server built comes back as text and is
 * saved exactly as sent, so its bytes — and its digest — are the ones recorded.
 */
export function AuditExportForm({ today }: { today: string | null }) {
  const [state, action, pending] = useActionState<ExportResult, FormData>(exportAuditTrail, { ok: false });
  const [saved, setSaved] = useState<string | null>(null);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!state.ok || !state.file || !state.fileName || last.current === state.sha256) return;
    last.current = state.sha256 ?? null;
    const url = URL.createObjectURL(new Blob([state.file], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = state.fileName;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(state.fileName);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First day" htmlFor="fromDay" required error={state.errors?.fromDay}>
          <Input id="fromDay" name="fromDay" type="date" max={today ?? undefined} aria-invalid={!!state.errors?.fromDay} />
        </Field>
        <Field label="Last day" htmlFor="toDay" required error={state.errors?.toDay} hint="The organisation's days, both included.">
          <Input id="toDay" name="toDay" type="date" max={today ?? undefined} defaultValue={today ?? undefined} aria-invalid={!!state.errors?.toDay} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={pending || !today}>
          {pending ? "Exporting…" : "Export the trail"}
        </Button>
        {!today && <span className="text-[12.5px] text-ink-3">Set the organisation&apos;s time zone first.</span>}
      </div>
      {state.message && !state.ok && <Callout tone="err">{state.message}</Callout>}
      {state.ok && state.sha256 && (
        <Callout tone="ok" title={saved ? `Saved ${saved}` : "Exported"}>
          {state.rowCount} {state.rowCount === 1 ? "entry" : "entries"}. SHA-256 of the file:{" "}
          <span className="font-mono text-[12px] break-all">{state.sha256}</span>. The export and its digest are on the record below.
        </Callout>
      )}
    </form>
  );
}
