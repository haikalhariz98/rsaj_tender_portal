import { hiddenExercises } from "@/app/_auth/sulit";
import { ActedBy } from "@/components/attribution";
import Link from "next/link";
import { historyEntityLabel, historyValueWords } from "@/lib/audit/entity-labels";
import { notFound } from "next/navigation";

import { EscalateDrawer } from "@/app/approvals/editors";
import { RouteSteps } from "@/app/sourcing/[id]/route-steps";
import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { BuildingIcon, ClipboardIcon, ClockIcon, FileIcon, LinkIcon, RouteIcon, ScaleIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { isMandatoryAct } from "@/components/ui/act";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
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
import { VALUE_SULIT_LABEL } from "@/lib/documents/labels";
import { isLive } from "@/lib/documents/evidence";
import { formatDate, formatOrgDateTime, formatOrgDay } from "@/lib/format";
import { matchesFormat } from "@/lib/integration/award-commitment";
import { ACT_DONE_LABEL, ACT_LABEL } from "@/lib/labels";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { isSulitField } from "@/lib/sulit-fields";
import { SUPPLIER_ENTITY_LABEL, supplierFieldName } from "@/lib/suppliers/audit-view";
import { chainOrder, documentStates, lodgeFaults, verifyFaults } from "@/lib/suppliers/documents";
import {
  APPLICATION_KIND_LABEL,
  CHANNEL_LABEL,
  DOCUMENT_STATE_LABEL,
  DOCUMENT_STATE_TONE,
  EPAYMENT_SULIT_CHIP,
  ERP_NOT_SYNCED,
  NOT_RESTRICTED_CHIP,
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
import { documentFacts, loadSupplier, loadSupplierConfig, supplierHistory, type LoadedSupplier, type SupplierConfig } from "@/lib/suppliers/repo";
import { applicationKindFaults, decisionFaults, fileFacts, isDecisionSnapshot, isOpen, openApplicationFaults, queueState, submitFaults, type BlacklistInEffect, type CancellationInEffect } from "@/lib/suppliers/review";
import { supplierHolders, supplierRoute } from "@/lib/suppliers/route";
import { PAPER_CHANNELS, APPLICATION_KINDS, blocking, SUPPLIER_REGISTRATION_DOMAIN, type ApplicationKind, type Finding, type SupplierStatus } from "@/lib/suppliers/types";
import { routeTone, stepTone } from "@/lib/ui/status-tone";

import { expiryBand } from "@/lib/suppliers/expiry";
import { asHeading, EXPIRY_BAND_LABEL, EXPIRY_BAND_TONE, renewalUpcomingWords, standingTone, standingWords } from "@/lib/suppliers/labels";
import { standing } from "@/lib/suppliers/standing";
import { standingEventFacts } from "@/lib/suppliers/standing-repo";

import { EligibilityPanel, ParticipationPanel, StandingPanel } from "./standing-panels";
import { ContactDrawer, DecideStepDrawer, LodgeDocumentDrawer, OpenApplicationDrawer, PaperDaysDrawer, RecordLapseDrawer, RejectApplicationDrawer, ResubmissionDrawer, SubmitApplicationDrawer, VendorCodeDrawer, VerifyDocumentDrawer } from "./editors";
import { requireStaff } from "@/app/_auth/actor";
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
  const [{ id }, { tab, exercise, fromAward }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string; exercise?: string; fromAward?: string }>]);
  const l = await loadSupplier(actor.organisationId, id, await hiddenExercises(actor));
  if (!l) notFound();
  const { supplier: s, org } = l;
  const today = org.today;
  const [cfg, people, history] = await Promise.all([loadSupplierConfig(org.id), db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }), supplierHistory(l)]);
  const peopleOptions: Option[] = people.map((p) => ({ value: p.id, label: p.name }));
  const status = s.status as SupplierStatus;
  const docs = s.documents.map(documentFacts);
  const states = today ? documentStates(cfg.typeFacts, docs, today) : [];
  const open = s.applications.find(isOpen) ?? null;
  // a2: where it stands, derived on the organisation's day (OD-7 A), never stored.
  const reading = today ? standing({ status, registeredOn: day(s.registeredOn) }, s.standingEvents.map(standingEventFacts), states.filter((x) => x.mandatory).map((x) => ({ typeLabel: x.type.label, state: x.state })), { autoSuspendOnLapse: cfg.policy?.autoSuspendOnLapse ?? null }, today) : null;
  const linkedCount = s.parties.length + s.awards.filter((a) => !a.awardeePartyId).length;

  const tabs = [
    { id: "profile", label: "Profile", icon: <BuildingIcon size={15} />, panel: <ProfilePanel l={l} cfg={cfg} /> },
    { id: "documents", label: "Documents", icon: <FileIcon size={15} />, count: s.documents.length, panel: <DocumentsPanel l={l} cfg={cfg} people={peopleOptions} /> },
    { id: "applications", label: "Applications", icon: <ClipboardIcon size={15} />, count: s.applications.length, panel: <ApplicationsPanel l={l} cfg={cfg} people={peopleOptions} blacklist={reading?.blacklist ?? null} cancellation={reading?.cancellation ?? null} /> },
    { id: "standing", label: "Standing", icon: <ShieldIcon size={15} />, count: s.standingEvents.length, panel: <StandingPanel l={l} cfg={cfg} reading={reading} people={peopleOptions} fromAward={fromAward ?? null} /> },
    { id: "eligibility", label: "Eligibility", icon: <ScaleIcon size={15} />, panel: <EligibilityPanel l={l} exerciseId={exercise ?? null} /> },
    { id: "participation", label: "Participation", icon: <LinkIcon size={15} />, count: linkedCount, panel: <ParticipationPanel l={l} people={peopleOptions} /> },
    { id: "history", label: "History", icon: <ClockIcon size={15} />, count: history.total, panel: <HistoryPanel entries={history.entries} total={history.total} timeZone={org.timeZone} /> },
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
          open ? `${APPLICATION_KIND_LABEL[open.kind as ApplicationKind].en}: ${QUEUE_STATE_LABEL[queueState({ ...open, resubmitBy: day(open.resubmitBy) }, today)].en.toLowerCase()}` : "No application open",
          status === "REGISTERED" ? (s.erpVendorCode ? `Vendor code ${s.erpVendorCode}` : ERP_NOT_SYNCED.en) : null,
        ]}
      />
      <div className="mb-6 flex flex-col gap-3">
        {!today && (
          <Callout tone="warn" title="The organisation's time zone is not set" action={<ButtonLink href="/configuration/organisation" size="sm">Set time zone</ButtonLink>}>
            Documents are judged on the organisation&apos;s day, and every act on the register records a day: none is assumed to be UTC.
          </Callout>
        )}
        {reading && reading.standing !== "ACTIVE" && reading.standing !== "NOT_REGISTERED" && (
          <Callout tone="err" title={standingWords(reading).en}>
            {reading.standing === "SUSPENDED_ON_LAPSE" ? `Derived from ${reading.lapsed.join(", ")} having expired; it ends when the renewal is verified.` : `Since ${formatDate((reading.blacklist ?? reading.cancellation ?? reading.suspension)!.effectiveOn)}. `}
            {" "}A sale to it is refused, and an envelope it lodges is judged not eligible at the opening. See the Standing tab.
          </Callout>
        )}
        {issues.length > 0 && (
          <Callout tone="warn" title="Mandatory documents not in force">
            {issues.map((x) => `${x.type.label}: ${DOCUMENT_STATE_LABEL[x.state].en.toLowerCase()}`).join("; ")}. See the Documents tab.
          </Callout>
        )}
      </div>
      <Tabs initial={tab} label="Supplier" tabs={tabs} />
    </>
  );
}

// ------------------------------------------------------------------ profile

function ProfilePanel({ l, cfg }: { l: LoadedSupplier; cfg: SupplierConfig }) {
  const s = l.supplier;
  const fits = matchesFormat(s.registrationNo, cfg.format?.pattern ?? null);
  const contacts = s.contacts.filter((c) => c.retiredOn == null);
  const vendorBlocker = s.status !== "REGISTERED" ? supplierFaultText({ code: "NOT_REGISTERED", level: "block" }) : null;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<BuildingIcon size={17} />} title="The company" subtitle="As given on its application." />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Registered name", value: s.registeredName },
              { label: "Registration number", value: <span className="flex flex-col items-start gap-1"><span>{s.registrationNo}</span>{fits === true ? <Chip tone="ok">Matches the configured format</Chip> : fits === false ? <Chip tone="err">Does not match the configured format</Chip> : <Chip tone="warn">Format not checked: no format is set</Chip>}</span> },
              { label: "Entity type", value: cfg.listName("ENTITY_TYPE", s.entityTypeCode) ?? notSet("An entity type no longer listed") },
              { label: "Country", value: cfg.listName("COUNTRY", s.countryCode) ?? notSet("A country no longer listed") },
              { label: "Registered address", value: <span className="break-words whitespace-pre-line">{s.registeredAddress}</span> },
              { label: "Company email", value: <span className="break-all">{s.companyEmail}</span> },
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
          subtitle="People at the supplier, as it names them: not users of this portal, and never staff records."
          actions={<span className="flex flex-wrap items-center gap-2"><Chip tone="err">{VALUE_SULIT_LABEL}</Chip><ContactDrawer supplierId={s.id} /></span>}
          divided={contacts.length === 0}
        />
        {contacts.length === 0 ? (
          <EmptyState size="sm" title="No contact recorded">Add the primary contact named on the application.</EmptyState>
        ) : (
          <Table minWidth={640}>
            <colgroup>
              <col />
              <col style={{ width: 240 }} />
              <col style={{ width: 150 }} />
              <ActionsCol icons={0} labelled={1} />
            </colgroup>
            <THead>
              <Th>Contact</Th>
              <Th>Email</Th>
              <Th>Telephone</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {contacts.map((c) => (
                <Tr key={c.id}>
                  <Td label="Contact"><CellStack title={c.name} sub={[c.designation, c.isPrimary ? "Primary contact" : null].filter(Boolean).join(" · ") || undefined} /></Td>
                  <Td label="Email"><span className="break-all">{c.email || "—"}</span></Td>
                  <Td label="Telephone">{c.phone || "—"}</Td>
                  <Td>
                    <RowActions>
                      <ContactDrawer supplierId={s.id} contact={{ id: c.id, name: c.name, values: { contactId: c.id, contactName: c.name, contactDesignation: c.designation, contactEmail: c.email, contactPhone: c.phone, primary: c.isPrimary } }} />
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="The finance system" subtitle="The vendor code the finance system gives a registered supplier, entered by an officer. There is no adapter yet, so nothing is synced automatically." actions={<VendorCodeDrawer supplierId={s.id} current={s.erpVendorCode} blocker={vendorBlocker} />} />
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
      <Callout tone="info" title="Checked by an officer">
        {NOT_VALIDATED.en} What the supplier is told:{" "}
        {notice ? <>“{notice}” <ProvenanceBadge value={cfg.policy?.noticeProvenance} /></> : <>not set (Configuration › Supplier register).</>}
      </Callout>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileIcon size={17} />}
          title="Statutory documents"
          subtitle="By type, mandatory ones first. A type's state is its newest verified document's, on the organisation's day; a renewal counts once verified. Scans are not restricted until sign-in."
          actions={<span className="flex flex-wrap items-center gap-2"><Chip tone="warn">{NOT_RESTRICTED_CHIP.en}</Chip><LodgeDocumentDrawer supplierId={s.id} types={lodgeable} values={values(null)} people={people} blocker={lodgeBlocker} /></span>}
          divided={states.length === 0}
        />
        {states.length === 0 ? (
          <EmptyState size="sm" title={today ? "Nothing lodged, and no type is mandatory" : "Not judged: the organisation's time zone is not set"}>Lodge each document from the application.</EmptyState>
        ) : (
          <div className="divide-y divide-line/70">
            {states.map((st) => {
              const chain = chainOrder(docs.filter((d) => d.typeId === st.type.id));
              const typeRow = cfg.types.find((t) => t.id === st.type.id)!;
              return (
                <section key={st.type.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-semibold text-ink">{st.type.label}</span>
                      {st.mandatory && <Badge outline>Mandatory</Badge>}
                      <Badge tone={DOCUMENT_STATE_TONE[st.state]}>{DOCUMENT_STATE_LABEL[st.state].en}</Badge>
                      {st.pending && st.effective && <Chip tone="warn">Renewal lodged, not verified yet</Chip>}
                      {st.upcoming && <Chip tone="info">{renewalUpcomingWords(st.upcoming.validFrom)}</Chip>}
                      {today && st.effective?.expiresOn && st.state === "VALID" && (() => { const b = expiryBand(st.effective.expiresOn, today, { criticalDays: cfg.policy?.criticalDays ?? null, warningDays: cfg.policy?.warningDays ?? null, upcomingDays: cfg.policy?.upcomingDays ?? null }); return b.band === "NONE" ? null : <Chip tone={EXPIRY_BAND_TONE[b.band] === "neutral" ? undefined : EXPIRY_BAND_TONE[b.band]}>{`Expiry: ${EXPIRY_BAND_LABEL[b.band].en.toLowerCase()}${b.daysLeft != null ? `, ${b.daysLeft} days left` : ""}`}</Chip>; })()}
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
                                <span className="text-[13.5px] font-semibold text-ink">{d.notApplicable ? "Recorded as not applicable" : d.supersedesId ? "Renewal" : "Lodged"}{row.reference ? ` · ${row.reference}` : ""}</span>
                                <Badge tone={VERIFICATION_TONE[d.verification]}>{VERIFICATION_LABEL[d.verification].en}</Badge>
                                {!head && <Chip>Renewed since</Chip>}
                              </div>
                              <span className="flex flex-wrap items-center gap-2">
                                {d.verification === "NOT_CHECKED" && <VerifyDocumentDrawer documentId={d.id} label={`${st.type.label}${row.reference ? ` ${row.reference}` : ""}`} people={people} today={today} blocker={verifyBlocker} />}
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
                                { label: "Values", value: row.values.length ? row.values.map((v) => v.labelSnapshot).join(", ") : "—" },
                                { label: "Lodged", value: <>{formatDate(d.lodgedOn)} · <ActedBy entity="SupplierDocument" id={row.id} slot="recordedBy" name={row.recordedBy.name} /></> },
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

async function ApplicationsPanel({ l, cfg, people, blacklist, cancellation }: { l: LoadedSupplier; cfg: SupplierConfig; people: Option[]; blacklist: BlacklistInEffect | null; cancellation: CancellationInEffect | null }) {
  const s = l.supplier;
  const today = l.org.today;
  // Who decided each outcome, signed or recorded from paper, is read from its attribution (Phase 2b).
  const decided = await loadAttributions(db, l.org.id, [{ entity: "ApplicationDecision", slot: "decidedBy", ids: s.applications.flatMap((a) => a.decisions.map((d) => d.id)) }]);
  const anyOpen = s.applications.some(isOpen);
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
        <p className="text-[13px] text-ink-3">{NOT_SENT.en}</p>
        <OpenApplicationDrawer supplierId={s.id} kinds={kinds} channels={PAPER_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c].en }))} people={people} today={today} blocker={openBlocker} />
      </div>
      {s.applications.length === 0 && (
        <Card>
          <EmptyState title="No application recorded">A supplier is recorded with its first application.</EmptyState>
        </Card>
      )}
      {s.applications.map((a) => {
        const st = queueState({ ...a, resubmitBy: day(a.resubmitBy) }, today);
        const isOpenNow = isOpen(a);
        const f = today ? fileFacts({ status: a.status, lapsedRecordedAt: a.lapsedRecordedAt, resubmitBy: day(a.resubmitBy), routePending: a.routes.some((r) => r.status === "PENDING"), declarationSignedOn: day(a.declarationSignedOn), declarationScanned: a.attachments.some((x) => x.purpose === "SUPPLIER_DECLARATION" && isLive(x)), blacklist, kind: a.kind as ApplicationKind, supplierStatus: s.status as SupplierStatus, cancellation }, cfg.typeFacts, docs, today) : null;
        const preview = issue && isOpenNow ? supplierRoute(issue.matrix, SUPPLIER_REGISTRATION_DOMAIN, a.kind, { id: "", holds: () => false, ableToAct: () => ({ holderIds: ["someone"], delegateIds: [] }) }, REGISTRATION_MATTER) : null;
        const submitBlocker = !today ? supplierFaultText({ code: "TIME_ZONE_UNSET", level: "block" }) : first(submitFaults(f!, today)) ?? (!issue ? "No approval matrix is in force. Issue one under Configuration › Approval matrix." : preview?.refusal?.en ?? null);
        const decideBlocker = (outcome: "RESUBMIT" | "REJECT") => first(decisionFaults({ outcome, remarks: "x", resubmitBy: null, items: [{ documentId: null, typeId: null, remarks: "x" }], personActive: true }, { status: a.status, lapsedRecordedAt: a.lapsedRecordedAt, resubmitBy: day(a.resubmitBy), routePending: a.routes.some((r) => r.status === "PENDING") }, { today, documentIds: [], typeIds: [] }).filter((x) => ["TIME_ZONE_UNSET", "DECIDED", "LAPSE_UNRECORDED", "ROUTE_PENDING"].includes(x.code)));
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
              <KeyValues
                columns={3}
                items={[
                  { label: "Declaration signed on", value: a.declarationSignedOn ? formatDate(day(a.declarationSignedOn)) : notSet("Not recorded") },
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
              {st === "WITH_APPROVAL" && <p className="text-[12.5px] text-ink-3">With approval: its route, below, decides it. A resubmission or a rejection is recorded once the route has refused it.</p>}
              {isOpenNow && st !== "LAPSED" && st !== "WITH_APPROVAL" && submitBlocker && <p className="text-[12.5px] text-ink-3"><span className="font-semibold text-ink-2">Send for decision:</span> not yet — {submitBlocker}</p>}
              {st === "LAPSED" && <Callout tone="err" title="The resubmission deadline has passed">It was due by {formatDate(day(a.resubmitBy))}. Recording the lapse rejects the application; a notice is shown, not sent.</Callout>}
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
                            {d.items.map((i) => (
                              <li key={i.id}><span className="font-medium">{i.labelSnapshot}</span>: “{i.remarks}”</li>
                            ))}
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
                <p className="px-5 pb-2 text-[12.5px] text-ink-3 sm:px-6">Routed on no value: a supplier matter is not routed on a value, so only a rule with no value band applies. Chain beneath the approver: {routeCoreText(r, () => ({ en: "an office no longer configured", ms: "jawatan yang tidak lagi dikonfigurasi" })).en}</p>
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
            <div className="border-t border-line p-4 sm:p-5">
              <OwnerAttachments
                owner={{ kind: "supplierApplication", id: a.id }}
                title="The paper"
                subtitle={`The signed declaration (${NOT_RESTRICTED_CHIP.en.toLowerCase()}) and the E-Payment form (${EPAYMENT_SULIT_CHIP.en}). No bank detail is recorded before sign-in.`}
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

function HistoryPanel({ entries, total, timeZone }: { entries: Awaited<ReturnType<typeof supplierHistory>>["entries"]; total: number; timeZone: string | null }) {
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
  // A registered SULIT field (a contact's details, condition 2) reads with the SULIT chip in the trail too.
  const chipped = (field: string, value: string | null, e: Entry) => (isSulitField(field) && value ? <SulitValue>{read(field, value, e)}</SulitValue> : read(field, value, e));
  const shown = (field: string, ch: { before: string | null; after: string | null }, action: string) => !/(Code|Key|Id)$/.test(field) && (action !== "UPDATE" || ch.before !== ch.after);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="History"
        subtitle={`${total > entries.length ? `Showing the latest ${entries.length} of ${total} changes. ` : "Every change to this supplier and what is under it. "}Each change names who made it; any from before sign-in is not attributed. A contact's details read with the SULIT chip and are withheld from the audit export.`}
        divided={entries.length === 0}
      />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes">Changes made through the portal appear here.</EmptyState>
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
