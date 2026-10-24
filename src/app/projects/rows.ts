import type { Row } from "@/components/data-list";
import { awardChips, CASE_ENDED_TONE, CASE_ENDED_WORDS, standingWords } from "@/lib/contract/case-list-words";
import type { CaseRow } from "@/lib/contract/case-load";
import { PHASE_TONE, PHASE_WORDS } from "@/lib/contract/labels";
import { endedKind, phaseKind, primaryCaseStatus, type StatusCandidate } from "@/lib/contract/case-status";
import { caseHref } from "@/lib/contract/links";
import type { ContractPhase } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { indentExpiryRaised, indentState } from "@/lib/award/indent";
import { AWARD_STATUS_TONE } from "@/lib/award/labels";
import type { loadAwardPolicy } from "@/lib/award/repo";
import { returnReadsComplete } from "@/lib/award/stage-two";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { isLive } from "@/lib/documents/evidence";
import { dayOrNull as day, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { senFromDecimal } from "@/lib/money";
import { CASES_LIST_WORDS as L, AWARD_STATUS_WORDS, INSTRUMENT_SHORT_WORDS } from "@/lib/contract/case-page-words";
import type { Words } from "@/lib/contract/labels";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";

/**
 * The Projects list's rows, built once for the page and for the export route (7.6). No column of a project is SULIT (the contract sum is not), so `forExport`
 * changes nothing here; it is taken so the export route calls every list's builder the same way.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- no SULIT column: the export builds the same rows
export function buildCaseRows(rows: readonly CaseRow[], cx: RowContext, _opts: { forExport: boolean }): Row[] {
  return rows.map((r) => caseRow(r, cx));
}

export interface RowContext {
  derived: Map<string, ContractPhase>;
  inDelay: Set<string>;
  policy: Awaited<ReturnType<typeof loadAwardPolicy>> | null;
  today: string | null;
  lang: Language;
}

type Tone = "brand" | "info" | "ok" | "warn" | "err";
const toneOf = (t: string): { tone?: Tone } => (t === "neutral" ? {} : { tone: t as Tone });

const strip = ({ text, tone, provenance }: StatusCandidate) => ({ text, ...(tone ? { tone } : {}), ...(provenance ? { provenance } : {}) });

/// One case as a row. A row held back to its contract stages (AC-18) has no `award`, so it carries the contract's columns alone.
function caseRow(r: CaseRow, cx: RowContext): Row {
  const lang = cx.lang;
  const t = (words: Words) => say(words, lang);
  const c = r.contract;
  const a = r.award;
  const title = a ? a.exercise.title : c!.award.exercise.title;
  const awardee = a ? a.awardeeName : c!.award.awardeeName;
  const reference = a ? a.reference : c!.award.reference;
  const status = c ? (c.status as ContractStatus) : null;
  const phase: ContractPhase | null = c && status ? (cx.derived.get(c.id) ?? (status as ContractPhase)) : null;
  const ended = r.standing.kind === "ENDED" ? r.standing.ended : null;
  const stageWords = t(standingWords(r.standing));
  const kind = a ? (a.instrumentKind as InstrumentKind) : null;

  // The status chips: the contract's phase (or the award's status before there is one), In Delay, then the awards list's own.
  const chips: StatusCandidate[] = [];
  if (ended) chips.push({ kind: endedKind(ended), text: t(CASE_ENDED_WORDS[ended]), ...toneOf(CASE_ENDED_TONE[ended]) });
  else if (phase) chips.push({ kind: phaseKind(phase), text: t(PHASE_WORDS[phase]), ...toneOf(PHASE_TONE[phase]) });
  else if (a) chips.push({ kind: "LIFECYCLE", text: t(AWARD_STATUS_WORDS[a.status as AwardStatus]), ...toneOf(AWARD_STATUS_TONE[a.status as AwardStatus]) });
  if (c && cx.inDelay.has(c.id)) chips.push({ kind: "IN_DELAY", text: t(L.inDelay), tone: "err" });
  if (a && kind && !ended) {
    const awardStatus = a.status as AwardStatus;
    // OD-5: before acceptance counted with its scans; an accepted award is not re-judged.
    const scanned = new Set(a.attachments.filter(isLive).map((x) => x.purpose as string));
    const ret = a.awardReturn;
    const back = ret ? returnReadsComplete(a.status, kind, { ...ret, signedLetterReceivedOn: day(ret.signedLetterReceivedOn), declarationReceivedOn: day(ret.declarationReceivedOn), authorisationReceivedOn: day(ret.authorisationReceivedOn) }, scanned) : false;
    const indent = kind === "WORK_INDENT" && cx.today ? indentState(day(a.indentReceivedOn), cx.policy?.indentValidityDays ?? null, cx.today) : null;
    const held = [...(a.contract?.securities ?? []), ...(a.contract?.policies ?? [])];
    chips.push(...awardChips({ status: awardStatus, returned: back, toVerify: held.filter((x) => x.status === "LODGED").length, registered: held.length, hasCommitmentNo: !!a.erpCommitmentNo, indentExpired: indentExpiryRaised(indent, day(a.commencedOn), awardStatus) }, lang));
  }

  // Founder, 2026-10-20: one status per row; the others sit behind "+N".
  const { primary, others } = primaryCaseStatus(chips);
  const money = c ? senFromDecimal(c.contractSum) : a ? senFromDecimal(a.awardedValue) : 0n;
  const completion = c?.dateForCompletion ?? null;
  return {
    id: r.contractId ?? r.awardId,
    search: [title, c?.number ?? "", awardee, reference, stageWords, ...chips.map((x) => x.text)].join(" "),
    sortKeys: { contract: title },
    cells: {
      contract: { kind: "link", text: title, href: caseHref({ awardId: r.awardId, contractId: r.contractId }), sub: c ? sayWith(L.contractNumber, lang, { number: c.number }) : sayWith(L.noContractYet, lang, { reference }) },
      contractor: { kind: "text", text: awardee },
      // Money in sen, shown and sorted exactly by the list (never a float).
      sum: { kind: "money", sen: money.toString() },
      phase: primary ? { kind: "status", main: strip(primary), others: others.map(strip) } : { kind: "chips", items: [] },
      dates: c
        ? { kind: "stack", title: c.contractDate ? sayWith(L.contractDate, lang, { date: formatDate(storedDay(c.contractDate), lang) }) : t(L.notSigned), sub: completion ? sayWith(L.completion, lang, { date: formatDate(storedDay(completion), lang) }) : t(L.completionNotSet) }
        : { kind: "stack", title: kind ? t(INSTRUMENT_SHORT_WORDS[kind]) : t(L.instrument), sub: t(L.contractNotNumbered) },
    },
  };
}
