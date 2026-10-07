import { ChevronRight } from "@/components/icons";
import { listCommittees, listNotApprovedOutcomes } from "@/lib/committee/repo";
import { COMMITTEE_ACTION_LABEL, NOT_APPROVED_KIND_LABEL } from "@/lib/committee/labels";
import { loadRoster } from "@/lib/people/load";
import { formatBand } from "@/lib/format";
import { LOOP_KEY_LABEL, loopKeyState, type LoopStageKey } from "@/lib/evaluation/loop";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Chip, type Tone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";

import { Stat, Stats } from "../records-ui";
import {
  AddCommittee,
  AddNotApprovedOutcome,
  EditCommittee,
  EditNotApprovedOutcome,
  RetireNotApprovedOutcome,
} from "./editors";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

const ACTION_LABEL = COMMITTEE_ACTION_LABEL;

const ACTION_TONE: Record<string, Tone> = {
  APPROVES: "ok",
  RECOMMENDS: "info",
  CONSENTS: "warn",
  DECIDES: "brand",
};

export default async function CommitteesPage() {
  const actor = await requireStaff();
  const [committees, outcomes, roster] = await Promise.all([
    listCommittees(actor.organisationId),
    listNotApprovedOutcomes(actor.organisationId),
    loadRoster(actor.organisationCode),
  ]);
  const offices = roster.offices.filter((o) => !o.isCommittee).map((o) => ({ code: o.code, nameEn: o.nameEn }));
  const now = new Date();
  const liveOutcomes = outcomes.filter((o) => o.retiredOn == null || o.retiredOn > now);

  const quorumStated = committees.filter((c) => c.quorum != null).length;
  const compositionUnknown = committees.filter((c) => c.compositionProvenance == null).length;

  return (
    <>
      <PageHeader
        title="Committees"
        badge={<Badge outline>{committees.length}</Badge>}
        subtitle="Membership, quorum and the decisions each body may take."
      />

      <Stats>
        <Stat
          label="Bodies configured"
          value={committees.length}
          hint={`${committees.filter((c) => c.isExternal).length} external`}
        />
        <Stat
          label="Quorum set"
          value={`${quorumStated} / ${committees.length}`}
          warn={quorumStated < committees.length || committees.length === 0}
          hint={
            committees.length === 0
              ? "No body is configured yet"
              : quorumStated === committees.length
                ? "Every body can be certified quorate"
                : `${committees.length - quorumStated} cannot be certified quorate`
          }
        />
        <Stat
          label="Membership not set"
          value={compositionUnknown}
          warn={compositionUnknown > 0}
          hint={
            compositionUnknown === 0
              ? "Every body's membership is traced to a source"
              : "No members defined in policy or in practice"
          }
        />
      </Stats>

      <Card className="mb-6 overflow-hidden">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              Bodies
              {committees.length > 0 && <Badge outline>{committees.length}</Badge>}
            </span>
          }
          subtitle="Who sits, how many must be present, and what each body may decide."
          actions={<AddCommittee offices={offices} />}
          divided={committees.length === 0}
        />
        {committees.length === 0 ? (
          <EmptyState title="Not set">
            No committee has been configured. Until one is, no matter can be routed to a body
            that must sit before it is decided.
          </EmptyState>
        ) : (
          <>
            <Table minWidth={860}>
              <colgroup>
                <col />
                <col style={{ width: "16%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <ActionsCol icons={1} labelled={1} />
              </colgroup>
              <THead>
                <Th>Committee</Th>
                <Th>Acts by</Th>
                <Th>Value scope</Th>
                <Th>Quorum</Th>
                <Th>Composition</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {committees.map((c) => (
                  <Tr key={c.code}>
                    <Td label="Committee">
                      <CellStack
                        title={
                          <span className="inline-flex max-w-full items-center gap-2" title={c.nameEn}>
                            <span className="truncate">{c.nameEn}</span>
                            {c.isExternal && <Badge outline>external</Badge>}
                            {c.retiredOn && c.retiredOn <= now && <Badge>retired</Badge>}
                          </span>
                        }
                        sub={c.nameMs ? <span title={c.nameMs}>{c.nameMs}</span> : undefined}
                      />
                    </Td>
                    <Td label="Acts by">
                      <Chip tone={ACTION_TONE[c.action] ?? "neutral"}>
                        {ACTION_LABEL[c.action] ?? c.action}
                      </Chip>
                    </Td>
                    <Td label="Value scope" className="text-[13px] text-ink-3">
                      {formatBand(c.valueScopeMin, c.valueScopeMax)}
                    </Td>
                    <Td label="Quorum">
                      {c.quorum != null ? (
                        <Badge tone="ok">{c.quorum} members</Badge>
                      ) : (
                        <Badge tone="warn">Not set</Badge>
                      )}
                    </Td>
                    <Td label="Composition">
                      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <ProvenanceBadge value={c.compositionProvenance} />
                        {c.compositionProvenance != null && (
                          <span className="text-[12px] whitespace-nowrap text-ink-3">
                            {c.seatCount} seats
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td>
                      <RowActions>
                        <EditCommittee committee={c} offices={offices} />
                        <ButtonLink
                          href={`/configuration/committees/${c.code}`}
                          variant="ghost"
                          size="sm"
                        >
                          Open
                          <ChevronRight size={14} />
                        </ButtonLink>
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <CardFooter className="text-[12.5px] text-ink-3">
              <span>
                {committees.length} bodies ·{" "}
                {committees.reduce((n, c) => n + c.meetingCount, 0)} recorded sittings
              </span>
            </CardFooter>
          </>
        )}
      </Card>

      <Card id="not-approved-outcomes" className="mb-6 scroll-mt-6 overflow-hidden">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              Not-approved outcomes
              {liveOutcomes.length > 0 && <Badge outline>{liveOutcomes.length}</Badge>}
            </span>
          }
          subtitle="What a matter voted down does next. A matter not carried must name one."
          actions={<AddNotApprovedOutcome committees={committees.map((c) => ({ id: c.id, nameEn: c.nameEn }))} />}
          divided={outcomes.length === 0}
        />
        {outcomes.length === 0 ? (
          <EmptyState title="Not set">
            No not-approved outcome is configured, so a matter a committee votes down cannot be recorded, and
            the sitting that heard it cannot be minuted. None is shipped: which outcomes exist is your
            organisation&apos;s policy.
          </EmptyState>
        ) : (
          <Table minWidth={760}>
            <colgroup>
              <col />
              <col style={{ width: "22%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "12%" }} />
              <ActionsCol icons={1} labelled={1} />
            </colgroup>
            <THead>
              <Th>Outcome</Th>
              <Th>What it does</Th>
              <Th>Offered to</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {outcomes.map((o) => {
                const retired = o.retiredOn != null && o.retiredOn <= now;
                return (
                  <Tr key={o.id}>
                    <Td label="Outcome">
                      <CellStack
                        title={
                          <span className="inline-flex max-w-full items-center gap-2">
                            <span className="truncate">{o.nameEn}</span>
                            {retired && <Badge>retired</Badge>}
                          </span>
                        }
                        sub={o.nameMs ?? undefined}
                      />
                    </Td>
                    <Td label="What it does">
                      <Chip tone={o.kind === "LOOP" ? "info" : "warn"}>{NOT_APPROVED_KIND_LABEL[o.kind]}</Chip>
                      {o.kind === "LOOP" && <ReturnsTo kind={o.kind} stage={o.returnsToStage} />}
                    </Td>
                    <Td label="Offered to" className="text-[13px] text-ink-3">{o.committee?.nameEn ?? "Every committee"}</Td>
                    <Td label="Source">
                      <ProvenanceBadge value={o.provenance} />
                    </Td>
                    <Td>
                      <RowActions>
                        {o._count.decisions > 0 ? (
                          <span
                            className="text-[12px] whitespace-nowrap text-ink-3"
                            title="Recorded decisions cite this outcome, so it cannot be changed. Retire it and add a new one."
                          >
                            In use
                          </span>
                        ) : (
                          <EditNotApprovedOutcome
                            outcome={o}
                            committees={committees.map((c) => ({ id: c.id, nameEn: c.nameEn }))}
                          />
                        )}
                        {!retired && <RetireNotApprovedOutcome id={o.id} label={o.nameEn} />}
                      </RowActions>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

/// 6.8 (E-8): where a return goes, by label; a stage typed before the evaluation existed is warned of, and opens nothing.
function ReturnsTo({ kind, stage }: { kind: "LOOP" | "TERMINAL"; stage: string | null }) {
  const state = loopKeyState(kind, stage);
  if (state === "KEY") return <p className="mt-1 text-[12.5px] text-ink-3">{LOOP_KEY_LABEL[stage as LoopStageKey]}</p>;
  if (state === "NONE") return <p className="mt-1 text-[12.5px] text-ink-3">To no stage of the evaluation: it opens nothing.</p>;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
      <Badge tone="warn">Typed before</Badge>
      <span>A stage typed before the evaluation existed: it opens nothing. Edit it to choose one of the evaluation&apos;s stages.</span>
    </p>
  );
}
