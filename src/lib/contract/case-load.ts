/**
 * Finding a case and listing cases (Award and Contract Requirements v2, C-1; design note 0004 section 6.1; ADR 0037 F0-7, F0-8, F0-9).
 *
 * A case is one Award with the Contract issued from it, once there is one. This file reads the database only: it logs nothing and
 * imports nothing from `src/app`. The check that logs a refusal (`loadCase`) is the app layer's, in `src/app/_auth/case.ts`.
 *
 * - `resolveCase` takes the id on the address and says what it is: a contract id first, then an award id.
 * - `listCases` is `Award` LEFT JOIN `Contract`, one row per award, ordered by the award's creation (newest first, then id), so a
 *   page holds the same rows whether a case has its contract yet or not. Every count and view is `CASE_STAGE_WHERE` joined to
 *   `caseVisibilityWhere` by AND, the same fragments the dashboard's Contracts card counts (`casePipelineWhere`), so the two agree.
 * - A case from a restricted exercise that the reader is not named on, once issued (CONTRACT_STAGES_ONLY, AC-18), is listed with
 *   only the columns `listContracts` shows today: its `award` is null, with no chips and no award facts.
 * - `pending`, `approved`, `return`, `commitment` and `expired` are the old Awards list's organisation-wide work views (`case-work-views.ts`),
 *   counted and paged in the database; they leave out restricted exercises the reader is not named on, whole.
 * - `delay` and `commenced` are the Projects page's two sets, judged over the whole organisation by the same readers and then
 *   keyed to the award of each contract, never to a page.
 */

import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { AWARD_LIST_CONTRACT_SELECT, AWARD_LIST_INCLUDE_BASE, loadAwardPolicy } from "@/lib/award/repo";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";
import { inDelayContractIds } from "@/lib/supervision/load";
import { commencedPendingAll } from "@/lib/variation/view";

import { CASE_STAGE_WHERE, caseStage, type CaseStage, type CaseStanding } from "./case-stage";
import { caseVisibility, caseVisibilityWhere, type CaseVisibility } from "./case-visibility";
import { CASE_WORK_VIEWS, caseWorkWhere, type CaseWorkView } from "./case-work-views";
import { CONTRACT_LIST_SELECT, CONTRACT_PAGE, withCompletion } from "./load";
import type { ContractStatus } from "./types";

export { DERIVE_CAP } from "./load";

// ------------------------------------------------------------------ resolving an id

export type ResolvedCase =
  | { kind: "CONTRACT"; contractId: string; awardId: string; exerciseId: string }
  | { kind: "AWARD_ONLY"; awardId: string; exerciseId: string }
  /** An award id whose contract exists: the page redirects to the contract's address (or refuses, F0-3). */
  | { kind: "AWARD_WITH_CONTRACT"; awardId: string; contractId: string; exerciseId: string }
  | { kind: "NOT_FOUND" };

/// What `id` is within the organisation: a contract id first, then an award id. Another organisation's id is NOT_FOUND.
export async function resolveCase(organisationId: string, id: string, client: Tx = db): Promise<ResolvedCase> {
  const contract = await client.contract.findFirst({ where: { id, organisationId }, select: { id: true, awardId: true, award: { select: { exerciseId: true } } } });
  if (contract) return { kind: "CONTRACT", contractId: contract.id, awardId: contract.awardId, exerciseId: contract.award.exerciseId };
  const award = await client.award.findFirst({ where: { id, organisationId }, select: { id: true, exerciseId: true, contract: { select: { id: true } } } });
  if (!award) return { kind: "NOT_FOUND" };
  return award.contract
    ? { kind: "AWARD_WITH_CONTRACT", awardId: award.id, contractId: award.contract.id, exerciseId: award.exerciseId }
    : { kind: "AWARD_ONLY", awardId: award.id, exerciseId: award.exerciseId };
}

// ------------------------------------------------------------------ the list

export type CaseListView = Lowercase<CaseStage> | "ended" | CaseWorkView | "delay" | "commenced" | "securities" | "submissions";
/// The two wave G views stay their own readers (F0-8); the row views are the ones `listCases` pages.
export type CaseRowView = Exclude<CaseListView, "securities" | "submissions">;

const ROW_VIEWS: readonly CaseRowView[] = ["awarding", "signing", "on_site", "completed", "closed", "ended", ...CASE_WORK_VIEWS, "delay", "commenced"];
const LIST_VIEWS: readonly CaseListView[] = [...ROW_VIEWS, "securities", "submissions"];

/// An unknown or absent view is undefined, meaning "all".
export function parseCaseListView(v: string | undefined): CaseListView | undefined {
  return LIST_VIEWS.find((x) => x === v);
}

type ContractListRow = Prisma.ContractGetPayload<{ select: typeof CONTRACT_LIST_SELECT }> & { dateForCompletion: Date | null };
/// Exactly the columns `listContracts` returns for a contract today.
export type ContractListColumns = ContractListRow;
/// The awards list's columns and chips for the award.
export type AwardListColumns = Prisma.AwardGetPayload<{ include: typeof AWARD_LIST_INCLUDE_BASE & { contract: { select: typeof AWARD_LIST_CONTRACT_SELECT } } }>;

export interface CaseRow {
  awardId: string;
  contractId: string | null;
  standing: CaseStanding;
  visibility: Exclude<CaseVisibility, "HIDDEN">;
  contract: ContractListColumns | null;
  /** Null under CONTRACT_STAGES_ONLY: no awards-list chips and no award facts (AC-18). */
  award: AwardListColumns | null;
}

export interface CasePage {
  rows: CaseRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<CaseRowView | "all", number>;
  /// Whether the organisation has set how long an indent is valid: without it the "expired" view cannot be judged, and says so rather than showing zero.
  indentRuleSet: boolean;
}

export const CASE_PAGE = CONTRACT_PAGE;

const EMPTY_COUNTS: CasePage["counts"] = { all: 0, awarding: 0, signing: 0, on_site: 0, completed: 0, closed: 0, ended: 0, pending: 0, approved: 0, return: 0, commitment: 0, expired: 0, delay: 0, commenced: 0 };

/// The page of cases. `hidden` is `hiddenExercises(actor)`, passed by the caller as `casePipelineWhere`'s is. Ordered by the award's
/// creation (newest first), then id. `page` is zero-based.
export async function listCases(organisationId: string, hidden: readonly string[], q: { view?: CaseRowView; page?: number; delayIds?: readonly string[]; commencedContractIds?: readonly string[] } = {}): Promise<CasePage> {
  const page = Math.max(0, q.page ?? 0);
  const org = await exerciseOrg(organisationId);
  if (!org) return { rows: [], total: 0, page, pageSize: CASE_PAGE, counts: { ...EMPTY_COUNTS }, indentRuleSet: false };

  // The two sets the Projects page judges over the whole organisation, then keys to awards (AC-17: re-keyed, not re-judged).
  // A caller that has already judged them (the Projects page does, for its own cards) passes them, so a load judges every possessed contract once.
  const [delay, commenced] = await Promise.all([
    q.delayIds ? Promise.resolve([...q.delayIds]) : org.today ? inDelayContractIds(org.id, org.today).then((d) => d.ids) : Promise.resolve<string[]>([]),
    q.commencedContractIds ? Promise.resolve([...q.commencedContractIds]) : commencedPendingAll(org.id).then((vs) => [...new Set(vs.map((v) => v.contract.id))]),
  ]);
  const byContracts = (ids: string[]): Prisma.AwardWhereInput => ({ contract: { is: { id: { in: ids } } } });
  // The award-work views are about the award itself (its approval, return and commitment number), so a restricted case the reader sees as contract stages only is
  // left out of them and of their counts (AC-18): they leave out every hidden-or-restricted exercise.
  const policy = await loadAwardPolicy(org.id);
  const work = caseWorkWhere(policy.indentValidityDays, org.today);
  const awardSide: Prisma.AwardWhereInput = hidden.length ? { exerciseId: { notIn: [...hidden] } } : {};
  const workWhere = Object.fromEntries(CASE_WORK_VIEWS.map((k) => [k, { AND: [awardSide, work[k] ?? { id: { in: [] } }] }])) as Record<CaseWorkView, Prisma.AwardWhereInput>;
  const viewWhere: Record<CaseRowView | "all", Prisma.AwardWhereInput> = {
    all: {},
    awarding: CASE_STAGE_WHERE.AWARDING, signing: CASE_STAGE_WHERE.SIGNING, on_site: CASE_STAGE_WHERE.ON_SITE,
    completed: CASE_STAGE_WHERE.COMPLETED, closed: CASE_STAGE_WHERE.CLOSED, ended: CASE_STAGE_WHERE.ENDED,
    ...workWhere,
    delay: byContracts(delay), commenced: byContracts(commenced),
  };
  // Fragments carry a top-level OR or AND, so they are joined by AND and never spread (case-visibility.ts).
  const whereOf = (v: CaseRowView | "all"): Prisma.AwardWhereInput => ({ organisationId: org.id, AND: [caseVisibilityWhere(hidden), viewWhere[v]] });

  const keys = Object.keys(EMPTY_COUNTS) as (CaseRowView | "all")[];
  const view = q.view ?? "all";
  const [countList, found] = await Promise.all([
    Promise.all(keys.map((k) => db.award.count({ where: whereOf(k) }))),
    db.award.findMany({
      where: whereOf(view),
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: page * CASE_PAGE,
      take: CASE_PAGE,
      include: { ...AWARD_LIST_INCLUDE_BASE, contract: { select: { ...CONTRACT_LIST_SELECT, ...AWARD_LIST_CONTRACT_SELECT } } },
    }),
  ]);
  const counts = Object.fromEntries(keys.map((k, i) => [k, countList[i]])) as CasePage["counts"];

  const rows: CaseRow[] = found.map((a) => {
    const { contract: c, ...awardOnly } = a;
    // `hidden` here is a restricted exercise the reader is not named on, kept by the where only because its contract exists.
    const visibility = caseVisibility({ restricted: hidden.includes(a.exerciseId), actorNamed: false, system: false, issued: !!c });
    if (visibility === "HIDDEN") throw new Error("A hidden case reached the list: caseVisibilityWhere and caseVisibility disagree");
    const standing = caseStage({
      award: { status: a.status as AwardStatus, instrumentKind: a.instrumentKind as InstrumentKind },
      contract: c ? { status: c.status as ContractStatus } : null,
      commencement: { commencedOn: a.commencedOn ? storedDay(a.commencedOn) : null },
    });
    let contract: ContractListColumns | null = null;
    if (c) {
      const { securities, policies, ...columns } = c;
      contract = withCompletion([columns], org.today)[0];
      if (visibility === "WHOLE") return { awardId: a.id, contractId: c.id, standing, visibility, contract, award: { ...awardOnly, contract: { number: c.number, securities, policies } } };
    }
    return { awardId: a.id, contractId: c?.id ?? null, standing, visibility, contract, award: visibility === "WHOLE" ? { ...awardOnly, contract: null } : null };
  });
  return { rows, total: counts[view], page, pageSize: CASE_PAGE, counts, indentRuleSet: policy.indentValidityDays != null };
}
