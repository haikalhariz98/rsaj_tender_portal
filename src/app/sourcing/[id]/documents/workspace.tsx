import Link from "next/link";

import { EscalateDrawer } from "@/app/approvals/editors";
import { ClockIcon, FileIcon, RouteIcon, ScaleIcon, ShieldIcon, SlidersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { isMandatoryAct } from "@/components/ui/act";
import { KeyValues } from "@/components/ui/stat";
import { db } from "@/lib/db";
import { formatOrgDay } from "@/lib/format";
import { ACT_DONE_LABEL, routedOnLabel } from "@/lib/labels";
import { routeCoreText } from "@/lib/authority/core-routing-labels";
import type { LoadedExercise } from "@/lib/method/repo";
import { findingsSummary, IF_REFUSED_TEXT, NOT_APPLICABLE_BEFORE_ASSEMBLY, TENDERING_STATE_LABEL, tenderingRouteLabel, tenderingRouteTone, tenderingStepLabel, tenderingStepTone } from "@/lib/tender-docs/labels";
import { documentsTab } from "@/lib/tender-docs/read";
import { conditionsTab } from "@/lib/tender-docs/read-conditions";
import { tableDocumentNote } from "@/lib/window/read";

import { RouteSteps } from "../route-steps";
import { ConditionsCards } from "./conditions";
import { DecideDrawer, type FixedWindow, RefreshFlagsDrawer, StartPackDrawer, SubmitPackDrawer } from "./editors";
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
  [TENDERING_STATE_LABEL.WITH_APPROVAL]: "brand",
  [TENDERING_STATE_LABEL.APPROVED]: "ok",
  [TENDERING_STATE_LABEL.RETURNED]: "warn",
  Void: "neutral",
};

/**
 * The exercise's Tender documents tab: the pack, its parts, what stands between it and
 * submission, the route it goes by, and the versions kept. Only this tab's data is read; the
 * exercise's own routes arrive from the page, which already holds them.
 */
export async function DocumentsWorkspace({ exerciseId, today, timeZone, routes }: { exerciseId: string; today: string | null; timeZone: string | null; routes: Route[] }) {
  const [d, conditions, tableNote] = await Promise.all([documentsTab(exerciseId), conditionsTab(exerciseId), tableDocumentNote(exerciseId)]);
  if (!d) return GONE;
  const draft = d.pack?.status === "Draft";
  const returned = d.pack?.status === TENDERING_STATE_LABEL.RETURNED ? d.pack : null;
  const warnings = d.readiness.filter((r) => r.level !== "block").map((r) => r.text);
  const blocks = d.readiness.filter((r) => r.level === "block");
  const parts: PartRow[] = (d.pack?.parts ?? []).map((p) => ({
    id: p.id,
    printedNumber: p.printedNumber,
    label: p.label,
    role: p.role,
    content: p.content,
    source: p.source,
    uploadNote: p.uploadNote,
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
          title={notDecided || d.facts.documentPack === NOT_APPLICABLE_BEFORE_ASSEMBLY ? "Tender documents" : d.facts.documentPack}
          subtitle="The documents tenderers receive, assembled from the parts configured for this pack and basis."
          actions={d.pack ? <Badge tone={PACK_TONE[d.pack.status] ?? "neutral"} dot>{d.pack.status}</Badge> : undefined}
        />
        <CardBody className="flex flex-col gap-4">
          <div className={primary || d.appendixHref || d.printHref ? "flex flex-wrap items-center gap-2" : "hidden"}>
            {primary}
            {d.appendixHref && <ButtonLink href={d.appendixHref} variant="secondary" size="sm">{draft ? "Enter the Appendix" : "Open the Appendix"}</ButtonLink>}
            {d.printHref && <ButtonLink href={d.printHref} variant="secondary" size="sm">Print the pack</ButtonLink>}
            {d.printHref && <ButtonLink href={`${d.printHref}?set=table`} variant="secondary" size="sm">Tender Table Document</ButtonLink>}
          </div>
          <KeyValues
            columns={3}
            items={[
              { label: "Documents", value: notDecided ? "Decided when it moves into preparation" : d.facts.documentPack },
              { label: "Contract basis", value: d.facts.contractBasis },
              { label: "Standard form", value: d.facts.standardForm },
              { label: "Version", value: d.facts.version },
              ...(d.pack ? [{ label: "Tender Table Document", value: tableNote?.text ?? "Not known" }] : []),
              ...(d.pack || d.exercise.status !== "Draft" ? [{ label: "Restricted", value: d.facts.restricted }] : []),
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
            <Callout tone="warn" title={TENDERING_STATE_LABEL.RETURNED}>
              {returned.returnedBecause || "No reason recorded."} Start the next version to amend it; this one stays as it was frozen.
            </Callout>
          )}
          {!d.pack && !d.start.allowed && <Callout tone="info" title="Not started">{d.start.reason}</Callout>}
          {d.facts.status === TENDERING_STATE_LABEL.APPROVED && <Callout tone="ok" title={TENDERING_STATE_LABEL.APPROVED}>The documents stand as frozen. A change from here is an addendum, made on the Invitation tab once the window is published.</Callout>}
        </CardBody>
      </Card>

      {draft && (
        <Card id="submit" className="scroll-mt-24">
          <CardHeader icon={<ShieldIcon size={17} />} title="Before it can go for approval" subtitle={findingsSummary(blocks.length, d.readiness.length - blocks.length)} />
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
            actions={d.pack.refresh ? <RefreshFlagsDrawer exerciseId={exerciseId} refresh={d.pack.refresh} confirmedChanges={d.pack.refreshKey ?? ""} /> : undefined}
          />
          <PartsList exerciseId={exerciseId} parts={parts} printHref={d.printHref ?? `/sourcing/${exerciseId}/documents/print`} />
        </Card>
      )}

      {conditions && (d.pack || d.exercise.status === "Draft") && <ConditionsCards c={conditions} packless={!d.pack} />}

      {(d.pack || routes.length > 0) && <RouteCard versionLabel={(() => { const v = d.versions.find((x) => x.submittedOn); return v ? `Version ${v.versionNo}` : null; })()} exerciseId={exerciseId} routes={routes} decide={d.route?.decide ?? null} proposed={d.proposed} today={today} timeZone={timeZone} />}

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

async function RouteCard({ exerciseId, routes, decide, proposed, today, timeZone, versionLabel }: { versionLabel: string | null; exerciseId: string; routes: Route[]; decide: NonNullable<Data["route"]>["decide"] | null; proposed: Data["proposed"]; today: string | null; timeZone: string | null }) {
  const inst = routes[0] ?? null;
  const earlier = routes.slice(1);
  const officeName = (code: string | null) => (code ? "an office no longer configured" : null);
  if (!inst) {
    return (
      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="Approval for tendering" subtitle="Not submitted yet." />
        <CardBody>
          <p className="text-[13.5px] text-ink-2">
            Submitting opens the route the approval matrix sets for this method and value. {IF_REFUSED_TEXT}
          </p>
        </CardBody>
      </Card>
    );
  }
  // The chain note below says what these two warnings say (chain as entered, not checked against the core routing): said once.
  const CHAIN_NOTE_CODES = new Set(["CORE_AS_ENTERED", "CORE_NOT_CHECKED"]);
  const warnings = ((inst.warnings as { code?: string; level: string; messageEn: string }[]) ?? []).filter((w) => !(inst.checkedAgainstMatrix && w.code && CHAIN_NOTE_CODES.has(w.code)));
  const people = decide?.people ?? [];
  const everyone = people.length ? people : (await db.person.findMany({ where: { organisationId: inst.organisationId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((p) => ({ value: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<RouteIcon size={17} />}
          title="Approval for tendering"
          subtitle={`${versionLabel ? `${versionLabel}, submitted` : "Submitted"} ${formatOrgDay(inst.openedAt, timeZone)} under ${inst.matrixLabel ?? "an issue no longer on file"}.`}
          actions={<Badge tone={tenderingRouteTone(inst.status)}>{tenderingRouteLabel(inst.status, inst.warnings)}</Badge>}
        />
        <CardBody className="flex flex-col gap-4">
          <KeyValues
            columns={2}
            items={[
              { label: "Rule", value: inst.ruleLabel ? `${inst.ruleLabel}${inst.ruleClause ? ` · ${inst.ruleClause}` : ""}` : "Not recorded" },
              { label: "Routed on", value: routedOnLabel(inst.cond) },
            ]}
          />
          {warnings.map((w, i) => (
            <Callout key={i} tone={levelTone(w.level === "err" ? "block" : w.level)}>{w.messageEn}</Callout>
          ))}
        </CardBody>
        {inst.status === "PENDING" && (
          <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">
            Steps are decided in order: each waits for the one before it. {IF_REFUSED_TEXT}
          </p>
        )}
        {inst.status === "REJECTED" && (
          <div className="border-t border-line px-5 py-3 sm:px-6">
            <Callout tone="warn" title={TENDERING_STATE_LABEL.RETURNED}>
              {inst.rejectionReason || "No reason recorded."} The documents are amended in the next version.
            </Callout>
          </div>
        )}
        {inst.checkedAgainstMatrix && (
          <p className="border-t border-line px-5 py-2.5 text-[12.5px] break-words text-ink-3 sm:px-6">
            Chain beneath the approver: {routeCoreText(inst, (c) => { const n = officeName(c) ?? "an office no longer configured"; return { en: n, ms: n }; }).en}
          </p>
        )}
        <RouteSteps
          inst={inst}
          stepLabel={tenderingStepLabel}
          stepTone={tenderingStepTone}
          action={(s, { earlierDone, isLast }) => (
            <>
              {inst.status === "PENDING" && s.decision === "PENDING" && !s.committeeCode && s.roleCode && (
                <EscalateDrawer stepId={s.id} office={s.actingRoleLabel ?? s.roleLabel} mandatory={isMandatoryAct(s.act)} people={everyone} />
              )}
              {inst.status === "PENDING" && s.decision === "PENDING" && earlierDone && !s.committeeCode && (
                <DecideDrawer exerciseId={exerciseId} stepId={s.id} office={s.roleLabel} done={ACT_DONE_LABEL[s.act] ?? "Done"} people={decide?.stepId === s.id ? people : everyone} today={today} recordsDates={isLast} proposed={proposed} fixedWindow={decide?.stepId === s.id && "fixedWindow" in decide ? (decide.fixedWindow as FixedWindow | null) : null} />
              )}
            </>
          )}
        />
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
