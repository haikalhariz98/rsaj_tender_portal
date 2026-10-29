"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { useSay } from "@/components/i18n/language-context";
import { COMPONENT_WORDS as WORDS } from "@/lib/i18n/catalogues/components";

import { Button } from "./button";
import { Textarea } from "./field";
import { formDataOf } from "./form-submit";
import { useReportDirty } from "./side-panel";

/**
 * A comment box: a text area and a send button. The caller's action does the work and may refuse (`{ refused }`); the words stay in the box when it does, and are
 * cleared only once it is saved. No Reply / Internal note toggle yet: it arrives with the supplier side, and every comment is internal until then.
 */
export function Composer({
  action,
  fields = {},
  label,
  placeholder,
  send,
  max,
}: {
  action: (data: FormData) => Promise<{ refused?: string } | void>;
  /// Sent beside the text (the item's id).
  fields?: Record<string, string>;
  label: string;
  placeholder?: string;
  /// The button's words; the catalogue's "Comment" when left out.
  send?: string;
  max?: number;
}) {
  const say = useSay();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const messageId = useId();
  const reportDirty = useReportDirty();
  // Unsaved words: the panel around this box asks before it closes.
  useEffect(() => () => reportDirty(false), [reportDirty]);
  const area = () => form.current?.elements.namedItem("body") as HTMLTextAreaElement | null;
  return (
    <form
      ref={form}
      onSubmit={(e) => {
        const data = formDataOf(e);
        if (pending) return;
        const body = String(data.get("body") ?? "").trim();
        if (!body) {
          setMessage(say(WORDS.writeSomethingFirst));
          area()?.focus();
          return;
        }
        data.set("body", body);
        for (const [k, v] of Object.entries(fields)) data.set(k, v);
        setMessage(null);
        start(async () => {
          try {
            const r = await action(data);
            if (r?.refused) setMessage(r.refused);
            else {
              form.current?.reset();
              reportDirty(false);
            }
          } catch {
            setMessage(say(WORDS.didNotSave));
          }
        });
      }}
      className="flex flex-col gap-2"
    >
      <Textarea
        name="body"
        aria-label={label}
        placeholder={placeholder}
        maxLength={max}
        rows={3}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        onChange={(e) => {
          reportDirty(e.target.value.trim() !== "");
          if (message) setMessage(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            form.current?.requestSubmit();
          }
        }}
      />
      {/* Polite: a refusal is information, not an emergency. The region exists before the words land, so a screen reader announces them. */}
      <p id={messageId} role="status" className="text-[12.5px] font-medium text-rose-700 empty:hidden">
        {message}
      </p>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          {send ?? say(WORDS.sendComment)}
        </Button>
      </div>
    </form>
  );
}
