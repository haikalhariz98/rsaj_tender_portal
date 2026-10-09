/**
 * The vendor announcements board (FR-VND-014, Phase 4e): "pinned items categorised as Important, Policy or Notice ... publishable by an authorised officer and visible to all
 * registered vendors". Pure.
 *
 * An announcement is published once and never edited: a correction is a withdrawal, with its reason kept, and a new announcement. The board shows the ones not withdrawn, pinned
 * first, then newest first. Who may publish is the organisation's grant of `announcements.publish` (undecided until decided: refused, and shown as undecided).
 */

import type { Finding } from "@/lib/window/types";

export const ANNOUNCEMENT_CATEGORIES = ["IMPORTANT", "POLICY", "NOTICE"] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];
export const isAnnouncementCategory = (s: unknown): s is AnnouncementCategory => typeof s === "string" && (ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(s);

export const CATEGORY_WORDS: Readonly<Record<AnnouncementCategory, { en: string; ms: string }>> = {
  IMPORTANT: { en: "Important", ms: "Penting" },
  POLICY: { en: "Policy", ms: "Dasar" },
  NOTICE: { en: "Notice", ms: "Makluman" },
};
export const CATEGORY_TONE: Readonly<Record<AnnouncementCategory, "err" | "info" | "neutral">> = { IMPORTANT: "err", POLICY: "info", NOTICE: "neutral" };

export const ANNOUNCEMENT_TITLE_MAX = 200;
export const ANNOUNCEMENT_BODY_MAX = 8000;
export const WITHDRAW_REASON_MAX = 2000;

export type AnnouncementFault = "TITLE_REQUIRED" | "TITLE_TOO_LONG" | "BODY_REQUIRED" | "BODY_TOO_LONG" | "CATEGORY_REQUIRED" | "ALREADY_WITHDRAWN" | "REASON_REQUIRED" | "REASON_TOO_LONG";

export function publishFaults(i: { title: string; body: string; category: string | null }): Finding<AnnouncementFault>[] {
  const out: Finding<AnnouncementFault>[] = [];
  if (!i.title.trim()) out.push({ code: "TITLE_REQUIRED", level: "block" });
  else if (i.title.trim().length > ANNOUNCEMENT_TITLE_MAX) out.push({ code: "TITLE_TOO_LONG", level: "block", data: { max: ANNOUNCEMENT_TITLE_MAX } });
  if (!i.body.trim()) out.push({ code: "BODY_REQUIRED", level: "block" });
  else if (i.body.trim().length > ANNOUNCEMENT_BODY_MAX) out.push({ code: "BODY_TOO_LONG", level: "block", data: { max: ANNOUNCEMENT_BODY_MAX } });
  if (!isAnnouncementCategory(i.category)) out.push({ code: "CATEGORY_REQUIRED", level: "block" });
  return out;
}

export function withdrawFaults(i: { withdrawn: boolean; reason: string }): Finding<AnnouncementFault>[] {
  const out: Finding<AnnouncementFault>[] = [];
  if (i.withdrawn) out.push({ code: "ALREADY_WITHDRAWN", level: "block" });
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  else if (i.reason.trim().length > WITHDRAW_REASON_MAX) out.push({ code: "REASON_TOO_LONG", level: "block", data: { max: WITHDRAW_REASON_MAX } });
  return out;
}

export const ANNOUNCEMENT_FAULT_WORDS: Readonly<Record<AnnouncementFault, string>> = {
  TITLE_REQUIRED: "Give the announcement a title.",
  TITLE_TOO_LONG: `The title is longer than ${ANNOUNCEMENT_TITLE_MAX} characters.`,
  BODY_REQUIRED: "Write what the announcement says.",
  BODY_TOO_LONG: `The announcement is longer than ${ANNOUNCEMENT_BODY_MAX} characters.`,
  CATEGORY_REQUIRED: "Choose whether it is Important, Policy or a Notice.",
  ALREADY_WITHDRAWN: "This announcement was already withdrawn.",
  REASON_REQUIRED: "Say why it is withdrawn.",
  REASON_TOO_LONG: `The reason is longer than ${WITHDRAW_REASON_MAX} characters.`,
};

export interface BoardItem {
  id: string;
  category: AnnouncementCategory;
  pinned: boolean;
  publishedAt: Date;
  withdrawnAt: Date | null;
}

/// The board's order: the ones standing, pinned first, then newest first.
export function boardOrder<T extends BoardItem>(items: readonly T[]): T[] {
  return items.filter((a) => a.withdrawnAt == null).sort((a, b) => (a.pinned === b.pinned ? b.publishedAt.getTime() - a.publishedAt.getTime() : a.pinned ? -1 : 1));
}
