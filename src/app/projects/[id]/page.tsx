import type { ReactNode } from "react";
import Link from "next/link";
import { ActGate } from "@/components/act-gate";
import { actStatusBlocker, actStatusText } from "@/lib/contract/act-status";
import { CONTRACT_STATUS_WORDS } from "@/lib/contract/labels";
import { historyEntityLabel, PAYMENT_ENTITIES, RECORD_TYPE_WORDS, SUPERVISION_ENTITIES, VARIATION_ENTITIES } from "@/lib/audit/entity-labels";
import { notFound } from "next/navigation";

import { ReadinessGateList } from "@/components/contract/readiness-gate";
import { AwardIcon, BuildingIcon, CheckIcon, ClockIcon, FileIcon, FilesIcon, InboxIcon, ScaleIcon, ShieldIcon, ToolsIcon, UsersIcon, WalletIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { INSURANCE_KIND_LABEL, REGISTER_STATUS_LABEL, REGISTER_STATUS_TONE, SECURITY_KIND_LABEL, WC_BASIS_LABEL } from "@/lib/award/labels";
import { loadExpiryOffsets } from "@/lib/award/repo";
import { expiryAlert, expiryChip, remindersText } from "@/lib/securities/expiry";
import { contractFaultText } from "@/lib/contract/fault-text";
import { arithmeticVariance } from "@/lib/contract/formation";
import { signingFacts } from "@/lib/contract/judge";
import { historyFieldLabel, historyValue } from "@/lib/contract/history-words";
import { CONTRACT_YEAR_WORDS, contractYearReading } from "@/lib/contract/issue-year";
import { PHASE_TONE, PHASE_WORDS } from "@/lib/contract/labels";
import { contractHistory, loadContractConfig, preparationSettings } from "@/lib/contract/load";
import { readFormationSnapshot, startFaults } from "@/lib/contract/preparation";
import { loadContract, type LoadedContract } from "@/lib/contract/repo";
import { briefingMissing } from "@/lib/contract/sign";
import { isExecuted } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { formatMoney, parseSen, senFromDecimal } from "@/lib/money";
import { fieldsOfScope, ROUTED_MATTER_VALUE_FIELD } from "@/lib/sulit-fields";
import { hiddenExercises, sulitGate, sulitGates } from "@/app/_auth/sulit";
import { contractDocumentFacts } from "@/lib/certificate/register";
import { reviewCounts } from "@/lib/portal/projects/review-store";
import { sulitHistoryValue } from "@/lib/auth/sulit-history";
import { through, type Sulit } from "@/lib/auth/sulit-access";

import { BaselinePanel } from "./baseline-panel";
import { DocumentsPanel } from "./documents-panel";
import { SubmissionsTab } from "./submissions-tab";
import { StartPreparationDrawer, WcCheckDrawer } from "./editors";
import { FormationPanel, FORMATION_SECTIONS, type FormationSection } from "./formation-panels";
import { PAYMENT_SECTIONS, PaymentsPanel, PaymentSummaryCard, paymentView, type PaymentSection, type PaymentView } from "./payment-panels";
import { OnSiteCard, SITE_SECTIONS, SitePanel, supervisionView, TeamPanel, type SiteSection, type SupervisionView } from "./supervision-panels";
import { hiddenFor } from "@/lib/supervision/authority";
import { delegationFactsOf } from "@/lib/supervision/load";
import { SUPERVISION_ACTS } from "@/lib/supervision/types";
import { VARIATION_SECTIONS, VariationsPanel, VariationSummaryCard, type VariationSection } from "./variation-panels";
import { variationView, type VariationView } from "@/lib/variation/view";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

type Option = { value: string; label: string };
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const notSet = (what = "Not set") => <span className="text-ink-4">{what}</span>;
const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;

/**
 * A contract after award (6.12, FR-CON-003–014): what it is, where it stands, how it is formed and
 * signed, the baseline every later calculation reads, its securities and its History. Everything an act
 * would refuse is said beside the act's button, from the same rule the act runs.
 */
export default async function ContractPage(props: PageProps<"/projects/[id]">) {
  const actor = await requireStaff();
  const [{ id }, { tab, section, page, waiting, answered }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string; section?: string; page?: string; waiting?: string; answered?: string }>]);
  const l = await loadContract(actor.organisationId, id);
  if (!l) notFound();
  const c = l.contract;
  // The contract's priced working (the arithmetic corrections, the estimate rates a tendered rate is set against, the figures a certificate's override trail names) is SULIT; a
  // contract keeps no list of who is named on it, so only the organisation-wide permission opens it (undecided until decided). One answer for the page, logged.
  const sulit = await sulitGate(actor, { scope: "contract", entity: "Contract", id: c.id, label: c.number }, fieldsOfScope("contract"));
  const status = c.status as ContractStatus;
  const today = l.org.timeZone ? dayOf(new Date(), l.org.timeZone) : null;
  const restricted = (await hiddenExercises(actor)).includes(l.award.exerciseId);
  const [people, history, facts, certificates, supervision, submissionCount, documentFacts] = await Promise.all([
    db.person.findMany({ where: { organisationId: l.org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    contractHistory(l),
    today ? signingFacts(l, null, today) : Promise.resolve(null),
    // 6.14 increment 1: the contract's certificates, counted for the Documents tab.
    db.certificate.count({ where: { contractId: c.id } }),
    // 6.13 Part A: the contract's supervision, read once for the Overview, Team and Site tabs.
    supervisionView(l, today),
    // AC-16: the submissions waiting on this contract, counted for the Submissions tab (none for a restricted exercise's contract the reader is not named on).
    restricted ? Promise.resolve(null) : reviewCounts(db, l.org.id, today, { contractId: c.id }),
    // AC-16: the copies not sent and the routing sheets open, for the Documents tab.
    contractDocumentFacts(l.org.id, c.id, today),
  ]);
  // The people who decide a contract matter's route read that matter's amount, and nothing else of the contract (ruling of 2026-10-08, the amendment of the ruling on log line 1526): the
  // trail's rows of a matter that name its routed value are judged by the matter's own gate where the contract's is withheld. Asked (and logged) only where a row carries one.
  const matterIds = [...new Set(history.entries.filter((e) => e.entity === "ContractMatter" && e.changes.some((ch) => ch.field === ROUTED_MATTER_VALUE_FIELD)).map((e) => e.entityId))];
  const matterGates = matterIds.length ? await sulitGates(actor, matterIds.map((id) => ({ scope: "contract" as const, entity: "ContractMatter", id, label: "A contract matter" })), [ROUTED_MATTER_VALUE_FIELD]) : new Map<string, Sulit<true>>();
  // 6.13 Part A step 3: interim payment and the damages chain, for the Overview and the Payments tab.
  // Step 4: variations and the adjustments of the contract sum, for the Overview and the Variations tab.
  const [payments, variations] = await Promise.all([paymentView(l, today), variationView(l, today)]);
  // FR-SUP-004 (Phase 3d): the acts outside the delegated scope of a representative who is signed in are not offered to them. Nothing is hidden from the S.O. or from an officer who is no representative.
  const hiddenActs = today && !actor.system ? hiddenFor(actor.personId, supervision.so?.office ?? null, delegationFactsOf(supervision.s), today, SUPERVISION_ACTS) : [];
  const peopleOptions: Option[] = people.map((p) => ({ value: p.id, label: p.name }));
  const phase = facts?.phase ?? status;
  const formationSection = (FORMATION_SECTIONS.find((s) => s.id === section)?.id ?? "assembly") as FormationSection;
  const siteSection = (SITE_SECTIONS.find((s) => s.id === section)?.id ?? "start") as SiteSection;
  const paymentSection = (PAYMENT_SECTIONS.find((s) => s.id === section)?.id ?? "valuations") as PaymentSection;
  const variationSection = (VARIATION_SECTIONS.find((s) => s.id === section)?.id ?? "variations") as VariationSection;
  const pageNo = Math.max(0, Number.parseInt(page ?? "0", 10) || 0);

  const tabs = [
    { id: "overview", label: "Overview", icon: <AwardIcon size={15} />, panel: <OverviewPanel sulit={sulit} l={l} facts={facts} today={today} supervision={supervision} payments={payments} variations={variations} /> },
    {
      id: "formation",
      label: "Formation",
      icon: <ToolsIcon size={15} />,
      sections: [...FORMATION_SECTIONS],
      section: formationSection,
      panel: tab === "formation" && facts ? <FormationPanel sulit={sulit} l={l} section={formationSection} facts={facts} people={peopleOptions} today={today} /> : null,
    },
    { id: "baseline", label: "Baseline", icon: <FileIcon size={15} />, count: c.baselines.filter((b) => b.version != null).length, lazy: true, panel: tab === "baseline" && facts ? <BaselinePanel l={l} facts={facts} timeZone={l.org.timeZone} /> : null },
    // 6.13 Part A: who supervises the contract, and what happens on site.
    { id: "team", label: "Team", icon: <UsersIcon size={15} />, count: supervision.s.soDelegations.length + supervision.s.contractParties.length, lazy: true, panel: tab === "team" ? <TeamPanel l={l} v={supervision} people={peopleOptions} today={today} /> : null },
    {
      id: "site",
      label: "Site",
      icon: <BuildingIcon size={15} />,
      sections: [...SITE_SECTIONS],
      section: siteSection,
      lazy: true,
      panel: tab === "site" ? <SitePanel l={l} v={supervision} people={peopleOptions} today={today} section={siteSection} page={pageNo} hidden={hiddenActs} /> : null,
    },
    // 6.13 Part A step 3: valuations and their certificates, retention, the advance and liquidated damages.
    {
      id: "payments",
      label: "Payments",
      icon: <WalletIcon size={15} />,
      count: payments.p.interimValuations.length,
      sections: [...PAYMENT_SECTIONS],
      section: paymentSection,
      lazy: true,
      panel: tab === "payments" ? <PaymentsPanel l={l} v={payments} people={peopleOptions} today={today} section={paymentSection} page={pageNo} hidden={hiddenActs} /> : null,
    },
    // 6.13 Part A step 4: variations, from application to certificate, and the adjustments of the contract sum.
    {
      id: "variations",
      label: "Variations",
      icon: <ScaleIcon size={15} />,
      count: variations.all.length,
      sections: [...VARIATION_SECTIONS],
      section: variationSection,
      lazy: true,
      panel: tab === "variations" ? <VariationsPanel l={l} v={variations} people={peopleOptions} today={today} section={variationSection} page={pageNo} hidden={hiddenActs} /> : null,
    },
    { id: "securities", label: "Securities", icon: <ShieldIcon size={15} />, count: c.securities.length + c.policies.length, lazy: true, panel: tab === "securities" ? <SecuritiesPanel l={l} people={peopleOptions} today={today} /> : null },
    // 6.14 increment 1 (plan §5): every certificate of the contract, by kind and status.
    { id: "documents", label: "Documents", icon: <FilesIcon size={15} />, count: certificates, lazy: true, panel: tab === "documents" ? <DocumentsPanel contractId={c.id} page={pageNo} facts={documentFacts} /> : null },
    // AC-16 (MN-02): the bridge for the Documents menu's review queue; while Part 2 is held this tab may be permanent.
    { id: "submissions", label: "Submissions", icon: <InboxIcon size={15} />, count: submissionCount?.waiting, lazy: true, panel: tab === "submissions" ? <SubmissionsTab organisationId={l.org.id} contractId={c.id} status={status} today={today} restricted={restricted} waiting={waiting} answered={answered} /> : null },
    { id: "history", label: "History", icon: <ClockIcon size={15} />, count: history.total, panel: <HistoryPanel sulit={sulit} matterGates={matterGates} entries={history.entries} total={history.total} timeZone={l.org.timeZone} /> },
  ];

  return (
    <>
      <RecordCrumb label={c.number} />
      <PageHeader
        eyebrow={<Link href="/projects">Contracts</Link>}
        title={`Contract ${c.number}`}
        badge={<Badge tone={TONE[PHASE_TONE[phase]]} dot>{PHASE_WORDS[phase].en}</Badge>}
        subtitle={l.ex.title}
        meta={[l.award.awardeeName, formatMoney(senFromDecimal(c.contractSum)), <Link key="aw" href={`/awards/${l.award.id}`}>{l.award.reference}</Link>, c.contractDate ? `Contract Date ${formatDate(day(c.contractDate))}` : "Not signed"]}
      />
      <div className="mb-6 flex flex-col gap-3">
        {!today && (
          <Callout tone="warn" title="The organisation's time zone is not set" action={<ButtonLink href="/configuration/organisation" size="sm">Set time zone</ButtonLink>}>
            Every act on a contract records the organisation&apos;s day, and the Contract Date is the day of the signature act: none is assumed to be UTC.
          </Callout>
        )}
        {status === "CANCELLED" && (
          <Callout tone="warn" title="Cancelled with its award">
            {c.cancelReason || "No reason recorded."} The number stays allocated as a gap; everything recorded is kept as it was.
          </Callout>
        )}
        {/* ADR 0031 (run 1a): a terminated or closed contract says what is still recorded on it, in the acts' own words. */}
        {(status === "TERMINATED" || status === "CLOSED") && (
          <Callout tone="warn" title={CONTRACT_STATUS_WORDS[status].en}>
            {actStatusText({ code: status === "TERMINATED" ? "CONTRACT_TERMINATED" : "CONTRACT_CLOSED", level: "block" })}
          </Callout>
        )}
        {briefingMissing(status, !!c.briefing) && (
          <Callout tone="warn" title="No Integrity Pact briefing recorded">
            The Stage Three briefing at signing is not on record. It does not block anything (a Should); record it under Formation › Signing.
          </Callout>
        )}
      </div>
      <Tabs initial={tab} label="Contract" tabs={tabs} />
    </>
  );
}

type Facts = NonNullable<Awaited<ReturnType<typeof signingFacts>>>;

// ------------------------------------------------------------------ overview

async function OverviewPanel({ sulit, l, facts, today, supervision, payments, variations }: { sulit: Sulit<true>; l: LoadedContract; facts: Facts | null; today: string | null; supervision: SupervisionView; payments: PaymentView; variations: VariationView }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("FORMATION", l.contract.status as ContractStatus);
  const c = l.contract;
  const status = c.status as ContractStatus;
  const snap = readFormationSnapshot(c.formationSnapshot);
  const arithmetic = c.checks.find((k) => k.kind === "ARITHMETIC");
  const variance = arithmetic && arithmetic.corrections.length ? arithmeticVariance(arithmetic.corrections.map((x) => ({ tendered: senFromDecimal(x.tendered), corrected: senFromDecimal(x.corrected) }))) : null;
  let start: { blocker: string | null; frozen: string } | null = null;
  if (status === "NUMBER_ALLOCATED") {
    const cfg = await loadContractConfig(l.org.id);
    // The same reading the start act makes, on the organisation's day (R-6); with no zone, today's settings are not judged.
    const settings = today ? preparationSettings(cfg, l.ex.contractBasisCode, today) : null;
    const basis = settings?.basis ?? null;
    const p = cfg.policy;
    const fs = startFaults({
      status,
      awardStatus: l.award.status,
      today,
      basis: { code: l.ex.contractBasisCode, name: basis?.nameEn ?? null, requiresBq: basis?.requiresBq ?? null },
      parts: settings?.parts.length ?? 0,
      policy: { legalOfficeCode: p?.legalOfficeCode ?? null, legalOfficeKnown: settings?.legalOfficeKnown ?? false, signatoryCond: p?.signatoryCond ?? null, controlledCopyStampEn: p?.controlledCopyStampEn ?? null },
      recipients: settings?.recipients.length ?? 0,
    });
    start = { blocker: fs.length ? fs.map(contractFaultText).join(" ") : null, frozen: "the legal office, the front-loading ratio, the controlled-copy stamp and recipients, the signatory condition, and the basis's checks and document parts" };
  }
  // S-1: the year the number was issued is the organisation's day of issue, never digits read from the number.
  const year = contractYearReading(c);
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      {start && (
        <Card>
          <CardHeader icon={<ToolsIcon size={17} />} title="Not started" subtitle="The contract is numbered. Preparing it freezes what it is formed under and builds the baseline's draft." actions={<StartPreparationDrawer id={c.id} blocker={start.blocker} frozen={start.frozen} />} />
        </Card>
      )}
      <OnSiteCard l={l} v={supervision} />
      <PaymentSummaryCard l={l} v={payments} />
      <VariationSummaryCard l={l} v={variations} />
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="The contract" subtitle="As awarded, numbered at issue, and as it is being formed." />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Contract number", value: <span className="flex flex-col items-start gap-1"><span className="font-mono text-[13px]">{c.number}</span>{year.seriesNumber && <span className="text-[12.5px] text-ink-3">{CONTRACT_YEAR_WORDS.series(year.issueYear).en}</span>}</span> },
              { label: "Contractor", value: l.award.awardeeName },
              { label: "Contract sum", value: <span className="flex flex-col items-start gap-1"><span className="tabular-nums">{formatMoney(senFromDecimal(c.contractSum))}</span><span className="text-[12.5px] text-ink-3">The Letter of Acceptance&apos;s sum (assumed: corrections do not change it).</span></span> },
              { label: "Arithmetic corrections", value: variance == null ? notSet("None recorded") : <span className="flex flex-col items-start gap-1"><SulitValue of={through(sulit, `${variance < 0n ? "−" : "+"}${formatMoney(variance < 0n ? -variance : variance)}`)} /><span className="text-[12.5px] text-ink-3">Against the tendered figures: shown, not applied.</span></span> },
              {
                label: "Contract Date",
                value: c.contractDate ? (
                  <span className="flex flex-col items-start gap-1">
                    <span>{formatDate(day(c.contractDate))}</span>
                    <span className="text-[12.5px] text-ink-3">The day the signature for the employer was recorded.</span>
                    {year.yearsDiffer && <Chip tone="warn">{CONTRACT_YEAR_WORDS.differs(year.issueYear, year.contractDateYear!).en}</Chip>}
                    {c.contractDateCorrectedFrom && <Chip tone="info">{`Corrected from ${formatDate(day(c.contractDateCorrectedFrom))}: ${c.contractDateCorrectionReason}`}</Chip>}
                  </span>
                ) : notSet("Not signed: the day of the signature act, never typed"),
              },
              { label: "Stamped", value: c.stampedOn ? `${formatDate(day(c.stampedOn))} · reference ${c.stampingRef}` : notSet("Not recorded") },
              { label: "Formed under", value: snap ? `${snap.basis.name}; legal review by ${snap.policy.legalOfficeLabel}; frozen ${formatDate(snap.startedOn)}` : notSet("Preparation not started") },
              { label: "Award", value: <Link href={`/awards/${l.award.id}`} className="font-semibold">{l.award.reference}</Link> },
            ]}
          />
        </CardBody>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="Ready to sign?" subtitle="The readiness gate, as the award shows it. Preparation continues while it is red." actions={facts ? <Badge tone={facts.gate.ready ? "ok" : "warn"}>{facts.gate.ready ? "Gate met" : "Gate not met"}</Badge> : undefined} />
        {facts ? <ReadinessGateList items={facts.gate.items} bondNotRequiredReason={l.award.bondNotRequiredReason} /> : <EmptyState size="sm" title="Not judged">Set the organisation&apos;s time zone first.</EmptyState>}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<CheckIcon size={17} />} title="The award's conditions" subtitle="Before work starts, each with the day it is needed by. Recorded on the award." divided={l.award.conditions.length > 0} />
        {l.award.conditions.length === 0 ? (
          <EmptyState size="sm" title="None recorded">The award records none.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {l.award.conditions.map((x) => (
              <li key={x.id} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                <span className="text-[13.5px] font-semibold break-words text-ink">{x.kindName}</span>
                <span className="text-[12.5px] break-words text-ink-3">{[x.reference || null, x.requiredBy ? `needed by ${formatDate(x.requiredBy)}` : "no day set", x.satisfiedOn ? `met ${formatDate(x.satisfiedOn)}` : "not met", x.excludesEot ? "a delay gives no extension of time" : null].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
    </ActGate>
  );
}

// ------------------------------------------------------------------ securities

async function SecuritiesPanel({ l, people, today }: { l: LoadedContract; people: Option[]; today: string | null }) {
  const c = l.contract;
  // AC-15: the same chips as the award's tab (one wording, `expiryChip`) and the configured reminder intervals, which with none set say so.
  const offsets = await loadExpiryOffsets(l.org.id);
  const alert = (d: Date | null) => {
    const chip = today ? expiryChip(expiryAlert(day(d), offsets, today)) : null;
    return chip ? <Chip tone={chip.tone}>{chip.text}</Chip> : null;
  };
  // Review S1: the wages check's own act (FORMATION's row, then "executed" by isExecuted), never a list of its own.
  const status = c.status as ContractStatus;
  const shut = actStatusBlocker("FORMATION", status);
  const wcOpen = !shut && !isExecuted(status);
  const wcOnWages = l.award.wcBasis === "UNCOVERED_WAGES";
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ShieldIcon size={17} />} title="Securities and insurances" subtitle={`The award's register for this contract. They are lodged and checked on the award. ${remindersText(offsets)}, shown and not sent.`} actions={<ButtonLink href={`/awards/${l.award.id}?tab=securities`} size="sm" variant="secondary">Open on the award</ButtonLink>} divided={c.securities.length + c.policies.length === 0} />
      {c.securities.length + c.policies.length === 0 ? (
        <EmptyState size="sm" title="Nothing lodged">Lodge them on the award&apos;s Securities tab.</EmptyState>
      ) : (
        <ActGate blocker={shut}>
        <ul className="divide-y divide-line/70">
          {c.securities.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold break-words text-ink">{`${SECURITY_KIND_LABEL[s.kind]} · ${formatMoney(senFromDecimal(s.value))}`}</span>
                <span className="block text-[12.5px] break-words text-ink-3">{[s.issuer?.name ?? s.issuerNameAsWritten, s.instrumentRef || null, s.expiresOn ? `expires ${formatDate(s.expiresOn)}` : null].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-2">
                {s.status !== "REJECTED" && alert(s.expiresOn)}
                <Chip tone={REGISTER_STATUS_TONE[s.status]}>{REGISTER_STATUS_LABEL[s.status]}</Chip>
              </span>
            </li>
          ))}
          {c.policies.map((p) => {
            const wc = p.kind === "WORKMENS_COMPENSATION" && wcOnWages;
            return (
              <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{`${INSURANCE_KIND_LABEL[p.kind]} · ${formatMoney(senFromDecimal(p.sumInsured))}`}</span>
                  <span className="block text-[12.5px] break-words text-ink-3">
                    {[p.issuer?.name ?? p.issuerNameAsWritten, p.policyNo || null, `${formatDate(p.periodStart)} to ${formatDate(p.periodEnd)}`, p.kind === "WORKMENS_COMPENSATION" && l.award.wcBasis ? WC_BASIS_LABEL[l.award.wcBasis].toLowerCase() : null].filter(Boolean).join(" · ")}
                  </span>
                  {wc && (
                    <span className="block text-[12.5px] break-words text-ink-3">
                      {p.wcCheckedOn ? `Wages check recorded ${formatDate(day(p.wcCheckedOn))} by ${p.wcCheckedBy?.name ?? "an officer"}: declared uncovered wages ${formatMoney(parseSen(p.wcDeclaredUncoveredWages!.toString()))}. Recorded, not judged: basis not set (D4).` : "The uncovered-wages check is not recorded: the gate's insurance item is not met until it is."}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {p.status !== "REJECTED" && alert(p.periodEnd)}
                  <Chip tone={REGISTER_STATUS_TONE[p.status]}>{REGISTER_STATUS_LABEL[p.status]}</Chip>
                  {wc && !p.wcCheckedOn && wcOpen && (p.status === "VERIFIED" ? <WcCheckDrawer id={c.id} policyId={p.id} label={INSURANCE_KIND_LABEL[p.kind]} people={people} today={today} /> : <Blocked label="Record the wages check" reason="Verify the policy on the award first." />)}
                </span>
              </li>
            );
          })}
        </ul>
        </ActGate>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ history

const ACTION_LABEL = { CREATE: "Created", UPDATE: "Changed", DELETE: "Removed" } as const;
const ENTITY_LABEL: Record<string, string> = {
  Contract: "Contract",
  ContractAssemblyPart: "Document part",
  ContractReconciliation: "Reconciliation",
  ReconciliationAmendment: "Amendment",
  FormationCheck: "Check",
  ArithmeticCorrection: "Arithmetic correction",
  RateComparison: "Rate compared",
  LegalReview: "Legal review",
  InsurancePolicy: "Insurance policy",
  ContractSignature: "Signature",
  IntegrityBriefing: "Integrity briefing",
  ContractBaseline: "Baseline",
  IssuedCopy: "Controlled copy",
  CustodyItem: "Original in custody",
  CustodyMovement: "Custody movement",
  CaseOwnershipEvent: "Case handed over",
  SecurityInstrument: "Security",
  // 6.14: a certificate's rows, written under the contract's label.
  Certificate: "Certificate",
  CertificateSignature: "Certificate signature",
  CertificateOverride: "Certificate figure overridden",
  RoutingCheck: "Routing check",
  // 612-C1: a correction of the award's recorded terms, written under the contract's label.
  AwardTermCorrection: RECORD_TYPE_WORDS.AwardTermCorrection.en,
  // 6.13 Part A: the contract's supervision.
  ...Object.fromEntries(SUPERVISION_ENTITIES.map((e) => [e, RECORD_TYPE_WORDS[e].en])),
  // 6.13 Part A step 3: interim payment, the damages chain, and a certificate's approval route.
  ...Object.fromEntries(PAYMENT_ENTITIES.map((e) => [e, RECORD_TYPE_WORDS[e].en])),
  // 6.13 Part A step 4: variations, the matters tabled from them, and the adjustment of the contract sum.
  ...Object.fromEntries(VARIATION_ENTITIES.map((e) => [e, RECORD_TYPE_WORDS[e].en])),
};
function HistoryPanel({ sulit, matterGates, entries, total, timeZone }: { sulit: Sulit<true>; matterGates: ReadonlyMap<string, Sulit<true>>; entries: Awaited<ReturnType<typeof contractHistory>>["entries"]; total: number; timeZone: string | null }) {
  // Known codes in words; real values (LHDN, PS) as they are; a code without words never shown.
  const read = (field: string, value: string | null, entity: string): string => historyValue(field, value, formatDate, entity);
  // A registered SULIT field's value is shown or withheld as the contract's one answer says, as on the sibling History panels.
  const chipped = (field: string, value: string | null, entity: string, entityId?: string): ReactNode => {
    // A matter's routed value is also read by the people who decide the matter's route (its own gate), where the contract's answer is withheld.
    const viaMatter = sulit.state === "WITHHELD" && field === ROUTED_MATTER_VALUE_FIELD && entityId ? matterGates.get(entityId) : undefined;
    const held = value ? (viaMatter?.state === "GRANTED" ? sulitHistoryValue(field, "contract", viaMatter, read(field, value, entity)) : sulitHistoryValue(field, "contract", sulit, read(field, value, entity))) : null;
    return held ? <SulitValue of={held} /> : read(field, value, entity);
  };
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ClockIcon size={17} />} title="History" subtitle={`${total > entries.length ? `Showing the latest ${entries.length} of ${total} changes. ` : "Every change to this contract and what is under it. "}Each change names who made it; any from before sign-in is not attributed. Identity-card numbers are masked here.`} divided={entries.length === 0} />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes">Changes made through the portal appear here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={e.action === "CREATE" ? "ok" : e.action === "DELETE" ? "err" : "info"}>{ACTION_LABEL[e.action]}</Badge>
                <span className="font-semibold text-ink">{ENTITY_LABEL[e.entity] ?? "Record"}</span>
                <span className="min-w-0 break-words text-ink-2">{historyEntityLabel(e.entity, e.entityLabel)}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatOrgDay(e.at, timeZone)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] break-words text-ink-3">
                  {e.changes.filter((ch) => !/(Code|Key|Id)$/.test(ch.field)).map((ch) => (
                    <li key={ch.field}>
                      {historyFieldLabel(ch.field, e.entity)}: {(e.action === "UPDATE" || ch.before != null) && <>{chipped(ch.field, ch.before, e.entity, e.entityId)} → </>}
                      <span className="text-ink-2">{chipped(ch.field, e.action === "DELETE" ? ch.before : ch.after, e.entity, e.entityId)}</span>
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
