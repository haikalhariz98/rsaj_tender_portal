import { exerciseNotHidden, hiddenExerciseIds, type Viewer } from "@/lib/auth/sulit-store";
import { caseVisibilityWhere } from "@/lib/contract/case-visibility";
import type { Tx } from "@/lib/db";
import { listHref, listOrderBy, parseListQuery } from "@/lib/list-query";

import { assembleCaseGroup } from "./case-group";
import { exerciseHit, projectHit, requisitionHit, sittingHit, supplierHit } from "./hits";
import { rankHits } from "./rank";
import { SEARCH_GROUP_LABEL, SEARCH_GROUP_SIZE, type CaseGroup, type SearchGroup, type SearchGroupEntity, type SearchHit, type SearchResult } from "./types";
import { exactKeyWhere, wordsWhere } from "./words";

/**
 * Global search (ADR 0044 D3, D4; plan 7.2). Every read is scoped by the viewer's organisation. A restricted exercise the viewer is not
 * named on is neither shown nor counted, and a project is not found through its hidden exercise's words (AC-18). Only identifiers,
 * titles and status are selected: no SULIT value, so a search writes no access event. The search text is never logged (ST-18).
 */

const LIST_PATH: Readonly<Record<SearchGroupEntity, string>> = { requisition: "/requisitions", exercise: "/sourcing", project: "/projects", supplier: "/suppliers", sitting: "/committees" };
const NEWEST = { sort: null, dir: "desc" } as const;
const OLDEST_FIRST = [{ createdAt: "asc" }, { id: "asc" }] as const;

/// One group's hits: exact case-key hits first, then the newest of the rest, at most SEARCH_GROUP_SIZE; the total under the same where.
async function groupOf<R extends { id: string }>(
  entity: SearchGroupEntity,
  q: string,
  read: { newest: () => Promise<R[]>; exact: (() => Promise<R[]>) | null; total: () => Promise<number>; hit: (r: R, exact: boolean) => SearchHit },
): Promise<{ group: SearchGroup; exact: R[] }> {
  const [newest, exact, total] = await Promise.all([read.newest(), read.exact?.() ?? Promise.resolve([] as R[]), read.total()]);
  const exactIds = new Set(exact.map((r) => r.id));
  const hits = rankHits([...exact.map((r) => read.hit(r, true)), ...newest.filter((r) => !exactIds.has(r.id)).map((r) => read.hit(r, false))]).slice(0, SEARCH_GROUP_SIZE);
  return { group: { entity, label: SEARCH_GROUP_LABEL[entity], hits, total: Math.max(total, hits.length), seeAllHref: listHref(LIST_PATH[entity], { q }) }, exact };
}

export async function search(client: Tx, viewer: Viewer, text: string): Promise<SearchResult> {
  const { q, words } = parseListQuery({ q: text }, []);
  if (!q) return { q: text.trim(), caseGroup: null, groups: [] };
  const organisationId = viewer.organisationId;
  const hidden = await hiddenExerciseIds(client, viewer);
  const take = SEARCH_GROUP_SIZE;

  const reqScope = { organisationId };
  const exScope = { AND: [{ organisationId }, exerciseNotHidden(hidden)] };
  const projScope = { AND: [{ organisationId }, caseVisibilityWhere(hidden)] };
  const supScope = { organisationId };
  const sitScope = { committee: { organisationId } };
  const reqWords = { AND: [reqScope, wordsWhere("requisition", words)] };
  const exWords = { AND: [exScope, wordsWhere("exercise", words)] };
  const projWords = { AND: [projScope, wordsWhere("project", words, hidden)] };
  const supWords = { AND: [supScope, wordsWhere("supplier", words)] };
  const sitWords = { AND: [sitScope, wordsWhere("sitting", words)] };

  const reqSelect = { id: true, reference: true, title: true, status: true, erpRequisitionNo: true } as const;
  const exSelect = { id: true, reference: true, title: true, status: true, requisitionId: true } as const;
  const projSelect = { id: true, reference: true, status: true, exerciseId: true, contract: { select: { number: true, status: true } }, exercise: { select: { requisitionId: true } } } as const;

  const [req, ex, proj, sup, sit] = await Promise.all([
    groupOf("requisition", q, {
      newest: () => client.requisition.findMany({ where: reqWords, orderBy: listOrderBy("requisition", NEWEST), take, select: reqSelect }),
      exact: () => client.requisition.findMany({ where: { AND: [reqScope, exactKeyWhere("requisition", q)!] }, take, select: reqSelect }),
      total: () => client.requisition.count({ where: reqWords }),
      hit: requisitionHit,
    }),
    groupOf("exercise", q, {
      newest: () => client.sourcingExercise.findMany({ where: exWords, orderBy: listOrderBy("exercise", NEWEST), take, select: exSelect }),
      exact: () => client.sourcingExercise.findMany({ where: { AND: [exScope, exactKeyWhere("exercise", q)!] }, take, select: exSelect }),
      total: () => client.sourcingExercise.count({ where: exWords }),
      hit: exerciseHit,
    }),
    groupOf("project", q, {
      newest: () => client.award.findMany({ where: projWords, orderBy: listOrderBy("project", NEWEST), take, select: projSelect }),
      exact: () => client.award.findMany({ where: { AND: [projScope, exactKeyWhere("project", q)!] }, take, select: projSelect }),
      total: () => client.award.count({ where: projWords }),
      hit: projectHit,
    }),
    groupOf("supplier", q, {
      newest: () => client.supplier.findMany({ where: supWords, orderBy: listOrderBy("supplier", NEWEST), take, select: { id: true, reference: true, registeredName: true, status: true } }),
      exact: null,
      total: () => client.supplier.count({ where: supWords }),
      hit: supplierHit,
    }),
    groupOf("sitting", q, {
      newest: () => client.meeting.findMany({ where: sitWords, orderBy: listOrderBy("sitting", NEWEST), take, select: { id: true, reference: true, meetingDate: true, status: true, committee: { select: { nameEn: true } } } }),
      exact: null,
      total: () => client.meeting.count({ where: sitWords }),
      hit: (r) => sittingHit(r),
    }),
  ]);

  // FR-REQ-002: an exact case key on any of the three resolves one requisition; two different requisitions give no group.
  const caseIds = new Set([...req.exact.map((r) => r.id), ...ex.exact.map((r) => r.requisitionId), ...proj.exact.map((r) => r.exercise.requisitionId)]);
  const caseGroup = caseIds.size === 1 ? await loadCase(client, organisationId, [...caseIds][0], hidden) : null;

  return { q, caseGroup, groups: [req, ex, proj, sup, sit].map((g) => g.group).filter((g) => g.hits.length > 0) };
}

async function loadCase(client: Tx, organisationId: string, requisitionId: string, hidden: readonly string[]): Promise<CaseGroup | null> {
  const awardSelect = { id: true, reference: true, status: true, exerciseId: true, contract: { select: { number: true, status: true } } } as const;
  const [requisition, exercises, contractOnly] = await Promise.all([
    client.requisition.findFirst({ where: { id: requisitionId, organisationId }, select: { id: true, reference: true, title: true, status: true, erpRequisitionNo: true } }),
    client.sourcingExercise.findMany({
      where: { AND: [{ organisationId, requisitionId }, exerciseNotHidden(hidden)] },
      orderBy: [...OLDEST_FIRST],
      select: { id: true, reference: true, title: true, status: true, awards: { where: caseVisibilityWhere(hidden), orderBy: [...OLDEST_FIRST], select: awardSelect } },
    }),
    // AC-18: contract stages only; the exercise itself is not read.
    hidden.length ? client.award.findMany({ where: { organisationId, exercise: { requisitionId }, exerciseId: { in: [...hidden] }, contract: { isNot: null } }, orderBy: [...OLDEST_FIRST], select: awardSelect }) : [],
  ]);
  return requisition ? assembleCaseGroup({ requisition, exercises, contractOnly }, hidden) : null;
}
