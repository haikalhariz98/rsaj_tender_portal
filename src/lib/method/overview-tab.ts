/**
 * Which tab of an exercise an address names (founder, 2026-10-05). Classification and Contract type
 * became one Overview, so their old addresses (`?tab=classification`, `?tab=contract`, kept in links
 * and bookmarks) open it, and so does no tab at all, or one this exercise does not have (a Proposal
 * tab on a method that asks for none): the strip would open its first tab, the Overview, whatever
 * the address says, so the server must read the same one.
 */

export const OVERVIEW_TAB = "overview";
/// The tabs an old address named, now the Overview.
export const OVERVIEW_ALIASES: readonly string[] = ["classification", "contract"];

export function activeTabOf(asked: string | undefined, available: readonly string[]): string {
  if (!asked || OVERVIEW_ALIASES.includes(asked)) return OVERVIEW_TAB;
  return available.includes(asked) ? asked : OVERVIEW_TAB;
}
