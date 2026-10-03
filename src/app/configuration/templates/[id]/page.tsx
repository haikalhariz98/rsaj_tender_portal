import Link from "next/link";
import { notFound } from "next/navigation";

import { HistoryButton } from "@/components/history-drawer";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { FilesIcon, InboxIcon, ToolsIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Blocked } from "@/components/ui/blocked";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { notACertificateFormText, otherUsesOf, TEMPLATE_OTHER_USES } from "@/lib/certificate/config";
import { BLOCK_KIND_WORDS, CONDITION_WORDS, OFFICE_RULE_WORDS } from "@/lib/certificate/labels";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";

import { AddBlock, AddRecipient, EditBlock, EditRecipient, RemoveBlock, RemoveRecipient } from "./editors";

export const dynamic = "force-dynamic";

const USE_COUNTS = Object.fromEntries(Object.keys(TEMPLATE_OTHER_USES).map((k) => [k, true])) as Record<keyof typeof TEMPLATE_OTHER_USES, true>;

/**
 * One form's signature blocks and distribution list (6.14 increment 1, FR-CRT-001, 004, 006). The text and the
 * form's identity are edited on Configuration › Templates; here, its printed signature order and who receives
 * it. Everything ships empty. A certificate pins the form (text, blocks and list) at its first signature.
 */
export default async function TemplateFormPage(props: PageProps<"/configuration/templates/[id]">) {
  const { id } = await props.params;
  const org = await exerciseOrg();
  if (!org) notFound();
  const t = await db.documentTemplate.findFirst({
    where: { id, organisationId: org.id },
    include: { signatureBlocks: { orderBy: { blockOrder: "asc" } }, distributionRows: { orderBy: [{ sortOrder: "asc" }, { recipientCode: "asc" }] }, _count: { select: { certificates: true, ...USE_COUNTS } } },
  });
  if (!t) notFound();
  const roles = await db.authorityRole.findMany({ where: { organisationId: org.id, isCommittee: false }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true } });
  const offices = roles.map((r) => ({ value: r.code, label: r.nameEn }));
  const officeName = (code: string | null) => roles.find((r) => r.code === code)?.nameEn ?? "An office no longer configured";
  // BD-614-21 residual (a): a template used elsewhere is not a certificate form, and takes no block or recipient.
  const uses = otherUsesOf(t._count as unknown as Record<string, number>);
  const notAForm = uses.length ? notACertificateFormText(uses).en : null;
  const undecided = t.signatureBlocks.filter((b) => b.delegable == null).length;
  const yesNo = (b: boolean | null, yes: string, no: string, unset: string) => (b == null ? unset : b ? yes : no);

  return (
    <>
      <RecordCrumb label={t.nameEn} />
      <PageHeader
        eyebrow={<Link href="/configuration/templates">Templates</Link>}
        title={t.nameEn}
        badge={undecided ? <Badge tone="warn" dot>{`${undecided} block${undecided === 1 ? "" : "s"} undecided`}</Badge> : undefined}
        subtitle="Signature order and distribution list, pinned at a certificate's first signature."
        meta={[t.formCode || "No form code", t.revisionDate ? `Revision ${formatDate(t.revisionDate)}` : "No revision date", notAForm ? `Version ${t.bodyVersion} (its text)` : `Version ${t.bodyVersion} (its text, signature blocks and distribution list)`, `${t._count.certificates} certificate${t._count.certificates === 1 ? "" : "s"} printed on it`]}
      />
      <div className="flex flex-col gap-6">
        {notAForm && <Callout tone="info" title="Not a certificate form">{notAForm}</Callout>}
        <Card className="overflow-hidden">
          <CardHeader icon={<ToolsIcon size={17} />} title="Signature blocks" subtitle="In printed order. A later block is refused until every earlier one is recorded; the block marked as dating the certificate gives it its date." actions={notAForm ? <Blocked label="Add block" reason={notAForm} /> : <AddBlock templateId={t.id} offices={offices} />} divided={t.signatureBlocks.length === 0} />
          {t.signatureBlocks.length === 0 ? (
            <EmptyState size="sm" title="Not set">No blocks: nothing printed on this form can be signed, so no certificate on it goes past its draft.</EmptyState>
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col />
                <col style={{ width: 130 }} />
                <ActionsCol icons={2} labelled={1} />
              </colgroup>
              <THead>
                <Th>Block</Th>
                <Th>Source</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {t.signatureBlocks.map((b) => (
                  <Tr key={b.id}>
                    <Td label="Block">
                      <CellStack
                        title={`${b.blockOrder}. ${b.labelEn}`}
                        aside={b.datesCertificate ? <Chip tone="info">Dates it</Chip> : undefined}
                        sub={[
                          b.labelMs,
                          `${BLOCK_KIND_WORDS[b.blockKind].en} · ${b.officeRule === "NAMED_OFFICE" ? officeName(b.officeCode) : OFFICE_RULE_WORDS[b.officeRule].en}`,
                          yesNo(b.delegable, "a delegate may sign", "never a delegate", "whether a delegate may sign is not decided"),
                          b.carriesDecision ? "carries supported / not supported" : null,
                          b.refusalAllowed ? "a refusal is recorded" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    </Td>
                    <Td label="Source"><ProvenanceBadge value={b.provenance} /></Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="FormSignatureBlock" entityId={b.id} label={b.labelEn} />
                        <EditBlock templateId={t.id} offices={offices} row={b} />
                        <RemoveBlock templateId={t.id} id={b.id} label={b.labelEn} />
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader icon={<InboxIcon size={17} />} title="Distribution list" subtitle="Who receives the issued certificate. A conditional row is resolved from the contract on the day of issue; a mandatory copy not sent leaves the certificate not distributed." actions={notAForm ? <Blocked label="Add recipient" reason={notAForm} /> : <AddRecipient templateId={t.id} />} divided={t.distributionRows.length === 0} />
          {t.distributionRows.length === 0 ? (
            <EmptyState size="sm" title="Not set">No recipients: a certificate on this form could reach nobody, so its first signature is refused.</EmptyState>
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col />
                <col style={{ width: 130 }} />
                <ActionsCol icons={2} labelled={1} />
              </colgroup>
              <THead>
                <Th>Recipient</Th>
                <Th>Source</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {t.distributionRows.map((d) => (
                  <Tr key={d.id}>
                    <Td label="Recipient">
                      <CellStack title={d.labelEn} aside={d.isOriginal ? <Chip tone="info">Original</Chip> : undefined} sub={[d.labelMs, d.mandatory ? "Mandatory" : "Optional", d.ackRequired ? "acknowledgement asked for" : null, CONDITION_WORDS[d.condition].en].filter(Boolean).join(" · ")} />
                    </Td>
                    <Td label="Source"><ProvenanceBadge value={d.provenance} /></Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="FormDistribution" entityId={d.id} label={d.labelEn} />
                        <EditRecipient templateId={t.id} row={d} />
                        <RemoveRecipient templateId={t.id} id={d.id} label={d.labelEn} />
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <FilesIcon size={14} /> The form&apos;s text and merge fields are edited on <Link href="/configuration/templates" className="font-semibold">Templates</Link>.
        </p>
      </div>
    </>
  );
}
