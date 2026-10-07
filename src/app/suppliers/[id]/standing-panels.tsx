import Link from "next/link";

import { EscalateDrawer } from "@/app/approvals/editors";
import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { RouteSteps } from "@/app/sourcing/[id]/route-steps";
import { ClipboardIcon, LinkIcon, ScaleIcon, ShieldIcon } from "@/components/icons";
import { isMandatoryAct } from "@/components/ui/act";
import { Badge, Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { KeyValues } from "@/components/ui/stat";
import { CellStack, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { AWARD_STATUS_LABEL } from "@/lib/award/labels";
import { routeCoreText } from "@/lib/authority/core-routing-labels";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { ACT_DONE_LABEL } from "@/lib/labels";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { cancellationsOnFile, cancellationStoodUntil, judgedWhileCancelled, notRevisitedWords, openingJudgedOf, recordCancellationFaults } from "@/lib/suppliers/cancellation";
import { nextOffenceNo, recordFaults, requestBlacklistFaults, requestLiftFaults, routeState, withdrawRequestFaults, type RequestFacts } from "@/lib/suppliers/blacklist";
import { documentStates } from "@/lib/suppliers/documents";
import { isEligibilitySnapshot } from "@/lib/suppliers/eligibility";
import { asHeading, blacklistEndWords, cancellationEndedWords, CHECK_STATE_LABEL, eventReasonWords, CONDITION_LABEL, DOCUMENT_STATE_LABEL, conditionWords, RELAXES_LABEL, REQUEST_KIND_LABEL, RESULT_LABEL, RESULT_TONE, STANDING_EVENT_LABEL, standingTone, standingWords, supplierFaultText, VERDICT_LABEL, VERDICT_TONE } from "@/lib/suppliers/labels";
import { sameNumber } from "@/lib/suppliers/link";
import { eligibilityFindingOf } from "@/lib/suppliers/opening-hook";
import { grantFaults, specialPermissionFaults } from "@/lib/suppliers/permission";
import { reinstatementChecklist, suspendFaults } from "@/lib/suppliers/reinstate";
import { documentFacts, type LoadedSupplier, type SupplierConfig } from "@/lib/suppliers/repo";
import { supplierHolders } from "@/lib/suppliers/route";
import { cancellationEnded, type StandingReading } from "@/lib/suppliers/standing";
import { eligibilityOf, standingEventFacts } from "@/lib/suppliers/standing-repo";
import { blocking, type Finding } from "@/lib/suppliers/types";
import { routeTone, stepTone } from "@/lib/ui/status-tone";

import { DecideRouteStepDrawer, GrantPermissionDrawer, LinkAwardDrawer, LinkPartyDrawer, PermissionDrawer, RecordCancellationDrawer, ReinstateDrawer, RecordStandingDrawer, RequestBlacklistDrawer, RequestLiftDrawer, SuspendDrawer, WithdrawCancellationDrawer, WithdrawRequestDrawer } from "./standing-editors";

type Option = { value: string; label: string };
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const first = (fs: readonly Finding[]) => (blocking(fs).length ? supplierFaultText(blocking(fs)[0]) : null);

/// Who may decide a supplier route's step today, those holding the office first.
async function suggestionsFor(organisationCode: string, people: Option[], today: string | null) {
  if (!today) return () => people;
  const [roster, delegations] = await Promise.all([loadRoster(organisationCode), loadDelegations(organisationCode)]);
  return (code: string | null) => {
    if (!code) return people;
    const h = supplierHolders(code, roster, delegations, today);
    const top = [...h.holderIds, ...h.delegates.map((d) => d.personId)];
    return [...people.filter((p) => top.includes(p.value)).map((p) => ({ ...p, label: `${p.label} — ${h.holderIds.includes(p.value) ? "holds the office" : "delegate"}` })), ...people.filter((p) => !top.includes(p.value))];
  };
}

type RouteRow = LoadedSupplier["supplier"]["standingRequests"][number]["routes"][number];

function RouteBlock({ r, suggestions, today, matter, refused, kind }: { r: RouteRow; suggestions: (code: string | null) => Option[]; today: string | null; matter: string; refused: string; kind: "standing" | "permission" }) {
  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-3 sm:px-6">
        <span className="text-[13px] font-semibold text-ink-2">Route · sent {formatDate(day(r.openedAt))} · {r.ruleLabel ?? "a rule no longer recorded"}{r.ruleClause ? ` · ${r.ruleClause}` : ""}</span>
        <Badge tone={r.status === "REJECTED" ? "warn" : routeTone(r.status)}>{r.status === "PENDING" ? "With approval" : r.status === "APPROVED" ? "Approved" : r.status === "REJECTED" ? "Refused" : "Closed"}</Badge>
      </div>
      <p className="px-5 pb-2 text-[12.5px] text-ink-3 sm:px-6">Routed on no value, so only a rule with no value band applies. Chain beneath the approver: {routeCoreText(r, () => ({ en: "an office no longer configured", ms: "jawatan yang tidak lagi dikonfigurasi" })).en}</p>
      {r.status === "REJECTED" && <p className="px-5 pb-2 text-[12.5px] text-ink-2 sm:px-6">Refused: {r.rejectionReason || "no reason recorded"}.</p>}
      <RouteSteps
        inst={r}
        stepLabel={(x) => DECISION_LABEL[x]}
        stepTone={stepTone}
        action={(step, { earlierDone }) => (
          <>
            {r.status === "PENDING" && step.decision === "PENDING" && step.roleCode && <EscalateDrawer stepId={step.id} office={step.actingRoleLabel ?? step.roleLabel} mandatory={isMandatoryAct(step.act)} people={suggestions(step.actingRoleCode ?? step.roleCode)} />}
            {r.status === "PENDING" && step.decision === "PENDING" && earlierDone && <DecideRouteStepDrawer stepId={step.id} office={step.roleLabel} done={ACT_DONE_LABEL[step.act] ?? "Done"} people={suggestions(step.actingRoleCode ?? step.roleCode)} today={today} matter={matter} refused={refused} kind={kind} />}
          </>
        )}
      />
    </div>
  );
}

const approvedOn = (r: { status: string; steps: { decidedOn: Date | null }[] } | undefined) => (r && r.status === "APPROVED" ? (r.steps.map((s) => s.decidedOn).filter((x): x is Date => !!x).map((x) => storedDay(x)).sort().at(-1) ?? null) : null);

// ------------------------------------------------------------------ standing

export async function StandingPanel({ l, cfg, reading, people, fromAward }: { l: LoadedSupplier; cfg: SupplierConfig; reading: StandingReading | null; people: Option[]; fromAward: string | null }) {
  const s = l.supplier;
  const today = l.org.today;
  const suggestions = await suggestionsFor(l.org.code, people, today);
  const reasonsFor = (use: "SUSPEND" | "BLACKLIST") => cfg.reasons.filter((x) => x.appliesTo === use && cfg.live(x, today)).map((x) => ({ value: x.id, label: x.nameEn }));
  const requestFacts = (r: (typeof s.standingRequests)[number]): RequestFacts => ({ kind: r.kind, route: routeState(r.routes.map((x) => ({ status: x.status, openedAt: x.createdAt.toISOString() }))), approvedOn: approvedOn(r.routes[0]), recorded: !!r.event, withdrawn: r.withdrawnAt != null });
  const requests = s.standingRequests.map(requestFacts);
  const docs = s.documents.map(documentFacts);
  const states = today ? documentStates(cfg.typeFacts, docs, today) : [];
  const policyMonths = cfg.policy?.blacklistFirstOffenceMonths ?? null;

  if (!reading) return <Card><EmptyState title="Not judged: the organisation's time zone is not set">Standing is read on the organisation&apos;s day.</EmptyState></Card>;

  const suspendBlocker = reasonsFor("SUSPEND").length === 0 ? "No suspension reason is configured (Configuration › Supplier register)." : first(suspendFaults({ reasonId: "x", effectiveOn: today, personActive: true, flaggedDocumentIds: [] }, { today, status: s.status, registeredOn: day(s.registeredOn), reading, reason: { appliesTo: "SUSPEND", retiredOn: null }, documentIds: [] }));
  const blacklistBlocker = reasonsFor("BLACKLIST").length === 0 ? "No blacklisting reason is configured (Configuration › Supplier register)." : first(requestBlacklistFaults({ reasonId: "x", personActive: true, sourceAward: null }, { today, supplierId: s.id, status: s.status, standing: reading.standing, reason: { appliesTo: "BLACKLIST", retiredOn: null }, requests }));
  const liftBlocker = first(requestLiftFaults({ note: "x", personActive: true }, { today, standing: reading.standing, requests }));
  const checklist = reading.suspension ? reinstatementChecklist(reading.suspension, (id) => {
    const d = docs.find((x) => x.id === id);
    const st = d ? states.find((x) => x.type.id === d.typeId) : null;
    return d && st ? { typeLabel: st.type.label, state: st.state } : null;
  }) : [];
  const docLabel = (id: string) => {
    const d = s.documents.find((x) => x.id === id);
    return d ? `${d.typeLabelSnapshot}${d.reference ? ` ${d.reference}` : ""}` : "A document no longer on file";
  };
  const awards = s.awards.filter((a) => a.status === "CANCELLED" && a.cancelConsequence === "CANCEL_AND_BLACKLIST").map((a) => ({ value: a.id, label: `${a.reference} · ${a.awardeeName}` }));
  const since = reading.blacklist ?? reading.cancellation ?? reading.suspension;
  // S-4: every bid opened for a party linked to this supplier, with its frozen register finding, for the withdrawal's words.
  const openings = s.parties.flatMap((p) => p.openedBids.flatMap((b) => openingJudgedOf(p.exercise.reference, b) ?? []));
  // 615-C2: the registration bodies a cancellation may be recorded from (a retired one still names an old registration).
  const bodies = (await db.registrationBody.findMany({ where: { organisationId: l.org.id }, orderBy: { labelEn: "asc" }, select: { id: true, labelEn: true, retiredOn: true } })).map((b) => ({ value: b.id, label: `${asHeading(b.labelEn)}${b.retiredOn ? " (retired)" : ""}` }));
  const cancelBlocker = bodies.length === 0 ? "No registration body is configured (Configuration › Supplier register)." : first(recordCancellationFaults({ bodyId: "x", reference: "x", effectiveOn: today, personActive: true }, { today, status: s.status, registeredOn: day(s.registeredOn), reading, bodyConfigured: true }));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<ShieldIcon size={17} />}
          title="Standing"
          subtitle="Derived from what is recorded and from the documents on the organisation's day; never stored. A notice to the supplier is shown here, not sent."
          actions={
            <span className="flex flex-wrap items-center gap-2">
              {reading.suspension ? <ReinstateDrawer supplierId={s.id} checklist={checklist.map((c) => ({ value: c.documentId, label: `${docLabel(c.documentId)}: ${c.typeLabel} now ${DOCUMENT_STATE_LABEL[c.state].en.toLowerCase()}` }))} people={people} today={today} blocker={reading.standing === "BLACKLISTED" ? supplierFaultText({ code: "BLACKLISTED", level: "block" }) : null} /> : <SuspendDrawer supplierId={s.id} reasons={reasonsFor("SUSPEND")} documents={s.documents.filter((d) => !d.renewedBy).map((d) => ({ value: d.id, label: docLabel(d.id) }))} people={people} today={today} blocker={suspendBlocker} />}
              {reading.standing === "BLACKLISTED" ? <RequestLiftDrawer supplierId={s.id} people={people} blocker={liftBlocker} /> : <RequestBlacklistDrawer supplierId={s.id} reasons={reasonsFor("BLACKLIST")} awards={awards} fromAward={fromAward && awards.some((a) => a.value === fromAward) ? fromAward : null} people={people} blocker={blacklistBlocker} />}
              <RecordCancellationDrawer supplierId={s.id} bodies={bodies} people={people} today={today} blocker={cancelBlocker} />
            </span>
          }
        />
        <CardBody className="flex flex-col gap-4">
          <KeyValues
            columns={2}
            items={[
              { label: "Standing", value: <Badge tone={standingTone(reading)} dot>{standingWords(reading).en}</Badge> },
              { label: "Since", value: since ? `${formatDate(since.effectiveOn)}${eventReasonWords(since).en ? ` · ${eventReasonWords(since).en}` : ""}` : reading.standing === "SUSPENDED_ON_LAPSE" ? `Derived: ${reading.lapsed.join(", ")} expired${cfg.policy?.lapseReasonId ? ` · ${cfg.reasons.find((x) => x.id === cfg.policy?.lapseReasonId)?.nameEn ?? ""}` : ""}` : "—" },
              ...(reading.blacklist ? [{ label: reading.blacklist.endsOn ? "Period (first offence)" : "Period", value: blacklistEndWords(reading.blacklist.endsOn).en }] : []),
              ...(reading.suspension && reading.standing !== "SUSPENDED" ? [{ label: "Also suspended", value: `Since ${formatDate(reading.suspension.effectiveOn)} · ${reading.suspension.reasonLabel}` }] : []),
              ...(reading.lapsed.length ? [{ label: "Mandatory documents expired", value: reading.lapsed.join(", ") }] : []),
            ]}
          />
          {reading.notes.map((n, i) => <Callout key={i} tone={n.level === "warn" ? "warn" : "info"}>{supplierFaultText(n)}</Callout>)}
        </CardBody>
      </Card>

      {s.standingRequests.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClipboardIcon size={17} />} title="Asked for" subtitle="Each blacklisting, or its lifting, is decided on its route and recorded once the route approves it, with the day it takes effect." divided={false} />
          {s.standingRequests.map((r, i) => {
            const f = requests[i];
            // fix R-7: a request approved but not recordable (or never sent) may be withdrawn, with why.
            const withdrawable = withdrawRequestFaults({ reason: "x", personActive: true }, { today, request: f }).length === 0;
            const rec = f.route === "APPROVED" && !f.recorded && !f.withdrawn ? recordFaults({ effectiveOn: today, personActive: true }, { today, request: f, standing: reading.standing, offenceNo: nextOffenceNo(s.standingEvents.map(standingEventFacts)), months: policyMonths }) : null;
            const recBlocker = rec ? first(rec.faults.filter((x) => !["EFFECTIVE_REQUIRED", "EFFECTIVE_IN_FUTURE", "EFFECTIVE_BEFORE_DECISION", "PERSON_REQUIRED"].includes(x.code))) : null;
            return (
              <section key={r.id} className="border-t border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[14px] font-semibold text-ink">{REQUEST_KIND_LABEL[r.kind].en}{r.reasonSnapshot ? ` · ${r.reasonSnapshot}` : ""}</span>
                    <span className="text-[12.5px] text-ink-3">Asked by {r.requestedBy.name}, on their behalf, {formatOrgDay(r.requestedAt, l.org.timeZone)}{r.sourceAward ? <> · from the cancelled award <Link href={`/awards/${r.sourceAward.id}`}>{r.sourceAward.reference}</Link></> : null}{r.note ? ` · “${r.note}”` : ""}</span>
                    {r.withdrawnAt && <span className="text-[12.5px] break-words text-ink-3">Withdrawn by {r.withdrawnBy?.name ?? "a person no longer on record"}, on their behalf, {formatOrgDay(r.withdrawnAt, l.org.timeZone)}: “{r.withdrawnReason}”</span>}
                  </div>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={f.recorded ? "ok" : f.withdrawn ? "neutral" : f.route === "APPROVED" ? "info" : f.route === "REJECTED" ? "neutral" : "warn"}>{f.recorded ? "Recorded" : f.withdrawn ? "Withdrawn: nothing recorded" : f.route === "APPROVED" ? "Approved: to record" : f.route === "REJECTED" ? "Refused: nothing recorded" : "With approval"}</Badge>
                    {rec && <RecordStandingDrawer requestId={r.id} kind={r.kind} people={people} today={today} approvedOn={f.approvedOn} blocker={recBlocker} />}
                    {withdrawable && <WithdrawRequestDrawer requestId={r.id} what={REQUEST_KIND_LABEL[r.kind].en.toLowerCase()} people={people} />}
                  </span>
                </div>
                {r.routes.map((route) => <RouteBlock key={route.id} r={route} suggestions={suggestions} today={today} matter={`the ${r.kind === "BLACKLIST" ? "blacklisting" : "lifting of the blacklisting"} of ${s.registeredName}`} refused="Refused: nothing is recorded" kind="standing" />)}
              </section>
            );
          })}
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="Recorded" subtitle="Every suspension, reinstatement, blacklisting, lifting and registration cancelled, newest first. Nothing here is edited or removed: a cancellation recorded in error is withdrawn, with why, and stays listed." divided={s.standingEvents.length === 0} />
        {s.standingEvents.length === 0 ? (
          <EmptyState size="sm" title="Nothing recorded">The supplier has not been suspended or blacklisted, and no cancellation of its registration is recorded.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {s.standingEvents.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-5 py-3 text-[13px] sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={e.withdrawnAt ? "neutral" : e.kind === "REINSTATE" || e.kind === "BLACKLIST_LIFT" ? "ok" : "err"}>{STANDING_EVENT_LABEL[e.kind].en}</Badge>
                  {e.withdrawnAt && <Chip tone="neutral">Withdrawn: recorded in error</Chip>}
                  {/* M-1: a cancellation that stood, ended by the supplier registering again (standing's own rule). */}
                  {e.kind === "REGISTRATION_CANCELLED" && !e.withdrawnAt && cancellationEnded(day(s.registeredOn), storedDay(e.effectiveOn)) && <Chip tone="neutral">{cancellationEndedWords(storedDay(e.effectiveOn), day(s.registeredOn)).en}</Chip>}
                  <span className="text-ink-2">from {formatDate(storedDay(e.effectiveOn))}{e.kind === "BLACKLIST" ? (e.endsOn ? ` (${e.offenceNo === 1 ? "first offence" : `offence ${e.offenceNo}`}, ${e.periodMonths} months) · ${blacklistEndWords(storedDay(e.endsOn)).en}` : ` until further notice (offence ${e.offenceNo})`) : ""} · {e.recordedBy.name}, recorded on their behalf, not signed</span>
                </div>
                {/* BD-613-105(e) / S-3: a cancellation's line is composed from its body and reference at read, never stored. */}
                {eventReasonWords(standingEventFacts(e)).en && <p className="text-ink-2">{eventReasonWords(standingEventFacts(e)).en}</p>}
                {e.flaggedDocumentIds.length > 0 && <p className="text-[12.5px] text-ink-3">For: {e.flaggedDocumentIds.map(docLabel).join(", ")}</p>}
                {e.note && <p className="text-[12.5px] break-words text-ink-3">“{e.note}”</p>}
                {e.kind === "REGISTRATION_CANCELLED" && (
                  <>
                    {e.withdrawnAt ? (
                      <p className="text-[12.5px] break-words text-ink-3">Withdrawn by {e.withdrawnBy?.name ?? "a person no longer on record"}, on their behalf, {formatOrgDay(e.withdrawnAt, l.org.timeZone)}: “{e.withdrawnReason}”. The supplier&apos;s standing does not read it.</p>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2"><WithdrawCancellationDrawer eventId={e.id} people={people} notRevisited={notRevisitedWords(judgedWhileCancelled(openings, storedDay(e.effectiveOn), cancellationStoodUntil({ id: e.id, effectiveOn: storedDay(e.effectiveOn) }, cancellationsOnFile(s.standingEvents), day(s.registeredOn)))).en} /></span>
                    )}
                    <OwnerAttachments owner={{ kind: "standingEvent", id: e.id }} title="The body's notice" subtitle="The registration body's notice of the cancellation, as received." only={["REGISTRATION_CANCELLATION_NOTICE"]} required={{ REGISTRATION_CANCELLATION_NOTICE: !e.withdrawnAt }} />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ eligibility (FR-VND-011, staff view)

export async function EligibilityPanel({ l, exerciseId }: { l: LoadedSupplier; exerciseId: string | null }) {
  const s = l.supplier;
  const today = l.org.today;
  const linkedIds = new Set(s.parties.map((p) => p.exerciseId));
  const exercises = await db.sourcingExercise.findMany({
    where: { organisationId: l.org.id, OR: [{ id: { in: [...linkedIds] } }, { window: { advertisementDay: { not: null } } }] },
    orderBy: [{ reference: "desc" }],
    take: 200,
    select: { id: true, reference: true, title: true },
  });
  const chosen = exerciseId ? exercises.find((x) => x.id === exerciseId) ?? null : null;
  const e = chosen && today ? await eligibilityOf(s.id, chosen.id, { id: l.org.id, timeZone: l.org.timeZone, today }) : null;
  const reqLabel = new Map<string, string>();
  if (chosen) for (const r of await db.exerciseRegistrationRequirement.findMany({ where: { exerciseId: chosen.id }, select: { id: true, bodyLabelSnapshot: true, qualifiers: true, alternativeGroup: true } })) reqLabel.set(r.id, `${asHeading(r.bodyLabelSnapshot)}${r.qualifiers.trim() ? ` (${r.qualifiers.trim()})` : ""} · group ${r.alternativeGroup}`);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<ScaleIcon size={17} />} title="Eligibility for an exercise" subtitle="Judged now, condition by condition, over the exercise's window: from its advertisement to its closing. Not assessed is never eligible." />
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value="eligibility" />
            <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              Exercise
              <Select name="exercise" defaultValue={chosen?.id ?? ""}>
                <option value="">Choose an exercise</option>
                {exercises.map((x) => (
                  <option key={x.id} value={x.id}>{`${x.reference} · ${x.title}${linkedIds.has(x.id) ? " (linked)" : ""}`}</option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="secondary" size="md">Judge</Button>
          </form>
        </CardBody>
      </Card>
      {!today && <Callout tone="warn" title="Not judged">The organisation&apos;s time zone is not set.</Callout>}
      {chosen && e && (
        <Card className="overflow-hidden">
          <CardHeader
            icon={<ScaleIcon size={17} />}
            title={<span className="inline-flex flex-wrap items-center gap-2">{chosen.reference}<Badge tone={VERDICT_TONE[e.eligibility.verdict]} dot>{VERDICT_LABEL[e.eligibility.verdict].en}</Badge></span>}
            subtitle={`${chosen.title}. Judged ${formatDate(e.snapshot.judgedOn)}; a sale or an opening freezes its own reading.`}
            actions={<Link href={`/sourcing/${chosen.id}`} className="text-[13px]">Open the exercise</Link>}
          />
          <Table minWidth={720}>
            <colgroup>
              <col style={{ width: 240 }} />
              <col style={{ width: 200 }} />
              <col />
            </colgroup>
            <THead>
              <Th>Condition</Th>
              <Th>Result</Th>
              <Th>Why</Th>
            </THead>
            <tbody>
              {e.eligibility.rows.map((r, i) => (
                <Tr key={i}>
                  <Td label="Condition"><CellStack title={CONDITION_LABEL[r.kind].en} sub={r.requirementId ? reqLabel.get(r.requirementId) : undefined} /></Td>
                  <Td label="Result"><Badge tone={RESULT_TONE[r.result]}>{RESULT_LABEL[r.result].en}</Badge></Td>
                  <Td label="Why"><span className="break-words">{conditionWords(r).en}</span></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ participation (OD-9, FR-ADV-017)

export async function ParticipationPanel({ l, people }: { l: LoadedSupplier; people: Option[] }) {
  const s = l.supplier;
  const today = l.org.today;
  const suggestions = await suggestionsFor(l.org.code, people, today);
  const [unlinked, partyless, bodies] = await Promise.all([
    db.exerciseParty.findMany({ where: { organisationId: l.org.id, vendorId: null }, orderBy: [{ exercise: { reference: "desc" } }, { name: "asc" }], take: 300, select: { id: true, name: true, registrationNo: true, exercise: { select: { reference: true } } } }),
    db.award.findMany({ where: { organisationId: l.org.id, vendorId: null, awardeePartyId: null }, orderBy: { reference: "desc" }, select: { id: true, reference: true, awardeeName: true } }),
    db.registrationBody.findMany({ where: { organisationId: l.org.id, retiredOn: null }, orderBy: { labelEn: "asc" }, select: { id: true, labelEn: true } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<LinkIcon size={17} />}
          title="On exercises"
          subtitle="Parties on exercises linked to this supplier by an explicit act, never by a matching number; what the register read at each sale and each opening, frozen there; and any special permission."
          actions={<span className="flex flex-wrap items-center gap-2"><LinkPartyDrawer supplierId={s.id} parties={unlinked.map((p) => ({ value: p.id, label: `${p.exercise.reference} · ${p.name} (${p.registrationNo || "no number"})` }))} /><LinkAwardDrawer supplierId={s.id} awards={partyless.map((a) => ({ value: a.id, label: `${a.reference} · ${a.awardeeName}` }))} /></span>}
          divided={s.parties.length === 0}
        />
        {s.parties.length === 0 ? (
          <EmptyState size="sm" title="Not linked to any exercise">Link a party from an exercise&apos;s registers to read the register at its sales and openings.</EmptyState>
        ) : (
          <div className="divide-y divide-line/70">
            {s.parties.map((p) => {
              const offered = p.exercise.window?.specialPermissionOffered ?? null;
              const permBlocker = first(specialPermissionFaults({ requirementId: p.exercise.registrationRequirements[0]?.id ?? null, relaxes: "GRADE", grantingBodyIds: [], internalApproval: true, existingClassConfirmed: true, goodRecordConfirmed: true, personActive: true }, { today, offered, requirementIds: p.exercise.registrationRequirements.map((r) => r.id), bodyIds: [], existing: [] }).filter((f) => ["TIME_ZONE_UNSET", "NOT_OFFERED", "OFFER_NOT_SET", "REQUIREMENT_REQUIRED"].includes(f.code))) ?? (p.exercise.registrationRequirements.length === 0 ? "The exercise states no registration requirement." : null);
              return (
                <section key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link href={`/sourcing/${p.exercise.id}`} className="text-[14px] font-semibold">{`${p.exercise.reference} · ${p.exercise.title}`}</Link>
                      <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                        As recorded there: {p.name} ({p.registrationNo || "no number"})
                        {!sameNumber(p.registrationNo, s.registrationNo) && <Chip tone="warn">Differs from the register&apos;s number</Chip>}
                      </span>
                    </div>
                    <PermissionDrawer partyId={p.id} partyLabel={p.name} requirements={p.exercise.registrationRequirements.map((r) => ({ value: r.id, label: `${asHeading(r.bodyLabelSnapshot)}${r.qualifiers.trim() ? ` (${r.qualifiers.trim()})` : ""}` }))} bodies={bodies.map((b) => ({ value: b.id, label: asHeading(b.labelEn) }))} people={people} today={today} blocker={permBlocker} />
                  </div>
                  <KeyValues
                    columns={2}
                    items={[
                      { label: "Sales", value: p.sales.length ? <span className="flex flex-col gap-1">{p.sales.map((x) => { const snap = isEligibilitySnapshot(x.eligibilitySnapshot) ? x.eligibilitySnapshot : null; return <span key={x.id}>{formatDate(storedDay(x.soldOn))}{x.voidedAt ? " (void)" : ""}: {snap ? <>register read {formatDate(snap.judgedOn)}, <Badge tone={VERDICT_TONE[snap.verdict]}>{VERDICT_LABEL[snap.verdict].en}</Badge></> : `registration ${CHECK_STATE_LABEL[x.registrationCheck as keyof typeof CHECK_STATE_LABEL]?.en.toLowerCase() ?? "not checked"}: sold before the register checked it`}</span>; })}</span> : "None" },
                      { label: "Opened bids", value: p.openedBids.length ? <span className="flex flex-col gap-1">{p.openedBids.map((b) => { const f = eligibilityFindingOf(b.eligibilityFinding); return <span key={b.id}>No. {b.listingNo}: {f ? <Badge tone={VERDICT_TONE[f.verdict]}>{VERDICT_LABEL[f.verdict].en} when opened</Badge> : "opened before the link: no register finding"}</span>; })}</span> : "None" },
                      { label: "Special permission offered", value: offered == null ? <span className="text-ink-4">Not stated on the notice</span> : offered ? "Offered" : "Not offered" },
                    ]}
                  />
                  {p.specialPermissions.map((sp) => {
                    const newest = sp.routes[0];
                    const route = routeState(sp.routes.map((x) => ({ status: x.status, openedAt: x.createdAt.toISOString() })));
                    const gBlocker = sp.grantedOn ? null : first(grantFaults({ grantedOn: today, personActive: true }, { today, offered, granted: false, internalApproval: sp.internalApproval, route, approvedOn: approvedOn(newest) }).filter((f) => !f.code.startsWith("GRANTED") && f.code !== "PERSON_REQUIRED"));
                    return (
                      <div key={sp.id} className="rounded-xl border border-line/80">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[13.5px] font-semibold text-ink">Special permission · {RELAXES_LABEL[sp.relaxes].en.toLowerCase()} of {sp.requirementLabelSnapshot}</span>
                            <span className="text-[12.5px] text-ink-3">Granted by {[...sp.grantingBodyLabels, ...(sp.internalApproval ? ["the organisation, on its route"] : [])].join(" and ")} · both confirmations recorded · asked by {sp.requestedBy.name}, on their behalf</span>
                          </div>
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge tone={sp.grantedOn ? "ok" : "warn"}>{sp.grantedOn ? `Granted ${formatDate(storedDay(sp.grantedOn))}` : route === "REJECTED" ? "Refused on its route" : "Not granted yet"}</Badge>
                            {!sp.grantedOn && sp.internalApproval && route === "APPROVED" && <GrantPermissionDrawer permissionId={sp.id} people={people} today={today} blocker={gBlocker} />}
                          </span>
                        </div>
                        {sp.routes.map((r) => <RouteBlock key={r.id} r={r} suggestions={suggestions} today={today} matter={`a special permission for ${p.name} on ${p.exercise.reference}`} refused="Refused: not granted" kind="permission" />)}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader icon={<LinkIcon size={17} />} title="Awards" subtitle="Awards linked to this supplier: through the awardee party's link, or (for an award with no party) on their own." divided={s.awards.length === 0} />
        {s.awards.length === 0 ? (
          <EmptyState size="sm" title="No award linked">An award follows its awardee party&apos;s link.</EmptyState>
        ) : (
          <Table minWidth={560}>
            <colgroup>
              <col />
              <col style={{ width: 200 }} />
            </colgroup>
            <THead>
              <Th>Award</Th>
              <Th>Linked through</Th>
            </THead>
            <tbody>
              {s.awards.map((a) => (
                <Tr key={a.id}>
                  <Td label="Award"><CellStack title={<Link href={`/awards/${a.id}`}>{a.reference}</Link>} sub={`${a.awardeeName} · ${AWARD_STATUS_LABEL[a.status]}`} /></Td>
                  <Td label="Linked through">{a.awardeePartyId ? "Its awardee party" : "The award itself"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

