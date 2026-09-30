import { auditedUpsert } from "@/lib/audit/record";
import { VOTE_FAULT_MESSAGE } from "@/lib/committee/labels";
import { canVote, VOTE_FAULT_STATUS } from "@/lib/committee/matter";
import { loadSitting } from "@/lib/committee/sittings";
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
 *   400  malformed input
 *   404  no such matter
 *   403  not a present voting member of the sitting, or recused on this matter
 *   409  the sitting is not in progress (scheduled, minuted or cancelled), the matter
 *        is not tabled, or it is already decided
 *   422  ABSTAIN, or a sheet date after today or before the sitting
 *
 * Every rule is `canVote`'s; the statuses are its tested table. The vote and its audit
 * row, with the before and after, are written in one transaction.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/committees/decisions/[id]/votes">) {
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

  const found = await db.committeeDecision.findUnique({ where: { id }, select: { meetingId: true } });
  const sitting = found ? await loadSitting(found.meetingId) : null;
  const decision = sitting?.meeting.decisions.find((d) => d.id === id);
  if (!sitting || !decision) return Response.json({ error: "Decision not found" }, { status: 404 });

  const assessment = sitting.assessment.matters[id];
  const recusedIds = decision.recusals.map((r) => r.personId);
  const check = canVote({
    meetingStatus: sitting.meeting.status,
    meetingDate: sitting.meeting.meetingDate,
    today: new Date(),
    outcome: decision.outcome,
    tabled: decision.tabledByPersonId != null,
    personId,
    presentVoterIds: sitting.assessment.present.voterIds,
    recusedIds,
    choice,
    votedAt,
  });
  if (!check.ok) {
    return Response.json(
      { error: VOTE_FAULT_MESSAGE[check.fault], fault: check.fault },
      { status: VOTE_FAULT_STATUS[check.fault] },
    );
  }

  const voter = sitting.roster.people.find((p) => p.id === personId);
  const previous = decision.votes.find((v) => v.personId === personId) ?? null;
  const sheetDate = new Date(`${votedAt}T00:00:00.000Z`);
  const text = typeof comment === "string" ? comment.trim() : "";

  const vote = await auditedUpsert(
    {
      organisationId: sitting.organisationId,
      entity: "Vote",
      entityLabel: `${voter?.name ?? "Member"} on ${decision.subject}`,
    },
    previous && { choice: previous.choice, comment: previous.comment, votedAt: previous.votedAt },
    { choice, comment: text, votedAt: sheetDate },
    (tx) =>
      tx.vote.upsert({
        where: { decisionId_personId: { decisionId: id, personId } },
        update: { choice: choice as "SETUJU" | "TIDAK_SETUJU", comment: text, votedAt: sheetDate, recordedAt: new Date() },
        create: { decisionId: id, personId, choice: choice as "SETUJU" | "TIDAK_SETUJU", comment: text, votedAt: sheetDate },
      }),
  );

  return Response.json(
    { id: vote.id, choice: vote.choice, votedAt, entitled: assessment?.entitledIds.length ?? 0 },
    { status: 200 },
  );
}
