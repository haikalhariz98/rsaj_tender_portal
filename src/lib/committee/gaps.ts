/**
 * What the committee's configuration leaves unset, and which matters at a sitting it
 * stops (6.10 local review 2).
 *
 * Pure. Which matters a gap affects is read from the same assessment the matters are
 * judged on — each pending matter's blockers — never re-derived, so the banner and the
 * matter cards cannot disagree. An unset quorum or voting rule blocks every matter not
 * yet decided; the alternate question only those where a member with an alternate has
 * recused; an unset Secretariat office only the matters not yet tabled (and any matter
 * still to come). A decided matter is judged on its own snapshot and is never counted.
 */

import type { MatterBlocker, MeetingStatus, VotingRule } from "./matter";
import { isFrozen } from "./meeting";

export type ConfigurationGapKey = "ALTERNATE_FOR_RECUSED" | "QUORUM" | "VOTING_RULE" | "SECRETARIAT";

export interface ConfigurationGap {
  key: ConfigurationGapKey;
  /// One sentence: what is unset, what it stops, and which matters by subject.
  text: string;
  /// The pending matters on the agenda this gap stops.
  matterIds: string[];
}

export interface ConfigurationGapReport {
  /// One string, so it renders and reads as written.
  title: string;
  gaps: ConfigurationGap[];
  /// Pending matters stopped by at least one gap, each counted once, in agenda order.
  affectedMatterIds: string[];
  /// Matters on the agenda: tabled at the sitting and not withdrawn.
  agendaCount: number;
}

export interface GapMatter {
  id: string;
  subject: string;
  outcome: "PENDING" | "CARRIED" | "NOT_CARRIED" | "DEFERRED";
  withdrawn: boolean;
}

const BLOCKER_OF: Record<ConfigurationGapKey, MatterBlocker> = {
  ALTERNATE_FOR_RECUSED: "ALTERNATE_FOR_RECUSED_UNCONFIGURED",
  QUORUM: "QUORUM_UNCONFIGURED",
  VOTING_RULE: "VOTING_RULE_UNCONFIGURED",
  SECRETARIAT: "NOT_TABLED",
};

const WHAT: Record<ConfigurationGapKey, string> = {
  ALTERNATE_FOR_RECUSED:
    "The committee has not said whether an alternate may vote in place of a recused member, so a matter where a member with an alternate recuses cannot be decided",
  QUORUM: "No quorum is set, so no sitting can be certified quorate and no matter decided",
  VOTING_RULE: "No voting rule is set, and none is assumed, so no matter can be carried or voted down",
  SECRETARIAT: "No Secretariat office is set, so nobody may table a matter",
};

const quoted = (s: string) => `“${s}”`;

/// "“A”", "“A” and “B”", "“A”, “B” and “C”".
export function subjectList(subjects: readonly string[]): string {
  const q = subjects.map(quoted);
  return q.length <= 1 ? (q[0] ?? "") : `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}`;
}

const mattersWord = (n: number) => (n === 1 ? "matter" : "matters");

/**
 * The banner's content, or null where nothing is unset or the sitting is frozen (a
 * minuted or cancelled sitting decides nothing more).
 */
export function configurationGaps(i: {
  status: MeetingStatus;
  rules: { quorum: number | null; votingRule: VotingRule | null };
  secretariatRoleCode: string | null;
  matters: readonly GapMatter[];
  /// The sitting's assessment, keyed by matter id: the blockers each matter is judged on.
  assessment: { matters: Record<string, { blockers: readonly MatterBlocker[] }> };
}): ConfigurationGapReport | null {
  if (isFrozen(i.status)) return null;

  const agenda = i.matters.filter((m) => !m.withdrawn);
  const pending = agenda.filter((m) => m.outcome === "PENDING");
  const blockedBy = (key: ConfigurationGapKey) =>
    pending.filter((m) => i.assessment.matters[m.id]?.blockers.includes(BLOCKER_OF[key])).map((m) => m.id);

  // A sitting-wide setting is a gap whether or not a matter is tabled yet; the
  // alternate question exists only where a matter raises it.
  const present: ConfigurationGapKey[] = [];
  if (blockedBy("ALTERNATE_FOR_RECUSED").length > 0) present.push("ALTERNATE_FOR_RECUSED");
  if (i.rules.quorum == null) present.push("QUORUM");
  if (i.rules.votingRule == null) present.push("VOTING_RULE");
  if (!i.secretariatRoleCode) present.push("SECRETARIAT");
  if (present.length === 0) return null;

  const subjectOf = new Map(agenda.map((m) => [m.id, m.subject]));
  const gaps: ConfigurationGap[] = present.map((key) => {
    const matterIds = blockedBy(key);
    const which =
      matterIds.length === 0
        ? ""
        : matterIds.length === pending.length && pending.length > 1
          ? ` It stops every matter not yet decided: ${subjectList(matterIds.map((id) => subjectOf.get(id)!))}.`
          : ` It stops ${subjectList(matterIds.map((id) => subjectOf.get(id)!))}.`;
    return { key, text: `${WHAT[key]}.${which}`, matterIds };
  });

  const hit = new Set(gaps.flatMap((g) => g.matterIds));
  const affectedMatterIds = pending.filter((m) => hit.has(m.id)).map((m) => m.id);
  const n = affectedMatterIds.length;
  const total = agenda.length;

  let title: string;
  if (n > 0) {
    title =
      n === total
        ? total === 1
          ? "This committee's configuration stops the one matter on the agenda from being decided"
          : `This committee's configuration stops all ${total} matters on the agenda from being decided`
        : `This committee's configuration stops ${n} of ${total} ${mattersWord(total)} from being decided`;
  } else if (present.every((k) => k === "SECRETARIAT")) {
    title = "This committee's configuration stops anyone tabling a matter at this sitting";
  } else {
    title = "This committee's configuration will stop any matter tabled at this sitting from being decided";
  }

  return { title, gaps, affectedMatterIds, agendaCount: total };
}
