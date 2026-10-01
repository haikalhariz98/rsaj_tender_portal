import Link from "next/link";

import { EscalateDrawer } from "@/app/approvals/editors";
import { ClockIcon, FileIcon, RouteIcon, ScaleIcon, ShieldIcon, SlidersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { ActBadge, actLabel, isMandatoryAct } from "@/components/ui/act";
import { KeyValues } from "@/components/ui/stat";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { ACT_DONE_LABEL } from "@/lib/labels";
import { escalationText } from "@/lib/authority/escalation-labels";
import { routeCoreText, stepOriginText } from "@/lib/authority/core-routing-labels";
import { returnTargetBeforeNext, type RejectionKind } from "@/lib/authority/rejection";
import { ifRejectedText } from "@/lib/authority/rejection-labels";
import type { LoadedExercise } from "@/lib/method/repo";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { tenderingRouteLabel } from "@/lib/tender-docs/labels";
import { documentsTab } from "@/lib/tender-docs/read";
import { routeTone, stepTone } from "@/lib/ui/status-tone";

import { DecideDrawer, StartPackDrawer, SubmitPackDrawer } from "./editors";
import { PartsList, type PartRow } from "./parts-list";

type Data = NonNullable<Awaited<ReturnType<typeof documentsTab>>>;
type Route = LoadedExercise["ex"]["approvalInstances"][number];

const levelTone = (l: string) => (l === "block" ? "err" : l === "info" ? "info" : "warn") as "err" | "warn" | "info";
const GONE = (
  <Card>
    <EmptyState title="This exercise could not be found">Its organisation may no longer be configured.</EmptyState>
  </Card>
);

/// The pack's status as a badge: one colour for one meaning (status-tone).
const PACK_TONE: Record<string, "neutral" | "brand" | "ok" | "warn" | "err"> = {
  Draft: "neutral",
  "With approval": "brand",
  "Approved for tendering": "ok",
  "Returned for amendment": "warn",
  Void: "neutral",
};

/**
 * The exercise's Tender documents tab: the pack, its parts, what stands between it and
 * submission, the route it goes by, and the versions kept. Only this tab's data is read; the
 * exercise's own routes arrive from the page, which already holds them.
 */
export async function DocumentsWorkspace({ exerciseId, today, timeZone, routes }: { exerciseId: string; today: string | null; timeZone: string | null; routes: Route[] }) {
  const d = await documentsTab(exerciseId);
  if (!d) return GONE;
  const draft = d.pack?.status === "Draft";
  const returned = d.pack?.status === "Returned for amendment" ? d.pack : null;
  const warnings = d.readiness.filter((r) => r.level !== "block").map((r) => r.text);
  const blocks = d.readiness.filter((r) => r.level === "block");
  const parts: PartRow[] = (d.pack?.parts ?? []).map((p) => ({
    id: p.id,
    printedNumber: p.printedNumber,
    label: p.label,
    role: p.role,
    content: p.content,
    source: p.source,
    preparedBy: p.preparedBy,
    mandatory: p.mandatory,
    inTableDocument: p.inTableDocument,
    state: p.state,
    stateTone: p.stateKey === "neutral" ? undefined : p.stateKey,
    omittedBecause: p.omittedBecause,
    template: p.template,
    isUpload: p.attach != null,
    files: p.frozen ? p.frozen.files.map((f) => ({ title: f.title, versionNo: f.versionNo, live: true, fingerprint: f.fingerprint })) : p.files,
    hasFrozenText: p.frozen != null,
    markReady: p.actions.markReady,
    omit: p.actions.omit,
    reopen: p.actions.reopen,
    pickTemplate: p.actions.pickTemplate,
    templateId: p.actions.pickTemplate.allowed ? p.actions.pickTemplate.current : "",
  }));
  // A draft has no pack kind yet: it is recorded when the exercise moves into preparation.
  const notDecided = d.exercise.status === "Draft" && !d.pack;
  const hasBq = (d.pack?.parts ?? []).some((p) => p.source === "The bill of quantities, unpriced");

  // The primary action of the tab, by where the pack stands.
  const primary = !d.pack && !d.start.allowed ? null : !d.pack || returned ? (
    <StartPackDrawer
      exerciseId={exerciseId}
      label={d.start.allowed ? d.start.label : "Start the tender documents"}
      allowed={d.start.allowed ? { allowed: true } : d.start}
      rows={[
        ["Documents", d.facts.documentPack],
        ["Contract basis", d.facts.contractBasis],
        ["Standard form", d.facts.standardForm],
      ]}
      notes={returned ? ["The returned version stays as it was frozen.", "The next version carries each part's state, template and omission, its live files, and the Appendix."] : []}
    />
  ) : draft ? (
    <SubmitPackDrawer
      exerciseId={exerciseId}
      allowed={d.submit}
      today={today}
      warnings={warnings}
      rows={[
        ["Version", d.facts.version],
        ["Parts", `${d.pack!.parts.length}, ${d.pack!.parts.filter((p) => p.state === "Ready").length} ready`],
        ["Standard form", d.facts.standardForm],
      ]}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<FileIcon size={17} />}
          title={notDecided ? "Tender documents" : d.facts.documentPack}
          subtitle="The documents tenderers receive, assembled from the parts configured for this pack and basis."
          actions={d.pack ? <Badge tone={PACK_TONE[d.pack.status] ?? "neutral"} dot>{d.pack.status}</Badge> : undefined}
        />
        <CardBody className="flex flex-col gap-4">
          <div className={primary || d.appendixHref || d.printHref ? "flex flex-wrap items-center gap-2" : "hidden"}>
            {primary}
            {d.appendixHref && <ButtonLink href={d.appendixHref} variant="secondary" size="sm">{draft ? "Enter the Appendix" : "Open the Appendix"}</ButtonLink>}
            {d.printHref && <ButtonLink href={d.printHref} variant="secondary" size="sm">Print the pack</ButtonLink>}
          </div>
          <KeyValues
            columns={3}
            items={[
              { label: "Documents", value: notDecided ? "Decided when it moves into preparation" : d.facts.documentPack },
              { label: "Contract basis", value: d.facts.contractBasis },
              { label: "Standard form", value: d.facts.standardForm },
              { label: "Version", value: d.facts.version },
              { label: "Where it stands", value: d.facts.status },
              ...(d.dates && "approvedOn" in d.dates
                ? [
                    { label: "Tendering starts", value: d.dates.start },
                    { label: "Closing", value: d.dates.closing },
                    { label: "Approved on", value: d.dates.approvedOn },
                  ]
                : d.dates && "proposedStart" in d.dates
                  ? [
                      { label: "Proposed start", value: d.dates.proposedStart },
                      { label: "Proposed closing", value: d.dates.proposedClosing },
                    ]
                  : []),
            ]}
          />
          {returned && (
            <Callout tone="warn" title="Returned for amendment">
              {returned.returnedBecause || "No reason recorded."} Start the next version to amend it; this one stays as it was frozen.
            </Callout>
          )}
          {!d.pack && !d.start.allowed && <Callout tone="info" title="Not started">{d.start.reason}</Callout>}
          {d.facts.status === "Approved for tendering" && <Callout tone="ok" title="Approved for tendering">The documents stand as frozen. A change from here is an addendum, which is not available yet.</Callout>}
        </CardBody>
      </Card>

      {draft && (
        <Card id="submit" className="scroll-mt-24">
          <CardHeader icon={<ShieldIcon size={17} />} title="Before it can go for approval" subtitle={blocks.length ? `${blocks.length} to put right. Submitting is refused until they are.` : "Nothing blocks submission."} />
          <CardBody>
            {d.readiness.length === 0 ? (
              <Callout tone="ok">Every check passes. Submit it for approval.</Callout>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.readiness.map((f, i) => (
                  <li key={i}>
                    <Callout tone={levelTone(f.level)} action={<Link href={f.href} className="text-[13px] font-semibold">Go there</Link>}>
                      {f.text}
                    </Callout>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {d.pack && (
        <Card id="parts" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title={`Parts, version ${d.pack.versionNo}`}
            subtitle={hasBq ? "In print order. The bill of quantities is issued unpriced: no rate or amount reaches tenderers." : "In print order, as configured when this version was started."}
          />
          <PartsList exerciseId={exerciseId} parts={parts} printHref={d.printHref ?? `/sourcing/${exerciseId}/documents/print`} />
        </Card>
      )}

      {(d.pack || routes.length > 0) && <RouteCard exerciseId={exerciseId} routes={routes} decide={d.route?.decide ?? null} today={today} timeZone={timeZone} />}

      {d.pack && <Card>
        <CardHeader icon={<ScaleIcon size={17} />} title="What the contract type asks of these documents" subtitle="Checked here: six. The other six are checked after award." />
        <CardBody className="flex flex-col gap-5">
          {d.behaviours.notRecorded && <Callout tone="warn">{d.behaviours.notRecorded}</Callout>}
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink-3">Checked here</p>
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {d.behaviours.checkedHere.map((b) => (
                <li key={b.label} className="flex flex-col gap-1 px-4 py-3">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <span className="text-[13.5px] font-semibold text-ink">{b.label}</span>
                    <span className={b.value === "Not set" ? "text-[13px] text-amber-800" : "text-[13px] text-ink-2"}>{b.value}</span>
                  </span>
                  {b.findings.map((f) => (
                    <span key={f} className="text-[12.5px] text-amber-800">{f}</span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
          <details className="text-[13px]">
            <summary className="cursor-pointer font-semibold text-ink-3">Checked after award ({d.behaviours.afterAward.length})</summary>
            <ul className="mt-2 divide-y divide-line/70 rounded-2xl border border-line">
              {d.behaviours.afterAward.map((b) => (
                <li key={b.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
                  <span className="font-semibold text-ink">{b.label}</span>
                  <span className="text-ink-2">{b.value} · {b.where}</span>
                </li>
              ))}
            </ul>
          </details>
        </CardBody>
      </Card>}

      {d.versions.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Versions" subtitle="Each version stays as it was frozen; a change after a return is a new version." />
          <ul className="divide-y divide-line/70">
            {d.versions.map((v) => (
              <li key={v.versionNo} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13px] sm:px-6">
                <span className="font-semibold text-ink">Version {v.versionNo}</span>
                <Badge tone={PACK_TONE[v.status] ?? "neutral"}>{v.status}</Badge>
                <span className="min-w-0 break-words text-ink-2">
                  {v.submittedOn ? `Submitted ${v.submittedOn}` : "Not submitted"}
                  {v.returnedBecause ? ` · “${v.returnedBecause}”` : ""}
                  {v.voidBecause ? ` · ${v.voidBecause}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the route

async function RouteCard({ exerciseId, routes, decide, today, timeZone }: { exerciseId: string; routes: Route[]; decide: NonNullable<Data["route"]>["decide"] | null; today: string | null; timeZone: string | null }) {
  const inst = routes[0] ?? null;
  const earlier = routes.slice(1);
  const officeName = (code: string | null) => (code ? "an office no longer configured" : null);
  if (!inst) {
    return (
      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="Approval for Tendering" subtitle="Not submitted yet." />
        <CardBody>
          <p className="text-[13.5px] text-ink-2">
            Submitting opens the route the approval matrix sets for this method and value. If it is rejected, the documents are returned for amendment; the exercise stays in preparation.
          </p>
        </CardBody>
      </Card>
    );
  }
  const people = decide?.people ?? [];
  const everyone = people.length ? people : (await db.person.findMany({ where: { organisationId: inst.organisationId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((p) => ({ value: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<RouteIcon size={17} />}
          title="Approval for Tendering"
          subtitle={`Submitted ${formatOrgDay(inst.openedAt, timeZone)} under ${inst.matrixLabel ?? "an issue no longer on file"}: ${inst.ruleLabel ?? "a rule no longer on file"} · ${inst.ruleClause || "clause not recorded"}.`}
          actions={<Badge tone={routeTone(inst.status)}>{tenderingRouteLabel(inst.status, inst.warnings)}</Badge>}
        />
        {((inst.warnings as { level: string; messageEn: string }[]) ?? []).length > 0 && (
          <CardBody className="flex flex-col gap-2">
            {(inst.warnings as { level: string; messageEn: string }[]).map((w, i) => (
              <Callout key={i} tone={levelTone(w.level === "err" ? "block" : w.level)}>{w.messageEn}</Callout>
            ))}
          </CardBody>
        )}
        {inst.status === "PENDING" && (
          <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">
            Steps are decided in order: each waits for the one before it.{" "}
            {ifRejectedText({ snapshotAt: inst.rejectionSnapshotAt, kind: inst.rejectionKind as RejectionKind | null, returnToOffice: officeName(inst.rejectionReturnToRoleCode), provenance: inst.rejectionProvenance }, false, returnTargetBeforeNext(inst))}{" "}
            A rejection returns the documents for amendment; the exercise stays in preparation.
          </p>
        )}
        {inst.status === "REJECTED" && (
          <div className="border-t border-line px-5 py-3 sm:px-6">
            <Callout tone="warn" title="Returned for amendment">
              {inst.rejectionReason || "No reason recorded."} The documents are amended in the next version.
            </Callout>
          </div>
        )}
        {inst.checkedAgainstMatrix && (
          <p className="border-t border-line px-5 py-2.5 text-[12.5px] break-words text-ink-3 sm:px-6">
            Chain beneath the approver: {routeCoreText(inst, (c) => { const n = officeName(c) ?? "an office no longer configured"; return { en: n, ms: n }; }).en}
          </p>
        )}
        <ol className="divide-y divide-line/70 border-t border-line">
          {inst.steps.map((s) => {
            const earlierDone = inst.steps.filter((x) => x.sequence < s.sequence).every((x) => x.decision === "DONE");
            const isLast = inst.steps.every((x) => x.id === s.id || x.decision === "DONE");
            return (
              <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <ActBadge act={s.act} />
                  <div className="min-w-0">
                    <div className="font-semibold break-words text-ink">
                      {s.roleLabel} <span className="font-normal text-ink-3">· {actLabel(s.act)}</span>
                    </div>
                    {stepOriginText(inst, s) && <div className="text-[12.5px] text-ink-3">{stepOriginText(inst, s)}</div>}
                    {s.escalation && (
                      <div className="text-[12.5px] break-words text-amber-800">
                        {escalationText({ roleLabel: s.roleLabel, actingRoleLabel: s.actingRoleLabel, escalation: s.escalation, escalationReason: s.escalationReason, declaredByName: s.declaredBy?.name ?? null })}
                      </div>
                    )}
                    <div className="text-[12.5px] text-ink-2">
                      {s.decision === "PENDING"
                        ? inst.status === "PENDING"
                          ? `${earlierDone ? "Awaiting a decision." : "Waits for the step before."}${s.nonDelegable ? " Cannot be delegated." : ""}`
                          : "Not decided: the route closed."
                        : `${DECISION_LABEL[s.decision]} · ${s.decidedByName ?? "Not recorded"} · recorded on behalf of, not signed · ${formatDate(s.decidedOn)}${s.delegation ? ` · under delegation from ${s.delegation.fromPerson.name}` : ""}${s.reason ? ` · “${s.reason}”` : ""}`}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {s.decision !== "PENDING" && <Badge tone={stepTone(s.decision)}>{DECISION_LABEL[s.decision]}</Badge>}
                  {inst.status === "PENDING" && s.decision === "PENDING" && !s.committeeCode && s.roleCode && (
                    <EscalateDrawer stepId={s.id} office={s.actingRoleLabel ?? s.roleLabel} mandatory={isMandatoryAct(s.act)} people={everyone} />
                  )}
                  {inst.status === "PENDING" && s.decision === "PENDING" && earlierDone && !s.committeeCode && (
                    <DecideDrawer exerciseId={exerciseId} stepId={s.id} office={s.roleLabel} done={ACT_DONE_LABEL[s.act] ?? "Done"} people={decide?.stepId === s.id ? people : everyone} today={today} recordsDates={isLast} />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
      {earlier.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Earlier routes" subtitle="Kept on record." />
          <ul className="divide-y divide-line/70">
            {earlier.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] sm:px-6">
                <Badge tone="neutral">{tenderingRouteLabel(e.status, e.warnings)}</Badge>
                <span className="text-ink-2">
                  Submitted {formatOrgDay(e.openedAt, timeZone)} · {e.steps.map((s) => s.roleLabel).join(" → ")}
                  {e.rejectionReason ? ` · “${e.rejectionReason}”` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
