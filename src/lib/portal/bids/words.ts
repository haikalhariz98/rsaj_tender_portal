/**
 * My Bids' findings in plain words, English and Malay (AGENTS.md rule 5: no code reaches a screen). A finding names what the supplier can do about it where it can do something.
 */

import { formatDate } from "@/lib/format";

import { REPRESENTATIVE_MAX } from "./signup";
import { COLLECTOR_MAX } from "./checks";
import type { BidFault, BidFinding } from "./types";

export interface Words {
  en: string;
  ms: string;
}
const w = (en: string, ms: string): Words => ({ en, ms });
type Data = Record<string, string | number | null>;

const OWN: Readonly<Record<BidFault, (d: Data) => Words>> = {
  NOT_FOUND: () => w("That exercise is not one you can open.", "Pelawaan itu bukan yang boleh anda buka."),
  NOT_PUBLISHED: () => w("This exercise has not been published yet.", "Pelawaan ini belum diterbitkan."),
  EXERCISE_CANCELLED: () => w("This exercise was cancelled.", "Pelawaan ini telah dibatalkan."),
  WINDOW_CLOSED: () => w("The closing has passed, so this can no longer be done.", "Tarikh tutup telah berlalu, jadi ini tidak boleh dilakukan lagi."),
  WINDOW_NOT_DATED: () => w("The dates of this exercise are not complete, so nothing can be done on it yet. Tell the procurement office.", "Tarikh pelawaan ini belum lengkap, jadi tiada apa yang boleh dilakukan padanya. Maklumkan kepada pejabat perolehan."),
  NOT_INVITED: () => w("This exercise invites named suppliers only, and your company is not on its list.", "Pelawaan ini hanya menjemput pembekal tertentu, dan syarikat anda tiada dalam senarainya."),
  REPRESENTATIVE_REQUIRED: () => w("Give the name of the person you will send.", "Berikan nama orang yang akan anda hantar."),
  REPRESENTATIVE_TOO_LONG: () => w(`The name is longer than ${REPRESENTATIVE_MAX} characters.`, `Nama melebihi ${REPRESENTATIVE_MAX} aksara.`),
  EVENT_NOT_FOUND: () => w("That briefing or site visit is not on this exercise.", "Taklimat atau lawatan tapak itu tiada pada pelawaan ini."),
  EVENT_CANCELLED: () => w("This was cancelled.", "Ini telah dibatalkan."),
  EVENT_HELD: () => w("This has already been held.", "Ini telah diadakan."),
  EVENT_STARTED: () => w("This has already begun.", "Ini telah bermula."),
  EVENT_NOT_DATED: () => w("This has no start time yet, so nobody can sign up for it.", "Ini belum mempunyai masa mula, jadi tiada siapa boleh mendaftar."),
  ALREADY_SIGNED_UP: () => w("Your company is already signed up for this.", "Syarikat anda telah mendaftar untuk ini."),
  NOT_SIGNED_UP: () => w("Your company is not signed up for this.", "Syarikat anda belum mendaftar untuk ini."),
  ADDENDUM_NOT_FOUND: () => w("That addendum is not on this exercise.", "Adendum itu tiada pada pelawaan ini."),
  ADDENDUM_NOT_ISSUED: () => w("That addendum has not been issued.", "Adendum itu belum dikeluarkan."),
  NOT_A_PURCHASER: () => w("Addenda are sent to the companies that bought the documents. Your company has not bought them, so you can read this addendum but not acknowledge it.", "Adendum dihantar kepada syarikat yang membeli dokumen. Syarikat anda belum membelinya, jadi anda boleh membaca adendum ini tetapi tidak boleh mengakuinya."),
  ALREADY_ACKNOWLEDGED: (d) => w(`You acknowledged this addendum${d.on ? ` on ${formatDate(String(d.on))}` : ""}.`, `Anda telah mengakui adendum ini${d.on ? ` pada ${formatDate(String(d.on))}` : ""}.`),
  COLLECTOR_REQUIRED: () => w("Give the name of the person who will collect the documents.", "Berikan nama orang yang akan mengambil dokumen."),
  COLLECTOR_TOO_LONG: () => w(`The name is longer than ${COLLECTOR_MAX} characters.`, `Nama melebihi ${COLLECTOR_MAX} aksara.`),
  REQUEST_STANDS: () => w("You have already asked for the documents. The office is waiting to sell them to you.", "Anda telah meminta dokumen. Pejabat sedang menunggu untuk menjualnya kepada anda."),
  NO_REQUEST: () => w("You have no request for the documents to withdraw.", "Anda tiada permintaan dokumen untuk ditarik balik."),
  ALREADY_BOUGHT: () => w("The documents have already been sold to your company.", "Dokumen telah dijual kepada syarikat anda."),
  // SR-10: buying the documents online and paying for them.
  SOLD_ONLINE: () => w("The documents of this exercise are bought online, not asked for. Open the documents tab and press Buy documents.", "Dokumen pelawaan ini dibeli dalam talian, bukan dipinta. Buka tab dokumen dan tekan Beli dokumen."),
  NOT_SOLD_ONLINE: () => w("The documents of this exercise are not sold online.", "Dokumen pelawaan ini tidak dijual dalam talian."),
  RELEASE_NOT_ONLINE: () => w("The organisation has not set that documents are released online, so they cannot be bought here. Ask the procurement office.", "Organisasi belum menetapkan bahawa dokumen dikeluarkan dalam talian, jadi ia tidak boleh dibeli di sini. Tanya pejabat perolehan."),
  FEE_NOT_SET: () => w("The fee for the documents is not set, so they cannot be bought yet. Tell the procurement office.", "Yuran dokumen belum ditetapkan, jadi ia belum boleh dibeli. Maklumkan kepada pejabat perolehan."),
  PURCHASE_STANDS: () => w("You have already started buying these documents. Open your purchase to pay for it.", "Anda telah mula membeli dokumen ini. Buka pembelian anda untuk membayarnya."),
  NO_PURCHASE: () => w("You have no purchase of these documents to pay for.", "Anda tiada pembelian dokumen ini untuk dibayar."),
  ALREADY_PAID: () => w("This purchase is already paid.", "Pembelian ini telah dibayar."),
  PAYMENT_UNAVAILABLE: (d) => w(String(d.words ?? "Documents cannot be paid for online here."), "Dokumen tidak boleh dibayar dalam talian di sini. Pejabat akan merekodkan bayaran anda."),
  METHOD_NOT_OFFERED: () => w("Choose one of the payment methods offered.", "Pilih salah satu kaedah bayaran yang ditawarkan."),
  NOT_ON_SALE: () => w("The documents are not on sale now, so they cannot be paid for.", "Dokumen tidak dijual sekarang, jadi ia tidak boleh dibayar."),
  PAYMENT_BARRED: (d) => w(String(d.words ?? "The supplier register does not allow the documents to be sold to your company."), "Daftar pembekal tidak membenarkan dokumen dijual kepada syarikat anda."),
  // Decisions log, 2026-10-09, ruling on 1875(3): the supplier's standing bars this act, in its own words (src/lib/portal/standing-gate.ts).
  SUPPLIER_STANDING_BARS: (d) => w(String(d.en ?? ""), String(d.ms ?? "")),
  REQUEST_REFUSED: () => w("The documents cannot be sold to your company at the moment. The reasons are listed above.", "Dokumen tidak boleh dijual kepada syarikat anda buat masa ini. Sebabnya disenaraikan di atas."),
};

export function bidFaultText(f: Pick<BidFinding, "code" | "data">): Words {
  return OWN[f.code]((f.data ?? {}) as Data);
}
export const hasBidFaultText = (code: string): boolean => code in OWN;

export interface FaultView {
  field: string | null;
  level: BidFinding["level"];
  message: string;
  messageMs: string;
}

export const bidFaultViews = (fs: readonly BidFinding[]): FaultView[] =>
  fs.map((f) => {
    const t = bidFaultText(f);
    return { field: null, level: f.level, message: t.en, messageMs: t.ms };
  });
