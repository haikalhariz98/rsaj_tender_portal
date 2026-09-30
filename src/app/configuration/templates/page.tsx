import { loadDocumentClasses, loadTemplates } from "@/lib/records/load";
import { ORGANISATION_CODE } from "@/lib/org";

import { ProvenanceChip, Section, Stat } from "../records-ui";
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

      <div className="grid g3 stack--md" style={{ marginBottom: 24 }}>
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
      </div>

      <Section
        title="Templates"
        blurb="A generated form has to stand next to the printed one it replaces, so each carries its form code and revision."
        empty="No template has been set. Nothing can be issued until one exists."
        count={templates.length}
        action={<AddTemplate classes={classes} />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "26%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Template</th>
              <th>Form code</th>
              <th>Revision</th>
              <th>Class</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const cls = classes.find((c) => c.id === t.documentClassId);
              return (
                <tr key={t.id}>
                  <td>
                    <div className="cellstack">
                      <span className="cellstack__t">
                        {t.nameEn}
                        {t.bilingual && (
                          <span className="badge badge--outline" style={{ marginLeft: 8 }}>
                            bilingual
                          </span>
                        )}
                      </span>
                      {t.nameMs && <span className="cellstack__s">{t.nameMs}</span>}
                    </div>
                  </td>
                  <td className="sm mono">{t.formCode || "—"}</td>
                  <td className="sm dim">{day(t.revisionDate)}</td>
                  <td className="sm">
                    {cls ? (
                      cls.nameEn
                    ) : (
                      <span className="badge badge--warn">Not classified</span>
                    )}
                  </td>
                  <td>
                    <ProvenanceChip value={t.provenance} />
                  </td>
                  <td className="right">
                    <span className="inline-flex items-center justify-end gap-1">
  <HistoryButton iconOnly entity="DocumentTemplate" entityId={t.id} label={t.nameEn} />
  <EditTemplate row={t} classes={classes} />
</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}
