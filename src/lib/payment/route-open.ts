/**
 * Sending a certificate raised here for approval (6.13 Part A step 3: FR-PAY-016, FR-PAY-001, FR-LAD-006; 614-C4).
 * Server-only: runs inside the certificate page's act, on the rows `withLockedCertificate` locked (Requisition →
 * Exercise → Award → Contract → Certificate).
 *
 * The figure is read from the certificate as it stands (overrides included): the interim certificate's by the
 * organisation's choice (OD-A6; unset refuses), the advance's amount, the non-completion certificate at the contract
 * sum it pinned. The route is resolved on the approval matrix in force today under the requisition's funding route
 * (absence and self-approval applied), and opened on the certificate; a certificate on a routing sheet starts its
 * sheet in the same act (the figures freeze there). Once a route is open the figures are frozen too: the core
 * refuses an override while it is pending or approved. A certificate whose route was refused and sent back to
 * whoever raised it may be sent again on a new route.
 */

import type { ActWriter } from "@/lib/auth/act-writer";
import { absentOffices } from "@/lib/authority/absence";
import { loadIssue, loadOverrideMatrix } from "@/lib/authority/load";
import { applyOverrides } from "@/lib/certificate/override";
import { openCertificateRoute, latestCertificateRoute } from "@/lib/certificate/route-write";
import { readComputedSnapshot } from "@/lib/certificate/snapshot";
import { CertificateRefusal, sendForRouting, type CertCtx } from "@/lib/certificate/write";
import { dayToDate } from "@/lib/dates";
import { senFromDecimal } from "@/lib/money";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";
import { methodKeyOf } from "@/lib/supervision/load";

import { paymentRefusal } from "./labels";
import { KIND_ROUTE_DOMAIN, resolveCertificateRouteUnder } from "./route";
import { routeValueOf, submitStateFaults } from "./route-state";
import type { Finding, PaymentRouteFigure } from "./types";
import { inOrder } from "@/lib/series";

const refuse = (fs: readonly Finding[]): never => {
  throw new CertificateRefusal(paymentRefusal("Not sent for approval:", fs));
};
const one = (code: string, data: Record<string, string | number | null> = {}): Finding[] => [{ code, level: "block", data }];

export async function submitForApproval(c: CertCtx, act: ActWriter) {
  const cert = c.l.cert;
  const domain = KIND_ROUTE_DOMAIN[cert.kind];
  const latest = latestCertificateRoute(cert.approvalInstances);
  const state = submitStateFaults({ domain, status: cert.status, latest: latest ? { status: latest.status, applied: latest.rejectionApplied, choices: latest.rejectionChoices } : null });
  if (state.length) refuse(state);
  const person = await c.tx.person.findFirst({ where: { id: act.subjectPersonId, organisationId: c.l.org.id, isActive: true }, select: { id: true, name: true } });
  if (!person) throw new CertificateRefusal("Not sent for approval.", { personId: "Choose who sends it. They may not decide it." });

  const snap = readComputedSnapshot(cert.computedSnapshot);
  const figures = snap ? applyOverrides(snap, cert.overrides) : null;
  const policy = await c.tx.postAwardPolicy.findUnique({ where: { organisationId: c.l.org.id }, select: { paymentRouteFigure: true } });
  const contractSum = senFromDecimal(cert.baseline.contractSum);
  const v = routeValueOf(cert.kind, figures, (policy?.paymentRouteFigure ?? null) as PaymentRouteFigure | null, contractSum);
  if (Array.isArray(v)) return refuse(v);

  const on = dayToDate(c.today);
  const issue = await loadIssue(c.l.org.code, on, undefined, null, c.tx);
  if (!issue) return refuse(one("NO_MATRIX", { day: c.today }));
  const supersedes = c.l.req.fundingSupersedesAuthority === true;
  const override = supersedes && c.l.req.fundingRouteCode ? await loadOverrideMatrix(c.l.org.code, c.l.req.fundingRouteCode, on, c.tx) : null;
  const ctx = { dal: issue.matrix, override, supersedes };
  // The absence rule and the sender's own office, on the requisition's unit, today (as the appointment's route reads them).
  const [roster, delegations, units] = await inOrder(() => loadRoster(c.l.org.code, c.tx), () => loadDelegations(c.l.org.code, c.tx), () => c.tx.orgUnit.findMany({ where: { organisationId: c.l.org.id } }));
  const unitPath = pathTo(units as unknown as OrgUnit[], c.l.req.sectionUnitCode || c.l.req.requestingUnitCode, on).reverse().map((u) => u.code);
  const holdersOf = (code: string) => holdersFor(code, unitPath, roster, delegations, c.today);
  const people = new Map(roster.people.map((p) => [p.id, p]));
  const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
  const offices = Object.keys(issue.matrix.roles).filter((k) => !issue.matrix.roles[k].isCommittee);
  const r = resolveCertificateRouteUnder(
    ctx,
    { domain: domain!, value: v.value, contractValue: contractSum, method: await methodKeyOf(c.l, c.tx), contractTypeCode: c.l.ex.contractTypeCode, absentRoleCodes: absentOffices(offices, holdersOf, available) },
    issue.label,
    (code) => holdersOf(code).holderIds.includes(person.id),
  );
  if (!r.ok) return refuse(r.faults);
  const source = r.source === "OVERRIDE" && override ? { matrix: override.matrix, override: { id: override.id, label: override.label } } : { matrix: issue.matrix, override: null };
  await openCertificateRoute(c, { domain: domain!, value: v.value, issue, source, resolution: r.resolution, warnings: r.warnings, submittedBy: person, act, figure: v.figure });
  // A certificate on a routing sheet starts it now: its type and its figures freeze (the core's own act).
  if (cert.status === "DRAFT" && cert.routingTypeId) await sendForRouting(c);
}
