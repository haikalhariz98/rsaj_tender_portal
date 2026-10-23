import { MoreText } from "./more-text";

/// What a rule's source adds to its popover (SP-18). A written rule (STATED) adds nothing: it is the normal case.
const SOURCE_NOTE: Record<string, string> = {
  OBSERVED: "Usual practice, not a written rule.",
  ASSUMED: "Assumed, not from a written rule.",
};

/// The text of a rule's popover: the rule in a sentence, its clause, and a flag where it is not a written rule. Pure, so a test can hold it.
export function ruleInfoText({ rule, clause, source }: { rule: string; clause?: string | null; source?: string | null }): string {
  return [rule, clause ? `Clause: ${clause}.` : "", source ? (SOURCE_NOTE[source] ?? "") : ""].filter(Boolean).join(" ");
}

/// The rule behind a decision, beside its primary action (NFR-USE-001, FR-APR-019). A gap is not a rule: a route assumed because
/// no rule matches, a quorum not set and a plain "Not set" are shown on the screen itself, never only here.
export function RuleInfo({ rule, clause, source, label = "The rule behind this" }: { rule: string; clause?: string | null; source?: string | null; label?: string }) {
  return <MoreText text={ruleInfoText({ rule, clause, source })} label={label} />;
}
