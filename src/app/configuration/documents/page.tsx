import { DocumentButton } from "@/components/attachments/document-drawer";
import { HistoryButton } from "@/components/history-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { db } from "@/lib/db";
import {
  classificationLabel,
  DISPOSAL_METHOD_LABEL,
  formatBytes,
  mediaLabel,
  RETENTION_TRIGGER_LABEL,
} from "@/lib/documents/labels";
import { attentionText, classReadiness } from "@/lib/documents/readiness";
import { stagedDocuments, standingHolds, uploadContext } from "@/lib/documents/read";
import { documentOrg, loadStorePolicy } from "@/lib/documents/service";
import { classificationTone } from "@/lib/documents/views";
import { formatOrgDay } from "@/lib/format";
import { ORGANISATION_CODE } from "@/lib/org";
import { loadDocumentClasses } from "@/lib/records/load";

import { ProvenanceChip, Section, Stat, Stats } from "../records-ui";
import { AddDocumentClass, EditDocumentClass, EditStorePolicy, ReleaseHold } from "./editors";

export const dynamic = "force-dynamic";

const NOT_SET = <span className="text-ink-4">Not set</span>;

export default async function DocumentsConfigPage() {
  const org = await documentOrg();
  const [classes, upload, staged, holds, policy, officeRows] = await Promise.all([
    loadDocumentClasses(ORGANISATION_CODE),
    uploadContext(),
    stagedDocuments(),
    standingHolds(),
    org ? loadStorePolicy(org.id) : null,
    org ? db.authorityRole.findMany({ where: { organisationId: org.id, isCommittee: false }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true } }) : [],
  ]);
  const offices = officeRows.map((o) => ({ value: o.code, label: o.nameEn }));
  const officeName = (code: string | null) => (code ? (officeRows.find((o) => o.code === code)?.nameEn ?? "An office no longer configured") : null);
  const tz = org?.timeZone ?? null;
  const readiness = classReadiness(classes);
  const attention = attentionText(readiness.needAttention.length);
  const unclassified = classes.filter((c) => c.classification == null);
  const people = upload?.people.map((p) => ({ value: p.id, label: p.name })) ?? [];

  return (
    <>
      <PageHeader
        title="Documents"
        badge={
          attention ? (
            <Badge tone="warn" dot>
              {attention}
            </Badge>
          ) : undefined
        }
        subtitle="Classification, retention, upload rules and the files received."
      />

      <Stats>
        <Stat
          label="Classes"
          value={classes.length === 0 ? null : classes.length}
          hint={classes.length === 0 ? "Nobody has classified anything yet" : "In use"}
        />
        <Stat
          label="Ready to run"
          value={classes.length === 0 ? null : `${readiness.ready} / ${readiness.total}`}
          warn={readiness.ready < readiness.total}
          hint={
            readiness.ready < readiness.total
              ? "Ready needs a period and what starts it. An unset period is not a period of zero"
              : "Every class says how long to keep it and what starts the clock"
          }
        />
        <Stat
          label="Controlled copy"
          value={classes.length === 0 ? null : classes.filter((c) => c.controlledCopy).length}
          hint="Numbered on issue and recalled"
        />
      </Stats>

      {unclassified.length > 0 && (
        <Callout tone="warn" className="mb-6" title={unclassified.length === 1 ? "1 class has no classification" : `${unclassified.length} classes have no classification`}>
          A document filed under a class with no classification is listed but never opened in the portal, and nothing says how it is to be handled. Set it on the class: {unclassified.map((c) => c.nameEn).join(", ")}.
        </Callout>
      )}

      <Section
        title="Document classes"
        blurb="What a document is, how it is classified, how long it must survive and who decides its disposal."
        empty="No document class has been set. Until one is, nothing the portal issues or receives can be classified, retained or recalled, and nothing can be uploaded."
        count={classes.length}
        action={<AddDocumentClass offices={offices} />}
      >
        <Table minWidth={900} stack>
          <colgroup>
            <col />
            <col style={{ width: "11%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "9%" }} />
            <ActionsCol icons={2} />
          </colgroup>
          <THead>
            <Th>Class</Th>
            <Th>Classification</Th>
            <Th>Keep for</Th>
            <Th>Disposal</Th>
            <Th>Handling</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {classes.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <CellStack wrap title={c.nameEn} sub={c.nameMs ?? undefined} />
                </Td>
                <Td label="Classification">
                  {c.classification ? <Badge tone={classificationTone(c.classification)}>{classificationLabel(c.classification)}</Badge> : <Badge tone="warn">Not set</Badge>}
                </Td>
                <Td label="Keep for">
                  <CellStack
                    wrap
                    title={c.retentionMonths == null ? <Badge tone="warn">Not set</Badge> : `${c.retentionMonths} months`}
                    sub={c.retentionTrigger ? RETENTION_TRIGGER_LABEL[c.retentionTrigger] : "Start not set"}
                  />
                </Td>
                <Td label="Disposal">
                  <CellStack wrap title={c.disposalMethod ? DISPOSAL_METHOD_LABEL[c.disposalMethod] : NOT_SET} sub={officeName(c.disposalAuthorityRoleCode) ?? "Authority not set"} />
                </Td>
                <Td label="Handling" className="text-ink-2">
                  <CellStack wrap title={c.controlledCopy ? "Numbered and recalled" : "Not a controlled copy"} sub={c.releaseNeedsApproval ? "Release needs approval" : "No approval needed to release"} />
                </Td>
                <Td label="Source">
                  <ProvenanceChip value={c.provenance} />
                </Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="DocumentClass" entityId={c.id} label={c.nameEn} />
                    <EditDocumentClass row={c} offices={offices} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Card className="mb-6 overflow-hidden">
        <CardHeader
          title="Upload rules"
          subtitle="Which files the portal accepts and how large. Where either is not set, uploads are refused."
          actions={policy ? <EditStorePolicy policy={{ allowedMediaTypes: policy.allowedMediaTypes, maxBytes: policy.maxBytes?.toString() ?? null, provenance: policy.provenance, notes: policy.notes }} /> : undefined}
          divided
        />
        <CardBody className="flex flex-col gap-5">
          {upload && upload.refusals.length > 0 && (
            <Callout tone="warn" title="Uploads are refused until this is set">
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {upload.refusals.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Callout>
          )}
          <KeyValues
            columns={2}
            items={[
              {
                label: "Allowed types",
                value: policy && policy.allowedMediaTypes.length > 0 ? <span className="flex flex-wrap gap-1.5">{policy.allowedMediaTypes.map((t) => <Badge key={t}>{mediaLabel(t)}</Badge>)}</span> : <Badge tone="warn">Not set, uploads refused</Badge>,
              },
              {
                label: "Largest file",
                value: policy?.maxBytes != null ? `${formatBytes(policy.maxBytes)} (${policy.maxBytes.toLocaleString("en-GB")} bytes)` : <Badge tone="warn">Not set, uploads refused</Badge>,
              },
              {
                label: "Deployment's technical limit",
                value: upload?.ceiling ? (
                  <span className="flex flex-col">
                    <span>{formatBytes(upload.ceiling)}</span>
                    <span className="text-[12.5px] text-ink-3">A limit of this installation, set by whoever runs the portal. It is not a policy and cannot be raised here.</span>
                  </span>
                ) : (
                  <span className="flex flex-col">
                    <Badge tone="warn">Not set, uploads refused</Badge>
                    <span className="mt-1 text-[12.5px] text-ink-3">A limit of this installation, set by whoever runs the portal.</span>
                  </span>
                ),
              },
              {
                label: "Limit in force",
                value: upload?.cap ? `${formatBytes(upload.cap.bytes)}, from ${upload.cap.from === "CEILING" ? "the deployment's limit" : "the largest file above"}` : NOT_SET,
              },
              { label: "Where this came from", value: policy?.provenance ? <ProvenanceChip value={policy.provenance} /> : NOT_SET },
              { label: "Megabytes", value: "1 MB is 1,048,576 bytes" },
              ...(policy?.notes ? [{ label: "Notes", value: policy.notes }] : []),
            ]}
          />
          {policy?.id && (
            <div>
              <HistoryButton entity="DocumentStorePolicy" entityId={policy.id} label="Upload rules" />
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="mb-6 overflow-hidden">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              Received, not filed
              {staged.length > 0 && <Badge outline>{staged.length}</Badge>}
            </span>
          }
          subtitle="Files uploaded but not attached to any record. Nothing is deleted from here: a file stays until it is attached."
          divided={staged.length === 0}
        />
        {staged.length === 0 ? (
          <EmptyState size="sm" title="Nothing waiting">
            A file appears here when it is uploaded and then not attached, for instance because the record refused it.
          </EmptyState>
        ) : (
          <Table minWidth={760} stack>
            <colgroup>
              <col />
              <col style={{ width: "17%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "22%" }} />
              <ActionsCol icons={0} labelled={1} />
            </colgroup>
            <THead>
              <Th>Document</Th>
              <Th>Class</Th>
              <Th>Classification</Th>
              <Th>Received</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {staged.map((d) => {
                const v = d.versions[0];
                return (
                  <Tr key={d.id}>
                    <Td><CellStack wrap title={d.title} sub={v?.originalFilename} /></Td>
                    <Td label="Class" className="text-ink-2">{d.documentClass.nameEn}</Td>
                    <Td label="Classification"><Badge tone={classificationTone(d.classificationSnapshot)}>{classificationLabel(d.classificationSnapshot)}</Badge></Td>
                    <Td label="Received"><CellStack wrap title={formatOrgDay(d.createdAt, tz)} sub={v ? `${v.recordedBy.name} · recorded on behalf of, not signed` : undefined} /></Td>
                    <Td>
                      <RowActions>
                        <DocumentButton documentId={d.id} label={d.title} />
                      </RowActions>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mb-6 overflow-hidden">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              Legal holds
              {holds.length > 0 && <Badge outline>{holds.length}</Badge>}
            </span>
          }
          subtitle="A document on hold is never disposed of, whatever its retention says. A hold is placed from the document itself and released with a reason."
          divided={holds.length === 0}
        />
        {holds.length === 0 ? (
          <EmptyState size="sm" title="No legal holds">
            No document is on hold. Open a document and place one if it must be kept for a claim or an inquiry.
          </EmptyState>
        ) : (
          <Table minWidth={760} stack>
            <colgroup>
              <col style={{ width: "24%" }} />
              <col />
              <col style={{ width: "24%" }} />
              <ActionsCol icons={0} labelled={3} />
            </colgroup>
            <THead>
              <Th>Document</Th>
              <Th>Why it is held</Th>
              <Th>Placed</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {holds.map((h) => (
                <Tr key={h.id}>
                  <Td><CellStack wrap title={h.document.title} /></Td>
                  <Td label="Why it is held" className="break-words text-ink-2">{h.reason}</Td>
                  <Td label="Placed"><CellStack wrap title={formatOrgDay(h.placedAt, tz)} sub={`${h.placedBy.name} · recorded on behalf of, not signed`} /></Td>
                  <Td>
                    <RowActions>
                      <DocumentButton documentId={h.document.id} label={h.document.title} />
                      <ReleaseHold holdId={h.id} title={h.document.title} reason={h.reason} people={people} />
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
