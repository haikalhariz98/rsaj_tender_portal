"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { blankDocRow, clickedRowKey, DocumentsFields, startingDocRows, type DocRowValue, type DocTypeView, type FileView } from "@/components/registration/documents-fields";
import { SUPPLIER_REGISTRATION_GETS, SUPPLIER_REGISTRATION_POSTS } from "@/lib/auth/routes";
import { formatBytes } from "@/lib/documents/labels";

import { StepFooter, FaultSummary } from "./step-footer";
import { postJson, stepHref, useStepSave } from "./wizard-api";

/**
 * Step 2 of the registration (FR-VND-002): the compliance documents. One block per kind of document the procurement office asks for, each with what it is (the office's own words), whether it
 * is required, the reference and expiry, the rate where the document carries one, a "does not apply" tick where that is allowed, and its files. A kind the office lets the supplier lodge
 * several of ("Other") has an "Add another", each with a title. Every file is "Not scanned": nothing scans a file yet.
 *
 * Save draft keeps what is typed as it is. Next saves and then asks the step's rules, which come back as the words shown beside the fields.
 */

export type { DocTypeView, FileView } from "@/components/registration/documents-fields";

/// A row of the signed-in wizard: the shared fields, and the files uploaded to it.
export interface DocRowView extends DocRowValue {
  files: FileView[];
}

const blankRow = (typeId: string, id: string = clickedRowKey()): DocRowView => ({ ...blankDocRow(typeId, id), files: [] });
const hasContent = (r: DocRowView) => !!(r.title || r.reference || r.issuingAuthority || r.expiresOn || r.ratePercent || r.notApplicable);

export function DocumentsStep({ token, version, types, rows: initial, uploadClosed, acceptNote }: { token: string | null; version: number; types: DocTypeView[]; rows: DocRowView[]; uploadClosed: string | null; acceptNote: string | null }) {
  const router = useRouter();
  const { version: current, setVersion, busy, message, saved, faults, stale, save, setMessage } = useStepSave("documents", token, version);
  const [rows, setRows] = useState<DocRowView[]>(() => startingDocRows(types, initial, blankRow));

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
      <DocumentsFields
        types={types}
        rows={rows}
        onChange={setRows}
        faults={faults}
        newRow={(typeId) => blankRow(typeId)}
        onRemove={remove}
        uploadClosed={uploadClosed}
        acceptNote={acceptNote}
        accept="application/pdf,image/png,image/jpeg,image/tiff"
        busy={busy}
        filesOf={(r) => ({
          mode: "uploaded",
          files: r.files,
          hrefOf: (file) => `${SUPPLIER_REGISTRATION_GETS.file}?id=${encodeURIComponent(file.versionId)}&t=${encodeURIComponent(token ?? "")}`,
          withdraw: (file) => withdraw(r, file),
          canUpload: !!token,
          upload: {
            url: `${SUPPLIER_REGISTRATION_POSTS.upload}?kind=document`,
            token,
            fields: () => ({ version: String(current), ...(r.id.startsWith("new:") ? { typeId: r.typeId, title: r.title } : { documentId: r.id }) }),
            onDone: (answer, file) => {
              if (typeof answer.version === "number") setVersion(answer.version);
              const rowId = typeof answer.rowId === "string" ? answer.rowId : r.id;
              const versionId = typeof answer.versionId === "string" ? answer.versionId : "";
              setRows((all) => all.map((x) => (x.id === r.id ? { ...x, id: rowId, files: [...x.files, { versionId, name: file.name, size: formatBytes(BigInt(file.size)) }] } : x)));
            },
            onRefused: (text, isStale) => {
              if (isStale) setMessage(text);
            },
          },
        })}
      />
      <StepFooter backHref={stepHref("company")} onSave={() => run(false)} onNext={() => run(true)} busy={busy} message={message} saved={saved} stale={stale} />
    </div>
  );
}
