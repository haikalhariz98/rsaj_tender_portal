import { db } from "@/lib/db";

const CHOICES = new Set(["SETUJU", "TIDAK_SETUJU", "ABSTAIN"]);

/**
 * Record one member's vote on a committee decision.
 *
 * A vote is per member and replaces that member's previous vote — §7.2 is explicit
 * that the model must hold individual votes, never one aggregate committee position.
 * Whether the decision as a whole may then be recorded is a separate question,
 * answered by `assessDecision`.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/committees/decisions/[id]/votes">) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { personId, choice, comment } = (body ?? {}) as {
    personId?: unknown;
    choice?: unknown;
    comment?: unknown;
  };

  if (typeof personId !== "string" || personId === "") {
    return Response.json({ error: "personId is required" }, { status: 400 });
  }
  if (typeof choice !== "string" || !CHOICES.has(choice)) {
    return Response.json(
      { error: `choice must be one of ${[...CHOICES].join(", ")}` },
      { status: 400 },
    );
  }

  const decision = await db.committeeDecision.findUnique({
    where: { id },
    select: { id: true, meeting: { select: { committeeId: true, status: true } } },
  });
  if (!decision) return Response.json({ error: "Decision not found" }, { status: 404 });

  if (decision.meeting.status === "MINUTED" || decision.meeting.status === "CANCELLED") {
    return Response.json(
      { error: `The sitting is ${decision.meeting.status.toLowerCase()}; votes can no longer change.` },
      { status: 409 },
    );
  }

  // Only a member of the committee may vote on its decisions.
  const seat = await db.committeeMember.findFirst({
    where: {
      committeeId: decision.meeting.committeeId,
      personId,
      effectiveTo: null,
    },
    select: { id: true },
  });
  if (!seat) {
    return Response.json(
      { error: "That person does not hold a current seat on this committee" },
      { status: 403 },
    );
  }

  const vote = await db.vote.upsert({
    where: { decisionId_personId: { decisionId: id, personId } },
    update: { choice: choice as never, comment: typeof comment === "string" ? comment : undefined },
    create: {
      decisionId: id,
      personId,
      choice: choice as never,
      comment: typeof comment === "string" ? comment : "",
    },
  });

  return Response.json({ id: vote.id, choice: vote.choice }, { status: 200 });
}
