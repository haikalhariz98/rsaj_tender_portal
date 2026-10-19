import { MoreText } from "@/components/ui/more-text";
import { Say } from "@/components/i18n/language-context";
import { CASE_PANEL_TITLE_WORDS as P } from "@/lib/contract/case-page-words";
import Link from "next/link";
import { ClipboardIcon, ClockIcon, FileIcon, RouteIcon } from "@/components/icons";
import { ActBadge, actLabel, isMandatoryAct } from "@/components/ui/act";
import { EscalateDrawer } from "@/app/approvals/editors";
import { escalationText } from "@/lib/authority/escalation-labels";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, FindingNote } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { routeTone, stepTone } from "@/lib/ui/status-tone";
import { type AwardEvaluation } from "@/lib/award/evaluate";
import { awardFindingText } from "@/lib/award/labels";
import { exerciseMatters, latestRoute, matterRecord, type LoadedAward } from "@/lib/award/repo";
import { absentFrom } from "@/lib/award/appointment";
import type { AwardStatus } from "@/lib/award/types";
import { APPOINTMENT_DOMAIN } from "@/lib/method/types";
import { formatDate } from "@/lib/format";
import { type AwardStanding } from "@/lib/suppliers/award-standing";
import { ACT_DONE_LABEL, ACT_LABEL } from "@/lib/labels";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { earlierSteps, returnTargetBeforeNext, type RejectionKind } from "@/lib/authority/rejection";
import { routeCoreText, stepOriginText } from "@/lib/authority/core-routing-labels";
import { appliedText, CHOICE_WHY_TEXT, ifRejectedText, REJECTION_KIND_LABEL } from "@/lib/authority/rejection-labels";
import { db } from "@/lib/db";
import { tablingQuery } from "@/lib/committee/table-prefill";
import { AwardChoiceDrawer, CiteDecisionDrawer, DecideStepDrawer } from "@/app/awards/editors";
import { loadAttributions, routeActed } from "@/lib/auth/attribution-read";
import { money, notSet } from "./shared";

// ------------------------------------------------------------------ approval

export async function ApprovalPanel({
  l,
  ev,
  awardee,
  suggestions,
  today,
  matters,
  sittings,
  roleName,
}: {
  l: LoadedAward;
  ev: AwardEvaluation;
  awardee: AwardStanding | null;
  suggestions: (c: string | null) => { value: string; label: string }[];
  today: string | null;
  matters: Awaited<ReturnType<typeof exerciseMatters>>;
  sittings: { id: string; reference: string; meetingDate: Date; committee: { code: string } }[];
  roleName: (code: string) => string;
}) {
  const { award, ex } = l;
  const status = award.status as AwardStatus;
  const inst = latestRoute(award);
  // Who decided each step and who signed the instrument, signed or recorded from paper, read from the attributions (Phase 2b): the screen never says it by itself.
  const index = await loadAttributions(db, l.org.id, [{ entity: "Award", slot: "signatoryPerson", ids: [award.id] }]);
  const route = await routeActed(db, l.org.id, award.approvalInstances);
  const acted = route.decided;
  const approverStep = inst ? [...inst.steps].reverse().find((x) => (x.act === "A" || x.act === "MA") && !x.committeeCode) : undefined;
  const earlier = award.approvalInstances.filter((i) => i.id !== inst?.id);
  const cited = new Set(award.approvalInstances.flatMap((i) => i.steps.map((s) => s.committeeDecisionId)).filter(Boolean));
  const sig = ev.signatory;
  const cb = ev.committee;
  const ab = ev.approver;
  const OUTCOME = { PENDING: "not decided yet", CARRIED: "carried", DEFERRED: "deferred", NOT_CARRIED: "not carried" } as const;
  // BD-2: the offices the route treated as absent, named from its own warnings.
  const absent = absentFrom((inst ? (inst.warnings as { code?: string; from?: string }[]) : ev.route?.ok ? ev.route.warnings : null) ?? []);
  const absentLine = absent.length > 0 && (
    <p className="text-[13px] break-words text-ink-2">
      <span className="font-semibold">Treated as absent{inst ? " when it was sent" : " today"}:</span> {absent.map(roleName).join(", ")}. No holder or delegate was available; authority went upward.
    </p>
  );
  const amountText = (a: { toString(): string } | null) => (a == null ? "the decision states no amount" : `at ${money(a)}`);
  const lastCommitteeStep = inst ? [...inst.steps].reverse().find((s) => s.committeeCode) : undefined;
  return (
    <div className="flex flex-col gap-6">
      {!inst ? (
        <Card>
          <CardHeader icon={<RouteIcon size={17} />} title={<Say words={P.whoApproves} />} />
          <CardBody className="flex flex-col gap-3">
            {status === "CANCELLED" ? (
              <p className="text-[13.5px] text-ink-2">Cancelled before approval. No route resolved.</p>
            ) : ev.route?.ok ? (
              <>
                <p className="text-[13.5px] text-ink-2">Route if sent today:</p>
                <ol className="flex flex-col gap-1.5">
                  {ev.route.chain.map((s, i) => (
                    <li key={i} className="flex min-w-0 items-center gap-2 text-[13.5px]">
                      <ActBadge act={s.act} step={i + 1} />
                      <span className="min-w-0 font-semibold break-words text-ink">{roleName(s.roleCode)}</span>
                      <span className="text-ink-3">{actLabel(s.act)}{s.committeeCode ? ", as a committee decision" : ""}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[12.5px] break-words text-ink-3">{`${ev.route.ruleLabel}${ev.route.clause ? ` · ${ev.route.clause}` : ""}`}</p>
                {absentLine}
                {ev.route.warnings.map((w, i) => (
                  <FindingNote key={i} level={w.level}>{w.messageEn}</FindingNote>
                ))}
              </>
            ) : ev.route ? (
              <Callout tone="warn">{awardFindingText({ code: ev.route.fault, level: "block", data: { messages: ev.route.messages.join(" ") || null } })}</Callout>
            ) : (
              <Callout tone="warn">{awardFindingText({ code: "NO_ISSUE_IN_FORCE", level: "block" })}</Callout>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            icon={<RouteIcon size={17} />}
            title={<Say words={P.approvalOfAppointment} />}
            subtitle={`Sent ${formatDate(inst.openedAt)}`}
            actions={<span className="inline-flex items-center gap-1"><MoreText label="Rule behind it" text={`${inst.matrixLabel ?? "An issue no longer on file"}: ${inst.ruleLabel ?? "a rule no longer on file"} · ${inst.ruleClause || "clause not recorded"}`} /><Badge tone={routeTone(inst.status)}>{inst.status === "APPROVED" ? "Approved" : inst.status === "PENDING" ? "In progress" : inst.status === "REJECTED" ? "Refused" : "Withdrawn"}</Badge></span>}
          />
          {(absentLine || ((inst.warnings as { level: string; messageEn: string }[]) ?? []).length > 0) && (
            <CardBody className="flex flex-col gap-2">
              {absentLine}
              {((inst.warnings as { level: string; messageEn: string }[]) ?? []).map((w, i) => (
                <FindingNote key={i} level={w.level}>{w.messageEn}</FindingNote>
              ))}
            </CardBody>
          )}
          {inst.status === "PENDING" && awardee?.warning && (
            <div className="border-t border-line px-5 py-3 sm:px-6">
              <Callout tone="warn" title="Awardee's supplier is barred">{awardee.warning.en}</Callout>
            </div>
          )}
          {inst.status === "PENDING" && (
            <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">
              {ifRejectedText({ snapshotAt: inst.rejectionSnapshotAt, kind: inst.rejectionKind as RejectionKind | null, returnToOffice: inst.rejectionReturnToRoleCode ? roleName(inst.rejectionReturnToRoleCode) : null, provenance: inst.rejectionProvenance }, false, returnTargetBeforeNext(inst))}
              {inst.supersedesInstanceId ? " Continues a refused route; earlier decisions stand." : ""}
            </p>
          )}
          {inst.status === "REJECTED" && (() => {
            const rejecting = inst.steps.find((x) => x.decision === "REJECTED");
            if (inst.rejectionApplied && inst.rejectionSource) {
              return (
                <div className="border-t border-line px-5 py-3 sm:px-6">
                  <Callout tone="warn" title="Where the refusal sent it">
                    {appliedText(inst.rejectionApplied as RejectionKind, inst.rejectionSource, inst.rejectionReturnToRoleCode ? roleName(inst.rejectionReturnToRoleCode) : null, inst.rejectionChosenBy?.name ?? null, inst.rejectionChosenBy ? route.chosen(inst.id, inst.rejectionChosenBy.name) : null)}
                  </Callout>
                </div>
              );
            }
            if (inst.rejectionChoices.length > 0 && rejecting && status === "PENDING_APPROVAL") {
              return (
                <div className="border-t border-line px-5 py-3 sm:px-6">
                  <Callout
                    tone="warn"
                    title="Refused: the officer chooses where it goes"
                    action={
                      <AwardChoiceDrawer
                        id={award.id}
                        kinds={(inst.rejectionChoices as RejectionKind[]).map((k) => ({ value: k, label: REJECTION_KIND_LABEL[k] }))}
                        steps={earlierSteps(inst.steps, rejecting.sequence).map((x) => ({ value: String(x.sequence), label: `${x.sequence}. ${x.roleLabel} · ${actLabel(x.act)}` }))}
                        people={suggestions(null)}
                      />
                    }
                  >
                    {CHOICE_WHY_TEXT[(inst.rejectionChoiceWhy as keyof typeof CHOICE_WHY_TEXT | null) ?? "NOT_SET"]}
                  </Callout>
                </div>
              );
            }
            return null;
          })()}
          {inst.checkedAgainstMatrix && (
            <p className="border-t border-line px-5 py-2.5 text-[12.5px] break-words text-ink-3 sm:px-6">
              Chain beneath the approver: {routeCoreText(inst, (c) => { const n = roleName(c); return { en: n }; }).en}
            </p>
          )}
          <ol className="divide-y divide-line/70 border-t border-line">
            {inst.steps.map((s, stepIndex) => {
              const earlierDone = inst.steps.filter((x) => x.sequence < s.sequence).every((x) => x.decision === "DONE");
              const citedRecord = s.committeeDecision ? matterRecord(s.committeeDecision) : null;
              const open = inst.status === "PENDING" && s.decision === "PENDING" && earlierDone;
              const mine = matters.filter((m) => m.meeting.committee.code === s.committeeCode && !cited.has(m.id));
              const offered = mine.map((m) => ({
                value: m.id,
                label: `${m.meeting.reference} · ${m.subject} · ${OUTCOME[m.outcome]}${m.outcome === "PENDING" ? " — cannot be cited until decided" : ""}`,
                disabled: m.outcome === "PENDING",
              }));
              // Nothing tabled that could still discharge the step: offer to table it, filled in.
              const needsTabling = !mine.some((m) => m.outcome === "PENDING" || m.outcome === "CARRIED" || m.outcome === "DEFERRED");
              const sitting = sittings.find((x) => x.committee.code === s.committeeCode);
              const tableHref = sitting
                ? `/committees/${sitting.id}?${tablingQuery({ subject: `Appointment of ${award.awardeeName} for ${ex.title}`, domain: APPOINTMENT_DOMAIN, act: s.act, matterKind: "EXERCISE", matterRef: ex.reference, source: { kind: "award", id: award.id } })}`
                : null;
              return (
                <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <ActBadge act={s.act} step={stepIndex + 1} />
                    <div className="min-w-0">
                      <div className="font-semibold break-words text-ink">
                        {s.roleLabel} <span className="font-normal text-ink-3">· {actLabel(s.act)}{s.committeeCode ? ", as a committee decision" : ""}</span>
                      </div>
                      {stepOriginText(inst, s) && <div className="text-[12.5px] text-ink-3">{stepOriginText(inst, s)}</div>}
                      {s.escalation && (
                        <div className="text-[12.5px] break-words text-amber-800">
                          {escalationText({ roleLabel: s.roleLabel, actingRoleLabel: s.actingRoleLabel, escalation: s.escalation, escalationReason: s.escalationReason, declaredByName: s.declaredBy?.name ?? null }, s.declaredBy ? route.declared(s.id, s.declaredBy.name) : null)}
                        </div>
                      )}
                      <div className="text-[12.5px] break-words text-ink-2">
                        {s.decision === "PENDING"
                          ? inst.status === "PENDING"
                            ? `${earlierDone ? "Awaiting a decision." : "Waits for the step before."}${s.nonDelegable ? " Cannot be delegated." : ""}`
                            : "Not decided: the route closed."
                          : s.carriedFromStepId
                            ? `${DECISION_LABEL[s.decision]} · ${s.decidedByName ?? "Not recorded"} · ${formatDate(s.decidedOn)} · decided on the earlier route and carried onto this one`
                            : s.committeeCode && citedRecord?.record
                            ? `${DECISION_LABEL[s.decision]} · ${citedRecord.record.committee} at ${citedRecord.record.meetingReference}, ${formatDate(citedRecord.record.decisionDate ?? citedRecord.record.meetingDate)} · ${amountText(s.committeeDecision?.amount ?? null)} · ${citedRecord.minuted ? "minuted" : "not yet minuted"}`
                            : `${DECISION_LABEL[s.decision]} · ${acted(s.id, s.decidedByName)} · ${formatDate(s.decidedOn)} · received ${s.receivedOn ? formatDate(s.receivedOn) : "not recorded"}${s.delegation ? ` · under delegation from ${s.delegation.fromPerson.name}` : ""}${s.reason ? ` · “${s.reason}”` : ""}`}
                      </div>
                      {open && s.committeeCode && needsTabling && (
                        <div className="mt-1 text-[12.5px] break-words text-ink-3">
                          {sitting ? `Not tabled yet. The ${s.roleLabel}'s next open sitting is ${sitting.reference}, ${formatDate(sitting.meetingDate)}.` : `Not tabled yet, and no sitting of the ${s.roleLabel} is scheduled.`}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {s.decision !== "PENDING" && <Badge tone={stepTone(s.decision)}>{DECISION_LABEL[s.decision]}</Badge>}
                    {open && s.committeeCode && needsTabling && (tableHref ? <ButtonLink href={tableHref} size="sm" variant="secondary">Table at a sitting</ButtonLink> : <ButtonLink href="/committees" size="sm" variant="secondary">Schedule a sitting</ButtonLink>)}
                    {inst.status === "PENDING" && s.decision === "PENDING" && !s.committeeCode && s.roleCode && (
                      <EscalateDrawer stepId={s.id} office={s.actingRoleLabel ?? s.roleLabel} mandatory={isMandatoryAct(s.act)} people={suggestions(s.actingRoleCode ?? s.roleCode)} />
                    )}
                    {open && (s.committeeCode ? (
                      <CiteDecisionDrawer id={award.id} stepId={s.id} committee={s.roleLabel} matters={offered} />
                    ) : (
                      <DecideStepDrawer id={award.id} stepId={s.id} roleLabel={s.roleLabel} act={ACT_LABEL[s.act] ?? "Acts"} done={ACT_DONE_LABEL[s.act] ?? "Done"} people={suggestions(s.actingRoleCode ?? s.roleCode)} today={today} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <Card>
        <CardHeader icon={<ClipboardIcon size={17} />} title={<Say words={P.routingSheet} />} />
        <CardBody className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-ink-3">Committee</p>
            {cb?.state === "DECIDED" ? (
              <KeyValues
                items={[
                  { label: "Committee", value: cb.committee },
                  { label: "Sitting", value: `${cb.meetingReference}, ${formatDate(cb.meetingDate)}` },
                  { label: "Outcome", value: cb.outcome === "CARRIED" ? "Carried" : cb.outcome === "DEFERRED" ? "Deferred" : "Not carried" },
                  { label: "Amount", value: lastCommitteeStep?.committeeDecision ? (lastCommitteeStep.committeeDecision.amount == null ? "The decision states no amount" : money(lastCommitteeStep.committeeDecision.amount)) : notSet("Not recorded") },
                  { label: "Decided on", value: cb.decisionDate ? formatDate(cb.decisionDate) : notSet("Not recorded") },
                  { label: "Minutes", value: cb.minuted ? "Minuted" : "Not yet minuted" },
                ]}
              />
            ) : (
              <p className="text-[13.5px] text-ink-3">{cb ? "Not decided yet." : status === "CANCELLED" && !inst ? "No route, so no committee." : "The route has no committee step."}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-ink-3">Approver</p>
            {ab ? (
              <KeyValues
                items={[
                  { label: "Office", value: ab.roleLabel },
                  { label: "Received on", value: ab.receivedOn ? formatDate(ab.receivedOn) : notSet("Not recorded") },
                  { label: "Approved by", value: ab.approverName && approverStep ? acted(approverStep.id, ab.approverName) : notSet("Not decided yet") },
                  { label: "Approved on", value: ab.decidedOn ? formatDate(ab.decidedOn) : notSet("Not decided yet") },
                ]}
              />
            ) : (
              <p className="text-[13.5px] text-ink-3">{inst ? "The route's approval is a committee's." : status === "CANCELLED" ? "No route, so no approver." : "Resolved on sending."}</p>
            )}
          </div>
        </CardBody>
      </Card>

      {status !== "CANCELLED" || award.signatoryName ? (
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title={<Say words={P.whoSigns} />} />
          <CardBody>
            {award.signatoryName ? (
              <KeyValues
                columns={2}
                items={[
                  { label: "Signed by", value: index.read({ entity: "Award", id: award.id, slot: "signatoryPerson" }, award.signatoryName).en },
                  { label: "Office", value: award.signatoryRoleLabel ?? "Not recorded" },
                  { label: "Signed on", value: formatDate(award.signedOn) },
                  { label: "Rule", value: award.signatoryRuleLabel ?? "Not recorded" },
                ]}
              />
            ) : sig?.ok ? (
              <KeyValues
                columns={2}
                items={[
                  { label: "To be signed by", value: `The ${sig.roleLabel}` },
                  { label: "Rule", value: `${sig.ruleLabel}${sig.clause ? ` · ${sig.clause}` : ""}` },
                  { label: "Recommended by", value: sig.recommenders.length ? sig.recommenders.map((r) => r.roleLabel).join(", ") : "No recommendation in the rule" },
                  { label: "Delegation", value: sig.delegable ? "A delegate of the office may sign" : "Only a holder of the office may sign" },
                ]}
              />
            ) : (
              <Callout tone="warn">
                {awardFindingText({ code: sig?.ok === false ? sig.fault : "NO_ISSUE_IN_FORCE", level: "block" })} <Link href="/configuration/approval-matrix">Approval matrix</Link>
              </Callout>
            )}
          </CardBody>
        </Card>
      ) : null}

      {earlier.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title={<Say words={P.earlierRoutes} />} subtitle="Kept on record." />
          <ul className="divide-y divide-line/70">
            {earlier.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] sm:px-6">
                <Badge tone={routeTone(e.status)}>{e.status === "REJECTED" ? "Refused" : e.status === "RECALLED" ? "Withdrawn" : e.status === "APPROVED" ? "Approved" : "In progress"}</Badge>
                <span className="min-w-0 break-words text-ink-2">
                  Sent {formatDate(e.openedAt)} · {e.steps.map((s) => s.roleLabel).join(" → ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
