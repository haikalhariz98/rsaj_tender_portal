/**
 * The office worklist, loaded (FR-APR-010, ruling CO-7). Reads only; the grouping and
 * the waiting days are `queue.ts`.
 */

import { someoneCanAct } from "@/lib/authority/absence";
import { KIND_WORDS } from "@/lib/certificate/labels";
import { EVENT_WORDS } from "@/lib/variation/labels";
import { dayToDate, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { exerciseRouteMatter } from "@/lib/method/approval";
import type { OrgScope } from "@/lib/org-scope";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";
import { APPLICATION_KIND_LABEL, REQUEST_KIND_LABEL } from "@/lib/suppliers/labels";
import { supplierHolders } from "@/lib/suppliers/route";

import { officeQueue, type QueueStep } from "./queue";

export async function loadWorklist(scope: OrgScope) {
  const org = await db.organisation.findUnique({ where: { id: scope.organisationId }, select: { id: true, timeZone: true } });
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
        // 6.15 (OD-2 A): a supplier's registration, decided on its own route.
        supplierApplication: { select: { kind: true, supplier: { select: { id: true, reference: true, registeredName: true } } } },
        // 6.15a (OD-8 A, FR-ADV-017): a blacklisting or its lifting, and a special permission.
        standingRequest: { select: { kind: true, supplier: { select: { id: true, reference: true, registeredName: true } } } },
        specialPermission: { select: { exercise: { select: { id: true, reference: true } }, party: { select: { name: true, vendorId: true } } } },
        // 6.13 Part A step 3 (614-C4): a certificate's route, decided on the certificate's page.
        certificate: { select: { id: true, kind: true, number: true, contract: { select: { id: true, number: true, award: { select: { awardeeName: true, exercise: { select: { requisition: { select: { sectionUnitCode: true, requestingUnitCode: true } } } } } } } } } },
        // 6.13 Part A step 4 (614-C4): a variation's route, decided on the variation's page.
        variation: { select: { id: true, reference: true, contract: { select: { id: true, number: true, award: { select: { awardeeName: true, exercise: { select: { requisition: { select: { sectionUnitCode: true, requestingUnitCode: true } } } } } } } } } },
        variationApproval: { select: { event: true } },
      },
    }),
    db.orgUnit.findMany({ where: { organisationId: org.id } }),
    loadRoster(scope.organisationCode),
    loadDelegations(scope.organisationCode),
  ]);
  const on = today ? dayToDate(today) : new Date();
  const people = new Map(roster.people.map((p) => [p.id, p]));
  const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
  const unitOf = new Map<string, string>();
  const items: QueueStep[] = [];
  for (const r of routes) {
    const req = r.requisition ?? r.exercise?.requisition ?? r.certificate?.contract.award.exercise.requisition ?? r.variation?.contract.award.exercise.requisition ?? null;
    if (req) unitOf.set(r.id, req.sectionUnitCode || req.requestingUnitCode);
    const matter = r.variation?.id
      ? { label: `${r.variation.contract.number} · ${r.variation.contract.award.awardeeName} · Variation ${r.variation.reference ?? ""}`.trim(), kind: r.variationApproval ? EVENT_WORDS[r.variationApproval.event].en : "Variation", href: `/projects/${r.variation.contract.id}/variations/${r.variation.id}?tab=approval` }
      : r.certificate?.id
      ? { label: `${r.certificate.contract.number} · ${r.certificate.contract.award.awardeeName}`, kind: KIND_WORDS[r.certificate.kind].en, href: `/projects/${r.certificate.contract.id}/certificates/${r.certificate.id}?tab=routing` }
      : r.award && r.exercise
        ? { label: `${r.award.reference} · ${r.award.awardeeName}`, kind: "Appointment", href: `/awards/${r.award.id}?tab=approval` }
        : r.exercise
          ? (() => {
              // Labelled by domain, never by the absence of an award (ruling X-5).
              const m = exerciseRouteMatter(r.domain);
              return { label: `${r.exercise.reference} · ${r.exercise.title}`, kind: m.kind, href: m.tab ? `/sourcing/${r.exercise.id}?tab=${m.tab}` : `/sourcing/${r.exercise.id}` };
            })()
          : r.requisition
            ? { label: `${r.requisition.reference} · ${r.requisition.title}`, kind: "Requisition", href: `/requisitions/${r.requisition.id}?tab=approval` }
            : r.supplierApplication
              ? { label: `${r.supplierApplication.supplier.reference} · ${r.supplierApplication.supplier.registeredName}`, kind: APPLICATION_KIND_LABEL[r.supplierApplication.kind].en, href: `/suppliers/${r.supplierApplication.supplier.id}?tab=applications` }
              : r.standingRequest
                ? { label: `${r.standingRequest.supplier.reference} · ${r.standingRequest.supplier.registeredName}`, kind: REQUEST_KIND_LABEL[r.standingRequest.kind].en, href: `/suppliers/${r.standingRequest.supplier.id}?tab=standing` }
                : r.specialPermission
                  ? { label: `${r.specialPermission.exercise.reference} · ${r.specialPermission.party.name}`, kind: "Special permission", href: r.specialPermission.party.vendorId ? `/suppliers/${r.specialPermission.party.vendorId}?tab=participation` : `/sourcing/${r.specialPermission.exercise.id}` }
                  : null;
    if (!matter) continue;
    items.push({ routeId: r.id, matterLabel: matter.label, matterKindLabel: matter.kind, href: matter.href, openedAt: r.openedAt, steps: r.steps });
  }
  // 6.15: a supplier matter has no unit; its offices are held organisation-wide (supplierHolders).
  const supplierRoutes = new Set(routes.filter((r) => r.supplierApplication || r.standingRequest || r.specialPermission).map((r) => r.id));
  const groups = officeQueue(items, today, (routeId, office, committee) => {
    if (committee || !office || !today) return false;
    if (supplierRoutes.has(routeId)) return !someoneCanAct(supplierHolders(office, roster, delegations, today), available);
    const unit = unitOf.get(routeId);
    if (!unit) return false;
    const path = pathTo(units as unknown as OrgUnit[], unit, on).reverse().map((u) => u.code);
    return !someoneCanAct(holdersFor(office, path, roster, delegations, today), available);
  });
  return { today, timeZone: org.timeZone, groups };
}
