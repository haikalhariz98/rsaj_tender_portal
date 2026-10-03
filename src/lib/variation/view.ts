/**
 * What the contract's Variations tab and a variation's page read, once (6.13 Part A step 4). Server-only: reads only.
 * Every figure shown is the pure rule the acts run, on the same inputs: the reading (percent.ts), the cumulative and
 * the stage (application.ts), the order's coverage (order.ts), the adjustment's figures (adjustment/ppjhk.ts).
 */

import { loadIssue } from "@/lib/authority/load";
import type { LoadedContract } from "@/lib/contract/repo";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { baselineOn } from "@/lib/payment/load";
import { loadPostAwardPolicy } from "@/lib/supervision/load";

import { cumulativeApproved } from "./application";
import { factsOf, issuedAdjustments, loadAdjustments, loadVariations } from "./load";
import { ratioOf, type Reading } from "./percent";
import { edgesOf, routePercentLabel } from "./route";

export async function variationView(l: LoadedContract, today: string | null) {
  const [all, adjustments, policy, kinds, issue] = await Promise.all([
    loadVariations(l.contract.id),
    loadAdjustments(l.contract.id),
    loadPostAwardPolicy(l.org.id),
    db.certificateKindSetting.findMany({ where: { organisationId: l.org.id, kind: { in: ["VARIATION_APPLICATION", "SO_INSTRUCTION", "VARIATION", "SUM_ADJUSTMENT"] } }, select: { kind: true, templateId: true } }),
    today ? loadIssue(ORGANISATION_CODE, dayToDate(today), undefined, null) : Promise.resolve(null),
  ]);
  const facts = all.map(factsOf);
  const baseline = today ? baselineOn(l, today) : null;
  const issued = issuedAdjustments(adjustments);
  const original = baseline?.values.contractSum ?? null;
  const revised = original == null ? null : issued.reduce((a, x) => a + x.net, original);
  const cumulative = cumulativeApproved(facts, null);
  // The sum the percentage is taken over, as set (null: not set, or no baseline in force).
  const base = policy?.variationBase === "REVISED" ? revised : policy?.variationBase === "ORIGINAL" ? original : null;
  // The prior approval's bands (`vo`), for a reading made now; a sent route reads its own frozen label, or its own
  // domain's edges (`labelOf`), never vo's for an increase, agreed rates or a re-measurement.
  const edges = issue ? edgesOf(issue.matrix.rules, "vo") : [];
  const rules = issue?.matrix.rules ?? [];
  const labelOf = (r: Reading, domain: string) => r.label ?? routePercentLabel(rules, r.domain ?? domain, ratioOf(r));
  const formSet = (k: string) => !!kinds.find((x) => x.kind === k)?.templateId;
  return { all, facts, adjustments, issued, policy, baseline, original, revised, cumulative, base, edges, labelOf, formSet, matrixLabel: issue?.label ?? null };
}

export type VariationView = Awaited<ReturnType<typeof variationView>>;

/// Every variation of the organisation commenced pending approval and not yet approved (FR-VAR-014), across contracts,
/// with its estimate and age: the exposure report, judged over the whole set, then paged by the caller.
export async function commencedPendingAll(organisationId: string) {
  const rows = await db.variation.findMany({
    where: { organisationId, commencedOn: { not: null }, status: "SUPPORTED", exemption: null },
    select: { id: true, reference: true, description: true, estimate: true, commencedOn: true, contract: { select: { id: true, number: true, award: { select: { awardeeName: true, exercise: { select: { title: true } } } } } }, approvals: { select: { event: true, approvalInstance: { select: { status: true } } } } },
    orderBy: [{ commencedOn: "asc" }, { id: "asc" }],
  });
  return rows.filter((v) => !v.approvals.some((a) => a.event === "PRIOR" && a.approvalInstance.status === "APPROVED"));
}
