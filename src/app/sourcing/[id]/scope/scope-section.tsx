import Link from "next/link";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { DataList } from "@/components/data-list";
import { ScaleIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { Badge, type Tone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState, FindingNote, ToneNote } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { formatDate } from "@/lib/format";
import type { scopeTab } from "@/lib/scope/read";
import { NOT_SET, SCOPE_CONFIG_PATH } from "@/lib/scope/labels";

import { EditPanelDrawer, MarkVerifiedDrawer, TableScopeDrawer, TakeSettingsDrawer, VerifyColumnDrawer } from "./editors";
import { Disclosure } from "@/components/ui/disclosure";

type Data = NonNullable<Awaited<ReturnType<typeof scopeTab>>>;

const STATE_TONE: Record<Data["panel"]["state"], Tone> = { NONE: "neutral", DRAFT: "info", VERIFIED: "ok", SCAN_GONE: "err" };

/**
 * SR-08 and SR-09 (rulings 12 and 13): the section opens with how this exercise is prepared (the two switches it is pinned to), the specification panel and its signed form are
 * shown only where the exercise uses a panel (an earlier panel stays, read only), and the scope approval is of the bill, or of the uploaded bill file.
 *
 * Scope: the specification panel with its signed form, and the scope approval. (The
 * scope statement lives in the bill of quantities' header, and the readiness card is gone:
 * founder decision, 2026-10-05.) Every verification is "recorded on behalf of, not signed"; the panel is
 * verified only with a live SULIT scan of its signed form.
 */
export function ScopeSection({ d }: { d: Data }) {
  const { panel, exercise, approval, switches } = d;
  const readOnly = d.panelReadOnly;
  const columnsUnset = panel.id != null && panel.columns.length === 0;
  const billWords = switches.bill.pin == null ? "Not set" : switches.bill.pin ? "Built on screen" : "An uploaded Excel file, under Tender documents";
  const panelWords = switches.panel.pin == null ? "Not set" : switches.panel.pin ? "Used" : "Not used";
  const unsetPins = switches.panel.pin == null || switches.bill.pin == null;
  return (
    <div className="flex flex-col gap-6">
      <Card id="how-prepared" className="scroll-mt-24">
        <CardHeader
          icon={<ShieldIcon size={17} />}
          title="How this exercise is prepared"
          subtitle="Frozen on first submission"
          actions={unsetPins && switches.take ? <TakeSettingsDrawer exerciseId={exercise.id} take={switches.take} rows={[["Specification panel", `${panelWords}, organisation's setting: ${switches.panel.setting}`], ["Bill of quantities", `${billWords}, organisation's setting: ${switches.bill.setting === "Used" ? "Built on screen" : switches.bill.setting === "Not used" ? "An uploaded Excel file" : "Not set"}`]]} /> : undefined}
        />
        <CardBody className="flex flex-col gap-4">
          <KeyValues
            columns={2}
            items={[
              { label: "Specification panel", value: panelWords === "Not set" ? <Badge tone="warn">Not set</Badge> : panelWords },
              { label: "Bill of quantities", value: billWords === "Not set" ? <Badge tone="warn">Not set</Badge> : billWords },
            ]}
          />
          {unsetPins && (
            <Callout tone="warn" title="Submission waits for this">
              {switches.panel.pin == null && "Panel not set. "}
              {switches.bill.pin == null && "Bill mode not set. "}
              Set it under <Link href={switches.configHref} className="font-semibold">Configuration.</Link>
            </Callout>
          )}
        </CardBody>
      </Card>

      {d.panelShown && (
      <Card id="specification-panel" className="scroll-mt-24">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title={readOnly ? "Earlier specification panel" : "Specification panel"}
          subtitle={readOnly ? "Kept as recorded. No specification panel." : panel.statement}
          actions={<Badge tone={STATE_TONE[panel.state]} dot>{panel.stateLabel}</Badge>}
        />
        {panel.id == null ? (
          <EmptyState size="sm" title="The panel has not been started" action={<EditPanelDrawer exerciseId={exercise.id} isNew raw={panel.raw} kinds={panel.options.contractKinds} statuses={panel.options.projectStatuses} bills={panel.options.bills} clearsVerifications={false} />} />
        ) : (
          <CardBody className="flex flex-col gap-5">
            {!readOnly && (
            <div className="flex flex-wrap items-start gap-3">
              <EditPanelDrawer exerciseId={exercise.id} isNew={false} raw={panel.raw} kinds={panel.options.contractKinds} statuses={panel.options.projectStatuses} bills={panel.options.bills} clearsVerifications={panel.state === "VERIFIED" || panel.columns.some((c) => c.verifiedBy != null)} />
              <MarkVerifiedDrawer exerciseId={exercise.id} verify={panel.verify} scans={panel.signedFormScans} reverify={panel.reverify} />
            </div>
            )}
            {panel.findings.length > 0 && (
              <div className="flex flex-col gap-2">
                {panel.findings.map((f, i) => (
                  <FindingNote key={i} level={f.level}>{f.text}</FindingNote>
                ))}
              </div>
            )}
            <KeyValues
              columns={3}
              items={[
                { label: "Contract kind", value: panel.contractKind },
                { label: "Project status", value: panel.projectStatus },
                { label: "Completion period", value: panel.completionPeriod },
                { label: "Current revision", value: panel.currentRevision },
                { label: "Revised revision", value: panel.revisedRevision },
                { label: "Bill it certifies", value: panel.certifiesBill },
                { label: "People who verified", value: panel.signatories },
                { label: "Signed forms attached", value: panel.signedFormScans === 0 ? "None yet" : String(panel.signedFormScans) },
              ]}
            />
            <div className="border-t border-line pt-5">
              <p className="mb-2 text-[12px] font-semibold text-ink-3">Verification, column by column</p>
              {columnsUnset ? (
                <EmptyState size="sm" title="The panel's columns are not set" action={<ButtonLink href={SCOPE_CONFIG_PATH} size="sm" variant="secondary">Set them under Configuration</ButtonLink>} />
              ) : (
                <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                  {panel.columns.map((c) => (
                    <li key={c.code} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold break-words text-ink">{c.label}</span>
                        {c.verifiedBy ? (
                          <span className="block text-[12.5px] break-words text-ink-3">
                            {c.verifiedBy}, on {formatDate(c.verifiedOn)}
                            {c.note ? ` · ${c.note}` : ""}
                          </span>
                        ) : (
                          <span className="block text-[12.5px] text-ink-3">Not verified yet</span>
                        )}
                      </span>
                      {c.verifiedBy ? <Badge tone="ok" dot>Verified</Badge> : panel.state === "VERIFIED" || readOnly ? null : <VerifyColumnDrawer exerciseId={exercise.id} column={c.code} columnLabel={c.label} people={panel.options.people.map((p) => ({ value: p.id, label: p.name }))} />}
                    </li>
                  ))}
                </ul>
              )}
              {panel.cleared.length > 0 && (
                <Disclosure className="mt-3" title={`Cleared verifications (${panel.cleared.length})`}>
                  <ul className="flex flex-col gap-1 pl-4 text-[13px] text-ink-2">
                    {panel.cleared.map((c, i) => (
                      <li key={i}>{c.column}, by {c.by}: cleared on {c.clearedOn} when the panel was edited.</li>
                    ))}
                  </ul>
                </Disclosure>
              )}
            </div>
          </CardBody>
        )}
      </Card>
      )}

      {d.panelShown && (panel.id ? (
        <div id="signed-panel-form" className="scroll-mt-24">
        <OwnerAttachments
          owner={{ kind: "specificationPanel", id: panel.id }}
          title={readOnly ? "Earlier signed panel form" : "Signed panel form"}
          subtitle="Filed as SULIT. Verification stands only for the scan it was made on."
          only={["SPEC_PANEL_FORM"]}
          required={{ SPEC_PANEL_FORM: true }}
        />
        </div>
      ) : (
        <Card>
          <CardHeader icon={<ShieldIcon size={17} />} title="Signed panel form" subtitle="Scanned and filed as SULIT." />
          <EmptyState size="sm" title="Start the panel to attach its form" />
        </Card>
      ))}

      <Card id="scope-approval" className="scroll-mt-24 overflow-hidden">
        <CardHeader
          icon={<ScaleIcon size={17} />}
          title="Scope approval"
          subtitle={approval.fileMode ? "A replaced file needs its own" : "From the committee sitting"}
          actions={<Badge tone={approval.badge.tone} dot>{approval.badge.label}</Badge>}
        />
        <CardBody className="flex flex-col gap-5">
          <ToneNote tone={approval.state === "APPROVED" ? "ok" : approval.state === "NOT_REQUIRED" ? "neutral" : approval.badge.tone === "err" ? "err" : approval.state === "PENDING" ? "info" : "warn"}>{approval.line}</ToneNote>
          {/* 62-C1: configuration has moved on since the deciding matter was tabled; both rules named. */}
          {approval.moved && <Callout tone="warn" title="The rule has changed since this was tabled">{approval.moved}</Callout>}
          <KeyValues
            columns={3}
            items={[
              { label: "Needs committee approval", value: approval.rule.required === NOT_SET ? <span className="flex flex-col items-start gap-1"><Badge tone="warn">Not set</Badge><Link href={approval.configHref} className="text-[12.5px] font-semibold">Set it under Configuration</Link></span> : approval.rule.required },
              { label: "Committee", value: approval.rule.committee ?? "—" },
              { label: "Where the rule came from", value: approval.rule.provenance ?? "—" },
              { label: "The committee's act", value: approval.rule.act === NOT_SET ? <span className="flex flex-col items-start gap-1"><Badge tone="warn">Not set</Badge><Link href={approval.configHref} className="text-[12.5px] font-semibold">Set it under Configuration</Link></span> : approval.rule.act ?? "—" },
              { label: "Where the act came from", value: approval.rule.actProvenance ?? "—" },
            ]}
          />
          {/* Offered only where tabling is the next step; every other state's callout above says what is next. */}
          {["NOT_TABLED", "DEFERRED", "OUTCOME_NOT_RECORDED"].includes(approval.state) && (
            <div className="flex flex-wrap items-center gap-3">
              <TableScopeDrawer exerciseId={exercise.id} table={approval.table} file={approval.fileMode} />
            </div>
          )}
        </CardBody>
        {approval.matters.length > 0 && (
          <div className="border-t border-line">
            <DataList
              flat
              selectable={false}
              searchable={false}
              toolbar={false}
              exportName="scope-matters"
              emptyTitle="Nothing tabled"
              columns={[
                { key: "version", label: approval.fileMode ? "Uploaded bill" : "Bill", width: "14%", mobile: "primary" },
                { key: "sitting", label: "Sitting", width: "22%", mobile: "meta" },
                { key: "act", label: "Act", width: "14%", mobile: "meta" },
                { key: "tabled", label: "Tabled", mobile: "meta" },
                { key: "outcome", label: "Decision", width: "22%", mobile: "meta" },
              ]}
              rows={approval.matters.map((m) => ({
                id: m.id,
                search: `${m.version} ${m.sitting}`,
                cells: {
                  version: { kind: "text", text: m.version },
                  sitting: { kind: "link", text: m.sitting, href: m.sittingHref, sub: m.committee },
                  act: { kind: "text", text: m.act },
                  tabled: { kind: "text", text: m.tabledOn ? `${formatDate(m.tabledOn)}${m.tabledBy ? `, by ${m.tabledBy}` : ""}` : "—", dim: true },
                  outcome: { kind: "badge", text: m.decidedOn ? `${m.outcome}, ${formatDate(m.decidedOn)}` : m.outcome, tone: m.outcomeTone === "neutral" ? undefined : m.outcomeTone },
                },
              }))}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
