"use client";

import { useId, useState } from "react";

import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Checkbox, Field, FileInput, Input, Textarea } from "@/components/ui/field";
import { Option, Select } from "@/components/ui/select";
import { REGISTRATION_HINT } from "@/lib/portal/labels";
import type { FaultView } from "@/lib/portal/register/contract";
import { CREDITOR_FIELD_LABEL } from "@/lib/portal/registration/creditor";
import type { CreditorInput } from "@/lib/portal/registration/types";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";

import type { RowFiles } from "./documents-fields";
import { errorText, faultsAt, noteText } from "./faults";

/**
 * Step 4 of the registration (FR-VND-005), the e-payment form (the Creditor's Profile), as a controlled component: the beneficiary, the bank, the bank statement, and the GIRO authorisation,
 * which names the organisation. The details are SULIT. The GIRO text is the organisation's (English only) with its name filled in; while it is not set the step cannot be finished and says
 * which text is missing. The date is the server's.
 *
 * Shared by the signed-in wizard (the statement uploaded as chosen; the authorisation signed with the password at Submit) and the public form (ADR 0041: the statement held until Submit, and
 * the authorisation the applicant's tick, never called a signature). The page says which through `statement` and `words`.
 */

export interface GiroView {
  /// Null while the organisation has not written the text.
  text: { en: string; version: number; sha256: string } | null;
}

export interface ListOption {
  value: string;
  label: string;
}

/// What step 4 holds: the bank details, who authorises the GIRO payment, and the tick.
export interface EpaymentValue {
  creditor: CreditorInput;
  signatoryName: string;
  signatoryDesignation: string;
  giroConfirmed: boolean;
}

/// The words that differ between a signature (the signed-in wizard) and an applicant's tick (the public form).
export interface EpaymentWords {
  /// The label of the name of the person who authorises.
  signatory: string;
  /// When it is dated.
  dated: string;
  /// How it is signed, where it is. Null: not a signature.
  signed: string | null;
}

/// Why step 4 cannot be finished, where the bank lists are not set.
export const banksClosedWords = (banks: readonly unknown[], accountTypes: readonly unknown[]): string | null =>
  banks.length === 0 ? "Bank list not set. Tell the procurement office." : accountTypes.length === 0 ? "Account types not set. Tell the procurement office." : null;

export function EpaymentFields({
  value,
  onChange,
  banks,
  accountTypes,
  statement,
  uploadClosed,
  giro,
  giroVoided,
  acceptNote,
  accept,
  prefilled,
  faults,
  busy,
  words,
}: {
  value: EpaymentValue;
  onChange: (next: EpaymentValue) => void;
  banks: readonly ListOption[];
  accountTypes: readonly ListOption[];
  statement: RowFiles;
  uploadClosed: string | null;
  giro: GiroView;
  /// The box was ticked on wording that has since changed: the tick no longer counts, and the supplier is told why the box is empty.
  giroVoided: boolean;
  acceptNote: string | null;
  /// The media types the file picker offers. A hint to the picker only.
  accept: string;
  /// Which fields were filled in for the supplier from what it had already given: said under the field.
  prefilled: Partial<Record<keyof CreditorInput, string>>;
  faults: readonly FaultView[];
  busy: boolean;
  words: EpaymentWords;
}) {
  const base = useId();
  const [picks, setPicks] = useState(0);
  const c = value.creditor;
  const set = (k: keyof CreditorInput, v: string) => onChange({ ...value, creditor: { ...c, [k]: v } });
  const id = (k: string) => `${base}-${k}`;
  const err = (k: string) => errorText(faultsAt(faults, `creditor.${k}`));
  const note = (k: string) => noteText(faultsAt(faults, `creditor.${k}`));
  const text = (k: keyof CreditorInput, o: { required?: boolean; hint?: string; area?: boolean; type?: string; inputMode?: "tel" | "email" | "numeric" } = {}) => (
    <Field label={CREDITOR_FIELD_LABEL[k]} htmlFor={id(k)} required={o.required} hint={[o.hint, prefilled[k], note(k)].filter(Boolean).join(" ") || undefined} error={err(k)}>
      {o.area ? (
        <Textarea id={id(k)} value={c[k]} maxLength={1000} rows={3} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <Input id={id(k)} type={o.type} inputMode={o.inputMode} value={c[k]} maxLength={240} onChange={(e) => set(k, e.target.value)} />
      )}
    </Field>
  );

  return (
    <div>
      <section aria-labelledby={id("h-beneficiary")} className="rounded-2xl border border-line p-4 sm:p-5">
        <h3 id={id("h-beneficiary")} className="text-[14.5px] font-bold text-ink">
          Beneficiary
        </h3>
        <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {text("beneficiaryName", { required: true })}
          {text("beneficiaryIdentityNo", { required: true, hint: REGISTRATION_HINT.identityNo })}
          <div className="sm:col-span-2">{text("beneficiaryAddress", { required: true, area: true })}</div>
          {text("beneficiaryContactPerson", { required: true })}
          {text("beneficiaryTelephone", { required: true, type: "tel", inputMode: "tel" })}
          {text("beneficiaryEmail", { required: true, type: "email", inputMode: "email", hint: REGISTRATION_HINT.notEmailed })}
          {text("beneficiaryFax")}
          {text("beneficiaryTaxRegistrationNo")}
        </div>
      </section>

      <section aria-labelledby={id("h-bank")} className="mt-5 rounded-2xl border border-line p-4 sm:p-5">
        <h3 id={id("h-bank")} className="text-[14.5px] font-bold text-ink">
          Bank
        </h3>
        <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <Field label={CREDITOR_FIELD_LABEL.bankCode} htmlFor={id("bankCode")} required error={err("bankCode")}>
            <Select id={id("bankCode")} value={c.bankCode} onChange={(e) => set("bankCode", e.target.value)} placeholder="Choose a bank">
              <Option value="">Choose a bank</Option>
              {banks.map((b) => (
                <Option key={b.value} value={b.value}>
                  {b.label}
                </Option>
              ))}
            </Select>
          </Field>
          <Field label={CREDITOR_FIELD_LABEL.bankAccountTypeCode} htmlFor={id("bankAccountTypeCode")} required error={err("bankAccountTypeCode")}>
            <Select id={id("bankAccountTypeCode")} value={c.bankAccountTypeCode} onChange={(e) => set("bankAccountTypeCode", e.target.value)} placeholder="Choose an account type">
              <Option value="">Choose an account type</Option>
              {accountTypes.map((b) => (
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

        <div className="mt-3">
          <h4 className="text-[13.5px] font-semibold text-ink">Bank statement</h4>
          {statement.files.length > 0 && (
            <ul className="my-2 flex flex-col gap-1.5">
              {statement.mode === "uploaded"
                ? statement.files.map((f) => (
                    <li key={f.versionId} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                      <a className="min-w-0 break-all font-medium text-brand-700 hover:underline" href={statement.hrefOf(f)}>
                        {f.name}
                      </a>
                      <span className="text-ink-3">{f.size}</span>
                      <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => statement.withdraw(f)} aria-label={`Withdraw ${f.name}`}>
                        Withdraw
                      </Button>
                    </li>
                  ))
                : statement.files.map((f, k) => (
                    <li key={`${k}-${f.name}`} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                      <span className="min-w-0 break-all font-medium text-ink">{f.name}</span>
                      <span className="text-ink-3">{f.size}</span>
                      <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => statement.remove(k)} aria-label={`Remove ${f.name}`}>
                        Remove
                      </Button>
                    </li>
                  ))}
            </ul>
          )}
          {uploadClosed && (
            <Callout tone="warn" title="Uploads are closed" className="my-2">
              {uploadClosed}
            </Callout>
          )}
          {statement.mode === "uploaded" ? (
            <Field label={statement.files.length ? "Replace or add a statement" : "Statement"} htmlFor={id("statement")} required hint={acceptNote ?? undefined} error={err("statement")}>
              <FileInput id={id("statement")} accept={accept} disabled={!!uploadClosed || busy || !statement.canUpload} upload={statement.upload} />
            </Field>
          ) : (
            <Field label={statement.files.length ? "Add a statement" : "Statement"} htmlFor={id("statement")} required hint={acceptNote ?? undefined} error={err("statement")}>
              <FileInput
                key={picks}
                id={id("statement")}
                accept={accept}
                disabled={!!uploadClosed || busy}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (!file) return;
                  statement.add(file);
                  setPicks((n) => n + 1);
                }}
              />
            </Field>
          )}
        </div>
      </section>

      <section aria-labelledby={id("h-giro")} className="mt-5 rounded-2xl border border-line p-4 sm:p-5">
        <h3 id={id("h-giro")} className="text-[14.5px] font-bold text-ink">
          Authorisation to pay by GIRO
        </h3>
        {giro.text ? (
          <>
            <div className="mt-2 rounded-xl bg-sunken/60 p-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{giro.text.en}</div>
            <div className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <Field label={words.signatory} htmlFor={id("signatory")} required error={errorText(faultsAt(faults, "giro.signatoryName"))} hint={noteText(faultsAt(faults, "giro.signatoryName"))}>
                <Input id={id("signatory")} value={value.signatoryName} maxLength={160} onChange={(e) => onChange({ ...value, signatoryName: e.target.value })} />
              </Field>
              <Field label="Position" htmlFor={id("designation")} required error={errorText(faultsAt(faults, "giro.signatoryDesignation"))}>
                <Input id={id("designation")} value={value.signatoryDesignation} maxLength={120} onChange={(e) => onChange({ ...value, signatoryDesignation: e.target.value })} />
              </Field>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-3">{words.dated}</p>
            {giroVoided && !value.giroConfirmed && (
              <Callout tone="warn" className="mt-3" title="The wording changed after you ticked">
                Read it again and tick again.
              </Callout>
            )}
            <div className="mt-2">
              <Checkbox label="I have read this and I authorise it." checked={value.giroConfirmed} onChange={(e) => onChange({ ...value, giroConfirmed: e.target.checked })} />
              {errorText(faultsAt(faults, "giro.confirmed")) && <p className="mt-1 text-[12.5px] font-medium text-rose-600">{errorText(faultsAt(faults, "giro.confirmed"))}</p>}
            </div>
            {words.signed && <p className="mt-2 text-[12.5px] text-ink-3">{words.signed}</p>}
          </>
        ) : (
          <Callout tone="warn" className="mt-2" title="Authorisation text not set">
            Tell the procurement office.
          </Callout>
        )}
      </section>
    </div>
  );
}
