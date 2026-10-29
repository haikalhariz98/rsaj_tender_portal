"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { moreItemClass } from "@/components/ui/more-item-class";
import { actorField } from "@/lib/auth/actor-field";

import { assessPerformanceReport, openPerformanceReport, savePerformanceScores, verifyPerformanceReport } from "./performance-actions";

/**
 * The contractor performance report's drawers (Phase 2 close-out stage D; plan closeout-plan.md §4.8): start it, enter the scores (one dropdown per
 * criterion, 1 to the form's top), assess it, verify it. Each posts to its act, which judges it again; a drawer's blocker is the act's refusal.
 */

const hidden = (name: string): Field => ({ kind: "hidden", name });
const trig = (label: string, main: boolean) => ({ label, className: main ? buttonClass("primary", "sm") : moreItemClass() });

export function StartReportDrawer({ id, form, blocker }: { id: string; form: string; blocker: string | null }) {
  return (
    <RecordEditor
      title="Start the performance report"
      description={`On ${form}. The form is fixed on the report from here.`}
      fields={[hidden("id"), actorField("PerformanceReport.person", { name: "personId" })]}
      values={{ id }}
      action={openPerformanceReport}
      submitLabel="Start"
      submitBlock={blocker}
      trigger={trig("Start report", true)}
      size="sm"
    />
  );
}

export function ScoresDrawer({ id, criteria, scaleMax, values, main }: { id: string; criteria: readonly { order: number; label: string; guide: string }[]; scaleMax: number; values: Record<string, string>; main: boolean }) {
  const options = Array.from({ length: scaleMax }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  return (
    <RecordEditor
      title="Enter scores"
      description={`Each criterion from 1 to ${scaleMax}.`}
      size="lg"
      columns={2}
      fields={[hidden("id"), ...criteria.flatMap((c): Field[] => [{ kind: "select", name: `score_${c.order}`, label: c.label, placeholder: "Not scored", options, hint: c.guide || undefined }, { kind: "text", name: `note_${c.order}`, label: "Note" }])]}
      values={{ id, ...values }}
      action={savePerformanceScores}
      submitLabel="Save"
      trigger={trig("Enter scores", main)}
    />
  );
}

export function AssessDrawer({ id, blocker, main }: { id: string; blocker: string | null; main: boolean }) {
  return (
    <RecordEditor
      title="Assess the report"
      description="Works out the total and the grade. The scores are then fixed."
      fields={[hidden("id"), actorField("PerformanceReport.assessedBy", { name: "personId" })]}
      values={{ id }}
      action={assessPerformanceReport}
      submitLabel="Assess"
      submitBlock={blocker}
      trigger={trig("Assess", main)}
      size="sm"
    />
  );
}

export function VerifyDrawer({ id, blocker }: { id: string; blocker: string | null }) {
  return (
    <RecordEditor
      title="Verify and file"
      description="Someone other than the assessor verifies it. Filing is final."
      fields={[hidden("id"), actorField("PerformanceReport.verifiedBy", { name: "personId" })]}
      values={{ id }}
      action={verifyPerformanceReport}
      submitLabel="Verify"
      submitBlock={blocker}
      trigger={trig("Verify", true)}
      size="sm"
    />
  );
}
