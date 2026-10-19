"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { InfoChip } from "@/components/ui/info-chip";
import { KeyValues } from "@/components/ui/stat";
import { LOGO_MAX_BYTES, SIGN_IN_IMAGE_MAX_BYTES, SIGN_IN_IMAGE_SUGGESTED_WIDTH } from "@/lib/organisation/logo-limits";
import { SIGN_IN_ICON_LABEL, SIGN_IN_ICONS, SIGN_IN_LABEL, signInIconOf, type SignInField, type SignInPageSettings } from "@/lib/organisation/sign-in-page";

import { IMAGE_TYPE as TYPE, ImageUploadCard } from "./logo-card";
import { removeDarkLogo, removeSignInImage, saveSignInPage, uploadDarkLogo, uploadSignInImage } from "./sign-in-actions";

export interface SignInImageInfo {
  sha: string;
  mediaType: string;
  sizeKb: number;
  width: number;
  height: number;
  uploadedOn: string;
}

export type SignInDarkLogoInfo = SignInImageInfo;

const NOT_SET = <span className="text-ink-4">Not set</span>;

/// The sign-in page: its picture and its words, each the organisation's own and each optional. Unset is said, never shown as blank.
export function SignInPageCards({ image, darkLogo, settings }: { image: SignInImageInfo | null; darkLogo: SignInDarkLogoInfo | null; settings: SignInPageSettings }) {
  return (
    <>
      {/* The logo for dark backgrounds comes first, so it sits directly under the Logo card it belongs with. */}
      <SignInDarkLogoCard darkLogo={darkLogo} />
      <SignInWordsCard settings={settings} />
      <SignInImageCard image={image} />
    </>
  );
}

const WORDS: { field: SignInField; hint: string; textarea?: boolean; icon?: boolean }[] = [
  { field: "portalName", hint: "The small spaced line over the headline, and the title of the sign-in card." },
  { field: "headline", hint: "The large line on the picture." },
  { field: "supportingText", hint: "One sentence under the headline.", textarea: true },
  { field: "highlight1", hint: "A short phrase with a round icon above it." },
  { field: "highlight1Icon", hint: "Left unchosen, a plain tick is drawn.", icon: true },
  { field: "highlight2", hint: "Left blank, it is not shown." },
  { field: "highlight2Icon", hint: "Left unchosen, a plain tick is drawn.", icon: true },
  { field: "highlight3", hint: "Left blank, it is not shown." },
  { field: "highlight3Icon", hint: "Left unchosen, a plain tick is drawn.", icon: true },
  { field: "tagline", hint: "A line at the bottom of the picture." },
  { field: "privacyUrl", hint: "A web address, starting with https://. Left blank, the link is not shown." },
  { field: "termsUrl", hint: "A web address, starting with https://. Left blank, the link is not shown." },
  { field: "helpDeskUrl", hint: "A web address, starting with https://. Left blank, the link is not shown." },
];

function SignInWordsCard({ settings }: { settings: SignInPageSettings }) {
  const iconOptions = SIGN_IN_ICONS.map((value) => ({ value, label: SIGN_IN_ICON_LABEL[value] }));
  const fields: Field[] = WORDS.map((w) =>
    w.icon
      ? { kind: "select", name: w.field, label: SIGN_IN_LABEL[w.field], hint: w.hint, options: iconOptions, placeholder: "No icon (a plain tick)", orphanLabel: "An icon that is no longer offered" }
      : w.textarea
        ? { kind: "textarea", name: w.field, label: SIGN_IN_LABEL[w.field], hint: w.hint }
        : { kind: "text", name: w.field, label: SIGN_IN_LABEL[w.field], hint: w.hint },
  );
  const anySet = Object.values(settings).some((v) => v != null);
  return (
    <Card>
      <CardHeader
        title="Sign-in page: words and links"
        subtitle="Shown beside the sign-in form"
        actions={
          <RecordEditor
            title="Edit the sign-in page"
            description="Public. Add nothing that is not for the public."
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
        {!anySet && <Chip tone="warn">Not set</Chip>}
        <KeyValues
          columns={2}
          items={WORDS.map((w) => {
            const icon = w.icon ? signInIconOf(settings[w.field]) : null;
            return {
              label: SIGN_IN_LABEL[w.field],
              value: w.icon ? (icon ? SIGN_IN_ICON_LABEL[icon] : <span className="text-ink-4">Not chosen: a plain tick</span>) : (settings[w.field] ?? NOT_SET),
            };
          })}
        />
      </CardBody>
    </Card>
  );
}

function SignInImageCard({ image }: { image: SignInImageInfo | null }) {
  const src = image ? `/sign-in/image/${image.sha}` : null;
  return (
    <ImageUploadCard
      title="Sign-in page: picture"
      subtitle="Left of the sign-in page"
      remove={
        image ? (
          <RecordEditor
            title="Remove the sign-in picture"
            description="Until another is uploaded, the product's colours show."
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
      current={
        image && src ? (
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
          <p className="text-[13.5px] text-ink-3">No picture</p>
        )
      }
      field={{
        name: "signInImage",
        label: image ? "Replace the picture" : "Upload a picture",
        hint: `PNG, JPEG or WebP, up to ${SIGN_IN_IMAGE_MAX_BYTES / 1024} KB (a technical limit). At least ${SIGN_IN_IMAGE_SUGGESTED_WIDTH} px wide is suggested. Words and logos are better added above than baked into the picture. SVG is not accepted.`,
        maxBytes: SIGN_IN_IMAGE_MAX_BYTES,
        noun: "image",
      }}
      action={uploadSignInImage}
      submitLabel={image ? "Replace picture" : "Upload picture"}
    />
  );
}

/// The organisation's logo for the dark, shaded left side of the sign-in page. Optional. Unset is said, with what the page shows instead.
function SignInDarkLogoCard({ darkLogo }: { darkLogo: SignInDarkLogoInfo | null }) {
  const src = darkLogo ? `/sign-in/image/${darkLogo.sha}` : null;
  return (
    <ImageUploadCard
      title="Sign-in page: logo for dark backgrounds"
      subtitle="Optional. For the shaded side."
      remove={
        darkLogo ? (
          <RecordEditor
            title="Remove the logo for dark backgrounds"
            description="The sign-in page shows your ordinary logo, with a soft light halo, again."
            fields={[]}
            action={removeDarkLogo}
            destructive={{ reasonLabel: "Why is the logo for dark backgrounds being removed?" }}
            submitLabel="Remove logo"
            cancelLabel="Keep the logo"
            trigger={{ label: "Remove logo", className: buttonClass("ghost", "sm") }}
            size="sm"
          />
        ) : undefined
      }
      current={
        darkLogo && src ? (
          <div className="flex flex-col gap-3">
            <div className="flex h-28 max-w-xl items-center justify-center rounded-2xl bg-ink p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- addressed by its own fingerprint */}
              <img src={src} alt="The current logo for dark backgrounds" className="max-h-full max-w-full object-contain" />
            </div>
            <p className="text-[12.5px] text-ink-3">
              {TYPE[darkLogo.mediaType] ?? "Image"}, {darkLogo.width} × {darkLogo.height} px, {darkLogo.sizeKb} KB. Uploaded {darkLogo.uploadedOn}.
            </p>
          </div>
        ) : (
          <InfoChip tone="warn" detail="The ordinary logo shows with a light halo. Dark lettering may read poorly.">Dark-background logo not set</InfoChip>
        )
      }
      field={{
        name: "darkLogo",
        label: darkLogo ? "Replace the logo for dark backgrounds" : "Upload a logo for dark backgrounds",
        hint: `PNG, JPEG or WebP, up to ${LOGO_MAX_BYTES / 1024} KB (a technical limit). Use a file with a transparent background. SVG is not accepted.`,
        maxBytes: LOGO_MAX_BYTES,
        noun: "logo",
      }}
      action={uploadDarkLogo}
      submitLabel={darkLogo ? "Replace logo" : "Upload logo"}
    />
  );
}
