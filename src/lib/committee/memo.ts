/**
 * The not-approved memo (FR-CTE-009): "a not-approved decision ... issues a memo to the Implementing Department notifying the decision."
 *
 * Email is not connected (INT-09), so the memo is issued as a notice in the portal, to the people the organisation's own notification rule names. Who is told
 * is the organisation's choice, never the product's: the rule for the event `NOT_CARRIED_EVENT_KEY` names the offices (a NotificationRule), and the holders of
 * those offices, for the matter's unit, are told. Four things can happen, and the panel says which, in words, as it stood when the matter was decided:
 *
 * - ISSUED: the rule names offices and someone holds them. The memo was written as a notice to each.
 * - NO_RULE: no rule is configured for the event. Nobody is picked in its place; the memo is not issued, and the panel names the setting.
 * - RULE_OFF: the rule is switched off, which records that this event deliberately notifies nobody.
 * - NO_ONE_HOLDS: the rule names offices that nobody holds for the matter's unit on the day. Not issued, and said.
 * - NO_TIME_ZONE: the rule names offices, but the organisation's time zone is not set, so "the day" is not known and nobody can be said to hold anything. Not issued,
 *   and said as that, never as "nobody holds it" (Phase 3c review).
 *
 * `null` is a fourth, honest, thing: nothing is recorded (a matter decided before the memo was issued in the portal).
 *
 * Pure.
 */

export const MEMO_STATES = ["ISSUED", "NO_RULE", "RULE_OFF", "NO_ONE_HOLDS", "NO_TIME_ZONE"] as const;
export type MemoState = (typeof MEMO_STATES)[number];

export interface MemoRule {
  isActive: boolean;
  recipientRoleCodes: readonly string[];
}

export type MemoPlan = { state: "ISSUED"; recipientIds: string[] } | { state: Exclude<MemoState, "ISSUED"> };

/// Who the memo goes to, from the rule and the holders of the offices it names. `holdersOf` gives the people who hold an office for the matter's unit today. `dayKnown` is
/// false where the organisation's time zone is not set: no one can then be found to hold an office, which is not the same as nobody holding it.
export function memoPlan(rule: MemoRule | null, holdersOf: (officeCode: string) => readonly string[], dayKnown = true): MemoPlan {
  if (!rule) return { state: "NO_RULE" };
  if (!rule.isActive) return { state: "RULE_OFF" };
  if (!dayKnown) return { state: "NO_TIME_ZONE" };
  const ids = [...new Set(rule.recipientRoleCodes.flatMap((c) => holdersOf(c)))].sort();
  return ids.length > 0 ? { state: "ISSUED", recipientIds: ids } : { state: "NO_ONE_HOLDS" };
}

/// What the decision panel says about the memo. `told` is how many people the notice was written to, for ISSUED.
export function memoWords(state: string | null, told: number): { short: string; text: string; tone: "ok" | "warn" | "neutral" } {
  switch (state) {
    case "ISSUED":
      return { short: "Memo issued", text: `Memo issued in the portal to ${told} ${told === 1 ? "person" : "people"}. Shown in the portal; not sent — email is not connected (INT-09).`, tone: "ok" };
    case "NO_RULE":
      return { short: "Memo not issued", text: "Memo not issued: no notification rule is set for a matter not carried, so nobody was picked to be told. Set one under Configuration, Notifications.", tone: "warn" };
    case "RULE_OFF":
      return { short: "Memo not issued", text: "Memo not issued: the notification rule for a matter not carried is switched off, which records that nobody is to be told.", tone: "warn" };
    case "NO_ONE_HOLDS":
      return { short: "Memo not issued", text: "Memo not issued: nobody holds the offices the notification rule names for this matter's unit.", tone: "warn" };
    case "NO_TIME_ZONE":
      return { short: "Memo not issued", text: "Memo not issued: the organisation's time zone is not set, so who holds the offices the notification rule names could not be worked out. Set it under Configuration, Organisation, and tell the department by hand.", tone: "warn" };
    default:
      return { short: "No memo recorded", text: "No memo is recorded: this matter was decided before memos were issued in the portal.", tone: "neutral" };
  }
}
