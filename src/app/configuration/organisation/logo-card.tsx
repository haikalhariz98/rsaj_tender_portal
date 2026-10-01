"use client";

import { useActionState, useState } from "react";

import { RecordEditor } from "@/components/record-editor";
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

const TYPE = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP" } as Record<string, string>;

/// The logo: shown as it will look on a light and a sunken background, replaced from a
/// file, removed with a reason. The limit is a technical one and is said as such.
export function LogoCard({ logo }: { logo: LogoInfo | null }) {
  const [state, action, pending] = useActionState(uploadLogo, { ok: false });
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [chosen, setChosen] = useState(false);
  const error = tooBig ?? state.errors?.logo;
  const src = logo ? `/organisation/logo/${logo.sha}` : null;

  return (
    <Card>
      <CardHeader
        title="Logo"
        subtitle="Replaces the product mark at the top left."
        actions={
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
      />
      <CardBody className="flex flex-col gap-5">
        {logo && src ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {(["bg-surface", "bg-sunken"] as const).map((bg) => (
              <div key={bg} className={`flex h-24 items-center justify-center rounded-2xl border border-line p-4 ${bg}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint */}
                <img src={src} alt={bg === "bg-surface" ? "The current logo" : ""} className="max-h-full max-w-full object-contain" />
              </div>
            ))}
            <p className="text-[12.5px] text-ink-3 sm:col-span-2">
              {TYPE[logo.mediaType] ?? "Image"}, {logo.width} × {logo.height} px, {logo.sizeKb} KB. Uploaded {logo.uploadedOn}.
            </p>
          </div>
        ) : (
          <p className="text-[13.5px] text-ink-3">No logo. The product mark is shown.</p>
        )}

        <form action={action} className="flex flex-col gap-3">
          <Field
            label={logo ? "Replace the logo" : "Upload a logo"}
            htmlFor="logo"
            error={error}
            hint={`PNG, JPEG or WebP, up to ${LOGO_MAX_BYTES / 1024} KB (a technical limit). At least ${LOGO_SUGGESTED_HEIGHT} px tall is suggested. SVG is not accepted.`}
          >
            <FileInput
              id="logo"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              aria-invalid={!!error}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                setChosen(!!f);
                setTooBig(f && f.size > LOGO_MAX_BYTES ? `The logo is ${Math.ceil(f.size / 1024)} KB. The limit is ${LOGO_MAX_BYTES / 1024} KB.` : null);
              }}
            />
          </Field>
          <div>
            <Button type="submit" variant="primary" size="sm" disabled={pending || !!tooBig || !chosen}>
              {pending ? "Uploading…" : logo ? "Replace logo" : "Upload logo"}
            </Button>
          </div>
          {state.ok && state.message && <Callout tone="ok">{state.message}</Callout>}
          {!state.ok && state.message && <Callout tone="err">{state.message}</Callout>}
        </form>
      </CardBody>
    </Card>
  );
}
