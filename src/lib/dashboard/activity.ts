/**
 * The dashboard's "Recent activity", made from the audit trail.
 *
 * The trail has no semantic actions, only CREATE / UPDATE / DELETE with field changes,
 * so an event is a rule on entity + action + field transition. This module holds those
 * rules, pure and tested.
 *
 * What it will never produce: a vote, a recusal, attendance, or a configuration change.
 * Those entities are not in `ACTIVITY_ENTITIES`, and an entry of a listed entity never
 * has its counts, voting rule or people read out of it. Lines name offices, never a
 * person, even where a row carries `decidedBy` or `signedBy`. An actor is never inferred.
 * An escalation never carries its reason: for a declared conflict that is the
 * declaration itself.
 */
import { formatDate, formatOrgDay } from "@/lib/format";

import type { FieldChange } from "@/lib/audit/diff";
import { EXERCISE_STATUSES, type ExerciseStatus } from "@/lib/method/types";

/// The feed's line for an exercise's move into each state (X-8: exhaustive). A return to
/// preparation from approval for tendering is the documents returned for amendment (Q-3).
const EXERCISE_MOVE_HEADLINE: Record<ExerciseStatus, (ref: string, from: string | null) => string | null> = {
  DRAFT: () => null,
  DOCUMENTS_IN_PREPARATION: (ref, from) => (from === "PENDING_APPROVAL_FOR_TENDERING" ? `Exercise ${ref}: tender documents returned for amendment` : `Exercise ${ref} moved into preparation`),
  PENDING_APPROVAL_FOR_TENDERING: (ref) => `Exercise ${ref}: tender documents sent for approval`,
  APPROVED_FOR_TENDERING: (ref) => `Exercise ${ref} approved for tendering`,
  ADVERTISED: (ref) => `Exercise ${ref} advertised`,
  INVITED: (ref) => `Exercise ${ref}: letters of invitation issued`,
  // 6.7: the opening's acts, never a price or a bidder (C-4).
  OPENING_IN_PROGRESS: (ref) => `Exercise ${ref}: tender box opened at its opening`,
  OPENED: (ref) => `Exercise ${ref}: opening finalised`,
  CANCELLED: (ref) => `Exercise ${ref} cancelled`,
};

/// The only entities the feed reads. Everything else, including `Vote`,
/// `DecisionRecusal`, `MeetingAttendance` and every configuration entity, is absent on
/// purpose; the loader filters on this list so those rows are never fetched.
export const ACTIVITY_ENTITIES = ["Requisition", "ApprovalStep", "SourcingExercise", "Meeting", "CommitteeDecision", "Award"] as const;

export type ActivityKind = "requisition" | "approval" | "exercise" | "sitting" | "matter" | "award";

export interface ActivityEntry {
  id: string;
  entity: string;
  entityId: string;
  entityLabel: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  changes: FieldChange[];
  reason: string;
  at: Date;
}

/// The record an approval step or a tabled matter belongs to, found by the loader.
export interface ActivityOwner {
  kind: "requisition" | "award" | "exercise" | "sitting";
  id: string;
  reference: string;
  /// The committee of a sitting.
  committee: string | null;
}

/// What a line is about, for collapsing and for linking.
export interface ActivityLine {
  /// The audit entry the line stands on.
  key: string;
  kind: ActivityKind;
  headline: string;
  /// The record's title, where the trail carries one.
  title: string | null;
  /// A short reason, where the act carries one.
  reason: string | null;
  at: Date;
  /// The organisation's day, already formatted.
  day: string;
  /// Where it links. Null when the record cannot be found: plain text then.
  link: { kind: "requisition" | "award" | "exercise" | "sitting"; id: string } | null;
}

/// A line before it is collapsed: what happened, kept apart from how it reads.
interface Fact {
  line: ActivityLine;
  ownerKey: string | null;
  /// The status moved to, for a status change.
  to: string | null;
  from: string | null;
  /// For a step: the office, and how it was decided.
  office: string | null;
  step: "DONE" | "REJECTED" | "ESCALATED" | null;
  /// The subject the headline begins with ("REQ/1", "Award AWD/1").
  subject: string;
}

const SEP = " · ";
const REASON_MAX = 120;

const field = (changes: FieldChange[], name: string) => changes.find((c) => c.field === name);
const status = (changes: FieldChange[]) => field(changes, "status");

/// The part of a label before the first separator: a reference.
const refOf = (label: string) => label.split(SEP)[0].trim();
/// What follows the reference: a title.
const titleOf = (label: string) => {
  const i = label.indexOf(SEP);
  return i < 0 ? null : label.slice(i + SEP.length).trim() || null;
};

function shortReason(text: string | null | undefined): string | null {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.length <= REASON_MAX ? t : `${t.slice(0, REASON_MAX - 1).trimEnd()}…`;
}

const REQUISITION_VERB: Record<string, string> = {
  ENDORSED: "endorsed",
  REGISTERED: "registered",
  OVER_BUDGET: "is over budget",
  APPROVED: "approved",
  RECALLED: "recalled",
  CANCELLED: "cancelled",
  CLOSED: "closed",
};

const AWARD_VERB: Record<string, string> = {
  PENDING_APPROVAL: "sent for approval",
  APPROVED: "approved",
  ISSUED: "issued",
  ACCEPTED: "accepted",
  CANCELLED: "cancelled",
};

const OUTCOME_VERB: Record<string, string> = {
  CARRIED: "carried",
  NOT_CARRIED: "not carried",
  DEFERRED: "deferred",
};

const SITTING_VERB: Record<string, string> = {
  IN_PROGRESS: "started",
  MINUTED: "minuted",
  CANCELLED: "cancelled",
};

/// Entities that are their own owner.
const OWN_KIND: Record<string, ActivityOwner["kind"]> = {
  Requisition: "requisition",
  Award: "award",
  SourcingExercise: "exercise",
  Meeting: "sitting",
};

function ownerOf(entry: ActivityEntry, owners: Record<string, ActivityOwner>): ActivityOwner | null {
  const found = owners[`${entry.entity}:${entry.entityId}`];
  if (found) return found;
  const own = OWN_KIND[entry.entity];
  return own ? { kind: own, id: entry.entityId, reference: refOf(entry.entityLabel), committee: null } : null;
}

function build(entry: ActivityEntry, owners: Record<string, ActivityOwner>, timeZone: string | null): Fact | null {
  const owner = ownerOf(entry, owners);
  const ownerKey = owner ? `${owner.kind}:${owner.id}` : null;
  const s = status(entry.changes);
  const make = (
    kind: ActivityKind,
    subject: string,
    verb: string,
    extra: { title?: string | null; reason?: string | null; to?: string | null; from?: string | null; office?: string | null; step?: Fact["step"]; headline?: string } = {},
  ): Fact => ({
    line: {
      key: entry.id,
      kind,
      headline: extra.headline ?? `${subject} ${verb}`,
      title: extra.title ?? null,
      reason: shortReason(extra.reason ?? null),
      at: entry.at,
      day: formatOrgDay(entry.at, timeZone),
      link: owner ? { kind: owner.kind, id: owner.id } : null,
    },
    ownerKey,
    to: extra.to ?? null,
    from: extra.from ?? null,
    office: extra.office ?? null,
    step: extra.step ?? null,
    subject,
  });

  switch (entry.entity) {
    case "Requisition": {
      const ref = refOf(entry.entityLabel);
      const title = titleOf(entry.entityLabel);
      if (entry.action === "CREATE") {
        const fromFinance = /finance system/i.test(entry.reason);
        return make("requisition", ref, fromFinance ? "received from the finance system" : "raised", { title });
      }
      if (entry.action !== "UPDATE" || !s) return null;
      const to = s.after ?? "";
      const from = s.before ?? "";
      let verb: string | null = null;
      let reason: string | null = null;
      if (to === "PENDING_APPROVAL") verb = from === "REJECTED" ? "returned to an earlier step" : "sent for approval";
      else if (to === "DRAFT") verb = from === "REJECTED" ? "sent back to whoever raised it" : null;
      else if (to === "REJECTED") {
        verb = "rejected";
        reason = entry.reason;
      } else verb = REQUISITION_VERB[to] ?? null;
      if (!verb) return null;
      return make("requisition", ref, verb, { title, reason, to, from });
    }
    case "ApprovalStep": {
      if (entry.action !== "UPDATE") return null;
      const parts = entry.entityLabel.split(SEP).map((p) => p.trim());
      const office = parts.length > 1 ? parts[parts.length - 1] : null;
      if (!office) return null;
      const ref = owner?.reference ?? parts[0];
      const escalation = field(entry.changes, "escalation");
      if (escalation) {
        const acting = field(entry.changes, "actingOffice")?.after;
        if (!acting) return null;
        // No reason, ever: an escalation's reason is a declared conflict's own words, or
        // why a holder is away. The feed says the step moved and to which office.
        return make("approval", ref, "", { office, step: "ESCALATED", headline: `${ref}: ${office} step passed to ${acting}` });
      }
      const decision = field(entry.changes, "decision");
      if (decision?.after === "DONE") return make("approval", ref, "", { office, step: "DONE", headline: `${ref}: ${office} decided` });
      if (decision?.after === "REJECTED") return make("approval", ref, "", { office, step: "REJECTED", reason: entry.reason, headline: `${ref}: ${office} rejected` });
      return null;
    }
    case "SourcingExercise": {
      const ref = refOf(entry.entityLabel);
      const title = titleOf(entry.entityLabel);
      if (entry.action === "CREATE") {
        const req = field(entry.changes, "requisition")?.after;
        return make("exercise", ref, "", { title, headline: req ? `Exercise ${ref} opened for ${req}` : `Exercise ${ref} opened` });
      }
      if (entry.action !== "UPDATE" || !s) return null;
      const to = (EXERCISE_STATUSES as readonly string[]).includes(s.after ?? "") ? (s.after as ExerciseStatus) : null;
      const headline = to ? EXERCISE_MOVE_HEADLINE[to](ref, s.before) : null;
      if (!headline) return null;
      return make("exercise", ref, "", { title, to: s.after, from: s.before, ...(to === "CANCELLED" || (to === "DOCUMENTS_IN_PREPARATION" && s.before === "PENDING_APPROVAL_FOR_TENDERING") ? { reason: entry.reason } : {}), headline });
    }
    case "Meeting": {
      const created = entry.action === "CREATE";
      const ref = created ? (field(entry.changes, "reference")?.after ?? refOf(entry.entityLabel)) : (owner?.reference ?? refOf(entry.entityLabel));
      const committee = created
        ? (field(entry.changes, "committee")?.after ?? null)
        : (owner?.committee ?? (entry.entityLabel.endsWith(" sitting") ? entry.entityLabel.slice(0, -" sitting".length) : null));
      const name = committee ? `${committee} sitting` : `Sitting ${ref}`;
      if (created) {
        const day = field(entry.changes, "meetingDate")?.after;
        return make("sitting", name, "", { headline: `${name} scheduled${day ? ` for ${formatDate(day)}` : ""}` });
      }
      if (entry.action !== "UPDATE" || !s) return null;
      const verb = SITTING_VERB[s.after ?? ""];
      if (!verb) return null;
      return make("sitting", name, "", {
        to: s.after,
        from: s.before,
        reason: s.after === "CANCELLED" ? entry.reason : null,
        headline: committee ? `${name} ${ref} ${verb}` : `${name} ${verb}`,
      });
    }
    case "CommitteeDecision": {
      const subject = entry.entityLabel;
      if (entry.action === "CREATE") {
        const at = owner?.committee;
        return make("matter", subject, "", { headline: at ? `${subject} tabled at ${at}` : `${subject} tabled` });
      }
      if (entry.action !== "UPDATE") return null;
      const outcome = field(entry.changes, "outcome");
      const verb = OUTCOME_VERB[outcome?.after ?? ""];
      // The outcome and nothing else. The row also carries who was present, how many
      // were recused and the voting rule; none of that is read.
      if (!verb) return null;
      return make("matter", subject, "", { headline: `${subject}: ${verb}` });
    }
    case "Award": {
      const ref = refOf(entry.entityLabel);
      const label = `Award ${ref}`;
      if (entry.action === "CREATE") return make("award", label, "opened");
      if (entry.action !== "UPDATE") return null;
      const commenced = field(entry.changes, "commencedOn");
      if (commenced?.after && !commenced.before) return make("award", label, "", { headline: `${label}: work commenced ${formatDate(commenced.after)}` });
      if (!s) return null;
      const verb = AWARD_VERB[s.after ?? ""];
      if (!verb) return null;
      return make("award", label, verb, { to: s.after, from: s.before, reason: s.after === "CANCELLED" ? entry.reason : null });
    }
    default:
      return null;
  }
}

/**
 * One audit entry as one line, or null when the feed does not report it.
 * Uncollapsed: see `activityFeed` for how the rows of one act become one line.
 */
export function activityLine(entry: ActivityEntry, owners: Record<string, ActivityOwner> = {}, timeZone: string | null = null): ActivityLine | null {
  return build(entry, owners, timeZone)?.line ?? null;
}

/// Rows written by one act sit within this window. `at` is set when the row is written,
/// not at the start of the transaction, so exact equality would miss them.
const SAME_ACT_MS = 2000;

const TERMINAL_REQUISITION: Record<string, string> = {
  DRAFT: "sent back to whoever raised it",
  CLOSED: "closed",
  PENDING_APPROVAL: "returned to an earlier step",
};

/// Fold the rows of one act into one line. The terminal state wins and carries the
/// step's office.
function fold(group: Fact[]): ActivityLine[] {
  const step = group.find((f) => f.step === "REJECTED" || f.step === "DONE");
  if (!step || group.length < 2) return group.map((f) => f.line);
  const others = group.filter((f) => f !== step);
  const office = step.office!;
  const reason = (f: Fact[]) => f.map((x) => x.line.reason).find(Boolean) ?? null;
  const make = (base: Fact, headline: string, rest: Fact[]): ActivityLine => ({ ...base.line, headline, reason: reason([base, ...rest, step]), at: group[0].line.at, day: group[0].line.day });

  if (step.step === "REJECTED") {
    const rejected = others.find((f) => f.line.kind === "requisition" && f.to === "REJECTED");
    if (rejected) {
      const destination = others.find((f) => f.line.kind === "requisition" && f.from === "REJECTED" && f.to && TERMINAL_REQUISITION[f.to]);
      const end = destination ? ` and ${TERMINAL_REQUISITION[destination.to!]}` : "";
      const used = new Set([step, rejected, destination]);
      const rest = group.filter((f) => !used.has(f));
      return [make(destination ?? rejected, `${rejected.subject} rejected at ${office}${end}`, [rejected]), ...rest.map((f) => f.line)];
    }
    const cancelled = others.find((f) => f.line.kind === "exercise" && f.to === "CANCELLED");
    if (cancelled) {
      const rest = group.filter((f) => f !== step && f !== cancelled);
      return [make(cancelled, `Exercise ${cancelled.subject} cancelled: ${office} refused the name`, []), ...rest.map((f) => f.line)];
    }
    // 6.4 (Q-3): a rejection on the Approval for Tendering route returns the documents for amendment.
    const returned = others.find((f) => f.line.kind === "exercise" && f.to === "DOCUMENTS_IN_PREPARATION" && f.from === "PENDING_APPROVAL_FOR_TENDERING");
    if (returned) {
      const rest = group.filter((f) => f !== step && f !== returned);
      // The step's own reason: the exercise's repeats the headline ("Tender documents returned for amendment: …").
      return [{ ...make(returned, `Exercise ${returned.subject}: tender documents returned for amendment at ${office}`, []), reason: step.line.reason ?? returned.line.reason }, ...rest.map((f) => f.line)];
    }
    return group.map((f) => f.line);
  }

  const approved = others.find((f) => (f.line.kind === "requisition" || f.line.kind === "award") && f.to === "APPROVED");
  if (approved) {
    const rest = group.filter((f) => f !== step && f !== approved);
    return [make(approved, `${approved.subject} approved at ${office}`, []), ...rest.map((f) => f.line)];
  }
  // 6.4: the step that completes the Approval for Tendering route moves the exercise: one line, the outcome.
  const forTendering = others.find((f) => f.line.kind === "exercise" && f.to === "APPROVED_FOR_TENDERING");
  if (forTendering) {
    const rest = group.filter((f) => f !== step && f !== forTendering);
    return [make(forTendering, `Exercise ${forTendering.subject} approved for tendering at ${office}`, []), ...rest.map((f) => f.line)];
  }
  return group.map((f) => f.line);
}

/**
 * The feed: classify, fold each act into one line, newest first, at most `limit`.
 *
 * `owners` is keyed `${entity}:${entityId}` and names the record an approval step, a
 * tabled matter or a sitting belongs to. Without an owner a line is plain text.
 */
export function activityFeed(entries: ActivityEntry[], owners: Record<string, ActivityOwner>, timeZone: string | null, limit = 8): ActivityLine[] {
  const facts = [...entries]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map((e) => build(e, owners, timeZone))
    .filter((f): f is Fact => f !== null);

  // Group rows about one owner that were written in one act.
  const groups: Fact[][] = [];
  const open = new Map<string, Fact[]>();
  for (const f of facts) {
    const g = f.ownerKey ? open.get(f.ownerKey) : undefined;
    if (g && g[g.length - 1].line.at.getTime() - f.line.at.getTime() <= SAME_ACT_MS) {
      g.push(f);
      continue;
    }
    const fresh = [f];
    groups.push(fresh);
    if (f.ownerKey) open.set(f.ownerKey, fresh);
  }

  return groups
    .flatMap(fold)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}
