/**
 * The linked cards of one contract (3b-ii, B-19). Reads only, each act through its register's own reader: a variation's stage (`factsOf`, `stageOf`), an EOT claim's state
 * (`claimStateFactsOf`, `eotClaimState`), a certificate's status. Their words are the registers' own; nothing of their rules is restated here and no routed value is read.
 */

import { KIND_WORDS, STATUS_WORDS as CERTIFICATE_WORDS } from "@/lib/certificate/labels";
import type { CertificateStatus } from "@/lib/certificate/types";
import { dayOf, dayOrNull } from "@/lib/dates";
import { db } from "@/lib/db";
import { loadMatters } from "@/lib/matter/load";
import { eotClaimState, EOT_STATE_WORDS } from "@/lib/time/claim-state";
import { claimStateFactsOf } from "@/lib/time/view";
import { stageOf } from "@/lib/variation/application";
import { STAGE_WORDS } from "@/lib/variation/labels";
import { factsOf, loadVariations } from "@/lib/variation/load";

import { BOARD_DONE_DAYS } from "../board";
import { LINKED_CERTIFICATE_KINDS, linkedCardColumn, type LinkedCard, type LinkedState } from "../linked";
import type { Day } from "../types";

/** Every act of the contract that is on the board: in progress, or decided or withdrawn in the last 14 days. */
export async function loadLinkedCards(i: { organisationId: string; contractId: string; timeZone: string | null; today: Day | null }): Promise<LinkedCard[]> {
  const day = (d: Date | null | undefined) => (d ? dayOf(d, i.timeZone) : null);
  // Older than this cannot be on the board, whatever the day: the database does not fetch them (a day each side for the zone).
  const since = new Date(Date.now() - (BOARD_DONE_DAYS + 2) * 86_400_000);
  const [variations, matters, certs] = await Promise.all([
    loadVariations(i.contractId),
    loadMatters(i.contractId),
    db.certificate.findMany({
      where: { organisationId: i.organisationId, contractId: i.contractId, kind: { in: [...LINKED_CERTIFICATE_KINDS] }, OR: [{ status: { in: ["DRAFT", "IN_ROUTING", "SIGNING"] } }, { issuedAt: { gte: since } }, { voidedAt: { gte: since } }] },
      select: { id: true, kind: true, status: true, number: true, issuedAt: true, voidedAt: true },
    }),
  ]);
  const out: LinkedCard[] = [];
  const push = (c: Omit<LinkedCard, "column">, s: LinkedState) => {
    const column = linkedCardColumn(s, c.decidedOn, i.today);
    if (column) out.push({ ...c, column });
  };
  for (const v of variations) {
    const state = stageOf(factsOf(v));
    const order = v.orders.find((o) => o.certificate.status === "ISSUED");
    const decidedOn = state === "CERTIFIED" ? day(order?.certificate.issuedAt) : state === "CLOSED" ? dayOrNull(v.closedOn) : null;
    push({ kind: "VARIATION", id: v.id, label: v.reference ? `Variation ${v.reference}` : "Variation (not yet numbered)", stateWords: STAGE_WORDS[state].en, decidedOn }, { kind: "VARIATION", state });
  }
  for (const m of matters) {
    if (!m.eotClaim) continue;
    const c = m.eotClaim;
    const state = eotClaimState(claimStateFactsOf(m));
    const live = [...c.extensions].reverse().find((x) => x.certificate.status === "ISSUED");
    const decidedOn = state === "GRANTED" ? day(live?.certificate.issuedAt) : state === "NOT_ENTITLED" ? dayOrNull(c.determinedOn) : state === "CLOSED" ? day(m.closedAt) : null;
    push({ kind: "EOT_CLAIM", id: c.id, label: m.reference ? `EOT claim ${m.reference}` : "EOT claim (not yet numbered)", stateWords: EOT_STATE_WORDS[state], decidedOn }, { kind: "EOT_CLAIM", state });
  }
  for (const c of certs) {
    const state = c.status as CertificateStatus;
    push({ kind: "CERTIFICATE", id: c.id, label: c.number ? `${KIND_WORDS[c.kind].en} ${c.number}` : KIND_WORDS[c.kind].en, stateWords: CERTIFICATE_WORDS[state].en, decidedOn: day(state === "ISSUED" ? c.issuedAt : c.voidedAt) }, { kind: "CERTIFICATE", state });
  }
  return out;
}
