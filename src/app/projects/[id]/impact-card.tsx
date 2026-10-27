"use client";

import { ActGate } from "@/components/act-gate";
import { ChartIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KeyValues } from "@/components/ui/stat";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import type { ImpactCardView } from "@/lib/funding/store";

import { recordImpact } from "./funding-actions";

/** The project overview's Impact card (SF-04, FS-12): each measure as "value unit". Hidden while the organisation has no measure. */
export function ImpactCard({ contractId, status, view }: { contractId: string; status: ContractStatus; view: ImpactCardView }) {
  // The Project workspace's row of the act x status table, in its own words, for the drawer beneath.
  const shut = actStatusBlocker("PROJECT_WORKSPACE", status);
  const fields: Field[] = [{ kind: "hidden", name: "contractId" }, ...view.measures.map((m): Field => ({ kind: "text", name: `value_${m.id}`, label: `${m.label} (${m.unit})`, placeholder: "Not recorded" }))];
  return (
    <ActGate blocker={shut}>
    <Card>
      <CardHeader
        icon={<ChartIcon size={17} />}
        title="Impact"
        actions={
          <RecordEditor
            title="Impact figures"
            description="Empty: not recorded."
            fields={fields}
            values={{ contractId, ...Object.fromEntries(view.measures.map((m) => [`value_${m.id}`, m.value])) }}
            action={recordImpact}
            reason={{ label: "Why are the figures changing?" }}
            trigger={{ label: "Edit", className: buttonClass("secondary", "sm"), ariaLabel: "Edit impact figures" }}
            size="md"
          />
        }
      />
      <CardBody>
        <KeyValues columns={2} items={view.measures.map((m) => ({ label: m.label, value: m.value == null ? <span className="text-ink-3">Not recorded</span> : <span className="tabular-nums">{`${Number(m.value).toLocaleString("en-MY", { maximumFractionDigits: 4 })} ${m.unit}`}</span> }))} />
      </CardBody>
    </Card>
    </ActGate>
  );
}
