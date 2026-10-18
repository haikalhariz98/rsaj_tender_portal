/**
 * The office worklist, loaded (FR-APR-010, ruling CO-7). Reads only; the grouping and
 * the waiting days are `queue.ts`.
 */

import { caseHref } from "@/lib/contract/links";
import { someoneCanAct } from "@/lib/authority/absence";
import { KIND_WORDS } from "@/lib/certificate/labels";
import { EVENT_WORDS } from "@/lib/variation/labels";
import { dayToDate, todayIn } from "@/lib/dates";
import { loadRecorders, recordersOf } from "@/lib/auth/attribution-recorders";
import { approvalRouteNotHidden } from "@/lib/auth/sulit-store";
import { db } from "@/lib/db";
import { exerciseRouteMatter } from "@/lib/method/approval";
import type { OrgScope } from "@/lib/org-scope";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { loadReportingLines } from "@/lib/people/reporting-line-store";
import { anyLineRecorded } from "@/lib/people/reporting-lines";
import { holdersFor } from "@/lib/requisition/holders";
import { APPLICATION_KIND_LABEL, REQUEST_KIND_LABEL } from "@/lib/suppliers/labels";
import { supplierHolders } from "@/lib/suppliers/route";

import { decidingDelegates, nextStep, officeQueue, type QueueStep } from "./queue";
import { ceilingValue } from "./routed-value";
import { routeBarred, type BarredRelation, type RequesterRouteKind } from "./requester";

/// `hidden`: the restricted exercises the reader may not see. A route on one (its name, its award, a special permission on it) is not in the queue (FR-MTD-007).
export async function loadWorklist(scope: OrgScope, hidden: readonly string[]) {
  const org = await db.organisation.findUnique({ where: { id: scope.organisationId }, select: { id: true, timeZone: true } });
  if (!org) return null;
  const today = todayIn(new Date(), org.timeZone);
  const [routes, units, roster, delegations, lines] = await Promise.all([
    db.approvalInstance.findMany({
      where: { organisationId: org.id, status: "PENDING", ...approvalRouteNotHidden(hidden) },
      orderBy: [{ openedAt: "asc" }, { createdAt: "asc" }],
      include: {
        steps: { orderBy: { sequence: "asc" } },
        requisition: { select: { id: true, reference: true, title: true, sectionUnitCode: true, requestingUnitCode: true, requestingPersonId: true } },
        exercise: { select: { id: true, reference: true, title: true, requisition: { select: { id: true, sectionUnitCode: true, requestingUnitCode: true, requestingPersonId: true } } } },
        award: { select: { id: true, reference: true, awardeeName: true } },
        // 6.15 (OD-2 A): a supplier's registration, decided on its own route.
        supplierApplication: { select: { kind: true, submittedByPersonId: true, supplier: { select: { id: true, reference: true, registeredName: true } } } },
        // 6.15a (OD-8 A, FR-ADV-017): a blacklisting or its lifting, and a special permission.
        standingRequest: { select: { kind: true, requestedByPersonId: true, supplier: { select: { id: true, reference: true, registeredName: true } } } },
        specialPermission: { select: { requestedByPersonId: true, exercise: { select: { id: true, reference: true } }, party: { select: { name: true, vendorId: true } } } },
        // 6.13 Part A step 3 (614-C4): a certificate's route, decided on the certificate's page.
        certificate: { select: { id: true, kind: true, number: true, contract: { select: { id: true, number: true, award: { select: { awardeeName: true, exercise: { select: { requisition: { select: { sectionUnitCode: true, requestingUnitCode: true, requestingPersonId: true } } } } } } } } } },
        // 6.13 Part A step 4 (614-C4): a variation's route, decided on the variation's page.
        variation: { select: { id: true, reference: true, contract: { select: { id: true, number: true, award: { select: { awardeeName: true, exercise: { select: { requisition: { select: { sectionUnitCode: true, requestingUnitCode: true, requestingPersonId: true } } } } } } } } } },
        variationApproval: { select: { event: true } },
      },
    }),
    db.orgUnit.findMany({ where: { organisationId: org.id } }),
    loadRoster(scope.organisationCode),
    loadDelegations(scope.organisationCode),
    loadReportingLines(db, org.id),
  ]);
  const on = today ? dayToDate(today) : new Date();
  const people = new Map(roster.people.map((p) => [p.id, p]));
  const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
  const unitOf = new Map<string, string>();
  const barredOf = new Map<string, string[]>();
  const relationOf = new Map<string, Record<string, BarredRelation>>();
  const valueOf = new Map<string, bigint>();
  const supplierMatter = (r: { supplierApplication: unknown; standingRequest: unknown; specialPermission: unknown }) => !!(r.supplierApplication || r.standingRequest || r.specialPermission);
  const requisitionOf = (r: (typeof routes)[number]) => r.requisition ?? r.exercise?.requisition ?? r.certificate?.contract.award.exercise.requisition ?? r.variation?.contract.award.exercise.requisition ?? null;
  const kindOf = (r: (typeof routes)[number]): RequesterRouteKind | null => r.variation?.id ? "VARIATION" : r.certificate?.id ? "CERTIFICATE" : r.award && r.exercise ? "APPOINTMENT" : r.exercise ? "NAME_APPROVAL" : r.requisition ? "REQUISITION" : r.supplierApplication ? "SUPPLIER_APPLICATION" : r.standingRequest ? "STANDING_REQUEST" : r.specialPermission ? "SPECIAL_PERMISSION" : null;
  // The officers who keyed a requisition for someone else (ruling of 2026-10-08 on log line 1792), in ONE query over the routes listed: the decision rule bars them as it bars the
  // person they keyed it for (`earlierRecordersOf`, `requesterRecorderIds`), and the sites that read it for a requisition's, a name's and an appointment's route pass the
  // requisition. A certificate's, a variation's and a contract matter's route read none, so none is looked for there.
  const keyedKinds: readonly RequesterRouteKind[] = ["REQUISITION", "NAME_APPROVAL", "APPOINTMENT"];
  const keyedRequisitionId = (r: (typeof routes)[number]): string | null => { const k = kindOf(r); return k && keyedKinds.includes(k) ? (r.requisition?.id ?? r.exercise?.requisition?.id ?? null) : null; };
  const requisitionIds = [...new Set(routes.flatMap((r) => { const id = keyedRequisitionId(r); return id ? [id] : []; }))];
  const recorders = await loadRecorders(db, org.id, [{ entity: "Requisition", slot: "requestingPerson", ids: requisitionIds }]);
  const items: QueueStep[] = [];
  for (const r of routes) {
    const req = requisitionOf(r);
    if (req) unitOf.set(r.id, req.sectionUnitCode || req.requestingUnitCode);
    // Who may not decide it (FR-APR-008): the people the decision rule for this kind of route bars (`routeBarred`: a name's and an appointment's bar the requisition's raiser and the
    // sender of the route; the others one person), never a union of the rules of every kind; and the officers who keyed the requisition for someone else.
    const kind = kindOf(r);
    const barred = kind
      ? routeBarred(kind, { requisitionRaiserId: req?.requestingPersonId, routeSenderId: r.submittedByPersonId, applicationSenderId: r.supplierApplication?.submittedByPersonId, requestRaiserId: r.standingRequest?.requestedByPersonId ?? r.specialPermission?.requestedByPersonId })
      : [];
    const keyedFor = keyedRequisitionId(r);
    const keyed = keyedFor ? recordersOf(recorders, "Requisition", "requestingPerson", [keyedFor]).filter((id) => !barred.some((b) => b.personId === id)) : [];
    barredOf.set(r.id, [...barred.map((b) => b.personId), ...keyed]);
    relationOf.set(r.id, Object.fromEntries([...barred.map((b) => [b.personId, b.relation] as const), ...keyed.map((id) => [id, "KEYED"] as const)]));
    // What a delegate's ceiling is judged against: the route's own figure, as the decision rules read it. A supplier matter has none (it is routed on no value).
    valueOf.set(r.id, ceilingValue(r, supplierMatter(r)));
    const matter = r.variation?.id
      ? { label: `${r.variation.contract.number} · ${r.variation.contract.award.awardeeName} · Variation ${r.variation.reference ?? ""}`.trim(), kind: r.variationApproval ? EVENT_WORDS[r.variationApproval.event].en : "Variation", href: `/projects/${r.variation.contract.id}/variations/${r.variation.id}?tab=approval` }
      : r.certificate?.id
      ? { label: `${r.certificate.contract.number} · ${r.certificate.contract.award.awardeeName}`, kind: KIND_WORDS[r.certificate.kind].en, href: `/projects/${r.certificate.contract.id}/certificates/${r.certificate.id}?tab=routing` }
      : r.award && r.exercise
        ? { label: `${r.award.reference} · ${r.award.awardeeName}`, kind: "Appointment", href: caseHref({ awardId: r.award.id, contractId: null }, { stage: "award", tab: "approval" }) }
        : r.exercise
          ? (() => {
              // Labelled by domain, never by the absence of an award (ruling X-5).
              const m = exerciseRouteMatter(r.domain);
              return { label: `${r.exercise.reference} · ${r.exercise.title}`, kind: m.kind, href: m.tab ? `/sourcing/${r.exercise.id}?tab=${m.tab}${m.section ? `&section=${m.section}` : ""}` : `/sourcing/${r.exercise.id}` };
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
    items.push({ routeId: r.id, matterLabel: matter.label, matterKindLabel: matter.kind, href: matter.href, openedAt: r.openedAt, steps: r.steps, value: valueOf.get(r.id) ?? null, barredIds: barredOf.get(r.id) ?? [], barredRelations: relationOf.get(r.id) ?? {} });
  }
  // 6.15: a supplier matter has no unit; its offices are held organisation-wide (supplierHolders).
  const supplierRoutes = new Set(routes.filter((r) => r.supplierApplication || r.standingRequest || r.specialPermission).map((r) => r.id));
  const stepOfRoute = new Map(items.map((i) => [i.routeId, nextStep(i.steps)]));
  const valueOfRoute = new Map(items.map((i) => [i.routeId, i.value]));
  // Who holds the acting office for the route's matter today: the one reading both questions below ask, so "nobody able to act" and "whose step is it" cannot disagree.
  const holdersOf = (routeId: string, office: string): ReturnType<typeof holdersFor> | null => {
    if (!today) return null;
    if (supplierRoutes.has(routeId)) return supplierHolders(office, roster, delegations, today);
    const unit = unitOf.get(routeId);
    if (!unit) return null;
    const path = pathTo(units as unknown as OrgUnit[], unit, on).reverse().map((u) => u.code);
    return holdersFor(office, path, roster, delegations, today);
  };
  const groups = officeQueue(
    items,
    today,
    (routeId, office, committee) => {
      if (committee || !office) return false;
      const h = holdersOf(routeId, office);
      // The same reading of "able to act" as My steps and the sweep (ruling on log line 1790): a delegate counts only where the step may be delegated and the ceiling reaches the value.
      return h ? !someoneCanAct(h, available, stepOfRoute.get(routeId) ?? {}, valueOfRoute.get(routeId)) : false;
    },
    (routeId, office, committee) => {
      const h = committee || !office ? null : holdersOf(routeId, office);
      // The delegates who would not be refused: not those capped below the route's value, and none where the step is the holder's alone (FR-APR-018's count is of steps a person can decide).
      const step = stepOfRoute.get(routeId);
      return h ? { holderIds: h.holderIds, delegateIds: decidingDelegates(h.delegates, step ?? {}, valueOfRoute.get(routeId)).map((d) => d.personId) } : { holderIds: [], delegateIds: [] };
    },
  );
  return { today, timeZone: org.timeZone, groups, linesRecorded: anyLineRecorded(lines) };
}
