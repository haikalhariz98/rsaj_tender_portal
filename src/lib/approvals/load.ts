/**
 * The office worklist, loaded (FR-APR-010, ruling CO-7). Reads only; the grouping and
 * the waiting days are `queue.ts`.
 */

import { someoneCanAct } from "@/lib/authority/absence";
import { dayToDate, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { exerciseRouteMatter } from "@/lib/method/approval";
import { ORGANISATION_CODE } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";

import { officeQueue, type QueueStep } from "./queue";

export async function loadWorklist() {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, timeZone: true } });
  if (!org) return null;
  const today = todayIn(new Date(), org.timeZone);
  const [routes, units, roster, delegations] = await Promise.all([
    db.approvalInstance.findMany({
      where: { organisationId: org.id, status: "PENDING" },
      orderBy: [{ openedAt: "asc" }, { createdAt: "asc" }],
      include: {
        steps: { orderBy: { sequence: "asc" } },
        requisition: { select: { id: true, reference: true, title: true, sectionUnitCode: true, requestingUnitCode: true } },
        exercise: { select: { id: true, reference: true, title: true, requisition: { select: { sectionUnitCode: true, requestingUnitCode: true } } } },
        award: { select: { id: true, reference: true, awardeeName: true } },
      },
    }),
    db.orgUnit.findMany({ where: { organisationId: org.id } }),
    loadRoster(ORGANISATION_CODE),
    loadDelegations(ORGANISATION_CODE),
  ]);
  const on = today ? dayToDate(today) : new Date();
  const people = new Map(roster.people.map((p) => [p.id, p]));
  const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
  const unitOf = new Map<string, string>();
  const items: QueueStep[] = [];
  for (const r of routes) {
    const req = r.requisition ?? r.exercise?.requisition ?? null;
    if (req) unitOf.set(r.id, req.sectionUnitCode || req.requestingUnitCode);
    const matter =
      r.award && r.exercise
        ? { label: `${r.award.reference} · ${r.award.awardeeName}`, kind: "Appointment", href: `/awards/${r.award.id}?tab=approval` }
        : r.exercise
          ? (() => {
              // Labelled by domain, never by the absence of an award (ruling X-5).
              const m = exerciseRouteMatter(r.domain);
              return { label: `${r.exercise.reference} · ${r.exercise.title}`, kind: m.kind, href: m.tab ? `/sourcing/${r.exercise.id}?tab=${m.tab}` : `/sourcing/${r.exercise.id}` };
            })()
          : r.requisition
            ? { label: `${r.requisition.reference} · ${r.requisition.title}`, kind: "Requisition", href: `/requisitions/${r.requisition.id}?tab=approval` }
            : null;
    if (!matter) continue;
    items.push({ routeId: r.id, matterLabel: matter.label, matterKindLabel: matter.kind, href: matter.href, openedAt: r.openedAt, steps: r.steps });
  }
  const groups = officeQueue(items, today, (routeId, office, committee) => {
    if (committee || !office || !today) return false;
    const unit = unitOf.get(routeId);
    if (!unit) return false;
    const path = pathTo(units as unknown as OrgUnit[], unit, on).reverse().map((u) => u.code);
    return !someoneCanAct(holdersFor(office, path, roster, delegations, today), available);
  });
  return { today, timeZone: org.timeZone, groups };
}
