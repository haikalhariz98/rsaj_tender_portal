"use client";

import { formDataOf } from "@/components/ui/form-submit";
import { useRef, useState, useTransition, type ReactNode } from "react";

import {
  AlertTriangle,
  CheckIcon,
  GridIcon,
  SaveIcon,
  ShieldIcon,
  XIcon,
} from "@/components/icons";
import { type FormState } from "@/components/record-editor";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Field, Select, Switch } from "@/components/ui/field";
import { Stat } from "@/components/ui/stat";
import { type BudgetCode, type Movement } from "@/lib/budget/codes";
import type { BudgetControls } from "@/lib/budget/load";
import { OUTCOME_WORD, workedExample } from "@/lib/budget/controls";
import { formatCompactRM } from "@/lib/format";
import { parseSen, senToDecimalString } from "@/lib/money";

import { clearBudgetControls, saveBudgetControls } from "./actions";

/// A figure tile sitting inside a card: flat, on the sunken tone, a size down.

/**
 * The budget controls, and what they mean when a requirement arrives.
 *
 * Every setting is nullable and an empty box means not set. The card in the middle
 * is computed from the settings above it and the real ledger — an explanation
 * written in prose would go stale the moment somebody changed one.
 */
export function ControlsPanel({
  settings,
  codes,
  movements,
  roles,
  on,
}: {
  settings: BudgetControls | null;
  codes: BudgetCode[];
  movements: Movement[];
  roles: { code: string; nameEn: string }[];
  on: Date;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({ ok: false });
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Clearing asks first, and afterwards the form is rebuilt from what is saved: its
  // inputs are uncontrolled, so without a remount they kept showing the old values —
  // and a later Save would have posted them straight back.
  const [confirming, setConfirming] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [check, setCheck] = useState(settings?.availabilityCheck ?? "");
  const [overrides, setOverrides] = useState<string[]>(settings?.overrideRoleCodes ?? []);

  const example = workedExample(codes, movements, check || null, on);

  const submit = (data: FormData) => {
    setSaved(false);
    startTransition(async () => {
      const result = await saveBudgetControls({ ok: false }, data);
      setState(result);
      setSaved(result.ok);
      if (result.ok) setDirty(false);
    });
  };

  const clear = () => {
    startTransition(async () => {
      const result = await clearBudgetControls();
      setConfirming(false);
      if (!result.ok) {
        setState(result);
        return;
      }
      setCheck("");
      setOverrides([]);
      setSaved(false);
      setDirty(false);
      setState({ ok: false });
      setFormKey((k) => k + 1);
    });
  };

  return (
    <form key={formKey} onSubmit={(e) => submit(formDataOf(e))} ref={formRef} onChange={() => setDirty(true)}>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader
            icon={<ShieldIcon size={17} />}
            title="Availability check"
            subtitle="What the portal does when a requirement exceeds the balance on its code."
            actions={
              /* The sample says "Restore defaults". This product ships none — a
                 threshold baked in here would be one customer's policy arriving as
                 software — so the button says what it actually does. */
              confirming ? (
                <span className="flex items-center gap-2 rounded-full bg-rose-50 py-1 pr-1 pl-3 text-[12.5px] text-rose-800">
                  Clear every setting on this screen?
                  <Button variant="danger" size="sm" disabled={pending} onClick={clear}>
                    {pending ? "Clearing…" : "Clear them"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                    Keep them
                  </Button>
                </span>
              ) : (
                <Button size="sm" disabled={pending} onClick={() => setConfirming(true)}>
                  Clear these settings
                </Button>
              )
            }
          />
          <CardBody>
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <Field
                label="Availability check"
                htmlFor="ctl-availabilityCheck"
                hint="Blocking holds the requirement until someone overrides it. Advisory shows a warning and lets the raiser continue."
                error={state.errors?.availabilityCheck}
              >
                <Select
                  id="ctl-availabilityCheck"
                  name="availabilityCheck"
                  value={check}
                  onChange={(e) => setCheck(e.target.value)}
                  aria-invalid={state.errors?.availabilityCheck ? true : undefined}
                >
                  <option value="">Not set</option>
                  <option value="blocking">Blocking</option>
                  <option value="advisory">Advisory</option>
                </Select>
              </Field>

              <Field
                label="Warning threshold"
                htmlFor="ctl-warningThresholdPercent"
                hint="Utilisation at which a budget code is flagged as running low. Leave it empty and none is."
                error={state.errors?.warningThresholdPercent}
              >
                <Suffixed
                  name="warningThresholdPercent"
                  suffix="%"
                  min={0}
                  max={100}
                  value={settings?.warningThresholdPercent}
                  invalid={!!state.errors?.warningThresholdPercent}
                />
              </Field>

              <Field
                label="Over-commitment tolerance"
                htmlFor="ctl-overCommitmentTolerancePercent"
                hint="How far past the balance a requirement may go before the check bites."
                error={state.errors?.overCommitmentTolerancePercent}
              >
                <Suffixed
                  name="overCommitmentTolerancePercent"
                  suffix="%"
                  min={0}
                  max={100}
                  value={settings?.overCommitmentTolerancePercent}
                  invalid={!!state.errors?.overCommitmentTolerancePercent}
                />
              </Field>

              <Field
                label="May override the check"
                hint="Roles that can proceed past a failed check. Nobody, unless named here."
              >
                <RoleTokens roles={roles} chosen={overrides} onChange={setOverrides} />
              </Field>

              <Switch
                className="sm:col-span-2"
                name="commitOnApproval"
                defaultChecked={settings?.commitOnApproval === true}
                label="Commit on approval"
                description="Whether approving a requirement holds the budget there and then."
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<GridIcon size={17} />} title="What this means in practice" />
          <CardBody>
            {example == null ? (
              <p className="text-[13px] text-ink-3">
                No budget code carries an allocation yet, so there is nothing to work
                the check through.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat
                    tone="neutral"
                    label="Budget code"
                    value={
                      <span className="font-mono" title={example.code.code}>
                        {example.code.code}
                      </span>
                    }
                    hint={<span title={example.code.descriptionEn}>{example.code.descriptionEn}</span>}
                    variant="inset" size="sm"
                  />
                  <Stat
                    tone="neutral"
                    label="Available"
                    value={formatCompactRM(example.available)}
                    variant="inset" size="sm"
                  />
                  <Stat
                    tone="neutral"
                    label="Amount"
                    value={formatCompactRM(example.amount)}
                    hint="A sen more than is left, so the setting shows"
                    variant="inset" size="sm"
                  />
                  <Stat
                    tone="neutral"
                    label="Utilisation"
                    value={
                      <span
                        className={
                          example.outcome === "RELEASED" ? "text-emerald-700" : "text-amber-700"
                        }
                      >
                        {example.utilisationAfter == null
                          ? "Not set"
                          : `${Math.round(example.utilisationAfter)}%`}
                      </span>
                    }
                    variant="inset" size="sm"
                  />
                </div>

                <Callout
                  tone={
                    example.outcome === "RELEASED"
                      ? "ok"
                      : example.outcome === "NOT_SET"
                        ? "info"
                        : "warn"
                  }
                  icon={
                    example.outcome === "RELEASED" ? (
                      <CheckIcon size={18} />
                    ) : example.outcome === "NOT_SET" ? (
                      <AlertTriangle size={18} />
                    ) : (
                      <XIcon size={18} />
                    )
                  }
                  title={OUTCOME_WORD[example.outcome]}
                >
                  {example.outcome === "NOT_SET" ? (
                    <>
                      A requirement of {formatCompactRM(example.amount)} on{" "}
                      {example.code.code} today would exceed the balance, and nobody
                      has said whether the portal should hold it or let it through.
                    </>
                  ) : (
                    <>
                      A requirement of {formatCompactRM(example.amount)} on{" "}
                      {example.code.code} today would be {OUTCOME_WORD[example.outcome]}.
                    </>
                  )}
                </Callout>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<SaveIcon size={17} />}
            title="Payment defaults"
            subtitle="Applied to every certificate unless the contract says otherwise."
          />
          <CardBody>
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              <Field
                label="Advance recoupment rate"
                htmlFor="ctl-advanceRecoupmentRatePercent"
                hint="How much of each certificate goes to recovering an advance."
                error={state.errors?.advanceRecoupmentRatePercent}
              >
                <Suffixed
                  name="advanceRecoupmentRatePercent"
                  suffix="%"
                  min={0}
                  max={100}
                  value={settings?.advanceRecoupmentRatePercent}
                  invalid={!!state.errors?.advanceRecoupmentRatePercent}
                />
              </Field>

              <Field
                label="Minimum interim certificate"
                htmlFor="ctl-minimumInterimCertificate"
                hint="Below this, a certificate waits for the next one."
                error={state.errors?.minimumInterimCertificate}
              >
                <AffixInput
                  id="ctl-minimumInterimCertificate"
                  prefix="RM"
                  name="minimumInterimCertificate"
                  inputMode="decimal"
                  className="[&_input]:text-right"
                  aria-invalid={state.errors?.minimumInterimCertificate ? true : undefined}
                  defaultValue={
                    settings?.minimumInterimCertificate
                      ? senToDecimalString(parseSen(settings.minimumInterimCertificate))
                      : ""
                  }
                />
              </Field>

              <Field
                label="Payment target"
                htmlFor="ctl-paymentTargetDays"
                hint="Days from certification to payment."
                error={state.errors?.paymentTargetDays}
              >
                <Suffixed
                  name="paymentTargetDays"
                  suffix="days"
                  min={0}
                  max={365}
                  value={settings?.paymentTargetDays}
                  invalid={!!state.errors?.paymentTargetDays}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        {dirty && (
          <SaveBar
            message={state.message ?? "Leaving this screen will lose them."}
            pending={pending}
            onDiscard={() => {
              setDirty(false);
              setCheck(settings?.availabilityCheck ?? "");
              setOverrides(settings?.overrideRoleCodes ?? []);
              formRef.current?.reset();
            }}
          />
        )}
        {saved && !dirty && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3" role="status">
            <CheckIcon size={14} className="text-emerald-600" />
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}

/// The bar that appears once something has changed: say so, and offer to keep it.
/// Finance & Operations uses it too, without a Discard.
export function SaveBar({
  message,
  pending,
  onDiscard,
}: {
  message: ReactNode;
  pending: boolean;
  onDiscard?: () => void;
}) {
  return (
    <div
      className="sticky bottom-4 z-10 flex items-center gap-3 rounded-card border border-line/70 bg-surface px-5 py-3.5 shadow-pop"
      role="status"
    >
      <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-ink">Unsaved changes</div>
        <div className="text-[12.5px] text-ink-3">{message}</div>
      </div>
      {onDiscard && (
        <Button size="sm" disabled={pending} onClick={onDiscard}>
          Discard
        </Button>
      )}
      <Button type="submit" variant="primary" size="sm" disabled={pending} icon={<SaveIcon size={15} />}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

/// A number with its unit after it. Empty means not set, never nought.
function Suffixed({
  name,
  suffix,
  min,
  max,
  value,
  invalid,
}: {
  name: string;
  suffix: string;
  min: number;
  max: number;
  value: number | null | undefined;
  invalid?: boolean;
}) {
  return (
    <AffixInput
      id={`ctl-${name}`}
      type="number"
      inputMode="decimal"
      name={name}
      min={min}
      max={max}
      step={1}
      suffix={suffix}
      className="[&_input]:text-right"
      aria-invalid={invalid ? true : undefined}
      defaultValue={value ?? ""}
    />
  );
}

/// Which roles may proceed past a failed check.
function RoleTokens({
  roles,
  chosen,
  onChange,
}: {
  roles: { code: string; nameEn: string }[];
  chosen: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const nameOf = (code: string) => roles.find((r) => r.code === code)?.nameEn ?? code;
  const available = roles.filter((r) => !chosen.includes(r.code));

  return (
    <div className="relative">
      <input type="hidden" name="overrideRoleCodes" value={chosen.join("\n")} />
      <div
        role="group"
        aria-label="May override the check"
        onClick={() => setOpen(true)}
        className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-control border border-line-2 bg-surface px-2 py-1.5 transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15"
      >
        {chosen.map((code) => (
          <span
            key={code}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 py-0.5 pr-1 pl-2.5 text-[12.5px] font-medium text-brand-800"
          >
            <span className="truncate" title={nameOf(code)}>
              {nameOf(code)}
            </span>
            <button
              type="button"
              className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-brand-100"
              aria-label={`Remove ${nameOf(code)}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(chosen.filter((c) => c !== code));
              }}
            >
              <XIcon size={11} />
            </button>
          </span>
        ))}
        <input
          className="h-7 min-w-24 flex-1 bg-transparent px-1 text-[13.5px] outline-none placeholder:text-ink-4"
          placeholder={chosen.length ? "" : "Nobody"}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          readOnly
        />
      </div>
      {open && (
        <div
          className="absolute inset-x-0 top-[calc(100%+6px)] z-10 max-h-64 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
          role="listbox"
          aria-multiselectable="true"
        >
          {available.length === 0 ? (
            <div className="px-3 py-2 text-[13px] text-ink-3">Every role is already named</div>
          ) : (
            available.map((r) => (
              <button
                key={r.code}
                type="button"
                className="block w-full rounded-xl px-3 py-2 text-left text-[13.5px] text-ink hover:bg-sunken"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange([...chosen, r.code])}
              >
                {r.nameEn}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
