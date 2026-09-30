"use client";

import { formDataOf } from "@/components/ui/form-submit";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { AlertTriangle, CheckIcon, GridIcon, SaveIcon, ShieldIcon, XIcon } from "@/components/icons";
import { type FormState } from "@/components/record-editor";
import { type BudgetCode, type Movement } from "@/lib/budget/codes";
import type { BudgetControls } from "@/lib/budget/load";
import { OUTCOME_WORD, workedExample } from "@/lib/budget/controls";
import { formatCompactRM } from "@/lib/format";
import { parseSen, senToDecimalString } from "@/lib/money";

import { clearBudgetControls, saveBudgetControls } from "./actions";

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
      await clearBudgetControls();
      setCheck("");
      setOverrides([]);
      setSaved(false);
      setState({ ok: false });
    });
  };

  return (
    <form onSubmit={(e) => submit(formDataOf(e))} ref={formRef} onChange={() => setDirty(true)}>
      <div className="stack stack--lg">
        <section className="card">
          <div className="card__head">
            <ShieldIcon size={17} className="icon dim" />
            <div className="card__titles">
              <div className="h3 trunc">Availability check</div>
              <div className="card__sub trunc">
                What the portal does when a requirement exceeds the balance on its code.
              </div>
            </div>
            <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
              {/* The sample says "Restore defaults". This product ships none — a
                  threshold baked in here would be one customer's policy arriving as
                  software — so the button says what it actually does. */}
              <button type="button" className="btn btn--sm" disabled={pending} onClick={clear}>
                Clear these settings
              </button>
            </div>
          </div>
          <div className="card__body">
            <div>
              <Setting
                title="Availability check"
                hint="Blocking holds the requirement until someone overrides it. Advisory shows a warning and lets the raiser continue."
                error={state.errors?.availabilityCheck}
              >
                <select
                  className="select select--sm"
                  name="availabilityCheck"
                  aria-label="Availability check"
                  value={check}
                  onChange={(e) => setCheck(e.target.value)}
                >
                  <option value="">Not set</option>
                  <option value="blocking">Blocking</option>
                  <option value="advisory">Advisory</option>
                </select>
              </Setting>

              <Setting
                title="Warning threshold"
                hint="Utilisation at which a budget code is flagged as running low. Leave it empty and none is."
                error={state.errors?.warningThresholdPercent}
              >
                <Suffixed
                  name="warningThresholdPercent"
                  label="Warning threshold"
                  suffix="%"
                  min={0}
                  max={100}
                  value={settings?.warningThresholdPercent}
                />
              </Setting>

              <Setting
                title="Over-commitment tolerance"
                hint="How far past the balance a requirement may go before the check bites."
                error={state.errors?.overCommitmentTolerancePercent}
              >
                <Suffixed
                  name="overCommitmentTolerancePercent"
                  label="Over-commitment tolerance"
                  suffix="%"
                  min={0}
                  max={100}
                  value={settings?.overCommitmentTolerancePercent}
                />
              </Setting>

              <Setting
                title="May override the check"
                hint="Roles that can proceed past a failed check. Nobody, unless named here."
              >
                <RoleTokens roles={roles} chosen={overrides} onChange={setOverrides} />
              </Setting>

              <Setting
                title="Commit on approval"
                hint="Whether approving a requirement holds the budget there and then."
              >
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <label className="switch">
                    <input
                      type="checkbox"
                      role="switch"
                      name="commitOnApproval"
                      defaultChecked={settings?.commitOnApproval === true}
                    />
                    <span className="switch__track">
                      <span className="switch__knob" />
                    </span>
                  </label>
                </div>
              </Setting>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card__head">
            <GridIcon size={17} className="icon dim" />
            <div className="card__titles">
              <div className="h3 trunc">What this means in practice</div>
            </div>
          </div>
          <div className="card__body card__body--tight">
            {example == null ? (
              <div style={{ padding: "4px 4px 8px" }}>
                <span className="xs dim">
                  No budget code carries an allocation yet, so there is nothing to work
                  the check through.
                </span>
              </div>
            ) : (
              <div style={{ padding: "4px 4px 8px" }}>
                <div className="row wrap" style={{ gap: 12 }}>
                  <div className="cfg-kpi">
                    <span className="cfg-kpi__k">Budget code</span>
                    <span className="cfg-kpi__v">
                      <span className="mono">{example.code.code}</span>
                    </span>
                    <span className="cfg-kpi__h">{example.code.descriptionEn}</span>
                  </div>
                  <div className="cfg-kpi">
                    <span className="cfg-kpi__k">Available</span>
                    <span className="cfg-kpi__v">{formatCompactRM(example.available)}</span>
                  </div>
                  <div className="cfg-kpi">
                    <span className="cfg-kpi__k">Amount</span>
                    <span className="cfg-kpi__v">{formatCompactRM(example.amount)}</span>
                    <span className="cfg-kpi__h">A sen more than is left, so the setting shows</span>
                  </div>
                  <div className="cfg-kpi" data-tone={example.outcome === "RELEASED" ? "ok" : "warn"}>
                    <span className="cfg-kpi__k">Utilisation</span>
                    <span className="cfg-kpi__v">
                      {example.utilisationAfter == null
                        ? "Not set"
                        : `${Math.round(example.utilisationAfter)}%`}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <div
                    className={`callout ${
                      example.outcome === "RELEASED"
                        ? "callout--ok"
                        : example.outcome === "NOT_SET"
                          ? "callout--info"
                          : "callout--warn"
                    }`}
                  >
                    <span className="callout__ico">
                      {example.outcome === "RELEASED" ? (
                        <CheckIcon size={16} />
                      ) : example.outcome === "NOT_SET" ? (
                        <AlertTriangle size={16} />
                      ) : (
                        <XIcon size={16} />
                      )}
                    </span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="callout__title">{OUTCOME_WORD[example.outcome]}</div>
                      <span className="sm">
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
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card__head">
            <SaveIcon size={17} className="icon dim" />
            <div className="card__titles">
              <div className="h3 trunc">Payment defaults</div>
              <div className="card__sub trunc">
                Applied to every certificate unless the contract says otherwise.
              </div>
            </div>
          </div>
          <div className="card__body">
            <div>
              <Setting
                title="Advance recoupment rate"
                hint="How much of each certificate goes to recovering an advance."
                error={state.errors?.advanceRecoupmentRatePercent}
              >
                <Suffixed
                  name="advanceRecoupmentRatePercent"
                  label="Advance recoupment rate"
                  suffix="%"
                  min={0}
                  max={100}
                  value={settings?.advanceRecoupmentRatePercent}
                />
              </Setting>

              <Setting
                title="Minimum interim certificate"
                hint="Below this, a certificate waits for the next one."
                error={state.errors?.minimumInterimCertificate}
              >
                <span className="inputwrap inputwrap--pre">
                  <span className="inputwrap__pre">RM</span>
                  <input
                    className="input input--num input--sm"
                    name="minimumInterimCertificate"
                    inputMode="decimal"
                    aria-label="Minimum interim certificate"
                    style={{ paddingLeft: 36 }}
                    defaultValue={
                      settings?.minimumInterimCertificate
                        ? senToDecimalString(parseSen(settings.minimumInterimCertificate))
                        : ""
                    }
                  />
                </span>
              </Setting>

              <Setting
                title="Payment target"
                hint="Days from certification to payment."
                error={state.errors?.paymentTargetDays}
              >
                <Suffixed
                  name="paymentTargetDays"
                  label="Payment target"
                  suffix="days"
                  min={0}
                  max={365}
                  value={settings?.paymentTargetDays}
                  cfgSuffix
                />
              </Setting>
            </div>
          </div>
        </section>

        {dirty && (
          <div className="cfg-savebar" role="status">
            <span className="cfg-dot" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div className="cfg-savebar__t">Unsaved changes</div>
              <div className="cfg-savebar__s">
                {state.message ?? "Leaving this screen will lose them."}
              </div>
            </div>
            <div className="spacer" />
            <button
              type="button"
              className="btn btn--sm"
              disabled={pending}
              onClick={() => {
                setDirty(false);
                setCheck(settings?.availabilityCheck ?? "");
                setOverrides(settings?.overrideRoleCodes ?? []);
                formRef.current?.reset();
              }}
            >
              Discard
            </button>
            <button type="submit" className="btn btn--sm btn--primary" disabled={pending}>
              <SaveIcon size={15} />
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
        {saved && !dirty && <span className="sm dim">Saved.</span>}
      </div>
    </form>
  );
}

function Setting({
  title,
  hint,
  error,
  children,
}: {
  title: string;
  hint: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="cfg-set">
      <div className="cfg-set__l">
        <span className="cfg-set__t">{title}</span>
        <span className="cfg-set__h">{hint}</span>
        {error && (
          <span className="field__err">
            <AlertTriangle size={13} />
            {error}
          </span>
        )}
      </div>
      <div className="cfg-set__c">{children}</div>
    </div>
  );
}

/// A number with its unit after it. Empty means not set, never nought.
function Suffixed({
  name,
  label,
  suffix,
  min,
  max,
  value,
  cfgSuffix,
}: {
  name: string;
  label: string;
  suffix: string;
  min: number;
  max: number;
  value: number | null | undefined;
  cfgSuffix?: boolean;
}) {
  return (
    <span
      className={`inputwrap inputwrap--post${cfgSuffix ? " cfg-suf" : ""}`}
      style={{ width: "100%" }}
    >
      <input
        className="input input--num input--sm"
        type="number"
        inputMode="decimal"
        name={name}
        aria-label={label}
        min={min}
        max={max}
        step={1}
        defaultValue={value ?? ""}
      />
      <span className="inputwrap__post">{suffix}</span>
    </span>
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
    <div className="combo">
      <input type="hidden" name="overrideRoleCodes" value={chosen.join("\n")} />
      <div className="tokens" role="group" onClick={() => setOpen(true)}>
        {chosen.map((code) => (
          <span key={code} className="tag">
            {nameOf(code)}
            <button
              type="button"
              className="tag__x"
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
          className="grow"
          style={{
            border: 0,
            outline: "none",
            minWidth: 90,
            height: 26,
            fontSize: "13.5px",
            background: "transparent",
          }}
          placeholder={chosen.length ? "" : "Nobody"}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          readOnly
        />
      </div>
      {open && (
        <div className="combo__menu" role="listbox" aria-multiselectable="true">
          {available.length === 0 ? (
            <div className="combo__empty">Every role is already named</div>
          ) : (
            available.map((r) => (
              <button
                key={r.code}
                type="button"
                className="combo__opt"
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
