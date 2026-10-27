/**
 * What the Time tab and the claim page read (Phase 2 close-out stage A; plan closeout-plan.md §3.1). Server-only, reads only: every state and
 * next action is the pure rules' (`eotClaimState`, `eotNext`, `computedExtension`), never decided here.
 */

import { latestVersion } from "@/lib/contract/baseline";
import { baselineRows, valuesOf } from "@/lib/contract/load";
import type { LoadedContract } from "@/lib/contract/repo";
import { dayOrNull as day } from "@/lib/dates";
import { db } from "@/lib/db";
import { loadMatters, matterFactsOf, type MatterRow } from "@/lib/matter/load";
import { matterApproved } from "@/lib/matter/matter";

import { eotClaimState, type ClaimStateFacts } from "./claim-state";
import type { EotInstrumentKind } from "./types";

/// The claim's state facts, from its matter as loaded.
export function claimStateFactsOf(m: MatterRow): ClaimStateFacts {
  const c = m.eotClaim!;
  const latest = m.routes.at(-1);
  const live = [...c.extensions].reverse().find((x) => x.certificate.status !== "VOID") ?? null;
  return {
    answered: Array.isArray(c.pack) && (c.pack as unknown[]).length > 0,
    reasons: c.reasons.length,
    entitlement: c.entitlement as ClaimStateFacts["entitlement"],
    closed: m.closedAt != null,
    route: (latest?.status ?? null) as ClaimStateFacts["route"],
    returned: latest?.status === "REJECTED" && latest.rejectionApplied === "RETURN_TO_ORIGINATOR",
    approved: matterApproved(matterFactsOf(m)),
    raised: live ? { status: live.certificate.status as "DRAFT" } : null,
  };
}

const EXTENDS = new Set(["EXTENSION_OF_TIME", "PERIOD_EXTENSION"]);

/// The completion date's history: the original (the last version before the first extension that holds a date) and each extension after it, with what
/// wrote it. Corrections before possession, which hold no date, are not the original.
export function completionVersionsOf(l: LoadedContract) {
  const all = baselineRows(l.contract).versions.map((b) => {
    const ext = (b.snapshot as { extension?: { days?: number; writtenBy?: { number?: string | null } } } | null)?.extension ?? null;
    return { id: b.id, version: b.version!, reason: b.reason, dateForCompletion: valuesOf(b).dateForCompletion, recordedOn: day(b.recordedOn), days: ext?.days ?? null, writtenBy: ext?.writtenBy?.number ?? null };
  });
  const firstExt = all.findIndex((x) => EXTENDS.has(x.reason ?? ""));
  const before = firstExt < 0 ? all : all.slice(0, firstExt);
  const original = [...before].reverse().find((x) => x.dateForCompletion) ?? null;
  return [...(original ? [original] : []), ...all.filter((x) => EXTENDS.has(x.reason ?? ""))];
}

export async function timeView(l: LoadedContract) {
  const [matters, notices, programmes, type, losses] = await Promise.all([
    loadMatters(l.contract.id),
    db.delayNotice.findMany({ where: { contractId: l.contract.id, organisationId: l.org.id }, orderBy: [{ receivedOn: "desc" }, { recordedAt: "desc" }] }),
    db.workProgramme.findMany({ where: { contractId: l.contract.id, organisationId: l.org.id, decision: "APPROVED" }, orderBy: { revision: "desc" }, select: { id: true, revision: true } }),
    l.ex.contractTypeCode ? db.contractType.findFirst({ where: { organisationId: l.org.id, code: l.ex.contractTypeCode }, select: { eotInstrumentKind: true } }) : null,
    db.lossExpenseClaim.findMany({ where: { contractId: l.contract.id, organisationId: l.org.id }, orderBy: { recordedAt: "asc" }, include: { claim: { select: { matter: { select: { reference: true } } } }, matter: { include: { routes: { select: { id: true, status: true }, orderBy: [{ openedAt: "asc" }, { id: "asc" }] } } } } }),
  ]);
  const claims = matters.filter((m) => m.eotClaim).map((m) => ({ m, c: m.eotClaim!, state: eotClaimState(claimStateFactsOf(m)) }));
  const periods = matters.filter((m) => m.periodExtension).map((m) => ({ m, x: m.periodExtension!, approved: matterApproved(matterFactsOf(m)) }));
  const instrument = (type?.eotInstrumentKind ?? null) as EotInstrumentKind | null;
  const versions = completionVersionsOf(l);
  const latest = latestVersion(baselineRows(l.contract).versions);
  return { matters, notices, programmes, instrument, claims, periods, losses, versions, current: latest ? valuesOf(latest).dateForCompletion : null };
}
export type TimeView = Awaited<ReturnType<typeof timeView>>;

/// A loss-and-expense claim's state in words.
export function lossStateOf(x: TimeView["losses"][number]): "Recorded" | "Valued" | "Awaiting approval" | "Approved" | "Refused" | "Closed" {
  if (!x.matter) return x.valued == null ? "Recorded" : "Valued";
  if (x.matter.closedAt) return "Closed";
  const latest = x.matter.routes.at(-1);
  if (x.matter.approvedRouteId && latest?.id === x.matter.approvedRouteId && latest.status === "APPROVED") return "Approved";
  return latest?.status === "PENDING" ? "Awaiting approval" : latest ? "Refused" : "Valued";
}
