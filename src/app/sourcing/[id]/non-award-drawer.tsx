"use client";

import { RecordEditor } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { issueNonAwardNotice } from "./non-award-actions";

/**
 * Issuing the notice of non-award to one unsuccessful tenderer (FR-AWD-010, Phase 4d). The reason is asked only where the organisation's debrief carries one; the rules are the action's. The notice is shown
 * in the portal to the tenderer, where the office has linked it to a supplier's register entry, and is not sent.
 */
export function IssueNoticeDrawer({ id, partyId, name, carriesReason, linked }: { id: string; partyId: string; name: string; carriesReason: boolean; linked: boolean }) {
  return (
    <RecordEditor
      title={`Notice of the outcome to ${name}`}
      description={`States no price, score or rank. Shown in the portal only.${linked ? "" : " Not linked to a register entry, so the tenderer cannot see it."}`}
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "hidden", name: "partyId" },
        ...(carriesReason ? [{ kind: "textarea" as const, name: "reason", label: "The reason for non-award", required: true, hint: "Shown to this tenderer only." }] : []),
        actorField("NonAwardNotice.issuedBy", { name: "issuedByPersonId" }),
      ]}
      values={{ id, partyId }}
      action={issueNonAwardNotice}
      submitLabel="Issue the notice"
      trigger={{ label: "Issue the notice", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}
