import type { ReactNode } from "react";
import Link from "next/link";

import { EscalateDrawer } from "@/app/approvals/editors";
import { Accordion } from "@/components/accordion";
import { ClockIcon, FileIcon, RouteIcon, ShieldIcon, SlidersIcon, UsersIcon } from "@/components/icons";
import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { isMandatoryAct } from "@/components/ui/act";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { routeCoreText } from "@/lib/authority/core-routing-labels";
import { formatDate } from "@/lib/format";
import { ACT_DONE_LABEL, routedOnLabel } from "@/lib/labels";
import type { LoadedExercise } from "@/lib/method/repo";
import { routeTone, stepTone } from "@/lib/ui/status-tone";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { FEE_COST_KIND_LABEL } from "@/lib/window/labels";
import type { WindowTab } from "@/lib/window/read";
import { FEE_COST_KINDS } from "@/lib/window/types";
import { isPublished } from "@/lib/window/phase";
import type { ExerciseStatus } from "@/lib/method/types";

import { RouteSteps } from "../route-steps";
import { DeliveryList, FromBadge, levelTone, SETTINGS_HREF } from "./common";
import { tabActs } from "./tab-acts";
import {
  ChooseEvaluationModelDrawer,
  EditWindowDrawer,
  TakeSaleModeDrawer,
  TakeSubmissionChannelDrawer,
  FeeLineDrawer,
  LetterDeliveryDrawer,
  NoticeDeliveryDrawer,
  ProposeInviteeDrawer,
  PublishDrawer,
  RecordPublicationDrawer,
  RemoveFeeLineDrawer,
  RemoveInviteeDrawer,
  RemovePublicationDrawer,
  WindowDecisionDrawer,
} from "./editors";

type Route = LoadedExercise["ex"]["approvalInstances"][number];
export type Person = { value: string; label: string };

/// What the window section needs beyond its read model, from the page (which already holds the exercise).
export interface WindowContext {
  exerciseId: string;
  reference: string;
  status: string;
  /// The exercise assembles no tender or quotation documents, so it has no window.
  noPack: boolean;
  today: string | null;
  timeZone: string | null;
  /// The exercise's `window_change` routes, newest first.
  routes: Route[];
  people: Person[];
  /// Who may be named for a step: the office's holders and delegates first.
  suggestions: (roleCode: string | null) => Person[];
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const published = (status: string) => isPublished(status as ExerciseStatus);

/**
 * The page header's share of the Window section: the act the section's state asks for (publish,
 * while the window is prepared). The acts of the tab itself (correct or extend the closing, cancel)
 * are `tabActs`, the same on every section.
 */
export function windowHeader(d: WindowTab, c: WindowContext): { actions: ReactNode; notes: [string, string][]; cancel: ReactNode | null } {
  const notes: [string, string][] = [];
  const pre = c.status === "APPROVED_FOR_TENDERING";
  const tab = tabActs({ ...d.actions, closing: d.dates.closing, lastDayOfSale: d.dates.lastDayOfSale === "Not set" ? null : d.dates.lastDayOfSale }, c);
  if (!pre) return tab;
  const publish = !d.hasWindow ? { allowed: false as const, reason: "Window items not prepared." } : d.actions.publish;
  if (!publish.allowed) notes.push([d.actions.publishLabel, publish.reason]);
  return {
    actions: (
      <>
        {tab.actions}
        <PublishDrawer
          exerciseId={c.exerciseId}
          label={d.actions.publishLabel}
          allowed={publish}
          rows={[
            ["Way of tendering", d.path],
            [d.pathKey === "INVITED" ? "Invited on" : "Advertisement day", d.dates.advertisedOn],
            ["Closes", d.dates.closing],
            ["Last day of sale", d.dates.lastDayOfSale],
            ["Document fee", d.fee.amount],
          ]}
          notes={d.findings.filter((f) => f.level !== "block").map((f) => f.text)}
        />
      </>
    ),
    notes: [...notes, ...tab.notes],
    cancel: tab.cancel,
  };
}

export function WindowSection({ d, c }: { d: WindowTab; c: WindowContext }) {
  const pre = c.status === "APPROVED_FOR_TENDERING";
  const live = published(c.status);
  const blocks = d.findings.filter((f) => f.level === "block");
  const others = d.findings.filter((f) => f.level !== "block");
  const invited = d.pathKey === "INVITED";
  const phaseBadge = live || c.status === "CANCELLED" ? <Badge tone={d.phase.tone} dot>{d.phase.label}</Badge> : undefined;
  // A column of actions nobody can take is not shown.
  const chanActs = !live && c.status !== "CANCELLED" && d.channels.some((x) => x.publication);
  const latest = c.routes[0] ?? null;
  const earlier = c.routes.slice(1);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<ClockIcon size={17} />}
          title="The window"
          subtitle={d.path}
          actions={phaseBadge}
        />
        <CardBody className="flex flex-col gap-4">
          <KeyValues
            columns={3}
            items={[
              { label: "Tendering starts", value: d.dates.start },
              { label: "Closes", value: d.dates.closing },
              { label: invited ? "Invited on" : "Advertised on", value: d.dates.advertisedOn },
              { label: "First day of sale", value: d.dates.firstDayOfSale },
              { label: "Last day of sale", value: d.dates.lastDayOfSale },
              { label: "Status", value: `${d.phase.label}${d.phase.submissionOpen ? `. ${cap(d.bid.many)} may be submitted` : ""}` },
              { label: "Tender Table Document", value: d.tableDocument },
              ...(d.dates.publishedAt ? [{ label: "Published", value: d.dates.publishedAt }] : []),
              { label: "The estimate's lead time", value: <span className={d.lead.warn ? "text-amber-800" : undefined}>{d.lead.text}</span> },
            ]}
          />
          {d.pathChanged && <Callout tone="warn" title="Method changed since the window was prepared">Check the method before publishing.</Callout>}
          {d.frozenRules && <p className="text-[12.5px] text-ink-3">{d.frozenRules}</p>}
          {d.replaces && (
            <p className="text-[12.5px] text-ink-3">
              This exercise replaces <Link href={`/sourcing/${d.replaces.id}`} className="font-semibold">{d.replaces.reference}</Link>, which was cancelled.
            </p>
          )}
          {d.replacedBy.length > 0 && (
            <p className="text-[12.5px] text-ink-3">
              Replaced by {d.replacedBy.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  <Link href={`/sourcing/${r.id}`} className="font-semibold">{r.reference}</Link>
                </span>
              ))}.
            </p>
          )}
        </CardBody>
      </Card>

      {pre && (
        <Card id="publish" className="scroll-mt-24">
          <CardHeader
            icon={<ShieldIcon size={17} />}
            title={`Before it can be ${invited ? "invited" : "published"}`}
            subtitle={blocks.length === 0 ? (others.length ? `Nothing to put right; ${others.length} to note.` : "Every check passes.") : `${blocks.length} to put right${others.length ? `, ${others.length} to note` : ""}.`}
            actions={blocks.some((f) => /Invitation controls/.test(f.text)) ? <ButtonLink href={SETTINGS_HREF} variant="secondary" size="sm">Open Invitation controls</ButtonLink> : undefined}
          />
          <CardBody className="flex flex-col gap-2">
            {d.findings.length === 0 && d.hasWindow ? (
              <p className="text-[13px] font-semibold text-ink">Every check passes.</p>
            ) : (
              d.findings.map((f, i) => (
                <Callout key={i} tone={levelTone(f.level)}>
                  {f.text}
                </Callout>
              ))
            )}
          </CardBody>
        </Card>
      )}

      <EvaluationModelCard d={d} c={c} />

      <WindowItemsCard d={d} c={c} />

      {d.pathKey === "ADVERTISED" ? (
        <>
          <Card className="overflow-hidden">
            <CardHeader
              icon={<SlidersIcon size={17} />}
              title="Channels and publications"
              subtitle={d.advertisementDay?.day && d.advertisementDay.day !== "Not known yet" ? `Advertised on ${d.advertisementDay.day}` : "Needs every required channel"}
              actions={
                !live && c.status !== "CANCELLED" && d.hasWindow ? (
                  <RecordPublicationDrawer exerciseId={c.exerciseId} channels={d.channels.filter((x) => !x.publication).map((x) => ({ value: x.id, label: x.name }))} people={c.people} today={c.today} />
                ) : undefined
              }
              divided={d.channels.length === 0}
            />
            {d.channels.length === 0 ? (
              <EmptyState size="sm" title="No publication channel set" action={<ButtonLink href={SETTINGS_HREF} size="sm" variant="secondary">Open Invitation controls</ButtonLink>} />
            ) : (
              <Table minWidth={720}>
                <colgroup>
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: "30%" }} />
                  {chanActs && <ActionsCol labelled={1} icons={0} />}
                </colgroup>
                <THead>
                  <Th>Channel</Th>
                  <Th>Required</Th>
                  <Th>Published on</Th>
                  <Th>Title, edition or address</Th>
                  {chanActs && <Th className="text-right">Actions</Th>}
                </THead>
                <tbody>
                  {d.channels.map((x) => (
                    <Tr key={x.id}>
                      <Td label="Channel"><CellStack title={x.name} sub={x.publication ? x.publication.recordedBy : undefined} /></Td>
                      <Td label="Required">{x.required === "Not set" ? <Badge tone="warn">Not set</Badge> : x.required === "Required" ? <Chip tone="brand">Required</Chip> : <span className="text-ink-2">Not required</span>}</Td>
                      <Td label="Published on">{x.publication ? x.publication.on : <Chip tone={x.required === "Required" ? "warn" : "neutral"}>{x.required === "Required" ? "Not yet published" : "Not published"}</Chip>}</Td>
                      <Td label="Title, edition or address">{x.publication?.reference || <span className="text-ink-3">—</span>}</Td>
                      {chanActs && <Td>
                        <RowActions>{x.publication && !live && c.status !== "CANCELLED" && <RemovePublicationDrawer exerciseId={c.exerciseId} publicationId={x.publication.id} channel={x.name} />}</RowActions>
                      </Td>}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
            {d.advertisementDay && d.advertisementDay.missing.length > 0 && !live && (
              <p className="border-t border-line px-5 py-3 text-[13px] text-ink-2 sm:px-6">
                Still to be published through: <span className="font-semibold">{d.advertisementDay.missing.join(", ")}</span>.
              </p>
            )}
          </Card>
          {d.hasWindow && (
            <OwnerAttachments owner={{ kind: "exercise", id: c.exerciseId }} only={["PUBLICATION_PROOF"]} title="Proofs of publication" subtitle="Cutting, screen print or photograph" collapseWhenEmpty={false} />
          )}
        </>
      ) : invited ? (
        <InviteesCard d={d} c={c} />
      ) : (
        <Card>
          <EmptyState title="Way of tendering not set">Method says both or neither advertisement and invitation. Correct the method.</EmptyState>
        </Card>
      )}

      <ClosingCard d={d} c={c} latest={latest} earlier={earlier} />

      <RulesUsed d={d} />

      {d.notice && (
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="The notice" subtitle={d.notice.template ? `From ${d.notice.template}` : "Draft until published"} />
          <CardBody>
            <details className="text-[13.5px]">
              <summary className="cursor-pointer font-semibold text-ink-3">Read the notice</summary>
              <p className="mt-3 break-words whitespace-pre-line text-ink-2">{d.notice.text}</p>
            </details>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/**
 * The settings the window is judged by, each with where it comes from, behind "Rules used"
 * (founder, 2026-10-05). A setting that is not set stays on the surface, named, because it holds back the
 * act it governs; the fee's minimum, when it is not set, is shown beside the fee itself.
 */
function RulesUsed({ d }: { d: WindowTab }) {
  const rows: { label: string; value: string; from: string; source: string | null; note: string | null }[] = [
    ...(d.fee.floor ? [{ label: "The least the document fee may be", value: d.fee.floor.amount, from: d.fee.floor.from, source: d.fee.floor.source, note: null }] : []),
    ...d.rules,
  ];
  // A rule about advertising, on an invited exercise, is marked as not applying: it is not a gap.
  const unset = d.rules.filter((r) => r.value.startsWith("Not set") && !r.note).map((r) => r.label);
  return (
    <div className="flex flex-col gap-3">
      {unset.length > 0 && (
        <Callout tone="warn" title={`${unset.length === 1 ? "A setting is" : `${unset.length} settings are`} not set under Invitation controls`}>
          {unset.join("; ")}.{" "}
          <Link href={SETTINGS_HREF} className="font-semibold">Open Invitation controls</Link>
        </Callout>
      )}
      <Accordion title="Rules used" meta={unset.length ? `${unset.length} not set` : `${rows.length} settings`}>

        <ul className="divide-y divide-line/70">
          {rows.map((r) => (
            <li key={r.label} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6">
              <span className="min-w-0 text-[13.5px] font-semibold text-ink">{r.label}</span>
              <span className="flex min-w-0 flex-col items-start gap-1 text-[13.5px] sm:items-end sm:text-right">
                {r.value.startsWith("Not set") ? <Badge tone="warn">{r.value}</Badge> : <span className="break-words text-ink-2">{r.value}</span>}
                <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <FromBadge text={r.from} />
                  {r.source && <span className="text-[12.5px] break-words text-ink-3">{r.source}</span>}
                </span>
                {r.note && <span className="text-[12.5px] text-ink-3">{r.note}</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-5 py-3 sm:px-6">
          <ButtonLink href={SETTINGS_HREF} variant="secondary" size="sm">Open Invitation controls</ButtonLink>
        </div>
      </Accordion>
    </div>
  );
}

/// The notice's items and the fee with its basis: the card Notice and fee on Scope and estimate is made of (SR-06, ruling 9), in preparation and after.
export function WindowItemsCard({ d, c }: { d: WindowTab; c: WindowContext }) {
  return (
    <Card>
      <CardHeader
        icon={<FileIcon size={17} />}
        title="Notice and fee"
        subtitle={d.actions.save.allowed ? undefined : d.actions.save.reason}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {d.channel.mode == null && <TakeSubmissionChannelDrawer exerciseId={c.exerciseId} take={d.channel.take} setting={d.channel.setting} />}
            {d.sale.mode == null && <TakeSaleModeDrawer exerciseId={c.exerciseId} take={d.sale.take} setting={d.sale.setting} />}
            <EditWindowDrawer exerciseId={c.exerciseId} items={d.items} allowed={d.actions.save} first={!d.hasWindow} online={!d.sale.physical} />
          </div>
        }
      />
      {!d.items ? (
        <EmptyState size="sm" title="Not prepared yet" />
      ) : (
        <CardBody className="flex flex-col gap-4">
          <KeyValues
            columns={2}
            items={[
              { label: "How bids are submitted", value: d.channel.mode == null ? <span className="flex flex-wrap items-center gap-2"><Badge tone="warn">Not set</Badge><span className="text-[12.5px] text-ink-3">{`Setting: ${d.channel.setting}`}</span></span> : d.channel.words },
              { label: "How the documents are sold", value: d.sale.mode == null ? <span className="flex flex-wrap items-center gap-2"><Badge tone="warn">Not set</Badge><span className="text-[12.5px] text-ink-3">{`Setting: ${d.sale.setting}`}</span></span> : d.sale.words },
              // SR-10 (ruling 16): the places, the hours and how the fee is paid describe a sale at a counter. An exercise sold online does not show them (the columns stay).
              ...(d.sale.physical
                ? [
                    { label: "Documents inspected at", value: d.items.inspectionPlace || "Not recorded" },
                    { label: "Documents bought at", value: d.items.purchasePlace || "Not recorded" },
                    { label: "Hours", value: d.items.inspectionHours || "Not recorded" },
                    { label: `${cap(d.bid.many)} submitted at`, value: d.items.submissionPlace || "Not recorded" },
                  ]
                : []),
              { label: "Document fee", value: <span className="font-semibold tabular-nums">{d.fee.amount}</span> },
              ...(d.sale.physical ? [{ label: "How the fee is paid", value: d.items.feePaymentMethods || "Not recorded" }] : []),
              ...(d.fee.floor == null ? [{ label: "The least the fee may be", value: <span className="flex flex-wrap items-center gap-2"><Badge tone="warn">Not set</Badge><span className="text-[12.5px] text-ink-3">Blocks publishing.</span></span> }] : []),
              ...(d.items.closingTimeReason ? [{ label: "Why the closing time differs", value: d.items.closingTimeReason }] : []),
              { label: "Special permission", value: d.items.specialPermissionOffered === "yes" ? "Offered" : d.items.specialPermissionOffered === "no" ? "Not offered" : <span className="text-ink-3">Not stated: none is granted on this exercise</span> },
              ...(d.registrations.length ? [{ label: `Registrations asked of a ${d.bid.bidder}`, value: d.registrations.join("; ") }] : []),
            ]}
          />
        </CardBody>
      )}
      {d.hasWindow && (
        <div className="border-t border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
            <div>
              <p className="text-[13.5px] font-semibold text-ink">What a set costs to make</p>
              
            </div>
            <FeeLineDrawer exerciseId={c.exerciseId} allowed={d.actions.save} kinds={FEE_COST_KINDS.map((k) => ({ value: k, label: FEE_COST_KIND_LABEL[k] }))} />
          </div>
          {d.fee.basis.length === 0 ? (
            <p className="px-5 pb-4 text-[13px] text-ink-3 sm:px-6">No cost is listed: the basis is empty.</p>
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col style={{ width: "28%" }} />
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 130 }} />
                {d.actions.save.allowed && <ActionsCol labelled={2} icons={0} />}
              </colgroup>
              <THead>
                <Th>Cost</Th>
                <Th>Description</Th>
                <Th numeric>Quantity</Th>
                <Th numeric>Unit cost</Th>
                <Th numeric>Amount</Th>
                {d.actions.save.allowed && <Th className="text-right">Actions</Th>}
              </THead>
              <tbody>
                {d.fee.basis.map((l) => (
                  <Tr key={l.id}>
                    <Td label="Cost"><CellStack title={l.cost} /></Td>
                    <Td label="Description">{l.description || <span className="text-ink-3">—</span>}</Td>
                    <Td numeric label="Quantity">{l.quantity ?? "—"}</Td>
                    <Td numeric label="Unit cost">{l.unitCost ?? "—"}</Td>
                    <Td numeric label="Amount"><span className="font-semibold">{l.amount}</span></Td>
                    {d.actions.save.allowed && <Td>
                      <RowActions>
                        {d.actions.save.allowed && <FeeLineDrawer exerciseId={c.exerciseId} allowed={d.actions.save} kinds={FEE_COST_KINDS.map((k) => ({ value: k, label: FEE_COST_KIND_LABEL[k] }))} line={{ id: l.id, label: l.cost, values: l.raw }} />}
                        {d.actions.save.allowed && <RemoveFeeLineDrawer exerciseId={c.exerciseId} lineId={l.id} label={l.cost} />}
                      </RowActions>
                    </Td>}
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="border-t border-line px-5 py-3 text-[13px] text-ink-2 sm:px-6">
            The basis comes to <span className="font-semibold tabular-nums">{d.fee.basisTotal}</span>.
          </p>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ invitees and letters

/// 6.8 (E-2): the evaluation model, chosen here and pinned by the publication.
function EvaluationModelCard({ d, c }: { d: WindowTab; c: WindowContext }) {
  const e = d.evaluation;
  return (
    <Card>
      <CardHeader
        icon={<SlidersIcon size={17} />}
        title="Evaluation model"
        subtitle={e.pinned ? "Pinned when published." : "Pinned when published."}
        actions={e.pinned ? <Badge tone="ok">Pinned</Badge> : <ChooseEvaluationModelDrawer exerciseId={c.exerciseId} allowed={e.choose} models={e.options} current={e.current} />}
      />
      <CardBody className="flex flex-col gap-3">
        {e.before ? (
          <Callout tone="warn">{e.before}</Callout>
        ) : (
          <KeyValues
            columns={3}
            items={[
              { label: "Model", value: e.model ? e.model.name : <Badge tone="warn">Not chosen</Badge> },
              { label: "Its route", value: e.model?.route ?? "—" },
              { label: "The contract basis's route", value: e.basisRoute },
              ...(e.pinned ? [{ label: "Pinned", value: e.pinned }] : []),
            ]}
          />
        )}
        {!e.pinned && !e.before && e.suggested && <p className="text-[12.5px] text-ink-3">{e.suggested}</p>}
        {!e.pinned && !e.before && e.choose.allowed && e.options.length === 0 && <p className="text-[12.5px] text-ink-3">No issued model fits this basis. Issue one under Evaluation models.</p>}
      </CardBody>
    </Card>
  );
}

function InviteesCard({ d, c }: { d: WindowTab; c: WindowContext }) {
  const inv = d.invitees;
  if (!inv) return null;
  const frozen = !inv.edit.allowed;
  const hasRoute = !!inv.nameRoute && inv.approved != null;
  const letters = inv.proposed.filter((p) => p.letter);
  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Invitees and letters of invitation"
          subtitle={frozen ? "Frozen: invited. Cancel and replace to change." : "Name approved for exactly this list"}
          actions={frozen ? undefined : <ProposeInviteeDrawer exerciseId={c.exerciseId} allowed={inv.edit} withdrawsRoute={hasRoute} />}
          divided={inv.proposed.length === 0}
        />
        {inv.proposed.length === 0 ? (
          <EmptyState size="sm" title="Nobody proposed" />
        ) : (
          <Table minWidth={720}>
            <colgroup>
              <col />
              <col style={{ width: 200 }} />
              <col style={{ width: "26%" }} />
              <ActionsCol labelled={2} icons={0} />
            </colgroup>
            <THead>
              <Th>Contractor</Th>
              <Th>On the approved list</Th>
              <Th>Letter of invitation</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {inv.proposed.map((p) => (
                <Tr key={p.id}>
                  <Td label="Contractor"><CellStack title={p.name} sub={p.registrationNo} /></Td>
                  <Td label="On the approved list">
                    {p.onApprovedList == null ? <Chip tone="neutral">No list approved yet</Chip> : p.onApprovedList ? <Chip tone="ok">On the approved list</Chip> : <Chip tone="warn">Not on the approved list</Chip>}
                  </Td>
                  <Td label="Letter of invitation">
                    {p.letter ? <span className="flex flex-col gap-0.5 text-[13px]"><span>Frozen {p.letter.frozenOn}</span><span className="text-ink-3">{p.letter.sentOn === "Not recorded" ? "Delivery not recorded" : `Sent ${p.letter.sentOn}, ${p.letter.sentBy.toLowerCase()}`}</span></span> : <span className="text-ink-3">Not issued</span>}
                  </Td>
                  <Td>
                    <RowActions>
                      {p.letter ? (
                        <LetterDeliveryDrawer exerciseId={c.exerciseId} id={p.letter.id} who={p.name} values={p.letter.raw} />
                      ) : (
                        !frozen && <RemoveInviteeDrawer exerciseId={c.exerciseId} partyId={p.id} name={p.name} withdrawsRoute={hasRoute} />
                      )}
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {letters.length > 0 && (
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3 sm:px-6">
            Frozen when issued. Not emailed.
          </p>
        )}
      </Card>
      <Card>
        <CardHeader
          icon={<RouteIcon size={17} />}
          title="The name, and the list it was approved for"
          subtitle={inv.nameRoute ? `Name approval: ${inv.nameRoute.label}. ${inv.nameRoute.listState}` : "The name has not been sent for approval."}
          actions={<ButtonLink href={`/sourcing/${c.exerciseId}?tab=name`} variant="secondary" size="sm">Open the name approval</ButtonLink>}
        />
        {inv.approved && inv.approved.length > 0 && (
          <CardBody>
            <ul className="flex flex-col gap-1 text-[13.5px]">
              {inv.approved.map((a) => (
                <li key={a.registrationNo} className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{a.name}</span>
                  <span className="text-ink-3">{a.registrationNo}</span>
                  {!a.stillProposed && <Chip tone="warn">No longer proposed</Chip>}
                </li>
              ))}
            </ul>
          </CardBody>
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ closing, changes and the route

function ClosingCard({ d, c, latest, earlier }: { d: WindowTab; c: WindowContext; latest: Route | null; earlier: Route[] }) {
  const nothing = d.history.length === 0 && d.changes.length === 0 && d.cancellations.length === 0 && !latest;
  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader icon={<ClockIcon size={17} />} title="The closing, and its changes" subtitle="Set at approval, with every change since." divided={nothing} />
        {nothing ? (
          <EmptyState size="sm" title="Closing not set" />
        ) : (
          <>
            {d.history.length > 0 && (
              <ol className="divide-y divide-line/70">
                {d.history.map((h, i) => (
                  <li key={i} className="flex flex-col gap-0.5 px-5 py-3 text-[13.5px] sm:px-6">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{h.closing}</span>
                      {h.stands && <Chip tone="brand">Stands now</Chip>}
                      <span className="text-ink-3">{h.what}</span>
                    </span>
                    <span className="text-[12.5px] break-words text-ink-3">
                      {h.on !== "Not set" ? `Recorded ${h.on}` : ""}
                      {h.lastDayOfSale ? ` · last day of sale ${h.lastDayOfSale}` : ""}
                      {h.reason ? ` · “${h.reason}”` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {d.changes.map((ch) => (
              <div key={ch.id} className="border-t border-line">
                <div className="flex flex-col gap-0.5 px-5 py-3 text-[13.5px] sm:px-6">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{ch.kind}</span>
                    <Badge tone={ch.state.startsWith("Applied") ? "ok" : ch.state.startsWith("Not made") ? "err" : "brand"}>{ch.state}</Badge>
                  </span>
                  <span className="text-[12.5px] break-words text-ink-3">{`${ch.from} → ${ch.to}${ch.lastDayOfSale ? ` · last day of sale ${ch.lastDayOfSale}` : ""} · “${ch.reason}”`}</span>
                </div>
                {ch.notices.length > 0 && (
                  <DeliveryList
                    caption="Purchasers told of the extension. Not emailed."
                    items={ch.notices.map((n) => ({ id: n.id, who: n.recipient, delivery: n, action: <NoticeDeliveryDrawer exerciseId={c.exerciseId} id={n.id} who={n.recipient} what="notice of the extension" values={n.raw} /> }))}
                  />
                )}
              </div>
            ))}
            {d.cancellations.map((x) => (
              <div key={x.id} className="border-t border-line">
                <div className="flex flex-col gap-0.5 px-5 py-3 text-[13.5px] sm:px-6">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">Cancellation of the exercise</span>
                    <Badge tone={x.state.startsWith("Applied") ? "neutral" : x.state.startsWith("Not made") ? "err" : "brand"}>{x.state}</Badge>
                  </span>
                  <span className="text-[12.5px] break-words text-ink-3">{`“${x.reason}” · fees refunded: ${x.feesRefunded}`}</span>
                </div>
                {x.notices.length > 0 && (
                  <DeliveryList
                    caption="Holders told of the cancellation. Not emailed."
                    items={x.notices.map((n) => ({ id: n.id, who: n.recipient, delivery: n, action: <NoticeDeliveryDrawer exerciseId={c.exerciseId} id={n.id} who={n.recipient} what="notice of the cancellation" values={n.raw} /> }))}
                  />
                )}
              </div>
            ))}
          </>
        )}
        {(latest || earlier.length > 0) && (
          <div className="flex flex-col gap-3 border-t border-line p-4 sm:p-5">
            {latest && (
              <Accordion title="Approval of the change" meta={changeRouteLabel(latest.status, latest.warnings)} defaultOpen={latest.status === "PENDING"}>
                <ChangeRouteCard c={c} inst={latest} />
              </Accordion>
            )}
            {earlier.length > 0 && (
              <Accordion title="Earlier routes" meta={`${earlier.length} kept on record`}>
                <ul className="divide-y divide-line/70">
                  {earlier.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] sm:px-6">
                      <Badge tone={routeTone(e.status)}>{changeRouteLabel(e.status, e.warnings)}</Badge>
                      <span className="text-ink-2">
                        {routedOnLabel(e.cond, "exercise")} · asked {formatDate(e.openedAt)} · {e.steps.map((s) => s.roleLabel).join(" → ")}
                        {e.rejectionReason ? ` · “${e.rejectionReason}”` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Accordion>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

/// A window change's route in words: refused means the change was not made, and may be asked for again.
function changeRouteLabel(status: string, warnings: unknown): string {
  if (status === "PENDING") return "With approval";
  if (status === "REJECTED") return "Refused";
  if (status === "APPROVED") return Array.isArray(warnings) && warnings.some((w) => (w as { code?: string })?.code === "CHANGE_NOT_APPLIED") ? "Approved, not applied" : "Approved";
  return "Withdrawn";
}

/// The route of a change to the window, as every exercise route reads: its rule, its steps, what happens if it is refused.
function ChangeRouteCard({ c, inst }: { c: WindowContext; inst: Route }) {
  const warnings = ((inst.warnings as { code?: string; level: string; messageEn: string }[]) ?? []).filter((w) => !(inst.checkedAgainstMatrix && w.code && (w.code === "CORE_AS_ENTERED" || w.code === "CORE_NOT_CHECKED")));
  const what = routedOnLabel(inst.cond, "exercise").toLowerCase();
  return (
    <div>
      <CardHeader
        icon={<RouteIcon size={17} />}
        title="Approval of the change"
        subtitle={`Asked ${formatDate(inst.openedAt)} · ${inst.matrixLabel ?? "Issue no longer on file"}`}
        actions={<Badge tone={inst.status === "REJECTED" ? "warn" : routeTone(inst.status)}>{changeRouteLabel(inst.status, inst.warnings)}</Badge>}
      />
      <CardBody className="flex flex-col gap-4">
        <KeyValues
          columns={2}
          items={[
            { label: "Rule", value: inst.ruleLabel ? `${inst.ruleLabel}${inst.ruleClause ? ` · ${inst.ruleClause}` : ""}` : "Not recorded" },
            { label: "Asked for", value: routedOnLabel(inst.cond, "exercise") },
          ]}
        />
        {warnings.map((w, i) => (
          <Callout key={i} tone={levelTone(w.level === "err" ? "block" : w.level)}>
            {w.messageEn}
          </Callout>
        ))}
      </CardBody>
      {inst.status === "PENDING" && <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">If refused, the change is not made.</p>}
      {inst.status === "REJECTED" && (
        <div className="border-t border-line px-5 py-3 sm:px-6">
          <Callout tone="warn" title="Refused: the change was not made">
            {inst.rejectionReason || "No reason recorded."} It may be asked for again.
          </Callout>
        </div>
      )}
      {inst.checkedAgainstMatrix && (
        <p className="border-t border-line px-5 py-2.5 text-[12.5px] break-words text-ink-3 sm:px-6">
          Chain beneath the approver: {routeCoreText(inst, () => ({ en: "an office no longer configured" })).en}
        </p>
      )}
      <RouteSteps
        inst={inst}
        stepLabel={(x) => DECISION_LABEL[x]}
        stepTone={stepTone}
        action={(s, { earlierDone }) => (
          <>
            {inst.status === "PENDING" && s.decision === "PENDING" && !s.committeeCode && s.roleCode && (
              <EscalateDrawer stepId={s.id} office={s.actingRoleLabel ?? s.roleLabel} mandatory={isMandatoryAct(s.act)} people={c.suggestions(s.actingRoleCode ?? s.roleCode)} />
            )}
            {inst.status === "PENDING" && s.decision === "PENDING" && earlierDone && !s.committeeCode && (
              <WindowDecisionDrawer exerciseId={c.exerciseId} stepId={s.id} office={s.roleLabel} done={ACT_DONE_LABEL[s.act] ?? "Done"} people={c.suggestions(s.actingRoleCode ?? s.roleCode)} today={c.today} what={what} />
            )}
          </>
        )}
      />
    </div>
  );
}
