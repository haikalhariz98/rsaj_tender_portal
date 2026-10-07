import { matterIsHidden } from "@/app/_auth/sulit";
import { actFormFromJson, attributionRefusalState, beginActFrom } from "@/app/_auth/act";
import { staffRoute } from "@/app/_auth/route";
import { toAuditActor } from "@/app/_auth/actor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { VOTE_FAULT_MESSAGE } from "@/lib/committee/labels";
import { canVote, VOTE_FAULT_STATUS } from "@/lib/committee/matter";
import { secretariatHoldersOn } from "@/lib/committee/tabling";
import { withLockedSitting } from "@/lib/committee/sittings";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";

/**
 * Record one member's vote on a committee matter.
 *
 * A vote is per member and replaces that member's previous vote on the matter — §7.2
 * is explicit that the model holds individual votes, never one committee position.
 *
 * Body: `{ choice: "SETUJU" | "TIDAK_SETUJU", comment?, votedAt: "YYYY-MM-DD", onBehalfOf?, paperReference?, reason? }`,
 * where `votedAt` is the date on the member's signed sheet.
 *
 * The voter is the signed-in member (Phase 2b, F1): the body never says who is voting. A vote on the member's signed sheet may be recorded for them
 * by the holder of the committee's Secretariat office on the day (`onBehalfOf`, with the sheet's reference or the reason): both people are stored (the
 * attribution names the member and the officer who recorded it), and the vote reads as recorded on their behalf, not signed.
 *
 *   401  nobody is signed in; 403  the request is not from a page of this origin
 *   415  the body is not JSON
 *   400  malformed input, or the old `personId` key (use `onBehalfOf`)
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
  const guard = await staffRoute({ contentTypes: ["application/json"], holder: "HOLDER_CHECKED" });
  if (!guard.ok) return guard.response;
  const scope = guard.actor;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { choice, comment, votedAt } = (body ?? {}) as Record<string, unknown>;
  // The old key is removed (product owner's ruling, decisions log 2026-10-07, 2b(b)): the product's own caller sends `onBehalfOf`. Ignoring `personId` quietly could
  // record the signed-in member's own vote where the caller meant another's, so a body that carries it is refused and told the key to use.
  if (body != null && typeof body === "object" && "personId" in body) {
    return Response.json({ error: "personId is no longer accepted. To record a vote for another member from their signed sheet, send onBehalfOf; a member's own vote names no one." }, { status: 400 });
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

  // The decision first: a matter that is not this organisation's answers as a matter that is not there, whatever else the body says.
  const found = await db.committeeDecision.findUnique({ where: { id, meeting: { committee: { organisationId: scope.organisationId } } }, select: { meetingId: true } });
  // FR-MTD-007: a matter of an exercise restricted to its named people answers as a matter that is not there, and the attempt is logged.
  if (!found || (await matterIsHidden(scope, id))) return Response.json({ error: "Decision not found" }, { status: 404 });

  // Who is voting: the actor, or, where the body says it is recorded for a member, that member, attributed through the wrapper. A loader names no session.
  const form = actFormFromJson(body, { personKey: "onBehalfOf" });
  const begun = await beginActFrom(scope, form, "Vote.person", { personField: "onBehalfOf" });
  if (!begun.ok) return Response.json({ error: begun.state.message ?? Object.values(begun.state.errors ?? {}).join(" ") }, { status: 403 });
  const act = begun.act;
  const personId = act.subjectPersonId;

  // Checked and written under the sitting's row lock, on data read inside the same
  // transaction: an outcome recorded at the same moment either sees this vote or
  // this vote sees the matter decided — never both missing each other.
  let result: Response | null;
  try {
  result = await withLockedSitting(scope, found.meetingId, async (tx, sitting) => {
    const decision = sitting.meeting.decisions.find((d) => d.id === id);
    if (!decision) return Response.json({ error: "Decision not found" }, { status: 404 });

    // A vote recorded for a member is the Secretariat's to record, from the member's signed sheet (F1): only a holder of the committee's Secretariat office on the day.
    if (act.intent.mode === "RECORDED_ON_BEHALF" && !scope.system) {
      const code = sitting.meeting.committee.secretariatRoleCode;
      const holders = secretariatHoldersOn(sitting.roster, code, sitting.today).map((h) => h.id);
      if (!holders.includes(scope.personId)) {
        return Response.json({ error: "A vote is cast by the member signed in. It is recorded for a member only by a holder of the committee's Secretariat office, from the member's signed sheet." }, { status: 403 });
      }
    }

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
    // The vote is attributed whether or not it changed the row: this act said who voted and who recorded it.
    await act.write(tx, vote.id);
    return Response.json({ id: vote.id, choice: vote.choice, votedAt }, { status: 200 });
  });
  } catch (e) {
    // The writer refused the attribution in the vote's own transaction (a race the pre-flight could not see): the vote is not recorded.
    const attribution = attributionRefusalState(e);
    if (attribution) return Response.json({ error: attribution.message }, { status: 409 });
    throw e;
  }

  return result ?? Response.json({ error: "Decision not found" }, { status: 404 });
}
