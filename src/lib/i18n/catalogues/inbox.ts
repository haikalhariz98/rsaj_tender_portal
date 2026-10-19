/**
 * The staff Inbox's own words (NFR-LNG-001, ADR 0040): the screen, and what each kind of notice is called. A notice's stored title and body are
 * records written once, in English, when it was raised; they show as written (ADR 0040 Q2), which is why the Inbox is only partly converted.
 * The Malay is drafted in the N1 slice and not yet reviewed by the customer.
 */

import { w } from "@/lib/contract/labels";


export const INBOX_WORDS = {
  title: w("Inbox"),
  lead: w(
    "What has been told to you in the portal. Notices appear here only; they are not emailed.",
  ),
  more: w(
    "A step that arrived, was moved or was withdrawn, a delegation given to you, and a memo that a matter was not approved. What is waiting for you to decide is on My approvals.",
  ),
  unreadCount: w("{count} unread"),
  noticeCount: w("{count} notice"),
  noticesCount: w("{count} notices"),
  notices: w("Notices"),
  subtitleOlder: w("Newest first, older than the ones before. Showing {shown} of {total}."),
  subtitleMore: w("Newest first. Showing the latest {shown} of {total}."),
  subtitleNewest: w("Newest first."),
  markAllRead: w("Mark all as read"),
  emptyTitle: w("Nothing has been told to you"),
  emptyBody: w("Notices appear here when an act of someone else concerns your office or your work."),
  searchNotices: w("Search notices"),
  listEmptyTitle: w("Nothing here"),
  listEmptyBody: w("No notice in this view."),
  unread: w("Unread"),
  read: w("Read"),
  colNotice: w("Notice"),
  colWhat: w("What"),
  colReceived: w("Received"),
  colStatus: w("Status"),
  otherKind: w("Notice"),
  backToNewest: w("Back to the newest"),
  olderNotices: w("Older notices"),
} as const;

