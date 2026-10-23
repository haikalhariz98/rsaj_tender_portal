/**
 * "Waiting for me" (plan step 6 §7; PW-11): of the documents and earlier records that wait on the organisation, those the signed-in person is the one to act on. Pure.
 *
 * A row is waiting for me when it waits on the organisation and either:
 * 1. I am a pending approver of its latest version who may decide it; or
 * 2. nobody named may decide it (no pending approver, as on a received kind, an organisation request or an earlier record), and I hold or act in the contract's S.O. office
 *    today.
 * A pending approver who uploaded the latest version may never decide it (PW-6, trigger PA044), so they are not waited on: where every pending approver is one of those, the
 * document can move only when the S.O. office names another approver (PW-25), so it is the office's (decisions log, 2026-10-23). A representative is not the office: they act
 * where a delegation lets them, but nothing waits for them by name.
 */

import type { Side } from "./types";

export interface WaitingFacts {
  waitsOn: Side | null;
  /// From `documentState`: the live approvers who have not decided the latest version. Empty for a kind and for an earlier record.
  pendingApproverPersonIds: readonly string[];
  /// Of those, the ones who uploaded the latest version.
  ownVersionApproverPersonIds: readonly string[];
}

export interface Me {
  personId: string;
  /// I hold the contract's S.O. office today, or act in it.
  holdsOrActsInSo: boolean;
}

export function waitingForMe(row: WaitingFacts, me: Me): boolean {
  if (row.waitsOn !== "ORGANISATION") return false;
  const deciders = row.pendingApproverPersonIds.filter((p) => !row.ownVersionApproverPersonIds.includes(p));
  if (deciders.includes(me.personId)) return true;
  return deciders.length === 0 && me.holdsOrActsInSo;
}
