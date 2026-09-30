import { loadDocumentClasses } from "@/lib/records/load";
import { ORGANISATION_CODE } from "@/lib/org";

import { ProvenanceChip, Section, Stat, Stats } from "../records-ui";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { AddDocumentClass, EditDocumentClass } from "./editors";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { HistoryButton } from "@/components/history-drawer";

export const dynamic = "force-dynamic";

export default async function DocumentsConfigPage() {
  const classes = await loadDocumentClasses(ORGANISATION_CODE);
  const unset = classes.filter((c) => c.retentionMonths == null);

  return (
    <>
      <PageHeader
        title="Documents"
        badge={
          unset.length > 0 ? (
            <Badge tone="warn" dot>
              {unset.length === 1
                ? "1 class without a retention period"
                : `${unset.length} classes without a retention period`}
            </Badge>
          ) : undefined
        }
        subtitle="Classification, retention and controlled-copy rules."
      />

      <Stats>
        <Stat
          label="Classes"
          value={classes.length === 0 ? null : classes.length}
          hint={classes.length === 0 ? "Nobody has classified anything yet" : "In use"}
        />
        <Stat
          label="Retention set"
          value={classes.length === 0 ? null : `${classes.length - unset.length} / ${classes.length}`}
          warn={unset.length > 0}
          hint={
            unset.length > 0
              ? "An unset period is not a period of zero"
              : "Every class says how long to keep it"
          }
        />
        <Stat
          label="Controlled copy"
          value={classes.length === 0 ? null : classes.filter((c) => c.controlledCopy).length}
          hint="Numbered on issue and recalled"
        />
      </Stats>

      <Section
        title="Document classes"
        blurb="What a document is, who may hold it, and how long it must survive."
        empty="No document class has been set. Until one is, nothing the portal issues or receives can be classified, retained or recalled."
        count={classes.length}
        action={<AddDocumentClass />}
      >
        <Table>
          <colgroup>
            <col />
            <col style={{ width: "14%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "12%" }} />
            <ActionsCol icons={2} />
          </colgroup>
          <THead>
            <Th>Class</Th>
            <Th>Keep for</Th>
            <Th>Controlled copy</Th>
            <Th>Release</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {classes.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <CellStack title={c.nameEn} sub={c.nameMs ?? undefined} />
                </Td>
                <Td>
                  {c.retentionMonths == null ? (
                    <Badge tone="warn">Not set</Badge>
                  ) : (
                    `${c.retentionMonths} months`
                  )}
                </Td>
                <Td className="text-ink-2">{c.controlledCopy ? "Numbered and recalled" : "No"}</Td>
                <Td className="text-ink-2">
                  {c.releaseNeedsApproval ? "Needs approval" : "No approval needed"}
                </Td>
                <Td>
                  <ProvenanceChip value={c.provenance} />
                </Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="DocumentClass" entityId={c.id} label={c.nameEn} />
                    <EditDocumentClass row={c} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  );
}
