/**
 * A draft pack's parts take their "mandatory" and "in the Tender Table Document" answers from
 * the configuration when the version is started. When the configuration did not say yet (not
 * set), the draft was left with no way out: it cannot be submitted while an answer is unset,
 * and the answer is set in configuration, not on the draft (code review C2, BD-64-39).
 *
 * The exit is one explicit, audited act on the draft: refresh the parts' two answers from the
 * configuration as it stands. It takes only an answer the configuration now gives; a "not set"
 * in configuration never replaces an answer the part already has, and a frozen version is never
 * refreshed. Pure; the action writes what this returns.
 */

import { yesNoNotSet } from "./labels";

export interface FlagFacts {
  mandatory: boolean | null;
  inTableDocument: boolean | null;
}

export interface FlagChange {
  partCode: string;
  part: string;
  mandatory?: { from: boolean | null; to: boolean };
  inTableDocument?: { from: boolean | null; to: boolean };
}

/// What refreshing would change: each differing answer the configuration now gives.
export function flagChanges(parts: readonly (FlagFacts & { partCode: string; printedNumber: string; label: string })[], configured: readonly (FlagFacts & { code: string })[]): FlagChange[] {
  const out: FlagChange[] = [];
  for (const p of parts) {
    const c = configured.find((x) => x.code === p.partCode);
    if (!c) continue;
    const change: FlagChange = { partCode: p.partCode, part: `${p.printedNumber}. ${p.label}` };
    if (c.mandatory != null && c.mandatory !== p.mandatory) change.mandatory = { from: p.mandatory, to: c.mandatory };
    if (c.inTableDocument != null && c.inTableDocument !== p.inTableDocument) change.inTableDocument = { from: p.inTableDocument, to: c.inTableDocument };
    if (change.mandatory || change.inTableDocument) out.push(change);
  }
  return out;
}

/// How many answers a draft still has not set (neither refreshing nor anything else has given them).
export const unsetFlagCount = (parts: readonly FlagFacts[]) => parts.reduce((n, p) => n + (p.mandatory == null ? 1 : 0) + (p.inTableDocument == null ? 1 : 0), 0);

export type RefreshView = { allowed: true; changes: string[] } | { allowed: false; reason: string };

export const REFRESH_LABEL = "Refresh from configuration";
export const CONFIG_STILL_UNSET = "Configuration does not say yet. Set it under Configuration, Tender documents, then come back.";

/// The refresh as the Parts card offers it; null where there is nothing to refresh and nothing unset.
export function refreshView(parts: readonly (FlagFacts & { partCode: string; printedNumber: string; label: string })[], configured: readonly (FlagFacts & { code: string })[]): RefreshView | null {
  const changes = flagChanges(parts, configured);
  if (changes.length) {
    return {
      allowed: true,
      changes: changes.flatMap((c) => [
        ...(c.mandatory ? [`${c.part}: mandatory, ${yesNoNotSet(c.mandatory.from).toLowerCase()} to ${yesNoNotSet(c.mandatory.to).toLowerCase()}`] : []),
        ...(c.inTableDocument ? [`${c.part}: in the Tender Table Document, ${yesNoNotSet(c.inTableDocument.from).toLowerCase()} to ${yesNoNotSet(c.inTableDocument.to).toLowerCase()}`] : []),
      ]),
    };
  }
  return unsetFlagCount(parts) > 0 ? { allowed: false, reason: CONFIG_STILL_UNSET } : null;
}

/**
 * 64-C2: the refresh writes only the change list the officer confirmed. The drawer carries the
 * list it showed as a key; the act recomputes the list under the pack's lock and refuses when
 * the two differ (configuration saved, or another refresh taken, in between), so nothing the
 * officer did not see is written. The key is the effect, part by part and answer by answer
 * (from and to), in part order; the words shown are not part of it.
 */
export function changeListKey(changes: readonly FlagChange[]): string {
  const entries = [...changes]
    .sort((a, b) => (a.partCode < b.partCode ? -1 : a.partCode > b.partCode ? 1 : 0))
    .map((c) => [c.partCode, c.mandatory ? [c.mandatory.from, c.mandatory.to] : null, c.inTableDocument ? [c.inTableDocument.from, c.inTableDocument.to] : null]);
  return JSON.stringify(entries);
}

export const CHANGED_SINCE_OPENED = "Configuration changed since you opened this; review again.";

/// Null where the confirmed list is the list computed now; otherwise the refusal. A missing confirmation never matches.
export function confirmedChangesFault(confirmed: string | null | undefined, current: readonly FlagChange[]): typeof CHANGED_SINCE_OPENED | null {
  return confirmed != null && confirmed === changeListKey(current) ? null : CHANGED_SINCE_OPENED;
}
