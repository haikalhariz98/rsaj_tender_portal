"use client";

import { useId, type ReactNode } from "react";

import { AffixInput, Field, Input, Select } from "@/components/ui/field";
import { APPLY } from "@/lib/portal/labels";
import type { FaultView, PublicApplicationBody } from "@/lib/portal/register/contract";

import { errorText, faultsAt } from "./faults";

/**
 * Step 1 of the public registration (ADR 0041): the company, its registered address and the person the office can reach, as a controlled component. Lifted from the step-one form the
 * public page used before the one submission: the same fields, words and limits, now held in the browser with the other four steps and sent once at Submit. Each finding is placed beside
 * the field it names (`PORTAL_FIELD_OF`, or the field whose text is too long).
 */

type Option = { value: string; label: string };
export type CompanyValue = PublicApplicationBody["company"];

export const EMPTY_COMPANY: CompanyValue = {
  registeredName: "",
  registrationNo: "",
  entityTypeCode: "",
  countryCode: "",
  incorporatedOn: "",
  bumiputeraClaimCode: null,
  companyEmail: "",
  address: { addressLine1: "", addressLine2: "", city: "", postcode: "", stateCode: "" },
  contact: { name: "", designation: "", email: "", phone: "" },
};

export function CompanyFields({
  value,
  onChange,
  faults,
  entityTypes,
  countries,
  states,
  bumiputeraStatuses,
  contactNeedsEmailAndPhone,
  formatExample,
}: {
  value: CompanyValue;
  onChange: (next: CompanyValue) => void;
  faults: readonly FaultView[];
  entityTypes: readonly Option[];
  /// `callingCode`: the country's dial code, shown before the mobile number and joined to it when the application is stored.
  countries: readonly (Option & { callingCode: string | null })[];
  states: readonly Option[];
  /// Empty: the claim is not asked.
  bumiputeraStatuses: readonly Option[];
  /// True asks for both an email and a mobile number; otherwise either will do.
  contactNeedsEmailAndPhone: boolean;
  formatExample: string | null;
}) {
  const base = useId();
  const id = (k: string) => `${base}-${k}`;
  const err = (k: string) => errorText(faultsAt(faults, k));
  const v = value;
  const dialCode = countries.find((c) => c.value === v.countryCode)?.callingCode ?? null;
  const company = (k: "registeredName" | "registrationNo" | "entityTypeCode" | "countryCode" | "incorporatedOn" | "companyEmail", text: string) => onChange({ ...v, [k]: text });
  const address = (k: keyof CompanyValue["address"], text: string) => onChange({ ...v, address: { ...v.address, [k]: text } });
  const contact = (k: keyof CompanyValue["contact"], text: string) => onChange({ ...v, contact: { ...v.contact, [k]: text } });

  const text = (k: string, label: string, value: string, set: (s: string) => void, o: { required?: boolean; hint?: string; type?: string; autoComplete?: string; inputMode?: "numeric" | "tel" | "email"; wide?: boolean } = {}) => (
    <div className={o.wide ? "sm:col-span-2" : undefined}>
      <Field label={label} required={o.required} htmlFor={id(k)} hint={o.hint} error={err(k)}>
        <Input id={id(k)} type={o.type ?? "text"} inputMode={o.inputMode} autoComplete={o.autoComplete} value={value} onChange={(e) => set(e.target.value)} />
      </Field>
    </div>
  );
  const select = (k: string, label: string, options: readonly Option[], value: string, set: (s: string) => void, o: { required?: boolean; hint?: string } = {}) => (
    <Field label={label} required={o.required} htmlFor={id(k)} hint={o.hint} error={err(k)}>
      <Select id={id(k)} value={value} onChange={(e) => set(e.target.value)}>
        <option value="">{APPLY.choose.en}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
  const section = (key: string, title: string, children: ReactNode, first = false) => (
    <section aria-labelledby={id(`h-${key}`)} className={`${first ? "" : "mt-5 "}rounded-2xl border border-line p-4 sm:p-5`}>
      <h3 id={id(`h-${key}`)} className="text-[14.5px] font-bold text-ink">
        {title}
      </h3>
      <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">{children}</div>
    </section>
  );

  return (
    <div>
      {section(
        "company",
        APPLY.companyTitle.en,
        <>
          {text("registeredName", APPLY.fields.registeredName.en, v.registeredName, (s) => company("registeredName", s), { required: true, autoComplete: "organization", wide: true })}
          {text("registrationNo", APPLY.fields.registrationNo.en, v.registrationNo, (s) => company("registrationNo", s), { required: true, hint: formatExample ? APPLY.numberFormatHint(formatExample).en : undefined })}
          {select("entityTypeCode", APPLY.fields.entityType.en, entityTypes, v.entityTypeCode, (s) => company("entityTypeCode", s), { required: true })}
          {select("countryCode", APPLY.fields.country.en, countries, v.countryCode, (s) => company("countryCode", s), { required: true })}
          {text("incorporatedOn", APPLY.fields.incorporatedOn.en, v.incorporatedOn, (s) => company("incorporatedOn", s), { required: true, type: "date", hint: APPLY.incorporatedHint.en })}
          {bumiputeraStatuses.length > 0 && select("bumiputeraClaimCode", APPLY.fields.bumiputeraClaim.en, bumiputeraStatuses, v.bumiputeraClaimCode ?? "", (s) => onChange({ ...v, bumiputeraClaimCode: s || null }), { hint: APPLY.bumiputeraHint.en })}
          {text("companyEmail", APPLY.fields.companyEmail.en, v.companyEmail, (s) => company("companyEmail", s), { required: true, type: "email", autoComplete: "email", hint: APPLY.emailNotVerifiedHint.en })}
        </>,
        true,
      )}
      {section(
        "address",
        APPLY.addressTitle.en,
        <>
          {text("addressLine1", APPLY.fields.addressLine1.en, v.address.addressLine1, (s) => address("addressLine1", s), { required: true, autoComplete: "address-line1", wide: true })}
          {text("addressLine2", APPLY.fields.addressLine2.en, v.address.addressLine2, (s) => address("addressLine2", s), { autoComplete: "address-line2", wide: true })}
          {text("city", APPLY.fields.city.en, v.address.city, (s) => address("city", s), { required: true, autoComplete: "address-level2" })}
          {text("postcode", APPLY.fields.postcode.en, v.address.postcode, (s) => address("postcode", s), { required: true, autoComplete: "postal-code" })}
          {select("stateCode", APPLY.fields.state.en, states, v.address.stateCode ?? "", (s) => address("stateCode", s), { required: true })}
        </>,
      )}
      {section(
        "contact",
        APPLY.contactTitle.en,
        <>
          {text("contactName", APPLY.fields.contactName.en, v.contact.name, (s) => contact("name", s), { required: true, autoComplete: "name" })}
          {text("contactDesignation", APPLY.fields.contactDesignation.en, v.contact.designation, (s) => contact("designation", s), { autoComplete: "organization-title" })}
          {text("contactEmail", APPLY.fields.contactEmail.en, v.contact.email, (s) => contact("email", s), { type: "email", required: contactNeedsEmailAndPhone, hint: contactNeedsEmailAndPhone ? APPLY.reachHintBoth.en : APPLY.reachHint.en, autoComplete: "email" })}
          <Field label={APPLY.fields.contactMobile.en} required={contactNeedsEmailAndPhone} htmlFor={id("contactPhone")} hint={APPLY.mobileHint(dialCode).en} error={err("contactPhone")}>
            <AffixInput id={id("contactPhone")} type="tel" inputMode="tel" autoComplete="tel-national" prefix={dialCode ?? undefined} className={dialCode && dialCode.length > 3 ? "[&_input]:pl-16" : undefined} value={v.contact.phone} onChange={(e) => contact("phone", e.target.value)} />
          </Field>
        </>,
      )}
    </div>
  );
}
