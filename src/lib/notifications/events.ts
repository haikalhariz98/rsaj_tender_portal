/// The events a notification rule can listen for: the keys the code reads (each is also
/// exported where it is read, and the test below pins them together), with the name an
/// officer sees. A key is a configuration key and never reaches a screen. A rule on any
/// other key is stored but nothing fires it, so the form offers these and no others.
export const NOTIFICATION_EVENTS: readonly { key: string; label: string }[] = [
  { key: "security.expiring", label: "A security or policy is about to expire" },
  { key: "award.indent.expired", label: "An award's indent has lapsed" },
  { key: "award.commencement.late", label: "A contract has not commenced on time" },
  // ADR 0045 D4: read from wave V step V2 on.
  { key: "award.return.lodged", label: "A contractor sends its award return online" },
  { key: "award.query.raised", label: "A contractor asks a question on an award" },
  { key: "bid.validity.expiring", label: "A bid's validity is about to end" },
  { key: "committee_matter_not_carried", label: "A committee did not carry a matter" },
  { key: "supplier.document.expiring", label: "A supplier's document is about to expire" },
  // Phase 2 close-out stage B (plan section 4.3): read by the contract's Completion tab, offsets from the rule.
  { key: "contract.dlp.ending", label: "A contract's defects liability period is about to end" },
];

/// The list for a new rule: every event that has no rule yet.
export function eventOptions(taken: readonly string[]): { value: string; label: string }[] {
  return NOTIFICATION_EVENTS.filter((e) => !taken.includes(e.key)).map((e) => ({ value: e.key, label: e.label }));
}

export function eventLabel(key: string): string {
  return NOTIFICATION_EVENTS.find((e) => e.key === key)?.label ?? "An event no longer listed";
}
