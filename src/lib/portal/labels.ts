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
