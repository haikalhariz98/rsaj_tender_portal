import type { ReactNode } from "react";

import { OwnerDocumentsButton } from "@/components/attachments/owner-documents-button";
import { ClipboardIcon, ClockIcon, FileIcon, InboxIcon, ShieldIcon } from "@/components/icons";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { MoreText } from "@/components/ui/more-text";
import { KeyValues } from "@/components/ui/stat";
import { CHECKLIST_RETURN_NOT_SET, CHECKLIST_TITLE, REGISTER_GAPS, REGISTER_STATEMENT, WITHDRAWAL_SULIT_LABEL } from "@/lib/bids/labels";
import { bidsTab, type BidsTab } from "@/lib/bids/read";

import { EXERCISE_NOTE_ID } from "../../editors";
import { FromBadge, GONE, SETTINGS_HREF } from "../window/common";

import { ApplyExtensionDrawer, BidAnswersDrawer, ExtensionDrawer, LockBoxDrawer, ReceiveLaterDrawer, ReceiveNowDrawer, TableLateDrawer, WithdrawalDrawer } from "./editors";
import { EnvelopeList } from "./envelope-list";
import { loadReceivedSchedule } from "../opening/workspace";
import type { StaffActor } from "@/lib/auth/types";
import { sulitExerciseGate } from "@/app/_auth/sulit";

/// What the page puts in its header for the tab (the acts it asks for, the reasons others are disabled) and the panel.
export interface BidsView {
  panel: ReactNode;
  actions: ReactNode;
  notes: [string, string][];
}

const EARLY = ["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING"];

/**
 * The Received section of Bids and opening (6.6 plan §5): the register of envelopes, never offers. Read only while it
 * is the tab being looked at. Every act is judged by the rule its action runs; a disabled one says
 * why in the header's note. There is no Delete and no Reject anywhere.
 */
export async function loadBids(scope: StaffActor, exerciseId: string, status: string): Promise<BidsView> {
  const d = await bidsTab(scope.organisationId, exerciseId, await sulitExerciseGate(scope, exerciseId, "exercise", ["letterQuote"]), scope.system ? null : scope.personId);
  if (!d) return { panel: GONE, actions: null, notes: [] };
  if (EARLY.includes(status) && d.rows.length === 0) {
    return {
      actions: null,
      notes: [],
      panel: (
        <div className="flex flex-col gap-6">
          <Statement />
          <Card>
            <EmptyState title="Opens once published" action={<ButtonLink href={`/sourcing/${exerciseId}?tab=documents&section=publishing`} variant="secondary" size="sm">Open Publishing</ButtonLink>} />
          </Card>
          <ValidityCard d={d} />
        </div>
      ),
    };
  }
  const notes: [string, string][] = [];
  const say = (label: string, a: { allowed: boolean; reason?: string }) => {
    if (!a.allowed && a.reason) notes.push([label, a.reason]);
  };
  say("Record a receipt now", d.acts.receive as { allowed: boolean; reason?: string });
  say("Record a receipt after the event", d.acts.receive as { allowed: boolean; reason?: string });
  say("Record a withdrawal", d.acts.withdraw as { allowed: boolean; reason?: string });
  say("Record the box locked", d.acts.lock as { allowed: boolean; reason?: string });
  // One reason said once where every act shares it.
  const merged = notes.reduce<[string, string][]>((out, [label, why]) => {
    const same = out.find(([, w]) => w === why);
    if (same) same[0] = `${same[0]}, ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
    else out.push([label, why]);
    return out;
  }, []);
  return {
    notes: merged,
    actions: (
      <>
        <ReceiveNowDrawer exerciseId={exerciseId} allowed={d.acts.receive} people={d.people} bids={d.bidOptions} noteId={EXERCISE_NOTE_ID} />
        <ReceiveLaterDrawer exerciseId={exerciseId} allowed={d.acts.receive} people={d.people} bids={d.bidOptions} noteId={EXERCISE_NOTE_ID} />
        <WithdrawalDrawer exerciseId={exerciseId} allowed={d.acts.withdraw} people={d.people} envelopes={d.withdrawable} noteId={EXERCISE_NOTE_ID} />
        <LockBoxDrawer exerciseId={exerciseId} allowed={d.acts.lock} people={d.people} noteId={EXERCISE_NOTE_ID} />
      </>
    ),
    panel: <BidsPanel d={d} schedule={await loadReceivedSchedule(scope, exerciseId)} />,
  };
}

function Statement() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InfoChip tone="neutral" detail={REGISTER_STATEMENT.body} label="About the register">Envelopes only</InfoChip>
      <InfoChip tone="warn" detail={REGISTER_GAPS[0]} label="About alerts">Not emailed</InfoChip>
      <InfoChip tone="warn" detail={REGISTER_GAPS[1]} label="About the estimate">Estimate unencrypted</InfoChip>
    </div>
  );
}

function BidsPanel({ d, schedule }: { d: BidsTab; schedule: ReactNode }) {
  const register = d.rows.filter((r) => !r.isEstimate);
  return (
    <div className="flex flex-col gap-6">
      <Statement />
      {d.validity.fault && (
        <Callout tone="warn" title={d.validity.state === "EXPIRED" ? "The bids' validity has expired" : "The bids' validity is not set"}>
          {d.validity.fault}
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<InboxIcon size={17} />}
          title="Envelope register"
          subtitle={`${register.length} ${register.length === 1 ? "envelope" : "envelopes"} · ${d.count.late} late`}
          divided={false}
        />
        {d.online.count > 0 && (
          <CardBody className="border-t border-line">
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
              {`Online: ${d.online.count} ${d.online.count === 1 ? "bid" : "bids"} now standing, ${d.online.inTime} in time and ${d.online.late} late.`}
              {d.online.showsOrdinal && <MoreText label="Order of the bids" text={d.online.ordinalNote} />}
            </p>
          </CardBody>
        )}
        <EnvelopeList exerciseId={d.exerciseId} rows={d.rows} late={d.late} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader icon={<ShieldIcon size={17} />} title="Tender box" subtitle="Box and key remain the control" />
          <CardBody className="flex flex-col gap-4">
            <KeyValues
              items={[
                { label: "Closing", value: d.closing ?? "Not set" },
                { label: "The box", value: <span className="flex flex-wrap items-center gap-2">{d.box.state === "NOT_LOCKED" ? <Chip tone="warn">Not locked yet</Chip> : <Chip tone="ok">{d.box.state === "LOCKED" ? "Locked" : "Opened"}</Chip>}{d.box.state !== "NOT_LOCKED" && <span className="break-words">{d.box.text}</span>}</span> },
                { label: "How lateness is judged", value: <span className="flex flex-col items-start gap-1.5"><span className="break-words">{d.statement.reading}</span><FromBadge text={d.statement.provenance} /></span> },
                { label: "The method's rules", value: <span className="flex flex-wrap items-center gap-1.5 break-words">{d.rulesNote}<MoreText label="The method's rules" text={d.rulesMore} /></span> },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<ClipboardIcon size={17} />} title="Bids counted so far" subtitle="Box counted at opening" />
          <CardBody className="flex flex-col gap-4">
            <KeyValues
              columns={2}
              items={[
                { label: "In time", value: String(d.count.inTime) },
                { label: "Late, counted apart", value: String(d.count.late) },
                { label: "Alternatives", value: String(d.count.alternatives) },
                { label: "Withdrawn", value: String(d.count.withdrawn) },
                { label: "Minimum the method expects", value: d.count.minimum ?? d.count.minimumUnset },
                { label: "Competition", value: <Badge tone={d.count.competitionTone}>{d.count.competition}</Badge> },
              ]}
            />
            <p className="text-[12.5px] text-ink-3">{d.count.competitionText}</p>
          </CardBody>
        </Card>
      </div>

      {schedule}
      <LateCard d={d} />
      <WithdrawalsCard d={d} />
      <ValidityCard d={d} />
      <ChecklistCard d={d} />
    </div>
  );
}

function LateCard({ d }: { d: BidsTab }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="Late envelopes"
        subtitle={d.late.committee ? `Admitted or not by the ${d.late.committee}${d.late.committeeProvenance ? ` (${d.late.committeeProvenance.toLowerCase()})` : ""}` : (d.late.unsetText ?? "")}
        actions={!d.late.committee && d.late.settable ? <ButtonLink href={SETTINGS_HREF} size="sm" variant="ghost">Set it</ButtonLink> : undefined}
      />
      {d.late.gate && (
        <CardBody className="border-t border-line">
          <Callout tone="warn">{d.late.gate} Award held back.</Callout>
        </CardBody>
      )}
      {d.late.rows.length === 0 ? (
        <CardBody className="border-t border-line">
          <EmptyState size="sm" title="No late envelope" />
        </CardBody>
      ) : (
        <ul className="divide-y divide-line/70 border-t border-line">
          {d.late.rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-ink">{r.label}</div>
                <div className="text-[12.5px] break-words text-ink-3">{`${r.stampLabel}: ${r.received}, judged against the closing ${r.judgedAgainst ?? "not recorded"}.${r.statement ? ` ${r.statement}` : ""}`}</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {r.admission && <Chip tone={r.admission.state === "ADMITTED" ? "ok" : r.admission.state === "NOT_ADMITTED" ? "err" : "warn"}>{r.admission.sitting && r.admission.state !== "NOT_TABLED" ? `${r.admission.label} · ${r.admission.sitting}` : r.admission.label}</Chip>}
                {r.table && <TableLateDrawer exerciseId={d.exerciseId} envelopeId={r.id} name={r.label} committee={d.late.committee} sittings={d.late.sittings} holders={d.late.holders} allowed={r.table} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WithdrawalsCard({ d }: { d: BidsTab }) {
  if (d.withdrawals.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<FileIcon size={17} />} title="Withdrawals" subtitle="Letters and quotes are SULIT" />
      <ul className="divide-y divide-line/70 border-t border-line">
        {d.withdrawals.map((w) => (
          <li key={w.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold break-words text-ink">{w.envelope}</div>
              <div className="text-[12.5px] break-words text-ink-3">{`Received ${w.received} · ${w.receivedBy}`}</div>
              <div className="text-[12.5px] break-words text-ink-2">Quoted from the letter: <SulitValue of={w.markings.state === "GRANTED" ? { ...w.markings, value: `“${w.markings.value}”` } : w.markings} /></div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <Chip tone={w.letter === "Attached" ? "ok" : "warn"}>{`Letter: ${w.letter.toLowerCase()}`}</Chip>
              <Chip tone="neutral" title={WITHDRAWAL_SULIT_LABEL}>{WITHDRAWAL_SULIT_LABEL}</Chip>
              <OwnerDocumentsButton owner={{ kind: "bidWithdrawal", id: w.id }} label={w.label} title="Withdrawal letter" subtitle="Held SULIT. Each opening is logged." options={{ only: ["WITHDRAWAL_LETTER"] }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ValidityCard({ d }: { d: BidsTab }) {
  const v = d.validity;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="Bid validity"
        subtitle={v.alertRule}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <BidAnswersDrawer exerciseId={d.exerciseId} allowed={d.acts.answers} values={v.answerValues} needsReason={v.answersNeedReason} />
            {d.publishedThroughWindow && <ExtensionDrawer exerciseId={d.exerciseId} allowed={d.acts.extend} parties={d.parties} people={d.people} expiry={v.expiry} />}
          </span>
        }
      />
      <CardBody className="flex flex-col gap-4 border-t border-line">
        <KeyValues
          columns={2}
          items={[
            { label: "Valid for", value: v.days == null ? <Badge tone="warn">Not set</Badge> : <span className="flex flex-wrap items-center gap-2">{`${v.days} days from the closing day`}{v.provenance && <FromBadge text={v.provenance} />}</span> },
            { label: "Valid until", value: v.expiry ? <span className="flex flex-wrap items-center gap-2">{v.expiry}{v.state === "EXPIRED" ? <Chip tone="err">Expired</Chip> : v.state === "VALID" ? <Chip tone="ok">Valid</Chip> : null}</span> : v.state === "NOT_SET" ? "Not set" : v.state === "TIME_ZONE_UNSET" ? "Not judged: time zone not set" : "Not counted: no closing is recorded" },
            ...(v.recordedAfterPublication ? [{ label: "Recorded after publication", value: <span className="break-words">{v.recordedAfterPublication}</span> }] : []),
            ...(v.baseExpiry && v.baseExpiry !== v.expiry ? [{ label: "Before extension", value: v.baseExpiry }] : []),
            { label: "How expiry is counted", value: <span className="flex flex-col items-start gap-1.5"><span className="break-words">{v.reading.text}</span><FromBadge text={v.reading.provenance} /></span> },
            { label: "Alternative bids", value: v.alternatives },
          ]}
        />
        {v.alert && <Callout tone="warn">{v.alert}</Callout>}
        {!d.publishedThroughWindow && <p className="text-[12.5px] text-ink-3">Validity checked on award for window-published exercises only.</p>}
      </CardBody>
      {v.extensions.length > 0 && (
        <ul className="divide-y divide-line/70 border-t border-line">
          {v.extensions.map((x) => (
            <li key={x.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-ink">{`Extended from ${x.from} to ${x.to}`}</div>
                <div className="text-[12.5px] break-words text-ink-3">{`${x.reason} · consent of ${x.consentOf}, received ${x.consentReceivedOn} · ${x.recordedBy}`}</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <Chip tone={x.consent === "Attached" ? "ok" : "warn"}>{`Consent: ${x.consent.toLowerCase()}`}</Chip>
                {x.applied ? <Chip tone="ok">{`Applied ${x.applied}`}</Chip> : <Chip tone="warn">Not applied</Chip>}
                <OwnerDocumentsButton owner={{ kind: "validityExtension", id: x.id }} label={x.label} title="Consent to extend" subtitle="Tenderer's written consent" options={{ only: ["VALIDITY_CONSENT"] }} />
                {x.apply && <ApplyExtensionDrawer exerciseId={d.exerciseId} extensionId={x.id} to={x.to} allowed={x.apply} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ChecklistCard({ d }: { d: BidsTab }) {
  const c = d.checklist;
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ClipboardIcon size={17} />} title={CHECKLIST_TITLE} subtitle="Checked at opening, not here" />
      <CardBody className="flex flex-col gap-4 border-t border-line">
        {c.returnNotSet.length > 0 && (
          <Callout tone="warn">
            {CHECKLIST_RETURN_NOT_SET} <span className="break-words">{`Not set for: ${c.returnNotSet.join(", ")}.`}</span>
          </Callout>
        )}
        <KeyValues
          items={[
            { label: "From", value: c.pack ?? "No approved tender documents" },
            { label: "An incomplete bid", value: <span className="flex flex-wrap items-center gap-2">{c.consequence}{c.consequenceProvenance && <FromBadge text={c.consequenceProvenance} />}</span> },
          ]}
        />
        {c.items.length === 0 ? (
          <EmptyState size="sm" title="Nothing listed" />
        ) : (
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13.5px] text-ink-2">
            {c.items.map((i) => (
              <li key={i} className="break-words">{i}</li>
            ))}
          </ol>
        )}
        {c.notReturned.length > 0 && <span className="self-start"><InfoChip tone="warn" label="Not checked" detail={`Not returned by a bidder, so not checked against a bid: ${c.notReturned.join(", ")}.`}>{`Not checked ${c.notReturned.length}`}</InfoChip></span>}
        {c.notSet.length > 0 && <Callout tone="warn">{`Whether these parts are mandatory is not set: ${c.notSet.join(", ")}.`}</Callout>}
      </CardBody>
    </Card>
  );
}
