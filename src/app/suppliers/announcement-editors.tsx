"use client";

import { RecordEditor } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import { ANNOUNCEMENT_CATEGORIES, CATEGORY_WORDS } from "@/lib/portal/projects/announcements";

import { pinAnnouncement, publishAnnouncement, withdrawAnnouncement } from "./announcement-actions";

/**
 * The announcements board's drawers (FR-VND-014, Phase 4e): publish, pin or unpin, withdraw. Each is the signed-in officer's own act; who may is the organisation's grant of
 * `announcements.publish`, judged by the action. Nothing is edited after publication: a correction is a withdrawal and a new announcement.
 */
export function PublishDrawer() {
  return (
    <RecordEditor
      title="Publish an announcement"
      description="Shown on the portal, not emailed. Cannot be edited: withdraw and republish."
      fields={[
        { kind: "select", name: "category", label: "Category", required: true, placeholder: "Choose", options: ANNOUNCEMENT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_WORDS[c].en })) },
        { kind: "text", name: "title", label: "Title", required: true },
        { kind: "textarea", name: "body", label: "Announcement", required: true },
        { kind: "switch", name: "pinned", label: "Pin it at the top of the board", hint: "Pinned announcements stay above the rest until unpinned or withdrawn." },
        actorField("Announcement.publishedBy", { name: "publishedByPersonId" }),
      ]}
      values={{}}
      action={publishAnnouncement}
      submitLabel="Publish"
      trigger={{ label: "Publish an announcement", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function PinDrawer({ id, title, pinned }: { id: string; title: string; pinned: boolean }) {
  return (
    <RecordEditor
      title={pinned ? "Unpin this announcement" : "Pin this announcement"}
      description={pinned ? `"${title}" moves back among the others, newest first.` : `"${title}" stays at the top of the board until it is unpinned or withdrawn.`}
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "hidden", name: "pin" },
      ]}
      values={{ id, pin: pinned ? "no" : "yes" }}
      action={pinAnnouncement}
      submitLabel={pinned ? "Unpin" : "Pin"}
      trigger={{ label: pinned ? "Unpin" : "Pin", className: buttonClass("ghost", "sm") }}
      size="sm"
    />
  );
}

export function WithdrawDrawer({ id, title }: { id: string; title: string }) {
  return (
    <RecordEditor
      title="Withdraw this announcement"
      description={`"${title}" is taken off the board. The reason is kept.`}
      fields={[
        { kind: "hidden", name: "id" },
        actorField("Announcement.withdrawnBy", { name: "withdrawnByPersonId" }),
      ]}
      values={{ id }}
      action={withdrawAnnouncement}
      destructive={{ reasonLabel: "Why it is withdrawn" }}
      submitLabel="Withdraw"
      trigger={{ label: "Withdraw", className: buttonClass("ghost", "sm") }}
      size="md"
    />
  );
}
