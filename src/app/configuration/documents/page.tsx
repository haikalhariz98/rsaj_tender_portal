import { loadDocumentClasses } from "@/lib/records/load";
import { ORGANISATION_CODE } from "@/lib/org";

import { ProvenanceChip, Section, Stat } from "../records-ui";
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

      <div className="grid g3 stack--md" style={{ marginBottom: 24 }}>
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
      </div>

      <Section
        title="Document classes"
        blurb="What a document is, who may hold it, and how long it must survive."
        empty="No document class has been set. Until one is, nothing the portal issues or receives can be classified, retained or recalled."
        count={classes.length}
        action={<AddDocumentClass />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "26%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Class</th>
              <th>Keep for</th>
              <th>Controlled copy</th>
              <th>Release</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="cellstack">
                    <span className="cellstack__t">{c.nameEn}</span>
                    {c.nameMs && <span className="cellstack__s">{c.nameMs}</span>}
                  </div>
                </td>
                <td className="sm">
                  {c.retentionMonths == null ? (
                    <span className="badge badge--warn">Not set</span>
                  ) : (
                    `${c.retentionMonths} months`
                  )}
                </td>
                <td className="sm dim">{c.controlledCopy ? "Numbered and recalled" : "No"}</td>
                <td className="sm dim">
                  {c.releaseNeedsApproval ? "Needs approval" : "No approval needed"}
                </td>
                <td>
                  <ProvenanceChip value={c.provenance} />
                </td>
                <td className="right">
                  <span className="inline-flex items-center justify-end gap-1">
  <HistoryButton iconOnly entity="DocumentClass" entityId={c.id} label={c.nameEn} />
  <EditDocumentClass row={c} />
</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
