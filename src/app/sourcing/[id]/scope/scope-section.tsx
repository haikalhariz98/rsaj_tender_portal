import Link from "next/link";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { DataList } from "@/components/data-list";
import { ClipboardIcon, ScaleIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { Badge, type Tone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { formatDate } from "@/lib/format";
import type { scopeTab } from "@/lib/scope/read";
import { NOT_SET, SCOPE_CONFIG_PATH } from "@/lib/scope/labels";

import { EditPanelDrawer, MarkVerifiedDrawer, TableScopeDrawer, VerifyColumnDrawer } from "./editors";

type Data = NonNullable<Awaited<ReturnType<typeof scopeTab>>>;

const STATE_TONE: Record<Data["panel"]["state"], Tone> = { NONE: "neutral", DRAFT: "info", VERIFIED: "ok", SCAN_GONE: "err" };
const levelTone = (l: string) => (l === "block" || l === "err" ? "err" : l === "info" ? "info" : "warn") as "err" | "warn" | "info";

/**
 * Scope: the scope statement, the specification panel with its signed form, and the
 * readiness card. Every verification is "recorded on behalf of, not signed"; the panel is
 * verified only with a live SULIT scan of its signed form.
 */
export function ScopeSection({ d }: { d: Data }) {
  const { panel, scope, readiness, exercise, approval } = d;
  const bqHref = `/sourcing/${exercise.id}?tab=scope&section=bq`;
  const columnsUnset = panel.id != null && panel.columns.length === 0;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<ClipboardIcon size={17} />} title="Scope of the work" subtitle="Who scoped it and what it covers. It is recorded in the bill of quantities' header." actions={<ButtonLink href={bqHref} variant="secondary" size="sm">Open the bill</ButtonLink>} />
        <CardBody>
          {scope ? (
            <KeyValues
              columns={2}
              items={[
                { label: "Scoped by", value: scope.scopedBy },
                { label: "From", value: `Bill of quantities, version ${scope.fromVersion}` },
                { label: "Scope statement", value: <span className="whitespace-pre-line">{scope.statement}</span> },
              ]}
            />
          ) : (
            <EmptyState size="sm" title="No scope recorded yet" action={<ButtonLink href={bqHref} size="sm">Start the bill of quantities</ButtonLink>}>
              The scope statement and who scoped the work are entered in the header of the bill of quantities.
            </EmptyState>
          )}
        </CardBody>
      </Card>

      <Card id="specification-panel" className="scroll-mt-24">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Specification panel"
          subtitle={panel.statement}
          actions={<Badge tone={STATE_TONE[panel.state]} dot>{panel.stateLabel}</Badge>}
        />
        {panel.id == null ? (
          <EmptyState size="sm" title="The panel has not been started" action={<EditPanelDrawer exerciseId={exercise.id} isNew raw={panel.raw} kinds={panel.options.contractKinds} statuses={panel.options.projectStatuses} bills={panel.options.bills} clearsVerifications={false} />}>
            Record its contract kind, status and revisions; then who verified each column of the signed form, and attach the form itself.
          </EmptyState>
        ) : (
          <CardBody className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start gap-3">
              <EditPanelDrawer exerciseId={exercise.id} isNew={false} raw={panel.raw} kinds={panel.options.contractKinds} statuses={panel.options.projectStatuses} bills={panel.options.bills} clearsVerifications={panel.state === "VERIFIED" || panel.columns.some((c) => c.verifiedBy != null)} />
              <MarkVerifiedDrawer exerciseId={exercise.id} verify={panel.verify} scans={panel.signedFormScans} reverify={panel.reverify} />
            </div>
            {panel.findings.length > 0 && (
              <div className="flex flex-col gap-2">
                {panel.findings.map((f, i) => (
                  <Callout key={i} tone={levelTone(f.level)}>{f.text}</Callout>
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
                <EmptyState size="sm" title="The panel's columns are not set" action={<ButtonLink href={SCOPE_CONFIG_PATH} size="sm" variant="secondary">Set them under Configuration</ButtonLink>}>
                  The signed form&apos;s verification columns are configuration. Until they are set nothing can be verified.
                </EmptyState>
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
                      {c.verifiedBy ? <Badge tone="ok" dot>Verified</Badge> : panel.state === "VERIFIED" ? null : <VerifyColumnDrawer exerciseId={exercise.id} column={c.code} columnLabel={c.label} people={panel.options.people.map((p) => ({ value: p.id, label: p.name }))} />}
                    </li>
                  ))}
                </ul>
              )}
              {panel.cleared.length > 0 && (
                <details className="mt-3 text-[13px] text-ink-2">
                  <summary className="cursor-pointer font-semibold text-ink-3">Cleared verifications ({panel.cleared.length})</summary>
                  <ul className="mt-2 flex flex-col gap-1 pl-4">
                    {panel.cleared.map((c, i) => (
                      <li key={i}>{c.column}, by {c.by}: cleared on {formatDate(c.clearedOn)} when the panel was edited.</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </CardBody>
        )}
      </Card>

      {panel.id ? (
        <div id="signed-panel-form" className="scroll-mt-24">
        <OwnerAttachments
          owner={{ kind: "specificationPanel", id: panel.id }}
          title="Signed panel form"
          subtitle="Scanned and filed as SULIT. A verified panel stands only while the scan it was verified on is live; another scan attached later counts once the panel is verified again."
          only={["SPEC_PANEL_FORM"]}
          required={{ SPEC_PANEL_FORM: true }}
        />
        </div>
      ) : (
        <Card>
          <CardHeader icon={<ShieldIcon size={17} />} title="Signed panel form" subtitle="Scanned and filed as SULIT." />
          <EmptyState size="sm" title="Start the panel to attach its form">
            The scan is filed against the panel, so the panel is saved first.
          </EmptyState>
        </Card>
      )}

      <Card id="scope-approval" className="scroll-mt-24 overflow-hidden">
        <CardHeader
          icon={<ScaleIcon size={17} />}
          title="Scope approval"
          subtitle="Whether the finalised bill's scope is approved by the committee the sourcing method names, read from the decision at its sitting."
          actions={<Badge tone={approval.badge.tone} dot>{approval.badge.label}</Badge>}
        />
        <CardBody className="flex flex-col gap-5">
          <Callout tone={approval.state === "APPROVED" ? "ok" : approval.state === "NOT_REQUIRED" ? "neutral" : approval.badge.tone === "err" ? "err" : approval.state === "PENDING" ? "info" : "warn"}>{approval.line}</Callout>
          <KeyValues
            columns={3}
            items={[
              { label: "Needs committee approval", value: approval.rule.required === NOT_SET ? <span className="flex flex-col items-start gap-1"><Badge tone="warn">Not set</Badge><Link href={approval.configHref} className="text-[12.5px] font-semibold">Set it under Configuration</Link></span> : approval.rule.required },
              { label: "Committee", value: approval.rule.committee ?? "—" },
              { label: "Where the rule came from", value: approval.rule.provenance ?? "—" },
            ]}
          />
          {/* Offered only where tabling is the next step; every other state's callout above says what is next. */}
          {["NOT_TABLED", "DEFERRED", "OUTCOME_NOT_RECORDED"].includes(approval.state) && (
            <div className="flex flex-wrap items-center gap-3">
              <TableScopeDrawer exerciseId={exercise.id} table={approval.table} />
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
                { key: "version", label: "Bill", width: "14%", mobile: "primary" },
                { key: "sitting", label: "Sitting", width: "26%", mobile: "meta" },
                { key: "tabled", label: "Tabled", mobile: "meta" },
                { key: "outcome", label: "Decision", width: "22%", mobile: "meta" },
              ]}
              rows={approval.matters.map((m) => ({
                id: m.id,
                search: `${m.version} ${m.sitting}`,
                cells: {
                  version: { kind: "text", text: m.version },
                  sitting: { kind: "link", text: m.sitting, href: m.sittingHref, sub: m.committee },
                  tabled: { kind: "text", text: m.tabledOn ? `${formatDate(m.tabledOn)}${m.tabledBy ? `, by ${m.tabledBy}` : ""}` : "—", dim: true },
                  outcome: { kind: "badge", text: m.decidedOn ? `${m.outcome}, ${formatDate(m.decidedOn)}` : m.outcome, tone: m.outcomeTone === "neutral" ? undefined : m.outcomeTone },
                },
              }))}
            />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader icon={<ShieldIcon size={17} />} title={readiness.heading} subtitle="What the documents' approval will look for. Nothing here stops anyone today, so each is a warning, not a refusal." />
        <CardBody>
          {readiness.findings.length === 0 ? (
            <Callout tone="ok">Nothing is outstanding on the checks that exist today.</Callout>
          ) : (
            <ul className="flex flex-col gap-2">
              {readiness.findings.map((f, i) => (
                <li key={i}>
                  <Callout tone={f.level === "info" ? "info" : "warn"} action={<Link href={f.href} className="text-[13px] font-semibold">Go there</Link>}>
                    {f.text}
                  </Callout>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
