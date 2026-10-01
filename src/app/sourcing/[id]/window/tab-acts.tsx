import type { ReactNode } from "react";

import { RequestCancellationDrawer, RequestChangeDrawer } from "./editors";
import type { WindowContext } from "./window-section";

type Allowed = { allowed: true } | { allowed: false; reason: string };

/// The acts of the Invitation tab as a whole, as `invitationActs` / `windowTab` judge them.
export interface TabActs {
  correct: Allowed;
  extend: Allowed;
  cancel: Allowed;
  closing: string;
  lastDayOfSale: string | null;
}

/**
 * The header's acts that belong to the Invitation TAB, not to the section open: correct the closing
 * before publication, extend it and cancel the exercise after. One component for every section, so
 * the header reads the same wherever the officer is (UX U6): the same label, the same state, the
 * same reason. A published exercise is cancelled on its route, so `cancel` replaces the page's own.
 */
export function tabActs(a: TabActs, c: WindowContext): { actions: ReactNode; notes: [string, string][]; cancel: ReactNode | null } {
  const pre = c.status === "APPROVED_FOR_TENDERING";
  const live = c.status === "ADVERTISED" || c.status === "INVITED";
  if (!pre && !live) return { actions: null, notes: [], cancel: null };
  const notes: [string, string][] = [];
  const note = (label: string, x: Allowed) => !x.allowed && notes.push([label, x.reason]);
  if (pre) note("Correct the closing", a.correct);
  else {
    note("Extend the closing", a.extend);
    note("Cancel exercise", a.cancel);
  }
  return {
    actions: (
      <>
        {pre && <RequestChangeDrawer exerciseId={c.exerciseId} kind="CORRECTION" allowed={a.correct} closing={a.closing} lastDayOfSale={a.lastDayOfSale} />}
        {live && <RequestChangeDrawer exerciseId={c.exerciseId} kind="EXTENSION" allowed={a.extend} closing={a.closing} lastDayOfSale={a.lastDayOfSale} />}
      </>
    ),
    notes,
    cancel: live ? <RequestCancellationDrawer exerciseId={c.exerciseId} allowed={a.cancel} reference={c.reference} /> : null,
  };
}
