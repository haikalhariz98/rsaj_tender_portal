import { ChevronRight } from "@/components/icons";
import { listCommittees, listNotApprovedOutcomes } from "@/lib/committee/repo";
import { COMMITTEE_ACTION_LABEL, NOT_APPROVED_KIND_LABEL } from "@/lib/committee/labels";
import { loadRoster } from "@/lib/people/load";
import { formatBand } from "@/lib/format";
import { LOOP_KEY_LABEL, loopKeyState, type LoopStageKey } from "@/lib/evaluation/loop";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Chip, type Tone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { RuleInfo } from "@/components/ui/rule-info";
import { SettingValue } from "@/components/setup/setting-value";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";

import {
  AddCommittee,
  AddNotApprovedOutcome,
  EditCommittee,
  EditNotApprovedOutcome,
  RetireNotApprovedOutcome,
} from "./editors";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Committees" };

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
  const liveOutcomes = outcomes.filter((o) => o.retiredOn == null || o.retiredOn > now).length;
  const committeeOptions = committees.map((c) => ({ id: c.id, nameEn: c.nameEn }));

  return (
    <>
      <PageHeader
        title="Committees"
        info={{ title: "Committees", text: "Who sits, how many make a quorum, and the decisions each committee may take." }}
        actions={<AddCommittee offices={offices} />}
      />

      <Card className="mb-6 overflow-hidden">
        {committees.length === 0 ? (
          <EmptyState title="No committee set" />
        ) : (
          <Table minWidth={820}>
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
              <Th>Decision</Th>
              <Th>Value scope</Th>
              <Th>Quorum</Th>
              <Th>Members</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {committees.map((c) => (
                <Tr key={c.code}>
                  <Td label="Committee">
                    <CellStack
                      title={c.nameEn}
                      aside={
                        <>
                          {c.isExternal && <Badge outline>external</Badge>}
                          {c.retiredOn && c.retiredOn <= now && <Badge>no longer used</Badge>}
                        </>
                      }
                    />
                  </Td>
                  <Td label="Decision">
                    <Chip tone={ACTION_TONE[c.action] ?? "neutral"}>{COMMITTEE_ACTION_LABEL[c.action] ?? c.action}</Chip>
                  </Td>
                  <Td label="Value scope" className="text-[13px] text-ink-3">
                    {formatBand(c.valueScopeMin, c.valueScopeMax)}
                  </Td>
                  <Td label="Quorum">
                    <SettingValue
                      value={
                        c.quorum != null ? (
                          <span className="inline-flex items-center gap-1">
                            {c.quorum} members
                            <RuleInfo label={`The rule behind the quorum of ${c.nameEn}`} rule={`${c.quorum} members are needed for ${c.nameEn} to decide.`} source={c.quorumProvenance} />
                          </span>
                        ) : null
                      }
                      unset="Sittings cannot be certified quorate."
                    />
                  </Td>
                  <Td label="Members">
                    {c.compositionProvenance != null ? (
                      <span className="inline-flex items-center gap-1 text-[13px]">
                        {c.seatCount} seats
                        <RuleInfo label={`The rule behind the members of ${c.nameEn}`} rule={`Who sits on ${c.nameEn}.`} source={c.compositionProvenance} />
                      </span>
                    ) : (
                      <SettingValue value={null} unset="No members are defined yet." />
                    )}
                  </Td>
                  <Td>
                    <RowActions>
                      <EditCommittee committee={c} offices={offices} />
                      <ButtonLink href={`/configuration/committees/${c.code}`} variant="ghost" size="sm">
                        Open
                        <ChevronRight size={14} />
                      </ButtonLink>
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Disclosure id="not-approved-outcomes" title="Advanced" summary={`${liveOutcomes} not-approved ${liveOutcomes === 1 ? "outcome" : "outcomes"}`}>
        <Card className="overflow-hidden">
          <CardHeader
            title="Not-approved outcomes"
            subtitle="Next step for a rejected item"
            actions={<AddNotApprovedOutcome committees={committeeOptions} />}
            divided={outcomes.length === 0}
          />
          {outcomes.length === 0 ? (
            <EmptyState title="No not-approved outcome set" />
          ) : (
            <Table minWidth={720}>
              <colgroup>
                <col />
                <col style={{ width: "26%" }} />
                <col style={{ width: "20%" }} />
                <ActionsCol icons={0} labelled={2} />
              </colgroup>
              <THead>
                <Th>Outcome</Th>
                <Th>What it does</Th>
                <Th>Offered to</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {outcomes.map((o) => {
                  const retired = o.retiredOn != null && o.retiredOn <= now;
                  return (
                    <Tr key={o.id}>
                      <Td label="Outcome">
                        <CellStack
                          title={o.nameEn}
                          aside={
                            <>
                              {retired && <Badge>no longer used</Badge>}
                              {o._count.decisions > 0 && <InfoChip outline detail="Cited by recorded decisions. Stop using it and add a new one.">In use</InfoChip>}
                            </>
                          }
                        />
                      </Td>
                      <Td label="What it does">
                        <Chip tone={o.kind === "LOOP" ? "info" : "warn"}>{NOT_APPROVED_KIND_LABEL[o.kind]}</Chip>
                        {o.kind === "LOOP" && <ReturnsTo kind={o.kind} stage={o.returnsToStage} />}
                      </Td>
                      <Td label="Offered to" className="text-[13px] text-ink-3">{o.committee?.nameEn ?? "Every committee"}</Td>
                      <Td>
                        <RowActions>
                          {o._count.decisions === 0 && <EditNotApprovedOutcome outcome={o} committees={committeeOptions} />}
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
      </Disclosure>
    </>
  );
}

/// 6.8 (E-8): where a return goes, by label; a stage typed before the evaluation existed is warned of, and opens nothing.
function ReturnsTo({ kind, stage }: { kind: "LOOP" | "TERMINAL"; stage: string | null }) {
  const state = loopKeyState(kind, stage);
  if (state === "KEY") return <p className="mt-1 text-[12.5px] text-ink-3">{LOOP_KEY_LABEL[stage as LoopStageKey]}</p>;
  // 0005 R15, 2026-10-20: one chip; the long sentence is its detail.
  if (state === "NONE") return <p className="mt-1"><InfoChip detail="No stage of the evaluation is chosen. Edit it to choose one.">Opens nothing</InfoChip></p>;
  return (
    <p className="mt-1">
      <InfoChip tone="warn" detail="Typed before the evaluation existed. Edit it to choose a stage.">Opens nothing</InfoChip>
    </p>
  );
}
