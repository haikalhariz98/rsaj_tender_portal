"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Badge, Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Checkbox, Field, FileInput, Input } from "@/components/ui/field";
import { SUPPLIER_REGISTRATION_GETS, SUPPLIER_REGISTRATION_POSTS } from "@/lib/auth/routes";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";
import { formatBytes } from "@/lib/documents/labels";

import { StepFooter, FaultSummary } from "./step-footer";
import { errorText, faultsAt, noteText, postJson, stepHref, useStepSave } from "./wizard-api";

/**
 * Step 2 of the registration (FR-VND-002): the compliance documents. One block per kind of document the procurement office asks for, each with what it is (the office's own words), whether it
 * is required, the reference and expiry, the rate where the document carries one, a "does not apply" tick where that is allowed, and its files. A kind the office lets the supplier lodge
 * several of ("Other") has an "Add another", each with a title. Every file is "Not scanned": nothing scans a file yet.
 *
 * Save draft keeps what is typed as it is. Next saves and then asks the step's rules, which come back as the words shown beside the fields.
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
}

export interface FileView {
  versionId: string;
  name: string;
  size: string;
}

export interface DocRowView {
  id: string;
  typeId: string;
  title: string;
  reference: string;
  issuingAuthority: string;
  expiresOn: string;
  ratePercent: string;
  notApplicable: boolean;
  files: FileView[];
}

const REQUIREMENT_WORDS = { REQUIRED: "Required", OPTIONAL: "Optional", NOT_SAID: "Required: not set" } as const;
const REQUIREMENT_TONE = { REQUIRED: "brand", OPTIONAL: "neutral", NOT_SAID: "warn" } as const;

let counter = 0;
const virtualId = () => `new:v${Date.now().toString(36)}${(counter++).toString(36)}`;
/// A row the supplier has not saved yet. The ones the page starts with get an id made from their type, so the server's HTML and the browser's agree (a clock or a counter read while rendering would not);
/// one added by a click is named by the clock and the counter, which only a click reads.
const blankRow = (typeId: string, id: string = virtualId()): DocRowView => ({ id, typeId, title: "", reference: "", issuingAuthority: "", expiresOn: "", ratePercent: "", notApplicable: false, files: [] });
const hasContent = (r: DocRowView) => !!(r.title || r.reference || r.issuingAuthority || r.expiresOn || r.ratePercent || r.notApplicable);

export function DocumentsStep({ token, version, types, rows: initial, uploadClosed, acceptNote }: { token: string | null; version: number; types: DocTypeView[]; rows: DocRowView[]; uploadClosed: string | null; acceptNote: string | null }) {
  const router = useRouter();
  const base = useId();
  const { version: current, setVersion, busy, message, saved, faults, stale, save, setMessage } = useStepSave("documents", token, version);
  const [rows, setRows] = useState<DocRowView[]>(() => [...initial, ...types.filter((t) => !t.repeatable && !initial.some((r) => r.typeId === t.id)).map((t) => blankRow(t.id, `new:i${t.id}`))]);

  const patch = (id: string, change: Partial<DocRowView>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r)));

  function section() {
    return {
      step: "documents",
      documents: rows
        .filter((r) => !r.id.startsWith("new:") || hasContent(r))
        .map((r) => ({ id: r.id, typeId: r.typeId, title: r.title, reference: r.reference, issuingAuthority: r.issuingAuthority, expiresOn: r.expiresOn, ratePercent: r.ratePercent, notApplicable: r.notApplicable })),
    };
  }

  async function run(next: boolean) {
    const done = await save(section(), { next });
    if (done.ok && Object.keys(done.created).length) setRows((all) => all.map((r) => ({ ...r, id: done.created[r.id] ?? r.id })));
    if (done.ok && done.advance) router.push(stepHref("codes"));
  }

  async function remove(row: DocRowView) {
    if (row.id.startsWith("new:")) {
      setRows((all) => all.filter((r) => r.id !== row.id));
      return;
    }
    const done = await save({ step: "documents", documents: [] }, { remove: [row.id] });
    if (done.ok) setRows((all) => all.filter((r) => r.id !== row.id));
  }

  async function withdraw(row: DocRowView, file: FileView) {
    const { status, body } = await postJson(SUPPLIER_REGISTRATION_POSTS.withdrawFile, token, { version: current, versionId: file.versionId });
    if (status === 200 && body?.ok) {
      if (typeof body.version === "number") setVersion(body.version);
      patch(row.id, { files: row.files.filter((f) => f.versionId !== file.versionId) });
    } else setMessage(body?.message ?? "Not changed. Try again in a moment.");
  }

  return (
    <div>
      <FaultSummary faults={faults} />
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
                  return (
                    <div key={r.id} className={mine.length > 1 || t.repeatable ? "rounded-xl bg-sunken/60 p-3.5" : undefined}>
                      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {t.repeatable && (
                          <Field label="Title" htmlFor={fid("title")} required hint="So it can be told from the others" error={errorText(f("title"))}>
                            <Input id={fid("title")} value={r.title} maxLength={120} onChange={(e) => patch(r.id, { title: e.target.value })} />
                          </Field>
                        )}
                        <Field label="Reference number" htmlFor={fid("reference")}>
                          <Input id={fid("reference")} value={r.reference} maxLength={120} disabled={r.notApplicable} onChange={(e) => patch(r.id, { reference: e.target.value })} />
                        </Field>
                        <Field label="Issued by" htmlFor={fid("authority")}>
                          <Input id={fid("authority")} value={r.issuingAuthority} maxLength={160} disabled={r.notApplicable} onChange={(e) => patch(r.id, { issuingAuthority: e.target.value })} />
                        </Field>
                        {t.expires !== false && (
                          <Field label="Expiry date" htmlFor={fid("expires")} required={t.expires === true} hint={t.expires === null ? "Give the date, if it has one" : undefined} error={errorText(f("expiresOn"))}>
                            <Input id={fid("expires")} type="date" value={r.expiresOn} disabled={r.notApplicable} onChange={(e) => patch(r.id, { expiresOn: e.target.value })} />
                          </Field>
                        )}
                        {t.recordsRate && (
                          <Field label="Rate" htmlFor={fid("rate")} required hint="Per cent, 0 to 100" error={errorText(f("ratePercent"))}>
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
                          {r.files.length > 0 && (
                            <ul className="mb-2 flex flex-col gap-1.5">
                              {r.files.map((file) => (
                                <li key={file.versionId} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                                  <a className="min-w-0 break-all font-medium text-brand-700 hover:underline" href={`${SUPPLIER_REGISTRATION_GETS.file}?id=${encodeURIComponent(file.versionId)}&t=${encodeURIComponent(token ?? "")}`}>
                                    {file.name}
                                  </a>
                                  <span className="text-ink-3">{file.size}</span>
                                  <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip>
                                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => withdraw(r, file)} aria-label={`Withdraw ${file.name}`}>
                                    Withdraw
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <Field label={r.files.length ? "Replace or add a file" : "File"} htmlFor={fid("file")} hint={acceptNote ?? undefined} error={errorText(f("file"))}>
                            <FileInput
                              id={fid("file")}
                              accept="application/pdf,image/png,image/jpeg,image/tiff"
                              disabled={!!uploadClosed || busy || !token}
                              chooseLabel={r.files.length ? "Add file" : "Choose file"}
                              upload={{
                                url: `${SUPPLIER_REGISTRATION_POSTS.upload}?kind=document`,
                                token,
                                fields: () => ({ version: String(current), ...(r.id.startsWith("new:") ? { typeId: t.id, title: r.title } : { documentId: r.id }) }),
                                onDone: (answer, file) => {
                                  if (typeof answer.version === "number") setVersion(answer.version);
                                  const rowId = typeof answer.rowId === "string" ? answer.rowId : r.id;
                                  const versionId = typeof answer.versionId === "string" ? answer.versionId : "";
                                  setRows((all) => all.map((x) => (x.id === r.id ? { ...x, id: rowId, files: [...x.files, { versionId, name: file.name, size: formatBytes(BigInt(file.size)) }] } : x)));
                                },
                                onRefused: (text, isStale) => {
                                  if (isStale) setMessage(text);
                                },
                              }}
                            />
                          </Field>
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
                    <Button size="sm" variant="secondary" onClick={() => setRows((all) => [...all, blankRow(t.id)])}>
                      {mine.length ? "Add another" : `Add ${t.name.toLowerCase()}`}
                    </Button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <StepFooter backHref={stepHref("company")} onSave={() => run(false)} onNext={() => run(true)} busy={busy} message={message} saved={saved} stale={stale} />
    </div>
  );
}
