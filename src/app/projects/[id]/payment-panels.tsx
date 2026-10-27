import { Say } from "@/components/i18n/language-context";
import { Sections } from "./sections";
import { CASE_PANEL_TITLE_WORDS as P } from "@/lib/contract/case-page-words";
import { ActedBy } from "@/components/attribution";
import { ActGate } from "@/components/act-gate";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { AlertTriangle, CalendarIcon, ClipboardIcon, FileIcon, GavelIcon, ShieldIcon, WalletIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { caseHref } from "@/lib/contract/links";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { readIssuedAdjustments } from "@/lib/adjustment/ppjhk";
import { KeyValues } from "@/components/ui/stat";
import { applyOverrides } from "@/lib/certificate/override";
import { KIND_WORDS, STATUS_TONE, STATUS_WORDS } from "@/lib/certificate/labels";
import { noFormFault } from "@/lib/certificate/form-needs";
import type { CertificateStatus } from "@/lib/certificate/types";
import { SOURCE_WORDS } from "@/lib/contract/labels";
import type { LoadedContract } from "@/lib/contract/repo";
import { dayOrNull as day, dayPlus, storedDay } from "@/lib/dates";
import { decimalText, formatDate } from "@/lib/format";
import { frozenRateWarnings, ladLine } from "@/lib/lad/charge";
import { decisionFaults, replacementFaults, warningFaults } from "@/lib/lad/non-completion";
import { formatMoney, parseSen, senFromDecimal, type Sen } from "@/lib/money";
import { assembleInterim, chargedUntilOf, heldOnLatest, readJudgedUnder, type Assembled } from "@/lib/payment/assemble";
import { db } from "@/lib/db";
import { creditorFactsOf } from "@/lib/payment/creditor-store";
import { OPENING_GROUP_WORDS, ADVANCE_PARTY_WORDS, ANSWER_WORDS, DEDUCTION_WORDS, MATERIAL_VERDICT_WORDS, OUTCOME_WORDS, PACK_WORDS, PAYEE_BANK_UNCHECKED, REMAINDER_WORDS, paymentFaultText, RELEASE_WORDS, SCOPE_WORDS, TIER_WORDS, TRIGGER_WORDS, VALUATION_STATUS_WORDS } from "@/lib/payment/labels";
import { assembleInputOf, baselineOn, decisionOf, inProgress, inProgressSequenceOf, issuedInterims, liveDecisionOf, baselineDamagesOf, kindSettingOf, uncoveredForeign, releaseStateOf, pendingAdvancesOf, openingOf, loadPayment, loadPaymentConfig, preExecutionFacts } from "@/lib/payment/load";
import { materialVerdict } from "@/lib/payment/materials";
import { asCorrected } from "@/lib/payment/correction";
import { firstReleaseShare, releaseOf, retentionReading } from "@/lib/payment/retention";
import { ADVANCE_PARTIES, CONTRACTOR_ANSWERS, KEYED_DEDUCTION_KINDS, NON_COMPLETION_OUTCOMES, NON_COMPLETION_SCOPES, PACK_ITEMS, VALUATION_TRIGGERS, type Finding } from "@/lib/payment/types";
import { issueClockFrom, openFaults } from "@/lib/payment/valuation";
import { pendingAdvanceFaults } from "@/lib/payment/advance";
import { OPENING_GROUPS, openingClosed, openingReconciles, openingReleaseLine } from "@/lib/payment/opening";
import { PARTY_KIND_WORDS } from "@/lib/supervision/labels";
import type { HiddenAct } from "@/lib/supervision/authority";

import { SupplyInvoices } from "./supply-panel";
import type { SupplyClaimRow } from "@/lib/project-docs/supply-read";
import { AdjustmentRefusedCallout } from "./adjustment-refused";
import { WithHiddenNote } from "./hidden-note";
import {

  AdvanceDrawer,
  OpeningDrawer,
  CalendarDrawer,
  CloseWindowDrawer,
  DeductionDrawer,
  HoldValuationDrawer,
  JointValuationDrawer,
  MainWorksDrawer,
  MaterialDrawer,
  NonCompletionDrawer,
  OpenValuationDrawer,
  PartyLineDrawer,
  PostDrawer,
  RaiseCertificateDrawer,
  ReleaseDrawer,
  RemoveDeductionDrawer,
  RemoveMaterialDrawer,
  WarningDrawer,
  WithdrawValuationDrawer,
  type Option,
} from "./payment-editors";

/**
 * The contract's Payments tab (6.13 Part A step 3, 4c): valuations and their certificates, retention, the advance and
 * the damages chain. Every figure shown is the pure rule the act runs, on the same inputs (the valuation's preview is
 * `assembleInterim`, as the raise act's); every refusal is said beside its button, in the act's own words. Post-award
 * contract figures are Internal, not SULIT (the item-10 ruling): no chip.
 */

const dim = (t: string) => <span className="text-ink-4">{t}</span>;
const say = (fs: readonly Finding[]) => (fs.length ? fs.map(paymentFaultText).join(" ") : null);
const opts = <K extends string>(keys: readonly K[], words: Readonly<Record<K, { en: string }>>): Option[] => keys.map((k) => ({ value: k, label: words[k].en }));
const row = "flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6";
const sub = "block text-[12.5px] break-words text-ink-3";
const head = "flex flex-wrap items-center gap-2 text-[13.5px] font-semibold break-words text-ink";
const zone = (today: string | null) => (today ? null : "Set the organisation's time zone first.");
const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;
export const VALUATION_PAGE = 12;


/// Everything the tab reads, once.
export async function paymentView(l: LoadedContract, today: string | null) {
  const [p, cfg] = await Promise.all([loadPayment(l.contract.id), loadPaymentConfig(l.org.id)]);
  const current = inProgress(p);
  // Run 3 residual M1: an issued adjustment whose net cannot be read is said by name in place of the valuation's
  // figures (they are read over the revised sum), never thrown into the page.
  const adjustments = readIssuedAdjustments(p.sumAdjustments);
  const refused = adjustments.ok ? null : adjustments.refused;
  const facts = current?.status === "OPEN" && today && !refused ? await preExecutionFacts(l) : null;
  // BD-613-44 (decisions log, 2026-10-09, ruling on 1897 R4): opening a valuation says whether the contractor's bank details are checked, as FR-PAY-014 says of the limit. Said, not refused: the refusal is the issue's.
  const creditor = facts ? await creditorFactsOf(db, l.org.id, l.award.vendorId) : undefined;
  const input = current?.status === "OPEN" && today && facts ? assembleInputOf(l, p, cfg, current, today, facts, creditor) : null;
  const assembled = input ? assembleInterim(input) : null;
  return { p, cfg, current, assembled, refused, issued: issuedInterims(p), baseline: today ? baselineOn(l, today) : null };
}
export type PaymentView = Awaited<ReturnType<typeof paymentView>>;

/// What an issued certificate's figures say, by key.
const figureOf = (snap: unknown, key: string): Sen | null => {
  const f = (snap as { figures?: { lines?: { key: string; value: string | null }[]; totals?: { key: string; value: string | null }[] } } | null)?.figures;
  const v = [...(f?.totals ?? []), ...(f?.lines ?? [])].find((x) => x.key === key)?.value ?? null;
  return v == null ? null : parseSen(v);
};

// ------------------------------------------------------------------ the Overview's summary

/// The financial position (plan A5): from the baseline and the issued certificates only.
export function PaymentSummaryCard({ l, v }: { l: LoadedContract; v: PaymentView }) {
  if (v.p.interimValuations.length === 0 && v.p.advancePayments.length === 0 && v.p.nonCompletions.length === 0) return null;
  const last = v.p.interimValuations.filter((x) => x.certificate?.status === "ISSUED").sort((a, b) => (a.certificate?.sequence ?? 0) - (b.certificate?.sequence ?? 0)).at(-1);
  const snap = last?.certificate?.issueSnapshot ?? null;
  const certified = v.issued.reduce((a, c) => a + (c.figures.get("carryForward") ? parseSen(c.figures.get("carryForward")!) : 0n), 0n);
  const lad = v.issued.reduce((a, c) => a + (c.figures.get("ladAmount") ? parseSen(c.figures.get("ladAmount")!) : 0n), 0n);
  const held = heldOnLatest(v.issued);
  const paid = v.p.interimValuations.filter((x) => x.certificate?.financePayment).length;
  return (
    <Card>
      <CardHeader icon={<WalletIcon size={17} />} title={<Say words={P.payments} />} subtitle="From issued certificates" actions={<ButtonLink href={`/projects/${l.contract.id}?tab=payments&section=valuations`} size="sm" variant="secondary">Open payments</ButtonLink>} />
      <CardBody>
        <KeyValues
          columns={2}
          items={[
            { label: "Interim certificates issued", value: v.issued.length ? `${v.issued.length}, the latest ${formatDate((snap as { issuedOn?: string } | null)?.issuedOn ?? null)}` : dim("None yet") },
            { label: "Certified to date, before deductions", value: v.issued.length ? formatMoney(certified) : dim("Nothing certified") },
            { label: "Retention held on the latest", value: held ? formatMoney(held.held.MAIN + held.held.NSC + held.held.NS) : dim("None held") },
            { label: "Liquidated damages deducted", value: v.issued.length ? formatMoney(lad) : dim("None") },
            { label: "Paid by Finance", value: `${paid} of ${v.issued.length}` },
            { label: "Valuation in progress", value: v.current ? `${formatDate(day(v.current.valuationDate))}, ${VALUATION_STATUS_WORDS[v.current.status].en.toLowerCase()}` : dim("None") },
          ]}
        />
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ the tab

/// `hidden`: the acts outside the delegated scope of a representative who is signed in, which their screen does not offer (FR-SUP-004, Phase 3d).
/// `supply`: the contract's supply claims where its payment route is delivery order and invoice; null on any other route (no section).
export function PaymentsPanel({ l, v, people, today, page, hidden = [], supply = null }: { l: LoadedContract; v: PaymentView; people: Option[]; today: string | null; page: number; hidden?: readonly HiddenAct[]; supply?: SupplyClaimRow[] | null }) {
  const body = (
    <Sections
      items={[
        ...(supply ? [{ id: "supply", label: "Supply invoices", node: <SupplyInvoices contractId={l.contract.id} status={l.contract.status as ContractStatus} rows={supply} people={people} today={today} zoneBlocker={zone(today)} /> }] : []),
        { id: "valuations", label: "Valuations", node: <ValuationsSection l={l} v={v} people={people} today={today} page={page} hidden={hidden} /> },
        { id: "retention", label: "Retention", node: <RetentionSection l={l} v={v} people={people} today={today} hidden={hidden} /> },
        { id: "advance", label: "Advance payment", node: <AdvanceSection l={l} v={v} people={people} hidden={hidden} /> },
        { id: "damages", label: "Liquidated damages", node: <DamagesSection l={l} v={v} people={people} today={today} hidden={hidden} /> },
      ]}
    />
  );
  return <WithHiddenNote hidden={hidden}>{body}</WithHiddenNote>;
}

/// BD-613-41 as amended: the contract's opening position, the way out where earlier interim certificates were not
/// raised from a valuation here. Entered once, before the first valuation the system raises.
function OpeningCard({ l, v, people, today, hidden }: { l: LoadedContract; v: PaymentView; people: Option[]; today: string | null; hidden: readonly HiddenAct[] }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("OPENING_POSITION", l.contract.status as ContractStatus);
  const o = v.p.openingPosition;
  const raised = openingClosed(v.p.interimValuations.map((x) => ({ certificateStatus: x.certificate?.status ?? null })));
  const rec = o ? openingReconciles(openingOf(o)) : [];
  const foreign = uncoveredForeign(v.p);
  if (!o && raised && foreign.length === 0) return null;
  const blocker = shut ?? zone(today) ?? (raised ? paymentFaultText({ code: "OPENING_CLOSED", level: "block" }) : null);
  const tag = (pv: string, note: string) => (
    <span className="flex flex-col items-start gap-1">
      <ProvenanceBadge value={pv} />
      <span className={sub}>{pv === "STATED" ? `Stated on ${note}` : `Assumed: ${note}`}</span>
    </span>
  );
  const fig = (value: string, pv: string, note: string) => (
    <span className="flex flex-col items-start gap-1">
      <span>{value}</span>
      {tag(pv, note)}
    </span>
  );
  const tiers = (a: { toString(): string }, b: { toString(): string }, c: { toString(): string }) => `${formatMoney(senFromDecimal(a))} main contractor, ${formatMoney(senFromDecimal(b))} nominated sub-contractors, ${formatMoney(senFromDecimal(c))} nominated suppliers`;
  const rows = (o?.advanceRecouped as { sequence: number; amount: string }[] | undefined) ?? [];
  const values = o
    ? {
        lastCertificateNumber: o.lastCertificateNumber,
        lastSequence: String(o.lastSequence),
        grossToDate: o.grossToDate.toString(),
        previouslyCertified: o.previouslyCertified.toString(),
        retentionMain: o.retentionMain.toString(), retentionNsc: o.retentionNsc.toString(), retentionNs: o.retentionNs.toString(),
        releasedMain: o.releasedMain.toString(), releasedNsc: o.releasedNsc.toString(), releasedNs: o.releasedNs.toString(),
        advanceRecouped: rows.map((r) => `${r.sequence} | ${r.amount}`).join("\n"),
        damagesChargedUntil: o.damagesChargedUntil ? day(o.damagesChargedUntil) : null,
        ...Object.fromEntries(OPENING_GROUPS.flatMap((g) => [[`${g}Provenance`, (o as unknown as Record<string, string>)[`${g}Provenance`]], [`${g}Note`, (o as unknown as Record<string, string>)[`${g}Note`]]])),
      }
    : {};
  return (
    <ActGate blocker={shut}>
    <Card>
      <CardHeader
        icon={<ClipboardIcon size={17} />}
        title={<Say words={P.openingPosition} />}
        subtitle="Certificates issued before this system"
        actions={hidden.includes("PRINCIPAL_OR_SO") ? undefined : <OpeningDrawer id={l.contract.id} people={people} groups={OPENING_GROUPS.map((g) => ({ group: g, label: OPENING_GROUP_WORDS[g].en }))} values={values} existing={!!o} blocker={blocker} />}
      />
      <CardBody>
        {foreign.length > 0 && <Callout tone="warn" title="Interim certificates issued here without a valuation">{`${foreign.map((x) => x.number ?? `interim certificate ${x.sequence}`).join(", ")}: record the opening position first.`}</Callout>}
        {rec.length > 0 && <Callout tone="warn" title="Said, not refused">{say(rec)}</Callout>}
        {o ? (
          <KeyValues
            columns={2}
            items={[
              { label: "The last interim certificate it covers", value: `${o.lastCertificateNumber} (interim certificate ${o.lastSequence})` },
              { label: OPENING_GROUP_WORDS.gross.en, value: fig(formatMoney(senFromDecimal(o.grossToDate)), o.grossProvenance, o.grossNote) },
              { label: OPENING_GROUP_WORDS.previous.en, value: fig(formatMoney(senFromDecimal(o.previouslyCertified)), o.previousProvenance, o.previousNote) },
              { label: OPENING_GROUP_WORDS.retention.en, value: fig(tiers(o.retentionMain, o.retentionNsc, o.retentionNs), o.retentionProvenance, o.retentionNote) },
              { label: OPENING_GROUP_WORDS.released.en, value: fig(tiers(o.releasedMain, o.releasedNsc, o.releasedNs), o.releasedProvenance, o.releasedNote) },
              { label: OPENING_GROUP_WORDS.advance.en, value: fig(rows.length ? rows.map((r) => `interim certificate ${r.sequence}: ${formatMoney(parseSen(r.amount))}`).join("; ") : "None", o.advanceProvenance, o.advanceNote) },
              { label: OPENING_GROUP_WORDS.damages.en, value: fig(o.damagesChargedUntil ? `The first day not charged: ${formatDate(day(o.damagesChargedUntil))}` : "None charged", o.damagesProvenance, o.damagesNote) },
              { label: "Recorded", value: `${formatDate(day(o.recordedOn))}, for ${o.person.name}` },
            ]}
          />
        ) : (
          <p className="text-[13px] text-ink-3">Not recorded. The first certificate here is number 1.</p>
        )}
        {o && <p className={`${sub} mt-3`}>Earlier advances are recorded as recouped, not continued.</p>}
      </CardBody>
    </Card>
    </ActGate>
  );
}

function ValuationsSection({ l, v, people, today, page, hidden }: { l: LoadedContract; v: PaymentView; people: Option[]; today: string | null; page: number; hidden: readonly HiddenAct[] }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("VALUATION", l.contract.status as ContractStatus);
  const c = l.contract;
  const p = v.p;
  const cal = p.paymentCalendar;
  // The opening act's own rule, on what does not depend on the drawer's answers.
  const state = today ? openFaults({ trigger: "CLAIM", triggerDate: today, valuationDate: today, today, calendarDay: cal?.dayOfMonth ?? null, inProgress: !!v.current, lastIssuedOn: null, baselineInForce: !!v.baseline }).filter((f) => f.code === "VALUATION_IN_PROGRESS" || f.code === "NO_BASELINE") : [];
  const openBlocker = zone(today) ?? say([...state, ...pendingAdvanceFaults(pendingAdvancesOf(p))]);
  const all = [...p.interimValuations].reverse();
  const pages = Math.max(1, Math.ceil(all.length / VALUATION_PAGE));
  const pg = Math.min(page, pages - 1);
  const shown = all.slice(pg * VALUATION_PAGE, (pg + 1) * VALUATION_PAGE);
  const formSet = !!kindSettingOf(v.cfg, "INTERIM_PAYMENT")?.templateId;
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<CalendarIcon size={17} />} title={<Say words={P.valuationCalendar} />} subtitle="Monthly joint site valuation" actions={hidden.includes("PRINCIPAL_OR_SO") ? undefined : <CalendarDrawer id={c.id} people={people} today={today} current={cal ? { dayOfMonth: cal.dayOfMonth, agreedWith: cal.agreedWith } : null} />} />
        <CardBody>
          {cal ? (
            <KeyValues
              columns={2}
              items={[
                { label: "Valuation day", value: `Day ${cal.dayOfMonth} of each month (the last day of a shorter month)` },
                { label: "Agreed", value: `${formatDate(day(cal.agreedOn))} with ${cal.agreedWith}, recorded for ${cal.person.name}` },
                              ]}
            />
          ) : (
            <p className="text-[13px] text-ink-3">Not agreed yet.</p>
          )}
        </CardBody>
      </Card>

      <OpeningCard l={l} v={v} people={people} today={today} hidden={hidden} />

      {v.current?.status === "OPEN" ? <CurrentValuation l={l} v={v} today={today} formSet={formSet} /> : null}

      <Card className="overflow-hidden">
        <CardHeader icon={<WalletIcon size={17} />} title={<Say words={P.valuationsAndCertificates} />} subtitle="Newest first" actions={hidden.includes("VALUATION") ? undefined : <OpenValuationDrawer id={c.id} people={people} today={today} triggers={opts(VALUATION_TRIGGERS, TRIGGER_WORDS)} blocker={openBlocker} warning={null} />} divided={all.length > 0} />
        {all.length === 0 ? (
          <EmptyState size="sm" title="None yet" />
        ) : (
          <ul className="divide-y divide-line/70">
            {shown.map((x) => {
              const cert = x.certificate;
              const status = cert?.status as CertificateStatus | undefined;
              const snap = cert?.issueSnapshot ?? null;
              const recommended = status === "ISSUED" ? figureOf(snap, "recommended") : null;
              const j = readJudgedUnder(x.judgedUnder);
              return (
                <li key={x.id} className={row}>
                  <span className="min-w-0">
                    <span className={head}>
                      {`Valuation of ${formatDate(day(x.valuationDate))}`}
                      {cert?.id && status ? <Badge tone={TONE[STATUS_TONE[status]]}>{STATUS_WORDS[status].en}</Badge> : <Badge tone={x.status === "OPEN" ? "info" : x.status === "HELD" ? "warn" : undefined}>{VALUATION_STATUS_WORDS[x.status].en}</Badge>}
                    </span>
                    <span className={sub}>{[TRIGGER_WORDS[x.trigger].en, x.triggerDate ? `claim received ${formatDate(day(x.triggerDate))}` : null, j ? `interim certificate ${cert?.sequence ?? j.sequence}${cert?.number ? `, ${cert.number}` : ""}` : null, recommended != null ? `payment recommended ${formatMoney(recommended)}` : null, cert?.financePayment ? paidLine(asCorrected(cert.financePayment)) : null].filter(Boolean).join(" · ")}</span>
                    {x.closeReason && <span className={sub}>{`${VALUATION_STATUS_WORDS[x.status].en}: ${x.closeReason}`}</span>}
                    {cert?.status === "VOID" && <span className={sub}>Certificate void. Open another valuation.</span>}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {cert?.id && <ButtonLink href={`/projects/${c.id}/certificates/${cert.id}`} size="sm" variant="secondary">{KIND_WORDS.INTERIM_PAYMENT.en}</ButtonLink>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {pages > 1 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span>{`Valuations ${pg * VALUATION_PAGE + 1}–${Math.min(all.length, (pg + 1) * VALUATION_PAGE)} of ${all.length}.`}</span>
            <span className="flex gap-2">
              {pg > 0 && <ButtonLink href={`/projects/${c.id}?tab=payments&section=valuations&page=${pg - 1}`} size="sm" variant="ghost">Newer</ButtonLink>}
              {pg + 1 < pages && <ButtonLink href={`/projects/${c.id}?tab=payments&section=valuations&page=${pg + 1}`} size="sm" variant="ghost">Older</ButtonLink>}
            </span>
          </CardFooter>
        )}
      </Card>
    </div>
    </ActGate>
  );
}

function CurrentValuation({ l, v, today, formSet }: { l: LoadedContract; v: PaymentView; today: string | null; formSet: boolean }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("VALUATION", l.contract.status as ContractStatus);
  const c = l.contract;
  const x = v.current!;
  const a = v.assembled;
  const label = `Valuation of ${formatDate(day(x.valuationDate))}`;
  const blocker = zone(today) ?? (!formSet ? paymentFaultText(noFormFault("INTERIM_PAYMENT")) : v.refused ? v.refused.message : a ? say(a.faults) : "No baseline version in force.");
  const parties = v.p.contractParties.filter((pt) => !pt.retiredOn);
  const fig = a?.result.figures ?? null;
  // The issue clock (Configuration › Post-award), from the valuation day, or from the claim where one started it.
  const from = issueClockFrom(x.trigger, x.triggerDate ? storedDay(x.triggerDate) : null, storedDay(x.valuationDate));
  const clock = v.cfg.clocks.find((k) => k.clock === "CERT_ISSUE") ?? null;
  const due = clock ? (clock.unit === "DAYS" ? formatDate(dayPlus(from, clock.length)) : clock.unit === "WEEKS" ? formatDate(dayPlus(from, clock.length * 7)) : `${clock.length} months after ${formatDate(from)}`) : null;
  return (
    <ActGate blocker={shut}>
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClipboardIcon size={17} />}
        title={label}
        subtitle={`${TRIGGER_WORDS[x.trigger].en}${x.triggerDate ? `, received ${formatDate(day(x.triggerDate))}` : ""}. Recorded for ${x.person.name}. ${a ? `As interim certificate ${a.sequence} on this contract.` : ""}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {a?.minimum.state === "BELOW" && <HoldValuationDrawer id={c.id} valuationId={x.id} />}
            <WithdrawValuationDrawer id={c.id} valuationId={x.id} />
            <RaiseCertificateDrawer id={c.id} valuationId={x.id} blocker={blocker} summary={fig ? `Payment recommended ${formatMoney(fig.recommended)}: gross ${formatMoney(fig.gross)} less retention and earlier certificates (${formatMoney(fig.less)}) and deductions (${formatMoney(fig.deductions)}).` : ""} />
          </span>
        }
        divided
      />
      {v.refused && (
        <CardBody className="border-b border-line/70">
          <AdjustmentRefusedCallout l={l} refused={v.refused} />
        </CardBody>
      )}
      {a && a.warnings.length > 0 && (
        <CardBody className="border-b border-line/70">
          <Callout tone="warn" title="Said, not refused">{say(a.warnings)}</Callout>
        </CardBody>
      )}
      <CardBody>
        <KeyValues
          columns={2}
          items={[
            { label: "Main contractor's work, to date", value: <span className="flex flex-wrap items-center gap-2">{x.mainWorks == null ? dim("Not valued") : formatMoney(senFromDecimal(x.mainWorks))}<MainWorksDrawer id={c.id} valuationId={x.id} current={x.mainWorks == null ? null : x.mainWorks.toString()} /></span> },
            {
              label: "Joint valuation",
              value: (
                <span className="flex flex-col items-start gap-1">
                  <span>{x.jointOn && x.contractorAnswer ? `${formatDate(day(x.jointOn))}: ${ANSWER_WORDS[x.contractorAnswer].en.toLowerCase()}${x.dissent ? ` (${x.dissent})` : ""}` : dim("Not recorded")}</span>
                  {x.jointOn && <span className={sub}>{`${x.participants.join(", ")}. ${x.method}`}</span>}
                  <JointValuationDrawer id={c.id} valuationId={x.id} answers={opts(CONTRACTOR_ANSWERS, ANSWER_WORDS)} today={today} recorded={!!x.jointOn} />
                </span>
              ),
            },
            { label: "Certificate due by", value: due ? <span className="flex flex-col items-start gap-1"><span>{due}</span><ProvenanceBadge value={clock!.provenance} /></span> : <span className="flex flex-col items-start gap-1"><Badge tone="warn">Not set</Badge><span className={sub}>Certificate due period not set. See Configuration › Post-award.</span></span> },
          ]}
        />
      </CardBody>
      <CardHeader title={<Say words={P.materialsOnSite} />} subtitle="Failed lines shown, not valued" actions={<MaterialDrawer id={c.id} valuationId={x.id} today={today} />} divided={x.materialLines.length > 0} className="border-t border-line/70" />
      {x.materialLines.length > 0 && (
        <ul className="divide-y divide-line/70">
          {x.materialLines.map((m) => {
            const verdict = materialVerdict({ value: senFromDecimal(m.value), protectedOnSite: m.protectedOnSite, notTooEarly: m.notTooEarly, formsPartOfWorks: m.formsPartOfWorks, temporary: m.temporary, submittedOn: storedDay(m.submittedOn) });
            return (
              <li key={m.id} className={row}>
                <span className="min-w-0">
                  <span className={head}>
                    {`${m.description} · ${formatMoney(senFromDecimal(m.value))}`}
                    <Chip tone={verdict === "ELIGIBLE" ? "ok" : "warn"}>{MATERIAL_VERDICT_WORDS[verdict].en}</Chip>
                  </span>
                  <span className={sub}>{`${m.quantity}, stored at ${m.location}; on the list of ${formatDate(day(m.submittedOn))}`}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <RemoveMaterialDrawer id={c.id} valuationId={x.id} lineId={m.id} label={m.description} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <CardHeader title={<Say words={P.nominatedParties} />} subtitle={`Totals only${parties.some((pt) => pt.directPayment) ? ` · ${PAYEE_BANK_UNCHECKED.direct.en}` : ""}`} divided className="border-t border-line/70" />
      {parties.length === 0 ? (
        <EmptyState size="sm" title="None on this contract" action={<ButtonLink href={caseHref({ awardId: l.award.id, contractId: l.contract.id }, { stage: "project", tab: "team" })} size="sm" variant="secondary">Open Team</ButtonLink>} />
      ) : (
        <ul className="divide-y divide-line/70">
          {parties.map((pt) => {
            const line = x.partyLines.find((pl) => pl.partyId === pt.id) ?? null;
            const alloc = a?.waterfall?.allocations.find((al) => al.id === pt.id) ?? null;
            return (
              <li key={pt.id} className={row}>
                <span className="min-w-0">
                  <span className={head}>{`${pt.name} · ${PARTY_KIND_WORDS[pt.kind].en}`}</span>
                  <span className={sub}>{line ? [line.value == null ? null : `valued to date ${formatMoney(senFromDecimal(line.value))}`, `due ${formatMoney(senFromDecimal(line.due))}`, alloc ? `paid ${formatMoney(alloc.paid)}${alloc.proRata ? " (pro rata within the nominated tier)" : ""}` : null, pt.directPayment ? "paid direct" : null].filter(Boolean).join(" · ") : "Not on this valuation"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <PartyLineDrawer id={c.id} valuationId={x.id} partyId={pt.id} name={pt.name} assignee={pt.kind === "ASSIGNEE"} today={today} current={line ? { value: line.value == null ? null : line.value.toString(), due: line.due.toString() } : null} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <CardHeader title={<Say words={P.deductionsKeyed} />} subtitle="Not computed by any rule" actions={<DeductionDrawer id={c.id} valuationId={x.id} kinds={opts(KEYED_DEDUCTION_KINDS, DEDUCTION_WORDS)} />} divided={x.deductions.length > 0} className="border-t border-line/70" />
      {x.deductions.length > 0 && (
        <ul className="divide-y divide-line/70">
          {x.deductions.map((d) => (
            <li key={d.id} className={row}>
              <span className="min-w-0">
                <span className={head}>{`${d.kind === "OTHER" ? d.label : DEDUCTION_WORDS[d.kind].en} · ${formatMoney(senFromDecimal(d.amount))}`}</span>
                {d.note && <span className={sub}>{d.note}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <RemoveDeductionDrawer id={c.id} valuationId={x.id} deductionId={d.id} label={d.kind === "OTHER" ? d.label : DEDUCTION_WORDS[d.kind].en} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <PreviewFigures a={a} />
    </Card>
    </ActGate>
  );
}

/// The figures as they stand, from the same assembly the raise act runs.
function PreviewFigures({ a }: { a: Assembled | null }) {
  const snap = a?.result.snapshot ?? null;
  if (!a || !snap) {
    return (
      <CardBody className="border-t border-line/70">
        <p className="text-[13px] font-semibold text-ink">The certificate as it stands</p>
        <p className="mt-1 text-[12.5px] text-ink-3">{a ? `Not worked out yet: ${say(a.faults) ?? "a figure it needs is missing."}` : "Not worked out: no baseline version."}</p>
      </CardBody>
    );
  }
  const e = applyOverrides(snap, []);
  const text = (type: string, value: string | null) => (value == null ? "Not computed" : type === "MONEY" ? formatMoney(parseSen(value)) : type === "PERCENT" ? `${value}%` : type === "DAYS" ? `${value} days` : type === "DATE" ? formatDate(value) : value);
  return (
    <>
      <CardHeader title={<Say words={P.certificateAsItStands} />} subtitle={`${snap.rule.en}.${a.minimum.state === "BELOW" ? ` Below the ${a.minimum.first ? "first certificate's" : "certificate's"} minimum (${formatMoney(a.minimum.minimum)}): held to the next cycle.` : ""}`} divided className="border-t border-line/70" />
      <ul className="divide-y divide-line/70">
        {e.lines.map((f) => (
          <li key={f.key} className={f.type === "TEXT" ? "flex flex-col gap-1 px-5 py-2.5 sm:px-6" : "flex flex-col gap-1 px-5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:px-6"}>
            <span className="min-w-0 text-[13px] break-words text-ink-2">{f.labelEn}</span>
            <span className={f.type === "TEXT" ? "min-w-0 max-w-prose text-[13px] break-words text-ink" : "shrink-0 text-[13px] text-ink tabular-nums"}>{text(f.type, f.value)}</span>
          </li>
        ))}
        {e.totals.map((t) => (
          <li key={t.key} className="flex flex-col gap-1 bg-sunken/60 px-5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <span className="min-w-0 text-[13px] font-bold break-words text-ink">{t.labelEn}</span>
            <span className="shrink-0 text-[13px] font-bold text-ink tabular-nums">{text("MONEY", t.value)}</span>
          </li>
        ))}
      </ul>
      {a.waterfall && !a.waterfall.sufficient && (
        <CardBody className="border-t border-line/70">
          <p className="text-[12.5px] text-ink-3">{`Not enough for everyone due. Paid pro rata: nominated tier (${formatMoney(a.waterfall.nominatedDue)}), then assignees, then the contractor (${formatMoney(a.waterfall.contractor)}). Assumed reading.`}</p>
        </CardBody>
      )}
    </>
  );
}

// ------------------------------------------------------------------ retention

function RetentionSection({ l, v, people, today, hidden }: { l: LoadedContract; v: PaymentView; people: Option[]; today: string | null; hidden: readonly HiddenAct[] }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("RETENTION_RELEASE", l.contract.status as ContractStatus);
  const c = l.contract;
  const b = v.baseline?.values ?? null;
  const reading = b ? retentionReading({ applies: b.retentionApplies, percent: b.retentionPercent, capPercent: b.retentionCapPercent, source: b.retentionSource }) : null;
  const held = heldOnLatest(v.issued);
  const balance = v.p.retentionReleases.find((x) => x.kind === "RELEASED_BALANCE") ?? null;
  const rs = releaseStateOf(v.p);
  const op = v.p.openingPosition;
  const openingRelease = openingReleaseLine(op ? { released: openingOf(op).released, provenance: op.releasedProvenance as "STATED" | "ASSUMED", note: op.releasedNote, lastCertificateNumber: op.lastCertificateNumber, lastSequence: op.lastSequence } : null);
  const pct = firstReleaseShare(v.cfg.policy?.firstReleasePct);
  const handed = v.p.siteRecordsHandovers.length > 0;
  const releaseBlock = (kind: "RELEASED_FIRST" | "RELEASED_BALANCE") => {
    if (!held) return paymentFaultText({ code: "NO_ISSUED_INTERIM", level: "block" });
    const r = releaseOf({ kind, held: held.held, already: rs.already, firstReleasePct: pct, asBuiltHandedOver: handed, makingGoodIssued: false, firstReleased: rs.firstReleased });
    return zone(today) ?? say(r.faults);
  };
  const terms =
    !reading ? dim("No baseline version is in force today")
    : reading.state === "APPLIES" ? `${reading.percent}% of the value to date, the three ways, capped at ${reading.capPercent}% of the contract sum`
    : reading.state === "NONE" ? `Does not apply: ${reading.source === "DERIVED" ? "the contract's terms band holds none" : "recorded at baseline with its provenance"}`
    : reading.state === "NOT_SET" ? <Badge tone="warn">Not set. Refused until the baseline states it</Badge>
    : <Badge tone="warn">No band or decision. Refused</Badge>;
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<ShieldIcon size={17} />} title={<Say words={P.retention} />} subtitle="Held three ways, from the baseline" />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Terms", value: <span className="flex flex-col items-start gap-1"><span>{terms}</span>{b?.retentionSource && <span className={sub}>{`From the baseline: ${SOURCE_WORDS[b.retentionSource]?.en.toLowerCase() ?? "recorded"}`}</span>}</span> },
              { label: "Held on the latest issued certificate", value: held ? `${formatMoney(held.held.MAIN + held.held.NSC + held.held.NS)} (${(["MAIN", "NSC", "NS"] as const).map((t) => `${TIER_WORDS[t].en.toLowerCase()} ${formatMoney(held.held[t])}`).join(", ")})` : dim("None held: no interim certificate is issued") },
              { label: "The first release's share", value: pct ? <span className="flex flex-col items-start gap-1"><span>{`${pct}% of what is held`}</span><ProvenanceBadge value={v.cfg.policy?.firstReleaseProvenance ?? null} /></span> : <span className="flex flex-col items-start gap-1"><Badge tone="warn">Not set</Badge><span className={sub}>Refused until Configuration › Post-award sets it.</span></span> },
              { label: "At the cap", value: <span className="flex flex-col items-start gap-1"><span>Shared pro rata past the cap; remainder: ({v.cfg.policy?.waterfallRemainder ? REMAINDER_WORDS[v.cfg.policy.waterfallRemainder].en.toLowerCase() : "not set"}).</span><ProvenanceBadge value="ASSUMED" /></span> },
              { label: "As-built drawings", value: handed ? `Handed over ${formatDate(day(v.p.siteRecordsHandovers.at(-1)!.handedOverOn))}` : dim("Not handed over (Site › Site records)") },
            ]}
          />
        </CardBody>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<ShieldIcon size={17} />}
          title={<Say words={P.releases} />}
          subtitle="Once each"
          actions={
            <span className="flex flex-wrap items-center gap-2">
              {!hidden.includes("PRINCIPAL_OR_SO") && !rs.already.first && <ReleaseDrawer id={c.id} release="RELEASED_FIRST" label={RELEASE_WORDS.RELEASED_FIRST.en} people={people} today={today} blocker={releaseBlock("RELEASED_FIRST")} />}
              {!hidden.includes("PRINCIPAL_OR_SO") && !balance && <ReleaseDrawer id={c.id} release="RELEASED_BALANCE" label={RELEASE_WORDS.RELEASED_BALANCE.en} people={people} today={today} blocker={releaseBlock("RELEASED_BALANCE")} />}
            </span>
          }
          divided={v.p.retentionReleases.length > 0 || !!openingRelease}
        />
        {v.p.retentionReleases.length === 0 && !openingRelease ? (
          <EmptyState size="sm" title="Nothing released" />
        ) : (
          <ul className="divide-y divide-line/70">
            {openingRelease && (
              // Acceptance S-4 (BD-613-51's condition): released before the system, read as the first release.
              <li className={row}>
                <span className="min-w-0">
                  <span className={head}>{openingRelease.head.en}<ProvenanceBadge value={openingRelease.provenance} /></span>
                  <span className={sub}>{openingRelease.sub.en}</span>
                </span>
              </li>
            )}
            {v.p.retentionReleases.map((r) => (
              <li key={r.id} className={row}>
                <span className="min-w-0">
                  <span className={head}>{`${RELEASE_WORDS[r.kind].en} · ${formatMoney(senFromDecimal(r.main) + senFromDecimal(r.nsc) + senFromDecimal(r.ns))}`}</span>
                  <span className={sub}>{`${formatDate(day(r.releasedOn))}, from interim certificate ${r.basisCertificate.sequence ?? ""} (${r.basisCertificate.number ?? "not numbered"})${r.pct ? `, ${decimalText(r.pct)}% of what it held` : ""}; recorded for ${r.person.name}`}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
    </ActGate>
  );
}

// ------------------------------------------------------------------ the advance (B2)

function AdvanceSection({ l, v, people, hidden }: { l: LoadedContract; v: PaymentView; people: Option[]; hidden: readonly HiddenAct[] }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("ADVANCE_PAYMENT", l.contract.status as ContractStatus);
  const c = l.contract;
  const guarantees = c.securities.filter((s) => s.kind === "ADVANCE_PAYMENT_GUARANTEE").map((s) => ({ value: s.id, label: `${s.instrumentRef || "Guarantee"} · ${formatMoney(senFromDecimal(s.value))}${s.status === "VERIFIED" ? "" : " (not verified)"}` }));
  const nscs = v.p.contractParties.filter((pt) => pt.kind === "NOMINATED_SUBCONTRACTOR" && !pt.retiredOn).map((pt) => ({ value: pt.id, label: pt.name }));
  const formSet = !!kindSettingOf(v.cfg, "ADVANCE_PAYMENT")?.templateId;
  const inProg = inProgressSequenceOf(v.p);
  const blocker = shut ?? (!formSet ? paymentFaultText(noFormFault("ADVANCE_PAYMENT")) : inProg != null ? paymentFaultText({ code: "ADVANCE_VALUATION_IN_PROGRESS", level: "block", data: { sequence: inProg } }) : guarantees.length === 0 ? "No Advance Payment Guarantee. Lodge and verify it first." : null);
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      <div><InfoChip tone="warn" detail="No procedure sets who may have an advance or how much. An advance needs a verified Advance Payment Guarantee and a recoupment schedule, and goes for approval on the matrix.">Not checked</InfoChip></div>
      <Card className="overflow-hidden">
        <CardHeader icon={<WalletIcon size={17} />} title={<Say words={P.advancePayments} />} subtitle="With each recoupment schedule" actions={hidden.includes("PRINCIPAL_OR_SO") ? undefined : <AdvanceDrawer id={c.id} people={people} parties={nscs} guarantees={guarantees} parts={opts(ADVANCE_PARTIES, ADVANCE_PARTY_WORDS)} blocker={blocker} />} divided={v.p.advancePayments.length > 0} />
        {v.p.advancePayments.length === 0 ? (
          <EmptyState size="sm" title="None" />
        ) : (
          <ul className="divide-y divide-line/70">
            {v.p.advancePayments.map((a) => {
              const recouped = v.issued.reduce((s, ci) => s + (ci.judgedUnder?.recoupments.filter((r) => r.advanceId === a.id).reduce((x, r) => x + parseSen(r.recoup), 0n) ?? 0n), 0n);
              const status = a.certificate.status as CertificateStatus;
              return (
                <li key={a.id} className={row}>
                  <span className="min-w-0">
                    <span className={head}>
                      {`${a.party === "MAIN" ? "The main contractor" : (a.contractParty?.name ?? "A nominated sub-contractor")} · ${formatMoney(senFromDecimal(a.amount))}`}
                      <Badge tone={TONE[STATUS_TONE[status]]}>{STATUS_WORDS[status].en}</Badge>
                    </span>
                    <span className={sub}>{`Guarantee ${a.security.instrumentRef || "lodged"}; recouped ${formatMoney(recouped)}, ${formatMoney(senFromDecimal(a.amount) - recouped)} to recoup`}</span>
                    <span className={sub}>{a.schedule.map((r) => `certificate ${r.sequence}: ${formatMoney(senFromDecimal(r.amount))}`).join(" · ")}</span>
                    {a.party !== "MAIN" && <span className={sub}>{PAYEE_BANK_UNCHECKED.advance.en}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <ButtonLink href={`/projects/${c.id}/certificates/${a.certificate.id}`} size="sm" variant="secondary">{KIND_WORDS.ADVANCE_PAYMENT.en}</ButtonLink>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
    </ActGate>
  );
}

// ------------------------------------------------------------------ the damages chain

function DamagesSection({ l, v, people, today, hidden }: { l: LoadedContract; v: PaymentView; people: Option[]; today: string | null; hidden: readonly HiddenAct[] }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("DAMAGES", l.contract.status as ContractStatus);
  const c = l.contract;
  const b = v.baseline?.values ?? null;
  const completion = b?.dateForCompletion ?? null;
  const decision = decisionOf(v.p, v.baseline);
  const liveRow = liveDecisionOf(v.p);
  const reading = today ? ladLine({ dateForCompletion: completion, valuationDate: today, decision, chargedUntil: chargedUntilOf(v.issued) }) : null;
  const revised = frozenRateWarnings(decision, baselineDamagesOf(v.p, v.baseline));
  const liveWarning = v.p.ladWarnings.find((w) => w.certificate.status !== "VOID" && !v.p.nonCompletions.some((d) => d.warningId === w.id)) ?? null;
  const warningBlock = zone(today) ?? say(warningFaults({ dateForCompletion: completion, rate: b?.ladDaily ?? null, eotClause: "x", ladClause: "x", extendedCompletion: completion, liveWarning: !!liveWarning, formSet: !!kindSettingOf(v.cfg, "LAD_WARNING")?.templateId }));
  const latestWarning = [...v.p.ladWarnings].reverse().find((w) => w.certificate.status !== "VOID") ?? null;
  // The decision act's own rule, on what does not depend on the drawer's answers (past completion; an excusable delay needs only its reasons).
  const decisionBlock = zone(today) ?? say(decisionFaults({ outcome: "EXCUSED_OR_PENDING", reason: "x", dateForCompletion: completion, today: today ?? "", scope: null, section: null, wholeRate: null, warning: null, eotClause: "", ladClause: "", insuranceExpiry: null, expectedCompletion: null, windowFrom: null, windowUntil: null, pack: [], formSet: true }));
  const readingText =
    !reading ? "Not judged without the organisation's time zone."
    : reading.state === "NOT_DUE" ? (completion ? `Not due: the date for completion is ${formatDate(completion)}.` : "Not due: no completion date yet.")
    : reading.state === "DECISION_REQUIRED" ? `Past the date for completion (${formatDate(completion)}) with no decision. Interim certificates are refused.`
    : reading.state === "CNC_NOT_ISSUED" ? "Damages apply. Certificate of Non-Completion not issued."
    : reading.state === "RATE_NOT_SET" ? "No baseline rate. Interim certificates are refused."
    : reading.state === "EXCUSED" ? `No damages: excusable or pending (${reading.reason}).`
    : reading.state === "NOTHING_TO_CHARGE" ? "Damages apply."
    : `Damages run: ${reading.days} days at ${formatMoney(reading.rate)} a day (${formatMoney(reading.amount)}), for the next certificate.`;
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<GavelIcon size={17} />} title={<Say words={P.liquidatedDamages} />} subtitle="Rate from the baseline" actions={reading && reading.state !== "NOT_DUE" ? <Badge tone={reading.state === "EXCUSED" || reading.state === "NOTHING_TO_CHARGE" ? "info" : "warn"}>{reading.state === "CHARGED" ? "Damages running" : reading.state === "EXCUSED" ? "Excused or pending" : "Decision needed"}</Badge> : undefined} />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Date for completion", value: completion ? formatDate(completion) : dim("From possession") },
              { label: "Rate a day", value: decision?.outcome === "LAD_APPLIES" && decision.rate != null ? <span className="flex flex-col items-start gap-1"><span>{`${formatMoney(decision.rate)}, as on the Certificate of Non-Completion`}</span>{revised.length > 0 && <span className="text-[12.5px] text-amber-800">{say(revised)}</span>}</span> : b?.ladDaily != null ? `${formatMoney(b.ladDaily)} (the baseline's; frozen with the decision)` : dim("Not stated by the baseline") },
              { label: "Today", value: readingText },
              { label: "Decision in force", value: decision ? `${OUTCOME_WORDS[decision.outcome].en}${decision.from ? `; damages from ${formatDate(decision.from)}${decision.until ? ` to completion on ${formatDate(decision.until)}` : ", still running"}` : ""}` : dim("None recorded") },
            ]}
          />
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader icon={<AlertTriangle size={17} />} title={<Say words={P.warningLetters} />} subtitle="Before damages are imposed" actions={hidden.includes("SO_ONLY") ? undefined : <WarningDrawer id={c.id} people={people} today={today} blocker={warningBlock} completion={completion ? formatDate(completion) : null} />} divided={v.p.ladWarnings.length > 0} />
        {v.p.ladWarnings.length === 0 ? (
          <EmptyState size="sm" title="None" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.p.ladWarnings].reverse().map((w) => {
              const status = w.certificate.status as CertificateStatus;
              const clock = w.responseClock as { length: number; unit: string } | null;
              const due = w.postedOn && clock ? (clock.unit === "DAYS" ? dayPlus(storedDay(w.postedOn), clock.length) : clock.unit === "WEEKS" ? dayPlus(storedDay(w.postedOn), clock.length * 7) : null) : null;
              return (
                <li key={w.id} className={row}>
                  <span className="min-w-0">
                    <span className={head}>
                      {`Extended completion ${formatDate(day(w.extendedCompletion))} · ${formatMoney(senFromDecimal(w.rate))} a day`}
                      <Badge tone={TONE[STATUS_TONE[status]]}>{STATUS_WORDS[status].en}</Badge>
                    </span>
                    <span className={sub}>{[`clauses ${w.eotClause} and ${w.ladClause}`, w.postedOn ? `posted ${formatDate(day(w.postedOn))}, ${w.consignmentRef}` : status === "ISSUED" ? "not posted yet" : null, w.postedOn ? (clock ? (due ? `reasons due by ${formatDate(due)}` : `reasons within ${clock.length} months`) : "response window not set (advisory)") : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {status === "ISSUED" && !w.postedOn && <PostDrawer id={c.id} warningId={w.id} today={today} />}
                    <ButtonLink href={`/projects/${c.id}/certificates/${w.certificate.id}`} size="sm" variant="secondary">The letter</ButtonLink>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileIcon size={17} />}
          title={<Say words={P.nonCompletionDecisions} />}
          subtitle="The latest decision governs"
          actions={hidden.includes("SO_ONLY") ? undefined : <NonCompletionDrawer id={c.id} people={people} outcomes={opts(NON_COMPLETION_OUTCOMES, OUTCOME_WORDS)} scopes={opts(NON_COMPLETION_SCOPES, SCOPE_WORDS)} sections={(v.baseline?.values.sections ?? []).map((s) => ({ value: s.ref, label: s.description || s.ref }))} pack={PACK_ITEMS.map((item) => ({ item, label: PACK_WORDS[item].en }))} blocker={decisionBlock ?? (liveRow ? say(replacementFaults({ live: { ...liveRow, certificateStatus: liveRow.certificate?.status ?? null }, replacesId: liveRow.id, reason: "x", valuationInProgress: v.current ? `interim valuation of ${formatDate(day(v.current.valuationDate))}` : null })) : null)} windowFrom={completion ? dayPlus(completion, 1) : null} replaces={liveRow ? { id: liveRow.id, text: `${OUTCOME_WORDS[liveRow.outcome].en}, decided ${formatDate(day(liveRow.decidedOn))}` } : null} />}
          divided={v.p.nonCompletions.length > 0}
        />
        {latestWarning && !latestWarning.postedOn && <CardBody className="border-b border-line/70"><p className={sub}>Needs the warning letter issued and posted.</p></CardBody>}
        {v.p.nonCompletions.length === 0 ? (
          <EmptyState size="sm" title="None" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.p.nonCompletions].reverse().map((d, n) => {
              const status = d.certificate?.status as CertificateStatus | undefined;
              return (
                <li key={d.id} className={row}>
                  <span className="min-w-0">
                    <span className={head}>
                      {`${OUTCOME_WORDS[d.outcome].en}, ${formatDate(day(d.decidedOn))}`}
                      {n === 0 && <Chip tone="info">In force</Chip>}
                      {d.certificate?.id && status && <Badge tone={TONE[STATUS_TONE[status]]}>{STATUS_WORDS[status].en}</Badge>}
                    </span>
                    <span className={sub}>{d.reason}</span>
                    {d.outcome === "LAD_APPLIES" && <span className={sub}>{[d.scope ? SCOPE_WORDS[d.scope].en : null, d.rate ? `${formatMoney(senFromDecimal(d.rate))} a day` : null, d.windowFrom ? `damages from ${formatDate(day(d.windowFrom))}${d.windowUntil ? ` to completion on ${formatDate(day(d.windowUntil))}` : ", running"} (the window entered with the decision, assumed)` : null, d.insuranceExpiry ? `insurance to ${formatDate(day(d.insuranceExpiry))}` : null].filter(Boolean).join(" · ")}</span>}
                    <span className={sub}><ActedBy entity="NonCompletion" id={d.id} slot="person" name={d.person.name} /></span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {n === 0 && d.outcome === "LAD_APPLIES" && d.windowFrom && !d.windowUntil && <CloseWindowDrawer id={c.id} decisionId={d.id} today={today} />}
                    {d.certificate?.id && <ButtonLink href={`/projects/${c.id}/certificates/${d.certificate.id}`} size="sm" variant="secondary">{KIND_WORDS.NON_COMPLETION.en}</ButtonLink>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
    </ActGate>
  );
}

/// Finance's payment as it stands (its latest correction, Phase 0.3 item 12), for a valuation's line.
const paidLine = (p: { paidOn: Date; batchNo: string }): string => `paid by Finance ${formatDate(storedDay(p.paidOn))}, batch ${p.batchNo}`;
