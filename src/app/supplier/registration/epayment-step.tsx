"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Checkbox, Field, FileInput, Input, Textarea } from "@/components/ui/field";
import { Option, Select } from "@/components/ui/select";
import { SUPPLIER_REGISTRATION_GETS, SUPPLIER_REGISTRATION_POSTS } from "@/lib/auth/routes";
import { formatBytes } from "@/lib/documents/labels";
import { CREDITOR_FIELD_LABEL } from "@/lib/portal/registration/creditor";
import type { CreditorInput } from "@/lib/portal/registration/types";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";

import { StepFooter, FaultSummary } from "./step-footer";
import { errorText, faultsAt, noteText, postJson, stepHref, useStepSave } from "./wizard-api";

/**
 * Step 4 of the registration (FR-VND-005): the e-payment form, the Creditor's Profile. The beneficiary, the bank, the bank statement, and the GIRO authorisation, which names the organisation. The
 * details are SULIT and are the supplier's own to see. The GIRO text is the organisation's (English, and Malay where it wrote one) with its name filled in; while it is not set the step
 * cannot be finished and says which text is missing. Signing happens when the registration is sent, with the password asked again; the date is the server's.
 */

export interface GiroView {
  /// Null while the organisation has not written the text.
  text: { en: string; ms: string; version: number; sha256: string } | null;
}

export interface ListOption {
  value: string;
  label: string;
}

export interface StatementFile {
  versionId: string;
  name: string;
  size: string;
}

export function EpaymentStep({
  token,
  version,
  creditor: initial,
  banks,
  accountTypes,
  statement: initialStatement,
  uploadClosed,
  giro,
  signatoryName: sn,
  signatoryDesignation: sd,
  giroConfirmed: gc,
  giroVoided,
  closedReason,
  acceptNote,
  prefilled,
}: {
  token: string | null;
  version: number;
  creditor: CreditorInput;
  banks: ListOption[];
  accountTypes: ListOption[];
  statement: StatementFile[];
  uploadClosed: string | null;
  giro: GiroView;
  signatoryName: string;
  signatoryDesignation: string;
  giroConfirmed: boolean;
  /// The box was ticked on wording that has since changed: the tick no longer counts, and the supplier is told why the box is empty.
  giroVoided: boolean;
  closedReason: string | null;
  acceptNote: string | null;
  /// Which fields were filled in for the supplier from what it had already given (the tax number from its tax certificate, the email from the company's): said under the field.
  prefilled: Partial<Record<keyof CreditorInput, string>>;
}) {
  const router = useRouter();
  const base = useId();
  const { version: current, setVersion, busy, message, saved, faults, stale, save, setMessage } = useStepSave("epayment", token, version);
  const [c, setC] = useState<CreditorInput>(initial);
  const [statement, setStatement] = useState<StatementFile[]>(initialStatement);
  const [name, setName] = useState(sn);
  const [designation, setDesignation] = useState(sd);
  const [confirmed, setConfirmed] = useState(gc);
  const set = (k: keyof CreditorInput, v: string) => setC((x) => ({ ...x, [k]: v }));
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

  async function run(next: boolean) {
    const done = await save({ step: "epayment", creditor: c, signatoryName: name, signatoryDesignation: designation, giroConfirmed: confirmed, ...(giro.text ? { giroTextSha256: giro.text.sha256 } : {}) }, { next });
    if (done.ok && done.advance) router.push(stepHref("review"));
  }

  async function withdraw(file: StatementFile) {
    const { status, body } = await postJson(SUPPLIER_REGISTRATION_POSTS.withdrawFile, token, { version: current, versionId: file.versionId });
    if (status === 200 && body?.ok) {
      if (typeof body.version === "number") setVersion(body.version);
      setStatement((all) => all.filter((f) => f.versionId !== file.versionId));
    } else setMessage(body?.message ?? "That did not work and nothing was changed. Try again in a moment.");
  }

  const banksClosed = banks.length === 0 ? "The procurement office has not set up the list of banks, so the bank details cannot be finished yet. Tell the procurement office." : accountTypes.length === 0 ? "The procurement office has not set up the list of account types, so the bank details cannot be finished yet. Tell the procurement office." : null;
  const stopped = closedReason ?? banksClosed;

  return (
    <div>
      <FaultSummary faults={faults} />
      <p className="mb-4 text-[13px] text-ink-3">These details are confidential. The procurement office checks them against your bank statement before any payment is made to you.</p>

      <section aria-labelledby={id("h-beneficiary")} className="rounded-2xl border border-line p-4 sm:p-5">
        <h3 id={id("h-beneficiary")} className="text-[14.5px] font-bold text-ink">
          Beneficiary
        </h3>
        <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {text("beneficiaryName", { required: true })}
          {text("beneficiaryIdentityNo", { required: true, hint: "Your company number, or an identity card number for a sole proprietor." })}
          <div className="sm:col-span-2">{text("beneficiaryAddress", { required: true, area: true })}</div>
          {text("beneficiaryContactPerson", { required: true })}
          {text("beneficiaryTelephone", { required: true, type: "tel", inputMode: "tel" })}
          {text("beneficiaryEmail", { required: true, type: "email", inputMode: "email", hint: "Nothing is e-mailed from the portal." })}
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
          {statement.length > 0 && (
            <ul className="my-2 flex flex-col gap-1.5">
              {statement.map((f) => (
                <li key={f.versionId} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <a className="min-w-0 break-all font-medium text-brand-700 hover:underline" href={`${SUPPLIER_REGISTRATION_GETS.file}?id=${encodeURIComponent(f.versionId)}&t=${encodeURIComponent(token ?? "")}`}>
                    {f.name}
                  </a>
                  <span className="text-ink-3">{f.size}</span>
                  <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => withdraw(f)} aria-label={`Withdraw ${f.name}`}>
                    Withdraw
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
          <Field label={statement.length ? "Replace or add a statement" : "Statement"} htmlFor={id("statement")} required hint={acceptNote ?? undefined} error={err("statement")}>
            <FileInput
              id={id("statement")}
              accept="application/pdf,image/png,image/jpeg,image/tiff"
              disabled={!!uploadClosed || busy || !token}
              upload={{
                url: `${SUPPLIER_REGISTRATION_POSTS.upload}?kind=statement`,
                token,
                fields: () => ({ version: String(current) }),
                onDone: (answer, file) => {
                  if (typeof answer.version === "number") setVersion(answer.version);
                  setStatement((all) => [...all, { versionId: typeof answer.versionId === "string" ? answer.versionId : "", name: file.name, size: formatBytes(BigInt(file.size)) }]);
                },
                onRefused: (t, isStale) => {
                  if (isStale) setMessage(t);
                },
              }}
            />
          </Field>
        </div>
      </section>

      <section aria-labelledby={id("h-giro")} className="mt-5 rounded-2xl border border-line p-4 sm:p-5">
        <h3 id={id("h-giro")} className="text-[14.5px] font-bold text-ink">
          Authorisation to pay by GIRO
        </h3>
        {giro.text ? (
          <>
            <div className="mt-2 rounded-xl bg-sunken/60 p-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{giro.text.en}</div>
            {giro.text.ms && <div lang="ms" className="mt-2 rounded-xl bg-sunken/60 p-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{giro.text.ms}</div>}
            <div className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <Field label="Name of the person who signs" htmlFor={id("signatory")} required error={errorText(faultsAt(faults, "giro.signatoryName"))} hint={noteText(faultsAt(faults, "giro.signatoryName"))}>
                <Input id={id("signatory")} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Position" htmlFor={id("designation")} required error={errorText(faultsAt(faults, "giro.signatoryDesignation"))}>
                <Input id={id("designation")} value={designation} maxLength={120} onChange={(e) => setDesignation(e.target.value)} />
              </Field>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-3">Date: signed on submission, on the procurement office&apos;s day. You do not type it.</p>
            {giroVoided && !confirmed && (
              <Callout tone="warn" className="mt-3" title="The wording changed after you ticked the box">
                The procurement office changed this authorisation after you ticked it. Read it again and tick the box again.
              </Callout>
            )}
            <div className="mt-2">
              <Checkbox label="I have read this and I authorise it." checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              {errorText(faultsAt(faults, "giro.confirmed")) && <p className="mt-1 text-[12.5px] font-medium text-rose-600">{errorText(faultsAt(faults, "giro.confirmed"))}</p>}
            </div>
            <p className="mt-2 text-[12.5px] text-ink-3">It is signed with your password when you send the registration in the last step.</p>
          </>
        ) : (
          <Callout tone="warn" className="mt-2" title="The GIRO authorisation text is not set">
            The procurement office has to write it before you can finish this step. Tell the procurement office.
          </Callout>
        )}
      </section>

      <StepFooter backHref={stepHref("codes")} onSave={() => run(false)} onNext={() => run(true)} busy={busy} message={message} saved={saved} stale={stale} closedReason={stopped} />
    </div>
  );
}
