"use client";

import { useState } from "react";

import { PlusIcon, WalletIcon, XIcon } from "@/components/icons";
import { ActGate, useActGate } from "@/components/act-gate";
import { RecordEditor } from "@/components/record-editor";
import { Button, buttonClass, IconButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { KeyValues } from "@/components/ui/stat";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { eligibilityNotSetText } from "@/lib/funding/labels";
import { bpToPercent, MAX_SPLIT_SOURCES, percentToBp } from "@/lib/funding/split";
import type { FundingCardView } from "@/lib/funding/store";

import { recordFundingSplit } from "./funding-actions";

/**
 * The project overview's Funding card (ADR 0046, plan §4.5): each source with its share, "From the requisition" while no split is recorded, and the split's
 * drawer until money is certified (FS-7). The rules are the act's; the running total only helps.
 */

export function FundingCard({ contractId, status, view }: { contractId: string; status: ContractStatus; view: FundingCardView }) {
  // The Project workspace's row of the act x status table, in its own words, for the drawer beneath.
  const shut = actStatusBlocker("PROJECT_WORKSPACE", status);
  return (
    <ActGate blocker={shut}>
    <Card>
      <CardHeader
        icon={<WalletIcon size={17} />}
        title="Funding"
        info={{ label: "About funding", text: "Where this contract's money comes from. A split is fixed once a payment is certified." }}
        actions={view.locked ? <Chip tone="neutral">Fixed once a payment is certified</Chip> : view.sources.length > 0 ? <SplitDrawer contractId={contractId} view={view} /> : undefined}
      />
      <CardBody>
        {view.rows.length === 0 ? (
          <span className="text-[13.5px] text-ink-3">Not set</span>
        ) : (
          <KeyValues
            columns={2}
            items={view.rows.map((x) => ({
              label: x.label,
              value: (
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{x.percent}%</span>
                  {view.state === "FROM_REQUISITION" && <Chip tone="neutral">From the requisition</Chip>}
                  {x.eligibilityUnset && <Chip tone="warn" title={eligibilityNotSetText(x.label)}>Eligibility not set</Chip>}
                </span>
              ),
            }))}
          />
        )}
      </CardBody>
    </Card>
    </ActGate>
  );
}

type Row = { sourceId: string; pct: string };

function SplitDrawer({ contractId, view }: { contractId: string; view: FundingCardView }) {
  return (
    <RecordEditor
      title="Funding split"
      description="Shares of the contract, adding up to 100%."
      fields={[{ kind: "hidden", name: "contractId" }]}
      values={{ contractId }}
      sections={<SplitRows initial={view.current.length ? view.current.map((c) => ({ sourceId: c.sourceId, pct: c.percent })) : [{ sourceId: "", pct: "" }]} sources={view.sources} />}
      action={recordFundingSplit}
      reason={{ label: "Why is the funding split?" }}
      submitLabel="Save split"
      trigger={{ label: "Edit split", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

function SplitRows({ initial, sources }: { initial: Row[]; sources: { value: string; label: string }[] }) {
  // Under the card's gate: a shut workspace leaves the rows as they are.
  const shut = useActGate() != null;
  const [rows, setRows] = useState<Row[]>(initial);
  const set = (i: number, change: Partial<Row>) => setRows((xs) => xs.map((x, n) => (n === i ? { ...x, ...change } : x)));
  const parts = rows.map((x) => percentToBp(x.pct));
  const total = parts.every((p) => p != null) ? parts.reduce((a: number, p) => a + p!, 0) : null;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((x, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_36px] items-end gap-3">
          <Field label={i === 0 ? "Source" : ""} htmlFor={`split-source-${i}`}>
            <Select id={`split-source-${i}`} name="sourceId" value={x.sourceId} onChange={(e) => set(i, { sourceId: e.target.value })} aria-label={`Source ${i + 1}`}>
              <option value="">Choose</option>
              {sources.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={i === 0 ? "Share (%)" : ""} htmlFor={`split-pct-${i}`}>
            <Input id={`split-pct-${i}`} name="sharePct" numeric inputMode="decimal" value={x.pct} onChange={(e) => set(i, { pct: e.target.value })} aria-label={`Share ${i + 1}, percent`} />
          </Field>
          <IconButton label={`Remove source ${i + 1}`} size="sm" disabled={shut || rows.length === 1} onClick={() => setRows((xs) => xs.filter((_, n) => n !== i))}>
            <XIcon size={15} />
          </IconButton>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" icon={<PlusIcon size={15} />} disabled={shut || rows.length >= MAX_SPLIT_SOURCES} onClick={() => setRows((xs) => [...xs, { sourceId: "", pct: "" }])}>
          Add source
        </Button>
        <span className={`text-[13px] tabular-nums ${total === 10000 ? "text-ink-2" : "text-amber-700"}`} aria-live="polite">
          Total {total == null ? "—" : `${bpToPercent(total)}%`}
        </span>
      </div>
    </div>
  );
}
