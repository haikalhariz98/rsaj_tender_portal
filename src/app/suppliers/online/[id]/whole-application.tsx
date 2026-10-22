import Link from "next/link";

import { EscalateDrawer } from "@/app/approvals/editors";
import { heldCreditorGate, sulitGate } from "@/app/_auth/sulit";
import { RouteSteps } from "@/app/sourcing/[id]/route-steps";
import { DownloadLink } from "@/components/attachments/download-link";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { RegistrationSummaryCards } from "@/components/registration-summary";
import { Tabs, type TabSpec } from "@/components/tabs";
import { isMandatoryAct } from "@/components/ui/act";
import { Badge, Chip, SulitTag } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { MoreText } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { TextDrawerLink } from "@/components/ui/text-drawer";
import { ClipboardIcon, FileIcon, LockIcon, ShieldIcon } from "@/components/icons";
import { CONTACT_FIELDS } from "@/lib/suppliers/contact-fields";
import { CREDITOR_PROFILE_FIELDS } from "@/lib/auth/creditor-access-store";
import { through, type Sulit } from "@/lib/auth/sulit-access";
import type { StaffActor } from "@/lib/auth/types";
import { routeCoreText } from "@/lib/authority/core-routing-labels";
import { loadIssue } from "@/lib/authority/load";
import { dayToDate, storedDay } from "@/lib/dates";
import { isLive } from "@/lib/documents/evidence";
import { formatBytes, mediaLabel } from "@/lib/documents/labels";
import { malwareScanner } from "@/lib/documents/store";
import { formatDate, formatOrgDateTime, formatOrgDay } from "@/lib/format";
import { ACT_DONE_LABEL, ACT_LABEL } from "@/lib/labels";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { APPLY } from "@/lib/portal/labels";
import { blocksRecording, flagWords, type PortalFlag } from "@/lib/portal/queue";
import type { WholeApplication } from "@/lib/portal/queue-repo";
import { loadHeldCreditorValues } from "@/lib/portal/queue-repo";
import { portalFileFactsOf } from "@/lib/portal/register/file-facts";
import { summaryRecordOfPortal } from "@/lib/portal/register/summary-record";
import { registrationSummary } from "@/lib/portal/registration/summary";
import { CREDITOR_FIELDS, type CreditorInput, type DeclarationKind } from "@/lib/portal/registration/types";
import { APPLICANT_WORDS } from "@/lib/audit/actor";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { verifyFaults } from "@/lib/suppliers/documents";
import { creditorReviewFaults, creditorReviewText } from "@/lib/suppliers/creditor-review";
import { DECLARATION_KIND_WORDS } from "@/lib/suppliers/registration-settings";
import { REGISTRATION_MATTER, supplierFaultText, VERIFICATION_LABEL, VERIFICATION_TONE } from "@/lib/suppliers/labels";
import type { SupplierConfig, SupplierOrg } from "@/lib/suppliers/repo";
import { typeFacts } from "@/lib/suppliers/repo";
import { submitFaults } from "@/lib/suppliers/review";
import { supplierHolders, supplierRoute } from "@/lib/suppliers/route";
import { blocking, SUPPLIER_REGISTRATION_DOMAIN, type Finding, type VerificationState } from "@/lib/suppliers/types";
import { routeTone, stepTone } from "@/lib/ui/status-tone";

import { DecideStepDrawer, SubmitApplicationDrawer, VerifyCreditorDrawer, VerifyDocumentDrawer } from "../../[id]/editors";
import { sendPortalApplicationAction, verifyPortalCreditorAction, verifyPortalDocumentAction } from "../../portal-actions";
import { DiscardOnlineApplicationDrawer } from "./discard-drawer";
import { RejectOnlineApplicationDrawer } from "./reject-drawer";

/**
 * A whole online application, for an officer (ADR 0041, plan 6.2): the same projection the applicant reviewed at step 5, the certificates with their files and checks, the bank details
 * behind the creditor gate, the agreements as made (not signed: nobody was signed in), and its route. While it waits: set aside, reject, or send for decision; a step is decided on the
 * route panel; the last approval registers the supplier, and the portal account is opened later, from the supplier's page.
 */

const STATUS = { RECEIVED: { text: "Waiting for an officer", tone: "info" }, RECORDED: { text: "Recorded as a supplier", tone: "ok" }, DISCARDED: { text: "Set aside", tone: "neutral" }, APPROVED: { text: "Approved", tone: "ok" }, REJECTED: { text: "Rejected", tone: "err" } } as const;
const ROUTE_WAITING = "A route is waiting. Decide it first.";
type Option = { value: string; label: string };
const first = (fs: readonly Finding[]) => {
  const b = blocking(fs)[0];
  return b ? supplierFaultText(b) : null;
};
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);

export async function WholeApplicationPage({ actor, org, a, flags, cfg, people, tab }: { actor: StaffActor; org: SupplierOrg; a: WholeApplication; flags: PortalFlag[]; cfg: SupplierConfig; people: Option[]; tab: string | undefined }) {
  const today = org.today;
  const erased = a.erasedAt != null;
  const status = STATUS[a.status];
  const waiting = a.status === "RECEIVED";
  const pending = a.routes.some((r) => r.status === "PENDING");
  const back = <Link href="/suppliers?tab=portal">Suppliers</Link>;

  // The file as the approval rules judge it now: what stops sending it.
  const f = today
    ? portalFileFactsOf(
        { application: { status: a.status, receivedOn: a.receivedOn, routePending: pending }, documents: a.documents, creditor: a.creditor, declarations: a.declarations },
        cfg.types.map(typeFacts),
        { onlineDeclarationReplacesPaper: cfg.policy?.onlineDeclarationReplacesPaper ?? null },
        today,
      )
    : null;
  const issue = today && waiting ? await loadIssue(org.code, dayToDate(today), undefined, null) : null;
  const preview = issue ? supplierRoute(issue.matrix, SUPPLIER_REGISTRATION_DOMAIN, "NEW", { id: "", holds: () => false, ableToAct: () => ({ holderIds: ["someone"], delegateIds: [] }) }, REGISTRATION_MATTER) : null;
  const sendBlocker = !today
    ? supplierFaultText({ code: "TIME_ZONE_UNSET", level: "block" })
    : blocksRecording(flags)
      ? flagWords(flags.find((x) => x.code === "NUMBER_ON_REGISTER")!).text
      : (first(submitFaults(f!, today)) ?? (!issue ? "No approval matrix is in force. Issue one under Configuration › Approval matrix." : (preview?.refusal?.en ?? null)));
  const routeWords = preview?.chain.map((x) => `${issue!.matrix.roles[x.roleCode]?.nameEn ?? "An office no longer configured"} (${ACT_LABEL[x.act]?.toLowerCase() ?? "acts"})`) ?? [];

  const actions = waiting ? (
    <span className="flex flex-wrap items-center gap-2">
      <DiscardOnlineApplicationDrawer id={a.id} reference={a.reference} people={people} blocker={pending ? ROUTE_WAITING : null} keeps />
      <RejectOnlineApplicationDrawer id={a.id} reference={a.reference} blocker={pending ? ROUTE_WAITING : null} />
      {pending ? <Blocked label="Send for decision" primary reason="With approval. The route decides." /> : <SubmitApplicationDrawer applicationId={a.id} people={people} blocker={sendBlocker} route={routeWords} held={{ action: sendPortalApplicationAction }} />}
    </span>
  ) : a.status === "APPROVED" && a.acceptedSupplier ? (
    <span className="flex flex-wrap items-center gap-2">
      <ButtonLink href={`/suppliers/${a.acceptedSupplier.id}?tab=profile`} variant="secondary" size="md">
        Open the account
      </ButtonLink>
      <ButtonLink href={`/suppliers/${a.acceptedSupplier.id}`} variant="primary" size="md">
        Open the supplier
      </ButtonLink>
    </span>
  ) : undefined;

  // The contact is SULIT as a supplier's is: only the organisation-wide permission opens it. Judged once, logged.
  const contactGate = await sulitGate(actor, { scope: "supplier", entity: "PortalApplication", id: a.id, label: a.reference }, CONTACT_FIELDS);
  const lists = {
    entityTypes: cfg.lists.filter((l) => l.list === "ENTITY_TYPE").map((l) => ({ code: l.code, nameEn: l.nameEn })),
    countries: cfg.lists.filter((l) => l.list === "COUNTRY").map((l) => ({ code: l.code, nameEn: l.nameEn })),
    states: cfg.lists.filter((l) => l.list === "STATE").map((l) => ({ code: l.code, nameEn: l.nameEn })),
    bumiputeraStatuses: cfg.lists.filter((l) => l.list === "BUMIPUTERA_STATUS").map((l) => ({ code: l.code, nameEn: l.nameEn })),
    banks: cfg.lists.filter((l) => l.list === "BANK").map((l) => ({ code: l.code, nameEn: l.nameEn })),
    accountTypes: cfg.lists.filter((l) => l.list === "ACCOUNT_TYPE").map((l) => ({ code: l.code, nameEn: l.nameEn })),
    formatPattern: cfg.format?.pattern ?? null,
    bumiputeraEvidenceSet: cfg.policy?.restrictionEvidenceTypeId != null,
  };
  // The bank details: read only on their own tab, through the creditor gate (the route's holders, the verifier, the grant), and logged, shown or refused.
  const bankOpen = tab === "bank";
  let creditorGate: Sulit<true> | null = null;
  let heldValues: CreditorInput | null = null;
  if (bankOpen && a.creditor && !a.creditor.erasedAt) {
    creditorGate = await heldCreditorGate(actor, { portalApplicationId: a.id, creditorId: a.creditor.id, label: `${a.reference} · Bank details` }, CREDITOR_PROFILE_FIELDS);
    const held = creditorGate.state === "GRANTED" ? await loadHeldCreditorValues(org.id, a.id) : null;
    heldValues = held ? (Object.fromEntries(CREDITOR_FIELDS.map((k) => [k, held[k]])) as unknown as CreditorInput) : null;
  }
  const creditorGranted = creditorGate?.state === "GRANTED";

  const record = summaryRecordOfPortal(
    {
      company: { registeredName: a.registeredName, registrationNo: a.registrationNo, entityTypeCode: a.entityTypeCode, countryCode: a.countryCode, incorporatedOn: a.incorporatedOn ? storedDay(a.incorporatedOn) : "", bumiputeraClaimCode: a.bumiputeraClaimCode || null, companyEmail: a.companyEmail, addressLine1: a.addressLine1, addressLine2: a.addressLine2, city: a.city, postcode: a.postcode, stateCode: a.stateCode || null },
      contact: { name: a.contactName, designation: a.contactDesignation, email: a.contactEmail, phone: a.contactPhone },
      documents: a.documents.map((d) => ({
        id: d.id,
        typeLabelSnapshot: d.typeLabelSnapshot,
        hint: d.type.hintEn?.trim() || null,
        title: d.title,
        reference: d.reference,
        issuingAuthority: d.issuingAuthority,
        expiresOn: day(d.expiresOn),
        notApplicable: d.notApplicable,
        ratePercent: d.ratePercent ? d.ratePercent.toString() : null,
        files: d.attachments.map((x) => ({ name: x.version.originalFilename, scanLabel: "Not scanned" })),
        verification: { state: d.verification as VerificationState, by: d.verifiedBy?.name ?? null, on: day(d.verifiedOn), note: d.verificationNote },
        codes: d.values.map((v) => ({ code: v.codeSnapshot, label: v.labelSnapshot })),
      })),
      creditor:
        heldValues && a.creditor
          ? { values: heldValues, statementFiles: a.creditor.attachments.map((x) => x.version.originalFilename), verification: { state: a.creditor.verification as VerificationState, by: a.creditor.verifiedBy?.name ?? null, on: day(a.creditor.verifiedOn), note: a.creditor.verificationNote } }
          : null,
      agreements: a.declarations.map((x) => ({ kind: x.kind as DeclarationKind, textVersion: x.textVersion, signatoryName: x.signatoryName, signatoryDesignation: x.signatoryDesignation, signedAt: formatOrgDateTime(x.signedAt, org.timeZone) })),
    },
    lists,
    {
      contacts: (v) => through(contactGate, v),
      // Not asked off its own tab: the section is not drawn there.
      creditor: (v) => (creditorGate ? through(creditorGate, v) : { state: "GRANTED", value: null, basis: "NAMED_ON_RECORD" }),
    },
  );
  const sections = registrationSummary(record, { day: formatDate });
  const summary = sections.filter((s) => s.key === "company" || s.key === "contacts" || s.key === "codes");
  const bankSection = sections.find((s) => s.key === "creditor")!;

  // Who holds each office today, to suggest beside a step's decision.
  const [roster, delegations] = today && pending ? await Promise.all([loadRoster(org.code), loadDelegations(org.code)]) : [null, null];
  const suggestions = (code: string | null) => {
    if (!code || !roster || !delegations || !today) return people;
    const h = supplierHolders(code, roster, delegations, today);
    const top = [...h.holderIds, ...h.delegates.map((d) => d.personId)];
    return [...people.filter((p) => top.includes(p.value)).map((p) => ({ ...p, label: `${p.label} — ${h.holderIds.includes(p.value) ? "holds the office" : "delegate"}` })), ...people.filter((p) => !top.includes(p.value))];
  };

  const unverifiedDocs = a.documents.filter((d) => d.verification === "NOT_CHECKED").length;
  const tabs: TabSpec[] = [
    {
      id: "application",
      label: "Application",
      icon: <ClipboardIcon size={15} />,
      panel: erased ? <ErasedCard a={a} timeZone={org.timeZone} status={status.text} /> : <RegistrationSummaryCards sections={summary} />,
    },
    {
      id: "documents",
      label: "Documents",
      icon: <FileIcon size={15} />,
      count: a.documents.length,
      panel: (
        <Card className="overflow-hidden">
          <CardHeader icon={<FileIcon size={17} />} title="Certificates sent" subtitle={unverifiedDocs ? `${unverifiedDocs} not yet checked` : "All checked"} divided={a.documents.length === 0} />
          {a.documents.length === 0 ? (
            <EmptyState size="sm" title="No certificate was sent" />
          ) : (
            <ol className="divide-y divide-line/70">
              {a.documents.map((d) => {
                const live = d.attachments.filter(isLive);
                const label = `${d.typeLabelSnapshot}${d.title ? ` · ${d.title}` : ""}${d.reference ? ` ${d.reference}` : ""}`;
                const verifyBlocker = !waiting ? "Decided already." : first(verifyFaults({ state: "VERIFIED", personActive: true, verifiedOn: today, note: "" }, { verification: d.verification as VerificationState, lodgedOn: storedDay(a.receivedOn), notApplicable: d.notApplicable, scanned: live.length > 0 }, today));
                return (
                  <li key={d.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-[14.5px] font-semibold text-ink">{d.title ? `${d.typeLabelSnapshot} · ${d.title}` : d.typeLabelSnapshot}</span>
                        {d.type.mandatoryAtRegistration === true && <Badge outline>Mandatory</Badge>}
                        <Badge tone={VERIFICATION_TONE[d.verification as VerificationState]}>{VERIFICATION_LABEL[d.verification as VerificationState].en}</Badge>
                      </div>
                      {waiting && d.verification === "NOT_CHECKED" && <VerifyDocumentDrawer documentId={d.id} label={label} people={people} today={today} blocker={verifyBlocker} expiresOn={day(d.expiresOn)} asksExpiry={d.type.expires !== false && !d.notApplicable} action={verifyPortalDocumentAction} slot="PortalApplicationDocument.verifiedBy" />}
                    </div>
                    <KeyValues
                      columns={3}
                      items={[
                        { label: "Reference", value: d.notApplicable ? "Does not apply" : d.reference || "—" },
                        { label: "Issued by", value: d.issuingAuthority || "—" },
                        { label: "Expires", value: d.notApplicable ? "—" : d.expiresOn ? formatDate(day(d.expiresOn)) : "Not given" },
                        { label: "Codes", value: d.values.length ? d.values.map((v) => `${v.codeSnapshot} — ${v.labelSnapshot}`).join("; ") : "—" },
                        ...(d.ratePercent != null ? [{ label: "Rate", value: `${d.ratePercent.toString()}%` }] : []),
                        { label: "Lodged", value: `${formatDate(storedDay(a.receivedOn))} · ${APPLICANT_WORDS}` },
                        { label: "Checked", value: d.verification === "NOT_CHECKED" ? "Not yet" : `${formatDate(day(d.verifiedOn))} · ${d.verifiedBy?.name ?? "Not recorded"}${d.verificationNote ? ` · “${d.verificationNote}”` : ""}` },
                      ]}
                    />
                    <FileRows files={d.attachments} />
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      ),
    },
    {
      id: "bank",
      label: "Bank details",
      icon: <LockIcon size={15} />,
      lazy: true,
      panel: bankOpen ? (
        a.creditor == null || a.creditor.erasedAt ? (
          <Card>
            <CardHeader icon={<LockIcon size={17} />} title="Bank details" actions={<SulitTag />} />
            <EmptyState size="sm" title={a.creditor?.erasedAt ? "Erased when it was set aside" : "No bank details were sent"} />
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            <RegistrationSummaryCards
              sections={[bankSection]}
              actions={{
                creditor:
                  waiting && a.creditor.verification === "NOT_CHECKED" && creditorGranted ? (
                    <VerifyCreditorDrawer
                      profileId=""
                      version={1}
                      today={today}
                      blocker={(() => {
                        const b = blocking(creditorReviewFaults({ state: "VERIFIED", personActive: true, verifiedOn: today, note: "" }, { sent: true, verification: a.creditor.verification as VerificationState, sentOn: storedDay(a.receivedOn), statementFiles: a.creditor.attachments.filter(isLive).length }, today))[0];
                        return b ? creditorReviewText(b).en : null;
                      })()}
                      held={{ portalApplicationId: a.id, action: verifyPortalCreditorAction }}
                    />
                  ) : undefined,
              }}
              extra={{
                creditor: (
                  creditorGranted ? (
                    <div className="mt-4 border-t border-line pt-4">
                      <FileRows files={a.creditor.attachments} />
                    </div>
                  ) : undefined
                ),
              }}
            />
          </div>
        )
      ) : null,
    },
    {
      id: "agreements",
      label: "Agreements",
      icon: <ShieldIcon size={15} />,
      count: a.declarations.length,
      panel: (
        <Card className="overflow-hidden">
          <CardHeader icon={<ShieldIcon size={17} />} title="Agreements" subtitle="Ticked at Submit" actions={<MoreText label="About agreements" text="Ticked by someone who was not signed in, with the name as typed. Not a signature. The fingerprint identifies the exact wording agreed." />} divided={a.declarations.length === 0} />
          {a.declarations.length === 0 ? (
            <EmptyState size="sm" title="No agreement is recorded" />
          ) : (
            <ul className="divide-y divide-line/70">
              {a.declarations.map((x) => (
                <li key={x.id} className="flex flex-col gap-2 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14.5px] font-semibold text-ink">{DECLARATION_KIND_WORDS[x.kind as DeclarationKind]}</span>
                    <TextDrawerLink label="Read the wording" title={DECLARATION_KIND_WORDS[x.kind as DeclarationKind]} text={x.noticeFrozenEn ? `${x.frozenTextEn}\n\n${x.noticeFrozenEn}` : x.frozenTextEn} />
                  </div>
                  <KeyValues
                    columns={3}
                    items={[
                      { label: "Agreed by", value: <span className="inline-flex flex-wrap items-center gap-2">{x.signatoryName}{x.signatoryDesignation ? `, ${x.signatoryDesignation}` : ""} <Chip tone="warn">{APPLY.unverified.en}</Chip></span> },
                      { label: "Agreed at", value: formatOrgDateTime(x.signedAt, org.timeZone) },
                      { label: "Wording", value: <span className="inline-flex flex-wrap items-center gap-2">Version {x.textVersion} <InfoChip tone="neutral" detail={x.textSha256} label="Full fingerprint">{x.textSha256.slice(0, 12)}</InfoChip></span> },
                      ...(x.noticeSha256 ? [{ label: "Personal Data Notice", value: <InfoChip tone="neutral" detail={x.noticeSha256} label="Full fingerprint">{x.noticeSha256.slice(0, 12)}</InfoChip> }] : []),
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ),
    },
    {
      id: "decision",
      label: "Decision",
      icon: <ClipboardIcon size={15} />,
      count: a.routes.length,
      panel: (
        <div className="flex flex-col gap-5">
          {a.status === "REJECTED" && (
            <Card>
              <CardHeader title="Rejected" subtitle={`${formatOrgDay(a.decidedAt, org.timeZone)} · ${a.decidedBy?.name ?? "Not recorded"}`} />
              <CardBody>
                <p className="text-[13.5px] break-words whitespace-pre-line text-ink">{a.decisionRemarks}</p>
              </CardBody>
            </Card>
          )}
          {a.status === "APPROVED" && a.acceptedSupplier && (
            <Callout tone="ok" title="Approved">
              Registered as <Link href={`/suppliers/${a.acceptedSupplier.id}`}>{a.acceptedSupplier.registeredName} ({a.acceptedSupplier.reference})</Link>, {formatOrgDay(a.decidedAt, org.timeZone)}.
            </Callout>
          )}
          {a.status === "DISCARDED" && <Callout tone="warn" title={`Set aside · ${formatOrgDay(a.decidedAt, org.timeZone)} · ${a.decidedBy?.name ?? "Not recorded"}`}>{a.discardReason}</Callout>}
          {a.routes.length === 0 ? (
            waiting && (
            <Card>
              <EmptyState size="sm" title="Not sent for decision" action={waiting && sendBlocker ? <span className="text-[12.5px] text-ink-3">{sendBlocker}</span> : undefined} />
            </Card>
            )
          ) : (
            a.routes.map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <CardHeader
                  title={`Approval route · sent ${formatDate(day(r.openedAt))}${a.sentBy ? ` by ${a.sentBy.name}` : ""}`}
                  subtitle={`${r.ruleLabel ?? "A rule no longer recorded"}${r.ruleClause ? ` · ${r.ruleClause}` : ""}`}
                  actions={<Badge tone={r.status === "REJECTED" ? "warn" : routeTone(r.status)}>{r.status === "PENDING" ? "With approval" : r.status === "APPROVED" ? "Approved" : r.status === "REJECTED" ? "Refused: back with the officer" : "Closed"}</Badge>}
                />
                <p className="px-5 pt-3 text-[12.5px] text-ink-3 sm:px-6">Routed on no value. Chain: {routeCoreText(r, () => ({ en: "an office no longer configured" })).en}</p>
                {r.status === "REJECTED" && <p className="px-5 pt-2 text-[12.5px] text-ink-2 sm:px-6">Refused: {r.rejectionReason || "no reason recorded"}.</p>}
                <RouteSteps
                  inst={r}
                  stepLabel={(x) => DECISION_LABEL[x]}
                  stepTone={stepTone}
                  action={(step, { earlierDone }) => (
                    <>
                      {r.status === "PENDING" && step.decision === "PENDING" && step.roleCode && <EscalateDrawer stepId={step.id} office={step.actingRoleLabel ?? step.roleLabel} mandatory={isMandatoryAct(step.act)} people={suggestions(step.actingRoleCode ?? step.roleCode)} />}
                      {r.status === "PENDING" && step.decision === "PENDING" && earlierDone && <DecideStepDrawer stepId={step.id} office={step.roleLabel} done={ACT_DONE_LABEL[step.act] ?? "Done"} people={suggestions(step.actingRoleCode ?? step.roleCode)} today={today} />}
                    </>
                  )}
                />
              </Card>
            ))
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <RecordCrumb label={a.reference} />
      <PageHeader
        eyebrow={back}
        title={erased ? `Online application ${a.reference}` : a.registeredName}
        badge={<Badge tone={status.tone} dot>{status.text}</Badge>}
        subtitle={erased ? "The applicant's details have been erased." : `Registration number ${a.registrationNo}`}
        meta={[<span key="ref" className="font-mono text-[12.5px]">{a.reference}</span>, `Sent ${formatDate(storedDay(a.receivedOn))}`, <Chip key="unverified" tone="warn">{APPLY.unverified.en}</Chip>]}
        actions={actions}
      />
      {waiting && flags.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {flags.map((x) => {
            const w = flagWords(x);
            return (
              <Callout key={x.code} tone={w.tone} title={x.code === "NUMBER_ON_REGISTER" ? "Number already on the register" : "Sent more than once"}>
                {w.text}
              </Callout>
            );
          })}
        </div>
      )}
      <Tabs initial={tab} label="Online application" tabs={tabs} />
    </>
  );
}

/// One row per file held: its name, size and type, "Not scanned", a link to open it, and whether it has moved to the supplier since.
function FileRows({ files }: { files: WholeApplication["documents"][number]["attachments"] }) {
  if (files.length === 0) return <p className="text-[13px] text-ink-3">No file.</p>;
  const scannerConfigured = malwareScanner().configured;
  return (
    <ul className="flex flex-col gap-1.5">
      {files.map((x) => (
        <li key={x.id} className="flex flex-wrap items-center gap-2 text-[13px]">
          {/* RSEC-2: sent by someone not signed in; with no scanner, opened only once the shared question is answered. */}
          <DownloadLink href={`/api/documents/versions/${x.version.id}`} unscanned={!scannerConfigured} className="font-medium text-brand-700 hover:underline" aria-label={`Open ${x.version.originalFilename}`}>
            {x.version.originalFilename}
          </DownloadLink>
          <span className="text-ink-3">
            {formatBytes(x.version.byteSize)} · {mediaLabel(x.version.mediaType)}
          </span>
          {x.version.scanState === "NOT_SCANNED" && <Chip tone="warn">Not scanned</Chip>}
          {x.detachedAt && <Chip>Moved to the supplier</Chip>}
        </li>
      ))}
    </ul>
  );
}

function ErasedCard({ a, timeZone, status }: { a: WholeApplication; timeZone: string | null; status: string }) {
  return (
    <Card>
      <CardHeader title="What is kept" subtitle="Files and agreements are kept" />
      <CardBody>
        <KeyValues
          columns={2}
          items={[
            { label: "Outcome", value: status },
            { label: "Decided", value: formatOrgDay(a.decidedAt, timeZone) },
            { label: "By", value: a.decidedBy?.name ?? "—" },
            ...(a.status === "DISCARDED" ? [{ label: "Why it was set aside", value: <span className="whitespace-pre-line">{a.discardReason}</span> }] : []),
          ]}
        />
      </CardBody>
    </Card>
  );
}
