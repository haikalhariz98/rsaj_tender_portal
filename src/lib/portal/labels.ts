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
  announcements: "/supplier/announcements",
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

// Phase 4e: My Projects and the announcements board are built, so nothing is left arriving with sign-in. The list stays (empty) so the home page and the navigation test keep one source.
export const SIGN_IN_ITEMS: readonly { href: string; title: Words; text: Words }[] = [];

/// The parts of the portal a supplier signs in for, each built: the home page lists them, and each sends a visitor who is not signed in to the sign-in page.
export const SIGNED_IN_TITLE = w("With sign-in", "Dengan log masuk");
export const SIGNED_IN_SUBTITLE = w("Sign in with your company's account to reach these.", "Log masuk dengan akaun syarikat anda untuk mencapai bahagian ini.");
export const SIGNED_IN_LINKS: readonly { key: "bids" | "projects" | "company" | "announcements"; href: string; title: Words; text: Words }[] = [
  { key: "bids", href: PORTAL_PATH.bids, title: w("My Bids", "Bida saya"), text: w("The exercises you take part in, and the notices issued to you.", "Pelawaan yang anda sertai, dan notis yang dikeluarkan kepada anda.") },
  { key: "projects", href: PORTAL_PATH.projects, title: w("My Projects", "Projek saya"), text: w("The contracts you hold: the site diary, your claims, the certificates and your submissions.", "Kontrak yang anda pegang: diari tapak, tuntutan anda, perakuan dan penyerahan anda.") },
  { key: "company", href: PORTAL_PATH.company, title: w("Company", "Syarikat"), text: w("Your registration, documents, bank details and eligibility.", "Pendaftaran, dokumen, butiran bank dan kelayakan anda.") },
  { key: "announcements", href: PORTAL_PATH.announcements, title: w("Announcements", "Pengumuman"), text: w("What the procurement office has published for its suppliers.", "Apa yang diterbitkan pejabat perolehan untuk pembekalnya.") },
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

/* Results (the public list of awarded exercises) */

export const RESULTS = {
  title: w("Results", "Keputusan"),
  subtitle: (organisation: string): Words => w(`Advertised tenders and quotations awarded by ${organisation}`, `Tender dan sebut harga yang diiklankan dan diawardkan oleh ${organisation}`),
  info: w(
    "Only exercises that were advertised and then awarded are listed, with who won them and the day the award was issued. Exercises that invited named suppliers are not shown here.",
    "Hanya pelawaan yang diiklankan dan kemudian diawardkan disenaraikan, bersama pemenang dan tarikh award dikeluarkan. Pelawaan yang menjemput pembekal tertentu tidak dipaparkan di sini.",
  ),
  valueNotPublished: w("The awarded value is not published.", "Nilai award tidak diterbitkan."),
  listTitle: w("Awarded exercises", "Pelawaan yang diawardkan"),
  listSubtitle: w("Search by title, reference or the company that won. The latest awards are first.", "Cari mengikut tajuk, rujukan atau syarikat yang menang. Award terkini di atas."),
  search: w("Search by title, reference or awardee", "Cari mengikut tajuk, rujukan atau penerima award"),
  columns: {
    exercise: w("Opportunity", "Peluang"),
    awardee: w("Awarded to", "Diawardkan kepada"),
    awardedOn: w("Awarded on", "Tarikh award"),
    method: w("Method", "Kaedah"),
    value: w("Awarded value", "Nilai award"),
  },
  awardeeNotStated: w("Not stated", "Tidak dinyatakan"),
  emptyTitle: w("No awards to show yet", "Belum ada award untuk dipaparkan"),
  emptyBody: w(
    "An advertised opportunity appears here once it has been awarded. Open opportunities are under Opportunities.",
    "Peluang yang diiklankan dipaparkan di sini selepas diawardkan. Peluang yang dibuka berada di bawah Peluang.",
  ),
  count: (n: number): Words => w(n === 1 ? "1 award" : `${n} awards`, `${n} award`),
  viewResults: w("View results", "Lihat keputusan"),
  viewOpportunities: w("View opportunities", "Lihat peluang"),
  notSetUp: {
    title: w("Results are not available yet", "Keputusan belum tersedia"),
    body: w(
      "This organisation has not been set up in the system, so there is nothing to list. Please contact the procurement office.",
      "Organisasi ini belum disediakan dalam sistem, jadi tiada apa untuk disenaraikan. Sila hubungi pejabat perolehan.",
    ),
  },
};

// ------------------------------------------------------------------ registration application

/// The public application form's words. The duplicate wording never says who holds a number.
export const APPLY = {
  title: w("Register as a supplier", "Daftar sebagai pembekal"),
  subtitle: (organisation: string): Words => w(`Apply to join the supplier register of ${organisation}`, `Mohon menyertai daftar pembekal ${organisation}`),
  info: w(
    "Sending this form does not register your company. It puts your application in front of the procurement office, which reviews every one.",
    "Menghantar borang ini tidak mendaftarkan syarikat anda. Ia meletakkan permohonan anda di hadapan pejabat perolehan, yang menyemak setiap satu.",
  ),
  backToHome: w("Back to the supplier portal", "Kembali ke portal pembekal"),
  beforeTitle: w("Before you start", "Sebelum anda mula"),
  beforeItems: [
    w("You need the company's registered name, registration number, date incorporated and registered address, as on its certificate.", "Anda memerlukan nama berdaftar, nombor pendaftaran, tarikh diperbadankan dan alamat berdaftar syarikat, seperti pada sijilnya."),
    w("You need a person we can reach: a name, and an email or a mobile number.", "Anda memerlukan seorang yang boleh dihubungi: nama, dan e-mel atau nombor telefon bimbit."),
    w("Nothing is uploaded here, and we do not ask for bank details.", "Tiada apa dimuat naik di sini, dan kami tidak meminta butiran bank."),
    w(
      "The procurement office uses what you enter to review your application. Your contact's details are never shown on the portal. If your company is later awarded an opportunity, its registered name appears on the Results page.",
      "Pejabat perolehan menggunakan apa yang anda masukkan untuk menyemak permohonan anda. Butiran orang yang dihubungi tidak pernah dipaparkan pada portal. Jika syarikat anda kemudian diawardkan sesuatu peluang, nama berdaftarnya dipaparkan pada halaman Keputusan.",
    ),
  ] satisfies Words[],
  companyTitle: w("The company", "Syarikat"),
  companySubtitle: w("As its registration certificate states it.", "Seperti yang dinyatakan pada sijil pendaftarannya."),
  addressTitle: w("Registered address", "Alamat berdaftar"),
  addressSubtitle: w("As its registration certificate states it.", "Seperti yang dinyatakan pada sijil pendaftarannya."),
  contactTitle: w("Who we can reach", "Siapa yang boleh dihubungi"),
  contactSubtitle: w("A person at the company. This is not a sign-in.", "Seorang di syarikat. Ini bukan log masuk."),
  fields: {
    registeredName: w("Registered name", "Nama berdaftar"),
    registrationNo: w("Registration number", "Nombor pendaftaran"),
    entityType: w("Type of company", "Jenis syarikat"),
    country: w("Country", "Negara"),
    companyEmail: w("Company email", "E-mel syarikat"),
    registeredAddress: w("Registered address", "Alamat berdaftar"),
    addressLine1: w("Street address", "Alamat jalan"),
    addressLine2: w("Street address, second line", "Alamat jalan, baris kedua"),
    city: w("City", "Bandar"),
    postcode: w("Postcode", "Poskod"),
    state: w("State", "Negeri"),
    incorporatedOn: w("Date incorporated", "Tarikh diperbadankan"),
    bumiputeraClaim: w("Bumiputera status (declared)", "Status Bumiputera (diisytiharkan)"),
    contactName: w("Name", "Nama"),
    contactDesignation: w("Position", "Jawatan"),
    contactEmail: w("Email", "E-mel"),
    contactPhone: w("Telephone", "Telefon"),
    contactMobile: w("Mobile number", "Nombor telefon bimbit"),
  },
  bumiputeraHint: w("This is what you declare. The procurement office checks it against the certificate you send later. Leave it blank if your company makes no such claim.", "Ini ialah apa yang anda isytiharkan. Pejabat perolehan menyemaknya dengan sijil yang anda hantar kemudian. Biarkan kosong jika syarikat anda tidak membuat tuntutan."),
  incorporatedHint: w("The day the company was incorporated, as its certificate states it.", "Tarikh syarikat diperbadankan, seperti yang dinyatakan pada sijilnya."),
  mobileHint: (dialCode: string | null): Words => (dialCode ? w(`Without the ${dialCode}, which is added for you.`, `Tanpa ${dialCode}, yang ditambah untuk anda.`) : w("With the country code if it is not local.", "Dengan kod negara jika bukan tempatan.")),
  reachHintBoth: w("Give both an email address and a mobile number.", "Berikan kedua-dua alamat e-mel dan nombor telefon bimbit."),
  emailNotVerifiedHint: w("Nothing is e-mailed from this portal, and the address is not checked.", "Tiada e-mel dihantar daripada portal ini, dan alamat ini tidak disahkan."),
  choose: w("Choose", "Pilih"),
  reachHint: w("Give an email or a telephone number, or both.", "Berikan e-mel atau nombor telefon, atau kedua-duanya."),
  numberFormatHint: (example: string): Words => w(`For example ${example}.`, `Contohnya ${example}.`),
  // SR-01 (R1): step 1 of five is sent for checking; the other four open once the office has checked the company.
  submit: w("Send for checking", "Hantar untuk semakan"),
  laterSteps: (organisation: string): Words => w(`Steps 2 to 5 open after ${organisation} has checked the company.`, `Langkah 2 hingga 5 dibuka selepas ${organisation} menyemak syarikat.`),
  stepsLabel: w("Registration steps", "Langkah pendaftaran"),
  /// Under the steps on the public form, where nothing has been accepted yet: step 1 is what is being sent, the rest wait on the office's check.
  stepSubFirst: w("Sent for checking", "Dihantar untuk semakan"),
  stepSubLater: w("After the company is checked", "Selepas syarikat disemak"),
  sending: w("Sending…", "Menghantar…"),
  cantAccept: w("Something in this application could not be accepted, so nothing was sent. Check each field and send it again, or contact the procurement office.", "Sesuatu dalam permohonan ini tidak dapat diterima, jadi tiada apa dihantar. Semak setiap ruangan dan hantar semula, atau hubungi pejabat perolehan."),
  nothingSent: w("Nothing was sent. Check the fields marked below and send it again.", "Tiada apa dihantar. Semak ruangan yang ditanda di bawah dan hantar semula."),
  tooLong: (label: string, max: number): Words => w(`${label} must be ${max} characters or fewer.`, `${label} mestilah ${max} aksara atau kurang.`),
  closedTitle: w("Online applications are not open yet", "Permohonan dalam talian belum dibuka"),
  closedBody: w(
    "The procurement office has not finished setting up the supplier register, so this form cannot take an application yet. Please come back later, or ask the procurement office.",
    "Pejabat perolehan belum selesai menyediakan daftar pembekal, jadi borang ini belum boleh menerima permohonan. Sila datang semula nanti, atau tanya pejabat perolehan.",
  ),
  noOrganisation: w("This organisation has not been set up in the system, so it cannot take applications. Please contact the procurement office.", "Organisasi ini belum disediakan dalam sistem, jadi belum boleh menerima permohonan. Sila hubungi pejabat perolehan."),
  closedMissing: w("Still to be set up:", "Masih perlu disediakan:"),
  notOpenOnSubmit: w("Online applications are not open yet, so nothing was sent.", "Permohonan dalam talian belum dibuka, jadi tiada apa dihantar."),
  tryAgainLater: w("Something went wrong on our side and nothing was sent. Please try again in a few minutes.", "Sesuatu tidak kena di pihak kami dan tiada apa dihantar. Sila cuba lagi dalam beberapa minit."),
  sentTitle: w("Your application was sent", "Permohonan anda telah dihantar"),
  sentNoReference: w("Your application was received.", "Permohonan anda telah diterima."),
  referenceLabel: w("Your reference", "Rujukan anda"),
  keepReference: w(
    "Write this reference down and quote it whenever you contact the procurement office. There is no page to look up the status of an application.",
    "Catat rujukan ini dan nyatakannya setiap kali anda menghubungi pejabat perolehan. Tiada halaman untuk menyemak status permohonan.",
  ),
  nextTitle: w("What happens next", "Apa yang berlaku seterusnya"),
  nextItems: [
    w("The procurement office sees your application in its review queue.", "Pejabat perolehan melihat permohonan anda dalam senarai semakannya."),
    w(
      "Your company is not registered by this form. Once the office accepts it, you complete your registration online (your documents, bank details and declarations), and it is decided after the office has checked them. Contact the procurement office, quoting your reference, if you have a question.",
      "Syarikat anda tidak didaftarkan melalui borang ini. Setelah pejabat menerimanya, anda melengkapkan pendaftaran dalam talian (dokumen, butiran bank dan perakuan anda), dan ia diputuskan selepas pejabat menyemaknya. Hubungi pejabat perolehan, dengan menyatakan rujukan anda, jika ada pertanyaan.",
    ),
    w(
      "When the office accepts your application it can open a portal account for your contact and hand them a one-time code, in person or by letter. Nothing is sent by email. With the account you sign in to follow where your registration stands.",
      "Apabila pejabat menerima permohonan anda, ia boleh membuka akaun portal untuk orang yang dihubungi dan menyerahkan kod sekali guna kepadanya, secara peribadi atau melalui surat. Tiada apa dihantar melalui e-mel. Dengan akaun itu anda log masuk untuk mengikuti perkembangan pendaftaran anda.",
    ),
    w("Applying does not register your company or invite it to bid.", "Memohon tidak mendaftarkan syarikat anda atau menjemputnya membida."),
  ] satisfies Words[],
  officeNoticeTitle: w("A note from the procurement office", "Catatan daripada pejabat perolehan"),
  /// Every blocking fault the public form can show.
  faults: {
    NAME_REQUIRED: w("Enter the company's registered name.", "Masukkan nama berdaftar syarikat."),
    REGISTRATION_NO_REQUIRED: w("Enter the company's registration number.", "Masukkan nombor pendaftaran syarikat."),
    FORMAT_MISMATCH: w("This registration number is not written the way we expect. Check it against the certificate.", "Nombor pendaftaran ini tidak ditulis seperti yang dijangka. Semaknya dengan sijil."),
    ENTITY_TYPE_REQUIRED: w("Choose the type of company.", "Pilih jenis syarikat."),
    ENTITY_TYPE_NOT_LISTED: w("Choose one of the types of company in the list.", "Pilih salah satu jenis syarikat dalam senarai."),
    COUNTRY_REQUIRED: w("Choose the country.", "Pilih negara."),
    COUNTRY_NOT_LISTED: w("Choose one of the countries in the list.", "Pilih salah satu negara dalam senarai."),
    ADDRESS_LINE_REQUIRED: w("Enter the street address.", "Masukkan alamat jalan."),
    CITY_REQUIRED: w("Enter the city.", "Masukkan bandar."),
    POSTCODE_REQUIRED: w("Enter the postcode.", "Masukkan poskod."),
    ADDRESS_STATE_REQUIRED: w("Choose the state.", "Pilih negeri."),
    ADDRESS_STATE_NOT_LISTED: w("Choose one of the states in the list.", "Pilih salah satu negeri dalam senarai."),
    BUMIPUTERA_NOT_LISTED: w("Choose one of the options in the list.", "Pilih salah satu pilihan dalam senarai."),
    INCORPORATED_ON_REQUIRED: w("Enter the date the company was incorporated.", "Masukkan tarikh syarikat diperbadankan."),
    INCORPORATED_ON_NOT_A_DAY: w("This is not a date. Write it as year, month and day.", "Ini bukan tarikh. Tulis sebagai tahun, bulan dan hari."),
    INCORPORATED_IN_FUTURE: w("The date incorporated cannot be after today.", "Tarikh diperbadankan tidak boleh selepas hari ini."),
    EMAIL_REQUIRED: w("Enter the company's email address.", "Masukkan alamat e-mel syarikat."),
    EMAIL_NOT_VALID: w("This email address does not look right. Check it for a typing mistake.", "Alamat e-mel ini nampaknya tidak betul. Semak kesilapan menaip."),
    CONTACT_NAME_REQUIRED: w("Enter the name of the person we can reach.", "Masukkan nama orang yang boleh dihubungi."),
    CONTACT_REACH_REQUIRED: w("Give an email address or a telephone number for the contact.", "Berikan alamat e-mel atau nombor telefon untuk orang yang dihubungi."),
    CONTACT_EMAIL_REQUIRED: w("Give an email address for the contact.", "Berikan alamat e-mel untuk orang yang dihubungi."),
    CONTACT_PHONE_REQUIRED: w("Give a mobile number for the contact.", "Berikan nombor telefon bimbit untuk orang yang dihubungi."),
    CONTACT_EMAIL_NOT_VALID: w("The contact's email address does not look right. Check it for a typing mistake.", "Alamat e-mel orang yang dihubungi nampaknya tidak betul. Semak kesilapan menaip."),
  },
  /// What the register still lacks before it can take an application, in plain words.
  missing: {
    timeZone: w("the office's time zone", "zon masa pejabat"),
    entityTypes: w("the types of company", "jenis syarikat"),
    countries: w("the list of countries", "senarai negara"),
    states: w("the list of states", "senarai negeri"),
    numbering: w("the way application references are numbered", "cara rujukan permohonan dinomborkan"),
    notice: w("the notice about how personal details are used", "notis tentang cara butiran peribadi digunakan"),
    limits: w("how many applications the form takes", "bilangan permohonan yang diterima oleh borang"),
    formKey: w("the portal's form key, which the operator sets on the server", "kunci borang portal, yang ditetapkan oleh operator pada pelayan"),
  },
  noticeTitle: w("How your details are used", "Cara butiran anda digunakan"),
  noticeIntro: w("Please read this before you send the form. Sending it means you have read it.", "Sila baca ini sebelum anda menghantar borang. Menghantarnya bermakna anda telah membacanya."),
  noticeEnglish: w("In English", "Dalam Bahasa Inggeris"),
  noticeMalay: w("In Malay", "Dalam Bahasa Melayu"),
  formExpired: w("This form is out of date, so nothing was sent. Reload the page and send it again.", "Borang ini telah luput, jadi tiada apa dihantar. Muat semula halaman dan hantar semula."),
  busy: w("The form is receiving a lot of applications right now, so nothing was sent. Please try again later, or contact the procurement office.", "Borang ini sedang menerima banyak permohonan sekarang, jadi tiada apa dihantar. Sila cuba lagi nanti, atau hubungi pejabat perolehan."),
};
