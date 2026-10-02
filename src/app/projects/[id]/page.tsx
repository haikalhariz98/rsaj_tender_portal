import Link from "next/link";
import { notFound } from "next/navigation";

import { ReadinessGateList } from "@/components/contract/readiness-gate";
import { AwardIcon, CheckIcon, ClockIcon, FileIcon, ShieldIcon, ToolsIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { fieldLabel } from "@/lib/audit/diff";
import { INSURANCE_KIND_LABEL, REGISTER_STATUS_LABEL, REGISTER_STATUS_TONE, SECURITY_KIND_LABEL, WC_BASIS_LABEL } from "@/lib/award/labels";
import { contractFaultText } from "@/lib/contract/fault-text";
import { arithmeticVariance } from "@/lib/contract/formation";
import { signingFacts } from "@/lib/contract/judge";
import { historyValue } from "@/lib/contract/history-words";
import { CONTRACT_YEAR_WORDS, contractYearReading } from "@/lib/contract/issue-year";
import { PHASE_TONE, PHASE_WORDS } from "@/lib/contract/labels";
import { contractHistory, loadContractConfig, preparationSettings } from "@/lib/contract/load";
import { readFormationSnapshot, startFaults } from "@/lib/contract/preparation";
import { loadContract, type LoadedContract } from "@/lib/contract/repo";
import { briefingMissing } from "@/lib/contract/sign";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { formatMoney, parseSen, senFromDecimal } from "@/lib/money";
import { isSulitField } from "@/lib/sulit-fields";

import { BaselinePanel } from "./baseline-panel";
import { StartPreparationDrawer, WcCheckDrawer } from "./editors";
import { FormationPanel, FORMATION_SECTIONS, type FormationSection } from "./formation-panels";

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
  const [{ id }, { tab, section }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string; section?: string }>]);
  const l = await loadContract(id);
  if (!l) notFound();
  const c = l.contract;
  const status = c.status as ContractStatus;
  const today = l.org.timeZone ? dayOf(new Date(), l.org.timeZone) : null;
  const [people, history, facts] = await Promise.all([
    db.person.findMany({ where: { organisationId: l.org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    contractHistory(l),
    today ? signingFacts(l, null, today) : Promise.resolve(null),
  ]);
  const peopleOptions: Option[] = people.map((p) => ({ value: p.id, label: p.name }));
  const phase = facts?.phase ?? status;
  const formationSection = (FORMATION_SECTIONS.find((s) => s.id === section)?.id ?? "assembly") as FormationSection;

  const tabs = [
    { id: "overview", label: "Overview", icon: <AwardIcon size={15} />, panel: <OverviewPanel l={l} facts={facts} today={today} /> },
    {
      id: "formation",
      label: "Formation",
      icon: <ToolsIcon size={15} />,
      sections: [...FORMATION_SECTIONS],
      section: formationSection,
      panel: tab === "formation" && facts ? <FormationPanel l={l} section={formationSection} facts={facts} people={peopleOptions} today={today} /> : null,
    },
    { id: "baseline", label: "Baseline", icon: <FileIcon size={15} />, count: c.baselines.filter((b) => b.version != null).length, lazy: true, panel: tab === "baseline" && facts ? <BaselinePanel l={l} facts={facts} timeZone={l.org.timeZone} /> : null },
    { id: "securities", label: "Securities", icon: <ShieldIcon size={15} />, count: c.securities.length + c.policies.length, panel: <SecuritiesPanel l={l} people={peopleOptions} today={today} /> },
    { id: "history", label: "History", icon: <ClockIcon size={15} />, count: history.total, panel: <HistoryPanel entries={history.entries} total={history.total} timeZone={l.org.timeZone} /> },
  ];

  return (
    <>
      <RecordCrumb label={c.number} />
      <PageHeader
        eyebrow={<Link href="/projects">Projects</Link>}
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

async function OverviewPanel({ l, facts, today }: { l: LoadedContract; facts: Facts | null; today: string | null }) {
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
    <div className="flex flex-col gap-6">
      {start && (
        <Card>
          <CardHeader icon={<ToolsIcon size={17} />} title="Not started" subtitle="The contract is numbered. Preparing it freezes what it is formed under and builds the baseline's draft." actions={<StartPreparationDrawer id={c.id} blocker={start.blocker} frozen={start.frozen} />} />
        </Card>
      )}
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="The contract" subtitle="As awarded, numbered at issue, and as it is being formed." />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Contract number", value: <span className="flex flex-col items-start gap-1"><span className="font-mono text-[13px]">{c.number}</span>{year.seriesNumber && <span className="text-[12.5px] text-ink-3">{CONTRACT_YEAR_WORDS.series(year.issueYear).en}</span>}</span> },
              { label: "Contractor", value: l.award.awardeeName },
              { label: "Contract sum", value: <span className="flex flex-col items-start gap-1"><span className="tabular-nums">{formatMoney(senFromDecimal(c.contractSum))}</span><span className="text-[12.5px] text-ink-3">The Letter of Acceptance&apos;s sum (assumed: corrections do not change it).</span></span> },
              { label: "Arithmetic corrections", value: variance == null ? notSet("None recorded") : <span className="flex flex-col items-start gap-1"><SulitValue>{`${variance < 0n ? "−" : "+"}${formatMoney(variance < 0n ? -variance : variance)}`}</SulitValue><span className="text-[12.5px] text-ink-3">Against the tendered figures: shown, not applied.</span></span> },
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
  );
}

// ------------------------------------------------------------------ securities

function SecuritiesPanel({ l, people, today }: { l: LoadedContract; people: Option[]; today: string | null }) {
  const c = l.contract;
  const executed = ["EXECUTED", "STAMPED", "ACTIVE", "CANCELLED"].includes(c.status);
  const wcOnWages = l.award.wcBasis === "UNCOVERED_WAGES";
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ShieldIcon size={17} />} title="Securities and insurances" subtitle="The award's register for this contract. They are lodged and checked on the award." actions={<ButtonLink href={`/awards/${l.award.id}?tab=securities`} size="sm" variant="secondary">Open on the award</ButtonLink>} divided={c.securities.length + c.policies.length === 0} />
      {c.securities.length + c.policies.length === 0 ? (
        <EmptyState size="sm" title="Nothing lodged">Lodge them on the award&apos;s Securities tab.</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {c.securities.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold break-words text-ink">{`${SECURITY_KIND_LABEL[s.kind]} · ${formatMoney(senFromDecimal(s.value))}`}</span>
                <span className="block text-[12.5px] break-words text-ink-3">{[s.issuer?.name ?? s.issuerNameAsWritten, s.instrumentRef || null, s.expiresOn ? `expires ${formatDate(s.expiresOn)}` : null].filter(Boolean).join(" · ")}</span>
              </span>
              <Chip tone={REGISTER_STATUS_TONE[s.status]}>{REGISTER_STATUS_LABEL[s.status]}</Chip>
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
                  <Chip tone={REGISTER_STATUS_TONE[p.status]}>{REGISTER_STATUS_LABEL[p.status]}</Chip>
                  {wc && !p.wcCheckedOn && !executed && (p.status === "VERIFIED" ? <WcCheckDrawer id={c.id} policyId={p.id} label={INSURANCE_KIND_LABEL[p.kind]} people={people} today={today} /> : <Blocked label="Record the wages check" reason="Verify the policy on the award first." />)}
                </span>
              </li>
            );
          })}
        </ul>
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
};
function HistoryPanel({ entries, total, timeZone }: { entries: Awaited<ReturnType<typeof contractHistory>>["entries"]; total: number; timeZone: string | null }) {
  // Known codes in words; real values (LHDN, PS) as they are; a code without words never shown.
  const read = (field: string, value: string | null, entity: string): string => historyValue(field, value, formatDate, entity);
  // A registered SULIT field's value carries the chip, as on the sibling History panels.
  const chipped = (field: string, value: string | null, entity: string) => (isSulitField(field) && value ? <SulitValue>{read(field, value, entity)}</SulitValue> : read(field, value, entity));
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ClockIcon size={17} />} title="History" subtitle={`${total > entries.length ? `Showing the latest ${entries.length} of ${total} changes. ` : "Every change to this contract and what is under it. "}Nobody is signed in, so no change is attributed. Identity-card numbers are masked here.`} divided={entries.length === 0} />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes">Changes made through the portal appear here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={e.action === "CREATE" ? "ok" : e.action === "DELETE" ? "err" : "info"}>{ACTION_LABEL[e.action]}</Badge>
                <span className="font-semibold text-ink">{ENTITY_LABEL[e.entity] ?? "Record"}</span>
                <span className="min-w-0 break-words text-ink-2">{e.entityLabel}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatOrgDay(e.at, timeZone)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] break-words text-ink-3">
                  {e.changes.filter((ch) => !/(Code|Key|Id)$/.test(ch.field)).map((ch) => (
                    <li key={ch.field}>
                      {fieldLabel(ch.field)}: {(e.action === "UPDATE" || ch.before != null) && <>{chipped(ch.field, ch.before, e.entity)} → </>}
                      <span className="text-ink-2">{chipped(ch.field, e.action === "DELETE" ? ch.before : ch.after, e.entity)}</span>
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
