"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { ArrowRight, CheckIcon } from "@/components/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Field, Input, Select } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";
import { FORM_TOKEN_FIELD } from "@/lib/auth/form-token";
import { HONEYPOT_FIELD, type ApplyState } from "@/lib/portal/apply";
import { APPLY, PORTAL_PATH } from "@/lib/portal/labels";
import { SUBMIT_PATH } from "@/lib/portal/surface";

type Option = { value: string; label: string };

/// The one write the public copy accepts, as a plain POST to its own route (a server action is refused there).
async function send(data: FormData): Promise<ApplyState> {
  try {
    const res = await fetch(SUBMIT_PATH, { method: "POST", body: data });
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) return { ok: false, message: APPLY.tryAgainLater.en };
    return (await res.json()) as ApplyState;
  } catch {
    return { ok: false, message: APPLY.tryAgainLater.en };
  }
}

/**
 * The public registration form. What was typed is kept on a refused send; every rule is the server's
 * (`portalApplicationFaults`). On success the form is replaced by the confirmation and the reference,
 * which is shown once: nothing here, and nothing on the server, looks an application up again.
 */
export function ApplicationForm({
  formToken,
  entityTypes,
  countries,
  states,
  bumiputeraStatuses,
  contactNeedsEmailAndPhone,
  formatExample,
  notice,
  personalDataNotice,
  organisationName,
}: {
  /// Signed by the server when the page was rendered; the route refuses a post without a good one.
  formToken: string;
  entityTypes: Option[];
  countries: (Option & { callingCode: string | null })[];
  states: Option[];
  /// Empty: the claim is not asked.
  bumiputeraStatuses: Option[];
  /// True asks for both an email and a mobile number; otherwise either will do.
  contactNeedsEmailAndPhone: boolean;
  formatExample: string | null;
  notice: string | null;
  personalDataNotice: { en: string; ms: string };
  organisationName: string;
}) {
  const [state, setState] = useState<ApplyState>({ ok: false });
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState<Record<string, string>>({});
  const confirmation = useRef<HTMLHeadingElement>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  /// The dial code of the country chosen, shown in front of the mobile number; the server joins it to what is stored. None configured: nothing is shown.
  const dialCode = countries.find((c) => c.value === v.countryCode)?.callingCode ?? null;
  const err = (k: string) => state.errors?.[k];

  useEffect(() => {
    if (state.ok) confirmation.current?.focus();
  }, [state.ok]);

  if (state.ok) {
    return (
      <Card>
        <CardHeader icon={<CheckIcon size={17} />} title={<span ref={confirmation} tabIndex={-1} className="outline-none">{state.reference ? APPLY.sentTitle.en : APPLY.sentNoReference.en}</span>} />
        <CardBody className="flex flex-col gap-5" role="status">
          {state.reference && (
            <div>
              <p className="text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">{APPLY.referenceLabel.en}</p>
              <p className="mt-1 text-[26px] font-bold tracking-tight text-ink [overflow-wrap:anywhere]">{state.reference}</p>
              <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-ink-2">{APPLY.keepReference.en}</p>
            </div>
          )}
          <div>
            <h2 className="text-[14px] font-bold text-ink">{APPLY.nextTitle.en}</h2>
            <ul className="mt-2 flex max-w-prose list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-ink-2">
              {APPLY.nextItems.map((item) => (
                <li key={item.en}>{item.en}</li>
              ))}
            </ul>
          </div>
          {notice && (
            <Callout tone="info" title={APPLY.officeNoticeTitle.en}>
              <span className="whitespace-pre-line">{notice}</span>
            </Callout>
          )}
          <div>
            <ButtonLink href={PORTAL_PATH.home} variant="secondary" size="md">
              {APPLY.backToHome.en}
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    );
  }

  const text = (name: string, label: string, opts: { required?: boolean; hint?: string; type?: string; autoComplete?: string; inputMode?: "numeric" | "tel" | "email" } = {}) => (
    <Field label={label} required={opts.required} htmlFor={name} hint={opts.hint} error={err(name)}>
      <Input id={name} name={name} type={opts.type ?? "text"} inputMode={opts.inputMode} autoComplete={opts.autoComplete} value={v[name] ?? ""} onChange={set(name)} />
    </Field>
  );
  const select = (name: string, label: string, options: Option[], opts: { required?: boolean; hint?: string } = {}) => (
    <Field label={label} required={opts.required} htmlFor={name} hint={opts.hint} error={err(name)}>
      <Select id={name} name={name} value={v[name] ?? ""} onChange={set(name)}>
        <option value="">{APPLY.choose.en}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <form onSubmit={(e) => { const data = formDataOf(e); startTransition(async () => setState(await send(data))); }} className="flex flex-col gap-6" noValidate>
      {state.message && <Callout tone="err">{state.message}</Callout>}
      <input type="hidden" name={FORM_TOKEN_FIELD} value={formToken} />
      <Card>
        <CardHeader title={APPLY.companyTitle.en} subtitle={APPLY.companySubtitle.en} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("registeredName", APPLY.fields.registeredName.en, { required: true, autoComplete: "organization" })}</div>
          {text("registrationNo", APPLY.fields.registrationNo.en, { required: true, hint: formatExample ? APPLY.numberFormatHint(formatExample).en : undefined })}
          {select("entityTypeCode", APPLY.fields.entityType.en, entityTypes, { required: true })}
          {select("countryCode", APPLY.fields.country.en, countries, { required: true })}
          {text("incorporatedOn", APPLY.fields.incorporatedOn.en, { required: true, type: "date", hint: APPLY.incorporatedHint.en })}
          {bumiputeraStatuses.length > 0 && select("bumiputeraClaimCode", APPLY.fields.bumiputeraClaim.en, bumiputeraStatuses, { hint: APPLY.bumiputeraHint.en })}
          {text("companyEmail", APPLY.fields.companyEmail.en, { required: true, type: "email", autoComplete: "email", hint: APPLY.emailNotVerifiedHint.en })}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={APPLY.addressTitle.en} subtitle={APPLY.addressSubtitle.en} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("addressLine1", APPLY.fields.addressLine1.en, { required: true, autoComplete: "address-line1" })}</div>
          <div className="sm:col-span-2">{text("addressLine2", APPLY.fields.addressLine2.en, { autoComplete: "address-line2" })}</div>
          {text("city", APPLY.fields.city.en, { required: true, autoComplete: "address-level2" })}
          {text("postcode", APPLY.fields.postcode.en, { required: true, autoComplete: "postal-code" })}
          {select("stateCode", APPLY.fields.state.en, states, { required: true })}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={APPLY.contactTitle.en} subtitle={APPLY.contactSubtitle.en} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {text("contactName", APPLY.fields.contactName.en, { required: true, autoComplete: "name" })}
          {text("contactDesignation", APPLY.fields.contactDesignation.en, { autoComplete: "organization-title" })}
          {text("contactEmail", APPLY.fields.contactEmail.en, { type: "email", required: contactNeedsEmailAndPhone, hint: contactNeedsEmailAndPhone ? APPLY.reachHintBoth.en : APPLY.reachHint.en, autoComplete: "email" })}
          <Field label={APPLY.fields.contactMobile.en} required={contactNeedsEmailAndPhone} htmlFor="contactPhone" hint={APPLY.mobileHint(dialCode).en} error={err("contactPhone")}>
            <AffixInput id="contactPhone" name="contactPhone" type="tel" inputMode="tel" autoComplete="tel-national" prefix={dialCode ?? undefined} className={dialCode && dialCode.length > 3 ? "[&_input]:pl-16" : undefined} value={v.contactPhone ?? ""} onChange={set("contactPhone")} />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={APPLY.noticeTitle.en} subtitle={APPLY.noticeIntro.en} />
        <CardBody className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">{APPLY.noticeEnglish.en}</h3>
            <p lang="en" className="mt-1.5 text-[14px] leading-relaxed whitespace-pre-line text-ink-2">{personalDataNotice.en}</p>
          </div>
          <div>
            <h3 className="text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">{APPLY.noticeMalay.en}</h3>
            <p lang="ms" className="mt-1.5 text-[14px] leading-relaxed whitespace-pre-line text-ink-2">{personalDataNotice.ms}</p>
          </div>
        </CardBody>
      </Card>
      {/* The bait field: off the screen, out of the tab order and out of the accessibility tree, so only a script fills it. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ButtonLink href={PORTAL_PATH.home} variant="ghost" size="md">
          {APPLY.backToHome.en}
        </ButtonLink>
        <Button type="submit" variant="primary" size="md" disabled={pending} icon={<ArrowRight size={15} />}>
          {pending ? APPLY.sending.en : APPLY.submit.en}
        </Button>
      </div>
      <p className="text-right text-[13px] text-ink-3">{APPLY.laterSteps(organisationName).en}</p>
    </form>
  );
}
