/**
 * Who is told when an award's clock runs late, and what the case page says about it (AC-42; FR-AWD-006 indent expiry, FR-AWD-009 late commencement). Pure: the holders of an office are
 * looked up by the caller and passed in as a function.
 *
 * The organisation's own notification rule names the offices (`NotificationRule.recipientRoleCodes`, by office so a change of holder drops no one). The requisition's requester is the user
 * department's own party to the case, so is told whatever the rule says. The unit-head reading of the first build (design note 0004, F-4) is dropped.
 *
 * A rule that does not exist and a rule that is off are different things: an absent rule is an oversight, an off rule is the organisation's recorded decision that no office is told.
 */

export type ClockKind = "INDENT_EXPIRED" | "COMMENCEMENT_LATE";

/// The configuration keys of the two events. A rule under the second is added in Configuration beside the first.
export const CLOCK_EVENT_KEY: Readonly<Record<ClockKind, string>> = { INDENT_EXPIRED: "award.indent.expired", COMMENCEMENT_LATE: "award.commencement.late" };

export interface ClockRule {
  nameEn: string;
  isActive: boolean;
  recipientRoleCodes: readonly string[];
}

export type ClockPlan = {
  /// RULE_SET: the rule is on. NO_TIME_ZONE: the organisation's day is unknown, so who holds an office cannot be worked out.
  state: "RULE_SET" | "NO_RULE" | "RULE_OFF" | "NO_TIME_ZONE";
  ruleName: string | null;
  /// The requester and the holders, each once, in a fixed order.
  recipientIds: string[];
  /// The offices the rule names that nobody holds today (office codes; the screen resolves their names).
  emptyOffices: string[];
  /// Set only where the requester is known but no longer active: an offboarded person cannot sign in, so is not written a notice that could never be read.
  requesterInactive?: boolean;
};

export function clockPlan(i: { requesterId: string | null; requesterActive?: boolean; rule: ClockRule | null; holdersOf: (officeCode: string) => readonly string[]; dayKnown: boolean }): ClockPlan {
  const inactive = i.requesterId != null && i.requesterActive === false;
  const requester = i.requesterId && !inactive ? [i.requesterId] : [];
  const flag = inactive ? { requesterInactive: true } : {};
  if (!i.rule) return { state: "NO_RULE", ruleName: null, recipientIds: requester, emptyOffices: [], ...flag };
  const ruleName = i.rule.nameEn;
  if (!i.rule.isActive) return { state: "RULE_OFF", ruleName, recipientIds: requester, emptyOffices: [], ...flag };
  if (!i.dayKnown) return { state: "NO_TIME_ZONE", ruleName, recipientIds: requester, emptyOffices: [], ...flag };
  const codes = [...new Set(i.rule.recipientRoleCodes)];
  const emptyOffices = codes.filter((c) => i.holdersOf(c).length === 0);
  const holders = codes.flatMap((c) => i.holdersOf(c));
  return { state: "RULE_SET", ruleName, recipientIds: [...new Set([...requester, ...holders])].sort(), emptyOffices, ...flag };
}

const EVENT_WORDS: Readonly<Record<ClockKind, string>> = { INDENT_EXPIRED: "an expired indent", COMMENCEMENT_LATE: "a late commencement" };
/// Said on both callouts: the notices are portal notices only.
export const CLOCK_NOTICE_CHANNEL = "The notices appear in the inbox only and are not emailed.";

/// What the callout says about who is told. `officeName` resolves an office code to its name. `restricted` is the exercise's: its notices reach only those recipients named on it.
export function clockPlanWords(kind: ClockKind, plan: ClockPlan, officeName: (code: string) => string, opts: { restricted?: boolean } = {}): string {
  const what = EVENT_WORDS[kind];
  const gone = plan.requesterInactive === true;
  const lead = (() => {
    switch (plan.state) {
      case "NO_RULE":
        return `No notification rule names who is to be told of ${what}, so no office is told.${gone ? "" : " The requester is."}`;
      case "RULE_OFF":
        return `The notification rule “${plan.ruleName}” for ${what} is switched off, which records that no office is to be told.${gone ? "" : " The requester is."}`;
      case "NO_TIME_ZONE":
        return `The organisation's time zone is not set, so who holds the offices the notification rule “${plan.ruleName}” names could not be worked out.${gone ? "" : " The requester is told."}`;
      case "RULE_SET":
        return gone ? `The holders of the offices the notification rule “${plan.ruleName}” names are told.` : `The requester and the holders of the offices the notification rule “${plan.ruleName}” names are told.`;
    }
  })();
  const empty = plan.emptyOffices.length > 0 ? ` Nobody holds ${plan.emptyOffices.map(officeName).join(", ")} today, so that office is not told.` : "";
  const left = gone ? " The requester is no longer active and is not told." : "";
  const sealed = opts.restricted ? " This exercise is restricted: a notice reaches only those of them who are named on it." : "";
  return `${lead}${empty}${left}${sealed} ${CLOCK_NOTICE_CHANNEL}`;
}
