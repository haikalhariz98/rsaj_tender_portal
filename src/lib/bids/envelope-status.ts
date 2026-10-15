/**
 * What an envelope's status means to every reader of the register (wave 3b step 12; ADR 0036 D7, D12; rulings 20u, 20y). Pure.
 *
 * Paper envelopes are RECEIVED, OPENED or WITHDRAWN. An online one adds SUPERSEDED (replaced by the same supplier's later submission before the closing), and its WITHDRAWN
 * has no `BidWithdrawal` letter behind it: the supplier withdrew it through the portal. One place decides each of these so the Received section, the Opening page, the
 * finalising check and the award gate cannot differ, and each is tested once per status.
 */

import type { EnvelopeChannel, EnvelopeFacts, EnvelopeStatus } from "./types";
import type { OnlineBidStatus } from "./online/types";

type Status = Pick<EnvelopeFacts, "status">;

/// An online bid's own status for an envelope's. The two vocabularies differ in one word: the envelope says SUPERSEDED, the bid says REPLACED.
export const ONLINE_STATUS_OF: Readonly<Record<EnvelopeStatus, OnlineBidStatus>> = { RECEIVED: "SUBMITTED", OPENED: "OPENED", WITHDRAWN: "WITHDRAWN", SUPERSEDED: "REPLACED" };

/// Whether the envelope still stands as a bid: not withdrawn, not replaced. Late ones stand until withdrawn.
export const standing = (e: Status) => e.status === "RECEIVED" || e.status === "OPENED";

/// Whether the envelope is out of play: withdrawn, or replaced by a later submission. Neither is ever opened, counted as a bid, or sent for admission.
export const outOfPlay = (e: Status) => !standing(e);

/// Before the opening starts the register names no online withdrawal or replacement (20u: it would show how many there have been, and when). From the start the roll is frozen.
export const shownInRegister = (e: Status & { channel: EnvelopeChannel }, onlineOpeningStarted: boolean) => e.channel !== "ONLINE" || onlineOpeningStarted || standing(e);

/// The Opening page's word for an envelope, and its tone. `withdrawnByLetter`: a `BidWithdrawal` letter names it (paper only; an online withdrawal has none).
export function openingStateOf(e: Status, opened: { listingNo: number | null } | null, withdrawnByLetter: boolean): { state: string; tone: "ok" | "neutral" | "warn" } {
  if (e.status === "OPENED") return { state: `Opened as No. ${opened?.listingNo ?? "—"}`, tone: "ok" };
  if (e.status === "WITHDRAWN" || withdrawnByLetter) return { state: "Withdrawn, not opened", tone: "neutral" };
  if (e.status === "SUPERSEDED") return { state: "Replaced, not opened", tone: "neutral" };
  return { state: "Sealed", tone: "warn" };
}

/// Whether the register offers to record a withdrawn envelope as handed back. Only a paper envelope was ever handed in.
export const returnable = (e: Status & { channel: EnvelopeChannel; returnedUnopenedOn: Date | null }, cancelled: boolean) => e.channel !== "ONLINE" && e.status === "WITHDRAWN" && !e.returnedUnopenedOn && !cancelled;

/// The envelopes in time still sealed at a main opening (not opened, withdrawn or replaced). Online ones are opened at the unseal.
export const unopenedInTime = (envelopes: readonly (Status & Pick<EnvelopeFacts, "kind" | "late">)[]) => envelopes.filter((e) => e.kind !== "COMPANY_ESTIMATE" && !e.late && e.status === "RECEIVED").length;

/// 20y: the late envelopes their committee admitted (CARRIED), which the award waits to see opened at a finalised supplementary opening. A withdrawn or replaced one is not waited for.
export function admittedEnvelopeIdsOf(
  envelopes: readonly (Status & Pick<EnvelopeFacts, "id" | "kind" | "late">)[],
  matters: readonly { bidEnvelopeId: string | null; withdrawn: boolean; outcome: "CARRIED" | "NOT_CARRIED" | "DEFERRED" | null }[],
): string[] {
  return envelopes
    .filter((e) => e.late && e.kind !== "COMPANY_ESTIMATE" && standing(e))
    .filter((e) => matters.some((m) => m.bidEnvelopeId === e.id && !m.withdrawn && m.outcome === "CARRIED"))
    .map((e) => e.id);
}
