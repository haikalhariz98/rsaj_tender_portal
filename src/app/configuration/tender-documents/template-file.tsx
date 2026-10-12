"use client";

import { useCallback } from "react";

import { stage, STORED_NOT_FILED, useStagedRef } from "@/components/attachments/upload-actions";
import { EMPTY_FORM_STATE, RecordEditor, type Field, type SaveAction } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { STAGED_FOR_TEMPLATE_FILE } from "@/lib/documents/staged-for";
import type { UploadView } from "@/lib/documents/views";

import { saveTenderPartTemplateFile } from "./actions";

const ghost = buttonClass("ghost", "sm");
const hidden = (name: string): Field => ({ kind: "hidden", name });

/**
 * The template file of a configured part (SR-11, ruling 14): the file an officer downloads from the part's line on an exercise's Tender documents, to fill in and upload back
 * (the bill of quantities' prescribed Excel, say). It is a file in the document store, staged through the same upload route as any file (class, classification, fingerprint),
 * and the change is proposed here and issued by a second person, who files it. Like a delegation's scan, the file goes to the route first and only its version goes in the proposal.
 */
export function TemplateFileDrawer({ id, label, current, upload }: { id: string; label: string; current: string | null; upload: UploadView }) {
  const stagedRef = useStagedRef();
  const save = useCallback<SaveAction>(
    async (_prev, data) => {
      const next = new FormData();
      for (const [k, v] of data.entries()) if (k !== "file" && k !== "documentClassId") next.append(k, v);
      const up = new FormData();
      for (const k of ["file", "documentClassId"]) up.set(k, data.get(k) ?? "");
      up.set("title", `Template file: ${label}`);
      const s = await stage(up, stagedRef, { stagedFor: STAGED_FOR_TEMPLATE_FILE });
      if (!s.ok) return s.state;
      next.set("versionId", s.versionId);
      const r = await saveTenderPartTemplateFile(EMPTY_FORM_STATE, next);
      if (r.ok) stagedRef.current = null;
      else return { ...r, message: [r.message, STORED_NOT_FILED.replace("attaching", "saving")].filter(Boolean).join(" ") };
      return r;
    },
    [label, stagedRef],
  );
  return (
    <RecordEditor
      title={`Template file for ${label}`}
      description="The file an officer downloads from this part's line on an exercise's tender documents, fills in, and uploads back. A change to it is proposed here and a second person issues it. Choosing another file replaces it; the earlier one stays in the document store."
      fields={[
        hidden("id"),
        ...(current ? ([{ kind: "note", text: `Now: ${current}.` }] as Field[]) : ([{ kind: "note", text: "No template file is set for this part. Its line says \"No template set\"." }] as Field[])),
        ...(upload.refusals.length ? ([{ kind: "note", text: `Uploads are refused until this is set. ${upload.refusals.join(" ")}` }] as Field[]) : []),
        {
          kind: "file",
          name: "file",
          label: "Template file",
          required: true,
          accept: upload.accept || undefined,
          hint: [upload.allowedTypes.length ? `Allowed: ${upload.allowedTypes.join(", ")}.` : null, upload.capText ? `${upload.capText}.` : null, "Its type is read from the file itself, not from its name."].filter(Boolean).join(" "),
        },
        { kind: "select", name: "documentClassId", label: "Class of the file", required: true, placeholder: "Choose a class", options: upload.classes, hint: "A class that sets a classification: an unclassified file is never served." },
      ]}
      values={{ id }}
      sections={<Callout tone="info">The file is kept with its fingerprint. A line shows its name and downloads exactly these bytes.</Callout>}
      action={save}
      submitLabel="Propose this file"
      trigger={{ label: current ? "Change template file" : "Set template file", className: ghost, ariaLabel: `${current ? "Change" : "Set"} the template file for ${label}` }}
      size="md"
    />
  );
}

/** Remove the template file: the part's line then says "No template set". Proposed like any change to configuration. */
export function RemoveTemplateFileDrawer({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Remove the template file of ${label}`}
      description={"Its line on an exercise's tender documents says \"No template set\" again. Packs already started read the configuration as it stands. The file stays in the document store."}
      fields={[hidden("id"), hidden("remove")]}
      values={{ id, remove: "yes" }}
      destructive={{ reasonLabel: "Why it is removed" }}
      cancelLabel="Keep the file"
      action={saveTenderPartTemplateFile}
      submitLabel="Remove the file"
      trigger={{ label: "Remove template file", className: buttonClass("ghost", "sm"), ariaLabel: `Remove the template file of ${label}` }}
      size="sm"
    />
  );
}
