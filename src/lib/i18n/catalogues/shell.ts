/**
 * The frame's own words (NFR-LNG-001, ADR 0040): the navigation, the breadcrumb, the top bar and the user menu. The Malay is drafted in the
 * N1 slice and not yet reviewed by the customer. Navigation labels sit with the navigation (`@/lib/nav`) and are gathered here for review.
 */

import { w, type Words } from "@/lib/contract/labels";
import { CONFIG_GROUP_WORDS, CONFIG_LABELS, CONFIG_PINNED, CONFIG_SECTIONS, STAFF_NAV } from "@/lib/nav";

import type { Catalogue } from "../registry";

/** The words the sidebar, top bar and user menu write themselves. */
export const SHELL_WORDS = {
  backToDashboard: w("Back to dashboard", "Kembali ke papan pemuka"),
  configuration: w("Configuration", "Konfigurasi"),
  viewingAs: w("Viewing as", "Melihat sebagai"),
  switchWorkspace: w("Switch workspace", "Tukar ruang kerja"),
  switchWorkspaceButton: w("Switch workspace", "Tukar ruang kerja"),
  supplierPortal: w("Supplier portal", "Portal pembekal"),
  openNavigation: w("Open navigation", "Buka navigasi"),
  closeNavigation: w("Close navigation", "Tutup navigasi"),
  soon: w("soon", "tidak lama lagi"),
  search: w("Search", "Cari"),
  searchNotBuilt: w("Search is not built yet", "Carian belum dibina"),
  helpNotBuilt: w("Help is not built yet", "Bantuan belum dibina"),
  help: w("Help", "Bantuan"),
  breadcrumb: w("Breadcrumb", "Jejak laluan"),
  notifications: w("Notifications", "Pemberitahuan"),
  supplierNoticesNotBuilt: w("Notices to suppliers are not built yet", "Notis kepada pembekal belum dibina"),
  inbox: w("Inbox", "Peti Masuk"),
  inboxUnread: w("Inbox, with unread notices", "Peti Masuk, ada notis belum dibaca"),
  unreadNotices: w("You have unread notices", "Anda ada notis yang belum dibaca"),
  yourInbox: w("Your inbox", "Peti masuk anda"),
  signIn: w("Sign in", "Log masuk"),
  home: w("Home", "Utama"),
  dashboard: w("Dashboard", "Papan Pemuka"),
  yourAccount: w("Your account", "Akaun anda"),
  signOut: w("Sign out", "Log keluar"),
  language: w("Language", "Bahasa"),
  languageSwitch: w("Language of the screens", "Bahasa skrin"),
  languageNotChosen: w("English, the default: not chosen", "Bahasa Inggeris, lalai: belum dipilih"),
  languageChosenEn: w("English, as you chose", "Bahasa Inggeris, pilihan anda"),
  languageChosenMs: w("Bahasa Malaysia, as you chose", "Bahasa Malaysia, pilihan anda"),
  languageNotSaved: w("The language could not be changed. Try again.", "Bahasa tidak dapat ditukar. Cuba lagi."),
  userMenu: w("Account menu", "Menu akaun"),
} as const satisfies Record<string, Words>;

/// Path segment to the label the breadcrumb should read. A segment that only names a Configuration section takes its word from the rail
/// (`CONFIG_LABELS`), so the two cannot split; the key is still needed here, because a key is how a known section word is told from a record's key.
export const SEGMENT_LABEL: Readonly<Record<string, Words>> = {
  configuration: w("Configuration", "Konfigurasi"),
  "approval-matrix": CONFIG_LABELS["approval-matrix"],
  committees: w("Committees", "Jawatankuasa"),
  organisation: CONFIG_LABELS["organisation"],
  users: CONFIG_LABELS["users"],
  budget: CONFIG_LABELS["budget"],
  numbering: CONFIG_LABELS["numbering"],
  templates: CONFIG_LABELS["templates"],
  "routing-sheets": CONFIG_LABELS["routing-sheets"],
  "reference-data": CONFIG_LABELS["reference-data"],
  "tender-documents": CONFIG_LABELS["tender-documents"],
  invitation: CONFIG_LABELS["invitation"],
  appendix: w("Appendix", "Lampiran"),
  notifications: CONFIG_LABELS["notifications"],
  accounts: CONFIG_LABELS["accounts"],
  security: CONFIG_LABELS["security"],
  changes: CONFIG_LABELS["changes"],
  sourcing: w("Sourcing", "Sumber Perolehan"),
  projects: w("Contracts", "Kontrak"),
  suppliers: w("Suppliers", "Pembekal"),
  documents: w("Documents", "Dokumen"),
  requisitions: w("Requisitions", "Permintaan"),
  awards: w("Awards", "Anugerah"),
  securities: w("Securities", "Sekuriti"),
  approvals: w("My approvals", "Kelulusan saya"),
  inbox: w("Inbox", "Peti Masuk"),
  account: w("Your account", "Akaun anda"),
  welcome: w("Welcome", "Selamat datang"),
  "sign-in": w("Sign in", "Log masuk"),
  audit: CONFIG_LABELS["audit"],
  print: w("Print", "Cetak"),
  // Short: the crumb shares the bar with search. The page title says the rest.
  receive: w("Receive", "Terima"),
  supplier: w("Supplier portal", "Portal pembekal"),
  opportunities: w("Opportunities", "Peluang"),
  bids: w("My Bids", "Bida Saya"),
  company: w("Company", "Syarikat"),
  // Phase 4e (FR-VND-014): the supplier portal's announcements board.
  announcements: w("Announcements", "Pengumuman"),
  // Phase 4d: the Tender Table Document a supplier inspects, under one exercise of My Bids.
  "table-document": w("Tender Table Document", "Dokumen Jadual Tender"),
  // Wave 3a (SR-10): the payment page of a document purchase, under one exercise of My Bids.
  pay: w("Payment", "Bayaran"),
  // Wave 3b (SR-13, step 11): the page an online bid is submitted on, under one exercise of My Bids.
  submit: w("Submit a bid", "Hantar bida"),
};

/// What a record under a section is called, for its breadcrumb.
export const RECORD_LABEL: Readonly<Record<string, Words>> = {
  committees: w("Committee", "Jawatankuasa"),
  requisitions: w("Requisition", "Permintaan"),
  awards: w("Award", "Anugerah"),
  // 6.15a: a supplier on the register; the page names it (RecordCrumb).
  suppliers: w("Supplier", "Pembekal"),
  // 6.14: a contract, a certificate under it, a form and a routing sheet type; each page names its record.
  projects: w("Contract", "Kontrak"),
  certificates: w("Certificate", "Perakuan"),
  // 6.13 Part A step 4: a variation under its contract.
  variations: w("Variation", "Perubahan"),
  templates: w("Template", "Templat"),
  "routing-sheets": w("Routing sheet type", "Jenis helaian laluan"),
  sourcing: w("Exercise", "Urusan"),
  // The public portal: an advertised opportunity; the page names it by its reference (RecordCrumb).
  opportunities: w("Opportunity", "Peluang"),
  // Phase 4d: one exercise in My Bids; the page names it by its reference (RecordCrumb).
  bids: w("Exercise", "Urusan"),
  online: w("Online application", "Permohonan dalam talian"),
  // Phase 5a (ruling item 9): an item of the inbox that asks for a signature, a back-dated signature to confirm.
  inbox: w("Back-dated signature", "Tandatangan bertarikh lampau"),
  evaluation: w("Evaluation model", "Model penilaian"),
  label: w("Sale label", "Label jualan"),
};

/// Segments whose label depends on where they sit.
export const NESTED_LABEL: Readonly<Record<string, Words>> = {
  // Every Configuration section, named as the rail names it. Under Configuration "requisitions" is Requisition controls, not the requisitions list.
  ...Object.fromEntries(Object.entries(CONFIG_LABELS).map(([slug, label]) => [`configuration/${slug}`, label])),
  // The sign-in screens, shown without the frame but named for the breadcrumb test.
  "sign-in/code": w("Use a code", "Guna kod"),
  "requisitions/new": w("New requisition", "Permintaan baharu"),
  "projects/new": w("New award", "Anugerah baharu"),
  // 6.15a: the register's configuration, and recording a paper application.
  "suppliers/new": w("New application", "Permohonan baharu"),
  // Online applications waiting for an officer: the list is the Online tab, one application sits under it.
  "suppliers/online": w("Online applications", "Permohonan dalam talian"),
  // 6.14 residual: every page names its crumbs (crumbs.test.ts walks every page).
  "sourcing/new": w("New exercise", "Urusan baharu"),
  "evaluation/report": w("Evaluation report", "Laporan penilaian"),
  "evaluation/proposal": w("Kertas Cadangan", "Kertas Cadangan"),
  // The supplier portal's own words, where a segment is also a staff section's name ("projects" is Contracts there).
  "supplier/projects": w("My Projects", "Projek Saya"),
  "supplier/results": w("Results", "Keputusan"),
  "supplier/register": w("Register as a supplier", "Daftar sebagai pembekal"),
  // Phase 4b: a signed-in supplier completing its registration.
  "supplier/registration": w("Registration", "Pendaftaran"),
  // N2: the supplier's own data page. English in both slots (founder 2026-10-19: no Malay is added).
  "account/data": w("Your data", "Your data"),
  // Phase 4a: a supplier activating the account an officer opened, and setting a new password with a reset code.
  "supplier/activate": w("Activate your account", "Aktifkan akaun anda"),
  "supplier/reset": w("Set a new password", "Tetapkan kata laluan baharu"),
};

/// The crumbs `crumbTrail` writes itself, outside the three tables above.
export const CRUMB_WORDS = {
  committeeSittings: w("Committee sittings", "Mesyuarat jawatankuasa"),
  sitting: w("Sitting", "Mesyuarat"),
  edit: w("Edit", "Sunting"),
  details: w("Details", "Butiran"),
  print: w("Print", "Cetak"),
  contracts: w("Contracts", "Kontrak"),
  tenderDocuments: w("Tender documents", "Dokumen tender"),
  exercise: w("Exercise", "Urusan"),
  evaluation: w("Evaluation", "Penilaian"),
  sales: w("Sales", "Jualan"),
  bidOpening: w("Bid opening", "Pembukaan bida"),
  saleLabel: w("Sale label", "Label jualan"),
  documents: w("Documents", "Dokumen"),
  variations: w("Variations", "Perubahan"),
} as const satisfies Record<string, Words>;

function keyed(prefix: string, record: Readonly<Record<string, Words>>): [string, Words][] {
  return Object.entries(record).map(([k, v]) => [`${prefix}.${k}`, v]);
}

export const SHELL: Catalogue = {
  name: "shell",
  review: "DRAFTED_NOT_REVIEWED",
  words: Object.fromEntries([
    ...keyed("shell", SHELL_WORDS),
    ...keyed("crumb", CRUMB_WORDS),
    ...keyed("segment", SEGMENT_LABEL),
    ...keyed("record", RECORD_LABEL),
    ...keyed("nested", NESTED_LABEL),
    ...keyed("configGroup", CONFIG_GROUP_WORDS),
    ...STAFF_NAV.map((g) => [`navGroup.${g.label.en}`, g.label] as [string, Words]),
    ...STAFF_NAV.flatMap((g) => g.items.map((i) => [`nav.${i.href}`, i.label] as [string, Words])),
    ...CONFIG_PINNED.map((i) => [`config.${i.href}`, i.label] as [string, Words]),
    ...CONFIG_SECTIONS.flatMap((g) => g.items.map((i) => [`config.${i.href}`, i.label] as [string, Words])),
  ]),
};
