/**
 * How the audit rows of an issue's core routing are named, and found again.
 *
 * A core routing row or step has no column pointing at the issue in the trail, but every
 * entry's label starts with the issue's own label and "core routing:". Writing the label
 * and reading it back both go through here, so the two cannot drift apart. Issue labels
 * are unique within an organisation, which is what makes the prefix a safe key.
 *
 * Pure.
 */

export const CORE_ROUTING_ENTITIES = ["CoreRoutingLevel", "CoreRoutingStep"] as const;

/// What a record type is called where the trail names it (never the model name).
export const CORE_ROUTING_ENTITY_NAME: Record<(typeof CORE_ROUTING_ENTITIES)[number], string> = {
  CoreRoutingLevel: "Core routing row",
  CoreRoutingStep: "Core routing step",
};

const SEP = " — ";
const MARK = "core routing:";

/// What every core routing entry of this issue begins with.
export const coreRoutingTrailPrefix = (issueLabel: string) => `${issueLabel}${SEP}${MARK}`;

/// The label of an entry for an approving office's row, or for one step beneath it.
export function coreRoutingEntryLabel(issueLabel: string, approvingOffice: string, stepOffice?: string): string {
  const row = `${coreRoutingTrailPrefix(issueLabel)} ${approvingOffice}`;
  return stepOffice === undefined ? row : `${row}${SEP}${stepOffice}`;
}

/// Which part of the core routing an entry is about, without the issue: "Core routing:
/// Chief Executive — Finance Director". Null when the label is not one of this issue's.
export function coreRoutingEntryName(entityLabel: string, issueLabel: string): string | null {
  const prefix = coreRoutingTrailPrefix(issueLabel);
  if (!entityLabel.startsWith(prefix)) return null;
  const rest = entityLabel.slice(prefix.length).trim();
  return rest ? `Core routing: ${rest}` : "Core routing";
}
