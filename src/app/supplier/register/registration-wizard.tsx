"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";

import { RegistrationSummaryCards } from "@/components/registration-summary";
import { CheckIcon } from "@/components/icons";
import { CodesFields, type CodeSearch } from "@/components/registration/codes-fields";
import { CompanyFields, EMPTY_COMPANY } from "@/components/registration/company-fields";
import { DeclarationCard } from "@/components/registration/declaration-card";
import { blankDocRow, clickedRowKey, DocumentsFields, startingDocRows, type DocTypeView, type RowFiles } from "@/components/registration/documents-fields";
import { banksClosedWords, EpaymentFields } from "@/components/registration/epayment-fields";
import { errorText, faultsAt } from "@/components/registration/faults";
import { FaultSummary, StepFooter } from "@/components/registration/step-footer";
import { TermsCard } from "@/components/registration/terms-card";
import { Blocked } from "@/components/ui/blocked";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Callout, Note } from "@/components/ui/feedback";
import { Stepper } from "@/components/ui/stepper";
import { FORM_TOKEN_HEADER } from "@/lib/auth/form-token-shape";
import { formatBytes } from "@/lib/documents/labels";
import { HONEYPOT_FIELD } from "@/lib/portal/apply";
import { APPLY, PORTAL_PATH } from "@/lib/portal/labels";
import type { PublicRegistrationConfig } from "@/lib/portal/register/config";
import { REGISTER_VALUES_MAX_HITS, REGISTER_VALUES_MIN_QUERY, type TokenReply, type ValueHit } from "@/lib/portal/register/contract";
import { heldDraft } from "@/lib/portal/register/held-draft";
import { summaryRecordOfHeld } from "@/lib/portal/register/summary-record";
import { browserContext, emptyWizard, firstFaultStep, formParts, heldBody, heldSummaryState, readValues, sendApplication, sentRows, stepCheck, stepIndex, summaryListsOf, wizardReducer, type Outcome, type Transport, type WizardState } from "@/lib/portal/register/wizard";
import { registrationSummary, type SummarySection } from "@/lib/portal/registration/summary";
import { EMPTY_CREDITOR, REGISTRATION_STEPS, type RegistrationStep } from "@/lib/portal/registration/types";
import { valueLabel } from "@/lib/portal/registration/values";
import { codeSectionShapesOf, creditorPrefill, liveTypes, requirementOf, STEP_INFO } from "@/lib/portal/registration/view";
import { REGISTER_TOKEN_PATH, REGISTER_VALUES_PATH, SUBMIT_PATH } from "@/lib/portal/surface";
import { formatDate } from "@/lib/format";
import type { StepperStep } from "@/lib/ui/steps";

/**
 * The public registration form (ADR 0041, plan section 4): five steps held in this page for one visit, and sent together, once, at Submit on step 5. Nothing is saved: leaving loses it,
 * and the page says so under its title, asks before its own links are followed, and lets the browser warn on a reload or close (REG-4(c)).
 *
 * Each Next runs the server's own rules on what is held (a convenience; the server's answer at Submit is final). The review is the one registration summary the office will read. The
 * agreements are the applicant's ticks, never signatures: nobody is signed in. A refusal comes back by step and field, and the page goes to the first step at fault with everything kept.
 * The token rides in `x-form-token`; a send with no clear answer is sent again with the same token, so one visit makes at most one application.
 */

type State = WizardState<File>;

/// The parts as one multipart body, sent by XMLHttpRequest so the button can say how far it has got. Any answer is read as text: the boundary's 404 is not JSON.
function postParts(token: string, parts: [string, string | File][], progress: (fraction: number) => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    const form = new FormData();
    for (const [name, value] of parts) form.append(name, value);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", SUBMIT_PATH);
    xhr.setRequestHeader(FORM_TOKEN_HEADER, token);
    xhr.upload.onprogress = (e) => progress(e.lengthComputable && e.total > 0 ? e.loaded / e.total : 0);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ status: 0, body: null });
    xhr.ontimeout = () => resolve({ status: 0, body: null });
    xhr.onabort = () => resolve({ status: 0, body: null });
    xhr.send(form);
  });
}

async function freshToken(): Promise<string | null> {
  try {
    const res = await fetch(REGISTER_TOKEN_PATH, { credentials: "same-origin", cache: "no-store" });
    const body = (await res.json()) as TokenReply;
    return body.ok ? body.token : null;
  } catch {
    return null;
  }
}

const TRANSPORT: Transport<File> = { post: postParts, freshToken };

const SECTION_STEP: Partial<Record<SummarySection["key"], RegistrationStep>> = { company: "company", contacts: "company", documents: "documents", codes: "codes", creditor: "epayment" };

export function RegistrationWizard({
  config,
  token: initialToken,
  initialState,
  header = null,
  sentHeader = null,
}: {
  config: PublicRegistrationConfig;
  token: string;
  /// The page's header while the form is open ("Nothing is saved until you submit.", and the way back), and once the application is sent (neither: the card says what next).
  header?: ReactNode;
  sentHeader?: ReactNode;
  /// Where the page starts. Absent (always, on the page): empty, at step 1. A test starts a later step with something held.
  initialState?: State;
}) {
  const types: DocTypeView[] = useMemo(
    () =>
      liveTypes({ ...config.context, values: [], supplier: { registrationNoKey: "", contactName: "" } }).map((t) => ({
        id: t.id,
        name: t.nameEn,
        hint: t.hintEn?.trim() ? t.hintEn : null,
        requirement: requirementOf(t),
        expires: t.expires,
        recordsRate: t.recordsRate === true,
        repeatable: t.repeatable === true,
        notApplicableAllowed: t.notApplicableAllowed === true,
      })),
    [config.context],
  );
  const [state, dispatch] = useReducer(wizardReducer<File>, undefined, () => initialState ?? emptyWizard<File>(EMPTY_COMPANY, startingDocRows(types, [], blankDocRow), EMPTY_CREDITOR));
  const [prefilled, setPrefilled] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<number | null>(null);
  /// The last Submit's refusal, in the server's words. One that came with findings goes once the applicant has answered every blocking one of them (the reducer takes each away as its
  /// field changes); the rest stay until the next Submit.
  const [refusal, setRefusal] = useState<{ message: string; withFaults: boolean } | null>(null);
  const [done, setDone] = useState<{ reference: string | null } | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const token = useRef(initialToken);
  const sentToken = useRef<string | null>(null);
  const searchToken = useRef(initialToken);
  const bait = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const doneHeading = useRef<HTMLSpanElement>(null);
  const armed = state.touched && done == null;
  const leavingNow = useRef(false);

  // The browser's own warning on a reload or close, once anything is typed or held; none after Submit. No words of ours: browsers show their own.
  useEffect(() => {
    if (!armed) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (!leavingNow.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [armed]);

  // The page's own links that leave it (the portal's logo, the footer, Back): asked first, while anything is held.
  useEffect(() => {
    if (!armed) return;
    const ask = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.closest('[aria-modal="true"]')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.hash)) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(url.href);
    };
    document.addEventListener("click", ask, true);
    return () => document.removeEventListener("click", ask, true);
  }, [armed]);

  useEffect(() => {
    if (done) doneHeading.current?.focus();
  }, [done]);

  // After a move between steps, the top of the step is in view and the first field at fault has the focus.
  const focusFirst = useCallback(() => {
    setTimeout(() => {
      top.current?.scrollIntoView?.({ block: "start" });
      const bad = top.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      bad?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const step = state.step;
  const at = stepIndex(step);
  const ctx = useMemo(() => browserContext(state, config), [state, config]);
  const faults = state.faults.filter((f) => f.step === step);

  function next() {
    const found = stepCheck(step, state, config);
    dispatch({ type: "next", faults: found });
    // Into step 4 for the first time: the beneficiary's email and tax number from what step 1 and 2 hold, said under each.
    if (step === "codes" && !found.some((f) => f.level === "block")) {
      const pre = creditorPrefill({ creditor: state.creditor, documents: sentRows(state) }, config.context, state.company.companyEmail);
      if (Object.keys(pre.values).length) {
        dispatch({ type: "epayment", creditor: { ...state.creditor, ...pre.values }, signatoryName: state.signatoryName || state.company.contact.name, signatoryDesignation: state.signatoryDesignation || state.company.contact.designation, giroConfirmed: state.giroConfirmed });
        setPrefilled(pre.said);
      }
    }
    focusFirst();
  }

  function goTo(s: RegistrationStep) {
    dispatch({ type: "goTo", step: s });
    focusFirst();
  }

  // ---- the code search ----------------------------------------------------------
  const searchFor = useCallback(
    (bodyId: string, kind: string): CodeSearch => ({
      minChars: REGISTER_VALUES_MIN_QUERY,
      load: async (q, signal) => {
        const ask = async (t: string) => {
          const url = `${REGISTER_VALUES_PATH}?body=${encodeURIComponent(bodyId)}&kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(q)}`;
          const res = await fetch(url, { signal, credentials: "same-origin", cache: "no-store", headers: { [FORM_TOKEN_HEADER]: t } });
          return readValues(res.status, await res.json().catch(() => null));
        };
        let got = await ask(searchToken.current);
        if ("expired" in got) {
          const fresh = await freshToken();
          if (!fresh) throw new Error("No fresh token.");
          searchToken.current = fresh;
          // A token whose send is still awaiting an answer is never swapped (one visit, one application).
          if (sentToken.current == null) token.current = fresh;
          got = await ask(fresh);
          if ("expired" in got) throw new Error("The token was refused.");
        }
        const hits: ValueHit[] = got.hits;
        dispatch({ type: "hits", hits });
        return { options: hits.map((h) => ({ value: h.id, label: valueLabel({ code: h.code, nameEn: h.name }) })), hasMore: hits.length >= REGISTER_VALUES_MAX_HITS };
      },
    }),
    [],
  );

  // ---- Submit -------------------------------------------------------------------
  async function submit() {
    if (sending != null) return;
    setRefusal(null);
    // The page's own check first: a fault anywhere sends the applicant to it, and nothing is sent.
    const found = stepCheck("review", state, config);
    const first = firstFaultStep(found);
    if (first) {
      dispatch({ type: "faults", faults: found, step: first });
      focusFirst();
      return;
    }
    setSending(0);
    const result = await sendApplication<File>({
      token: token.current,
      sentToken: sentToken.current,
      parts: () => formParts(state, config, bait.current?.value ?? ""),
      transport: TRANSPORT,
      progress: (f) => setSending(Math.round(f * 100)),
    });
    token.current = result.token;
    sentToken.current = result.sentToken;
    setSending(null);
    land(result.outcome);
  }

  function land(outcome: Outcome) {
    switch (outcome.kind) {
      case "ok":
        setDone({ reference: outcome.reference });
        return;
      case "faults": {
        const first = firstFaultStep(outcome.faults) ?? "review";
        dispatch({ type: "faults", faults: outcome.faults, step: first });
        setRefusal({ message: outcome.message, withFaults: outcome.faults.some((f) => f.level === "block") });
        focusFirst();
        return;
      }
      default:
        setRefusal({ message: outcome.message, withFaults: false });
    }
  }

  // ---- after Submit -------------------------------------------------------------
  if (done) {
    return (
      <>
        {sentHeader}
        <Card>
        <CardHeader
          icon={<CheckIcon size={17} />}
          title={
            <span ref={doneHeading} tabIndex={-1} className="outline-none">
              {done.reference ? APPLY.sentTitle.en : APPLY.sentNoReference.en}
            </span>
          }
        />
        <CardBody className="flex flex-col gap-5" role="status">
          {done.reference && (
            <div>
              <p className="text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">{APPLY.referenceLabel.en}</p>
              <p className="mt-1 text-[26px] font-bold tracking-tight text-ink [overflow-wrap:anywhere]">{done.reference}</p>
              <p className="mt-2 text-[14px] text-ink-2">{APPLY.keepReference.en}</p>
            </div>
          )}
          {config.verificationNoticeEn && (
            <Note title={APPLY.officeNoticeTitle.en}>
              <span className="whitespace-pre-line">{config.verificationNoticeEn}</span>
            </Note>
          )}
          <div>
            <ButtonLink href={PORTAL_PATH.home} variant="secondary" size="md">
              {APPLY.backToHome.en}
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
      </>
    );
  }

  // ---- the five steps -----------------------------------------------------------
  const steps: StepperStep[] = STEP_INFO.map((s, i) => ({
    key: s.key,
    label: s.label,
    state: i === at ? "current" : i <= state.reached ? "done" : "waiting",
    // Not while sending: what is being sent is what the page held at Submit.
    ...(i !== at && i <= state.reached && sending == null ? { onSelect: () => goTo(s.key) } : {}),
  }));
  const busy = sending != null;
  const back = at > 0 ? () => goTo(REGISTRATION_STEPS[at - 1]!) : undefined;
  const filesOf = (key: string): RowFiles => ({
    mode: "held",
    files: (state.files[key] ?? []).map((f) => ({ name: f.name, size: formatBytes(BigInt(f.size)) })),
    add: (file) => dispatch({ type: "addFile", key, file }),
    remove: (index) => dispatch({ type: "removeFile", key, index }),
  });
  const body = heldBody(state, config);

  return (
    <>
    {header}
    <div className="flex flex-col gap-6">
      <Stepper label={APPLY.stepsLabel.en} steps={steps} selected={step} />
      {/* The bait field: off the screen, out of the tab order and out of the accessibility tree, so only a script fills it. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <input ref={bait} type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div ref={top} className="scroll-mt-6">
        {step !== "review" ? (
          <Card>
            <CardHeader title={APPLY.stepOf(at + 1, STEP_INFO.length, STEP_INFO[at]!.label).en} />
            <CardBody>
              <FaultSummary faults={faults} />
              {step === "company" && (
                <CompanyFields
                  value={state.company}
                  onChange={(value) => dispatch({ type: "company", value })}
                  faults={faults}
                  entityTypes={config.lists.entityTypes}
                  countries={config.lists.countries}
                  states={config.lists.states}
                  bumiputeraStatuses={config.lists.bumiputeraStatuses}
                  contactNeedsEmailAndPhone={config.step1.contactNeedsEmailAndPhone === true}
                  formatExample={config.formatExample}
                />
              )}
              {step === "documents" && (
                <DocumentsFields
                  types={types}
                  rows={state.documents}
                  onChange={(rows) => dispatch({ type: "documents", rows })}
                  faults={faults}
                  filesOf={(r) => filesOf(r.id)}
                  newRow={(typeId) => blankDocRow(typeId, clickedRowKey())}
                  uploadClosed={null}
                  acceptNote={config.upload.acceptNote}
                  accept={config.upload.accept}
                  busy={busy}
                />
              )}
              {step === "codes" && (
                <CodesFields
                  sections={codeSectionShapesOf(heldDraft(body, new Map(), 0).documents, ctx)}
                  chosen={state.chosen}
                  onChange={(chosen) => dispatch({ type: "codes", chosen })}
                  labels={Object.fromEntries(Object.values(state.hits).map((h) => [h.id, valueLabel({ code: h.code, nameEn: h.name })]))}
                  faults={faults}
                  searchFor={searchFor}
                  documentsLink={(label) => (
                    <Button size="sm" variant="link" onClick={() => goTo("documents")}>
                      {label}
                    </Button>
                  )}
                />
              )}
              {step === "epayment" && (
                <EpaymentFields
                  value={{ creditor: state.creditor, signatoryName: state.signatoryName, signatoryDesignation: state.signatoryDesignation, giroConfirmed: state.giroConfirmed }}
                  onChange={(v) => dispatch({ type: "epayment", ...v })}
                  banks={config.context.banks.map((b) => ({ value: b.code, label: b.nameEn }))}
                  accountTypes={config.context.accountTypes.map((b) => ({ value: b.code, label: b.nameEn }))}
                  statement={{
                    mode: "held",
                    files: state.statement.map((f) => ({ name: f.name, size: formatBytes(BigInt(f.size)) })),
                    add: (file) => dispatch({ type: "addStatement", file }),
                    remove: (index) => dispatch({ type: "removeStatement", index }),
                  }}
                  uploadClosed={null}
                  giro={{ text: config.texts.GIRO_AUTHORISATION }}
                  giroVoided={false}
                  acceptNote={config.upload.acceptNote}
                  accept={config.upload.accept}
                  prefilled={prefilled}
                  faults={faults}
                  busy={busy}
                  words={{ signatory: APPLY.giroSignatory.en, dated: APPLY.giroDated.en, signed: null }}
                />
              )}
              <StepFooter
                backHref={null}
                onBack={back}
                onNext={next}
                busy={busy}
                message={null}
                saved={null}
                stale={false}
                closedReason={step === "epayment" ? banksClosedWords(config.context.banks, config.context.accountTypes) : null}
              />
            </CardBody>
          </Card>
        ) : (
          <Review
            state={state}
            config={config}
            onEdit={goTo}
            onBack={() => goTo("epayment")}
            onFalseDeclaration={(confirmed) => dispatch({ type: "falseDeclaration", confirmed })}
            onTerms={(confirmed) => dispatch({ type: "terms", confirmed })}
            onSubmit={submit}
            sending={sending}
            refusal={refusal && (!refusal.withFaults || state.faults.some((f) => f.level === "block")) ? refusal.message : null}
          />
        )}
      </div>
      {leaving && (
        <ConfirmDialog
          question={APPLY.leaveQuestion.en}
          confirmLabel={APPLY.leave.en}
          cancelLabel={APPLY.stay.en}
          destructive
          onCancel={() => setLeaving(null)}
          onConfirm={() => {
            // Disarmed first, so the browser does not ask a second time.
            leavingNow.current = true;
            window.location.assign(leaving);
          }}
        />
      )}
    </div>
    </>
  );
}

/// Step 5: what will be sent, as the office will read it; the declaration with its own tick; the terms card; then Submit, blocked with its reason until both are ticked.
function Review({
  state,
  config,
  onEdit,
  onBack,
  onFalseDeclaration,
  onTerms,
  onSubmit,
  sending,
  refusal,
}: {
  state: State;
  config: PublicRegistrationConfig;
  onEdit: (step: RegistrationStep) => void;
  onBack: () => void;
  onFalseDeclaration: (confirmed: boolean) => void;
  onTerms: (confirmed: boolean) => void;
  onSubmit: () => void;
  sending: number | null;
  refusal: string | null;
}) {
  const faults = state.faults.filter((f) => f.step === "review");
  const sections = registrationSummary(summaryRecordOfHeld(heldSummaryState(state, config), { ...summaryListsOf(config), types: config.context.types }), { day: formatDate }).filter((s) => s.key !== "declarations");
  const actions = Object.fromEntries(
    sections.flatMap((s) => {
      const to = SECTION_STEP[s.key];
      return to
        ? [
            [
              s.key,
              <Button key={s.key} size="sm" variant="link" disabled={sending != null} onClick={() => onEdit(to)} aria-label={`${APPLY.edit.en} ${s.title}`}>
                {APPLY.edit.en}
              </Button>,
            ],
          ]
        : [];
    }),
  );
  const declaration = config.texts.FALSE_DECLARATION;
  return (
    <Card>
      <CardHeader title={APPLY.stepOf(5, STEP_INFO.length, STEP_INFO[4]!.label).en} />
      <CardBody>
        <FaultSummary faults={faults} />
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-3 text-[14.5px] font-bold text-ink">{APPLY.reviewTitle.en}</h3>
            <RegistrationSummaryCards sections={sections} actions={actions} />
          </div>
          <DeclarationCard
            text={declaration?.en ?? null}
            byLine={APPLY.declarationBy(state.signatoryName, state.signatoryDesignation).en}
            confirmed={state.falseDeclaration}
            onConfirm={onFalseDeclaration}
            error={errorText(faultsAt(faults, "declaration.confirmed"))}
          />
          <TermsCard terms={config.texts.TERMS_AND_CONDITIONS} notice={config.notice} confirmed={state.terms} onConfirm={onTerms} />
          {refusal && (
            <Callout tone="err" title={APPLY.notSentTitle.en}>
              {refusal}
            </Callout>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="button" variant="secondary" onClick={onBack} disabled={sending != null}>
              Back
            </Button>
            <span className="ml-auto flex flex-col items-end gap-1.5">
              {sending != null ? (
                <Button type="button" variant="primary" disabled aria-busy>
                  {APPLY.sendingPercent(sending).en}
                </Button>
              ) : !state.falseDeclaration ? (
                <Blocked label={APPLY.submit.en} primary reason={APPLY.tickDeclaration.en} />
              ) : !state.terms ? (
                <Blocked label={APPLY.submit.en} primary reason={APPLY.tickToSubmit.en} />
              ) : (
                <Button type="button" variant="primary" onClick={onSubmit}>
                  {APPLY.submit.en}
                </Button>
              )}
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
