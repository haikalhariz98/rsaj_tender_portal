"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Option, Select } from "@/components/ui/field";
import { insertSnippet } from "@/lib/templates/insert";

/**
 * Beside a template's two texts: a picker that writes a clause's citation at the cursor of the
 * text chosen (6.4 review U1). The clause is chosen by its title; its code is written into the
 * text as the merge syntax the template is stored in and is never shown as a label. The
 * texts are the form's own uncontrolled fields (`field-bodyEn`, `field-bodyMs`).
 */
export function InsertClause({ clauses }: { clauses: { code: string; title: string }[] }) {
  const [code, setCode] = useState("");
  const [into, setInto] = useState<"bodyEn" | "bodyMs">("bodyEn");
  const [done, setDone] = useState<string | null>(null);

  if (clauses.length === 0) {
    return <p className="rounded-xl bg-sunken px-3.5 py-2.5 text-[13px] text-ink-2">No clause is configured, so there is none to insert. Add clauses under Configuration, Tender documents.</p>;
  }

  const insert = () => {
    const clause = clauses.find((c) => c.code === code);
    const area = document.getElementById(`field-${into}`) as HTMLTextAreaElement | null;
    if (!clause || !area) return;
    const at = insertSnippet(area.value, area.selectionStart ?? area.value.length, area.selectionEnd ?? area.value.length, `{{clause:${clause.code}}}`, true);
    area.value = at.text;
    area.focus();
    area.setSelectionRange(at.cursor, at.cursor);
    area.dispatchEvent(new Event("input", { bubbles: true }));
    setDone(`${clause.title} inserted in the ${into === "bodyEn" ? "English" : "Malay"} text.`);
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3" role="group" aria-label="Insert a clause">
      <p className="text-[13px] font-semibold text-ink-2">Insert a clause</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <Field label="Clause" htmlFor="insert-clause">
          <Select id="insert-clause" value={code} onChange={(e) => { setCode(e.target.value); setDone(null); }} placeholder="Choose a clause">
            {clauses.map((c) => (
              <Option key={c.code} value={c.code}>
                {c.title}
              </Option>
            ))}
          </Select>
        </Field>
        <Field label="Into" htmlFor="insert-into">
          <Select id="insert-into" value={into} onChange={(e) => { setInto(e.target.value as "bodyEn" | "bodyMs"); setDone(null); }}>
            <Option value="bodyEn">English text</Option>
            <Option value="bodyMs">Malay text</Option>
          </Select>
        </Field>
        <Button variant="secondary" size="md" disabled={!code} onClick={insert} className="mb-px">
          Insert
        </Button>
      </div>
      <p className="text-[12.5px] text-ink-3" role="status">
        {done ?? "It is written at the cursor, as a paragraph of its own. The agreement then carries the clause's words as configured."}
      </p>
    </div>
  );
}
