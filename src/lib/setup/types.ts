/**
 * The Getting-started checklist (ADR 0043 D4). Its items are product structure, defined in code; what they check is the customer's.
 */
export type SettingsSection = "people" | "approvals" | "purchasing" | "contracts-payments" | "suppliers-portal" | "system";
export type ChecklistKind = "set" | "confirm" | "go-live";
export type ChecklistState = "done" | "todo" | "confirm"; // "confirm": pre-filled, waiting for a named person
export interface ChecklistItem {
  key: string; // configuration key, never shown (AGENTS rule 5)
  section: SettingsSection;
  kind: ChecklistKind;
  label: string; // at most 6 words
  href: string; // the edit page, with the tab where there is one
  state: ChecklistState;
  detail?: string; // the popover; at most 25 words; may name the clause
  confirmedBy?: { name: string; at: Date }; // "confirm" items: the issuer and when
}
