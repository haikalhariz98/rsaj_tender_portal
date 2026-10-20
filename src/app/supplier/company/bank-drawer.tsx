"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { LockIcon } from "@/components/icons";
import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";
import { Checkbox, Field, FileInput, Input, Textarea } from "@/components/ui/field";
import { Option, Select } from "@/components/ui/select";
import { SUPPLIER_COMPANY_POSTS } from "@/lib/auth/routes";
import { CREDITOR_FIELD_LABEL } from "@/lib/portal/registration/creditor";
import { CREDITOR_FIELDS, type CreditorInput } from "@/lib/portal/registration/types";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";

import { answerWords, at, postForm, type FormAnswer } from "./post-form";

/**
 * A registered supplier changes its bank details (Phase 4c). The beneficiary, the bank, the bank statement and the GIRO authorisation, which names the organisation, go in ONE post with
 * the password, which is asked again because the change is signed: a stolen sign-in must not be able to redirect payment. The change is a new version. The version an officer checked stays in
 * force, and payments go to it, until an officer has checked this one. The details are SULIT and the supplier's own to see; nothing here is kept in the browser beyond the form.
 */

export interface ListOption {
  value: string;
  label: string;
}

export interface BankDrawerProps {
  token: string | null;
  /// The details now on record (the version in force, or the one waiting), to start from. Blank where none was ever sent.
  initial: CreditorInput;
  banks: ListOption[];
  accountTypes: ListOption[];
  /// Null while the organisation has not written the authorisation.
  giro: { id: string; text: string; sha256: string } | null;
  signatoryName: string;
  signatoryDesignation: string;
  /// Why a change cannot be made now, in words (a change waiting, settings not set).
  blockedReason: string | null;
  accept: string | null;
  buttonLabel: string;
}

export function BankDrawer(p: BankDrawerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const heading = useId();
  const base = useId();
  const [c, setC] = useState<CreditorInput>(p.initial);
  const [name, setName] = useState(p.signatoryName);
  const [designation, setDesignation] = useState(p.signatoryDesignation);
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [answer, setAnswer] = useState<{ status: number; body: FormAnswer | null } | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const faults = answer?.body?.faults;
  const id = (k: string) => `${base}-${k}`;
  const set = (k: keyof CreditorInput, v: string) => setC((x) => ({ ...x, [k]: v }));
  const err = (k: string) => at(faults, `creditor.${k}`);
  const text = (k: keyof CreditorInput, o: { required?: boolean; hint?: string; area?: boolean; type?: string; inputMode?: "tel" | "email" | "numeric" } = {}) => (
    <Field label={CREDITOR_FIELD_LABEL[k]} htmlFor={id(k)} required={o.required} hint={o.hint} error={err(k)}>
      {o.area ? <Textarea id={id(k)} value={c[k]} maxLength={1000} rows={3} onChange={(e) => set(k, e.target.value)} /> : <Input id={id(k)} type={o.type} inputMode={o.inputMode} value={c[k]} maxLength={240} onChange={(e) => set(k, e.target.value)} />}
    </Field>
  );

  async function send() {
    if (!file) {
      setAnswer({ status: 422, body: { ok: false, faults: [{ field: "creditor.statement", level: "block", message: "Upload a bank statement." }] } });
      return;
    }
    setBusy(true);
    setAnswer(null);
    const form = new FormData();
    form.append("file", file);
    for (const k of CREDITOR_FIELDS) form.append(k, c[k]);
    if (p.giro) {
      form.append("giroTextVersionId", p.giro.id);
      form.append("giroTextSha256", p.giro.sha256);
    }
    form.append("signatoryName", name);
    form.append("signatoryDesignation", designation);
    form.append("giroConfirmed", confirmed ? "true" : "false");
    form.append("password", password);
    const res = await postForm(SUPPLIER_COMPANY_POSTS.bank, p.token, form, (l, t) => setProgress([l, t]));
    setBusy(false);
    setPassword("");
    if (res.status === 201 && res.body?.ok) {
      setSent(typeof res.body.version === "number" ? res.body.version : 0);
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
          variant="primary"
          size="sm"
          icon={<LockIcon size={15} />}
          onClick={() => {
            setSent(null);
            setAnswer(null);
            setConfirmed(false);
            setOpen(true);
          }}
          aria-haspopup="dialog"
        >
          {p.buttonLabel}
        </Button>
      )}
      {open && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("lg")}>
            <span id={heading} className="sr-only">
              Change your bank details
            </span>
            <DrawerHeader icon={<LockIcon size={17} />} title="Change your bank details" subtitle="Payments stay on the checked details until an officer checks these." onClose={() => !busy && setOpen(false)} />
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
              {sent != null ? (
                <Callout tone="ok" title="Sent for checking">
                  Not emailed. The result shows on this page.
                </Callout>
              ) : (
                <div className="flex flex-col gap-1">
                  {answer && !answer.body?.faults?.length && (
                    <Callout tone="err" className="mb-2">
                      {answerWords(answer.status, answer.body)}
                    </Callout>
                  )}
                  {faults && faults.some((f) => f.level === "block" && f.field == null) && (
                    <Callout tone="err" className="mb-2">
                      {faults.filter((f) => f.level === "block" && f.field == null).map((f) => f.message).join(" ")}
                    </Callout>
                  )}
                  <section aria-labelledby={id("h-b")} className="rounded-2xl border border-line p-4">
                    <h3 id={id("h-b")} className="text-[14.5px] font-bold text-ink">
                      Beneficiary
                    </h3>
                    <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {text("beneficiaryName", { required: true })}
                      {text("beneficiaryIdentityNo", { required: true, hint: "Company or identity card number" })}
                      <div className="sm:col-span-2">{text("beneficiaryAddress", { required: true, area: true })}</div>
                      {text("beneficiaryContactPerson", { required: true })}
                      {text("beneficiaryTelephone", { required: true, type: "tel", inputMode: "tel" })}
                      {text("beneficiaryEmail", { required: true, type: "email", inputMode: "email" })}
                      {text("beneficiaryFax")}
                      {text("beneficiaryTaxRegistrationNo")}
                    </div>
                  </section>

                  <section aria-labelledby={id("h-k")} className="mt-4 rounded-2xl border border-line p-4">
                    <h3 id={id("h-k")} className="text-[14.5px] font-bold text-ink">
                      Bank
                    </h3>
                    <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      <Field label={CREDITOR_FIELD_LABEL.bankCode} htmlFor={id("bankCode")} required error={err("bankCode")}>
                        <Select id={id("bankCode")} value={c.bankCode} onChange={(e) => set("bankCode", e.target.value)} placeholder="Choose a bank">
                          <Option value="">Choose a bank</Option>
                          {p.banks.map((b) => (
                            <Option key={b.value} value={b.value}>
                              {b.label}
                            </Option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={CREDITOR_FIELD_LABEL.bankAccountTypeCode} htmlFor={id("bankAccountTypeCode")} required error={err("bankAccountTypeCode")}>
                        <Select id={id("bankAccountTypeCode")} value={c.bankAccountTypeCode} onChange={(e) => set("bankAccountTypeCode", e.target.value)} placeholder="Choose an account type">
                          <Option value="">Choose an account type</Option>
                          {p.accountTypes.map((b) => (
                            <Option key={b.value} value={b.value}>
                              {b.label}
                            </Option>
                          ))}
                        </Select>
                      </Field>
                      {text("bankAccountNo", { required: true, inputMode: "numeric" })}
                      {text("bankSwiftCode")}
                      <div className="sm:col-span-2">{text("bankAddress", { required: true, area: true })}</div>
                    </div>
                    <div className="mt-2">
                      <Field label="Bank statement" htmlFor={id("statement")} required hint={p.accept ?? "Bearing the company stamp."} error={at(faults, "creditor.statement")}>
                        <FileInput id={id("statement")} accept="application/pdf,image/png,image/jpeg,image/tiff" disabled={busy} onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
                      </Field>
                      <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
                        <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip>
                      </p>
                    </div>
                  </section>

                  <section aria-labelledby={id("h-g")} className="mt-4 rounded-2xl border border-line p-4">
                    <h3 id={id("h-g")} className="text-[14.5px] font-bold text-ink">
                      Authorisation to pay by GIRO
                    </h3>
                    {p.giro ? (
                      <>
                        <div className="mt-2 rounded-xl bg-sunken/60 p-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{p.giro.text}</div>
                        <div className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                          <Field label="Name of the person who signs" htmlFor={id("signatory")} required error={at(faults, "giro.signatoryName")}>
                            <Input id={id("signatory")} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
                          </Field>
                          <Field label="Position" htmlFor={id("designation")} required error={at(faults, "giro.signatoryDesignation")}>
                            <Input id={id("designation")} value={designation} maxLength={120} onChange={(e) => setDesignation(e.target.value)} />
                          </Field>
                        </div>
                        <p className="mt-1 text-[12.5px] text-ink-3">Dated the day you send.</p>
                        <div className="mt-2">
                          <Checkbox label="I have read this and I authorise it." checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                          {at(faults, "giro.confirmed") && <p className="mt-1 text-[12.5px] font-medium text-rose-600">{at(faults, "giro.confirmed")}</p>}
                          {at(faults, "giro") && <p className="mt-1 text-[12.5px] font-medium text-rose-600">{at(faults, "giro")}</p>}
                        </div>
                      </>
                    ) : (
                      <Callout tone="warn" className="mt-2" title="Authorisation text not set">
                        Tell the procurement office.
                      </Callout>
                    )}
                  </section>

                  <div className="mt-4">
                    <Field label="Your password" htmlFor={id("password")} required hint="Signs the change." error={at(faults, "password")}>
                      <Input id={id("password")} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </Field>
                  </div>
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
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              {sent != null ? (
                <Button variant="primary" onClick={() => setOpen(false)}>
                  Close
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={send} disabled={busy || !p.token || !p.giro}>
                    {busy ? "Sending…" : "Sign and send"}
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
