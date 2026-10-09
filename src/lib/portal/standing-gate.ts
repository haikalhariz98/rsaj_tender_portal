/**
 * What a supplier's standing lets it DO in the portal (decisions log, 2026-10-09, ruling on 1875(3)). A supplier that is rejected, suspended, blacklisted or whose registration is cancelled may still
 * sign in, to read its own status and why. Every act other than reading and keeping its own account is refused to it, with the standing in words, by one rule: the acts of the portal ask this, so that no
 * act is left that forgets.
 *
 *   TRANSACT        an act towards the organisation: a request for tender documents, a sign-up to a briefing, an addendum acknowledged, a notice, a claim, a diary entry, a signature on a certificate.
 *                   Refused to a rejected supplier and to any standing that bars a sale, a bid or an award (`barred`).
 *   COMPANY_RECORD  keeping its own registration current: a document sent, a change of bank details. Refused to a rejected supplier, a blacklisted one and one whose registration is cancelled. NOT refused
 *                   to a suspended one: the way back from a suspension, above all one on lapse, is to send the renewal, and refusing that would keep the supplier suspended by the rule that suspended it.
 *                   (An open item for the product owner, logged with this change.)
 *
 * Reading, and the supplier's own account (its password, its sessions), are never asked. Pure.
 */

import { STANDING_LABEL } from "@/lib/suppliers/labels";
import { barred, type Standing } from "@/lib/suppliers/standing";

export type PortalActKind = "TRANSACT" | "COMPANY_RECORD";

export interface StandingBar {
  en: string;
  ms: string;
}

const REFUSED_FOR_COMPANY_RECORD: readonly Standing[] = ["BLACKLISTED", "CANCELLED"];

/// Why this supplier may not do this kind of act in the portal, in words, or null where it may.
export function portalStandingBar(i: { status: string; standing: Standing; kind: PortalActKind }): StandingBar | null {
  if (i.status === "REJECTED") {
    return {
      en: "Your registration was not accepted, so this cannot be done from the portal. You can still sign in and read your status.",
      ms: "Pendaftaran anda tidak diterima, jadi ini tidak boleh dilakukan dari portal. Anda masih boleh log masuk dan membaca status anda.",
    };
  }
  const stops = i.kind === "TRANSACT" ? barred(i.standing) : REFUSED_FOR_COMPANY_RECORD.includes(i.standing);
  if (!stops) return null;
  const label = STANDING_LABEL[i.standing];
  return {
    en: `Your company is ${label.en.toLowerCase()} on the supplier register, so this cannot be done from the portal. You can still sign in and read your status and why. Ask the procurement office; anything with a time limit can still be given on paper.`,
    ms: `Syarikat anda ${label.ms.toLowerCase()} pada daftar pembekal, jadi ini tidak boleh dilakukan dari portal. Anda masih boleh log masuk dan membaca status anda dan sebabnya. Tanya pejabat perolehan; apa-apa yang mempunyai had masa masih boleh diberikan di atas kertas.`,
  };
}

/// The finding every domain of the portal refuses with when the standing bars an act (each domain words it from the data, in both languages).
export function standingBarFinding(bar: StandingBar) {
  return { code: "SUPPLIER_STANDING_BARS" as const, level: "block" as const, data: { en: bar.en, ms: bar.ms } };
}
