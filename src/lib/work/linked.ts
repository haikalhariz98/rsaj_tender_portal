/**
 * Linked cards (3b-ii; 0008 §4.6, B-19): a variation, an EOT claim or a certificate in routing, drawn on the Work board and pinned in the List. Pure.
 *
 * A card is drawn from the act and stored nowhere. Its state is the register's own (`Stage`, `EotClaimState`, `CertificateStatus`, read by the register's own reader);
 * this file only says which column that state falls in. The tables are exhaustive, so a state added to a register fails to compile here until it is placed.
 * It reads no routed value: money stays in the registers.
 */

import type { CertificateStatus } from "@/lib/certificate/types";
import type { EotClaimState } from "@/lib/time/claim-state";
import type { Stage } from "@/lib/variation/application";

import { closedRecently } from "./board";
import { LINKED_CARDS_PINNED } from "./bounds";
import type { BoardColumn, Day, LinkedKind } from "./types";

/** Where an act stands, as far as a board cares. */
export type LinkedPhase = "NOT_SENT" | "WORKING" | "ROUTING" | "DECIDED" | "WITHDRAWN";

export type LinkedState = { kind: "VARIATION"; state: Stage } | { kind: "EOT_CLAIM"; state: EotClaimState } | { kind: "CERTIFICATE"; state: CertificateStatus };

const VARIATION_PHASE: Readonly<Record<Stage, LinkedPhase>> = {
  DRAFT: "NOT_SENT",
  WITH_SO: "WORKING",
  TO_SEND: "NOT_SENT",
  AWAITING_APPROVAL: "ROUTING",
  REFUSED_AWAITING_CHOICE: "ROUTING",
  APPROVED: "WORKING",
  EXEMPT: "WORKING",
  INSTRUCTED: "WORKING",
  CERTIFIED: "DECIDED",
  CLOSED: "WITHDRAWN",
};
const EOT_PHASE: Readonly<Record<EotClaimState, LinkedPhase>> = {
  RECORDED: "NOT_SENT",
  ANSWERED: "WORKING",
  HAS_REASONS: "WORKING",
  ENTITLED: "NOT_SENT",
  NOT_ENTITLED: "DECIDED",
  SENT: "ROUTING",
  REFUSED: "ROUTING",
  RETURNED: "NOT_SENT",
  APPROVED: "WORKING",
  CERTIFICATE_RAISED: "WORKING",
  GRANTED: "DECIDED",
  CLOSED: "WITHDRAWN",
};
const CERTIFICATE_PHASE: Readonly<Record<CertificateStatus, LinkedPhase>> = {
  DRAFT: "NOT_SENT",
  IN_ROUTING: "ROUTING",
  SIGNING: "ROUTING",
  ISSUED: "DECIDED",
  VOID: "WITHDRAWN",
};

export function linkedPhase(s: LinkedState): LinkedPhase {
  return s.kind === "VARIATION" ? VARIATION_PHASE[s.state] : s.kind === "EOT_CLAIM" ? EOT_PHASE[s.state] : CERTIFICATE_PHASE[s.state];
}

const COLUMN_OF: Readonly<Record<Exclude<LinkedPhase, "DECIDED" | "WITHDRAWN">, BoardColumn>> = { NOT_SENT: "TO_DO", WORKING: "IN_PROGRESS", ROUTING: "IN_REVIEW" };

/** The column a card sits in; null = not on the board (decided or withdrawn more than 14 days ago, as an item's Done is). */
export function linkedCardColumn(s: LinkedState, decidedOn: Day | null, today: Day | null): BoardColumn | null {
  const p = linkedPhase(s);
  if (p === "DECIDED" || p === "WITHDRAWN") return closedRecently(decidedOn, today) ? "DONE" : null;
  return COLUMN_OF[p];
}

/** The certificates that appear as cards: the ones that move money or the works on their own. A variation's and a claim's own certificates are shown by their act. */
export const LINKED_CERTIFICATE_KINDS = ["INTERIM_PAYMENT", "SUM_ADJUSTMENT", "NON_COMPLETION", "PRACTICAL_COMPLETION", "MAKING_GOOD_DEFECTS", "FINAL"] as const;

export const LINKED_WORDS: Readonly<Record<LinkedKind, { noun: string; open: string; register: string }>> = {
  VARIATION: { noun: "variation", open: "Open variation", register: "Variations" },
  EOT_CLAIM: { noun: "claim", open: "Open claim", register: "Timeline" },
  CERTIFICATE: { noun: "certificate", open: "Open certificate", register: "Certificates" },
};

/** What a drag of a linked card says. */
export const linkedMovesWhen = (k: LinkedKind): string => `Moves when the ${LINKED_WORDS[k].noun} is decided. Open it to act.`;

/** The act's own page. */
export function linkedRegisterHref(contractId: string, k: LinkedKind, id: string): string {
  const base = `/projects/${encodeURIComponent(contractId)}`;
  return k === "VARIATION" ? `${base}/variations/${encodeURIComponent(id)}` : k === "EOT_CLAIM" ? `${base}/eot/${encodeURIComponent(id)}` : `${base}/certificates/${encodeURIComponent(id)}`;
}

/** The address of a linked card's panel: `act=VARIATION:<id>`. Null for anything else. */
export function parseLinkedAddress(v: string | null | undefined): { kind: LinkedKind; id: string } | null {
  const m = /^(VARIATION|EOT_CLAIM|CERTIFICATE):([A-Za-z0-9_-]{1,64})$/.exec(v ?? "");
  return m ? { kind: m[1] as LinkedKind, id: m[2] } : null;
}
export const linkedAddress = (k: LinkedKind, id: string): string => `${k}:${id}`;

/** One card, as the screen draws it. */
export interface LinkedCard {
  kind: LinkedKind;
  id: string;
  /** "Variation 4", "Interim payment certificate 7". */
  label: string;
  /** The register's own words for its state. */
  stateWords: string;
  column: BoardColumn;
  /** The organisation's day it was decided or withdrawn; null while in progress. */
  decidedOn: Day | null;
}

const ORDER: Readonly<Record<BoardColumn, number>> = { TO_DO: 0, IN_PROGRESS: 1, IN_REVIEW: 2, DONE: 3 };

/** The cards that show: those on the board, in the column order and then by label, capped for the List. `more` is how many the cap left out. */
export function pinnedCards(cards: readonly LinkedCard[]): { cards: LinkedCard[]; more: number } {
  const sorted = [...cards].sort((a, b) => ORDER[a.column] - ORDER[b.column] || a.label.localeCompare(b.label, "en", { numeric: true }) || a.id.localeCompare(b.id));
  return { cards: sorted.slice(0, LINKED_CARDS_PINNED), more: Math.max(0, sorted.length - LINKED_CARDS_PINNED) };
}
