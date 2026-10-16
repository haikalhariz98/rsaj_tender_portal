/**
 * Who may write an answer, a verdict or a correction at an opening (security audit of wave 3c, interim fix). Pure.
 *
 * Being signed in as staff is not enough: the opening is the panel's act. The person must be a seated, present member of this opening's panel (on an online opening every named officer is
 * seated and present). Wave 3c replaces this with each officer's confirmation of a column revision; until it lands this closes the door on anyone else.
 */

export const NOT_ON_PANEL = "Only a panel member present at this opening can record this. Nothing was saved.";

export function panelActorFault(panel: readonly { personId: string; present: boolean }[], actorPersonId: string): string | null {
  return panel.some((p) => p.personId === actorPersonId && p.present) ? null : NOT_ON_PANEL;
}
