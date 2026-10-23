import Link from "next/link";
import { notFound } from "next/navigation";

import { HistoryButton } from "@/components/history-drawer";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { FilesIcon, InboxIcon, PrinterIcon, ToolsIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { InfoChip } from "@/components/ui/info-chip";
import { Card, CardHeader } from "@/components/ui/card";
import { Blocked } from "@/components/ui/blocked";
import { EmptyState } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { notACertificateFormText, notAPrintedFormText, otherUsesOf, TEMPLATE_OTHER_USES } from "@/lib/certificate/config";
import { boundFieldWords, isSheetField, PRINTABLE_FIELDS } from "@/lib/certificate/printed";
import { BLOCK_KIND_WORDS, CONDITION_WORDS, OFFICE_RULE_WORDS } from "@/lib/certificate/labels";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";

import { AddBlock, AddPrintedField, AddRecipient, EditBlock, EditPageCount, EditPrintedField, EditRecipient, RemoveBlock, RemovePrintedField, RemoveRecipient } from "./editors";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Template" };

const USE_COUNTS = Object.fromEntries(Object.keys(TEMPLATE_OTHER_USES).map((k) => [k, true])) as Record<keyof typeof TEMPLATE_OTHER_USES, true>;

/**
 * One form's signature blocks and distribution list (6.14 increment 1, FR-CRT-001, 004, 006), and its printed
 * form: page count and printed fields with their label pairs (increment 2). The text and the
 * form's identity are edited on Configuration › Templates; here, its printed signature order and who receives
 * it. Everything ships empty. A certificate pins the form (text, blocks and list) at its first signature.
 */
export default async function TemplateFormPage(props: PageProps<"/configuration/templates/[id]">) {
  const actor = await requireStaff();
  const { id } = await props.params;
  const org = await exerciseOrg(actor.organisationId);
  if (!org) notFound();
  const t = await db.documentTemplate.findFirst({
    where: { id, organisationId: org.id },
    include: { signatureBlocks: { orderBy: { blockOrder: "asc" } }, distributionRows: { orderBy: [{ sortOrder: "asc" }, { recipientCode: "asc" }] }, printedFields: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] }, _count: { select: { certificates: true, ...USE_COUNTS } } },
  });
  if (!t) notFound();
  const roles = await db.authorityRole.findMany({ where: { organisationId: org.id, isCommittee: false }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true } });
  const offices = roles.map((r) => ({ value: r.code, label: r.nameEn }));
  const officeName = (code: string | null) => roles.find((r) => r.code === code)?.nameEn ?? "An office no longer configured";
  // BD-614-21 residual (a): a template used elsewhere is not a certificate form, and takes no block or recipient.
  const uses = otherUsesOf(t._count as unknown as Record<string, number>);
  const notAForm = uses.length ? notACertificateFormText(uses).en : null;
  const undecided = t.signatureBlocks.filter((b) => b.delegable == null).length;
  // 6.14 increment 2: the values a printed field may print, in the product's words .
  // Code review M-1: a routing sheet's value is offered with the note that it needs a routing type.
  const printable = [...PRINTABLE_FIELDS].map((k) => ({ value: k, label: isSheetField(k) ? `${boundFieldWords(k).en} (routing sheet: only on a certificate with a routing type)` : boundFieldWords(k).en }));
  const notAPrinted = uses.length ? notAPrintedFormText(uses).en : null;
  const yesNo = (b: boolean | null, yes: string, no: string, unset: string) => (b == null ? unset : b ? yes : no);

  return (
    <>
      <RecordCrumb label={t.nameEn} />
      <PageHeader
        title={t.nameEn}
        badge={undecided ? <Badge tone="warn" dot>{`${undecided} block${undecided === 1 ? "" : "s"} undecided`}</Badge> : undefined}
        info={{ title: "Template", text: "Signature order, recipients and printed form. A certificate keeps them as they were at its first signature." }}
        meta={[t.formCode || "No form code", t.revisionDate ? `Revision ${formatDate(t.revisionDate)}` : "No revision date", notAForm ? `Version ${t.bodyVersion} (its text)` : `Version ${t.bodyVersion} (its text, signature blocks, distribution list and printed form)`, t.pageCount == null ? "Printed pages not recorded" : `${t.pageCount} printed page${t.pageCount === 1 ? "" : "s"}`, `${t._count.certificates} certificate${t._count.certificates === 1 ? "" : "s"} printed on it`]}
      />
      <div className="flex flex-col gap-6">
        {notAForm && <InfoChip tone="warn" detail={notAForm}>Not a certificate form</InfoChip>}
        <Card className="overflow-hidden">
          <CardHeader icon={<ToolsIcon size={17} />} title="Signature blocks" subtitle="In printed order" actions={notAForm ? <Blocked label="Add block" reason={notAForm} /> : <AddBlock templateId={t.id} offices={offices} />} divided={t.signatureBlocks.length === 0} />
          {t.signatureBlocks.length === 0 ? (
            <EmptyState size="sm" title="Not set" />
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col />
                <ActionsCol icons={2} labelled={1} />
              </colgroup>
              <THead>
                <Th>Block</Th>
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
                          `${BLOCK_KIND_WORDS[b.blockKind].en} · ${b.officeRule === "NAMED_OFFICE" ? officeName(b.officeCode) : OFFICE_RULE_WORDS[b.officeRule].en}`,
                          yesNo(b.delegable, "a delegate may sign", "never a delegate", "whether a delegate may sign is not decided"),
                          b.carriesDecision ? "carries supported / not supported" : null,
                          b.refusalAllowed ? "a refusal is recorded" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    </Td>
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
          <CardHeader icon={<InboxIcon size={17} />} title="Distribution list" subtitle="Who receives it" actions={notAForm ? <Blocked label="Add recipient" reason={notAForm} /> : <AddRecipient templateId={t.id} />} divided={t.distributionRows.length === 0} />
          {t.distributionRows.length === 0 ? (
            <EmptyState size="sm" title="Not set" />
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col />
                <ActionsCol icons={2} labelled={1} />
              </colgroup>
              <THead>
                <Th>Recipient</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {t.distributionRows.map((d) => (
                  <Tr key={d.id}>
                    <Td label="Recipient">
                      <CellStack title={d.labelEn} aside={d.isOriginal ? <Chip tone="info">Original</Chip> : undefined} sub={[d.mandatory ? "Mandatory" : "Optional", d.ackRequired ? "acknowledgement asked for" : null, CONDITION_WORDS[d.condition].en].filter(Boolean).join(" · ")} />
                    </Td>
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
        <Card className="overflow-hidden">
          <CardHeader
            icon={<PrinterIcon size={17} />}
            title="Printed form"
            subtitle={t.pageCount == null ? "Pages not recorded" : `${t.pageCount} printed page${t.pageCount === 1 ? "" : "s"}`}
            actions={
              <span className="flex flex-wrap items-center gap-2">
                <MoreText label="About printed fields" text="Each printed field carries the form's own label. The portal fills it from the certificate or its routing sheet, or it is left blank for the pen. A routing sheet's form also shows its received and approved day labels." />
                <EditPageCount templateId={t.id} pageCount={t.pageCount} />
                {notAPrinted ? <Blocked label="Add field" reason={notAPrinted} /> : <AddPrintedField templateId={t.id} values={printable} />}
              </span>
            }
            divided={t.printedFields.length === 0}
          />
          {t.printedFields.length === 0 ? (
            <EmptyState size="sm" title="No printed fields" />
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col />
                <ActionsCol icons={2} labelled={1} />
              </colgroup>
              <THead>
                <Th>Field</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {t.printedFields.map((f) => (
                  <Tr key={f.id}>
                    <Td label="Field">
                      <CellStack title={f.labelEn} sub={f.bound && f.computedKey ? `Filled by the portal: ${boundFieldWords(f.computedKey).en}` : "Completed by hand on the paper"} />
                    </Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="FormField" entityId={f.id} label={f.labelEn} />
                        <EditPrintedField templateId={t.id} values={printable} row={f} />
                        <RemovePrintedField templateId={t.id} id={f.id} label={f.labelEn} />
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <FilesIcon size={14} /> Edit the text on <Link href="/configuration/templates" className="font-semibold">Templates</Link>.
        </p>
      </div>
    </>
  );
}
