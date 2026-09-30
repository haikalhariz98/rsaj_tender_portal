import { ChevronRight } from "@/components/icons";
import { listCommittees } from "@/lib/committee/repo";
import { formatBand } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Chip, type Tone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";

import { Stat, Stats } from "../records-ui";
import { AddCommittee, EditCommittee } from "./editors";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  APPROVES: "Approves",
  RECOMMENDS: "Recommends",
  CONSENTS: "Consents",
  DECIDES: "Decides",
};

const ACTION_TONE: Record<string, Tone> = {
  APPROVES: "ok",
  RECOMMENDS: "info",
  CONSENTS: "warn",
  DECIDES: "brand",
};

export default async function CommitteesPage() {
  const committees = await listCommittees();

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
          actions={<AddCommittee />}
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
                <col style={{ width: "30%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "19%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
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
                    <Td>
                      <CellStack
                        title={
                          <span className="inline-flex max-w-full items-center gap-2" title={c.nameEn}>
                            <span className="truncate">{c.nameEn}</span>
                            {c.isExternal && <Badge outline>external</Badge>}
                          </span>
                        }
                        sub={c.nameMs ? <span title={c.nameMs}>{c.nameMs}</span> : undefined}
                      />
                    </Td>
                    <Td>
                      <Chip tone={ACTION_TONE[c.action] ?? "neutral"}>
                        {ACTION_LABEL[c.action] ?? c.action}
                      </Chip>
                    </Td>
                    <Td className="text-[13px] text-ink-3">
                      {formatBand(c.valueScopeMin, c.valueScopeMax)}
                    </Td>
                    <Td>
                      {c.quorum != null ? (
                        <Badge tone="ok">{c.quorum} members</Badge>
                      ) : (
                        <Badge tone="warn">Not stated</Badge>
                      )}
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
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
                        <EditCommittee committee={c} />
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
    </>
  );
}
