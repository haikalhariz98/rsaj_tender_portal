/**
 * Whether a collapsible section starts open (note 0005 R13, ruling 2). Pure: a screen describes what the section holds
 * and this answers. A section starts open only if it holds one of the reasons below, and starts closed otherwise.
 * An edit button alone is not a reason, or every draft would open everything.
 */
export interface SectionHolds {
  /// A warn or err finding.
  finding?: boolean;
  /// A step addressed to the viewer, or a fix the section requires.
  actNow?: boolean;
  /// A section 3.7 or R4 must-keep item (a rule label and clause at a decision point, a route warning, a refusal naming who can act, SULIT).
  mustKeep?: boolean;
  /// A pending or sent-back route, or the first unfinished part of an ordered sequence.
  inProgress?: boolean;
  /// A policy value shown with its provenance.
  policyWithProvenance?: boolean;
  /// A result the viewer has just asked for.
  requestedResult?: boolean;
}

/// The section a link or address points at: `?section=` or an `#anchor`.
export function isTarget(id: string | undefined, target: string | null | undefined): boolean {
  if (!id || !target) return false;
  return id === target.replace(/^#/, "");
}

export function startsOpen(holds: SectionHolds, opts: { id?: string; target?: string | null } = {}): boolean {
  return (
    isTarget(opts.id, opts.target) ||
    !!(holds.finding || holds.actNow || holds.mustKeep || holds.inProgress || holds.policyWithProvenance || holds.requestedResult)
  );
}

/// The first unfinished part of an ordered sequence is the one open part; earlier parts are finished and later ones wait.
export function currentPartIndex(finished: readonly boolean[]): number {
  return finished.findIndex((f) => !f);
}
