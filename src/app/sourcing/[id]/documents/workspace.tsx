
import { EscalateDrawer } from "@/app/approvals/editors";
import { FileIcon, RouteIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState, FindingNote } from "@/components/ui/feedback";
import { Disclosure } from "@/components/ui/disclosure";
import { MoreText } from "@/components/ui/more-text";
import { isMandatoryAct } from "@/components/ui/act";
import { Stepper } from "@/components/ui/stepper";
import { KeyValues } from "@/components/ui/stat";
import { db } from "@/lib/db";
import { startsOpen } from "@/lib/disclosure/open";
import { formatDate } from "@/lib/format";
import { ACT_DONE_LABEL, routedOnLabel } from "@/lib/labels";
import { routeCoreText } from "@/lib/authority/core-routing-labels";
import type { LoadedExercise } from "@/lib/method/repo";
import { IF_REFUSED_TEXT, NOT_APPLICABLE_BEFORE_ASSEMBLY, TENDERING_STATE_LABEL, tenderingRouteLabel, tenderingRouteTone, tenderingStepLabel, tenderingStepTone } from "@/lib/tender-docs/labels";
import { tenderingStepperSteps } from "@/lib/tender-docs/route-flow";
import { documentsTab } from "@/lib/tender-docs/read";
import { conditionsTab } from "@/lib/tender-docs/read-conditions";
import { tableDocumentNote } from "@/lib/window/read";

import { RouteSteps } from "../route-steps";
import { ConditionsCards } from "./conditions";
import { InspectionLogCard } from "./inspection-log";
import { DecideDrawer, type FixedWindow, RefreshFlagsDrawer, StartPackDrawer, SubmitPackDrawer, TakeNewPartsDrawer } from "./editors";
import { PartsList, type PartRow } from "./parts-list";
import { requireStaff } from "@/app/_auth/actor";

type Data = NonNullable<Awaited<ReturnType<typeof documentsTab>>>;
type Route = LoadedExercise["ex"]["approvalInstances"][number];

const GONE = (
  <Card>
    <EmptyState title="Exercise not found" />
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
 * The exercise's Tender documents tab: one card holding the pack's facts and acts and its parts as a
 * checklist, then the route it goes by and the versions kept (founder, 2026-10-05). What still stands
 * between the pack and approval is not listed here: Submit stays clickable and the server's refusal
 * says what is missing. Only this tab's data is read; the exercise's own routes arrive from the page,
 * which already holds them.
 */
export async function DocumentsWorkspace({ exerciseId, today, routes }: { exerciseId: string; today: string | null; routes: Route[] }) {
  // Whose records: the signed-in person's organisation (ADR 0034 D10). The page has already asked; the read is cached per request.
  const scope = await requireStaff();
  const [d, conditions, tableNote] = await Promise.all([documentsTab(scope.organisationId, exerciseId), conditionsTab(scope.organisationId, exerciseId), tableDocumentNote(scope.organisationId, exerciseId)]);
  if (!d) return GONE;
  const draft = d.pack?.status === "Draft";
  const returned = d.pack?.status === TENDERING_STATE_LABEL.RETURNED ? d.pack : null;
  const warnings = d.readiness.filter((r) => r.level !== "block").map((r) => r.text);
  const parts: PartRow[] = (d.pack?.parts ?? []).map((p) => ({
    id: p.id,
    printedNumber: p.printedNumber,
    label: p.label,
    isAppendix: p.isAppendix,
    appendixHref: d.appendixHref,
    role: p.role,
    content: p.content,
    source: p.source,
    issuedAs: p.issuedAs,
    uploadNote: p.uploadNote,
    preparedBy: p.preparedBy,
    mandatory: p.mandatory,
    inTableDocument: p.inTableDocument,
    state: p.state,
    stateTone: p.stateKey === "neutral" ? undefined : p.stateKey,
    omittedBecause: p.omittedBecause,
    earlierOmission: p.earlierOmission,
    missing: p.missing,
    template: p.template,
    files: p.frozen ? p.frozen.files.map((f) => ({ title: f.title, versionNo: f.versionNo, live: true })) : p.files,
    actions: p.actions,
  }));
  // A draft has no pack kind yet: it is recorded when the exercise moves into preparation.
  const notDecided = d.exercise.status === "Draft" && !d.pack;
  const readyCount = (d.pack?.parts ?? []).filter((p) => p.state === "Ready").length;
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
      notes={returned ? ["The returned version stays as it was frozen.", "Carries each part's state, files and the Appendix."] : []}
    />
  ) : draft ? (
    <SubmitPackDrawer
      exerciseId={exerciseId}
      today={today}
      dates={d.entered}
      warnings={warnings}
      rows={[
        ["Version", d.facts.version],
        ["Parts", `${d.pack!.parts.length}, ${d.pack!.parts.filter((p) => p.state === "Ready").length} ready`],
        ["Standard form", d.facts.standardForm],
      ]}
    />
  ) : null;

  const facts = [
    ...(notDecided ? [{ label: "Documents", value: "Decided when it moves into preparation" }] : []),
    { label: "Contract basis", value: d.facts.contractBasis },
    { label: "Standard form", value: d.facts.standardForm },
    ...(d.pack ? [] : [{ label: "Version", value: d.facts.version }]),
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
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileIcon size={17} />}
          title={notDecided || d.facts.documentPack === NOT_APPLICABLE_BEFORE_ASSEMBLY ? "Tender documents" : d.facts.documentPack}
          subtitle={d.pack ? d.facts.version : "Documents tenderers receive."}
          actions={
            <>
              {d.pack && <Badge tone={PACK_TONE[d.pack.status] ?? "neutral"} dot>{d.pack.status}</Badge>}
              {d.appendixHref && <ButtonLink href={d.appendixHref} variant="secondary" size="sm">{draft ? "Enter the Appendix" : "Open the Appendix"}</ButtonLink>}
              {d.printHref && <ButtonLink href={d.printHref} variant="secondary" size="sm">Print</ButtonLink>}
              {d.printHref && <ButtonLink href={`${d.printHref}?set=table`} variant="secondary" size="sm">Tender Table Document</ButtonLink>}
              {draft ? <span id="submit" className="scroll-mt-24">{primary}</span> : primary}
            </>
          }
        />
        <CardBody className="flex flex-col gap-4">
          <KeyValues columns={3} items={facts} />
          {returned && (
            <Callout tone="warn" title={TENDERING_STATE_LABEL.RETURNED}>
              {returned.returnedBecause || "No reason recorded."} Start the next version to amend.
            </Callout>
          )}
          {!d.pack && !d.start.allowed && <Callout tone="warn" title="Not started">{d.start.reason}</Callout>}
          {d.facts.status === TENDERING_STATE_LABEL.APPROVED && <p className="text-[13px] text-ink-2">Frozen. Change by addendum under <ButtonLink href={`/sourcing/${exerciseId}?tab=documents&section=publishing`} variant="link" size="sm">Publishing</ButtonLink>.</p>}
        </CardBody>
        {d.pack && (
          <div className="border-t border-line px-5 py-3 sm:px-6">
            <Disclosure
              id="parts"
              defaultOpen={startsOpen({ finding: d.pack.parts.some((p) => p.stateKey === "warn"), actNow: !!d.pack.newParts || !!d.pack.refresh })}
              title={<span className="text-[14px] font-bold text-ink">Documents to issue</span>}
              summary={<>{readyCount} of {d.pack.parts.length} ready</>}
            >
              <div className="-mx-5 sm:-mx-6">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pb-3 sm:px-6">
                  <p className="inline-flex min-w-[12rem] flex-1 items-center gap-1 text-[12.5px] text-ink-3">In print order. <MoreText label="How a part becomes ready" text={hasBq ? "Ready when its file is uploaded or its text merges. Bill issued unpriced where built on screen." : "Ready when its file is uploaded or its text merges."} /></p>
                  {d.pack.newParts && <TakeNewPartsDrawer exerciseId={exerciseId} parts={d.pack.newParts.parts} confirmedParts={d.pack.newPartsKey ?? ""} />}
                  {d.pack.refresh && <RefreshFlagsDrawer exerciseId={exerciseId} refresh={d.pack.refresh} confirmedChanges={d.pack.refreshKey ?? ""} />}
                </div>
                <PartsList exerciseId={exerciseId} parts={parts} />
              </div>
            </Disclosure>
          </div>
        )}
      </Card>

      {conditions && (d.pack || d.exercise.status === "Draft") && <ConditionsCards c={conditions} packless={!d.pack} />}

      {d.pack && d.exercise.status !== "Draft" && <InspectionLogCard organisationId={scope.organisationId} exerciseId={exerciseId} />}

      {(d.pack || routes.length > 0) && <RouteCard versionLabel={(() => { const v = d.versions.find((x) => x.submittedOn); return v ? `Version ${v.versionNo}` : null; })()} exerciseId={exerciseId} approvedOn={d.dates && "approvedOn" in d.dates ? (d.dates.approvedOn ?? null) : null} routes={routes} decide={d.route?.decide ?? null} proposed={d.proposed} today={today} />}

      {d.versions.length > 1 && (
        <Disclosure boxed title="Versions" summary={`${d.versions.length} versions`}>
          <ul className="divide-y divide-line/70">
            {d.versions.map((v) => (
              <li key={v.versionNo} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-[13px]">
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
        </Disclosure>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the route

async function RouteCard({ exerciseId, routes, decide, proposed, today, versionLabel, approvedOn }: { approvedOn: string | null; versionLabel: string | null; exerciseId: string; routes: Route[]; decide: NonNullable<Data["route"]>["decide"] | null; proposed: Data["proposed"]; today: string | null }) {
  const inst = routes[0] ?? null;
  const earlier = routes.slice(1);
  const officeName = (code: string | null) => (code ? "an office no longer configured" : null);
  if (!inst) {
    return (
      <Card>
        <CardHeader
          icon={<RouteIcon size={17} />}
          title="Approval for tendering"
          divided={false}
          subtitle={<>Not submitted yet. <MoreText label="What submitting does" text={`Submitting opens the route the approval matrix sets for this method and value. ${IF_REFUSED_TEXT}`} /></>}
        />
      </Card>
    );
  }
  // The chain note below says what these two warnings say (chain as entered, not checked against the core routing): said once.
  const CHAIN_NOTE_CODES = new Set(["CORE_AS_ENTERED", "CORE_NOT_CHECKED"]);
  const warnings = ((inst.warnings as { code?: string; level: string; messageEn: string }[]) ?? []).filter((w) => !(inst.checkedAgainstMatrix && w.code && CHAIN_NOTE_CODES.has(w.code)));
  const people = decide?.people ?? [];
  const everyone = people.length ? people : (await db.person.findMany({ where: { organisationId: inst.organisationId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((p) => ({ value: p.id, label: p.name }));
  // Open while the route is pending or sent back, or holds a finding; folded to its outcome once approved (0005 R14).
  const decided = inst.status === "APPROVED";
  const ruleLine = inst.ruleLabel ? `${inst.ruleLabel}${inst.ruleClause ? ` · ${inst.ruleClause}` : ""}` : null;
  const submittedLine = `${versionLabel ? `${versionLabel}, submitted` : "Submitted"} ${formatDate(inst.openedAt)} under ${inst.matrixLabel ?? "an issue no longer on file"}.`;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        collapsible
        id="approval"
        defaultOpen={startsOpen({ inProgress: !decided, finding: warnings.length > 0 })}
        summary={decided ? `${ruleLine ? `${ruleLine} · ` : ""}Approved${approvedOn ? ` ${approvedOn}` : ""}` : undefined}
        icon={<RouteIcon size={17} />}
        title="Approval for tendering"
        subtitle={decided ? undefined : submittedLine}
        actions={decided ? undefined : <Badge tone={tenderingRouteTone(inst.status)}>{tenderingRouteLabel(inst.status, inst.warnings)}</Badge>}
      >
      <CardBody className="flex flex-col gap-4">
        {decided && <p className="text-[12.5px] text-ink-3">{submittedLine}</p>}
        {/* A decision point: the rule and its clause stay on the surface while the route is open (0005 R13 item 4). */}
        {!decided && <p className="text-[13px] break-words text-ink-2"><span className="font-semibold text-ink">Rule</span> {ruleLine ?? <Badge tone="warn">Not recorded</Badge>}</p>}
        {/* The same helper the Overview's stepper reads, so the route is worded once. Decide and Escalate sit on the pending step below. */}
        <Stepper label="Approval for tendering" steps={tenderingStepperSteps(inst)} />
        {inst.status === "REJECTED" && (
          <Callout tone="warn" title={TENDERING_STATE_LABEL.RETURNED}>
            {inst.rejectionReason || "No reason recorded."} The documents are amended in the next version.
          </Callout>
        )}
        {warnings.map((w, i) => (
          <FindingNote key={i} level={w.level}>{w.messageEn}</FindingNote>
        ))}
        {inst.status === "PENDING" && (
          <span className="self-start"><MoreText label="How the steps are decided" text={`Steps are decided in order: each waits for the one before it. ${IF_REFUSED_TEXT}`} /></span>
        )}
      </CardBody>
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
      <CardBody className="flex flex-col gap-3 border-t border-line">
        <Disclosure boxed title="How this route was chosen">
          <div className="flex flex-col gap-4">
            <KeyValues
              columns={2}
              items={[
                ...(decided ? [{ label: "Rule", value: ruleLine ?? "Not recorded" }] : []),
                { label: "Routed on", value: routedOnLabel(inst.cond, "exercise") },
              ]}
            />
            {inst.checkedAgainstMatrix && (
              <p className="text-[12.5px] break-words text-ink-3">
                Chain beneath the approver: {routeCoreText(inst, (c) => { const n = officeName(c) ?? "an office no longer configured"; return { en: n }; }).en}
              </p>
            )}
          </div>
        </Disclosure>
        {earlier.length > 0 && (
          <Disclosure boxed title="Earlier routes" summary={`${earlier.length} kept on record`}>
            <ul className="divide-y divide-line/70">
              {earlier.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 py-3 text-[13px]">
                  <Badge tone="neutral">{tenderingRouteLabel(e.status, e.warnings)}</Badge>
                  <span className="text-ink-2">
                    Submitted {formatDate(e.openedAt)} · {e.steps.map((s) => s.roleLabel).join(" → ")}
                    {e.rejectionReason ? ` · “${e.rejectionReason}”` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </CardBody>
      </CardHeader>
    </Card>
  );
}
