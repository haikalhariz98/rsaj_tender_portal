/**
 * The opening's configuration (6.7, C-5, C-6, OD-4, OD-9), as Configuration saves it. Nothing ships:
 * every value is the customer's, each nullable — not set is never a default, and says what it holds
 * back — and each says where it came from once set. Pure: the actions judge a draft here, inside the
 * transaction that locks the row, and write what `…ToSave` returns.
 *
 * - A sourcing method's opening rules: the committee whose panel opens its bids, and what follows from
 *   a bid by a bidder with no live sale (eliminated or reported). Read live when an opening starts and
 *   frozen on it (BD-67).
 * - The organisation's opening policy: how the schedule counts the tenderers invited (OD-9), and the
 *   words the Grand Summary uses (never borrowed: unset reads the product's own words).
 * - A committee's panel: its size (FR-OPN-002) and its independence rule (FR-CTE-011, C-6).
 * - A person's unit, checked against the configured units.
 */

import type { Finding, InvitedCountReading, Level, Provenance, UnpurchasedConsequence } from "./types";

export type OpeningConfigFault =
  | "UNKNOWN_COMMITTEE"
  | "PROVENANCE_REQUIRED"
  | "PANEL_SIZE_BELOW_ONE"
  | "EXCLUDED_UNIT_REQUIRED"
  | "EXCLUDED_UNIT_UNKNOWN"
  | "EXCLUDED_UNIT_WITHOUT_RULE"
  | "UNIT_UNKNOWN"
  | "LABEL_MS_WITHOUT_EN"
  | "REASON_REQUIRED";

type FieldFinding = Finding<OpeningConfigFault> & { field: string };

function collector() {
  const out: FieldFinding[] = [];
  const f = (code: OpeningConfigFault, field: string, level: Level = "block") => out.push({ code, level, field });
  return { out, f };
}

// ------------------------------------------------------------------ a method's opening rules

export interface MethodOpeningDraft {
  committeeCode: string | null;
  committeeProvenance: Provenance | null;
  unpurchased: UnpurchasedConsequence | null;
  unpurchasedProvenance: Provenance | null;
}

export function methodOpeningFaults(d: MethodOpeningDraft, known: { committees: readonly string[] }): FieldFinding[] {
  const { out, f } = collector();
  if (d.committeeCode != null && !known.committees.includes(d.committeeCode)) f("UNKNOWN_COMMITTEE", "openingCommitteeCode");
  if (d.committeeCode != null && !d.committeeProvenance) f("PROVENANCE_REQUIRED", "openingCommitteeProvenance");
  if (d.unpurchased != null && !d.unpurchasedProvenance) f("PROVENANCE_REQUIRED", "unpurchasedProvenance");
  return out;
}

/// What is stored: an unset value carries no provenance.
export const methodOpeningToSave = (d: MethodOpeningDraft) => ({
  openingCommitteeCode: d.committeeCode,
  openingCommitteeProvenance: d.committeeCode == null ? null : d.committeeProvenance,
  unpurchasedBidConsequence: d.unpurchased,
  unpurchasedProvenance: d.unpurchased == null ? null : d.unpurchasedProvenance,
});

/// How many of the methods' opening rules are not set: two per method that receives bids.
export const openingRulesNotSet = (methods: readonly { openingCommitteeCode: string | null; unpurchasedBidConsequence: string | null }[]) =>
  methods.reduce((n, m) => n + (m.openingCommitteeCode == null ? 1 : 0) + (m.unpurchasedBidConsequence == null ? 1 : 0), 0);

// ------------------------------------------------------------------ the organisation's opening policy

export interface OpeningPolicyDraft {
  invitedCountReading: InvitedCountReading | null;
  invitedCountProvenance: Provenance | null;
  qualifiedLabelEn: string | null;
  qualifiedLabelMs: string | null;
  notQualifiedLabelEn: string | null;
  notQualifiedLabelMs: string | null;
  lowestLabelEn: string | null;
  lowestLabelMs: string | null;
  labelsProvenance: Provenance | null;
}

const LABEL_PAIRS = [
  ["qualifiedLabelEn", "qualifiedLabelMs"],
  ["notQualifiedLabelEn", "notQualifiedLabelMs"],
  ["lowestLabelEn", "lowestLabelMs"],
] as const;

export function openingPolicyFaults(d: OpeningPolicyDraft): FieldFinding[] {
  const { out, f } = collector();
  if (d.invitedCountReading != null && !d.invitedCountProvenance) f("PROVENANCE_REQUIRED", "invitedCountProvenance");
  // A Malay word with no English one would render "the product's own words" on an English screen beside the customer's on a Malay one.
  for (const [en, ms] of LABEL_PAIRS) if (d[ms] && !d[en]) f("LABEL_MS_WITHOUT_EN", en);
  if (LABEL_PAIRS.some(([en]) => d[en]) && !d.labelsProvenance) f("PROVENANCE_REQUIRED", "labelsProvenance");
  return out;
}

export const openingPolicyToSave = (d: OpeningPolicyDraft) => {
  const anyLabel = LABEL_PAIRS.some(([en]) => d[en]);
  return {
    ...d,
    invitedCountProvenance: d.invitedCountReading == null ? null : d.invitedCountProvenance,
    labelsProvenance: anyLabel ? d.labelsProvenance : null,
  };
};

/// Whether the reading that blocks finalising is set (the labels never block: unset reads the product's words).
export const openingPolicyNotSet = (p: { invitedCountReading: string | null } | null) => (p?.invitedCountReading == null ? 1 : 0);

// ------------------------------------------------------------------ a committee's panel

export interface CommitteePanelDraft {
  panelSize: number | null;
  panelSizeProvenance: Provenance | null;
  panelExclusionRule: boolean | null;
  panelExcludesUnitCode: string | null;
  panelExclusionProvenance: Provenance | null;
}

/**
 * C-6: a size, once set, is at least one and says where it came from. An exclusion rule that applies
 * names a configured unit; one that does not names none; either says where it came from. A change
 * asks for a reason (FR-OPN-002: "a change is audited with a reason").
 */
export function committeePanelFaults(d: CommitteePanelDraft, known: { units: readonly string[] }, reason: string, changed: boolean): FieldFinding[] {
  const { out, f } = collector();
  if (d.panelSize != null && d.panelSize < 1) f("PANEL_SIZE_BELOW_ONE", "panelSize");
  if (d.panelSize != null && !d.panelSizeProvenance) f("PROVENANCE_REQUIRED", "panelSizeProvenance");
  if (d.panelExclusionRule === true && !d.panelExcludesUnitCode) f("EXCLUDED_UNIT_REQUIRED", "panelExcludesUnitCode");
  if (d.panelExclusionRule === true && d.panelExcludesUnitCode && !known.units.includes(d.panelExcludesUnitCode)) f("EXCLUDED_UNIT_UNKNOWN", "panelExcludesUnitCode");
  if (d.panelExclusionRule !== true && d.panelExcludesUnitCode) f("EXCLUDED_UNIT_WITHOUT_RULE", "panelExcludesUnitCode");
  if (d.panelExclusionRule != null && !d.panelExclusionProvenance) f("PROVENANCE_REQUIRED", "panelExclusionProvenance");
  if (changed && !reason.trim()) f("REASON_REQUIRED", "reason");
  return out;
}

export const committeePanelToSave = (d: CommitteePanelDraft) => ({
  panelSize: d.panelSize,
  panelSizeProvenance: d.panelSize == null ? null : d.panelSizeProvenance,
  panelExclusionRule: d.panelExclusionRule,
  panelExcludesUnitCode: d.panelExclusionRule === true ? d.panelExcludesUnitCode : null,
  panelExclusionProvenance: d.panelExclusionRule == null ? null : d.panelExclusionProvenance,
});

// ------------------------------------------------------------------ a person's unit

/// Null is "not recorded" (a panel judged by an independence rule cannot be assigned with them); a code must be a configured unit.
export const personUnitFault = (code: string | null, units: readonly string[]): OpeningConfigFault | null => (code != null && !units.includes(code) ? "UNIT_UNKNOWN" : null);

// ------------------------------------------------------------------ words

export const OPENING_CONFIG_FAULT_TEXT: Readonly<Record<OpeningConfigFault, string>> = {
  UNKNOWN_COMMITTEE: "That committee is not configured. Choose one from Configuration, Committees.",
  PROVENANCE_REQUIRED: "Say where this came from.",
  PANEL_SIZE_BELOW_ONE: "A panel has at least one member.",
  EXCLUDED_UNIT_REQUIRED: "Name the unit whose members may not sit on the panel, or say no rule applies.",
  EXCLUDED_UNIT_UNKNOWN: "That unit is not configured. Choose one from Organisation.",
  EXCLUDED_UNIT_WITHOUT_RULE: "A unit is named only where the rule applies.",
  UNIT_UNKNOWN: "That unit is not configured. Choose one from Organisation.",
  LABEL_MS_WITHOUT_EN: "Give the English word as well, or leave both empty.",
  REASON_REQUIRED: "Give the reason for the change.",
};

/// What each opening setting holds back while it is not set, said beside "Not set".
export const OPENING_RULE_UNSET = {
  committee: "No opening can be started under this method until it is set.",
  unpurchased: "A bid from a bidder with no live purchase (or not invited) cannot be judged, so the opening it is read at cannot be finalised until it is set.",
  reading: "The schedule cannot count the tenderers invited, so no opening can be finalised.",
  labels: "Never blocks: the Grand Summary reads",
  panelSize: "No opening can be started with this committee's panel until it is set.",
  exclusion: "A panel is assigned with the warning that it was not checked for independence, and the warning is kept on the opening.",
  unit: "Not recorded. Where a committee has an independence rule, this person cannot sit on its opening panel.",
} as const;

/// When a change applies: an opening reads the rules when it starts and keeps them; a change never reaches one already started.
export const OPENING_RULES_APPLY_TEXT = "Applies to openings started later.";
