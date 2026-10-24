"use client";

import { useId, useState } from "react";

import { Badge, Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Checkbox, Field, FileInput, Input, type FileUpload } from "@/components/ui/field";
import { REGISTRATION_HINT } from "@/lib/portal/labels";
import type { FaultView } from "@/lib/portal/register/contract";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";

import { errorText, faultsAt, noteText } from "./faults";

/**
 * Step 2 of the registration (FR-VND-002), the compliance documents, as a controlled component: one block per kind of document the procurement office asks for, each with what it is (the
 * office's own words), whether it is required, the reference and expiry, the rate where the document carries one, a "does not apply" tick where that is allowed, and its files. A kind the
 * office lets the supplier lodge several of ("Other") has an "Add another", each with a title. Every file is "Not scanned": nothing scans a file yet.
 *
 * Shared by the signed-in wizard, whose files are uploaded as they are chosen and saved in its draft, and by the public form (ADR 0041), whose files are held in the browser and sent once at
 * Submit: the page says which through each row's `files`. The page holds the rows and the findings; this draws them.
 */

export interface DocTypeView {
  id: string;
  name: string;
  hint: string | null;
  requirement: "REQUIRED" | "OPTIONAL" | "NOT_SAID";
  /// true: the expiry is required; null: asked but not insisted on; false: not asked.
  expires: boolean | null;
  recordsRate: boolean;
  repeatable: boolean;
  notApplicableAllowed: boolean;
  /// The registration body that issues this kind, offered under "Issued by" (nothing is filled in). Null: none configured.
  body: string | null;
}

/// One certificate as typed. `id` is the saved row's, or the browser's own key ("new:…") for one not saved (and, on the public form, never saved).
export interface DocRowValue {
  id: string;
  typeId: string;
  title: string;
  reference: string;
  issuingAuthority: string;
  expiresOn: string;
  ratePercent: string;
  notApplicable: boolean;
}

/// An uploaded file, as the signed-in wizard's draft holds it.
export interface FileView {
  versionId: string;
  name: string;
  size: string;
}

/// A file held in the browser, not yet sent.
export interface HeldFileView {
  name: string;
  size: string;
}

/// A row's files: held in the browser until Submit (the public form), or uploaded as chosen (the signed-in wizard).
export type RowFiles =
  | { mode: "held"; files: readonly HeldFileView[]; add: (file: File) => void; remove: (index: number) => void }
  | { mode: "uploaded"; files: readonly FileView[]; hrefOf: (file: FileView) => string; withdraw: (file: FileView) => void; upload: FileUpload; canUpload: boolean };

const REQUIREMENT_WORDS = { REQUIRED: "Required", OPTIONAL: "Optional", NOT_SAID: "Required: not set" } as const;
const REQUIREMENT_TONE = { REQUIRED: "brand", OPTIONAL: "neutral", NOT_SAID: "warn" } as const;

/// A row nobody has typed in yet: its type, and the key the page gives it.
export const blankDocRow = (typeId: string, id: string): DocRowValue => ({ id, typeId, title: "", reference: "", issuingAuthority: "", expiresOn: "", ratePercent: "", notApplicable: false });

/// The rows a page starts with: the ones it holds, then one empty row for each kind asked for once that has none. Each empty row's key is made from its type, so the server's HTML and the
/// browser's agree (a clock or a counter read while rendering would not).
export function startingDocRows<R extends DocRowValue>(types: readonly DocTypeView[], rows: readonly R[], blank: (typeId: string, id: string) => R): R[] {
  return [...rows, ...types.filter((t) => !t.repeatable && !rows.some((r) => r.typeId === t.id)).map((t) => blank(t.id, `new:i${t.id}`))];
}

let counter = 0;
/// The key of a row added by a click: the clock and a counter, which only a click reads. Within the public form's key rule (`new:` and up to 40 letters, digits, `_` or `-`).
export const clickedRowKey = () => `new:v${Date.now().toString(36)}${(counter++).toString(36)}`;

export function DocumentsFields<R extends DocRowValue>({
  types,
  rows,
  onChange,
  faults,
  filesOf,
  newRow,
  onRemove,
  uploadClosed,
  acceptNote,
  accept,
  busy,
}: {
  types: readonly DocTypeView[];
  rows: readonly R[];
  onChange: (rows: R[]) => void;
  faults: readonly FaultView[];
  filesOf: (row: R) => RowFiles;
  /// A new row of a kind, for "Add another".
  newRow: (typeId: string) => R;
  /// Removing a row. Absent: the row is simply dropped from the list.
  onRemove?: (row: R) => void;
  uploadClosed: string | null;
  acceptNote: string | null;
  /// The media types the file picker offers. A hint to the picker only: the bytes are judged when they arrive.
  accept: string;
  busy: boolean;
}) {
  const base = useId();
  // A held file is kept by the page; the picker is drawn afresh after each, so it shows nothing chosen and the same file may be added again.
  const [picks, setPicks] = useState(0);
  const patch = (id: string, change: Partial<DocRowValue>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const remove = (row: R) => (onRemove ? onRemove(row) : onChange(rows.filter((r) => r.id !== row.id)));

  return (
    <div>
      {uploadClosed && (
        <Callout tone="warn" title="Uploads are closed" className="mb-5">
          {uploadClosed}
        </Callout>
      )}
      <div className="flex flex-col gap-5">
        {types.map((t) => {
          const mine = rows.filter((r) => r.typeId === t.id);
          const typeFaults = faultsAt(faults, `type.${t.id}`);
          return (
            <section key={t.id} aria-labelledby={`${base}-${t.id}`} className="rounded-2xl border border-line p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id={`${base}-${t.id}`} className="text-[14.5px] font-bold text-ink">
                  {t.name}
                </h3>
                <Badge tone={REQUIREMENT_TONE[t.requirement]}>{REQUIREMENT_WORDS[t.requirement]}</Badge>
              </div>
              {t.hint && <p className="mt-1 text-[13px] text-ink-3">{t.hint}</p>}
              {typeFaults.length > 0 && <p className={`mt-1.5 text-[12.5px] font-medium ${errorText(typeFaults) ? "text-rose-600" : "text-ink-3"}`}>{errorText(typeFaults) ?? noteText(typeFaults)}</p>}
              <div className="mt-3 flex flex-col gap-4">
                {mine.map((r, i) => {
                  const at = (n: string) => `documents.${r.id}.${n}`;
                  const fid = (n: string) => `${base}-${r.id}-${n}`;
                  const f = (n: string) => faultsAt(faults, at(n));
                  const files = filesOf(r);
                  return (
                    <div key={r.id} className={mine.length > 1 || t.repeatable ? "rounded-xl bg-sunken/60 p-3.5" : undefined}>
                      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {t.repeatable && (
                          <Field label="Title" htmlFor={fid("title")} required hint={REGISTRATION_HINT.rowTitle} error={errorText(f("title"))}>
                            <Input id={fid("title")} value={r.title} maxLength={120} onChange={(e) => patch(r.id, { title: e.target.value })} />
                          </Field>
                        )}
                        <Field label="Reference number" htmlFor={fid("reference")}>
                          <Input id={fid("reference")} value={r.reference} maxLength={120} disabled={r.notApplicable} onChange={(e) => patch(r.id, { reference: e.target.value })} />
                        </Field>
                        <Field label="Issued by" htmlFor={fid("authority")}>
                          <Input id={fid("authority")} list={t.body ? fid("authority-list") : undefined} value={r.issuingAuthority} maxLength={160} disabled={r.notApplicable} onChange={(e) => patch(r.id, { issuingAuthority: e.target.value })} />
                          {t.body && (
                            <datalist id={fid("authority-list")}>
                              <option value={t.body} />
                            </datalist>
                          )}
                        </Field>
                        {t.expires !== false && (
                          <Field label="Expiry date" htmlFor={fid("expires")} required={t.expires === true} hint={t.expires === null ? REGISTRATION_HINT.expiryIfAny : undefined} error={errorText(f("expiresOn"))}>
                            <Input id={fid("expires")} type="date" value={r.expiresOn} disabled={r.notApplicable} onChange={(e) => patch(r.id, { expiresOn: e.target.value })} />
                          </Field>
                        )}
                        {t.recordsRate && (
                          <Field label="Rate" htmlFor={fid("rate")} required hint={REGISTRATION_HINT.rate} error={errorText(f("ratePercent"))}>
                            <AffixInput id={fid("rate")} suffix="%" inputMode="decimal" value={r.ratePercent} disabled={r.notApplicable} onChange={(e) => patch(r.id, { ratePercent: e.target.value })} />
                          </Field>
                        )}
                      </div>
                      {t.notApplicableAllowed && (
                        <div className="mt-2">
                          <Checkbox label="This does not apply to us" checked={r.notApplicable} onChange={(e) => patch(r.id, { notApplicable: e.target.checked })} />
                          {errorText(f("notApplicable")) && <p className="mt-1 text-[12.5px] font-medium text-rose-600">{errorText(f("notApplicable"))}</p>}
                        </div>
                      )}
                      {!r.notApplicable && (
                        <div className="mt-3">
                          {files.files.length > 0 && (
                            <ul className="mb-2 flex flex-col gap-1.5">
                              {files.mode === "uploaded"
                                ? files.files.map((file) => (
                                    <li key={file.versionId} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                                      <a className="min-w-0 break-all font-medium text-brand-700 hover:underline" href={files.hrefOf(file)}>
                                        {file.name}
                                      </a>
                                      <span className="text-ink-3">{file.size}</span>
                                      <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip>
                                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => files.withdraw(file)} aria-label={`Withdraw ${file.name}`}>
                                        Withdraw
                                      </Button>
                                    </li>
                                  ))
                                : files.files.map((file, k) => (
                                    <li key={`${k}-${file.name}`} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                                      <span className="min-w-0 break-all font-medium text-ink">{file.name}</span>
                                      <span className="text-ink-3">{file.size}</span>
                                      <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip>
                                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => files.remove(k)} aria-label={`Remove ${file.name}`}>
                                        Remove
                                      </Button>
                                    </li>
                                  ))}
                            </ul>
                          )}
                          {files.mode === "uploaded" ? (
                            <Field label={files.files.length ? "Replace or add a file" : "File"} htmlFor={fid("file")} hint={acceptNote ?? undefined} error={errorText(f("file"))}>
                              <FileInput id={fid("file")} accept={accept} disabled={!!uploadClosed || busy || !files.canUpload} chooseLabel={files.files.length ? "Add file" : "Choose file"} upload={files.upload} />
                            </Field>
                          ) : (
                            <Field label={files.files.length ? "Add a file" : "File"} htmlFor={fid("file")} hint={acceptNote ?? undefined} error={errorText(f("file"))}>
                              <FileInput
                                key={picks}
                                id={fid("file")}
                                accept={accept}
                                disabled={!!uploadClosed || busy}
                                chooseLabel={files.files.length ? "Add file" : "Choose file"}
                                onChange={(e) => {
                                  const file = e.currentTarget.files?.[0];
                                  if (!file) return;
                                  files.add(file);
                                  setPicks((n) => n + 1);
                                }}
                              />
                            </Field>
                          )}
                        </div>
                      )}
                      {(t.repeatable || i > 0) && (
                        <div className="mt-2 text-right">
                          <Button size="sm" variant="destructive" disabled={busy} onClick={() => remove(r)}>
                            Remove this {t.name.toLowerCase()}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {t.repeatable && (
                  <div>
                    <Button size="sm" variant="secondary" onClick={() => onChange([...rows, newRow(t.id)])}>
                      {mine.length ? "Add another" : `Add ${t.name.toLowerCase()}`}
                    </Button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
