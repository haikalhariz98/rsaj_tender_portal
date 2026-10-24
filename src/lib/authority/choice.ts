import type { Rule } from "./types";

/**
 * Route choices (decision D2, RSAJ answer 16; founder: "make it configurable"). Where the governing documents give two routes for one matter, the
 * matrix holds both, each row carrying its option in words (`choiceOptionEn`), and the customer chooses one: the switch ships, the customer sets
 * it. A choice is keyed by the matter (`domain`). Not made (every `chosen` null), a matter it would route gets no route and says so; once made,
 * the chosen option's rows are true and every other option's false, and false rows are never routed. Pure.
 */

export interface RouteChoice {
  domain: string;
  /// The options in words, in the rows' order.
  options: string[];
  /// The option chosen, or null where the choice is not made.
  chosen: string | null;
}

type ChoiceRow = Pick<Rule, "domain" | "choiceOptionEn" | "chosen">;

/// Every choice of an issue, one per matter with option rows, in the rows' order.
export function routeChoices(rules: readonly ChoiceRow[]): RouteChoice[] {
  const out = new Map<string, RouteChoice>();
  for (const r of rules) {
    if (!r.choiceOptionEn) continue;
    const c = out.get(r.domain) ?? { domain: r.domain, options: [], chosen: null };
    if (!c.options.includes(r.choiceOptionEn)) c.options.push(r.choiceOptionEn);
    if (r.chosen === true) c.chosen = r.choiceOptionEn;
    out.set(r.domain, c);
  }
  return [...out.values()];
}

export const choicesNotMade = (rules: readonly ChoiceRow[]): RouteChoice[] => routeChoices(rules).filter((c) => c.chosen == null);

export type ChoiceFault =
  /// A choice needs two options: one alone is no choice.
  | { fault: "ONE_OPTION"; domain: string; option: string }
  /// The rows of one option disagree on whether it is chosen.
  | { fault: "OPTION_SPLIT"; domain: string; option: string }
  /// More than one option is chosen.
  | { fault: "TWO_CHOSEN"; domain: string; options: string[] }
  /// One option is chosen and another is left undecided rather than passed over.
  | { fault: "OTHER_UNDECIDED"; domain: string; option: string };

/// Why an issue's choices are not well formed (empty: they are). A choice merely not made is no fault: it may go in force so.
export function choiceFaults(rules: readonly ChoiceRow[]): ChoiceFault[] {
  const out: ChoiceFault[] = [];
  for (const c of routeChoices(rules)) {
    if (c.options.length < 2) out.push({ fault: "ONE_OPTION", domain: c.domain, option: c.options[0] });
    const states = c.options.map((option) => {
      const set = new Set(rules.filter((r) => r.domain === c.domain && r.choiceOptionEn === option).map((r) => r.chosen ?? null));
      if (set.size > 1) out.push({ fault: "OPTION_SPLIT", domain: c.domain, option });
      return { option, state: set.size === 1 ? [...set][0] : "split" };
    });
    const chosen = states.filter((s) => s.state === true).map((s) => s.option);
    if (chosen.length > 1) out.push({ fault: "TWO_CHOSEN", domain: c.domain, options: chosen });
    if (chosen.length > 0) for (const s of states) if (s.state === null) out.push({ fault: "OTHER_UNDECIDED", domain: c.domain, option: s.option });
  }
  return out;
}

/// A fault in words, for a refusal. `matter` is the matter's label, never its code.
export function choiceFaultText(f: ChoiceFault, matter: string): string {
  switch (f.fault) {
    case "ONE_OPTION":
      return `${matter}: “${f.option}” is the only option, so there is nothing to choose between. Add the other option or clear it.`;
    case "OPTION_SPLIT":
      return `${matter}: the rows of “${f.option}” disagree on whether it is chosen. Choose again.`;
    case "TWO_CHOSEN":
      return `${matter}: more than one option is chosen (${f.options.map((o) => `“${o}”`).join(", ")}). Choose one.`;
    case "OTHER_UNDECIDED":
      return `${matter}: one option is chosen but “${f.option}” is not set aside. Choose again.`;
  }
}

/// The rows a choice made gives: the chosen option's rows true, every other option row of the matter false. Rows not of the matter, or no option, are untouched.
export function applyChoice<T extends ChoiceRow>(rules: readonly T[], domain: string, option: string): T[] {
  return rules.map((r) => (r.domain === domain && r.choiceOptionEn ? { ...r, chosen: r.choiceOptionEn === option } : r));
}
