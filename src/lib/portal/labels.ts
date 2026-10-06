/**
 * The public supplier portal's words, in English and Malay. Screens render `.en` today (there is no
 * language toggle); the Malay line is kept beside it so the bilingual pass needs no rewording.
 *
 * Nothing here is policy. Where a figure, a place or a time varies (the fee, where to buy, where to
 * submit, the closing time), the words point at the notice, which carries what the organisation set.
 */

import { w, type Words } from "@/lib/contract/labels";

export type { Words };

/// The portal's routes, so a link is written once.
export const PORTAL_PATH = {
  home: "/supplier",
  opportunities: "/supplier/opportunities",
  results: "/supplier/results",
  register: "/supplier/register",
  bids: "/supplier/bids",
  projects: "/supplier/projects",
  company: "/supplier/company",
} as const;

export const HOME_TITLE = w("Supplier portal", "Portal pembekal");

export const homeSubtitle = (organisation: string): Words =>
  w(`Tenders and quotations from ${organisation}`, `Tender dan sebut harga daripada ${organisation}`);

export const OPEN_ACCESS_NOTE = w(
  "You do not need an account to read opportunities and results, or to apply to join the supplier register.",
  "Anda tidak perlu akaun untuk membaca peluang dan keputusan, atau untuk memohon menyertai daftar pembekal.",
);

export interface HomeLink {
  key: "opportunities" | "results" | "register";
  href: string;
  title: Words;
  text: Words;
  action: Words;
}

export const HOME_LINKS: readonly HomeLink[] = [
  {
    key: "opportunities",
    href: PORTAL_PATH.opportunities,
    title: w("Opportunities", "Peluang"),
    text: w(
      "Tenders and quotations that are advertised for anyone to bid for: what is wanted, when it closes, and what the documents cost.",
      "Tender dan sebut harga yang diiklankan untuk semua: apa yang diperlukan, bila ditutup dan kos dokumen.",
    ),
    action: w("View opportunities", "Lihat peluang"),
  },
  {
    key: "results",
    href: PORTAL_PATH.results,
    title: w("Results", "Keputusan"),
    text: w(
      "Exercises that have been awarded, and who won them.",
      "Pelawaan yang telah diawardkan, dan siapa pemenangnya.",
    ),
    action: w("View results", "Lihat keputusan"),
  },
  {
    key: "register",
    href: PORTAL_PATH.register,
    title: w("Register as a supplier", "Daftar sebagai pembekal"),
    text: w(
      "Apply to join the supplier register. The procurement office reviews every application.",
      "Mohon menyertai daftar pembekal. Pejabat perolehan menyemak setiap permohonan.",
    ),
    action: w("Apply to register", "Mohon pendaftaran"),
  },
];

export const TAKE_PART_TITLE = w("How to take part", "Cara menyertai");
export const TAKE_PART_SUBTITLE = w(
  "The same steps for every opportunity. Each opportunity's page gives the figures, places and times.",
  "Langkah yang sama untuk setiap peluang. Halaman setiap peluang memberi angka, tempat dan masa.",
);

export const TAKE_PART_STEPS: readonly { title: Words; text: Words }[] = [
  {
    title: w("Check you qualify", "Semak kelayakan anda"),
    text: w(
      "An opportunity lists the registrations a bidder must hold. If you are not on the supplier register yet, apply first.",
      "Setiap peluang menyenaraikan pendaftaran yang perlu dipegang oleh pembida. Jika anda belum berada dalam daftar pembekal, mohon dahulu.",
    ),
  },
  {
    title: w("Buy the documents", "Beli dokumen"),
    text: w(
      "Buy them at the place, and during the dates, that the opportunity states. The fee and the ways to pay are stated there too.",
      "Beli di tempat dan dalam tarikh yang dinyatakan pada peluang. Yuran dan cara bayaran juga dinyatakan di situ.",
    ),
  },
  {
    title: w("Attend any briefing, and read the addenda", "Hadiri taklimat, dan baca adendum"),
    text: w(
      "Where the opportunity lists a briefing or site visit, note its date and place. Any change to the documents is issued as an addendum and is listed on the same page.",
      "Jika peluang menyenaraikan taklimat atau lawatan tapak, catat tarikh dan tempatnya. Sebarang perubahan dokumen dikeluarkan sebagai adendum dan disenaraikan pada halaman yang sama.",
    ),
  },
  {
    title: w("Submit your bid on paper", "Serahkan bida anda secara bertulis"),
    text: w(
      "Hand in your bid in a sealed envelope at the place the opportunity names, before its closing date and time. This portal does not take bids.",
      "Serahkan bida anda dalam sampul surat bertutup di tempat yang dinamakan pada peluang, sebelum tarikh dan masa tutup. Portal ini tidak menerima bida.",
    ),
  },
];

export const SIGN_IN_TITLE = w("Arrives with sign-in", "Akan hadir bersama log masuk");
export const SIGN_IN_SUBTITLE = w(
  "These need to know who you are, so they wait for sign-in.",
  "Bahagian ini perlu tahu siapa anda, jadi ia menunggu log masuk.",
);

export const SIGN_IN_ITEMS: readonly { href: string; title: Words; text: Words }[] = [
  { href: PORTAL_PATH.bids, title: w("My Bids", "Bida saya"), text: w("Your bids and the outcome of each.", "Bida anda dan keputusan setiap satu.") },
  { href: PORTAL_PATH.projects, title: w("My Projects", "Projek saya"), text: w("The contracts you hold.", "Kontrak yang anda pegang.") },
  { href: PORTAL_PATH.company, title: w("Company", "Syarikat"), text: w("Your registration and documents.", "Pendaftaran dan dokumen anda.") },
];

export const SIGN_IN_REASON = w(
  "This part of the portal arrives with sign-in. Until then, opportunities, results and registration are open to everyone.",
  "Bahagian portal ini akan hadir bersama log masuk. Sehingga itu, peluang, keputusan dan pendaftaran terbuka kepada semua.",
);
export const SIGN_IN_BADGE = w("Arrives with sign-in", "Akan hadir bersama log masuk");
export const BACK_TO_PORTAL = w("Back to the supplier portal", "Kembali ke portal pembekal");

/* Opportunities (the public board and an opportunity's page) */

export const OPPORTUNITIES_TITLE = w("Opportunities", "Peluang");
export const opportunitiesSubtitle = (organisation: string): Words =>
  w(`Tenders and quotations advertised by ${organisation}, open to any supplier that qualifies`, `Tender dan sebut harga yang diiklankan oleh ${organisation}, terbuka kepada mana-mana pembekal yang layak`);
export const OPPORTUNITIES_INFO = w(
  "Only exercises that have been advertised are listed. Exercises that invite named suppliers are not shown here. Once an exercise is awarded it leaves this list and appears under Results.",
  "Hanya pelawaan yang diiklankan disenaraikan. Pelawaan yang menjemput pembekal tertentu tidak dipaparkan di sini. Selepas diawardkan, ia keluar daripada senarai ini dan dipaparkan di bawah Keputusan.",
);

export type OpportunityStateKey = "OPEN" | "CLOSED" | "AWARDED" | "CANCELLED";

export const OPPORTUNITY_STATE: Record<OpportunityStateKey, { label: Words; tone: "ok" | "warn" | "err" | "info" | "brand" | undefined }> = {
  OPEN: { label: w("Open", "Dibuka"), tone: "brand" },
  CLOSED: { label: w("Closed", "Ditutup"), tone: undefined },
  AWARDED: { label: w("Awarded", "Diawardkan"), tone: "ok" },
  CANCELLED: { label: w("Cancelled", "Dibatalkan"), tone: "warn" },
};

export const OPPORTUNITY_VIEWS: Record<"open" | "closed" | "cancelled", { label: Words; emptyTitle: Words; emptyBody: Words }> = {
  open: {
    label: w("Open", "Dibuka"),
    emptyTitle: w("Nothing is open for bids right now", "Tiada yang dibuka untuk bida sekarang"),
    emptyBody: w("New opportunities appear here as soon as they are advertised. Closed ones are under Closed.", "Peluang baharu dipaparkan di sini sebaik sahaja diiklankan. Yang telah ditutup berada di bawah Ditutup."),
  },
  closed: {
    label: w("Closed", "Ditutup"),
    emptyTitle: w("Nothing has closed yet", "Belum ada yang ditutup"),
    emptyBody: w("An exercise stays here after its closing until it is awarded.", "Pelawaan kekal di sini selepas tarikh tutup sehingga diawardkan."),
  },
  cancelled: {
    label: w("Cancelled", "Dibatalkan"),
    emptyTitle: w("Nothing has been cancelled", "Tiada yang dibatalkan"),
    emptyBody: w("An advertised exercise that is withdrawn is listed here.", "Pelawaan yang diiklankan dan ditarik balik disenaraikan di sini."),
  },
};

export const OPPORTUNITY_COLUMNS = {
  opportunity: w("Opportunity", "Peluang"),
  method: w("Method", "Kaedah"),
  closing: w("Closing", "Tarikh tutup"),
  status: w("Status", "Keadaan"),
};
export const OPPORTUNITIES_SEARCH = w("Search by title or reference", "Cari mengikut tajuk atau rujukan");
export const OPPORTUNITIES_ALL_TITLE = w("Advertised opportunities", "Peluang yang diiklankan");
export const OPPORTUNITIES_ALL_SUBTITLE = w(
  "Search by title or reference. Open opportunities are listed by soonest closing.",
  "Cari mengikut tajuk atau rujukan. Peluang yang dibuka disenaraikan mengikut tarikh tutup paling hampir.",
);
export const openCount = (n: number): Words => w(`${n} open`, `${n} dibuka`);
export const OPEN_ROW_ACTION = w("View", "Lihat");
export const NOT_SET_UP = {
  title: w("Opportunities are not available yet", "Peluang belum tersedia"),
  body: w(
    "This organisation has not been set up in the system, so there is nothing to list. Please contact the procurement office.",
    "Organisasi ini belum disediakan dalam sistem, jadi tiada apa untuk disenaraikan. Sila hubungi pejabat perolehan.",
  ),
};
export const METHOD_NOT_STATED = w("Method not stated", "Kaedah tidak dinyatakan");

export const DETAIL = {
  back: w("Back to opportunities", "Kembali ke peluang"),
  atAGlance: w("At a glance", "Ringkasan"),
  reference: w("Reference", "Rujukan"),
  method: w("Method", "Kaedah"),
  closing: w("Closing date and time", "Tarikh dan masa tutup"),
  closingFact: (when: string): Words => w(`Closing date and time: ${when}`, `Tarikh dan masa tutup: ${when}`),
  saleDays: (from: string, until: string): Words => w(`${from} to ${until}`, `${from} hingga ${until}`),
  closingNote: w("Bids must be handed in before this time, at the place stated below.", "Bida mesti diserahkan sebelum masa ini, di tempat yang dinyatakan di bawah."),
  submissionPlace: w("Where to hand in your bid", "Tempat menyerahkan bida"),
  notStated: w("Not stated", "Tidak dinyatakan"),
  documents: w("Buying the documents", "Membeli dokumen"),
  documentsSubtitle: w("What the documents cost, and where and when to buy them.", "Kos dokumen, serta tempat dan masa untuk membelinya."),
  fee: w("Fee", "Yuran"),
  feeNotStated: w("The fee is not stated. Ask the procurement office.", "Yuran tidak dinyatakan. Tanya pejabat perolehan."),
  buyAt: w("Buy at", "Beli di"),
  onSale: w("On sale", "Dijual"),
  payBy: w("Ways to pay", "Cara bayaran"),
  inspect: w("Inspect the documents at", "Semak dokumen di"),
  hours: w("Hours", "Waktu"),
  briefings: w("Briefings and site visits", "Taklimat dan lawatan tapak"),
  briefingsSubtitle: w("Dates and places to note.", "Tarikh dan tempat yang perlu dicatat."),
  noBriefings: w("No briefing or site visit is listed for this opportunity.", "Tiada taklimat atau lawatan tapak disenaraikan untuk peluang ini."),
  mandatory: w("You must attend", "Wajib hadir"),
  cancelledEvent: w("Cancelled", "Dibatalkan"),
  whoMayBid: w("Who may bid", "Siapa boleh membida"),
  whoMayBidSubtitle: w("The registrations a bidder must hold.", "Pendaftaran yang mesti dipegang oleh pembida."),
  holdIntro: w("A bidder must hold:", "Pembida mesti memegang:"),
  holdOneOf: w("One of", "Salah satu daripada"),
  noRegistrations: w("No registration is stated for this opportunity.", "Tiada pendaftaran dinyatakan untuk peluang ini."),
  restrictionTitle: w("Restriction on bidders", "Sekatan ke atas pembida"),
  restrictionFallback: w("This opportunity is open only to a restricted set of bidders. See the notice for who may bid.", "Peluang ini hanya terbuka kepada sekumpulan pembida yang terhad. Lihat notis untuk siapa boleh membida."),
  addenda: w("Addenda", "Adendum"),
  addendaSubtitle: w("Changes issued to the documents. Read them before you bid.", "Perubahan yang dikeluarkan pada dokumen. Baca sebelum anda membida."),
  noAddenda: w("No addendum has been issued.", "Tiada adendum dikeluarkan."),
  addendumNumber: (n: number | null): Words => (n == null ? w("Addendum", "Adendum") : w(`Addendum ${n}`, `Adendum ${n}`)),
  issuedOn: (day: string): Words => w(`Issued ${day}`, `Dikeluarkan ${day}`),
  newClosing: (when: string): Words => w(`New closing: ${when}`, `Tarikh tutup baharu: ${when}`),
  notice: w("The notice", "Notis"),
  noticeSubtitle: w("The advertisement as it was published.", "Iklan seperti yang diterbitkan."),
  readNotice: w("Read the notice", "Baca notis"),
  noNotice: w("The published notice is not available.", "Notis yang diterbitkan tidak tersedia."),
  paperOnly: w("Bids are handed in on paper. This portal does not take bids.", "Bida diserahkan secara bertulis. Portal ini tidak menerima bida."),
};

export type SaleStateKey = "NOT_YET" | "OPEN" | "ENDED";

export const SALE_STATE: Record<SaleStateKey, Words> = {
  NOT_YET: w("Sale has not opened yet", "Jualan belum dibuka"),
  OPEN: w("On sale now", "Sedang dijual"),
  ENDED: w("Sale has ended. Bids are still accepted until the closing.", "Jualan telah tamat. Bida masih diterima sehingga tarikh tutup."),
};

export const STATE_BANNER: Record<"CLOSED" | "AWARDED" | "CANCELLED", { title: Words; text: (when: string | null) => Words }> = {
  CLOSED: {
    title: w("This opportunity has closed", "Peluang ini telah ditutup"),
    text: () => w("Bids are no longer accepted. The details below are as they were advertised.", "Bida tidak lagi diterima. Butiran di bawah seperti yang diiklankan."),
  },
  AWARDED: {
    title: w("This opportunity has been awarded", "Peluang ini telah diawardkan"),
    text: () => w("See Results for who it was awarded to. The details below are as they were advertised.", "Lihat Keputusan untuk penerima award. Butiran di bawah seperti yang diiklankan."),
  },
  CANCELLED: {
    title: w("This opportunity has been cancelled", "Peluang ini telah dibatalkan"),
    text: (when) => (when ? w(`It was cancelled on ${when}. Bids are not accepted.`, `Ia dibatalkan pada ${when}. Bida tidak diterima.`) : w("Bids are not accepted.", "Bida tidak diterima.")),
  },
};

export const SITE_EVENT_KIND_WORDS: Record<"BRIEFING" | "SITE_VISIT", Words> = {
  BRIEFING: w("Briefing", "Taklimat"),
  SITE_VISIT: w("Site visit", "Lawatan tapak"),
};
