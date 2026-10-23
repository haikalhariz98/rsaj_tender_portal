import type { ConfigurationChangeKind } from "@/generated/prisma/client";

/**
 * Which configuration changes the organisation's two-person switch covers (ADR 0043 D3). A Record, so a new kind does not compile until
 * it is classified here. Record corrections and lowering a classification change records with legal weight, not settings: never covered.
 */
const COVERED: Record<ConfigurationChangeKind, boolean> = {
  SECURITY_POLICY: true,
  PERMISSION_GRANT: true,
  ADMINISTRATOR_GRANT: true,
  ADMINISTRATOR_REVOKE: true,
  ACCOUNT_CODE: true,
  CONFIGURATION_EDIT: true,
  QUORUM_CHANGE: true,
  OPENING_PANEL_SIZE: true,
  BID_SEALING_POLICY: true,
  CLASSIFICATION_DOWNGRADE: false,
  BASELINE_CORRECTION: false,
  AWARD_TERM_CORRECTION: false,
  CONTRACT_DATE_CORRECTION: false,
  AWARD_RETURN_CORRECTION: false,
};

const kinds = Object.keys(COVERED) as ConfigurationChangeKind[];
export const SWITCH_KINDS: readonly ConfigurationChangeKind[] = kinds.filter((k) => COVERED[k]);
export const ALWAYS_TWO_PERSON: readonly ConfigurationChangeKind[] = kinds.filter((k) => !COVERED[k]);

/// True when a save of this kind applies at once, by the one person who made it. Off to on is one person (it tightens the control); on to
/// off is a SECURITY_POLICY change, decided by a second person like any other while the switch is on.
export function appliesAtOnce(kind: ConfigurationChangeKind, twoPersonChanges: boolean): boolean {
  return !twoPersonChanges && COVERED[kind];
}

/// The reason every audit row of a one-person change carries: the list of changes made by one person is the audit rows with a person
/// actor that carry it (ADR 0043 D3, plan 4.5 G1).
export const ONE_PERSON_REASON = "Applied without a second person: two-person approval is off";

/// A person's own reason with `ONE_PERSON_REASON` after it: what a one-person change records, so the reason they gave is never lost.
export const withOnePersonReason = (reason: string): string => (reason ? `${reason} (${ONE_PERSON_REASON})` : ONE_PERSON_REASON);
