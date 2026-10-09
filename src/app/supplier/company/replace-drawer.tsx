"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { FileIcon } from "@/components/icons";
import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Field, FileInput, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SUPPLIER_COMPANY_POSTS, SUPPLIER_REGISTRATION_GETS } from "@/lib/auth/routes";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";

import { answerWords, at, postForm, type FormAnswer } from "./post-form";

/**
 * Sending a document to the procurement office from the Company workspace (Phase 4c): answering an item of the office's request (FR-VND-007), renewing a document before it expires
 * (FR-VND-008), or giving a kind of document for the first time. The file and what it says of itself go in ONE post, so a document is never lodged without its file. It waits for an
 * officer's check; a renewal does not replace the one in force until then, and the drawer says so. Every file is "Not scanned". The rules are the server's; what comes back is shown beside
 * the field it concerns.
 */

export interface CodeKind {
  kind: string;
  label: string;
  /// A grade is one per certificate.
  single: boolean;
}

export interface ReplaceDrawerProps {
  /// Token for this workspace's posts, and for the code search (the registration's).
  token: string | null;
  searchToken: string | null;
  /// What is sent: an item of the office's request, a document to renew, or a type given for the first time.
  target: { kind: "item" | "renew" | "new"; id: string };
  title: string;
  buttonLabel: string;
  buttonVariant?: "primary" | "secondary";
  /// Why it cannot be sent now, in words; the button is then disabled with the reason beside it.
  blockedReason: string | null;
  /// What the office wrote when it asked, verbatim.
  asked?: string | null;
  type: { name: string; expires: boolean | null; recordsRate: boolean; repeatable: boolean; bodyId: string | null; kinds: CodeKind[] };
  /// What the document it replaces said, to start from.
  start: { reference: string; issuingAuthority: string; title: string; ratePercent: string; chosen: { value: string; label: string; kind: string }[] };
  /// "PDF, JPG; up to 10 MB each", from the office's settings; null while not set.
  accept: string | null;
  /// A renewal is judged by an officer before it takes effect.
  renewal: boolean;
}

export function ReplaceDrawer(p: ReplaceDrawerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const heading = useId();
  const base = useId();
  const [reference, setReference] = useState(p.start.reference);
  const [authority, setAuthority] = useState(p.start.issuingAuthority);
  const [title, setTitle] = useState(p.start.title);
  const [expires, setExpires] = useState("");
  const [rate, setRate] = useState(p.start.ratePercent);
  const [file, setFile] = useState<File | null>(null);
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => Object.fromEntries(p.type.kinds.map((k) => [k.kind, p.start.chosen.filter((c) => c.kind === k.kind).map((c) => c.value)])));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [answer, setAnswer] = useState<{ status: number; body: FormAnswer | null } | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const labels: Record<string, string> = Object.fromEntries(p.start.chosen.map((c) => [c.value, c.label]));
  const faults = answer?.body?.faults;
  const id = (k: string) => `${base}-${k}`;

  async function send() {
    if (!file) {
      setAnswer({ status: 422, body: { ok: false, faults: [{ field: "file", level: "block", message: `Choose the file for the ${p.type.name}.` }] } });
      return;
    }
    setBusy(true);
    setAnswer(null);
    const form = new FormData();
    form.append("file", file);
    form.append("target", p.target.kind);
    form.append("targetId", p.target.id);
    form.append("reference", reference);
    form.append("issuingAuthority", authority);
    form.append("expiresOn", expires);
    form.append("ratePercent", rate);
    form.append("title", title);
    for (const v of Object.values(chosen).flat()) form.append("valueIds", v);
    const res = await postForm(SUPPLIER_COMPANY_POSTS.document, p.token, form, (l, t) => setProgress([l, t]));
    setBusy(false);
    if (res.status === 201 && res.body?.ok) {
      setSent(typeof res.body.label === "string" ? res.body.label : p.type.name);
      router.refresh();
    } else setAnswer(res);
  }

  const upload = Math.round((progress[0] / Math.max(1, progress[1])) * 100);
  return (
    <>
      {p.blockedReason ? (
        <span className="flex max-w-xs flex-col items-end gap-1 text-right">
          <Button variant="secondary" size="sm" disabled>
            {p.buttonLabel}
          </Button>
          <span className="text-[12px] text-ink-3">{p.blockedReason}</span>
        </span>
      ) : (
        <Button
          variant={p.buttonVariant ?? "secondary"}
          size="sm"
          icon={<FileIcon size={15} />}
          onClick={() => {
            setSent(null);
            setAnswer(null);
            setOpen(true);
          }}
          aria-haspopup="dialog"
        >
          {p.buttonLabel}
        </Button>
      )}
      {open && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("md")}>
            <span id={heading} className="sr-only">
              {p.title}
            </span>
            <DrawerHeader icon={<FileIcon size={17} />} title={p.title} subtitle="The procurement office checks it before it counts." onClose={() => !busy && setOpen(false)} />
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {sent ? (
                <Callout tone="ok" title="Sent to the procurement office">
                  Your {sent} was sent and is waiting for an officer to check it.{p.renewal ? " The one in force stays in force until then." : ""} Nothing is e-mailed: this page tells you when it has been checked.
                </Callout>
              ) : (
                <div className="flex flex-col gap-1">
                  {p.asked && (
                    <Callout tone="warn" title="What the office asked">
                      <span className="whitespace-pre-line">{p.asked}</span>
                    </Callout>
                  )}
                  {answer && !answer.body?.faults?.length && (
                    <Callout tone="err" className="mb-2">
                      {answerWords(answer.status, answer.body)}
                    </Callout>
                  )}
                  {p.renewal && <p className="text-[13px] text-ink-3">This is a renewal. It does not replace the one now in force until an officer has checked it.</p>}
                  {p.type.repeatable && p.target.kind === "new" && (
                    <Field label="Title" htmlFor={id("title")} required hint="So it can be told from the others" error={at(faults, "title")}>
                      <Input id={id("title")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
                    </Field>
                  )}
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    <Field label="Reference number" htmlFor={id("reference")} required error={at(faults, "reference")}>
                      <Input id={id("reference")} value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
                    </Field>
                    <Field label="Issued by" htmlFor={id("authority")} required error={at(faults, "issuingAuthority")}>
                      <Input id={id("authority")} value={authority} maxLength={160} onChange={(e) => setAuthority(e.target.value)} />
                    </Field>
                    {p.type.expires !== false && (
                      <Field label="Expiry date" htmlFor={id("expires")} required={p.type.expires === true} hint={p.type.expires === null ? "The office has not said whether this expires. Give the date if it has one." : undefined} error={at(faults, "expiresOn")}>
                        <Input id={id("expires")} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
                      </Field>
                    )}
                    {p.type.recordsRate && (
                      <Field label="Rate" htmlFor={id("rate")} required hint="A percentage from 0 to 100, for example 8 or 6.5" error={at(faults, "ratePercent")}>
                        <AffixInput id={id("rate")} suffix="%" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
                      </Field>
                    )}
                  </div>
                  {p.type.bodyId &&
                    p.type.kinds.map((k) => {
                      const sid = id(`codes-${k.kind}`);
                      const values = chosen[k.kind] ?? [];
                      const url = `${SUPPLIER_REGISTRATION_GETS.values}?body=${encodeURIComponent(p.type.bodyId!)}&kind=${encodeURIComponent(k.kind)}`;
                      const known = values.filter((v) => labels[v]).map((v) => (
                        <option key={v} value={v}>
                          {labels[v]}
                        </option>
                      ));
                      const set = (next: string[]) => setChosen((all) => ({ ...all, [k.kind]: next }));
                      return (
                        <Field key={k.kind} label={k.single ? `${k.label} (one)` : k.label} htmlFor={sid} hint={k.single ? "A certificate carries one grade." : "You may choose several."} error={k.single ? at(faults, "valueIds") : undefined}>
                          {k.single ? (
                            <Select id={sid} searchable value={values[0] ?? ""} onChange={(e) => set(e.target.value ? [e.target.value] : [])} placeholder="Choose" search={{ url, minChars: 0, token: p.searchToken, labels }}>
                              <option value="">Choose</option>
                              {known}
                            </Select>
                          ) : (
                            <Select id={sid} multiple searchable value={values} onValuesChange={set} placeholder="Choose" search={{ url, minChars: 0, token: p.searchToken, labels }}>
                              {known}
                            </Select>
                          )}
                        </Field>
                      );
                    })}
                  {p.type.bodyId && at(faults, "valueIds") && !p.type.kinds.some((k) => k.single) && <p className="text-[12.5px] font-medium text-rose-600">{at(faults, "valueIds")}</p>}
                  <Field label="File" htmlFor={id("file")} required hint={p.accept ?? undefined} error={at(faults, "file")}>
                    <FileInput id={id("file")} accept="application/pdf,image/png,image/jpeg,image/tiff" disabled={busy} onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
                  </Field>
                  <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
                    <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip> Nothing scans a file yet, so every file shows this on both sides.
                  </p>
                  {busy && (
                    <div className="mt-1.5">
                      <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upload} className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
                        <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${upload}%` }} />
                      </div>
                      <p className="mt-1 text-[12.5px] text-ink-3" aria-live="polite">
                        Sending… {upload}%
                      </p>
                    </div>
                  )}
                  {(faults ?? []).some((f) => f.level === "warn" || f.level === "info") && <p className="text-[12.5px] text-ink-3">{(faults ?? []).filter((f) => f.level !== "block").map((f) => f.message).join(" ")}</p>}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              {sent ? (
                <Button variant="primary" onClick={() => setOpen(false)}>
                  Close
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={send} disabled={busy || !p.token}>
                    {busy ? "Sending…" : "Send to the office"}
                  </Button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
