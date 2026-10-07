"use client";

import { useActionState, useState } from "react";

import { RecordEditor, type Field } from "@/components/record-editor";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Field as FormField, FileInput } from "@/components/ui/field";
import { KeyValues } from "@/components/ui/stat";
import { SIGN_IN_IMAGE_MAX_BYTES, SIGN_IN_IMAGE_SUGGESTED_WIDTH } from "@/lib/organisation/logo-limits";
import { SIGN_IN_LABEL, type SignInField, type SignInPageSettings } from "@/lib/organisation/sign-in-page";

import { removeSignInImage, saveSignInPage, uploadSignInImage } from "./sign-in-actions";

export interface SignInImageInfo {
  sha: string;
  mediaType: string;
  sizeKb: number;
  width: number;
  height: number;
  uploadedOn: string;
}

const TYPE = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP" } as Record<string, string>;

const NOT_SET = <span className="text-ink-4">Not set</span>;

/// The sign-in page: its picture and its words, each the organisation's own and each optional. Unset is said, never shown as blank.
export function SignInPageCards({ image, settings }: { image: SignInImageInfo | null; settings: SignInPageSettings }) {
  return (
    <>
      <SignInWordsCard settings={settings} />
      <SignInImageCard image={image} />
    </>
  );
}

const WORDS: { field: SignInField; hint: string; textarea?: boolean }[] = [
  { field: "portalName", hint: "The small spaced line over the headline, and the title of the sign-in card." },
  { field: "headline", hint: "The large line on the picture." },
  { field: "supportingText", hint: "One sentence under the headline.", textarea: true },
  { field: "highlight1", hint: "A short phrase with a round tick beside it." },
  { field: "highlight2", hint: "Left blank, it is not shown." },
  { field: "highlight3", hint: "Left blank, it is not shown." },
  { field: "tagline", hint: "A line at the bottom of the picture." },
  { field: "privacyUrl", hint: "A web address, starting with https://. Left blank, the link is not shown." },
  { field: "termsUrl", hint: "A web address, starting with https://. Left blank, the link is not shown." },
  { field: "helpDeskUrl", hint: "A web address, starting with https://. Left blank, the link is not shown." },
];

function SignInWordsCard({ settings }: { settings: SignInPageSettings }) {
  const fields: Field[] = WORDS.map((w) =>
    w.textarea ? { kind: "textarea", name: w.field, label: SIGN_IN_LABEL[w.field], hint: w.hint } : { kind: "text", name: w.field, label: SIGN_IN_LABEL[w.field], hint: w.hint },
  );
  const anySet = Object.values(settings).some((v) => v != null);
  return (
    <Card>
      <CardHeader
        title="Sign-in page: words and links"
        subtitle="What people read beside the sign-in form. Nothing is filled in for you; anything left blank is not shown."
        actions={
          <RecordEditor
            title="Edit the sign-in page"
            description="These show on the sign-in page, which anyone can open. Do not put anything here that is not for the public."
            fields={fields}
            values={{ ...settings }}
            action={saveSignInPage}
            trigger={{ label: "Edit words", className: buttonClass("secondary", "sm") }}
            size="lg"
            columns={2}
          />
        }
      />
      <CardBody className="flex flex-col gap-4">
        {!anySet && <Callout tone="info">No words are set, so the sign-in page shows the form alone, with the neutral title &ldquo;Sign in&rdquo;.</Callout>}
        <KeyValues columns={2} items={WORDS.map((w) => ({ label: SIGN_IN_LABEL[w.field], value: settings[w.field] ?? NOT_SET }))} />
      </CardBody>
    </Card>
  );
}

function SignInImageCard({ image }: { image: SignInImageInfo | null }) {
  const [state, action, pending] = useActionState(uploadSignInImage, { ok: false });
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [chosen, setChosen] = useState(false);
  const error = tooBig ?? state.errors?.signInImage;
  const src = image ? `/sign-in/image/${image.sha}` : null;

  return (
    <Card>
      <CardHeader
        title="Sign-in page: picture"
        subtitle="The picture on the left of the sign-in page. The organisation's logo, above, is drawn over it."
        actions={
          image ? (
            <RecordEditor
              title="Remove the sign-in picture"
              description="The left side of the sign-in page is drawn in the product's own colours until another picture is uploaded."
              fields={[]}
              action={removeSignInImage}
              destructive={{ reasonLabel: "Why is the picture being removed?" }}
              submitLabel="Remove picture"
              cancelLabel="Keep the picture"
              trigger={{ label: "Remove picture", className: buttonClass("ghost", "sm") }}
              size="sm"
            />
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-5">
        {image && src ? (
          <div className="flex flex-col gap-3">
            <div className="max-w-xl overflow-hidden rounded-2xl border border-line bg-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint */}
              <img src={src} alt="The current sign-in picture" className="aspect-video w-full object-cover" />
            </div>
            <p className="text-[12.5px] text-ink-3">
              {TYPE[image.mediaType] ?? "Image"}, {image.width} × {image.height} px, {image.sizeKb} KB. Uploaded {image.uploadedOn}.
            </p>
          </div>
        ) : (
          <p className="text-[13.5px] text-ink-3">No picture. The left side of the sign-in page is drawn in the product&rsquo;s own colours.</p>
        )}

        <form action={action} className="flex flex-col gap-3">
          <FormField
            label={image ? "Replace the picture" : "Upload a picture"}
            htmlFor="signInImage"
            error={error}
            hint={`PNG, JPEG or WebP, up to ${SIGN_IN_IMAGE_MAX_BYTES / 1024} KB (a technical limit). At least ${SIGN_IN_IMAGE_SUGGESTED_WIDTH} px wide is suggested. Words and logos are better added above than baked into the picture. SVG is not accepted.`}
          >
            <FileInput
              id="signInImage"
              name="signInImage"
              accept="image/png,image/jpeg,image/webp"
              aria-invalid={!!error}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                setChosen(!!f);
                setTooBig(f && f.size > SIGN_IN_IMAGE_MAX_BYTES ? `The image is ${Math.ceil(f.size / 1024)} KB. The limit is ${SIGN_IN_IMAGE_MAX_BYTES / 1024} KB.` : null);
              }}
            />
          </FormField>
          <div>
            <Button type="submit" variant="primary" size="sm" disabled={pending || !!tooBig || !chosen}>
              {pending ? "Uploading…" : image ? "Replace picture" : "Upload picture"}
            </Button>
          </div>
          {state.ok && state.message && <Callout tone="ok">{state.message}</Callout>}
          {!state.ok && state.message && <Callout tone="err">{state.message}</Callout>}
        </form>
      </CardBody>
    </Card>
  );
}
