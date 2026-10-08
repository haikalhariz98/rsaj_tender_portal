/**
 * Marking a person away (product owner, 2026-10-08, ruling on log lines 1770, 1791 and 1781). Recording a person as away changes who decides their pending steps,
 * so it is a configuration act: it needs `configuration.draft`, the key ruled for giving and ending an office. Only the change from available to away needs it:
 * marking someone available again moves nothing, and an edit that leaves them where they were runs nothing. The sweep button on the worklist stays open to any
 * signed-in officer who is not an administrator, because it moves only what the data warrants and gating it could only leave a step stuck.
 *
 * Pure: the action asks `marksAway` and then the permission; the screen asks `markAwayDisabled` to offer or withhold the switch.
 */

/// Whether this save is the change from available to away.
export const marksAway = (wasAvailable: boolean, nowAvailable: boolean): boolean => wasAvailable && !nowAvailable;

/// Said on the person's drawer beside the switch, where the viewer may not turn it on.
export const MARK_AWAY_NEEDS_PERMISSION = "Marking someone away changes who decides their steps, so it needs the permission to draft configuration, which you do not hold. Ask someone who holds it.";

/// Whether the drawer's "Currently away" switch is withheld: it cannot be turned ON without the permission. A person already away can always be marked available again.
export const markAwayDisabled = (personIsAvailable: boolean, mayMarkAway: boolean): boolean => personIsAvailable && !mayMarkAway;
