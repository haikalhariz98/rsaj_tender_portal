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

/**
 * Where an old `?tab=invitation` address lands now (Sourcing Requirements v2, SR-06, ruling 9): the Invitation tab is gone and its
 * sections went where their content did. A saved link, a bookmark and a notification written before keep working: they are never rewritten.
 *
 * - the window, and an address that names no section: Publishing on Tender documents once the documents are approved; before that, what
 *   the window held then (the notice, the fee and the bids' validity) is prepared on Scope and estimate, under Notice and fee;
 * - the sale register: Sales and briefing on Bids and opening;
 * - the briefings: Sales and briefing once the window is live (held, attendance), and Briefing and site visit on Scope and estimate before;
 * - the addenda: Publishing.
 *
 * `live` is the stage the window shows sections at (approved for tendering and every later status): see `invitationStage`.
 */
export function invitationRedirect(section: string | undefined, live: boolean): { tab: string; section: string } {
  switch (section) {
    case "sales":
      return { tab: "bids", section: "sales" };
    case "briefing":
      return live ? { tab: "bids", section: "sales" } : { tab: "scope", section: "briefing" };
    case "addenda":
      return { tab: "documents", section: "publishing" };
    default:
      return live ? { tab: "documents", section: "publishing" } : { tab: "scope", section: "notice" };
  }
}

/// The address an old Invitation link is sent to, for an exercise.
export const invitationRedirectHref = (exerciseId: string, section: string | undefined, live: boolean) => {
  const to = invitationRedirect(section, live);
  return `/sourcing/${exerciseId}?tab=${to.tab}&section=${to.section}`;
};
