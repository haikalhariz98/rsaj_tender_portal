"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { banksClosedWords, EpaymentFields, type EpaymentValue, type GiroView, type ListOption } from "@/components/registration/epayment-fields";
import { SUPPLIER_REGISTRATION_GETS, SUPPLIER_REGISTRATION_POSTS } from "@/lib/auth/routes";
import { formatBytes } from "@/lib/documents/labels";
import type { CreditorInput } from "@/lib/portal/registration/types";

import { StepFooter, FaultSummary } from "./step-footer";
import { postJson, stepHref, useStepSave } from "./wizard-api";

/**
 * Step 4 of the registration (FR-VND-005): the e-payment form, the Creditor's Profile, drawn by the shared `EpaymentFields`. The details are SULIT and are the supplier's own to see. The
 * statement is uploaded as it is chosen; signing happens when the registration is sent, with the password asked again; the date is the server's.
 */

export type { GiroView, ListOption } from "@/components/registration/epayment-fields";

export interface StatementFile {
  versionId: string;
  name: string;
  size: string;
}

/// A signature, made with the password at Submit.
const SIGNED_IN_WORDS = { signatory: "Name of the person who signs", dated: "Dated the day you send.", signed: "Signed with your password when you send." };

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
  const { version: current, setVersion, busy, message, saved, faults, stale, save, setMessage } = useStepSave("epayment", token, version);
  const [value, setValue] = useState<EpaymentValue>({ creditor: initial, signatoryName: sn, signatoryDesignation: sd, giroConfirmed: gc });
  const [statement, setStatement] = useState<StatementFile[]>(initialStatement);

  async function run(next: boolean) {
    const done = await save({ step: "epayment", creditor: value.creditor, signatoryName: value.signatoryName, signatoryDesignation: value.signatoryDesignation, giroConfirmed: value.giroConfirmed, ...(giro.text ? { giroTextSha256: giro.text.sha256 } : {}) }, { next });
    if (done.ok && done.advance) router.push(stepHref("review"));
  }

  async function withdraw(file: StatementFile) {
    const { status, body } = await postJson(SUPPLIER_REGISTRATION_POSTS.withdrawFile, token, { version: current, versionId: file.versionId });
    if (status === 200 && body?.ok) {
      if (typeof body.version === "number") setVersion(body.version);
      setStatement((all) => all.filter((f) => f.versionId !== file.versionId));
    } else setMessage(body?.message ?? "Not changed. Try again in a moment.");
  }

  const stopped = closedReason ?? banksClosedWords(banks, accountTypes);

  return (
    <div>
      <FaultSummary faults={faults} />
      <EpaymentFields
        value={value}
        onChange={setValue}
        banks={banks}
        accountTypes={accountTypes}
        uploadClosed={uploadClosed}
        giro={giro}
        giroVoided={giroVoided}
        acceptNote={acceptNote}
        accept="application/pdf,image/png,image/jpeg,image/tiff"
        prefilled={prefilled}
        faults={faults}
        busy={busy}
        words={SIGNED_IN_WORDS}
        statement={{
          mode: "uploaded",
          files: statement,
          hrefOf: (f) => `${SUPPLIER_REGISTRATION_GETS.file}?id=${encodeURIComponent(f.versionId)}&t=${encodeURIComponent(token ?? "")}`,
          withdraw,
          canUpload: !!token,
          upload: {
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
          },
        }}
      />
      <StepFooter backHref={stepHref("codes")} onSave={() => run(false)} onNext={() => run(true)} busy={busy} message={message} saved={saved} stale={stale} closedReason={stopped} />
    </div>
  );
}
