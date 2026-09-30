import { loadDocumentClasses, loadTemplates } from "@/lib/records/load";
import { ORGANISATION_CODE } from "@/lib/org";

import { ProvenanceChip, Section, Stat, Stats } from "../records-ui";
import { CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { AddTemplate, EditTemplate } from "./editors";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { HistoryButton } from "@/components/history-drawer";

export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function TemplatesPage() {
  const [templates, classes] = await Promise.all([
    loadTemplates(ORGANISATION_CODE),
    loadDocumentClasses(ORGANISATION_CODE),
  ]);
  const unclassified = templates.filter((t) => t.documentClassId == null);

  return (
    <>
      <PageHeader
        title="Templates"
        badge={
          unclassified.length > 0 ? (
            <Badge tone="warn" dot>
              {unclassified.length === 1 ? "1 unclassified" : `${unclassified.length} unclassified`}
            </Badge>
          ) : undefined
        }
        subtitle="The certificates, letters and routing sheets the portal issues."
      />

      <Stats>
        <Stat
          label="Templates"
          value={templates.length === 0 ? null : templates.length}
          hint={templates.length === 0 ? "Nothing is issued yet" : "Available to issue"}
        />
        <Stat
          label="Classified"
          value={
            templates.length === 0
              ? null
              : `${templates.length - unclassified.length} / ${templates.length}`
          }
          warn={unclassified.length > 0}
          hint={
            unclassified.length > 0
              ? "An unclassified template has no retention rule"
              : "Every template has a class"
          }
        />
        <Stat
          label="Bilingual"
          value={templates.length === 0 ? null : templates.filter((t) => t.bilingual).length}
          hint="Both languages on one page"
        />
      </Stats>

      <Section
        title="Templates"
        blurb="A generated form has to stand next to the printed one it replaces, so each carries its form code and revision."
        empty="No template has been set. Nothing can be issued until one exists."
        count={templates.length}
        action={<AddTemplate classes={classes} />}
      >
        <Table>
          <colgroup>
            <col style={{ width: "26%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <THead>
            <Th>Template</Th>
            <Th>Form code</Th>
            <Th>Revision</Th>
            <Th>Class</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {templates.map((t) => {
              const cls = classes.find((c) => c.id === t.documentClassId);
              return (
                <Tr key={t.id}>
                  <Td title={t.nameMs ? `${t.nameEn} — ${t.nameMs}` : t.nameEn}>
                    <CellStack
                      title={
                        <>
                          {t.nameEn}
                          {t.bilingual && (
                            <Badge outline className="ml-2 align-middle">
                              bilingual
                            </Badge>
                          )}
                        </>
                      }
                      sub={t.nameMs ?? undefined}
                    />
                  </Td>
                  <Td className="truncate font-mono text-[12.5px] text-ink-2" title={t.formCode || undefined}>
                    {t.formCode || "—"}
                  </Td>
                  <Td className="text-ink-2 tabular-nums">{day(t.revisionDate)}</Td>
                  <Td className="truncate" title={cls?.nameEn}>
                    {cls ? cls.nameEn : <Badge tone="warn">Not classified</Badge>}
                  </Td>
                  <Td>
                    <ProvenanceChip value={t.provenance} />
                  </Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="DocumentTemplate" entityId={t.id} label={t.nameEn} />
                      <EditTemplate row={t} classes={classes} />
                    </RowActions>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Section>
    </>
  );
}
