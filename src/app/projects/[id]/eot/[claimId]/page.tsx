import Link from "next/link";
import { notFound } from "next/navigation";

import { ActGate } from "@/components/act-gate";
import { ApprovalRouteCard } from "@/components/approval-route-card";
import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { DataList, type Row } from "@/components/data-list";
import { ClockIcon, FileIcon, RouteIcon, WalletIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Badge } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { MoreActions } from "@/components/ui/more-actions";
import { MoreText } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { stepActed } from "@/lib/auth/attribution-read";
import { choicesFor, type RejectionKind } from "@/lib/authority/rejection";
import { REJECTION_KIND_LABEL } from "@/lib/authority/rejection-labels";
import { STATUS_WORDS as CERT_WORDS } from "@/lib/certificate/labels";
import type { CertificateStatus } from "@/lib/certificate/types";
import { secretariatHoldersOn } from "@/lib/committee/tabling";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { loadContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, dayOrNull as day } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { tablingFactsOf } from "@/lib/matter/load";
import { citeFaults, tableFaults } from "@/lib/matter/tabling";
import { loadRoster } from "@/lib/people/load";
import { hiddenFor } from "@/lib/supervision/authority";
import { delegationFactsOf, loadSupervision, soOfficeOn } from "@/lib/supervision/load";
import { SUPERVISION_ACTS } from "@/lib/supervision/types";
import { EOT_STATE_TONE, EOT_STATE_WORDS, eotClaimState, eotNext } from "@/lib/time/claim-state";
import { computedExtension } from "@/lib/time/extension";
import { timeFaultText } from "@/lib/time/labels";
import { claimStateFactsOf, timeView } from "@/lib/time/view";
import { requireStaff } from "@/app/_auth/actor";

import { HiddenNote } from "../../hidden-note";
import { AddReasonDrawer, AnswerClaimDrawer, ChooseMatterRefusalDrawer, CiteMatterDrawer, DecideMatterStepDrawer, DetermineDrawer, RaiseEotDrawer, RemoveReasonDrawer, SendClaimDrawer, TableMatterDrawer } from "../../time-editors";

export const metadata = { title: "Extension of time" };
export const dynamic = "force-dynamic";

const IMPACT = { NONE: "No financial impact", AUTHORITY_REQUIREMENT: "Financial impact: an authority's requirement", OTHER: "Financial impact" } as const;

/**
 * One extension-of-time claim (Phase 2 close-out stage A; plan closeout-plan.md §3.1): its facts, reasons, approval route and certificate. The one
 * primary action is `eotNext`'s for the claim's state; adding and removing reasons are under MoreActions. A sibling of the variation page.
 */
export default async function EotClaimPage(props: PageProps<"/projects/[id]/eot/[claimId]">) {
  const actor = await requireStaff();
  const { id, claimId } = await props.params;
  const l = await loadContract(actor.organisationId, id);
  if (!l) notFound();
  const v = await timeView(l);
  const found = v.claims.find((x) => x.c.id === claimId);
  if (!found) notFound();
  const { m, c } = found;
  const state = eotClaimState(claimStateFactsOf(m));
  const next = eotNext(state);
  const today = l.org.timeZone ? dayOf(new Date(), l.org.timeZone) : null;
  const refused = actStatusFault("EOT", l.contract.status as ContractStatus);
  const gate = refused ? actStatusText(refused) : !today ? "Set the organisation's time zone first." : null;
  const s = today ? await loadSupervision(l.contract.id) : null;
  const so = s && today ? await soOfficeOn(l, s, today) : null;
  const hidden = today && s && !actor.system ? hiddenFor(actor.personId, so?.office ?? null, delegationFactsOf(s), today, SUPERVISION_ACTS) : [];
  const people = (await db.person.findMany({ where: { organisationId: l.org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((p) => ({ value: p.id, label: p.name }));
  const title = m.reference ? `Claim ${m.reference}` : "Extension-of-time claim";
  const live = [...c.extensions].reverse().find((x) => x.certificate.status !== "VOID") ?? null;
  const computed = computedExtension(c.reasons);
  // FR-EOT-005: the guidance shown on a weather claim (unset: said so).
  const guidance = c.isWeather ? ((await db.postAwardPolicy.findUnique({ where: { organisationId: l.org.id }, select: { weatherGuidance: true } }))?.weatherGuidance ?? null) : null;

  let action: React.ReactNode = null;
  if (next === "ANSWER") action = hidden.includes("CONTRACTOR_COMMUNICATION") ? null : <AnswerClaimDrawer id={id} claimId={c.id} weather={c.isWeather} people={people} />;
  if (next === "ADD_REASON") action = <AddReasonDrawer id={id} claimId={c.id} />;
  if (next === "DETERMINE") action = hidden.includes("SO_ONLY") ? null : <DetermineDrawer id={id} claimId={c.id} condition={c.excludedByCondition?.kindName ?? null} people={people} />;
  if (next === "SEND") action = hidden.includes("CONTRACTOR_COMMUNICATION") ? null : <SendClaimDrawer id={id} claimId={c.id} people={people} blocker={gate} />;
  if (next === "RAISE_CERTIFICATE") action = hidden.includes("SO_ONLY") ? null : <RaiseEotDrawer id={id} claimId={c.id} computed={computed} partial={c.bestEndeavours === "PARTIAL"} people={people} blocker={gate} />;
  if (next === "OPEN_CERTIFICATE" && live) action = <ButtonLink href={`/projects/${id}/certificates/${live.certificate.id}`} size="sm">Open certificate</ButtonLink>;
  const editable = c.entitlement == null && !m.closedAt;

  const reasonRows: Row[] = c.reasons.map((r) => ({
    id: r.id,
    search: `${r.clause} ${r.reason}`,
    cells: {
      reason: { kind: "stack", title: r.reason, sub: r.clause },
      period: { kind: "text", text: `${formatDate(day(r.delayFrom))} to ${formatDate(day(r.delayUntil))}` },
      days: { kind: "text", text: `${r.extensionDays} days` },
      runs: { kind: "text", text: r.concurrency === "CONCURRENT" ? `With group ${r.group}` : "Consecutive", dim: true },
    },
  }));

  // The matter's route: each person's step decided here, a committee's step tabled from the matter and cited.
  const roles = await db.authorityRole.findMany({ where: { organisationId: l.org.id }, select: { code: true, nameEn: true } });
  const acted = await stepActed(db, l.org.id, m.routes.flatMap((r) => r.steps));
  const roster = today ? await loadRoster(l.org.code) : null;
  const tabling = tablingFactsOf(m);
  const routeCards = await Promise.all(
    [...m.routes].reverse().map(async (inst, n) => {
      const pendingCommittee = inst.status === "PENDING" ? inst.steps.find((st) => st.decision === "PENDING" && st.committeeCode) : null;
      const committee = pendingCommittee ? await db.committee.findFirst({ where: { organisationId: l.org.id, code: pendingCommittee.committeeCode! }, select: { id: true, secretariatRoleCode: true } }) : null;
      const sittings = committee ? (await db.meeting.findMany({ where: { committeeId: committee.id, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, orderBy: { meetingDate: "asc" }, select: { id: true, reference: true, meetingDate: true } })).map((x) => ({ value: x.id, label: `${x.reference}, ${formatDate(day(x.meetingDate))}` })) : [];
      const tablers = committee && roster && today ? secretariatHoldersOn(roster, committee.secretariatRoleCode, today).map((p) => ({ value: p.id, label: p.name })) : [];
      const stepAction = (routeId: string, sequence: number) => {
        const st = inst.steps.find((x) => x.sequence === sequence);
        if (!st || inst.status !== "PENDING" || st.decision !== "PENDING" || gate || routeId !== inst.id) return null;
        if (!inst.steps.filter((x) => x.sequence < st.sequence).every((x) => x.decision === "DONE")) return <Blocked label="Record decision" reason="Decide the earlier step first." />;
        if (st.committeeCode) {
          const tf = tableFaults(tabling, inst.domain, st.committeeCode);
          const cf = citeFaults(tabling, inst.domain, st.committeeCode);
          const decided = m.decisions.filter((d) => !d.withdrawnAt && d.domain === inst.domain && d.meeting.committee.code === st.committeeCode).map((d) => ({ value: d.id, label: `${d.meeting.reference}: ${d.outcome === "CARRIED" ? "carried" : d.outcome === "PENDING" ? "not decided yet" : d.outcome === "DEFERRED" ? "deferred" : "not carried"}` }));
          return tf.length === 0 ? <TableMatterDrawer id={id} matterId={m.id} sittings={sittings} tablers={tablers} /> : cf.length === 0 ? <CiteMatterDrawer id={id} matterId={m.id} stepId={st.id} committee={st.actingRoleLabel ?? st.roleLabel} matters={decided} /> : <Blocked label="Cite the decision" reason={cf.map(timeFaultText).join(" ")} />;
        }
        return <DecideMatterStepDrawer id={id} matterId={m.id} stepId={st.id} roleLabel={st.actingRoleLabel ?? st.roleLabel} people={people} today={today} />;
      };
      const choosing = inst.status === "REJECTED" && !inst.rejectionApplied && n === 0 && !m.closedAt;
      const extra = choosing ? (
        <CardBody className="border-b border-line/70">
          <ChooseMatterRefusalDrawer id={id} matterId={m.id} offered={(inst.rejectionChoices.length > 0 ? (inst.rejectionChoices as RejectionKind[]) : choicesFor(["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"], inst.steps, inst.steps.find((x) => x.decision === "REJECTED")?.sequence ?? 1)).map((k) => ({ value: k, label: REJECTION_KIND_LABEL[k] }))} steps={inst.steps.map((x) => ({ value: String(x.sequence), label: `${x.sequence}. ${x.actingRoleLabel ?? x.roleLabel}` }))} people={people} />
        </CardBody>
      ) : undefined;
      return <ApprovalRouteCard key={inst.id} route={inst} acted={acted} title={n === 0 ? "Approval" : "Approval (earlier)"} stepAction={stepAction} officeName={(code) => roles.find((x) => x.code === code)?.nameEn ?? null} extra={extra} />;
    }),
  );

  return (
    <>
      <RecordCrumb label={title} parent={l.contract.number} />
      <PageHeader
        title={title}
        badge={<Badge tone={EOT_STATE_TONE[state] ?? undefined} dot>{EOT_STATE_WORDS[state]}</Badge>}
        subtitle={c.cause}
        meta={["The whole works", `${c.proposedDays} days claimed`, live ? `${live.grantedDays} days granted` : "None granted", IMPACT[c.financialImpact as keyof typeof IMPACT]]}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <ActGate blocker={gate}>
              {action}
              {editable && next !== "ADD_REASON" && (
                <MoreActions label="More for this claim">
                  <AddReasonDrawer id={id} claimId={c.id} menu />
                  {c.reasons.length > 0 && <RemoveReasonDrawer id={id} reasons={c.reasons.map((r) => ({ value: r.id, label: `${r.clause}: ${r.extensionDays} days` }))} />}
                </MoreActions>
              )}
            </ActGate>
          </span>
        }
      />
      <div className="mb-6 flex flex-col gap-3">
        <HiddenNote hidden={hidden} />
        {refused && <Callout tone="warn" title="Not recorded in this state">{actStatusText(refused)}</Callout>}
        {state === "NOT_ENTITLED" && <Callout tone="warn" title="Not entitled">The claim is closed. The damages decision may now be recorded under Payments.</Callout>}
        {m.closedAt && state !== "NOT_ENTITLED" && <Callout tone="warn" title="Closed">{m.closeReason}</Callout>}
      </div>
      <ActGate blocker={gate}>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Claim" divided />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Ground", value: c.groundClause },
                { label: "Programme", value: `Revision ${c.programme.revision}` },
                { label: "Delay notices", value: c.notices.map((n) => formatDate(day(n.notice.receivedOn))).join(", ") || "None" },
                { label: "Weather claim", value: c.isWeather ? <span className="inline-flex items-center gap-1">Yes<MoreText text={guidance ?? "No guidance is set (Settings, Post-award controls)."} label="Weather guidance" /></span> : "No" },
                { label: "Actual delay", value: c.actualDelayDays == null ? "Not answered" : `${c.actualDelayDays} days` },
                { label: "Determined", value: c.determinedOn ? `${formatDate(day(c.determinedOn))}${c.determinedBy ? `, ${c.determinedBy.name}` : ""}` : "Not yet" },
                ...(c.entitlementReason ? [{ label: "Why", value: c.entitlementReason }] : []),
              ]}
            />
          </CardBody>
        </Card>

        <OwnerAttachments owner={{ kind: "eotClaim", id: c.id }} title="Evidence" only={c.isWeather ? ["METEOROLOGICAL_RECORD", "EOT_CALCULATION"] : ["EOT_CALCULATION"]} required={c.isWeather ? { METEOROLOGICAL_RECORD: true, EOT_CALCULATION: false } : { EOT_CALCULATION: false }} collapseWhenEmpty={c.entitlement != null} />

        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Reasons" subtitle={c.reasons.length ? `${computed} days computed (assumed)` : undefined} divided={false} />
          <DataList flat selectable={false} toolbar={false} searchable={false} exportName="reasons" emptyTitle="No reasons yet" columns={[{ key: "reason", label: "Reason", mobile: "primary" }, { key: "period", label: "Delay", width: "240px", mobile: "meta" }, { key: "days", label: "Extension", width: "120px", numeric: true, mobile: "meta" }, { key: "runs", label: "Runs", width: "150px", mobile: "meta" }]} rows={reasonRows} />
        </Card>

        {routeCards.length ? routeCards : (
          <Card>
            <CardHeader icon={<RouteIcon size={17} />} title="Approval" divided />
            <EmptyState title="Not sent for approval" />
          </Card>
        )}

        <Card>
          <CardHeader icon={<WalletIcon size={17} />} title="Certificate" divided />
          {live ? (
            <CardBody>
              <KeyValues
                columns={2}
                items={[
                  { label: "Certificate", value: <Link className="font-medium text-brand-700 hover:underline" href={`/projects/${id}/certificates/${live.certificate.id}`}>{live.certificate.number ?? "Not yet numbered"}</Link> },
                  { label: "Stage", value: CERT_WORDS[live.certificate.status as CertificateStatus].en },
                  { label: "Days granted", value: `${live.grantedDays}` },
                  { label: "New date for completion", value: formatDate(day(live.newCompletion)) },
                ]}
              />
            </CardBody>
          ) : (
            <EmptyState title="No certificate yet" />
          )}
        </Card>
      </div>
      </ActGate>
    </>
  );
}
