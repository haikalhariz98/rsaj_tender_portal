import type { ReactNode } from "react";
import type { AccountStatus } from "@/generated/prisma/client";
import { sulitHistoryValue } from "@/lib/auth/sulit-history";
import { CONTACT_FIELDS } from "@/lib/suppliers/contact-fields";
import type { Sulit } from "@/lib/auth/sulit-access";
import { hiddenExercises, sulitGate } from "@/app/_auth/sulit";
import { ActedBy } from "@/components/attribution";
import Link from "next/link";
import { historyEntityLabel, historyValueWords } from "@/lib/audit/entity-labels";
import { notFound } from "next/navigation";

import { EscalateDrawer } from "@/app/approvals/editors";
import { RouteSteps } from "@/app/sourcing/[id]/route-steps";
import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { BuildingIcon, ClipboardIcon, ClockIcon, FileIcon, LinkIcon, LockIcon, RouteIcon, ScaleIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { isMandatoryAct } from "@/components/ui/act";
import { Badge, Chip, SulitTag, SulitValue } from "@/components/ui/badge";
import { InfoChip } from "@/components/ui/info-chip";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { routeCoreText } from "@/lib/authority/core-routing-labels";
import { loadIssue } from "@/lib/authority/load";
import { dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { isLive } from "@/lib/documents/evidence";
import { formatDate, formatOrgDateTime, formatOrgDay } from "@/lib/format";
import { matchesFormat } from "@/lib/integration/award-commitment";
import { ACT_DONE_LABEL, ACT_LABEL } from "@/lib/labels";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { SUPPLIER_ENTITY_LABEL, supplierFieldName } from "@/lib/suppliers/audit-view";
import { chainOrder, documentStates, lodgeFaults, verifyFaults } from "@/lib/suppliers/documents";
import {
  APPLICATION_KIND_LABEL,
  CHANNEL_LABEL,
  DOCUMENT_STATE_LABEL,
  DOCUMENT_STATE_TONE,
  ERP_NOT_SYNCED,
  NOT_SENT,
  NOT_VALIDATED,
  OUTCOME_LABEL,
  QUEUE_STATE_LABEL,
  QUEUE_STATE_TONE,
  REGISTRATION_MATTER,
  supplierFaultText,
  SUPPLIER_STATUS_LABEL,
  SUPPLIER_STATUS_TONE,
  VERIFICATION_LABEL,
  VERIFICATION_TONE,
} from "@/lib/suppliers/labels";
import { answeredOnTimeIds, documentFacts, loadSupplier, loadSupplierConfig, supplierHistory, type LoadedSupplier, type SupplierConfig } from "@/lib/suppliers/repo";
import { applicationKindFaults, decisionFaults, fileFacts, isDecisionSnapshot, isOpen, openApplicationFaults, queueState, submitFaults, type BlacklistInEffect, type CancellationInEffect } from "@/lib/suppliers/review";
import { supplierHolders, supplierRoute } from "@/lib/suppliers/route";
import { PAPER_CHANNELS, APPLICATION_KINDS, blocking, SUPPLIER_REGISTRATION_DOMAIN, type ApplicationKind, type Finding, type SupplierStatus } from "@/lib/suppliers/types";
import { routeTone, stepTone } from "@/lib/ui/status-tone";

import { expiryBand } from "@/lib/suppliers/expiry";
import { asHeading, EXPIRY_BAND_LABEL, EXPIRY_BAND_TONE, renewalUpcomingWords, standingTone, standingWords } from "@/lib/suppliers/labels";
import { standing } from "@/lib/suppliers/standing";
import { standingEventFacts } from "@/lib/suppliers/standing-repo";

import { accountStateWords } from "@/lib/auth/supplier-administration-rules";
import { bumiputeraNeedsAttention, bumiputeraReading, bumiputeraWords } from "@/lib/suppliers/bumiputera";
import { composeAddress } from "@/lib/suppliers/step-one";

import { OpenPortalAccount, IssueSupplierCode, RetireContact, SetContractorSigner, UnlockSupplierAccount } from "./account-editors";
import { EligibilityPanel, ParticipationPanel, StandingPanel } from "./standing-panels";
import { ContactDrawer, DecideStepDrawer, LodgeDocumentDrawer, OpenApplicationDrawer, PaperDaysDrawer, RecordLapseDrawer, RejectApplicationDrawer, ResubmissionDrawer, SubmitApplicationDrawer, VendorCodeDrawer, VerifyDocumentDrawer } from "./editors";
import { requireStaff } from "@/app/_auth/actor";
import type { StaffActor } from "@/lib/auth/types";
import { reviewFacts } from "@/lib/portal/registration/review-facts";
import { ApplicationSummary } from "./application-summary";
import { CreditorPanel } from "./creditor-panel";
import { loadAttributions } from "@/lib/auth/attribution-read";

export const dynamic = "force-dynamic";

type Option = { value: string; label: string };
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const notSet = (what = "Not set") => <span className="text-ink-4">{what}</span>;
const first = (fs: readonly Finding[]) => (blocking(fs).length ? supplierFaultText(blocking(fs)[0]) : null);

/**
 * A supplier on the register (6.15a, ADR 0019): its identity and contacts, its statutory documents with
 * their checks, its applications with their decisions and routes, and its History. Everything an act
 * would refuse is said beside the act's button, from the same rule the act runs.
 */
export default async function SupplierPage(props: PageProps<"/suppliers/[id]">) {
  const actor = await requireStaff();
  const [{ id }, { tab, exercise, fromAward, version }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string; exercise?: string; fromAward?: string; version?: string }>]);
  const l = await loadSupplier(actor.organisationId, id, await hiddenExercises(actor));
  if (!l) notFound();
  const { supplier: s, org } = l;
  // A supplier's contacts and the figures held about it (its contractor performance percentage) are SULIT: it keeps no list of who is named on it, so only the organisation-wide
  // permission opens them (undecided until decided). One answer for the page, logged.
  const sulit = await sulitGate(actor, { scope: "supplier", entity: "Supplier", id: s.id, label: s.reference }, CONTACT_FIELDS);
  const today = org.today;
  const [cfg, people, history] = await Promise.all([loadSupplierConfig(org.id), db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }), supplierHistory(l)]);
  const peopleOptions: Option[] = people.map((p) => ({ value: p.id, label: p.name }));
  const status = s.status as SupplierStatus;
  const docs = s.documents.map(documentFacts);
  const states = today ? documentStates(cfg.typeFacts, docs, today) : [];
  const open = s.applications.find(isOpen) ?? null;
  // Phase 4c: the requests the supplier answered online in time (a passed deadline is then not a lapse).
  const answeredHere = await answeredOnTimeIds(db, org.id, s.applications.map((a) => a.id));
  // a2: where it stands, derived on the organisation's day (OD-7 A), never stored.
  const reading = today ? standing({ status, registeredOn: day(s.registeredOn) }, s.standingEvents.map(standingEventFacts), states.filter((x) => x.mandatory).map((x) => ({ typeLabel: x.type.label, state: x.state })), { autoSuspendOnLapse: cfg.policy?.autoSuspendOnLapse ?? null }, today) : null;
  const linkedCount = s.parties.length + s.awards.filter((a) => !a.awardeePartyId).length;
  // Phase 4b: how many versions of its bank details the supplier has sent (a count, never a value), and where its registration stands, for the header.
  const [creditorCount, sentOnline] = await Promise.all([
    db.creditorProfile.count({ where: { supplierId: s.id, organisationId: org.id, submittedAt: { not: null } } }),
    db.supplierApplication.findFirst({ where: { supplierId: s.id, organisationId: org.id, channel: "PORTAL", submittedAt: { not: null } }, orderBy: { submittedAt: "asc" }, select: { receivedOn: true } }),
  ]);
  const waitingForApplicant = status === "APPLICANT" && s.applications.length === 0 && s.portalApplications.length > 0;

  const tabs = [
    { id: "profile", label: "Profile", icon: <BuildingIcon size={15} />, panel: <ProfilePanel sulit={sulit} l={l} cfg={cfg} canManageAccounts={actor.permissions.has("supplierAccounts.manage")} /> },
    { id: "documents", label: "Documents", icon: <FileIcon size={15} />, count: s.documents.length, panel: <DocumentsPanel l={l} cfg={cfg} people={peopleOptions} /> },
    { id: "applications", label: "Applications", icon: <ClipboardIcon size={15} />, count: s.applications.length, panel: <ApplicationsPanel actor={actor} l={l} cfg={cfg} people={peopleOptions} blacklist={reading?.blacklist ?? null} cancellation={reading?.cancellation ?? null} sulit={sulit} waitingForApplicant={waitingForApplicant} summaryOpen={tab === "applications"} /> },
    // Phase 4b: the supplier's bank details, SULIT. Read only while this tab is the one open (it reads the details, and the reading is logged).
    { id: "creditor", label: "Creditor profile", icon: <LockIcon size={15} />, count: creditorCount, lazy: true, panel: tab === "creditor" ? <CreditorPanel actor={actor} l={l} version={version ?? null} /> : null },
    { id: "standing", label: "Standing", icon: <ShieldIcon size={15} />, count: s.standingEvents.length, panel: <StandingPanel l={l} cfg={cfg} reading={reading} people={peopleOptions} fromAward={fromAward ?? null} /> },
    { id: "eligibility", label: "Eligibility", icon: <ScaleIcon size={15} />, panel: <EligibilityPanel l={l} exerciseId={exercise ?? null} /> },
    { id: "participation", label: "Participation", icon: <LinkIcon size={15} />, count: linkedCount, panel: <ParticipationPanel l={l} people={peopleOptions} /> },
    { id: "history", label: "History", icon: <ClockIcon size={15} />, count: history.total, panel: <HistoryPanel sulit={sulit} entries={history.entries} total={history.total} timeZone={org.timeZone} /> },
  ];
  const issues = states.filter((x) => x.mandatory && x.state !== "VALID" && x.state !== "NOT_APPLICABLE");

  return (
    <>
      <RecordCrumb label={s.reference} />
      <PageHeader
        eyebrow={<Link href="/suppliers">Suppliers</Link>}
        title={s.registeredName}
        badge={reading && status === "REGISTERED" ? <Badge tone={standingTone(reading)} dot>{standingWords(reading).en}</Badge> : <Badge tone={SUPPLIER_STATUS_TONE[status]} dot>{SUPPLIER_STATUS_LABEL[status].en}</Badge>}
        subtitle={`Registration number ${s.registrationNo}${s.registeredOn ? ` · registered ${formatDate(day(s.registeredOn))}` : ""}`}
        meta={[
          <span key="ref" className="font-mono text-[12.5px]">{s.reference}</span>,
          cfg.listName("ENTITY_TYPE", s.entityTypeCode) ?? "An entity type no longer listed",
          cfg.listName("COUNTRY", s.countryCode) ?? "A country no longer listed",
          open ? `${APPLICATION_KIND_LABEL[open.kind as ApplicationKind].en}: ${QUEUE_STATE_LABEL[queueState({ ...open, resubmitBy: day(open.resubmitBy), answeredOnTime: answeredHere.has(open.id) }, today)].en.toLowerCase()}` : waitingForApplicant ? "Waiting for the applicant to complete registration online" : "No application open",
          sentOnline ? `Registration sent ${formatDate(day(sentOnline.receivedOn))}` : null,
          status === "REGISTERED" ? (s.erpVendorCode ? `Vendor code ${s.erpVendorCode}` : ERP_NOT_SYNCED.en) : null,
        ]}
      />
      <div className="mb-6 flex flex-col gap-3">
        {!today && (
          <Callout tone="warn" title="Time zone not set. Dates cannot be judged." action={<ButtonLink href="/configuration/organisation" size="sm">Set time zone</ButtonLink>} />
        )}
        {reading && reading.standing !== "ACTIVE" && reading.standing !== "NOT_REGISTERED" && (
          <Callout tone="err" title={standingWords(reading).en}>
            {reading.standing === "SUSPENDED_ON_LAPSE" ? `${reading.lapsed.join(", ")} expired.` : `Since ${formatDate((reading.blacklist ?? reading.cancellation ?? reading.suspension)!.effectiveOn)}.`} Sales refused.
          </Callout>
        )}
        {issues.length > 0 && (
          <Callout tone="warn" title="Mandatory documents not in force">
            {issues.map((x) => `${x.type.label}: ${DOCUMENT_STATE_LABEL[x.state].en.toLowerCase()}`).join("; ")}.
          </Callout>
        )}
      </div>
      <Tabs initial={tab} label="Supplier" tabs={tabs} />
    </>
  );
}

// ------------------------------------------------------------------ profile

/// A contact's portal account in words: its state, and when it was last signed in. The sign-in name is the contact's, shown only to a reader the contact is open to (the caller asks that).
function AccountCell({ account, timeZone }: { account: { loginName: string; status: AccountStatus; locked: boolean; lastSignInAt: Date | null } | null; timeZone: string | null }) {
  if (!account) return <span className="text-ink-4">No account</span>;
  const words = accountStateWords({ status: account.status, locked: account.locked });
  return (
    <CellStack
      title={account.loginName}
      sub={`${words.en}${account.status === "ACTIVE" ? (account.lastSignInAt ? ` · last signed in ${formatOrgDateTime(account.lastSignInAt, timeZone)}` : " · not signed in yet") : ""}`}
    />
  );
}

/// Whether the contact may sign for the contractor's company from the portal (ruling on 1928(3)): an officer's mark, and not decided until set, which refuses.
function SignerCell({ mark }: { mark: boolean | null }) {
  if (mark == null) return <CellStack title="Not decided" sub="The portal refuses their signature" />;
  return mark ? <CellStack title="Authorised" sub="May sign for the company" /> : <CellStack title="Not authorised" sub="The portal refuses their signature" />;
}

/// What an officer who holds the permission may do to a contact's account, from its state: open it, issue the code it waits for or a reset, unlock it.
function AccountActions({ supplierId, contact }: { supplierId: string; contact: { id: string; name: string; email: string; account: { id: string; status: AccountStatus; failedAttempts: number; locked: boolean } | null } }) {
  const a = contact.account;
  if (!a) return <OpenPortalAccount supplierId={supplierId} contactId={contact.id} name={contact.name} suggestedLoginName={/^[A-Za-z0-9][A-Za-z0-9._@-]{2,63}$/.test(contact.email.trim()) ? contact.email.trim().toLowerCase() : ""} />;
  if (a.status === "PENDING_ACTIVATION") return <IssueSupplierCode supplierId={supplierId} accountId={a.id} name={contact.name} purpose="ACTIVATION" />;
  if (a.status === "DISABLED") return null;
  return (
    <>
      {(a.failedAttempts > 0 || a.locked) && <UnlockSupplierAccount supplierId={supplierId} accountId={a.id} name={contact.name} />}
      <IssueSupplierCode supplierId={supplierId} accountId={a.id} name={contact.name} purpose="RESET" />
    </>
  );
}

function ProfilePanel({ sulit, l, cfg, canManageAccounts }: { sulit: Sulit<true>; l: LoadedSupplier; cfg: SupplierConfig; canManageAccounts: boolean }) {
  const s = l.supplier;
  const fits = matchesFormat(s.registrationNo, cfg.format?.pattern ?? null);
  const contacts = s.contacts.filter((c) => c.retiredOn == null);
  // The Bumiputera status is DECLARED by the applicant; what counts is the verified evidence document (BD-615-1). Read through one rule, so this page and the online application say the same.
  const evidenceTypeId = cfg.policy?.restrictionEvidenceTypeId ?? null;
  const evidence = evidenceTypeId ? (s.documents.filter((d) => d.typeId === evidenceTypeId && !d.notApplicable).find((d) => d.verification === "VERIFIED") ?? s.documents.find((d) => d.typeId === evidenceTypeId && !d.notApplicable) ?? null) : null;
  const bumiputera = bumiputeraReading(s.bumiputeraClaimCode ? (cfg.listName("BUMIPUTERA_STATUS", s.bumiputeraClaimCode) ?? "A status no longer listed") : null, evidenceTypeId != null, evidence ? { reference: evidence.reference, verification: evidence.verification as "NOT_CHECKED" | "VERIFIED" | "NOT_IN_ORDER" } : null, "REGISTER");
  // A supplier recorded before step one asked for the address in parts holds it as one text, rendered as it is.
  const address = s.addressLine1 ? composeAddress(s, s.stateCode ? (cfg.listName("STATE", s.stateCode) ?? null) : null) : s.registeredAddress;
  const vendorBlocker = s.status !== "REGISTERED" ? supplierFaultText({ code: "NOT_REGISTERED", level: "block" }) : null;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<BuildingIcon size={17} />} title="The company" />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Registered name", value: s.registeredName },
              { label: "Registration number", value: <span className="flex flex-col items-start gap-1"><span>{s.registrationNo}</span>{fits === true ? <Chip tone="ok">Matches the configured format</Chip> : fits === false ? <Chip tone="err">Does not match the configured format</Chip> : <Chip tone="warn">Format not checked: no format is set</Chip>}</span> },
              { label: "Entity type", value: cfg.listName("ENTITY_TYPE", s.entityTypeCode) ?? notSet("An entity type no longer listed") },
              { label: "Country", value: cfg.listName("COUNTRY", s.countryCode) ?? notSet("A country no longer listed") },
              { label: "Registered address", value: <span className="break-words whitespace-pre-line">{address}</span> },
              { label: "Date incorporated", value: s.incorporatedOn ? formatDate(day(s.incorporatedOn)) : notSet("Not given") },
              { label: "Bumiputera status", value: <span className="flex flex-col items-start gap-1"><span>{bumiputeraWords(bumiputera).en}</span>{bumiputeraNeedsAttention(bumiputera) && <Chip tone="warn">Claimed with no evidence document lodged</Chip>}</span> },
              { label: "Company email", value: <span className="flex flex-col items-start gap-1"><span className="break-all">{s.companyEmail}</span><Chip tone="neutral">Not verified</Chip></span> },
              { label: "Status", value: SUPPLIER_STATUS_LABEL[s.status as SupplierStatus].en },
              { label: "Registered on", value: s.registeredOn ? formatDate(day(s.registeredOn)) : notSet("Not registered") },
            ]}
          />
        </CardBody>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Contacts"
          subtitle="Named by the supplier"
          actions={<span className="flex flex-wrap items-center gap-2"><SulitTag /><ContactDrawer supplierId={s.id} /></span>}
          divided={contacts.length === 0}
        />
        {contacts.length === 0 ? (
          <EmptyState size="sm" title="No contact recorded" />
        ) : (
          <Table minWidth={820}>
            <colgroup>
              <col />
              <col style={{ width: 170 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 150 }} />
              <ActionsCol icons={0} labelled={2} />
            </colgroup>
            <THead>
              <Th>Contact</Th>
              <Th>Email</Th>
              <Th>Telephone</Th>
              <Th>Portal account</Th>
              <Th>Signs for the contractor</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {contacts.map((c) => (
                <Tr key={c.id}>
                  <Td label="Contact">{sulit.state === "GRANTED" ? <CellStack title={c.name} sub={[c.designation, c.isPrimary ? "Primary contact" : null].filter(Boolean).join(" · ") || undefined} /> : <SulitValue of={sulit} />}</Td>
                  <Td label="Email">{sulit.state === "GRANTED" ? <span className="break-all">{c.email || "—"}</span> : <SulitValue of={sulit} />}</Td>
                  <Td label="Telephone">{sulit.state === "GRANTED" ? c.phone || "—" : <SulitValue of={sulit} />}</Td>
                  <Td label="Portal account">{sulit.state === "GRANTED" ? <AccountCell account={c.account} timeZone={l.org.timeZone} /> : <SulitValue of={sulit} />}</Td>
                  <Td label="Signs for the contractor">
                    {sulit.state === "GRANTED" ? (
                      <span className="flex flex-col items-start gap-1">
                        <SignerCell mark={c.authorisedToSignForContractor} />
                        {canManageAccounts && <SetContractorSigner supplierId={s.id} contactId={c.id} name={c.name} mark={c.authorisedToSignForContractor} />}
                      </span>
                    ) : (
                      <SulitValue of={sulit} />
                    )}
                  </Td>
                  <Td>
                    <RowActions>
                      {sulit.state === "GRANTED" && canManageAccounts && <AccountActions supplierId={s.id} contact={c} />}
                      {sulit.state === "GRANTED" && <ContactDrawer supplierId={s.id} contact={{ id: c.id, name: c.name, values: { contactId: c.id, contactName: c.name, contactDesignation: c.designation, contactEmail: c.email, contactPhone: c.phone, primary: c.isPrimary } }} />}
                      {sulit.state === "GRANTED" && !c.isPrimary && <RetireContact supplierId={s.id} contactId={c.id} name={c.name} />}
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="The finance system" subtitle="Entered by hand" actions={<VendorCodeDrawer supplierId={s.id} current={s.erpVendorCode} blocker={vendorBlocker} />} />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Vendor code", value: s.erpVendorCode ?? (s.status === "REGISTERED" ? <Badge tone="warn">{ERP_NOT_SYNCED.en}</Badge> : notSet("Recorded once registered")) },
              { label: "Entered", value: s.erpSyncedAt ? formatOrgDateTime(s.erpSyncedAt, l.org.timeZone) : notSet("Not entered") },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ documents

function DocumentsPanel({ l, cfg, people }: { l: LoadedSupplier; cfg: SupplierConfig; people: Option[] }) {
  const s = l.supplier;
  const today = l.org.today;
  const docs = s.documents.map(documentFacts);
  const states = today ? documentStates(cfg.typeFacts, docs, today) : [];
  const liveTypes = cfg.types.filter((t) => cfg.live(t, today));
  const held = new Set(s.documents.map((d) => d.typeId));
  const lodgeable = liveTypes.filter((t) => !held.has(t.id)).map((t) => ({ value: t.id, label: t.nameEn }));
  const values = (bodyId: string | null) => cfg.bodies.filter((b) => !bodyId || b.id === bodyId).flatMap((b) => b.values.filter((v) => cfg.live(v, today)).map((v) => ({ value: v.id, label: `${asHeading(b.labelEn)}: ${v.nameEn}` })));
  const open = s.applications.some(isOpen);
  const closed = s.status === "REJECTED" && !open;
  const lodgeBlocker = !today ? supplierFaultText({ code: "TIME_ZONE_UNSET", level: "block" }) : closed ? supplierFaultText({ code: "SUPPLIER_CLOSED", level: "block" }) : lodgeable.length === 0 ? (liveTypes.length ? "Every configured type is on file: lodge a later one as a renewal." : supplierFaultText({ code: "TYPE_NOT_CONFIGURED", level: "block" })) : null;
  const notice = cfg.policy?.verificationNoticeEn;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
        <InfoChip tone="warn" detail={NOT_VALIDATED.en}>Not checked</InfoChip>
        {notice ? <>“{notice}” <ProvenanceBadge value={cfg.policy?.noticeProvenance} /></> : <Chip tone="warn">Notice not set</Chip>}
      </div>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileIcon size={17} />}
          title="Statutory documents"
          subtitle="Mandatory first · scans SULIT"
          actions={<span className="flex flex-wrap items-center gap-2"><SulitTag /><LodgeDocumentDrawer supplierId={s.id} types={lodgeable} values={values(null)} people={people} blocker={lodgeBlocker} /></span>}
          divided={states.length === 0}
        />
        {states.length === 0 ? (
          <EmptyState size="sm" title={today ? "Nothing lodged" : "Not judged: time zone not set"} />
        ) : (
          <div className="divide-y divide-line/70">
            {states.map((st) => {
              const chain = chainOrder(docs.filter((d) => d.typeId === st.type.id));
              const typeRow = cfg.types.find((t) => t.id === st.type.id)!;
              return (
                <section key={st.type.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-semibold text-ink">{st.type.label}</span>
                      {st.mandatory && <Badge outline>Mandatory</Badge>}
                      <Badge tone={DOCUMENT_STATE_TONE[st.state]}>{DOCUMENT_STATE_LABEL[st.state].en}</Badge>
                      {st.pending && st.effective && <Chip tone="warn">Renewal lodged, not verified yet</Chip>}
                      {st.upcoming && <Chip tone="info">{renewalUpcomingWords(st.upcoming.validFrom)}</Chip>}
                      {today && st.effective?.expiresOn && st.state === "VALID" && (() => { const b = expiryBand(st.effective.expiresOn, today, { criticalDays: cfg.policy?.criticalDays ?? null, warningDays: cfg.policy?.warningDays ?? null, upcomingDays: cfg.policy?.upcomingDays ?? null }); return b.band === "NONE" ? null : <Chip tone={EXPIRY_BAND_TONE[b.band] === "neutral" ? undefined : EXPIRY_BAND_TONE[b.band]}>{`Expiry: ${EXPIRY_BAND_LABEL[b.band].en.toLowerCase()}${b.daysLeft != null ? `, ${b.daysLeft} days left` : ""}`}</Chip>; })()}
                    </div>
                    {typeRow.hintEn && <p className="text-[12.5px] text-ink-3">{typeRow.hintEn}</p>}
                    </div>
                    {st.state === "MISSING" && <LodgeDocumentDrawer supplierId={s.id} types={[{ value: st.type.id, label: st.type.label }]} values={values(typeRow.bodyId)} people={people} blocker={lodgeBlocker === null || lodgeBlocker.startsWith("Every") ? null : lodgeBlocker} trigger="Lodge" />}
                  </div>
                  {chain.length === 0 ? (
                    <p className="text-[13px] text-ink-3">Not lodged.</p>
                  ) : (
                    <ol className="flex flex-col gap-3">
                      {chain.map((d, i) => {
                        const row = s.documents.find((x) => x.id === d.id)!;
                        const head = i === 0;
                        const scanned = row.attachments.some((a) => a.purpose === "SUPPLIER_DOCUMENT" && isLive(a));
                        const verifyBlocker = first(verifyFaults({ state: "VERIFIED", personActive: true, verifiedOn: today, note: "" }, { verification: d.verification, lodgedOn: d.lodgedOn, notApplicable: d.notApplicable, scanned }, today));
                        const renewBlocker = first(lodgeFaults({ typeId: d.typeId, reference: "x", issuingAuthority: "x", issuedOn: null, validFrom: null, expiresOn: null, notApplicable: false, values: [] }, { today, type: st.type, chain, renews: d, renewing: true, supplierRejected: closed }).filter((f) => ["TIME_ZONE_UNSET", "TYPE_RETIRED", "RENEWS_SUPERSEDED", "SUPPLIER_CLOSED", "EXPIRES_NOT_SET"].includes(f.code)));
                        return (
                          <li key={d.id} className="border-t border-line/60 pt-3 first:border-t-0 first:pt-0">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="text-[13.5px] font-semibold text-ink">{d.notApplicable ? "Recorded as not applicable" : d.supersedesId ? "Renewal" : "Lodged"}{row.title ? ` · ${row.title}` : ""}{row.reference ? ` · ${row.reference}` : ""}</span>
                                <Badge tone={VERIFICATION_TONE[d.verification]}>{VERIFICATION_LABEL[d.verification].en}</Badge>
                                {scanned && row.attachments.some((a) => a.purpose === "SUPPLIER_DOCUMENT" && isLive(a) && a.version.scanState === "NOT_SCANNED") && <Chip tone="warn">Not scanned</Chip>}
                                {!head && <Chip>Renewed since</Chip>}
                              </div>
                              <span className="flex flex-wrap items-center gap-2">
                                {d.verification === "NOT_CHECKED" && <VerifyDocumentDrawer documentId={d.id} label={`${st.type.label}${row.reference ? ` ${row.reference}` : ""}`} people={people} today={today} blocker={verifyBlocker} expiresOn={d.expiresOn} asksExpiry={typeRow.expires !== false && !d.notApplicable} />}
                                {head && !d.notApplicable && <LodgeDocumentDrawer supplierId={s.id} types={[]} values={values(typeRow.bodyId)} people={people} renews={{ id: d.id, typeId: d.typeId, label: `${st.type.label}${row.reference ? ` ${row.reference}` : ""}` }} blocker={renewBlocker} />}
                              </span>
                            </div>
                            <KeyValues
                              columns={3}
                              className="mt-3"
                              items={[
                                { label: "Issuing authority", value: row.issuingAuthority || "—" },
                                { label: "Issued on", value: d.issuedOn ? formatDate(d.issuedOn) : "—" },
                                { label: "Valid", value: d.notApplicable ? "—" : `${d.validFrom ? `from ${formatDate(d.validFrom)}` : "from issue"}${d.expiresOn ? ` to ${formatDate(d.expiresOn)}` : typeRow.expires === false ? ", no expiry" : ""}` },
                                { label: "Codes", value: row.values.length ? row.values.map((v) => `${v.codeSnapshot} — ${v.labelSnapshot}`).join("; ") : "—" },
                                ...(row.ratePercent != null ? [{ label: "Rate", value: `${row.ratePercent.toString()}%` }] : []),
                                { label: "Lodged", value: <>{formatDate(d.lodgedOn)} · {row.recordedBy ? <ActedBy entity="SupplierDocument" id={row.id} slot="recordedBy" name={row.recordedBy.name} /> : "the supplier's own portal account"}</> },
                                { label: "Checked", value: d.verification === "NOT_CHECKED" ? "Not yet" : <>{formatDate(d.verifiedOn)} · {row.verifiedBy ? <ActedBy entity="SupplierDocument" id={row.id} slot="verifiedBy" name={row.verifiedBy.name} /> : "Not recorded"}{row.verificationNote ? ` · “${row.verificationNote}”` : ""}</> },
                              ]}
                            />
                            {!d.notApplicable && (
                              <div className="mt-3">
                                <OwnerAttachments owner={{ kind: "supplierDocument", id: d.id }} title="Scan" collapseWhenEmpty={false} statuses={{ SUPPLIER_DOCUMENT: scanned ? { text: "Attached", tone: "ok" } : { text: d.verification === "NOT_CHECKED" ? "Needed before it is verified" : "Not attached", tone: "warn" } }} />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ applications

async function ApplicationsPanel({ actor, l, cfg, people, blacklist, cancellation, sulit, waitingForApplicant, summaryOpen }: { actor: StaffActor; l: LoadedSupplier; cfg: SupplierConfig; people: Option[]; blacklist: BlacklistInEffect | null; cancellation: CancellationInEffect | null; sulit: Sulit<true>; waitingForApplicant: boolean; summaryOpen: boolean }) {
  const s = l.supplier;
  const today = l.org.today;
  // Who decided each outcome, signed or recorded from paper, is read from its attribution (Phase 2b).
  const decided = await loadAttributions(db, l.org.id, [{ entity: "ApplicationDecision", slot: "decidedBy", ids: s.applications.flatMap((a) => a.decisions.map((d) => d.id)) }]);
  // Phase 4b (FR-VND-006, BD-613-44): how each came in, the declaration its supplier signed online and whether that stands in for the paper, and whether its bank details were checked.
  const extras = new Map(await Promise.all(s.applications.map(async (a) => [a.id, await reviewFacts(db, l.org.id, s.id, a)] as const)));
  const anyOpen = s.applications.some(isOpen);
  // Phase 4c: the requests the supplier answered online in time: a passed deadline then reads "answered online", and is not a lapse to record.
  const answeredIds = await answeredOnTimeIds(db, l.org.id, s.applications.map((a) => a.id));
  // M-1: the kinds this supplier may open, by the act's own rule: a cancelled registration opens only a new one (the way back).
  const kinds = APPLICATION_KINDS.filter((k) => applicationKindFaults(k, s.status as SupplierStatus, cancellation).length === 0).map((k) => ({ value: k, label: APPLICATION_KIND_LABEL[k].en }));
  // FR-TRM-017 (fix S-2): a blacklisting in effect stops a renewal or upgrade, and its approval.
  const openBlocker = first([...openApplicationFaults(kinds[0]?.value ?? (s.status === "REGISTERED" ? "RENEWAL" : "NEW"), s.status as SupplierStatus, anyOpen, blacklist, cancellation)]);
  // The route each open file would take, previewed now (the act resolves it again, with the sender in mind).
  const issue = today ? await loadIssue(l.org.code, dayToDate(today), undefined, null) : null;
  const [roster, delegations] = issue ? await Promise.all([loadRoster(l.org.code), loadDelegations(l.org.code)]) : [null, null];
  const suggestions = (code: string | null) => {
    if (!code || !roster || !delegations || !today) return people;
    const h = supplierHolders(code, roster, delegations, today);
    const top = [...h.holderIds, ...h.delegates.map((d) => d.personId)];
    return [...people.filter((p) => top.includes(p.value)).map((p) => ({ ...p, label: `${p.label} — ${h.holderIds.includes(p.value) ? "holds the office" : "delegate"}` })), ...people.filter((p) => !top.includes(p.value))];
  };
  const docs = s.documents.map(documentFacts);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <InfoChip tone="warn" detail={NOT_SENT.en}>Not emailed</InfoChip>
        <OpenApplicationDrawer supplierId={s.id} kinds={kinds} channels={PAPER_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c].en }))} people={people} today={today} blocker={openBlocker} />
      </div>
      {s.applications.length === 0 && (
        <Card>
          {waitingForApplicant ? (
            <EmptyState title="Waiting for the applicant" action={s.portalApplications[0]?.reference ? <ButtonLink href={`/suppliers/online/${s.portalApplications[0].id}`} size="sm">{s.portalApplications[0].reference}</ButtonLink> : undefined} />
          ) : (
            <EmptyState title="No application recorded" />
          )}
        </Card>
      )}
      {s.applications.map((a) => {
        const st = queueState({ ...a, resubmitBy: day(a.resubmitBy), answeredOnTime: answeredIds.has(a.id) }, today);
        const isOpenNow = isOpen(a);
        const f = today ? fileFacts({ status: a.status, lapsedRecordedAt: a.lapsedRecordedAt, resubmitBy: day(a.resubmitBy), answeredOnTime: answeredIds.has(a.id), routePending: a.routes.some((r) => r.status === "PENDING"), declarationSignedOn: day(a.declarationSignedOn), declarationScanned: a.attachments.some((x) => x.purpose === "SUPPLIER_DECLARATION" && isLive(x)), blacklist, kind: a.kind as ApplicationKind, supplierStatus: s.status as SupplierStatus, cancellation, ...extras.get(a.id)! }, cfg.typeFacts, docs, today) : null;
        const preview = issue && isOpenNow ? supplierRoute(issue.matrix, SUPPLIER_REGISTRATION_DOMAIN, a.kind, { id: "", holds: () => false, ableToAct: () => ({ holderIds: ["someone"], delegateIds: [] }) }, REGISTRATION_MATTER) : null;
        const submitBlocker = !today ? supplierFaultText({ code: "TIME_ZONE_UNSET", level: "block" }) : first(submitFaults(f!, today)) ?? (!issue ? "No approval matrix is in force. Issue one under Configuration › Approval matrix." : preview?.refusal?.en ?? null);
        const decideBlocker = (outcome: "RESUBMIT" | "REJECT") => first(decisionFaults({ outcome, remarks: "x", resubmitBy: null, items: [{ documentId: null, typeId: null, remarks: "x" }], personActive: true }, { status: a.status, lapsedRecordedAt: a.lapsedRecordedAt, resubmitBy: day(a.resubmitBy), answeredOnTime: answeredIds.has(a.id), routePending: a.routes.some((r) => r.status === "PENDING") }, { today, documentIds: [], typeIds: [] }).filter((x) => ["TIME_ZONE_UNSET", "DECIDED", "LAPSE_UNRECORDED", "ROUTE_PENDING"].includes(x.code)));
        const items = [
          ...s.documents.filter((d) => !d.renewedBy).map((d) => ({ name: `item:${d.id}`, label: `${d.typeLabelSnapshot}${d.reference ? ` ${d.reference}` : ""}: remarks` })),
          ...cfg.types.filter((t) => cfg.live(t, today) && !s.documents.some((d) => d.typeId === t.id)).map((t) => ({ name: `type:${t.id}`, label: `${t.nameEn} (not lodged): remarks` })),
        ];
        return (
          <Card key={a.id} className="overflow-hidden">
            <CardHeader
              icon={<ClipboardIcon size={17} />}
              title={`${APPLICATION_KIND_LABEL[a.kind as ApplicationKind].en}, received ${formatDate(day(a.receivedOn))}`}
              subtitle={a.recordedBy ? <>{CHANNEL_LABEL[a.channel].en} · <ActedBy entity="SupplierApplication" id={a.id} slot="recordedBy" name={a.recordedBy.name} />, {formatOrgDateTime(a.recordedAt, l.org.timeZone)}</> : `${CHANNEL_LABEL[a.channel].en} · came in through an earlier online form, ${formatOrgDateTime(a.recordedAt, l.org.timeZone)}. No officer is on file as having recorded it.${a.declarationSignedOn ? "" : " The signed declaration is still to come on paper."}`}
              actions={<Badge tone={QUEUE_STATE_TONE[st]} dot>{QUEUE_STATE_LABEL[st].en}</Badge>}
            />
            <CardBody className="flex flex-col gap-4">
              {a.submittedAt && <InfoChip tone="info" detail={`Sent from the portal on ${formatOrgDateTime(a.submittedAt, l.org.timeZone)}. Declaration signed online. ${extras.get(a.id)?.onlineDeclarationReplacesPaper === true ? "The organisation accepts it in place of the paper declaration." : "The paper declaration is still required."}`}>Sent online</InfoChip>}
              <KeyValues
                columns={3}
                items={[
                  { label: "Declaration signed on", value: a.declarationSignedOn ? formatDate(day(a.declarationSignedOn)) : a.submittedAt ? <span>Online, {formatOrgDay(a.submittedAt, l.org.timeZone)}</span> : notSet("Not recorded") },
                  { label: "E-Payment form received on", value: a.epaymentFormReceivedOn ? formatDate(day(a.epaymentFormReceivedOn)) : notSet("Not recorded") },
                  { label: "Resubmit by", value: a.resubmitBy && a.status === "RESUBMISSION_REQUESTED" ? formatDate(day(a.resubmitBy)) : "—" },
                ]}
              />
              {isOpenNow && (
                <div className="flex flex-wrap items-center gap-2">
                  {st === "LAPSED" ? (
                    <RecordLapseDrawer applicationId={a.id} deadline={formatDate(day(a.resubmitBy))} />
                  ) : st === "WITH_APPROVAL" ? null : (
                    <>
                      <SubmitApplicationDrawer applicationId={a.id} people={people} blocker={submitBlocker} route={preview?.chain.map((x) => `${issue!.matrix.roles[x.roleCode]?.nameEn ?? "An office no longer configured"} (${ACT_LABEL[x.act]?.toLowerCase() ?? "acts"})`) ?? []} />
                      <ResubmissionDrawer applicationId={a.id} items={items} people={people} blocker={decideBlocker("RESUBMIT")} />
                      <RejectApplicationDrawer applicationId={a.id} people={people} blocker={decideBlocker("REJECT")} />
                    </>
                  )}
                  <PaperDaysDrawer applicationId={a.id} values={{ declarationSignedOn: day(a.declarationSignedOn) ?? "", epaymentFormReceivedOn: day(a.epaymentFormReceivedOn) ?? "" }} />
                </div>
              )}
              {st === "WITH_APPROVAL" && <p className="text-[12.5px] text-ink-3">With approval. The route decides.</p>}
              {isOpenNow && st !== "LAPSED" && st !== "WITH_APPROVAL" && submitBlocker && <p className="text-[12.5px] text-ink-3"><span className="font-semibold text-ink-2">Send for decision:</span> not yet — {submitBlocker}</p>}
              {st === "LAPSED" && <Callout tone="err" title={`Deadline passed ${formatDate(day(a.resubmitBy))}. Recording the lapse rejects it.`} />}
              {st === "ANSWERED" && <Callout tone="warn" title={`Answered by the ${formatDate(day(a.resubmitBy))} deadline. Check, then decide.`} />}
            </CardBody>
            {a.decisions.length > 0 && (
              <div className="border-t border-line">
                <h3 className="px-5 pt-3 text-[13px] font-semibold text-ink-2 sm:px-6">Outcomes recorded</h3>
                <ul className="divide-y divide-line/70">
                  {a.decisions.map((d) => {
                    const snap = isDecisionSnapshot(d.policySnapshot) ? d.policySnapshot : null;
                    return (
                      <li key={d.id} className="flex flex-col gap-1.5 px-5 py-3 text-[13px] sm:px-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={d.outcome === "APPROVE" ? "ok" : d.outcome === "RESUBMIT" ? "warn" : "err"}>{OUTCOME_LABEL[d.outcome].en}</Badge>
                          <span className="text-ink-2">{formatDate(day(d.decidedOn))}{d.decidedBy ? ` · ${decided.read({ entity: "ApplicationDecision", id: d.id, slot: "decidedBy" }, d.decidedBy.name).en}` : " · the deadline's outcome, nobody's decision"}</span>
                        </div>
                        {d.remarks && <p className="break-words whitespace-pre-line text-ink-2">“{d.remarks}”</p>}
                        {d.items.length > 0 && (
                          <ul className="list-disc pl-5 text-ink-2">
                            {d.items.map((i) => {
                              // Phase 4c (FR-VND-007): what the supplier sent online in answer to this item, newest first, with the officer's check of it.
                              const replies = s.documents.filter((x) => x.answersItemId === i.id).sort((x, y) => y.recordedAt.getTime() - x.recordedAt.getTime());
                              const latest = replies[0];
                              return (
                                <li key={i.id}>
                                  <span className="font-medium">{i.labelSnapshot}</span>: “{i.remarks}”
                                  {latest && (
                                    <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle">
                                      <Chip tone="info">Answered online {formatDate(day(latest.lodgedOn))}</Chip>
                                      <Badge tone={VERIFICATION_TONE[latest.verification]}>{VERIFICATION_LABEL[latest.verification].en}</Badge>
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {d.resubmitBy && <p className="text-ink-3">Resubmit by {formatDate(day(d.resubmitBy))}. The notice to the supplier is shown here, not sent.</p>}
                        {snap && <p className="text-[12.5px] text-ink-3">Judged on {formatDate(snap.judgedOn)} under: {snap.mandatory.length ? snap.mandatory.map((m) => `${m.type} ${DOCUMENT_STATE_LABEL[m.state].en.toLowerCase()}${m.provenance ? ` (mandatory: ${m.provenance.toLowerCase()})` : ""}`).join("; ") : "no mandatory document type"}.</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {a.routes.map((r) => (
              <div key={r.id} className="border-t border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-3 sm:px-6">
                  <span className="text-[13px] font-semibold text-ink-2">Approval route · sent {formatDate(day(r.openedAt))} · {r.ruleLabel ?? "a rule no longer recorded"}{r.ruleClause ? ` · ${r.ruleClause}` : ""}</span>
                  <Badge tone={r.status === "REJECTED" ? "warn" : routeTone(r.status)}>{r.status === "PENDING" ? "With approval" : r.status === "APPROVED" ? "Approved" : r.status === "REJECTED" ? "Refused: the application stays open" : "Closed"}</Badge>
                </div>
                <p className="px-5 pb-2 text-[12.5px] text-ink-3 sm:px-6">Routed on no value: a supplier matter is not routed on a value, so only a rule with no value band applies. Chain beneath the approver: {routeCoreText(r, () => ({ en: "an office no longer configured" })).en}</p>
                {r.status === "REJECTED" && <p className="px-5 pb-2 text-[12.5px] text-ink-2 sm:px-6">Refused: {r.rejectionReason || "no reason recorded"}.</p>}
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
              </div>
            ))}
            {summaryOpen && a.submittedAt && (
              <div className="border-t border-line p-4 sm:p-5">
                <h3 className="mb-3 text-[14.5px] font-bold text-ink">Application summary</h3>
                <ApplicationSummary actor={actor} l={l} applicationId={a.id} contactsGate={sulit} />
              </div>
            )}
            <div className="border-t border-line p-4 sm:p-5">
              <OwnerAttachments
                owner={{ kind: "supplierApplication", id: a.id }}
                title="The paper"
                subtitle="Declaration and E-Payment form · SULIT"
                only={["SUPPLIER_DECLARATION", "SUPPLIER_EPAYMENT_FORM"]}
                required={{ SUPPLIER_DECLARATION: isOpenNow }}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ history

const ACTION_LABEL = { CREATE: "Created", UPDATE: "Changed", DELETE: "Removed" } as const;

function HistoryPanel({ sulit, entries, total, timeZone }: { sulit: Sulit<true>; entries: Awaited<ReturnType<typeof supplierHistory>>["entries"]; total: number; timeZone: string | null }) {
  type Entry = (typeof entries)[number];
  const read = (field: string, stored: string | null, e: Entry): string => {
    // 612-C2: a value an older writer built from a code reads through the label map.
    const value = historyValueWords(e.entity, field, stored);
    if (value == null || value === "") return "—";
    if (e.entity === "ApprovalInstance" && field === "status") return value === "PENDING" ? "With approval" : value === "APPROVED" ? "Approved" : value === "REJECTED" ? "Refused" : "Closed";
    if (e.entity === "SupplierApplication" && field === "status") return { RECEIVED: "Received", RESUBMISSION_REQUESTED: "Resubmission requested", APPROVED: "Approved", REJECTED: "Rejected" }[value] ?? "—";
    if (field === "decision") return DECISION_LABEL[value as keyof typeof DECISION_LABEL] ?? "—";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    if (value === "true" || value === "yes") return "Yes";
    if (value === "false" || value === "no") return "No";
    if (/^[A-Z][A-Z_]+$/.test(value)) return "—";
    return value;
  };
  // A registered SULIT field (a contact's details, condition 2) is shown or withheld in the trail as the supplier's one answer says.
  const chipped = (field: string, value: string | null, e: Entry): ReactNode => {
    const held = value ? sulitHistoryValue(field, "supplier", sulit, read(field, value, e)) : null;
    return held ? <SulitValue of={held} /> : read(field, value, e);
  };
  const shown = (field: string, ch: { before: string | null; after: string | null }, action: string) => !/(Code|Key|Id)$/.test(field) && (action !== "UPDATE" || ch.before !== ch.after);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="History"
        subtitle={total > entries.length ? `Latest ${entries.length} of ${total}` : undefined}
        divided={entries.length === 0}
      />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes" />
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={e.action === "CREATE" ? "ok" : e.action === "DELETE" ? "err" : "info"}>{ACTION_LABEL[e.action]}</Badge>
                <span className="font-semibold text-ink">{SUPPLIER_ENTITY_LABEL[e.entity]?.en ?? "Record"}</span>
                <span className="min-w-0 break-words text-ink-2">{historyEntityLabel(e.entity, e.entityLabel)}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatOrgDay(e.at, timeZone)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] break-words text-ink-3">
                  {e.changes.filter((ch) => shown(ch.field, ch, e.action)).map((ch) => (
                    <li key={ch.field}>
                      {supplierFieldName(ch.field, e.changes.map((x) => x.field))}: {e.action === "UPDATE" && <>{chipped(ch.field, ch.before, e)} → </>}
                      <span className="text-ink-2">{chipped(ch.field, e.action === "DELETE" ? ch.before : ch.after, e)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {e.reason && <p className="text-[12.5px] text-ink-3">Reason: {e.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
