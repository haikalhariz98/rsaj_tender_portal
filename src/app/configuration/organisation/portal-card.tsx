"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { KeyValues } from "@/components/ui/stat";
import { PORTAL_DEFAULT_HEADLINE, PORTAL_ICON_FIELDS, PORTAL_LABEL, type PortalField, type PortalPageSettings } from "@/lib/organisation/portal-page";
import { SIGN_IN_ICON_LABEL, SIGN_IN_ICONS, signInIconOf } from "@/lib/organisation/sign-in-page";

import { savePortalPage } from "./sign-in-actions";

const NOT_SET = <span className="text-ink-4">Not set</span>;

/// The anchor the officers' copy of the supplier sign-in page links to ("Set it"). One place, so the link and the card cannot disagree.
export const PORTAL_CARD_ID = "supplier-portal";

const WORDS: { field: PortalField; hint: string; textarea?: boolean }[] = [
  { field: "publicAddress", hint: "https:// address of the public copy." },
  { field: "headline", hint: `Blank shows "${PORTAL_DEFAULT_HEADLINE}".` },
  { field: "line", hint: "One sentence. Blank hides it.", textarea: true },
  { field: "highlight1", hint: "Short phrase, with a round icon." },
  { field: "highlight1Icon", hint: "Left unchosen, a plain tick is drawn." },
  { field: "highlight2", hint: "Left blank, it is not shown." },
  { field: "highlight2Icon", hint: "Left unchosen, a plain tick is drawn." },
  { field: "highlight3", hint: "Left blank, it is not shown." },
  { field: "highlight3Icon", hint: "Left unchosen, a plain tick is drawn." },
];

const isIcon = (f: PortalField) => (PORTAL_ICON_FIELDS as readonly string[]).includes(f);

/// The words, link and highlights beside the supplier portal's sign-in and register pages. Each is the organisation's own and optional. Unset is said, never blank.
export function PortalPageCard({ settings }: { settings: PortalPageSettings }) {
  const iconOptions = SIGN_IN_ICONS.map((value) => ({ value, label: SIGN_IN_ICON_LABEL[value] }));
  const fields: Field[] = WORDS.map((w) =>
    isIcon(w.field)
      ? { kind: "select", name: w.field, label: PORTAL_LABEL[w.field], hint: w.hint, options: iconOptions, placeholder: "No icon (a plain tick)", orphanLabel: "An icon that is no longer offered" }
      : w.textarea
        ? { kind: "textarea", name: w.field, label: PORTAL_LABEL[w.field], hint: w.hint }
        : { kind: "text", name: w.field, label: PORTAL_LABEL[w.field], hint: w.hint },
  );
  const anySet = Object.values(settings).some((v) => v != null);
  return (
    <div id={PORTAL_CARD_ID} className="scroll-mt-6">
      <Card>
        <CardHeader
          title="Supplier portal"
          subtitle="Shown beside supplier sign-in and register."
          actions={
            <RecordEditor
              title="Edit the supplier portal"
              description="Public. Add nothing that is not for the public."
              fields={fields}
              values={{ ...settings }}
              action={savePortalPage}
              trigger={{ label: "Edit portal", className: buttonClass("secondary", "sm") }}
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
              if (isIcon(w.field)) {
                const icon = signInIconOf(settings[w.field]);
                return { label: PORTAL_LABEL[w.field], value: icon ? SIGN_IN_ICON_LABEL[icon] : <span className="text-ink-4">Not chosen: a plain tick</span> };
              }
              return { label: PORTAL_LABEL[w.field], value: settings[w.field] ?? NOT_SET };
            })}
          />
        </CardBody>
      </Card>
    </div>
  );
}
