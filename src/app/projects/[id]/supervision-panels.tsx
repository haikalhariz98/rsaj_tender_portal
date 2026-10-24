import { Say } from "@/components/i18n/language-context";
import { Sections } from "./sections";
import { CASE_PANEL_TITLE_WORDS as P } from "@/lib/contract/case-page-words";
import { ActedBy } from "@/components/attribution";
import { ActGate } from "@/components/act-gate";
import { actStatusBlocker } from "@/lib/contract/act-status";
import Link from "next/link";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { AlertTriangle, BuildingIcon, CalendarIcon, ChartIcon, ClipboardIcon, FileIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { INSURANCE_KIND_LABEL } from "@/lib/award/labels";
import { loadIssue } from "@/lib/authority/load";
import { latestVersion } from "@/lib/contract/baseline";
import { PROVENANCE_WORDS } from "@/lib/contract/labels";
import { baselineRows, liveOf, valuesOf } from "@/lib/contract/load";
import type { LoadedContract } from "@/lib/contract/repo";
import { isExecuted } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOrNull as day, dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { amountOf, formatMoney, senFromDecimal, senToDecimalString } from "@/lib/money";
import type { HiddenAct } from "@/lib/supervision/authority";
import { delegationFaults, delegationState } from "@/lib/supervision/delegation";
import { entryState, missingDays } from "@/lib/supervision/diary";
import { delayOn, delegationFactsOf, loadPostAwardPolicy, loadSupervision, methodKeyOf, revisionsOf, soOfficeOn } from "@/lib/supervision/load";
import { startRuleReading } from "@/lib/supervision/possession";
import { possessionBlockerOf } from "./signing-acts";
import { sulitGate } from "@/app/_auth/sulit";
import type { StaffActor } from "@/lib/auth/types";
import { CONTACT_NAME_FIELDS, loadContractorAccounts } from "@/lib/project-docs/team-read";
import { ContractorAccountsCard } from "./contractor-accounts-card";
import { openRevision, programmeInForce } from "@/lib/supervision/programme";
import { BRANCH_OPENS } from "@/lib/supervision/records";
import { reResolveReading, resolveSo, soFaults } from "@/lib/supervision/so";
import {
  ACT_WORDS,
  AREA_WORDS,
  BRANCH_OPENS_WORDS,
  BRANCH_WORDS,
  CAUSE_WORDS,
  DEDUCTION_KIND_WORDS,
  DELEGATE_KIND_WORDS,
  DELEGATION_STATE_TONE,
  DELEGATION_STATE_WORDS,
  DELAY_BASIS,
  delayWords,
  ENDORSER_WORDS,
  ENTRY_STATE_TONE,
  ENTRY_STATE_WORDS,
  PARTY_KIND_WORDS,
  PROGRAMME_DECISION_WORDS,
  PROGRAMME_KIND_WORDS,
  RECORDS_SET_WORDS,
  SO_REASON_WORDS,
  START_RULE_WORDS,
  supervisionFaultText,
  VARIANT_WORDS,
} from "@/lib/supervision/labels";
import { COMPLIANCE_AREAS, CONTRACT_PARTY_KINDS, DELEGATE_KINDS, DIARY_ENDORSERS, DIRECTION_CAUSES, EARLY_ACTION_BRANCHES, PROGRAMME_DECISIONS, PROGRAMME_KINDS, SITE_RECORDS_SETS, SUPERVISION_ACTS, type DelegationVariant, type Finding } from "@/lib/supervision/types";

import {
  AttestDrawer,
  DecideProgrammeDrawer,
  DelegationDrawer,
  DiaryEntryDrawer,
  DirectionDrawer,
  DisputeDrawer,
  EarlyActionDrawer,
  EndorseDrawer,
  HandoverDrawer,
  MeetingDrawer,
  ObservationDrawer,
  PartyDrawer,
  PossessionDrawer,
  ProgressDrawer,
  ResolveSoDrawer,
  RetirePartyDrawer,
  RevokeDelegationDrawer,
  ScrutinyDrawer,
  SelfHelpDrawer,
  SubmitProgrammeDrawer,
  type Option,
} from "./supervision-editors";
import { WithHiddenNote } from "./hidden-note";

/**
 * The contract's supervision on screen (6.13 Part A, 4b): the Team tab (the S.O., the representatives and the
 * nominated parties) and the Site tab (possession, the programme and progress, the diary, oversight and the
 * site records). Every reading is the pure rule the act runs; every refusal is said beside its button.
 */

const dim = (t: string) => <span className="text-ink-4">{t}</span>;
const opts = <K extends string>(keys: readonly K[], words: Readonly<Record<K, { en: string }>>): Option[] => keys.map((k) => ({ value: k, label: words[k].en }));
const say = (fs: readonly Finding[]) => (fs.length ? fs.map(supervisionFaultText).join(" ") : null);
const row = "flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6";
const sub = "block text-[12.5px] break-words text-ink-3";
const head = "flex flex-wrap items-center gap-2 text-[13.5px] font-semibold break-words text-ink";
export const DIARY_PAGE = 20;


/// Everything the two tabs read, once.
export async function supervisionView(l: LoadedContract, today: string | null) {
  const c = l.contract;
  const [s, policy, type] = await Promise.all([
    loadSupervision(c.id),
    loadPostAwardPolicy(l.org.id),
    l.ex.contractTypeCode ? db.contractType.findFirst({ where: { organisationId: l.org.id, code: l.ex.contractTypeCode }, select: { nameEn: true, delegationVariant: true, startRequiresSecurities: true } }) : null,
  ]);
  const so = today ? await soOfficeOn(l, s, today) : null;
  const { versions } = baselineRows(c);
  const latest = latestVersion(versions);
  const values = latest ? valuesOf(latest) : null;
  const delay = today ? delayOn(s, { today, dateForCompletion: values?.dateForCompletion ?? null, policyPct: policy?.inDelayProgressPct?.toString() ?? null, status: c.status }) : null;
  return { s, policy, type, so, values, versions: versions.length, delay };
}
export type SupervisionView = Awaited<ReturnType<typeof supervisionView>>;

// ------------------------------------------------------------------ the In Delay reading, tagged ASSUMED (BD-613-12 ruling)


/// The 6.13A residual review: the tag and the basis only on a reading that rests on the straight line.
function DelayTag({ d }: { d: ReturnType<typeof delayWords> }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge tone={d.tone === "neutral" ? undefined : d.tone}>{d.title.en}</Badge>
      {d.assumed && <ProvenanceBadge value="ASSUMED" />}
    </span>
  );
}

function DelayDetail({ d, lead = false }: { d: ReturnType<typeof delayWords>; lead?: boolean }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <span>{lead ? `${d.title.en}. ${d.detail.en}` : d.detail.en}</span>
      {d.assumed && (
        <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
          <ProvenanceBadge value="ASSUMED" />
          {DELAY_BASIS}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ overview: on site

export function OnSiteCard({ l, v }: { l: LoadedContract; v: SupervisionView }) {
  const c = l.contract;
  if (!isExecuted(c.status as ContractStatus)) return null;
  const d = v.delay ? delayWords(v.delay) : null;
  return (
    <Card>
      <CardHeader icon={<BuildingIcon size={17} />} title={<Say words={P.onSite} />} actions={d ? <DelayTag d={d} /> : undefined} />
      <CardBody>
        <KeyValues
          columns={2}
          items={[
            { label: "Superintending Officer", value: v.so ? v.so.office.roleLabel : dim("Not resolved") },
            { label: "Possession of site", value: v.s.possession ? formatDate(day(v.s.possession.possessionOn)) : dim("Not recorded") },
            { label: "Date for completion", value: v.values?.dateForCompletion ? formatDate(v.values.dateForCompletion) : dim("From possession") },
            { label: "In Delay", value: d ? <DelayDetail d={d} /> : dim("Set the organisation's time zone first") },
          ]}
        />
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ Team

export async function TeamPanel({ actor, l, v, people, today }: { actor: StaffActor; l: LoadedContract; v: SupervisionView; people: Option[]; today: string | null }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("SUPERVISION", l.contract.status as ContractStatus);
  const c = l.contract;
  const executed = isExecuted(c.status as ContractStatus);
  const names = new Map(people.map((p) => [p.value, p.label]));
  const nameOf = (id: string) => names.get(id) ?? "someone not active on record";
  // The one-off resolution, previewed from the same rule the act runs.
  let resolve: { office: string | null; blocker: string | null; from: string } | null = null;
  if (executed && v.s.soAssignments.length === 0 && today) {
    // From the Contract Date, on the matrix in force that day (review 1), the same reading the act makes.
    const from = day(c.contractDate)!;
    const issue = await loadIssue(l.org.code, dayToDate(from), undefined, null);
    const value = amountOf(v.values ? senToDecimalString(v.values.contractSum) : c.contractSum.toString());
    const r = issue ? resolveSo(issue.matrix, { contractValue: value, method: await methodKeyOf(l), contractTypeCode: l.ex.contractTypeCode }) : null;
    resolve = !issue ? { office: null, blocker: `No approval matrix was in force on the Contract Date (${formatDate(from)}): the S.O. is resolved from it. Issue one under Configuration › Approval matrix.`, from } : r!.state === "RESOLVED" ? { office: r!.roleLabel, blocker: null, from } : { office: null, blocker: say(soFaults(r!, issue.label)), from };
  }
  const reResolve = reResolveReading(v.policy?.soReResolve ?? null);
  const variant = (v.type?.delegationVariant ?? null) as DelegationVariant | null;
  const forms = !v.policy || !variant ? { letter: null, notice: null } : variant === "CONVENTIONAL" ? { letter: v.policy.delegationLetterConventionalId, notice: v.policy.delegationNoticeConventionalId } : { letter: v.policy.delegationLetterDesignBuildId, notice: v.policy.delegationNoticeDesignBuildId };
  const delegateBlocker = !today
    ? "Set the organisation's time zone first."
    : !executed
      ? "Representatives are delegated once the contract is executed."
      : say(delegationFaults({ kind: "PRINCIPAL", grantorId: "", recorderId: null, delegate: null, competencyConfirmed: true, competencyNote: "x", scope: ["DIARY"] }, { so: v.so?.office ?? null, delegations: delegationFactsOf(v.s), today, variant, typeName: v.type?.nameEn ?? null, forms }).filter((f) => ["NO_SO", "VARIANT_NOT_SET", "FORMS_NOT_SET"].includes(f.code)));
  const partyBlocker = executed ? null : "Record after execution.";
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title={<Say words={P.superintendingOfficer} />}
          actions={resolve ? <ResolveSoDrawer id={c.id} blocker={resolve.blocker} office={resolve.office} from={formatDate(resolve.from)} /> : undefined}
          divided={v.s.soAssignments.length > 0}
        />
        {v.s.soAssignments.length === 0 ? (
          <EmptyState size="sm" title={executed ? "Not resolved" : "Resolved on execution"} />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.s.soAssignments].reverse().map((a) => {
              const current = v.so?.assignment.id === a.id;
              const warnings = Array.isArray(a.warnings) ? (a.warnings as string[]) : [];
              return (
                <li key={a.id} className={row}>
                  <span className="min-w-0">
                    <span className={head}>
                      {a.roleLabel}
                      {current && <Chip tone="ok">In force today</Chip>}
                    </span>
                    <span className={sub}>{`${SO_REASON_WORDS[a.reason].en} · from ${formatDate(day(a.effectiveOn))} · ${a.matrixLabel}: ${a.ruleLabel} (${a.clause}) · at ${formatMoney(senFromDecimal(a.contractValue))}`}</span>
                    {current && v.so && <span className={sub}>{v.so.office.holderIds.length ? `Held today by ${v.so.office.holderIds.map(nameOf).join(", ")}${v.so.office.actingIds.length ? `; acting: ${v.so.office.actingIds.map(nameOf).join(", ")}` : ""}.` : "Nobody holds the office today."}</span>}
                    {warnings.map((t) => (
                      <span key={t} className={sub}>{`Assumed: ${t}`}</span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {v.s.soAssignments.length > 0 && reResolve.state !== "ON" && (
          <CardFooter className="text-[12.5px] text-ink-3">
            {reResolve.state === "NOT_SET" ? (
              <span>
                S.O. change on a band move: not set. <Link href="/configuration/post-award">Settings › Contracts &amp; payments</Link>
              </span>
            ) : (
              <span>S.O. stays as resolved when the sum moves.</span>
            )}
          </CardFooter>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title={<Say words={P.representatives} />}
          subtitle={`Letters: ${variant ? VARIANT_WORDS[variant].en : "not set for this contract type"}.`}
          actions={<DelegationDrawer id={c.id} people={people} kinds={opts(DELEGATE_KINDS, DELEGATE_KIND_WORDS)} acts={opts(SUPERVISION_ACTS, ACT_WORDS)} letters={variant ? VARIANT_WORDS[variant].en : "not set for this contract type"} blocker={delegateBlocker} />}
          divided={v.s.soDelegations.length > 0}
        />
        {v.s.soDelegations.length === 0 ? (
          <EmptyState size="sm" title="No representatives" />
        ) : (
          <ul className="divide-y divide-line/70">
            {v.s.soDelegations.map((d) => {
              const st = today ? delegationState({ letterStatus: d.letterCertificate.status, revokedOn: day(d.revokedOn) }, today) : null;
              return (
                <li key={d.id} className={row}>
                  <span className="min-w-0">
                    <span className={head}>
                      {d.delegateName}
                      <Chip>{DELEGATE_KIND_WORDS[d.kind].en}</Chip>
                      {st && <Badge tone={DELEGATION_STATE_TONE[st] === "neutral" ? undefined : DELEGATION_STATE_TONE[st]}>{DELEGATION_STATE_WORDS[st].en}</Badge>}
                    </span>
                    <span className={sub}>{`Delegated by ${d.grantorName} · recorded ${formatDate(day(d.recordedOn))}${d.revokedOn ? ` · revoked from ${formatDate(day(d.revokedOn))}: ${d.revokeReason}` : ""}`}</span>
                    <span className={sub}>{`Covers: ${d.scope.map((x) => ACT_WORDS[x.act].en).join("; ") || "nothing"}`}</span>
                    <span className={sub}>{`Competency: ${d.competencyNote}`}</span>
                    <span className={sub}>
                      <Link href={`/projects/${c.id}/certificates/${d.letterCertificate.id}`}>{`Letter of delegation${d.letterCertificate.number ? ` ${d.letterCertificate.number}` : ""}`}</Link>
                      {" · "}
                      <Link href={`/projects/${c.id}/certificates/${d.noticeCertificate.id}`}>{`Notification${d.noticeCertificate.number ? ` ${d.noticeCertificate.number}` : ""}`}</Link>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">{!d.revokedOn && <RevokeDelegationDrawer id={c.id} delegationId={d.id} name={d.delegateName} today={today} />}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader icon={<BuildingIcon size={17} />} title={<Say words={P.nominatedParties} />} subtitle="Totals only" actions={<PartyDrawer id={c.id} kinds={opts(CONTRACT_PARTY_KINDS, PARTY_KIND_WORDS)} blocker={partyBlocker} />} divided={v.s.contractParties.length > 0} />
        {v.s.contractParties.length === 0 ? (
          <EmptyState size="sm" title="None recorded" />
        ) : (
          <ul className="divide-y divide-line/70">
            {v.s.contractParties.map((p) => (
              <li key={p.id} className={row}>
                <span className="min-w-0">
                  <span className={head}>
                    {p.name}
                    <Chip>{PARTY_KIND_WORDS[p.kind].en}</Chip>
                    {p.retiredOn && <Badge>Retired</Badge>}
                  </span>
                  <span className={sub}>{[p.sum ? formatMoney(senFromDecimal(p.sum)) : "Sum not stated", p.directPayment == null ? "direct payment not stated" : p.directPayment ? "paid direct" : "not paid direct", p.provenance ? PROVENANCE_WORDS[p.provenance].en.toLowerCase() : null, p.retiredOn ? `retired ${formatDate(day(p.retiredOn))}: ${p.retireReason}` : null].filter(Boolean).join(" · ")}</span>
                  {p.note && <span className={sub}>{p.note}</span>}
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">{!p.retiredOn && <RetirePartyDrawer id={c.id} partyId={p.id} name={p.name} />}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ContractorAccountsCard accounts={await loadContractorAccounts(db, l, actor, (subject) => sulitGate(actor, subject, CONTACT_NAME_FIELDS))} />
    </div>
    </ActGate>
  );
}

// ------------------------------------------------------------------ Site

/// `hidden`: the acts outside the delegated scope of a representative who is signed in, which their screen does not offer (FR-SUP-004, Phase 3d).
export async function SitePanel({ l, v, people, today, page, hidden = [] }: { l: LoadedContract; v: SupervisionView; people: Option[]; today: string | null; page: number; hidden?: readonly HiddenAct[] }) {
  const body = (
    <Sections
      items={[
        { id: "start", label: "Possession and progress", node: <StartSection l={l} v={v} people={people} today={today} hidden={hidden} /> },
        { id: "diary", label: "Site diary", node: <DiarySection l={l} v={v} people={people} today={today} page={page} hidden={hidden} /> },
        { id: "oversight", label: "Oversight", node: <OversightSection l={l} v={v} people={people} today={today} hidden={hidden} /> },
        { id: "records", label: "Site records", node: <RecordsSection l={l} v={v} people={people} today={today} /> },
      ]}
    />
  );
  return <WithHiddenNote hidden={hidden}>{body}</WithHiddenNote>;
}

const zone = (today: string | null) => (today ? null : "Set the organisation's time zone first.");
const possessed = (v: SupervisionView, today: string | null) => zone(today) ?? (v.s.possession ? null : "Possession of site is not recorded yet.");

async function StartSection({ l, v, people, today, hidden }: { l: LoadedContract; v: SupervisionView; people: Option[]; today: string | null; hidden: readonly HiddenAct[] }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("SUPERVISION", l.contract.status as ContractStatus);
  const c = l.contract;
  const executed = isExecuted(c.status as ContractStatus);
  const pos = v.s.possession;
  const startRule = startRuleReading(v.type?.startRequiresSecurities ?? null);
  // C-2 (wave C step C5): computed once, in signing-acts.ts, for this drawer and for the case page's step bar.
  const possessionBlocker = await possessionBlockerOf(l, v, today);
  const revs = revisionsOf(v.s);
  const open = openRevision(revs);
  const inForce = today ? programmeInForce(revs, today) : null;
  const d = v.delay ? delayWords(v.delay) : null;
  const programmeBlocker = zone(today) ?? (!executed ? "Record after execution." : open ? `Revision ${open.revision} is still open: decide it first.` : null);
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<BuildingIcon size={17} />}
          title={<Say words={P.possessionOfSite} />}
          subtitle={`Start of work: ${START_RULE_WORDS[startRule].en.toLowerCase()}`}
          actions={pos ? <Badge tone="ok">Recorded</Badge> : hidden.includes("PRINCIPAL_OR_SO") ? undefined : <PossessionDrawer id={c.id} people={people} today={today} blocker={possessionBlocker} startRule={START_RULE_WORDS[startRule].en.toLowerCase()} />}
        />
        {pos && (
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Date of possession", value: formatDate(day(pos.possessionOn)) },
                { label: "Date for completion", value: v.values?.dateForCompletion ? formatDate(v.values.dateForCompletion) : dim("Not derived") },
                { label: "Recorded for", value: <ActedBy entity="OpeningPosition" id={pos.id} slot="person" name={pos.recordedBy.name} /> },
                { label: "Baseline", value: `Version ${pos.baseline.version ?? "—"}, written with it` },
              ]}
            />
          </CardBody>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader icon={<CalendarIcon size={17} />} title={<Say words={P.programme} />} subtitle={inForce ? `Revision ${inForce.revision} in force` : "No revision approved"} actions={<SubmitProgrammeDrawer id={c.id} kinds={opts(PROGRAMME_KINDS, PROGRAMME_KIND_WORDS)} directions={v.s.programmeDirections.map((x) => ({ value: x.id, label: `${CAUSE_WORDS[x.cause].en}, ${formatDate(day(x.directedOn))}` }))} today={today} blocker={programmeBlocker} />} divided={revs.length > 0} />
        {revs.length === 0 ? (
          <EmptyState size="sm" title="None submitted" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.s.workProgrammes].reverse().map((p) => {
              const r = revs.find((x) => x.id === p.id)!;
              const last = r.points.at(-1);
              return (
                <li key={p.id} className={row}>
                  <span className="min-w-0">
                    <span className={head}>
                      {`Revision ${p.revision} · ${PROGRAMME_KIND_WORDS[p.kind].en}`}
                      {p.decision ? <Badge tone={p.decision === "APPROVED" ? "ok" : "warn"}>{PROGRAMME_DECISION_WORDS[p.decision].en}</Badge> : <Badge tone="info">Open</Badge>}
                      {inForce?.id === p.id && <Chip tone="ok">In force</Chip>}
                    </span>
                    <span className={sub}>{[`submitted ${formatDate(day(p.submittedOn))}`, `${r.points.length} point${r.points.length === 1 ? "" : "s"}${last ? `, ${last.plannedPct}% by ${formatDate(last.day)}` : ""}`, p.direction ? `answers the direction of ${formatDate(day(p.direction.directedOn))}` : null].filter(Boolean).join(" · ")}</span>
                    {p.scrutinisedOn && <span className={sub}>{`Scrutinised ${formatDate(day(p.scrutinisedOn))} by ${p.scrutinisedBy?.name ?? "an officer"}: ${p.reasonable ? "reasonable and realistic" : "not reasonable"}${p.scrutinyNote ? `. ${p.scrutinyNote}` : ""}`}</span>}
                    {p.decidedOn && <span className={sub}>{`${PROGRAMME_DECISION_WORDS[p.decision!].en} ${formatDate(day(p.decidedOn))} by ${p.decidedBy?.name ?? "an officer"}${p.decisionNote ? `: ${p.decisionNote}` : ""}`}</span>}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {!p.decision && !p.scrutinisedOn && !hidden.includes("PROGRAMME_SCRUTINY") && <ScrutinyDrawer id={c.id} programmeId={p.id} revision={p.revision} people={people} today={today} />}
                    {!p.decision && (p.scrutinisedOn ? (hidden.includes("PRINCIPAL_OR_SO") ? null : <DecideProgrammeDrawer id={c.id} programmeId={p.id} revision={p.revision} people={people} today={today} decisions={opts(PROGRAMME_DECISIONS, PROGRAMME_DECISION_WORDS)} />) : <Blocked label="Decide" reason="Scrutinise it first." />)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader icon={<ChartIcon size={17} />} title={<Say words={P.progress} />} subtitle={d ? <DelayDetail d={d} lead /> : "Needs the organisation's time zone."} actions={hidden.includes("PROGRESS") ? undefined : <ProgressDrawer id={c.id} people={people} today={today} blocker={possessed(v, today)} />} divided={v.s.progressRecords.length > 0} />
        {v.s.progressRecords.length === 0 ? (
          <EmptyState size="sm" title="None recorded" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.s.progressRecords].reverse().slice(0, 12).map((p) => (
              <li key={p.id} className={row}>
                <span className="min-w-0">
                  <span className={head}>{`${p.actualPct.toString()}% on ${formatDate(day(p.day))}`}</span>
                  <span className={sub}>{[`recorded for ${p.recordedBy.name}`, p.note || null].filter(Boolean).join(" · ")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {v.s.progressRecords.length > 12 && <CardFooter className="text-[12.5px] text-ink-3">{`The latest 12 of ${v.s.progressRecords.length}. Every record is on the History tab.`}</CardFooter>}
      </Card>
    </div>
    </ActGate>
  );
}

function DiarySection({ l, v, people, today, page, hidden }: { l: LoadedContract; v: SupervisionView; people: Option[]; today: string | null; page: number; hidden: readonly HiddenAct[] }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("SUPERVISION", l.contract.status as ContractStatus);
  const c = l.contract;
  const entries = [...v.s.siteDiaryEntries].reverse();
  const pages = Math.max(1, Math.ceil(entries.length / DIARY_PAGE));
  const p = Math.min(page, pages - 1);
  const shown = entries.slice(p * DIARY_PAGE, (p + 1) * DIARY_PAGE);
  const missing = today ? missingDays(day(v.s.possession?.possessionOn), today, new Set(v.s.siteDiaryEntries.map((e) => storedDay(e.day))), 14) : { days: [], count: 0 };
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      {missing.count > 0 && (
        <Callout tone="warn" title={`${missing.count} day${missing.count === 1 ? "" : "s"} since possession with no diary entry`}>
          {`${missing.days.map((x) => formatDate(x)).join(", ")}${missing.count > missing.days.length ? ", and more" : ""}.`}
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader icon={<ClipboardIcon size={17} />} title={<Say words={P.siteDiary} />} actions={hidden.includes("DIARY") ? undefined : <DiaryEntryDrawer id={c.id} people={people} today={today} blocker={possessed(v, today)} />} divided={entries.length > 0} />
        {entries.length === 0 ? (
          <EmptyState size="sm" title="No entries" />
        ) : (
          <ul className="divide-y divide-line/70">
            {shown.map((e) => {
              const st = entryState({ officerAttestedOn: day(e.officerAttestedOn), agentAttestedOn: day(e.agentAttestedOn), disagreement: e.disagreement });
              const label = `The diary for ${formatDate(day(e.day))}`;
              return (
                <li key={e.id} className={row}>
                  <span className="min-w-0">
                    <span className={head}>
                      {formatDate(day(e.day))}
                      <Badge tone={ENTRY_STATE_TONE[st] === "neutral" ? undefined : ENTRY_STATE_TONE[st]}>{ENTRY_STATE_WORDS[st].en}</Badge>
                      {e.backdatedReason && <Chip tone="warn">{`Written ${formatDate(day(e.recordedOn))}`}</Chip>}
                    </span>
                    <span className={sub}>{[e.officer.name, e.weather || null, e.agentName ? `agent ${e.agentName}${e.agentAttestedBySupplierAccountId ? " (signed from the supplier portal)" : e.agentAttestedOn ? " (recorded from paper, not signed)" : ""}` : null].filter(Boolean).join(" · ")}</span>
                    <span className="block text-[13px] break-words whitespace-pre-line text-ink-2">{e.entry}</span>
                    {e.backdatedReason && <span className={sub}>{`Not written on the day: ${e.backdatedReason}`}</span>}
                    {e.disagreement && <span className={sub}>{`Disagreement, escalated ${formatDate(day(e.escalatedOn))}: ${e.disagreement}`}</span>}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {!e.officerAttestedOn && <AttestDrawer id={c.id} entryId={e.id} label={label} who="OFFICER" today={today} />}
                    {!e.agentAttestedOn && <AttestDrawer id={c.id} entryId={e.id} label={label} who="AGENT" today={today} />}
                    {!e.disagreement && <DisputeDrawer id={c.id} entryId={e.id} label={label} />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {pages > 1 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span>{`Entries ${p * DIARY_PAGE + 1}–${Math.min(entries.length, (p + 1) * DIARY_PAGE)} of ${entries.length}.`}</span>
            <span className="flex gap-2">
              {p > 0 && <ButtonLink href={`/projects/${c.id}?tab=site&section=diary&page=${p - 1}`} size="sm" variant="ghost">Newer</ButtonLink>}
              {p + 1 < pages && <ButtonLink href={`/projects/${c.id}?tab=site&section=diary&page=${p + 1}`} size="sm" variant="ghost">Older</ButtonLink>}
            </span>
          </CardFooter>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<ClipboardIcon size={17} />} title={<Say words={P.endorsements} />} subtitle={<InfoChip outline detail="A superior officer is recorded as named: the reporting line is not checked.">Not checked</InfoChip>} actions={<EndorseDrawer id={c.id} people={people} roles={opts(DIARY_ENDORSERS, ENDORSER_WORDS)} today={today} blocker={possessed(v, today)} />} divided={v.s.diaryEndorsements.length > 0} />
        {v.s.diaryEndorsements.length === 0 ? (
          <EmptyState size="sm" title="None recorded" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.s.diaryEndorsements].reverse().map((x) => (
              <li key={x.id} className={row}>
                <span className="min-w-0">
                  <span className={head}>{`${ENDORSER_WORDS[x.role].en}: ${x.person.name}`}</span>
                  <span className={sub}>{`Visited ${formatDate(day(x.visitedOn))} · covers ${formatDate(day(x.coversFrom))} to ${formatDate(day(x.coversTo))}${x.note ? ` · ${x.note}` : ""}`}</span>
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

function OversightSection({ l, v, people, today, hidden }: { l: LoadedContract; v: SupervisionView; people: Option[]; today: string | null; hidden: readonly HiddenAct[] }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("SUPERVISION", l.contract.status as ContractStatus);
  const c = l.contract;
  const inDelay = v.delay?.state === "IN_DELAY";
  const policies = c.policies.map((p) => ({ value: p.id, label: `${INSURANCE_KIND_LABEL[p.kind]}${p.policyNo ? ` · ${p.policyNo}` : ""}` }));
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader icon={<UsersIcon size={17} />} title={<Say words={P.specialSiteMeetings} />} actions={hidden.includes("SO_ONLY") ? undefined : <MeetingDrawer id={c.id} people={people} today={today} blocker={zone(today) ?? (inDelay ? null : "Not In Delay today.")} />} divided={v.s.siteMeetings.length > 0} />
        {v.s.siteMeetings.length === 0 ? (
          <EmptyState size="sm" title="None recorded" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.s.siteMeetings].reverse().map((m) => (
              <li key={m.id} className={row}>
                <span className="min-w-0">
                  <span className={head}>{`${formatDate(day(m.heldOn))}, chaired by ${m.chair.name}`}</span>
                  <span className={sub}>{`Attended by ${m.attendees.join(", ")}`}</span>
                  <span className="block text-[13px] break-words whitespace-pre-line text-ink-2">{m.minutes}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<AlertTriangle size={17} />} title={<Say words={P.complianceObservations} />} actions={hidden.includes("OBSERVATION") ? undefined : <ObservationDrawer id={c.id} people={people} areas={opts(COMPLIANCE_AREAS, AREA_WORDS)} today={today} blocker={possessed(v, today)} />} divided={v.s.complianceObservations.length > 0} />
        {v.s.complianceObservations.length === 0 ? (
          <EmptyState size="sm" title="None recorded" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.s.complianceObservations].reverse().map((o) => (
              <li key={o.id} className={row}>
                <span className="min-w-0">
                  <span className={head}>
                    {AREA_WORDS[o.area].en}
                    <span className="font-normal text-ink-3">{formatDate(day(o.observedOn))}</span>
                  </span>
                  <span className={sub}>{`${o.person.name}: ${o.note}`}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<CalendarIcon size={17} />} title={<Say words={P.directionsOnProgramme} />} actions={hidden.includes("PRINCIPAL_OR_SO") ? undefined : <DirectionDrawer id={c.id} people={people} causes={opts(DIRECTION_CAUSES.filter((x) => x !== "VARIATION"), CAUSE_WORDS)} today={today} blocker={possessed(v, today)} />} divided={v.s.programmeDirections.length > 0} />
        {v.s.programmeDirections.length === 0 ? (
          <EmptyState size="sm" title="None recorded" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.s.programmeDirections].reverse().map((x) => {
              const answered = v.s.workProgrammes.find((p) => p.directionId === x.id);
              return (
                <li key={x.id} className={row}>
                  <span className="min-w-0">
                    <span className={head}>
                      {CAUSE_WORDS[x.cause].en}
                      {answered ? <Chip tone="ok">{`Answered by revision ${answered.revision}`}</Chip> : <Chip tone="warn">Awaiting a revised programme</Chip>}
                    </span>
                    <span className={sub}>{`${formatDate(day(x.directedOn))} · ${x.person.name}: ${x.note}`}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<FileIcon size={17} />} title={<Say words={P.earlyAction} />} actions={hidden.includes("SO_ONLY") ? undefined : <EarlyActionDrawer id={c.id} people={people} branches={opts(EARLY_ACTION_BRANCHES, BRANCH_WORDS)} today={today} blocker={possessed(v, today)} />} divided={v.s.earlyActionDecisions.length > 0} />
        {v.s.earlyActionDecisions.length === 0 ? (
          <EmptyState size="sm" title="None recorded" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.s.earlyActionDecisions].reverse().map((x) => (
              <li key={x.id} className={row}>
                <span className="min-w-0">
                  <span className={head}>{`${formatDate(day(x.decidedOn))}, by ${x.person.name}`}</span>
                  {x.branches.map((b) => (
                    <span key={b} className={sub}>{`${BRANCH_WORDS[b].en}: ${BRANCH_OPENS_WORDS[BRANCH_OPENS[b]].en}.`}</span>
                  ))}
                  <span className={sub}>{`Why: ${x.reason}`}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title={<Say words={P.premiumsPaid} />} actions={hidden.includes("SO_ONLY") ? undefined : <SelfHelpDrawer id={c.id} people={people} policies={policies} today={today} blocker={zone(today) ?? (policies.length ? null : "No insurance policy is on this contract.")} />} divided={v.s.pendingDeductions.length > 0} />
        {v.s.pendingDeductions.length === 0 ? (
          <EmptyState size="sm" title="None recorded" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.s.pendingDeductions].reverse().map((x) => (
              <li key={x.id} className={row}>
                <span className="min-w-0">
                  <span className={head}>
                    {formatMoney(senFromDecimal(x.amount))}
                    {(() => {
                      // 6.13 Part A step 3: a premium is taken by the certificate its valuation raised; a void one frees it again.
                      const status = x.valuation?.certificate?.status ?? null;
                      if (!status || status === "VOID") return <Chip tone="warn">Awaiting the next interim certificate</Chip>;
                      if (status === "ISSUED") return <Chip tone="ok">{`Deducted on interim certificate ${x.valuation?.certificate?.number ?? ""}`.trim()}</Chip>;
                      return <Chip tone="info">On an interim certificate not yet issued</Chip>;
                    })()}
                  </span>
                  <span className={sub}>{[DEDUCTION_KIND_WORDS[x.kind].en, x.policy ? `${INSURANCE_KIND_LABEL[x.policy.kind]}${x.policy.policyNo ? ` ${x.policy.policyNo}` : ""}` : null, `paid ${formatDate(day(x.paidOn))}`, x.extendedTo ? `cover to ${formatDate(day(x.extendedTo))}` : null, `decided by ${x.person.name}`].filter(Boolean).join(" · ")}</span>
                  <span className={sub}>{x.note}</span>
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

function RecordsSection({ l, v, people, today }: { l: LoadedContract; v: SupervisionView; people: Option[]; today: string | null }) {
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("SUPERVISION", l.contract.status as ContractStatus);
  const c = l.contract;
  const live = (set: "PIPE_LOG" | "AS_BUILT") => liveOf(c, set).length;
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      <OwnerAttachments owner={{ kind: "contract", id: c.id }} title="Site records" only={["PROGRAMME", "DIARY_PHOTO", "PIPE_LOG", "AS_BUILT"]} />
      <Card className="overflow-hidden">
        <CardHeader icon={<FileIcon size={17} />} title={<Say words={P.handedOver} />} subtitle={`Live now: ${SITE_RECORDS_SETS.map((s) => `${RECORDS_SET_WORDS[s].en.toLowerCase()} ${live(s)}`).join(", ")}.`} actions={<HandoverDrawer id={c.id} people={people} sets={opts(SITE_RECORDS_SETS, RECORDS_SET_WORDS)} today={today} blocker={possessed(v, today)} />} divided={v.s.siteRecordsHandovers.length > 0} />
        {v.s.siteRecordsHandovers.length === 0 ? (
          <EmptyState size="sm" title="None handed over" />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.s.siteRecordsHandovers].reverse().map((h) => {
              const pinned = Array.isArray(h.pinnedVersions) ? (h.pinnedVersions as { title: string; versionNo: number }[]) : [];
              return (
                <li key={h.id} className={row}>
                  <span className="min-w-0">
                    <span className={head}>{`${RECORDS_SET_WORDS[h.recordsSet].en}, ${formatDate(day(h.handedOverOn))}`}</span>
                    <span className={sub}>{`To ${h.toLabel}, received by ${h.receivedByName}; handed over by ${h.person.name}`}</span>
                    <span className={sub}>{pinned.map((x) => `${x.title} v${x.versionNo}`).join("; ")}</span>
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
