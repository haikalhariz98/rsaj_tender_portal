/**
 * The staff Inbox's own words (NFR-LNG-001, ADR 0040): the screen, and what each kind of notice is called. A notice's stored title and body are
 * records written once, in English, when it was raised; they show as written (ADR 0040 Q2), which is why the Inbox is only partly converted.
 * The Malay is drafted in the N1 slice and not yet reviewed by the customer.
 */

import { w } from "@/lib/contract/labels";


export const INBOX_WORDS = {
  title: w("Inbox"),
  notEmailed: w("Not emailed"),
  notEmailedDetail: w("Notices appear here only. Nothing is sent by email."),
  infoTitle: w("About the inbox"),
  more: w(
    "Steps that arrived, moved or were withdrawn, delegations to you, and not-approved memos. What awaits your decision is on My approvals.",
  ),
  unreadCount: w("{count} unread"),
  noticeCount: w("{count} notice"),
  noticesCount: w("{count} notices"),
  notices: w("Notices"),
  subtitleOlder: w("Older. Showing {shown} of {total}"),
  subtitleMore: w("Latest {shown} of {total}"),
  subtitleNewest: w("Newest first"),
  markAllRead: w("Mark all as read"),
  emptyTitle: w("No notices"),
  searchNotices: w("Search notices"),
  listEmptyTitle: w("Nothing here"),
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

