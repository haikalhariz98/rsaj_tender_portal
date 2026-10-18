/**
 * The staff Inbox's own words (NFR-LNG-001, ADR 0040): the screen, and what each kind of notice is called. A notice's stored title and body are
 * records written once, in English, when it was raised; they show as written (ADR 0040 Q2), which is why the Inbox is only partly converted.
 * The Malay is drafted in the N1 slice and not yet reviewed by the customer.
 */

import { w } from "@/lib/contract/labels";
import { STAFF_NOTICE_KIND_LABEL } from "@/lib/inbox/kinds";

import type { Catalogue } from "../registry";

export const INBOX_WORDS = {
  title: w("Inbox", "Peti Masuk"),
  lead: w(
    "What has been told to you in the portal. Notices appear here only; they are not emailed.",
    "Apa yang dimaklumkan kepada anda dalam portal. Notis hanya muncul di sini dan tidak dihantar melalui e-mel.",
  ),
  more: w(
    "A step that arrived, was moved or was withdrawn, a delegation given to you, and a memo that a matter was not approved. What is waiting for you to decide is on My approvals.",
    "Satu langkah yang tiba, dipindahkan atau ditarik balik, satu perwakilan yang diberikan kepada anda, dan memo bahawa sesuatu perkara tidak diluluskan. Apa yang menunggu keputusan anda ada di Kelulusan saya.",
  ),
  unreadCount: w("{count} unread", "{count} belum dibaca"),
  noticeCount: w("{count} notice", "{count} notis"),
  noticesCount: w("{count} notices", "{count} notis"),
  notices: w("Notices", "Notis"),
  subtitleOlder: w("Newest first, older than the ones before. Showing {shown} of {total}.", "Terbaharu dahulu, lebih lama daripada yang sebelumnya. Menunjukkan {shown} daripada {total}."),
  subtitleMore: w("Newest first. Showing the latest {shown} of {total}.", "Terbaharu dahulu. Menunjukkan {shown} terkini daripada {total}."),
  subtitleNewest: w("Newest first.", "Terbaharu dahulu."),
  markAllRead: w("Mark all as read", "Tandakan semua sebagai telah dibaca"),
  emptyTitle: w("Nothing has been told to you", "Tiada apa yang dimaklumkan kepada anda"),
  emptyBody: w("Notices appear here when an act of someone else concerns your office or your work.", "Notis muncul di sini apabila tindakan orang lain melibatkan pejabat atau kerja anda."),
  searchNotices: w("Search notices", "Cari notis"),
  listEmptyTitle: w("Nothing here", "Tiada apa-apa di sini"),
  listEmptyBody: w("No notice in this view.", "Tiada notis dalam paparan ini."),
  unread: w("Unread", "Belum dibaca"),
  read: w("Read", "Telah dibaca"),
  colNotice: w("Notice", "Notis"),
  colWhat: w("What", "Jenis"),
  colReceived: w("Received", "Diterima"),
  colStatus: w("Status", "Status"),
  otherKind: w("Notice", "Notis"),
  backToNewest: w("Back to the newest", "Kembali ke yang terbaharu"),
  olderNotices: w("Older notices", "Notis lebih lama"),
} as const;

const kinds = Object.fromEntries(Object.entries(STAFF_NOTICE_KIND_LABEL).map(([k, v]) => [`kind.${k}`, v]));

export const INBOX: Catalogue = {
  name: "inbox",
  review: "DRAFTED_NOT_REVIEWED",
  words: { ...Object.fromEntries(Object.entries(INBOX_WORDS).map(([k, v]) => [`inbox.${k}`, v])), ...kinds },
};
