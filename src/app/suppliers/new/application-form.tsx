"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ActAttributionFields } from "@/components/act-attribution-fields";
import { CodeDialog } from "@/components/auth/code-dialog";
import { SaveIcon } from "@/components/icons";
import { SulitTag } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";
import { formatDate } from "@/lib/format";
import { actorField } from "@/lib/auth/actor-field";

import { recordApplication, type RecordApplicationState } from "../actions";

type Option = { value: string; label: string };

/// Whether the officer may open the contact's portal account here, and what the form needs to ask for it. `blocked` says why not, in words, where it cannot be asked.
export interface AccountOffer {
  /// The officer holds `supplierAccounts.manage`.
  permitted: boolean;
  /// The code's validity (`SecurityPolicy.resetCodeValidityMinutes`) is set.
  validitySet: boolean;
  /// A sign-in name to start from (the contact's email, where it is a well formed name); the officer may change it.
  suggestedLoginName: string;
}

/**
 * Recording a new supplier from its application (FR-VND-001, a1; Phase 4a for step one's parts and the portal account). What was typed is kept on a refused save; every rule is the
 * action's (`applicationFaults`, `stepOneFaults`). The contact is the supplier's, never a Person, and SULIT: read by the roles the organisation has chosen (condition 2).
 *
 * From an online application, the officer may also open the contact's portal account and have its one-time activation code. The code is shown once, here, and the form goes on to the
 * supplier when the officer closes it: it is kept nowhere else.
 */
export function ApplicationForm({
  entityTypes,
  countries,
  states,
  bumiputeraStatuses,
  channels,
  formatExample,
  today,
  contactNeedsEmailAndPhone,
  portal,
  account,
}: {
  entityTypes: Option[];
  countries: Option[];
  states: Option[];
  /// Empty: the claim is not asked.
  bumiputeraStatuses: Option[];
  channels: Option[];
  formatExample: string | null;
  today: string | null;
  /// `SupplierPolicy.contactNeedsEmailAndPhone`: the contact needs both, or (anything else) either.
  contactNeedsEmailAndPhone: boolean;
  portal?: { id: string; reference: string; receivedOn: string; initial: Record<string, string> };
  account?: AccountOffer;
}) {
  const router = useRouter();
  const [state, setState] = useState<RecordApplicationState>({ ok: false });
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState<Record<string, string>>({ accountLoginName: account?.suggestedLoginName ?? "", ...(portal?.initial ?? {}) });
  const [open, setOpen] = useState(false);
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
    <form
      onSubmit={(e) => {
        const data = formDataOf(e);
        startTransition(async () => {
          const next = await recordApplication(state, data);
          setState(next);
          if (next.ok && next.issued) setOpen(true);
        });
      }}
      className="flex flex-col gap-6"
    >
      {state.message && <Callout tone="err">{state.message}</Callout>}
      {portal && <input type="hidden" name="portalApplicationId" value={portal.id} />}
      <Card>
        <CardHeader title="The company" subtitle={portal ? "As the applicant typed it. Check each against the certificate and correct what differs." : "As the application and its certificate state it."} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("registeredName", "Registered name", { required: true })}</div>
          {text("registrationNo", "Registration number", { required: true, hint: formatExample ? `In the configured format, for example ${formatExample}.` : "No format is set: the number is recorded as typed and marked “format not checked”." })}
          {select("entityTypeCode", "Entity type", entityTypes, { required: true, hint: entityTypes.length ? undefined : "No entity types are set under Configuration › Supplier register." })}
          {select("countryCode", "Country", countries, { required: true, hint: countries.length ? undefined : "No countries are set under Configuration › Supplier register." })}
          {text("incorporatedOn", "Date incorporated", { required: true, type: "date", hint: "As the certificate states it; not after today." })}
          {bumiputeraStatuses.length > 0 && select("bumiputeraClaimCode", "Bumiputera status (declared)", bumiputeraStatuses, { hint: "What the applicant declares. The status that counts is the one the certificate shows once it is lodged and verified." })}
          {text("companyEmail", "Company email", { required: true, type: "email", hint: "Not verified: nothing is e-mailed from the portal." })}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Registered address" subtitle="In parts, as the certificate gives it. The single address is composed from them." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("addressLine1", "Street address", { required: true })}</div>
          <div className="sm:col-span-2">{text("addressLine2", "Street address, second line")}</div>
          {text("city", "City", { required: true })}
          {text("postcode", "Postcode", { required: true })}
          {select("stateCode", "State", states, { required: true, hint: states.length ? undefined : "No states are set under Configuration › Supplier register." })}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Primary contact" subtitle="A person at the supplier, as the application names them. Not a Person of the organisation." actions={<SulitTag />} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {text("contactName", "Name", { required: true })}
          {text("contactDesignation", "Designation")}
          {text("contactEmail", "Email", { type: "email", required: contactNeedsEmailAndPhone, hint: contactNeedsEmailAndPhone ? "An email and a mobile number are both needed." : "An email or a telephone." })}
          {text("contactPhone", "Mobile number", { required: contactNeedsEmailAndPhone })}
        </CardBody>
      </Card>
      {portal ? (
        <Card>
          <CardHeader title="Sent through the supplier portal" subtitle="The channel and the day it was sent are the portal's, not typed here. The signed declaration is recorded on the application once the office holds it." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div className="text-[14px] text-ink-2">
              <p className="text-[12.5px] font-semibold text-ink-3">Online reference</p>
              <p className="mt-0.5 font-semibold text-ink">{portal.reference}</p>
            </div>
            <div className="text-[14px] text-ink-2">
              <p className="text-[12.5px] font-semibold text-ink-3">Sent on</p>
              <p className="mt-0.5 font-semibold text-ink">{formatDate(portal.receivedOn)}</p>
            </div>
            <ActAttributionFields spec={actorField("SupplierApplication.recordedBy", { name: "recordedByPersonId", hint: "Recorded by you, from your sign-in." })} errors={state.errors} />
          </CardBody>
        </Card>
      ) : (
      <Card>
        <CardHeader title="The paper application" subtitle="How and when it arrived, and who is recording it. The signed declaration's scan and the E-Payment form's scan are attached on the application once recorded." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {text("receivedOn", "Received on", { required: true, type: "date", hint: "The day it arrived; not after today." })}
          {select("channel", "How it came in", channels, { required: true })}
          {text("declarationSignedOn", "Declaration signed on", { type: "date", hint: "The day on the signed false-declaration and blacklisting declaration. Needed before it is sent for decision." })}
          {text("epaymentFormReceivedOn", "E-Payment form received on", { type: "date", hint: "Only that it was received: no bank detail is recorded here. Its scan is SULIT." })}
          <ActAttributionFields spec={actorField("SupplierApplication.recordedBy", { name: "recordedByPersonId", hint: "Recorded by you, from your sign-in." })} errors={state.errors} />
        </CardBody>
      </Card>
      )}
      {portal && account && (
        <Card>
          <CardHeader
            title="Portal account"
            subtitle="Lets the contact sign in to the supplier portal and follow the application. Nothing is sent: you give them the one-time code yourself, once you have checked who is asking for it."
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {!account.permitted ? (
              <div className="sm:col-span-2">
                <Callout tone="info" title="You cannot open the account">
                  Opening a supplier&apos;s portal account needs the permission to manage supplier accounts, which your role has not been given. Record the supplier now; someone who holds the permission opens the account afterwards from the supplier&apos;s page.
                </Callout>
              </div>
            ) : !account.validitySet ? (
              <div className="sm:col-span-2">
                <Callout tone="warn" title="The code cannot be issued yet">
                  How long a one-time code stays valid is not set (Configuration › Security). Record the supplier now and open the account once it is.
                </Callout>
              </div>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <Checkbox name="openAccount" label="Open the contact's portal account and issue its activation code" checked={v.openAccount === "on"} onChange={(e) => setV((x) => ({ ...x, openAccount: e.target.checked ? "on" : "" }))} />
                </div>
                {v.openAccount === "on" && (
                  <>
                    {text("accountLoginName", "Sign-in name", { required: true, hint: "3 to 64 characters: letters, digits and . _ - @. The contact signs in with it." })}
                    <div className="sm:col-span-2">
                      <Field label="How the caller's identity was checked" required htmlFor="identityCheck" error={err("identityCheck")} hint="For example: seen at the counter with their identity card, or called back on the number on the registration certificate. It is kept with the code and in the record.">
                        <Input id="identityCheck" name="identityCheck" value={v.identityCheck ?? ""} onChange={set("identityCheck")} />
                      </Field>
                    </div>
                  </>
                )}
              </>
            )}
          </CardBody>
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ButtonLink href="/suppliers" variant="ghost" size="md">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" size="md" disabled={pending} icon={<SaveIcon size={15} />}>
          {pending ? "Saving…" : "Record the application"}
        </Button>
      </div>
      {open && state.issued && (
        <CodeDialog
          label="Activation code"
          title="The supplier is recorded"
          subtitle="Give the contact their activation code and their sign-in name."
          shown={{ code: state.issued.code, validUntil: state.issued.validUntil, notice: `Their sign-in name is ${v.accountLoginName}. They activate the account on the portal's activation page and choose a password of their own.` }}
          onClose={() => {
            // The code is gone from the screen and from this form's memory the moment it is closed.
            const href = state.issued!.supplierHref;
            setOpen(false);
            setState({ ok: true });
            router.push(href);
          }}
        >
          {null}
        </CodeDialog>
      )}
    </form>
  );
}
