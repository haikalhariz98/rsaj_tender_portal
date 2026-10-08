import type { Metadata } from "next";
import Link from "next/link";

import { RegistrationSummaryCards } from "@/components/registration-summary";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Stepper } from "@/components/ui/stepper";
import { KeyValues } from "@/components/ui/stat";
import { CREDITOR_PROFILE_FIELDS, creditorEventRow, OWN_RECORD, writeSupplierSulitEvent } from "@/lib/auth/creditor-access-store";
import { issueFormToken } from "@/lib/auth/form-secret";
import { sulitGranted } from "@/lib/auth/sulit-access";
import { db } from "@/lib/db";
import { formatBytes, mediaLabel } from "@/lib/documents/labels";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { loadRegistrationContext, loadRegistrationSettings } from "@/lib/portal/registration/context-store";
import { draftOf, loadDraftView, loadWizardState } from "@/lib/portal/registration/draft-store";
import { blockingFaults, registrationFaults } from "@/lib/portal/registration/faults";
import { registrationSummary, type SummaryRecord } from "@/lib/portal/registration/summary";
import { creditorSummaryOf, draftDocumentsSummary, loadCompanySummary, loadContactsSummary, loadCreditorRows, loadDeclarationsSummary, loadSentDocumentsSummary } from "@/lib/portal/registration/summary-store";
import { isRegistrationStep, REGISTRATION_STEPS, type RegistrationStep } from "@/lib/portal/registration/types";
import { loadUploadSettings } from "@/lib/portal/registration/upload-settings";
import { acceptNote, codeSectionShapes, creditorPrefill, declarationShown, liveTypes, needList, requirementOf, STEP_INFO, stepTitle, uploadClosedWords } from "@/lib/portal/registration/view";
import { wizardClosedWords } from "@/lib/portal/registration/state";
import { registrationFaultText } from "@/lib/portal/registration/words";
import { valueLabel } from "@/lib/portal/registration/values";
import type { StepperStep } from "@/lib/ui/steps";

import { requireSupplier } from "../../_auth/supplier";
import { CodesStep } from "./codes-step";
import { DocumentsStep } from "./documents-step";
import { EpaymentStep } from "./epayment-step";
import { faultViews } from "./reply";
import { ReviewStep } from "./review-step";

export const metadata: Metadata = { title: "Registration" };
export const dynamic = "force-dynamic";

/**
 * A signed-in supplier completes its registration (Phase 4b, CPD's steps 2 to 5): the documents, the work codes, the bank details with the GIRO authorisation, and the review and
 * send. Step 1 is the record as the procurement office accepted it, read-only. One step is shown at a time and only what that step needs is read. The supplier is the SESSION's: nothing in
 * the address names one. Everything the office decides (the documents it asks for, the lists, the texts, the notice, the limits) is its own configuration, and each that is not set
 * closes its step and says which.
 */
export default async function SupplierRegistrationPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const actor = await requireSupplier();
  const { step: asked } = await searchParams;
  const state = await loadWizardState(db, actor);
  const settings = await loadRegistrationSettings(db, actor.organisationId);

  if (!state || !settings) {
    return (
      <>
        <PageHeader title="Registration" />
        <Card>
          <CardBody>
            <p className="text-[14px] text-ink-2">Your registration could not be found. Tell the procurement office.</p>
          </CardBody>
        </Card>
      </>
    );
  }

  if (state === "SENT") return <Sent actor={actor} settings={settings} />;
  if (state !== "OPEN") {
    const words = wizardClosedWords(state);
    return (
      <>
        <PageHeader title="Registration" subtitle={actor.supplierName} />
        <Card className="max-w-3xl">
          <CardHeader title={words.title} />
          <CardBody>
            <p className="text-[14px] text-ink-2">{words.body}</p>
            <div className="mt-4">
              <ButtonLink href="/supplier/account" variant="secondary">
                Where your registration stands
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      </>
    );
  }

  const step: RegistrationStep = asked && isRegistrationStep(asked) ? asked : "documents";
  const view = await loadDraftView(db, actor);
  const ctx = await loadRegistrationContext(db, actor, settings, view.documents.flatMap((d) => d.valueIds));
  const draft = draftOf(view);
  const all = registrationFaults(draft, ctx);
  const blockedSteps = new Set(blockingFaults(all).map((f) => f.step));
  const token = issueFormToken("registration");
  const uploads = await loadUploadSettings(db, actor.organisationId, settings);
  const accept = acceptNote(uploads.store, mediaLabel, formatBytes);
  const zone = settings.org.timeZone;

  const at = REGISTRATION_STEPS.indexOf(step);
  const steps: StepperStep[] = STEP_INFO.map((s, i) => ({
    key: s.key,
    label: s.label,
    sub: s.sub,
    state: s.key === step ? "current" : s.key === "company" ? "done" : i < at && !blockedSteps.has(s.key) ? "done" : "waiting",
  }));

  return (
    <>
      <PageHeader
        title="Registration"
        badge={<Badge tone="warn">Draft</Badge>}
        subtitle={`${actor.supplierName}. Complete these steps and send them to the procurement office.`}
        meta={[view.lastSavedAt ? `Last saved ${formatOrgDateTime(view.lastSavedAt, zone)}` : "Nothing saved yet"]}
      />
      <div className="mb-6">
        <Stepper steps={steps} label="Registration steps" />
      </div>
      {!token && (
        <Callout tone="warn" title="This page is closed" className="mb-5">
          The portal&apos;s forms are closed: the person who runs the portal has not set its form key. Nothing can be saved or sent until they do.
        </Callout>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Card>
          <CardHeader title={`Step ${at + 1} of ${STEP_INFO.length}: ${stepTitle(step)}`} subtitle={STEP_INFO[at]!.sub} />
          <CardBody>
            {step === "company" && <CompanyStep actor={actor} />}
            {step === "documents" && (
              <DocumentsStep
                token={token}
                version={view.version}
                types={liveTypes(ctx).map((t) => ({
                  id: t.id,
                  name: t.nameEn,
                  hint: t.hintEn?.trim() ? t.hintEn : null,
                  requirement: requirementOf(t),
                  expires: t.expires,
                  recordsRate: t.recordsRate === true,
                  repeatable: t.repeatable === true,
                  notApplicableAllowed: t.notApplicableAllowed === true,
                }))}
                rows={view.documents.map((d) => ({
                  id: d.id,
                  typeId: d.typeId,
                  title: d.title,
                  reference: d.reference,
                  issuingAuthority: d.issuingAuthority,
                  expiresOn: d.expiresOn ?? "",
                  ratePercent: d.ratePercent ?? "",
                  notApplicable: d.notApplicable,
                  files: d.files.map((f) => ({ versionId: f.versionId, name: f.name, size: formatBytes(f.size) })),
                }))}
                uploadClosed={uploadClosedWords(uploads.store, uploads.document, "document")}
                acceptNote={accept}
              />
            )}
            {step === "codes" && <CodesStep token={token} version={view.version} sections={codeSectionShapes(view, ctx)} />}
            {step === "epayment" && <EpaymentPage actor={actor} view={view} ctx={ctx} settings={settings} token={token} accept={accept} uploads={uploads} />}
            {step === "review" && (
              <ReviewPage actor={actor} view={view} ctx={ctx} settings={settings} token={token} blockers={faultViews(blockingFaults(all))} />
            )}
          </CardBody>
        </Card>
        <Need ctx={ctx} settings={settings} accept={accept} />
      </div>
    </>
  );
}

// ------------------------------------------------------------------ step 1

async function CompanyStep({ actor }: { actor: Awaited<ReturnType<typeof requireSupplier>> }) {
  const company = await loadCompanySummary(db, actor, "APPLICATION");
  if (!company) return <p className="text-[14px] text-ink-2">Your company could not be found. Tell the procurement office.</p>;
  return (
    <div className="flex flex-col gap-4">
      <KeyValues
        columns={2}
        items={[
          { label: "Registered name", value: company.registeredName },
          { label: "Registration number", value: company.registrationNo },
          { label: "Business entity", value: company.entityTypeName ?? "Not listed" },
          { label: "Country", value: company.countryName ?? "Not listed" },
          { label: "Registered address", value: <span className="whitespace-pre-line">{company.addressLines.join("\n")}</span> },
          { label: "Date incorporated", value: company.incorporatedOn ? formatDate(company.incorporatedOn) : "Not given" },
          { label: "Company email", value: company.companyEmail },
        ]}
      />
      <p className="text-[13px] text-ink-3">This is your company as the procurement office accepted it. To correct these, contact the procurement office.</p>
      <div>
        <ButtonLink href="/supplier/registration?step=documents" variant="primary">
          Next: documents
        </ButtonLink>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ step 4

async function EpaymentPage({ actor, view, ctx, settings, token, accept, uploads }: { actor: Awaited<ReturnType<typeof requireSupplier>>; view: Awaited<ReturnType<typeof loadDraftView>>; ctx: Awaited<ReturnType<typeof loadRegistrationContext>>; settings: NonNullable<Awaited<ReturnType<typeof loadRegistrationSettings>>>; token: string | null; accept: string | null; uploads: Awaited<ReturnType<typeof loadUploadSettings>> }) {
  const company = await db.supplier.findFirst({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: { companyEmail: true } });
  const prefill = creditorPrefill(view, ctx, company?.companyEmail ?? "");
  const giro = declarationShown(ctx, "GIRO_AUTHORISATION", settings.org.name);
  // The supplier reads its own bank details: logged as its own reading, shown or not (NFR-AUD-004).
  if (view.creditorId) await writeSupplierSulitEvent(db, actor, creditorEventRow({ id: view.creditorId, label: "Creditor's profile" }, CREDITOR_PROFILE_FIELDS, OWN_RECORD));
  const missingGiro = ctx.texts.GIRO_AUTHORISATION ? null : registrationFaultText({ code: "TEXT_NOT_SET", data: { kind: "GIRO_AUTHORISATION" } }).en;
  return (
    <EpaymentStep
      token={token}
      version={view.version}
      creditor={{ ...view.creditor, ...prefill.values }}
      banks={ctx.banks.map((b) => ({ value: b.code, label: b.nameEn }))}
      accountTypes={ctx.accountTypes.map((b) => ({ value: b.code, label: b.nameEn }))}
      statement={view.statement.map((f) => ({ versionId: f.versionId, name: f.name, size: formatBytes(f.size) }))}
      uploadClosed={uploadClosedWords(uploads.store, uploads.statement, "statement")}
      giro={{ text: giro ? { en: giro.en, ms: giro.ms, version: giro.version } : null }}
      signatoryName={view.signatoryName || actor.displayName}
      signatoryDesignation={view.signatoryDesignation}
      giroConfirmed={view.giroConfirmed}
      closedReason={missingGiro}
      acceptNote={accept}
      prefilled={prefill.said}
    />
  );
}

// ------------------------------------------------------------------ step 5

async function ReviewPage({ actor, view, ctx, settings, token, blockers }: { actor: Awaited<ReturnType<typeof requireSupplier>>; view: Awaited<ReturnType<typeof loadDraftView>>; ctx: Awaited<ReturnType<typeof loadRegistrationContext>>; settings: NonNullable<Awaited<ReturnType<typeof loadRegistrationSettings>>>; token: string | null; blockers: ReturnType<typeof faultViews> }) {
  const record = await draftRecord(actor, view, ctx);
  if (view.creditorId) await writeSupplierSulitEvent(db, actor, creditorEventRow({ id: view.creditorId, label: "Creditor's profile" }, CREDITOR_PROFILE_FIELDS, OWN_RECORD));
  const sections = registrationSummary(record, { day: formatDate });
  const falseText = declarationShown(ctx, "FALSE_DECLARATION", settings.org.name);
  const giroText = declarationShown(ctx, "GIRO_AUTHORISATION", settings.org.name);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="mb-3 text-[14.5px] font-bold text-ink">Application summary</h3>
        <RegistrationSummaryCards sections={sections.filter((s) => s.key !== "declarations")} />
      </div>
      <ReviewStep
        token={token}
        version={view.version}
        notice={ctx.noticeEn}
        falseText={falseText}
        giroText={giroText}
        signatoryName={view.signatoryName || actor.displayName}
        signatoryDesignation={view.signatoryDesignation}
        giroConfirmed={view.giroConfirmed}
        blockers={blockers}
      />
    </div>
  );
}

async function draftRecord(actor: Awaited<ReturnType<typeof requireSupplier>>, view: Awaited<ReturnType<typeof loadDraftView>>, ctx: Awaited<ReturnType<typeof loadRegistrationContext>>): Promise<SummaryRecord> {
  const [company, contacts] = await Promise.all([loadCompanySummary(db, actor, "APPLICATION"), loadContactsSummary(db, actor)]);
  const valueNames = new Map(ctx.values.map((v) => [v.id, valueLabel(v)]));
  const creditor = view.creditorId
    ? await creditorSummaryOf(db, actor.organisationId, {
        id: view.creditorId,
        version: 1,
        submittedAt: null,
        verification: "NOT_CHECKED",
        verifiedOn: null,
        verificationNote: "",
        verifiedByName: null,
        supersedesId: null,
        verifiedByPersonId: null,
        values: { ...view.creditor },
        statement: view.statement.map((f) => ({ versionId: f.versionId, name: f.name, scanState: f.scanState })),
      })
    : null;
  return {
    company: company ?? { registeredName: actor.supplierName, registrationNo: "", formatChecked: null, entityTypeName: null, countryName: null, addressLines: [], incorporatedOn: null, companyEmail: "", bumiputera: { kind: "NO_CLAIM", claim: null, reference: null, verification: null } },
    contacts: sulitGranted(contacts, "OWN_RECORD"),
    documents: draftDocumentsSummary(view, ctx, valueNames),
    creditor: sulitGranted(creditor, "OWN_RECORD"),
    declarations: [],
  };
}

// ------------------------------------------------------------------ sent

async function Sent({ actor, settings }: { actor: Awaited<ReturnType<typeof requireSupplier>>; settings: NonNullable<Awaited<ReturnType<typeof loadRegistrationSettings>>> }) {
  const zone = settings.org.timeZone;
  const draft = await db.registrationDraft.findFirst({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId }, select: { submittedAt: true } });
  const [company, contacts, documents, declarations, rows] = await Promise.all([
    loadCompanySummary(db, actor, "APPLICATION"),
    loadContactsSummary(db, actor),
    loadSentDocumentsSummary(db, actor),
    loadDeclarationsSummary(db, actor, zone),
    loadCreditorRows(db, actor),
  ]);
  const row = rows.find((r) => r.submittedAt) ?? null;
  if (row) await writeSupplierSulitEvent(db, actor, creditorEventRow({ id: row.id, label: "Creditor's profile" }, CREDITOR_PROFILE_FIELDS, OWN_RECORD));
  const record: SummaryRecord = {
    company: company ?? { registeredName: actor.supplierName, registrationNo: "", formatChecked: null, entityTypeName: null, countryName: null, addressLines: [], incorporatedOn: null, companyEmail: "", bumiputera: { kind: "NO_CLAIM", claim: null, reference: null, verification: null } },
    contacts: sulitGranted(contacts, "OWN_RECORD"),
    documents,
    creditor: sulitGranted(row ? await creditorSummaryOf(db, actor.organisationId, row) : null, "OWN_RECORD"),
    declarations,
  };
  return (
    <>
      <PageHeader title="Registration" badge={<Badge tone="ok">Sent to the procurement office</Badge>} subtitle={actor.supplierName} meta={[draft?.submittedAt ? `Sent ${formatOrgDateTime(draft.submittedAt, zone)}` : "Sent"]} actions={<ButtonLink href="/supplier/account" variant="secondary">Where it stands</ButtonLink>} />
      <Callout tone="ok" title="Your registration has been sent" className="mb-6">
        The procurement office checks it. What it decides is told on your account page: nothing is e-mailed from the portal. Nothing here can be changed now.
      </Callout>
      <RegistrationSummaryCards sections={registrationSummary(record, { day: formatDate })} />
    </>
  );
}

// ------------------------------------------------------------------ what you'll need

function Need({ ctx, settings, accept }: { ctx: Awaited<ReturnType<typeof loadRegistrationContext>>; settings: NonNullable<Awaited<ReturnType<typeof loadRegistrationSettings>>>; accept: string | null }) {
  const list = needList(ctx);
  const p = settings.policy;
  return (
    <aside aria-label="What you'll need" className="xl:sticky xl:top-24">
      <Card>
        <CardHeader title="What you'll need" subtitle="In the procurement office's own words." />
        <CardBody>
          {list.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">The procurement office has not listed the documents it asks for yet. Tell the procurement office.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {list.map((n) => (
                <li key={n.name} className="text-[13.5px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{n.name}</span>
                    <Badge tone={n.requirement === "REQUIRED" ? "brand" : n.requirement === "OPTIONAL" ? "neutral" : "warn"}>{n.requirement === "REQUIRED" ? "Required" : n.requirement === "OPTIONAL" ? "Optional" : "The office has not said"}</Badge>
                  </div>
                  {n.hint && <p className="text-ink-3">{n.hint}</p>}
                  {n.expiry && <p className="text-[12.5px] text-ink-3">{n.expiry}</p>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-line pt-3 text-[13px] text-ink-2">
            <p className="font-semibold text-ink">Files</p>
            <p>{accept ?? "The procurement office has not said which files it takes, so uploads are closed."}</p>
            {p.uploadMaxFilesPerApplication != null && p.uploadMaxBytesPerApplication != null ? (
              <p className="mt-1">Up to {p.uploadMaxFilesPerApplication} files, {formatBytes(p.uploadMaxBytesPerApplication)} in all.</p>
            ) : (
              <p className="mt-1">The procurement office has not set how many files you may upload, so uploads are closed.</p>
            )}
            <p className="mt-1 text-ink-3">Every file is shown as &ldquo;Not scanned&rdquo;: nothing scans uploads yet.</p>
          </div>
          {(p.helpEmail || p.helpPhone) && (
            <div className="mt-4 border-t border-line pt-3 text-[13px] text-ink-2">
              <p className="font-semibold text-ink">Need help?</p>
              {p.helpEmail && <p>Email {p.helpEmail}</p>}
              {p.helpPhone && <p>Call {p.helpPhone}</p>}
            </div>
          )}
          <p className="mt-4 text-[12.5px] text-ink-3">
            <Link href="/supplier/account" className="font-semibold text-brand-700 hover:underline">
              Your account
            </Link>
          </p>
        </CardBody>
      </Card>
    </aside>
  );
}
