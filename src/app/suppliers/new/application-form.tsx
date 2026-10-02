"use client";

import { useState, useTransition } from "react";

import { SaveIcon } from "@/components/icons";
import type { FormState } from "@/components/record-editor";
import { Chip } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";
import { ON_BEHALF_HINT } from "@/lib/documents/labels";

import { recordApplication } from "../actions";

type Option = { value: string; label: string };

/**
 * Recording a new supplier from its paper application (FR-VND-001, a1). What was typed is kept on a
 * refused save; every rule is the action's (`applicationFaults`). The contact is the supplier's, never
 * a Person, and readable by anyone until sign-in (condition 2).
 */
export function ApplicationForm({ entityTypes, countries, channels, people, formatExample, today, notRestricted }: { entityTypes: Option[]; countries: Option[]; channels: Option[]; people: Option[]; formatExample: string | null; today: string | null; notRestricted: string }) {
  const [state, setState] = useState<FormState>({ ok: false });
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => state.errors?.[k];
  const text = (name: string, label: string, opts: { required?: boolean; hint?: string; type?: string } = {}) => (
    <Field label={label} required={opts.required} htmlFor={name} hint={opts.hint} error={err(name)}>
      <Input id={name} name={name} type={opts.type ?? "text"} value={v[name] ?? ""} onChange={set(name)} {...(opts.type === "date" && today ? { max: today } : {})} />
    </Field>
  );
  const select = (name: string, label: string, options: Option[], opts: { required?: boolean; hint?: string } = {}) => (
    <Field label={label} required={opts.required} htmlFor={name} hint={opts.hint} error={err(name)}>
      <Select id={name} name={name} value={v[name] ?? ""} onChange={set(name)}>
        <option value="">Choose</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
  return (
    <form onSubmit={(e) => { const data = formDataOf(e); startTransition(async () => setState(await recordApplication(state, data))); }} className="flex flex-col gap-6">
      {state.message && <Callout tone="err">{state.message}</Callout>}
      <Card>
        <CardHeader title="The company" subtitle="As the application and its certificate state it." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("registeredName", "Registered name", { required: true })}</div>
          {text("registrationNo", "Registration number", { required: true, hint: formatExample ? `In the configured format, for example ${formatExample}.` : "No format is set: the number is recorded as typed and marked “format not checked”." })}
          {select("entityTypeCode", "Entity type", entityTypes, { required: true, hint: entityTypes.length ? undefined : "No entity types are set under Configuration › Supplier register." })}
          {select("countryCode", "Country", countries, { required: true, hint: countries.length ? undefined : "No countries are set under Configuration › Supplier register." })}
          {text("companyEmail", "Company email", { required: true, type: "email" })}
          <div className="sm:col-span-2">
            <Field label="Registered address" required htmlFor="registeredAddress" error={err("registeredAddress")}>
              <Textarea id="registeredAddress" name="registeredAddress" rows={2} value={v.registeredAddress ?? ""} onChange={set("registeredAddress")} />
            </Field>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Primary contact" subtitle="A person at the supplier, as the application names them. Not a user of this portal." actions={<Chip tone="warn">{notRestricted}</Chip>} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {text("contactName", "Name", { required: true })}
          {text("contactDesignation", "Designation")}
          {text("contactEmail", "Email", { type: "email", hint: "An email or a telephone." })}
          {text("contactPhone", "Telephone")}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="The paper application" subtitle="How and when it arrived, and who is recording it. The signed declaration's scan and the E-Payment form's scan are attached on the application once recorded." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {text("receivedOn", "Received on", { required: true, type: "date", hint: "The day it arrived; not after today." })}
          {select("channel", "How it came in", channels, { required: true })}
          {text("declarationSignedOn", "Declaration signed on", { type: "date", hint: "The day on the signed false-declaration and blacklisting declaration. Needed before it is sent for decision." })}
          {text("epaymentFormReceivedOn", "E-Payment form received on", { type: "date", hint: "Only that it was received: no bank detail is recorded before sign-in. Its scan is SULIT." })}
          {select("recordedByPersonId", "Recorded by", people, { required: true, hint: ON_BEHALF_HINT })}
        </CardBody>
      </Card>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ButtonLink href="/suppliers" variant="ghost" size="md">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" size="md" disabled={pending} icon={<SaveIcon size={15} />}>
          {pending ? "Saving…" : "Record the application"}
        </Button>
      </div>
    </form>
  );
}
