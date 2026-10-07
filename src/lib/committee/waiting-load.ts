/**
 * Waiting to be tabled, loaded (founder, 2026-10-05). Reads the open routes that a committee's step can be cited on,
 * and the matters tabled against their records; the rule is `waiting.ts`. Also what tabling one needs, read on the
 * server and never carried by the form (a requisition's amount is the SULIT department estimate): the schedule act
 * reads it again inside its own transaction, so what it tables is what is waiting then.
 *
 * Only routes a committee decision can discharge are read: a requisition's, an exercise's name approval, an award's
 * appointment, a variation's approval and a contract matter's. A requisition, a name and an appointment are tabled at
 * a sitting (`tableInto`, the "Table a matter" writer); a variation and a contract matter are tabled from their own
 * record, which names the approval the committee decides on (RECORD_TABLED_MATTER_KINDS).
 */

import type { CommitteeDecision } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { approvalRouteNotHidden } from "@/lib/auth/sulit-store";
import { todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { senFromDecimal } from "@/lib/money";
import { APPOINTMENT_DOMAIN, NAME_APPROVAL_DOMAIN } from "@/lib/method/types";
import { MATTER_KIND_WORDS } from "@/lib/matter/write";
import type { ContractMatterKind } from "@/lib/matter/matter";

import { WAITING_KIND_WORDS, type WaitingKind } from "./labels";
import { waitingToBeTabled, type WaitingMatter, type WaitingRoute } from "./waiting";

/// What the "Table a matter" writer is given for an item tabled at a sitting: the record's own words, never typed.
export interface TablingInput {
  matterKind: "REQUISITION" | "EXERCISE";
  matterRef: string;
  domain: string;
  act: string;
  subject: string;
  /// The figure the record's citation compares the matter's amount to, as stored; null where it compares none.
  amount: string | null;
}

export interface WaitingEntry {
  routeId: string;
  stepId: string;
  kind: WaitingKind;
  committeeCode: string;
  committeeId: string | null;
  committeeName: string;
  reference: string;
  title: string;
  href: string;
  /// The value the route was routed on, in sen as a decimal string; null where it routes on none. SULIT (a requisition's
  /// is the department estimate): registered in SULIT_FIELDS, shown only in a flagged column.
  waitingValue: string | null;
  act: string;
  waitingSince: string;
  waitingDays: number | null;
  /// Tabled at a sitting (the schedule drawer proposes it), or from its own record.
  tabledAt: "SITTING" | "RECORD";
  tabling: TablingInput | null;
}

const ROUTE_INCLUDE = {
  steps: { orderBy: { sequence: "asc" as const } },
  requisition: { select: { id: true, reference: true, title: true, estimatedValue: true } },
  exercise: { select: { id: true, reference: true, title: true } },
  award: { select: { id: true, reference: true, awardeeName: true, awardedValue: true } },
  variation: { select: { id: true, reference: true, description: true, contract: { select: { id: true, number: true } } } },
  contractMatter: { select: { id: true, kind: true, reference: true, contract: { select: { id: true, number: true } } } },
};

type Client = Tx | typeof db;

/// The organisation's waiting list, longest waiting first. `client` is a transaction where an act reads it again.
/// `hidden`: the restricted exercises the reader may not see. A route on one is not waiting for them, and tabling it is refused (FR-MTD-007).
export async function loadWaiting(organisationId: string, hidden: readonly string[], client: Client = db): Promise<{ today: string | null; entries: WaitingEntry[] } | null> {
  const org = await client.organisation.findUnique({ where: { id: organisationId }, select: { id: true, timeZone: true } });
  if (!org) return null;
  const today = todayIn(new Date(), org.timeZone);
  const routes = await client.approvalInstance.findMany({
    where: {
      organisationId: org.id,
      status: "PENDING",
      ...approvalRouteNotHidden(hidden),
      steps: { some: { committeeCode: { not: null }, decision: "PENDING" } },
      OR: [
        { matterKind: "REQUISITION", requisitionId: { not: null } },
        { matterKind: "EXERCISE", domain: NAME_APPROVAL_DOMAIN, awardId: null },
        { domain: APPOINTMENT_DOMAIN, awardId: { not: null } },
        { matterKind: "VARIATION", variationId: { not: null } },
        { matterKind: "CONTRACT", contractMatter: { isNot: null } },
      ],
    },
    orderBy: [{ openedAt: "asc" }, { id: "asc" }],
    include: ROUTE_INCLUDE,
  });
  const shaped = routes.map(shape).filter((r): r is NonNullable<ReturnType<typeof shape>> => r != null);
  const keys = { requisitionId: ids(shaped, "REQUISITION"), exerciseId: ids(shaped, "EXERCISE"), variationId: ids(shaped, "VARIATION"), contractMatter: ids(shaped, "CONTRACT") };
  const decisions = shaped.length
    ? await client.committeeDecision.findMany({
        where: {
          meeting: { committee: { organisationId: org.id } },
          OR: [{ requisitionId: { in: keys.requisitionId } }, { exerciseId: { in: keys.exerciseId } }, { variationId: { in: keys.variationId } }, { contractMatter: { id: { in: keys.contractMatter } } }],
        },
        select: { id: true, requisitionId: true, exerciseId: true, variationId: true, contractMatterId: true, domain: true, act: true, outcome: true, decisionDate: true, withdrawnAt: true, approvalStep: { select: { id: true } }, meeting: { select: { status: true, committee: { select: { code: true } } } } },
      })
    : [];
  const matters: WaitingMatter[] = decisions.map((d) => ({
    id: d.id,
    recordKey: matterKey(d),
    domain: d.domain,
    committeeCode: d.meeting.committee.code,
    act: d.act,
    outcome: d.outcome,
    decisionDay: d.decisionDate ? d.decisionDate.toISOString().slice(0, 10) : null,
    withdrawn: d.withdrawnAt != null,
    sittingCancelled: d.meeting.status === "CANCELLED",
    citedByStep: d.approvalStep != null,
  }));
  const waiting = waitingToBeTabled(shaped.map((r) => r.route), matters, today);
  const committees = await client.committee.findMany({ where: { organisationId: org.id, code: { in: [...new Set(waiting.map((w) => w.committeeCode))] } }, select: { id: true, code: true, nameEn: true } });
  const byRoute = new Map(shaped.map((r) => [r.route.routeId, r]));
  const entries = waiting.map((w): WaitingEntry => {
    const r = byRoute.get(w.routeId)!;
    const c = committees.find((x) => x.code === w.committeeCode);
    return {
      ...w,
      kind: r.kind,
      committeeId: c?.id ?? null,
      committeeName: c?.nameEn ?? "A committee no longer configured",
      reference: r.reference,
      title: r.title,
      href: r.href,
      waitingValue: r.value == null ? null : senFromDecimal(r.value).toString(),
      tabledAt: r.tabling ? "SITTING" : "RECORD",
      tabling: r.tabling ? { ...r.tabling, act: w.act } : null,
    };
  });
  return { today, entries };
}

type Route = Awaited<ReturnType<typeof db.approvalInstance.findMany<{ include: typeof ROUTE_INCLUDE }>>>[number];

const ids = (rs: readonly { route: WaitingRoute }[], kind: string) => rs.filter((r) => r.route.recordKey.startsWith(`${kind}:`)).map((r) => r.route.recordKey.slice(kind.length + 1));

/// The record a matter names, as `WaitingRoute.recordKey`: by its typed key, never by a typed reference.
/// (The contract matter's key is named only by its writers: ContractMatter's single-writer scan, contract-matter.test.ts.)
export function matterKey(d: Pick<CommitteeDecision, "requisitionId" | "exerciseId" | "variationId" | "contractMatterId">): string | null {
  if (d.variationId) return `VARIATION:${d.variationId}`;
  if (d.contractMatterId) return `CONTRACT:${d.contractMatterId}`;
  if (d.exerciseId) return `EXERCISE:${d.exerciseId}`;
  if (d.requisitionId) return `REQUISITION:${d.requisitionId}`;
  return null;
}

function shape(r: Route) {
  const route = (recordKey: string): WaitingRoute => ({ routeId: r.id, recordKey, domain: r.domain, openedAt: r.openedAt, steps: r.steps });
  const words = (k: WaitingKind) => WAITING_KIND_WORDS[k].en;
  if (r.matterKind === "VARIATION" && r.variation) {
    const v = r.variation;
    return { kind: "VARIATION" as const, route: route(`VARIATION:${v.id}`), reference: v.reference ?? "Not yet numbered", title: `${v.contract.number} · ${v.description}`, href: `/projects/${v.contract.id}/variations/${v.id}?tab=approval`, value: r.value, tabling: null };
  }
  if (r.matterKind === "CONTRACT" && r.contractMatter) {
    const m = r.contractMatter;
    const kind = MATTER_KIND_WORDS[m.kind as ContractMatterKind]?.en ?? "matter";
    return { kind: "CONTRACT" as const, route: route(`CONTRACT:${m.id}`), reference: m.reference ?? "Not yet numbered", title: `${m.contract.number} · ${kind.charAt(0).toUpperCase()}${kind.slice(1)}`, href: `/projects/${m.contract.id}`, value: r.value, tabling: null };
  }
  if (r.domain === APPOINTMENT_DOMAIN && r.award && r.exercise) {
    const a = r.award;
    const ex = r.exercise;
    // The citation compares the matter's amount to the awarded value (exerciseCitationFault OTHER_AMOUNT).
    const tabling = { matterKind: "EXERCISE" as const, matterRef: ex.reference, domain: APPOINTMENT_DOMAIN, subject: `Appointment of ${a.awardeeName} for ${ex.title}`, amount: a.awardedValue?.toString() ?? null };
    return { kind: "APPOINTMENT" as const, route: route(`EXERCISE:${ex.id}`), reference: a.reference, title: `${a.awardeeName} · ${ex.title}`, href: `/awards/${a.id}?tab=approval`, value: r.value, tabling };
  }
  if (r.matterKind === "EXERCISE" && r.domain === NAME_APPROVAL_DOMAIN && r.exercise) {
    const ex = r.exercise;
    // A name matter carries no amount: the name's route is routed on the department estimate, which is SULIT, and an
    // exercise matter's amount is not chipped (MATTER_AMOUNT_SULIT.EXERCISE); its citation compares none.
    const tabling = { matterKind: "EXERCISE" as const, matterRef: ex.reference, domain: NAME_APPROVAL_DOMAIN, subject: `${words("NAME")}: ${ex.title}`, amount: null };
    return { kind: "NAME" as const, route: route(`EXERCISE:${ex.id}`), reference: ex.reference, title: ex.title, href: `/sourcing/${ex.id}`, value: r.value, tabling };
  }
  if (r.matterKind === "REQUISITION" && r.requisition) {
    const q = r.requisition;
    // The citation compares the matter's amount to the estimated value (committeeCitationFault OTHER_AMOUNT).
    const tabling = { matterKind: "REQUISITION" as const, matterRef: q.reference, domain: r.domain, subject: `${words("REQUISITION")} ${q.reference}: ${q.title}`, amount: q.estimatedValue.toString() };
    return { kind: "REQUISITION" as const, route: route(`REQUISITION:${q.id}`), reference: q.reference, title: q.title, href: `/requisitions/${q.id}?tab=approval`, value: r.value, tabling };
  }
  return null;
}
