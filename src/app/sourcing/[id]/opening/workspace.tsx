import type { ReactNode } from "react";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { DataList, type Row } from "@/components/data-list";
import { sulitText } from "@/components/sulit-cell";
import { InboxIcon, FileIcon, UsersIcon } from "@/components/icons";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { OPENING_STATEMENT } from "@/lib/opening/labels";
import { openingSection, scheduleSection, type OpeningSectionView, type OpeningView, type ScheduleSectionView } from "@/lib/opening/read";

import { EXERCISE_NOTE_ID } from "../../editors";
import { AdjournDrawer, AuthoriseDrawer, CopyExplanationDrawer, FinaliseDrawer, MatchWithdrawalDrawer, RegisterBoxDrawer, ScheduleDetailsDrawer, SignatureDrawer, StartOpeningDrawer, StartSupplementaryDrawer, WithdrawalFindingDrawer } from "./editors";
import { EnvelopesToOpen, OffersRead } from "./lists";
import type { StaffActor } from "@/lib/auth/types";
import { sulitExerciseGate } from "@/app/_auth/sulit";

/// What the opening's prices are registered as (`SULIT_FIELDS`): asked together, once.
import { PRICE_FIELDS } from "./price-fields";
export { PRICE_FIELDS };

/// The sections of the exercise's "Bids and opening" tab, in order. The strip is the shared Tabs' second level.
export const BIDS_SECTIONS = [
  // SR-06 (ruling 9): the sale register, requests and briefing attendance are the first section.
  { id: "sales", label: "Sales and briefing" },
  { id: "received", label: "Received" },
  { id: "opening", label: "Opening" },
  { id: "schedule", label: "Schedule" },
] as const;

export type BidsSectionId = (typeof BIDS_SECTIONS)[number]["id"];
export const bidsSectionOf = (v: string | undefined): BidsSectionId => BIDS_SECTIONS.find((s) => s.id === v)?.id ?? "received";

export interface OpeningTabView {
  panel: ReactNode;
  actions: ReactNode;
  notes: [string, string][];
}

const GONE = (
  <Card>
    <EmptyState title="This exercise could not be found">Its organisation may no longer be configured.</EmptyState>
  </Card>
);

function Statement() {
  return (
    <Callout tone="info" title={OPENING_STATEMENT.title}>
      {OPENING_STATEMENT.body}
    </Callout>
  );
}

const NOT_HERE = (exerciseId: string, what: string) => (
  <Card>
    <EmptyState title="Nothing is opened here" action={<ButtonLink href={`/sourcing/${exerciseId}?tab=bids&section=received`} variant="secondary" size="sm">Open Received</ButtonLink>}>
      {what}
    </EmptyState>
  </Card>
);

// ------------------------------------------------------------------ the Opening section

export async function loadOpening(actor: StaffActor, exerciseId: string): Promise<OpeningTabView> {
  // The prices read at the opening are SULIT (NFR-SEC-002): one answer for the exercise, logged, and every price is held to it.
  const prices = await sulitExerciseGate(actor, exerciseId, "exercise", PRICE_FIELDS);
  const d = await openingSection(actor.organisationId, exerciseId, prices);
  if (!d) return { panel: GONE, actions: null, notes: [] };
  if (!d.applies) {
    return { actions: null, notes: [], panel: <div className="flex flex-col gap-6"><Statement />{NOT_HERE(exerciseId, "Bids are opened here for an exercise published through its invitation window with tender or quotation documents. This one was not, so its opening is recorded outside the portal.")}</div> };
  }
  const notes: [string, string][] = d.startNeeded && !d.start.allowed.allowed ? [["Start the opening", d.start.allowed.reason]] : [];
  return {
    notes,
    actions: d.startNeeded ? <StartOpeningDrawer exerciseId={exerciseId} allowed={d.start.allowed} seats={d.start.seats} roster={d.start.roster} people={d.people} panelSize={d.start.panelSize} independence={d.start.independence} estimateLate={d.start.estimateLate} noteId={EXERCISE_NOTE_ID} /> : null,
    panel: <OpeningPanel d={d} viewerPersonId={actor.personId} />,
  };
}

function OpeningPanel({ d, viewerPersonId }: { d: OpeningSectionView; viewerPersonId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <Statement />
      {d.startNeeded && (
        <Card>
          <CardHeader icon={<UsersIcon size={17} />} title="Not started" subtitle="The opening starts once the window has closed and the box is recorded as locked. Its panel is drawn from the committee the method names." />
          <CardBody className="border-t border-line">
            <KeyValues
              columns={2}
              items={[
                { label: "Opened by", value: d.start.committee ?? "The method names no opening committee" },
                ...(d.start.roster ? [{ label: "Opening officers", value: d.start.roster.map((o) => o.label).join("; ") || "None named" }] : []),
                { label: "Panel size", value: d.start.panelSize == null ? "Not set" : String(d.start.panelSize) },
                { label: "Independence", value: d.start.independence },
                { label: "The box", value: d.box.lockedAt ? `Locked ${d.box.lockedAt}` : "Not recorded as locked" },
                ...(d.box.gap ? [{ label: "Closing to the lock", value: d.box.gap }] : []),
              ]}
            />
          </CardBody>
        </Card>
      )}
      {d.openings.map((o) => (
        <OpeningCard key={o.id} d={d} o={o} viewerPersonId={viewerPersonId} />
      ))}
      <LateCard d={d} />
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Company estimate" subtitle="Never read at the opening. Disclosed when the opening is finalised, and only then compared with its paper copy." />
        <CardBody className="border-t border-line">
          <p className="text-[13.5px] text-ink-2">{d.estimate.text}</p>
        </CardBody>
      </Card>
    </div>
  );
}

/// A disabled act whose only reason is what holds the whole record back is not repeated: that reason is said once, at the top.
const shown = (o: OpeningView, a: { allowed: boolean; reason?: string } | null) => !!a && (a.allowed || a.reason !== o.held);

function OpeningCard({ d, o, viewerPersonId }: { d: OpeningSectionView; o: OpeningView; viewerPersonId: string }) {
  const ex = d.exerciseId;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<InboxIcon size={17} />}
        title={<span className="inline-flex flex-wrap items-center gap-2">{o.title}<Badge tone={o.phaseTone === "neutral" ? undefined : o.phaseTone} dot>{o.phase}</Badge></span>}
        subtitle={`${o.committee} · started ${o.started}${o.admittedBy ? ` · ${o.admittedBy}` : ""}`}
        actions={
          <span className="flex flex-wrap items-center gap-1">
            {o.adjourn && <AdjournDrawer exerciseId={ex} openingId={o.id} allowed={o.adjourn} people={d.people} resume={false} />}
            {o.resume && <AdjournDrawer exerciseId={ex} openingId={o.id} allowed={o.resume} people={d.people} resume />}
          </span>
        }
      />
      <CardBody className="flex flex-col gap-5 border-t border-line">
        {o.held && <Callout tone="warn">{o.held}</Callout>}
        <KeyValues
          columns={2}
          items={[
            { label: "Sitting", value: o.finalised ? `Finalised ${o.finalisedAt}` : `Sitting ${o.sittingNo}` },
            { label: "Panel size", value: o.panelOverride ?? (o.panelSize == null ? "Not set" : String(o.panelSize)) },
            { label: "Independence", value: o.independence },
            ...o.rules,
          ]}
        />
        {o.sittings.length > 1 && (
          <ul className="flex flex-col gap-1 text-[12.5px] text-ink-3">
            {o.sittings.map((s) => (
              <li key={s.no} className="break-words">{s.text}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2">
          <h3 className="text-[13.5px] font-semibold text-ink">The panel</h3>
          <ul className="divide-y divide-line/70 rounded-xl border border-line">
            {o.panel.map((p) => (
              <li key={p.personId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{p.name}</span>
                  <span className="block text-[12px] text-ink-3">{p.seat}</span>
                </span>
                <Chip tone={p.present ? "ok" : undefined}>{p.present ? "Present" : "Absent"}</Chip>
                {p.authorised && <Chip tone="brand">{`Authorised sitting ${o.sittingNo}`}</Chip>}
                {shown(o, p.authorise) && !p.authorised && !o.finalised && p.authorise && (p.personId === viewerPersonId ? <AuthoriseDrawer exerciseId={ex} openingId={o.id} name={p.name} allowed={p.authorise} /> : <span className="text-[12.5px] text-ink-3">Authorises signed in as themselves</span>)}
              </li>
            ))}
          </ul>
          {o.authorisations.length > 0 && <p className="text-[12.5px] break-words text-ink-3">{`Authorisations: ${o.authorisations.join("; ")}.`}</p>}
        </div>
      </CardBody>

      {o.kind === "MAIN" && (
        <CardBody className="flex flex-col gap-3 border-t border-line">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13.5px] font-semibold text-ink">The tender box</h3>
            {o.registerBox && shown(o, o.registerBox) && <RegisterBoxDrawer exerciseId={ex} openingId={o.id} allowed={o.registerBox} people={d.people} />}
          </div>
          <p className="text-[13px] text-ink-2">{d.box.lockedAt ? `Locked ${d.box.lockedAt}.` : "Not recorded as locked."} {d.box.gap}</p>
          {o.withdrawals.length > 0 && (
            <ul className="divide-y divide-line/70 rounded-xl border border-line">
              {o.withdrawals.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                  <span className="min-w-0 flex-1 text-[13px] break-words text-ink-2">{`Withdrawal received ${w.received}: ${w.state}`}</span>
                  {w.match && shown(o, w.match) && <MatchWithdrawalDrawer exerciseId={ex} openingId={o.id} withdrawalId={w.id} received={w.received} envelopes={o.matchOptions} allowed={w.match} />}
                  {w.find && shown(o, w.find) && <WithdrawalFindingDrawer exerciseId={ex} openingId={o.id} withdrawalId={w.id} allowed={w.find} people={d.people} />}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      )}

      <div className="border-t border-line">
        <h3 className="px-5 pt-4 text-[13.5px] font-semibold text-ink sm:px-6">{o.kind === "MAIN" ? "Envelopes in time" : "The admitted envelope"}</h3>
        <EnvelopesToOpen exerciseId={ex} o={o} />
      </div>
      <div className="border-t border-line">
        <h3 className="px-5 pt-4 text-[13.5px] font-semibold text-ink sm:px-6">Offers read, in opening order</h3>
        <OffersRead exerciseId={ex} o={o} />
      </div>

      <CardBody className="flex flex-col gap-3 border-t border-line">
        <h3 className="text-[13.5px] font-semibold text-ink">Checked against each bid</h3>
        {o.checklist.items.length === 0 ? <p className="text-[13px] text-ink-3">Nothing is on the checklist.</p> : <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13.5px] text-ink-2">{o.checklist.items.map((i) => <li key={i} className="break-words">{i}</li>)}</ol>}
        {o.checklist.notJudged.length > 0 && <Callout tone="warn">{`Whether a bidder returns ${o.checklist.notJudged.join(", ")} is not set, so completeness is not judged against it and the opening cannot be finalised.`}</Callout>}
        {o.checklist.notReturned.length > 0 && <p className="text-[12.5px] break-words text-ink-3">{`Not returned by a bidder, so not checked: ${o.checklist.notReturned.join(", ")}.`}</p>}
      </CardBody>

      <CardBody className="flex flex-col gap-3 border-t border-line">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13.5px] font-semibold text-ink">The signed schedule</h3>
          {!o.finalised && shown(o, o.details) && <ScheduleDetailsDrawer exerciseId={ex} openingId={o.id} pages={o.pages} minutes={o.minutes} allowed={o.details} />}
        </div>
        <KeyValues
          columns={2}
          items={[
            { label: "Pages", value: o.pages == null ? "Not recorded yet" : String(o.pages) },
            { label: "Signed by", value: o.signatures.length ? o.signatures.join("; ") : "Nobody recorded yet" },
            ...(o.minutes ? [{ label: "Minutes", value: <span className="whitespace-pre-line">{o.minutes}</span> }] : []),
          ]}
        />
        {!o.finalised && o.signFor.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {o.signFor.map((p) => <SignatureDrawer key={p.personId} exerciseId={ex} openingId={o.id} person={{ id: p.personId, name: p.name }} allowed={p.allowed} />)}
          </span>
        )}
      </CardBody>

      {!o.finalised && (
        <CardBody className="flex flex-col gap-3 border-t border-line">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13.5px] font-semibold text-ink">Finalising</h3>
            {o.finalise.allowed.allowed && <FinaliseDrawer exerciseId={ex} openingId={o.id} title={o.title} allowed={o.finalise.allowed} people={d.people} paper={o.finalise.paper} />}
          </div>
          {o.finalise.outstanding.length === 0 ? (
            <p className="text-[13px] text-ink-2">Everything the paper schedule carries is on the record.{o.finalise.paper ? " Finalising asks for the figure on the estimate's paper copy." : ""}</p>
          ) : (
            <Callout tone="warn" title="Before it can be finalised">
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {o.finalise.outstanding.map((t) => <li key={t} className="break-words">{t}</li>)}
              </ul>
            </Callout>
          )}
        </CardBody>
      )}
    </Card>
  );
}

function LateCard({ d }: { d: OpeningSectionView }) {
  if (d.late.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<InboxIcon size={17} />} title="Late envelopes" subtitle="Never opened at the main opening. The committee decides each one's admission on the Received section; an admitted one is opened at its own supplementary opening, after the main one is finalised. One not admitted is returned unopened." />
      <ul className="divide-y divide-line/70 border-t border-line">
        {d.late.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 sm:px-6">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-ink">{`Envelope ${e.sequence}`}</span>
              <span className="block text-[12px] break-words text-ink-3">{`Received ${e.received} · ${e.markings}`}</span>
            </span>
            <Chip tone={e.tone === "neutral" ? undefined : e.tone}>{e.state}</Chip>
            {e.decisionId && e.startSupplementary && <StartSupplementaryDrawer exerciseId={d.exerciseId} decisionId={e.decisionId} sequence={e.sequence} allowed={e.startSupplementary} seats={d.supplementary.seats} roster={d.supplementary.roster} people={d.people} panelSize={d.supplementary.panelSize} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------ the Schedule section

export async function loadSchedule(scope: StaffActor, exerciseId: string): Promise<OpeningTabView> {
  const prices = await sulitExerciseGate(scope, exerciseId, "exercise", PRICE_FIELDS);
  const d = await scheduleSection(scope, exerciseId, prices);
  if (!d) return { panel: GONE, actions: null, notes: [] };
  return { actions: null, notes: [], panel: <SchedulePanel d={d} /> };
}

function SchedulePanel({ d }: { d: ScheduleSectionView }) {
  if (d.openings.length === 0) return NOT_HERE(d.exerciseId, "The schedule (Jadual Tawaran) is built from the opening's record once the opening has started.");
  return (
    <div className="flex flex-col gap-6">
      {d.openings.map((o) => (
        <ScheduleCard key={o.id} d={d} o={o} />
      ))}
    </div>
  );
}

function ScheduleCard({ d, o }: { d: ScheduleSectionView; o: ScheduleSectionView["openings"][number] }) {
  const rows: Row[] = o.rows.map((r) => ({
    id: String(r.listingNo),
    search: `${r.listingNo} ${r.bidderName}`,
    sortKeys: { listing: r.listingNo },
    cells: {
      listing: { kind: "text", text: `No. ${r.listingNo}` },
      bidder: { kind: "stack", title: r.bidderName, sub: [r.registrationClass, r.registrationStatus, r.alternative].filter(Boolean).join(" · ") || undefined },
      openingPrice: sulitText(r.openingPrice),
      period: { kind: "text", text: r.period },
    },
  }));
  const summary: Row[] = (o.summary?.rows ?? []).map((r) => ({
    id: `s${r.listingNo}`,
    search: `${r.listingNo} ${r.bidderName}`,
    cells: {
      listing: { kind: "text", text: `No. ${r.listingNo}` },
      bidder: { kind: "text", text: r.bidderName },
      openingPrice: sulitText(r.openingPrice),
      label: { kind: "badge", text: r.label, tone: r.lowest ? "brand" : r.qualified ? "ok" : undefined },
    },
  }));
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FileIcon size={17} />}
        title={<span className="inline-flex flex-wrap items-center gap-2">{`Schedule of tenders · ${o.title}`}<Badge tone={o.finalised ? "ok" : "warn"} dot>{o.finalised ? `Finalised ${o.finalisedAt}` : "Not finalised: a draft from the record"}</Badge></span>}
        subtitle={o.finalised ? "Frozen when the opening was finalised; it never changes." : "Built from the record as it stands. It is frozen when the opening is finalised."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {o.finalised && (
              <>
                <ButtonLink href={`/sourcing/${d.exerciseId}/opening/download/schedule?opening=${o.id}`} variant="secondary" size="sm">Download schedule (CSV)</ButtonLink>
                <ButtonLink href={`/sourcing/${d.exerciseId}/opening/download/summary?opening=${o.id}`} variant="secondary" size="sm">Download Grand Summary (CSV)</ButtonLink>
              </>
            )}
            <ButtonLink href={`/sourcing/${d.exerciseId}/opening/print?opening=${o.id}`} variant="secondary" size="sm">Print</ButtonLink>
          </div>
        }
      />
      <CardBody className="border-t border-line">
        <KeyValues columns={2} items={o.header} />
      </CardBody>
      <div className="border-t border-line">
        <DataList
          flat
          selectable={false}
          searchable={false}
          toolbar={false}
          exportName="schedule-of-tenders"
          emptyTitle="No offer read yet"
          emptyBody="Each offer opened is listed in opening order."
          columns={[
            { key: "listing", label: "Bil.", width: "90px", sortable: true, mobile: "primary" },
            { key: "bidder", label: "Bidder", mobile: "meta" },
            { key: "openingPrice", label: "Price as read", width: "190px", sulit: true, mobile: "meta" },
            { key: "period", label: "Completion period", width: "170px", mobile: "meta" },
          ]}
          rows={rows}
        />
      </div>
      {o.benchmark && (
        <CardBody className="border-t border-line">
          <KeyValues items={[{ label: o.benchmark.sealed ? "Company estimate" : o.benchmark.label, value: o.benchmark.sealed ? o.benchmark.text : <SulitValue of={o.benchmark.companyEstimate} /> }]} />
        </CardBody>
      )}
      {o.copy && (
        <CardBody className="flex flex-col gap-3 border-t border-line">
          <Callout tone={o.copy.tone === "warn" ? "warn" : "info"} title={o.copy.text} action={o.explain?.allowed ? <CopyExplanationDrawer exerciseId={d.exerciseId} openingId={o.id} people={d.people} /> : undefined}>
            {o.copy.fault ?? (o.explanation ? `Explained by ${o.explanation.by}, ${o.explanation.at}: ${o.explanation.text}` : o.copy.body)}
          </Callout>
        </CardBody>
      )}
      {o.summary && (
        <div className="border-t border-line">
          <h3 className="px-5 pt-4 text-[13.5px] font-semibold text-ink sm:px-6">Grand Summary</h3>
          <DataList
            flat
            selectable={false}
            searchable={false}
            toolbar={false}
            exportName="grand-summary"
            emptyTitle="No offer"
            emptyBody="No offer was read."
            columns={[
              { key: "listing", label: "Bil.", width: "90px", mobile: "primary" },
              { key: "bidder", label: "Bidder", mobile: "meta" },
              { key: "openingPrice", label: "Price as read", width: "190px", sulit: true, mobile: "meta" },
              { key: "label", label: "At the opening", width: "220px", mobile: "meta" },
            ]}
            rows={summary}
          />
        </div>
      )}
      <CardBody className="flex flex-col gap-3 border-t border-line">
        {o.finalised ? (
          <OwnerAttachments owner={{ kind: "opening", id: o.id }} only={["SIGNED_SCHEDULE"]} title="The signed schedule" subtitle="The scan of the paper the panel signed. Evaluation and the award wait for it." collapseWhenEmpty={false} />
        ) : (
          <p className="text-[13px] text-ink-3">{o.scan}</p>
        )}
      </CardBody>
    </Card>
  );
}
