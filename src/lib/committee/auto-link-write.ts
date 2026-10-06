/**
 * The outcome flows back by itself (founder, 2026-10-05), inside the outcome's own transaction: the caller has locked the
 * record's chain, then the sitting, written the outcome, and re-read the record. Here the step is chosen
 * (`autoLinkTarget`) and the record's own citation run on it, behind a savepoint, so that a refusal never takes the
 * outcome with it:
 *
 * - The citation throws its module's refusal: everything it wrote is rolled back to the savepoint; the outcome stands.
 * - It returns a refusal: what it wrote stands, exactly as when its "Cite committee decision" act returns one (a
 *   requisition returned at approval keeps its fresh budget check and goes back to Over budget, as by hand).
 * - Anything else it throws is not a refusal: rethrown, and the whole act rolls back.
 *
 * Where nothing was linked, the matter's History says so, with why as the entry's reason, in the record's own words;
 * the sitting reads it back from there to show its note (`notLinkedNotes`). The audit row is the record of what the
 * act did, so nothing is stored twice. The cited step's own History says it was linked automatically: the citation
 * writes that, through its `via` (cite-via.ts).
 */

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

import { autoLinkTarget, linkNoteAsked, notLinkedNotes, type LinkRoute } from "./auto-link";
import { AUTO_LINK_WORDS } from "./labels";
import { matterKey } from "./waiting-load";
import type { AuditActor } from "@/lib/auth/types";

/// A refusal's words: its message, then what it says against a field.
export const refusalWords = (s: FormState) => [s.message, ...Object.values(s.errors ?? {})].filter((x) => x && x.trim()).join(" ");

export async function linkOutcome(
  tx: Tx,
  actor: AuditActor,
  i: {
    organisationId: string;
    decisionId: string;
    /// Every route of the record, as re-read after the outcome was written.
    routes: readonly LinkRoute[];
    /// The record's own citation of the matter's decision on the step.
    cite: (stepId: string) => Promise<FormState | void>;
    /// The record's refusal as thrown, in its own words; null for anything that is not one.
    refusal: (e: unknown) => FormState | null;
  },
): Promise<"LINKED" | "NOT_LINKED" | "NOT_ASKED"> {
  const d = await tx.committeeDecision.findUnique({
    where: { id: i.decisionId },
    select: { id: true, subject: true, domain: true, outcome: true, withdrawnAt: true, requisitionId: true, exerciseId: true, variationId: true, contractMatterId: true, meeting: { select: { committee: { select: { code: true } } } } },
  });
  if (!d) return "NOT_ASKED";
  const target = autoLinkTarget({ recordKey: matterKey(d), domain: d.domain, committeeCode: d.meeting.committee.code, outcome: d.outcome, withdrawn: d.withdrawnAt != null }, i.routes);
  if (target.kind === "NONE") {
    if (!linkNoteAsked(target)) return "NOT_ASKED";
    await notLinked(tx, actor, i.organisationId, d, AUTO_LINK_WORDS.noStep.en);
    return "NOT_LINKED";
  }
  await tx.$executeRaw`SAVEPOINT committee_outcome_link`;
  let why: string | null = null;
  try {
    const out = await i.cite(target.stepId);
    if (out && !out.ok) why = refusalWords(out);
    await tx.$executeRaw`RELEASE SAVEPOINT committee_outcome_link`;
  } catch (e) {
    const said = i.refusal(e);
    if (!said) throw e;
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT committee_outcome_link`;
    why = refusalWords(said);
  }
  if (why == null) return "LINKED";
  await notLinked(tx, actor, i.organisationId, d, why || AUTO_LINK_WORDS.noStep.en);
  return "NOT_LINKED";
}

async function notLinked(tx: Tx, actor: AuditActor, organisationId: string, d: { id: string; subject: string }, why: string) {
  await writeAudit(tx, { actor, organisationId, entity: "CommitteeDecision", entityId: d.id, entityLabel: d.subject, reason: why }, "UPDATE",
    diffFields({ linkedToApproval: null }, { linkedToApproval: AUTO_LINK_WORDS.notLinked.en }));
}


/// The sitting's notes, loaded: for each decided matter of the sitting that no step cites, why it was not linked.
export async function notLinkedFor(organisationId: string, decisions: readonly { id: string; outcome: string }[]): Promise<Map<string, string>> {
  const decided = decisions.filter((d) => d.outcome === "CARRIED" || d.outcome === "NOT_CARRIED").map((d) => d.id);
  if (decided.length === 0) return new Map();
  const cited = new Set((await db.approvalStep.findMany({ where: { committeeDecisionId: { in: decided } }, select: { committeeDecisionId: true } })).map((x) => x.committeeDecisionId));
  const uncited = new Set(decided.filter((id) => !cited.has(id)));
  if (uncited.size === 0) return new Map();
  const rows = await db.auditEntry.findMany({ where: { organisationId, entity: "CommitteeDecision", entityId: { in: [...uncited] } }, select: { entityId: true, at: true, reason: true, changes: true } });
  return notLinkedNotes(rows.map((r) => ({ ...r, changes: (r.changes ?? []) as unknown as { field: string; after: string | null }[] })), uncited);
}
