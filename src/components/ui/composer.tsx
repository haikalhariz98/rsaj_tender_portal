"use client";

import { useRef, useState, useTransition } from "react";

import { useSay } from "@/components/i18n/language-context";
import { COMPONENT_WORDS as WORDS } from "@/lib/i18n/catalogues/components";

import { Button } from "./button";
import { Textarea } from "./field";
import { formDataOf } from "./form-submit";

/**
 * A comment box: a text area and a send button. The caller's action does the work and may refuse (`{ refused }`); the words stay in the box when it does, and are
 * cleared only once it is saved. No Reply / Internal note toggle yet: it arrives with the supplier side, and every comment is internal until then.
 */
export function Composer({
  action,
  fields = {},
  label,
  placeholder,
  send = "Comment",
  max,
}: {
  action: (data: FormData) => Promise<{ refused?: string } | void>;
  /// Sent beside the text (the item's id).
  fields?: Record<string, string>;
  label: string;
  placeholder?: string;
  send?: string;
  max?: number;
}) {
  const say = useSay();
  const [refused, setRefused] = useState<string | null>(null);
  const [empty, setEmpty] = useState(true);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      onSubmit={(e) => {
        const data = formDataOf(e);
        for (const [k, v] of Object.entries(fields)) data.set(k, v);
        setRefused(null);
        start(async () => {
          try {
            const r = await action(data);
            if (r?.refused) setRefused(r.refused);
            else {
              form.current?.reset();
              setEmpty(true);
            }
          } catch {
            setRefused(say(WORDS.didNotSave));
          }
        });
      }}
      className="flex flex-col gap-2"
    >
      <Textarea name="body" aria-label={label} placeholder={placeholder} maxLength={max} rows={3} onChange={(e) => setEmpty(e.target.value.trim() === "")} />
      {refused && (
        <p role="alert" className="text-[12.5px] font-medium text-rose-700">
          {refused}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" disabled={empty || pending}>
          {send}
        </Button>
      </div>
    </form>
  );
}
