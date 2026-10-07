/**
 * What the contract's Variations tab and a variation's page read, once (6.13 Part A step 4). Server-only: reads only.
 * Every figure shown is the pure rule the acts run, on the same inputs: the reading (percent.ts), the cumulative and
 * the stage (application.ts), the order's coverage (order.ts), the adjustment's figures (adjustment/ppjhk.ts).
 */

import { loadIssue } from "@/lib/authority/load";
import type { LoadedContract } from "@/lib/contract/repo";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { baselineOn } from "@/lib/payment/load";
import { loadPostAwardPolicy } from "@/lib/supervision/load";

import { cumulativeApproved } from "./application";
import { factsOf, loadAdjustments, loadVariations } from "./load";
import type { Reading } from "./percent";
import { positionOf } from "./position";
import { edgesOf, sentLabelOf } from "./route";

export async function variationView(l: LoadedContract, today: string | null) {
  const [all, adjustments, policy, kinds, issue] = await Promise.all([
    loadVariations(l.contract.id),
    loadAdjustments(l.contract.id),
    loadPostAwardPolicy(l.org.id),
    db.certificateKindSetting.findMany({ where: { organisationId: l.org.id, kind: { in: ["VARIATION_APPLICATION", "SO_INSTRUCTION", "VARIATION", "SUM_ADJUSTMENT"] } }, select: { kind: true, templateId: true } }),
    today ? loadIssue(l.org.code, dayToDate(today), undefined, null) : Promise.resolve(null),
  ]);
  const facts = all.map(factsOf);
  const baseline = today ? baselineOn(l, today) : null;
  const original = baseline?.values.contractSum ?? null;
  // The issued adjustments, the revised sum and the sum the percentage is taken over (null: not set, no baseline in
  // force, or refused); an issued adjustment whose net cannot be read is `refused`, naming it, never a thrown page.
  const { issued, revised, base, refused } = positionOf({ original, adjustments, variationBase: policy?.variationBase ?? null });
  const cumulative = cumulativeApproved(facts, null);
  // The prior approval's bands (`vo`), for a reading made now; a sent route reads its own frozen label, or its own
  // domain's edges (`labelOf`), never vo's for an increase, agreed rates or a re-measurement.
  const edges = issue ? edgesOf(issue.matrix.rules, "vo") : [];
  const rules = issue?.matrix.rules ?? [];
  const labelOf = (r: Reading, domain: string) => sentLabelOf(r, rules, domain);
  const formOf = (k: string) => kinds.find((x) => x.kind === k)?.templateId ?? null;
  const formSet = (k: string) => !!formOf(k);
  return { all, facts, adjustments, issued, refused, policy, baseline, original, revised, cumulative, base, edges, labelOf, formSet, formOf, matrixLabel: issue?.label ?? null };
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
