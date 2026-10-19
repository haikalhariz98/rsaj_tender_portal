import type { ReactNode } from "react";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { InboxIcon, FileIcon, UsersIcon } from "@/components/icons";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { LeadWithMore } from "@/components/ui/more-text";
import { KeyValues } from "@/components/ui/stat";
import { OPENING_STATEMENT } from "@/lib/opening/labels";
import { db } from "@/lib/db";
import { openingSection, scheduleSection, type OpeningSectionView, type OpeningView, type ScheduleSectionView } from "@/lib/opening/read";

import { EXERCISE_NOTE_ID } from "../../editors";
import { AdjournDrawer, AuthoriseDrawer, CopyExplanationDrawer, FinaliseDrawer, MatchWithdrawalDrawer, FileSealedBidsDrawer, OnlineFinaliseDrawer, OnlineSignatureDrawer, RegisterBoxDrawer, ScheduleDetailsDrawer, SignatureDrawer, StartOpeningDrawer, StartSupplementaryDrawer, WithdrawalFindingDrawer } from "./editors";
import { EnvelopesToOpen, OffersRead } from "./lists";
import { OpeningMatrix, type VerdictAids } from "./matrix";
import { GrandSummaryList, ScheduleDownloads, ScheduleList } from "./schedule-tables";
import { openingMatrices, type MatrixView } from "@/lib/opening/matrix-read";
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
    <EmptyState title="Exercise not found" />
  </Card>
);

function Statement() {
  return (
    <div className="flex justify-end">
      <InfoChip tone="neutral" detail={OPENING_STATEMENT.body} label={OPENING_STATEMENT.title}>Panel authorises</InfoChip>
    </div>
  );
}

const NOT_HERE = (exerciseId: string, title: string) => (
  <Card>
    <EmptyState title={title} action={<ButtonLink href={`/sourcing/${exerciseId}?tab=bids&section=received`} variant="secondary" size="sm">Open Received</ButtonLink>} />
  </Card>
);

// ------------------------------------------------------------------ the Opening section

export async function loadOpening(actor: StaffActor, exerciseId: string): Promise<OpeningTabView> {
  // The prices read at the opening are SULIT (NFR-SEC-002): one answer for the exercise, logged, and every price is held to it.
  const prices = await sulitExerciseGate(actor, exerciseId, "exercise", PRICE_FIELDS);
  const d = await openingSection(actor.organisationId, exerciseId, prices, actor.personId, actor.isAdministrator);
  if (!d) return { panel: GONE, actions: null, notes: [] };
  if (!d.applies) {
    return { actions: null, notes: [], panel: <div className="flex flex-col gap-6"><Statement />{NOT_HERE(exerciseId, "Opened outside the portal")}</div> };
  }
  // SR-14: each opening's matrix, read for this viewer. Only this section reads it.
  const matrices = await openingMatrices(actor.organisationId, exerciseId, d.openings.map((o) => o.id), { personId: actor.personId, administrator: actor.isAdministrator });
  const notes: [string, string][] = d.startNeeded && !d.start.allowed.allowed ? [["Start the opening", d.start.allowed.reason]] : [];
  return {
    notes,
    actions: d.startNeeded ? <StartOpeningDrawer exerciseId={exerciseId} allowed={d.start.allowed} seats={d.start.seats} roster={d.start.roster} people={d.people} panelSize={d.start.panelSize} independence={d.start.independence} estimateLate={d.start.estimateLate} noteId={EXERCISE_NOTE_ID} /> : null,
    panel: <OpeningPanel d={d} viewerPersonId={actor.personId} matrices={matrices} viewer={{ personId: actor.personId, name: actor.personName }} />,
  };
}

function OpeningPanel({ d, viewerPersonId, matrices, viewer }: { d: OpeningSectionView; viewerPersonId: string; matrices: Map<string, MatrixView>; viewer: { personId: string; name: string } }) {
  return (
    <div className="flex flex-col gap-6">
      <Statement />
      {d.startNeeded && (
        <Card>
          <CardHeader icon={<UsersIcon size={17} />} title="Not started" />
          <CardBody className="border-t border-line">
            <KeyValues
              columns={2}
              items={[
                { label: "Opened by", value: d.start.committee ?? "Not set" },
                ...(d.start.roster ? [{ label: "Opening officers", value: d.start.roster.map((o) => o.label).join("; ") || "None" }] : []),
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
        <OpeningCard key={o.id} d={d} o={o} viewerPersonId={viewerPersonId} matrices={matrices} viewer={viewer} />
      ))}
      <LateCard d={d} />
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Company estimate" />
        <CardBody className="border-t border-line">
          <p className="text-[13.5px] text-ink-2">{d.estimate.text}</p>
        </CardBody>
      </Card>
    </div>
  );
}

/// The SR-14 checklist matrix of one opening. An opening with no offer read has no columns, and says so.
function MatrixSection({ d, o, matrix, viewer }: { d: OpeningSectionView; o: OpeningView; matrix: MatrixView | null; viewer: { personId: string; name: string } }) {
  const aids: Record<string, VerdictAids> = Object.fromEntries(o.offers.map((b) => [b.id, { options: b.verdictOptions, grounds: b.grounds, reported: b.reported }]));
  return (
    <CardBody className="flex min-w-0 flex-col gap-3 border-t border-line">
      <h3 className="text-[13.5px] font-semibold text-ink">
        <LeadWithMore lead="Checklist" more={matrix?.online ? "Files open here for named officers only. Each download asks your password and passphrase, and is logged. A column stands once every named officer confirms it." : "A column stands once every present panel member confirms it."} />
      </h3>
      {o.checklist.notJudged.length > 0 && <Callout tone="warn">{`Not judged: whether ${o.checklist.notJudged.join(", ")} must be returned is not set. Finalising is blocked.`}</Callout>}
      {o.checklist.notReturned.length > 0 && <p className="text-[12.5px] break-words text-ink-3">{`Not checked, not returned: ${o.checklist.notReturned.join(", ")}.`}</p>}
      {!matrix || matrix.columns.length === 0 ? (
        <EmptyState size="sm" title="No offer to check yet" />
      ) : matrix.rows.length === 0 ? (
        <EmptyState size="sm" title="Checklist is empty" />
      ) : (
        <OpeningMatrix exerciseId={d.exerciseId} openingId={o.id} view={matrix} viewer={viewer} verdicts={matrix.namesHeld ? {} : aids} />
      )}
    </CardBody>
  );
}

/// A disabled act whose only reason is what holds the whole record back is not repeated: that reason is said once, at the top.
const shown = (o: OpeningView, a: { allowed: boolean; reason?: string } | null) => !!a && (a.allowed || a.reason !== o.held);

function OpeningCard({ d, o, viewerPersonId, matrices, viewer }: { d: OpeningSectionView; o: OpeningView; viewerPersonId: string; matrices: Map<string, MatrixView>; viewer: { personId: string; name: string } }) {
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
                {shown(o, p.authorise) && !p.authorised && !o.finalised && p.authorise && (p.personId === viewerPersonId ? <AuthoriseDrawer exerciseId={ex} openingId={o.id} name={p.name} allowed={p.authorise} online={o.online ? o.authorisationsRequired : null} /> : <span className="text-[12.5px] text-ink-3">Authorises in their own sign-in</span>)}
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

      <MatrixSection d={d} o={o} matrix={matrices.get(o.id) ?? null} viewer={viewer} />

      {o.filesToFile != null && o.filesToFile > 0 && (
        <CardBody className="flex flex-col gap-3 border-t border-line">
          <Callout tone="warn">{`${o.filesToFile} sealed bid file${o.filesToFile === 1 ? "" : "s"} not filed. Keys stay readable until filed.`}</Callout>
          <FileSealedBidsDrawer exerciseId={ex} openingId={o.id} waiting={o.filesToFile} />
        </CardBody>
      )}

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
        {!o.finalised && o.online && o.signFor.some((p) => p.personId === viewerPersonId) && (
          <span className="flex flex-wrap gap-1">
            {o.signFor.filter((p) => p.personId === viewerPersonId).map((p) => <OnlineSignatureDrawer key={p.personId} exerciseId={ex} openingId={o.id} name={p.name} allowed={p.allowed} />)}
          </span>
        )}
        {!o.finalised && !o.online && o.signFor.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {o.signFor.map((p) => <SignatureDrawer key={p.personId} exerciseId={ex} openingId={o.id} person={{ id: p.personId, name: p.name }} allowed={p.allowed} />)}
          </span>
        )}
      </CardBody>

      {!o.finalised && (
        <CardBody className="flex flex-col gap-3 border-t border-line">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13.5px] font-semibold text-ink">Finalising</h3>
            {o.finalise.allowed.allowed && !o.online && <FinaliseDrawer exerciseId={ex} openingId={o.id} title={o.title} allowed={o.finalise.allowed} people={d.people} paper={o.finalise.paper} />}
            {o.finalise.allowed.allowed && o.online && o.panel.some((p) => p.personId === viewerPersonId) && <OnlineFinaliseDrawer exerciseId={ex} openingId={o.id} title={o.title} allowed={o.finalise.allowed} />}
          </div>
          {o.online && o.finalise.online && (
            <p className="text-[13px] text-ink-2">{`${o.finalise.online.signed} of ${o.finalise.online.of} officers have signed.`}</p>
          )}
          {o.finalise.outstanding.length === 0 ? (
            <p className="text-[13px] text-ink-2">Nothing outstanding.{o.finalise.paper ? " Paper figure asked at finalising." : ""}</p>
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
      <CardHeader icon={<InboxIcon size={17} />} title="Late envelopes" subtitle="Admission is decided on Received." />
      <ul className="divide-y divide-line/70 border-t border-line">
        {d.late.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 sm:px-6">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-ink">{e.sequence == null ? "Online bid received after the closing" : `Envelope ${e.sequence}`}</span>
              <span className="block text-[12px] break-words text-ink-3">{`Received ${e.received} · ${e.markings}`}</span>
            </span>
            <Chip tone={e.tone === "neutral" ? undefined : e.tone}>{e.state}</Chip>
            {e.decisionId && e.startSupplementary && e.sequence != null && <StartSupplementaryDrawer exerciseId={d.exerciseId} decisionId={e.decisionId} sequence={e.sequence} allowed={e.startSupplementary} seats={d.supplementary.seats} roster={d.supplementary.roster} people={d.people} panelSize={d.supplementary.panelSize} />}
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
  if (d.openings.length === 0) return NOT_HERE(d.exerciseId, "Opening not started");
  return (
    <div className="flex flex-col gap-6">
      {d.openings.map((o) => (
        <ScheduleCard key={o.id} d={d} o={o} />
      ))}
    </div>
  );
}

function ScheduleCard({ d, o }: { d: ScheduleSectionView; o: ScheduleSectionView["openings"][number] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FileIcon size={17} />}
        title={<span className="inline-flex flex-wrap items-center gap-2">{`Schedule of tenders · ${o.title}`}<Badge tone={o.finalised ? "ok" : "warn"} dot>{o.finalised ? `Finalised ${o.finalisedAt}` : "Draft"}</Badge></span>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ScheduleDownloads exerciseId={d.exerciseId} o={o} />
            <ButtonLink href={`/sourcing/${d.exerciseId}/opening/print?opening=${o.id}`} variant="secondary" size="sm">Print</ButtonLink>
          </div>
        }
      />
      <CardBody className="border-t border-line">
        <KeyValues columns={2} items={o.header} />
      </CardBody>
      <div className="border-t border-line">
        <ScheduleList o={o} />
      </div>
      {o.benchmark && (
        <CardBody className="border-t border-line">
          <KeyValues items={[{ label: o.benchmark.sealed ? "Company estimate" : o.benchmark.label, value: o.benchmark.sealed ? o.benchmark.text : <SulitValue of={o.benchmark.companyEstimate} /> }]} />
        </CardBody>
      )}
      {o.copy && (
        <CardBody className="flex flex-col gap-3 border-t border-line">
          {o.copy.tone === "warn" ? (
            <Callout tone="warn" title={o.copy.text} action={o.explain?.allowed ? <CopyExplanationDrawer exerciseId={d.exerciseId} openingId={o.id} people={d.people} /> : undefined}>
              {o.copy.fault ?? (o.explanation ? `Explained by ${o.explanation.by}, ${o.explanation.at}: ${o.explanation.text}` : o.copy.body)}
            </Callout>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <InfoChip tone={o.copy.tone === "ok" ? "ok" : "neutral"} detail={o.copy.body ?? o.copy.text} label="About the paper copy">{o.copy.text}</InfoChip>
              {o.explain?.allowed && <CopyExplanationDrawer exerciseId={d.exerciseId} openingId={o.id} people={d.people} />}
            </div>
          )}
        </CardBody>
      )}
      <GrandSummaryList o={o} />
      <CardBody className="flex flex-col gap-3 border-t border-line">
        {o.finalised ? (
          <OwnerAttachments owner={{ kind: "opening", id: o.id }} only={["SIGNED_SCHEDULE"]} title="The signed schedule" subtitle="Evaluation and award wait for it." collapseWhenEmpty={false} />
        ) : (
          <p className="text-[13px] text-ink-3">{o.scan}</p>
        )}
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ Received: the SR-15 tables once finalised (ruling 20ct)

/// Once an opening is finalised, the Received section shows its SR-15 tables: the schedule's own components, from the same `scheduleSection` read, never a copy (SR-15 "Where: Received", 20ct).
/// Before any opening is finalised nothing is read here at all (the read logs the estimate's access and gates the prices), and Received shows none of it.
export async function loadReceivedSchedule(scope: StaffActor, exerciseId: string): Promise<ReactNode> {
  const finalised = await db.opening.count({ where: { organisationId: scope.organisationId, exerciseId, finalisedAt: { not: null } } });
  if (finalised === 0) return null;
  const prices = await sulitExerciseGate(scope, exerciseId, "exercise", PRICE_FIELDS);
  const d = await scheduleSection(scope, exerciseId, prices);
  const done = d?.openings.filter((o) => o.finalised) ?? [];
  if (!d || done.length === 0) return null;
  return (
    <>
      {done.map((o) => (
        <Card key={o.id} className="overflow-hidden">
          <CardHeader
            icon={<FileIcon size={17} />}
            title={<span className="inline-flex flex-wrap items-center gap-2">{`Schedule of tenders · ${o.title}`}<Badge tone="ok" dot>{`Finalised ${o.finalisedAt}`}</Badge></span>}
            actions={<div className="flex flex-wrap items-center gap-2"><ScheduleDownloads exerciseId={d.exerciseId} o={o} /></div>}
          />
          <div className="border-t border-line">
            <ScheduleList o={o} />
          </div>
          <GrandSummaryList o={o} />
        </Card>
      ))}
    </>
  );
}
