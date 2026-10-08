"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";

import { SpinnerIcon } from "@/components/icons";
import { RecordEditor, type FormState } from "@/components/record-editor";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Field, FileInput } from "@/components/ui/field";
import { LOGO_MAX_BYTES, LOGO_SUGGESTED_HEIGHT } from "@/lib/organisation/logo-limits";

import { removeLogo, uploadLogo } from "./actions";

export interface LogoInfo {
  sha: string;
  mediaType: string;
  sizeKb: number;
  width: number;
  height: number;
  uploadedOn: string;
}

export const IMAGE_TYPE = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP" } as Record<string, string>;

/**
 * The card every uploaded picture of the organisation is set from (the logo, the sign-in picture, the logo for dark backgrounds): a title, what is there now, and
 * a file field with its button.
 *
 * Upload is never disabled for want of a file. Pressed with none chosen, or with one over the limit, it says so beside the field and moves focus there; it is
 * unavailable only while an upload is in flight, and then keeps its label and draws a spinner. The size check here only saves sending a file the server would
 * refuse; the server repeats it.
 */
export function ImageUploadCard({
  title,
  subtitle,
  remove,
  current,
  field,
  action,
  submitLabel,
}: {
  title: string;
  subtitle: ReactNode;
  /// The header's action: usually the remove drawer, only when there is something to remove.
  remove?: ReactNode;
  /// What is set now, or the line that says nothing is.
  current: ReactNode;
  field: { name: string; label: string; hint: ReactNode; maxBytes: number; noun: string };
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [state, run, pending] = useActionState(action, { ok: false });
  const form = useRef<HTMLFormElement>(null);
  const [problem, setProblem] = useState<{ for: string; text: string } | null>(null);
  const checked = problem?.for === field.name ? problem.text : null;
  const error = checked ?? state.errors?.[field.name];

  const choose = (file: File | undefined) => {
    setProblem(file && file.size > field.maxBytes ? { for: field.name, text: `The ${field.noun} is ${Math.ceil(file.size / 1024)} KB. The limit is ${field.maxBytes / 1024} KB.` } : null);
  };

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} actions={remove} />
      <CardBody className="flex flex-col gap-5">
        {current}

        <form
          ref={form}
          action={run}
          onSubmit={(e) => {
            const input = form.current?.elements.namedItem(field.name) as HTMLInputElement | null;
            const file = input?.files?.[0];
            const refusal = pending ? "wait" : !file ? "Choose a file to upload." : file.size > field.maxBytes ? "wait" : null;
            if (!refusal) return;
            // Stops the action: nothing is sent.
            e.preventDefault();
            if (refusal !== "wait") setProblem({ for: field.name, text: refusal });
            if (!pending) input?.focus();
          }}
          className="flex flex-col gap-3"
        >
          <Field label={field.label} htmlFor={field.name} error={error} hint={field.hint}>
            {/* Keyed by the last answer: React empties the file input after an upload, and the pill's name must go with it. */}
            <FileInput key={state.message ?? String(state.ok)} id={field.name} name={field.name} accept="image/png,image/jpeg,image/webp" aria-invalid={!!error} onChange={(e) => choose(e.currentTarget.files?.[0])} />
          </Field>
          <div>
            <Button type="submit" variant="primary" size="sm" aria-disabled={pending || undefined} aria-busy={pending || undefined} className="aria-disabled:opacity-100!">
              {submitLabel}
              {pending && <SpinnerIcon size={14} />}
            </Button>
          </div>
          {state.ok && state.message && <Callout tone="ok">{state.message}</Callout>}
          {!state.ok && state.message && <Callout tone="err">{state.message}</Callout>}
        </form>
      </CardBody>
    </Card>
  );
}

/// The logo: shown as it will look on a light and a sunken background, replaced from a
/// file, removed with a reason. The limit is a technical one and is said as such.
export function LogoCard({ logo }: { logo: LogoInfo | null }) {
  const src = logo ? `/organisation/logo/${logo.sha}` : null;
  return (
    <ImageUploadCard
      title="Logo"
      subtitle={
        <>
          Replaces the product mark at the top left. The sign-in page draws it with a soft halo on its photograph; for the best result, add a white or light version under &ldquo;Sign-in page: logo for dark backgrounds&rdquo;, below.
        </>
      }
      remove={
        logo ? (
          <RecordEditor
            title="Remove the logo"
            description="The product mark is shown at the top left again. Reports and letters carry no logo until another is uploaded."
            fields={[]}
            action={removeLogo}
            destructive={{ reasonLabel: "Why is the logo being removed?" }}
            submitLabel="Remove logo"
            cancelLabel="Keep the logo"
            trigger={{ label: "Remove logo", className: buttonClass("ghost", "sm") }}
            size="sm"
          />
        ) : undefined
      }
      current={
        logo && src ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {(["bg-surface", "bg-sunken"] as const).map((bg) => (
              <div key={bg} className={`flex h-24 items-center justify-center rounded-2xl border border-line p-4 ${bg}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint */}
                <img src={src} alt={bg === "bg-surface" ? "The current logo" : ""} className="max-h-full max-w-full object-contain" />
              </div>
            ))}
            <p className="text-[12.5px] text-ink-3 sm:col-span-2">
              {IMAGE_TYPE[logo.mediaType] ?? "Image"}, {logo.width} × {logo.height} px, {logo.sizeKb} KB. Uploaded {logo.uploadedOn}.
            </p>
          </div>
        ) : (
          <p className="text-[13.5px] text-ink-3">No logo. The product mark is shown.</p>
        )
      }
      field={{
        name: "logo",
        label: logo ? "Replace the logo" : "Upload a logo",
        hint: `PNG, JPEG or WebP, up to ${LOGO_MAX_BYTES / 1024} KB (a technical limit). At least ${LOGO_SUGGESTED_HEIGHT} px tall is suggested, cropped close to the mark. SVG is not accepted.`,
        maxBytes: LOGO_MAX_BYTES,
        noun: "logo",
      }}
      action={uploadLogo}
      submitLabel={logo ? "Replace logo" : "Upload logo"}
    />
  );
}
