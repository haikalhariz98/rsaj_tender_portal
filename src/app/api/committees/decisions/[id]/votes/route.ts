import { staffRoute } from "@/app/_auth/route";
import { toAuditActor } from "@/app/_auth/actor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { VOTE_FAULT_MESSAGE } from "@/lib/committee/labels";
import { canVote, VOTE_FAULT_STATUS } from "@/lib/committee/matter";
import { withLockedSitting } from "@/lib/committee/sittings";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";

/**
 * Record one member's vote on a committee matter.
 *
 * A vote is per member and replaces that member's previous vote on the matter — §7.2
 * is explicit that the model holds individual votes, never one committee position.
 *
 * Body: `{ personId, choice: "SETUJU" | "TIDAK_SETUJU", comment?, votedAt: "YYYY-MM-DD" }`,
 * where `votedAt` is the date on the member's signed sheet.
 *
 *   401  nobody is signed in; 403  the request is not from a page of this origin
 *   415  the body is not JSON
 *   400  malformed input
 *   404  no such matter
 *   403  not a present voting member of the sitting, or recused on this matter
 *   409  the sitting is not in progress (scheduled, minuted or cancelled), the matter
 *        is not tabled, or it is already decided
 *   422  ABSTAIN, or a sheet date after today (in the organisation's time zone)
 *        or before the sitting
 *
 * Every rule is `canVote`'s; the statuses are its tested table. The vote and its audit
 * row, with the before and after, are written in one transaction.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/committees/decisions/[id]/votes">) {
  // Who is asking, and that the request came from a page of this origin with a JSON body (a cross-site form can send text/plain, never this).
  const guard = await staffRoute({ contentTypes: ["application/json"] });
  if (!guard.ok) return guard.response;
  const scope = guard.actor;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { personId, choice, comment, votedAt } = (body ?? {}) as Record<string, unknown>;
  if (typeof personId !== "string" || personId === "") {
    return Response.json({ error: "personId is required" }, { status: 400 });
  }
  if (typeof choice !== "string") {
    return Response.json({ error: "choice is required" }, { status: 400 });
  }
  if (typeof votedAt !== "string") {
    return Response.json({ error: "votedAt (the date on the voting sheet) is required" }, { status: 400 });
  }
  if (comment != null && (typeof comment !== "string" || comment.length > 1000)) {
    return Response.json({ error: "comment must be text of 1000 characters or fewer" }, { status: 400 });
  }

  const found = await db.committeeDecision.findUnique({ where: { id, meeting: { committee: { organisationId: scope.organisationId } } }, select: { meetingId: true } });
  if (!found) return Response.json({ error: "Decision not found" }, { status: 404 });

  // Checked and written under the sitting's row lock, on data read inside the same
  // transaction: an outcome recorded at the same moment either sees this vote or
  // this vote sees the matter decided — never both missing each other.
  const result = await withLockedSitting(scope, found.meetingId, async (tx, sitting) => {
    const decision = sitting.meeting.decisions.find((d) => d.id === id);
    if (!decision) return Response.json({ error: "Decision not found" }, { status: 404 });

    const check = canVote({
      meetingStatus: sitting.meeting.status,
      meetingDate: sitting.meeting.meetingDate,
      today: sitting.today,
      outcome: decision.outcome,
      tabled: decision.tabledByPersonId != null,
      personId,
      // Entitled on this matter, not merely present: a seat whose holder is recused
      // does not vote, whoever sits in it.
      presentVoterIds: sitting.assessment.matters[id]?.entitledIds ?? [],
      recusedIds: decision.recusals.map((r) => r.personId),
      choice,
      votedAt,
      withdrawn: decision.withdrawnAt != null,
    });
    if (!check.ok) {
      return Response.json(
        { error: VOTE_FAULT_MESSAGE[check.fault], fault: check.fault },
        { status: VOTE_FAULT_STATUS[check.fault] },
      );
    }

    const previous = decision.votes.find((v) => v.personId === personId) ?? null;
    const sheetDate = dayToDate(votedAt);
    const text = typeof comment === "string" ? comment.trim() : "";
    const vote = await tx.vote.upsert({
      where: { decisionId_personId: { decisionId: id, personId } },
      update: { choice: choice as "SETUJU" | "TIDAK_SETUJU", comment: text, votedAt: sheetDate, recordedAt: new Date() },
      create: { decisionId: id, personId, choice: choice as "SETUJU" | "TIDAK_SETUJU", comment: text, votedAt: sheetDate },
    });
    const before = previous && { choice: previous.choice, comment: previous.comment, votedAt: previous.votedAt };
    const changes = diffFields(before, { choice, comment: text, votedAt: sheetDate });
    if (!previous || changes.length > 0) {
      await writeAudit(
        tx,
        {
          actor: toAuditActor(guard.actor),
          organisationId: sitting.organisationId,
          entity: "Vote",
          entityId: vote.id,
          entityLabel: `${sitting.names[personId] ?? "Member"} on ${decision.subject}`,
        },
        previous ? "UPDATE" : "CREATE",
        changes,
      );
    }
    return Response.json({ id: vote.id, choice: vote.choice, votedAt }, { status: 200 });
  });

  return result ?? Response.json({ error: "Decision not found" }, { status: 404 });
}
