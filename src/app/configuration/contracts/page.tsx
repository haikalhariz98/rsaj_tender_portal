import type { ReactNode } from "react";

import { FileIcon, InboxIcon, ScaleIcon } from "@/components/icons";
import { HistoryButton } from "@/components/history-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { SIGNATORY_DOMAIN } from "@/lib/award/types";
import { loadContractConfig } from "@/lib/contract/load";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";

import { AddCopyRecipient, AddDocumentPart, EditContractPolicy, EditCopyRecipient, EditDocumentPart, RetireContractRow } from "./editors";

export const dynamic = "force-dynamic";

/// A setting's value, or "Not set" and what that stops.
function Setting({ value, unset }: { value: ReactNode | null; unset: string }) {
  if (value != null && value !== "") return <>{value}</>;
  return (
    <span className="flex flex-col items-start gap-1.5">
      <Badge tone="warn">Not set</Badge>
      <span className="text-[12.5px] text-ink-3">{unset}</span>
    </span>
  );
}

const INSTRUMENTS = ["LETTER_OF_ACCEPTANCE", "WORK_INDENT"];

/**
 * Contract controls (6.12): the legal office, the contract agreement's signatory rows, the
 * controlled-copy stamp, the front-loading ratio, the Contract Document's parts by basis and who receives
 * a controlled copy. Everything ships unset and empty; preparation does not start while one it needs is
 * unset, and names it.
 */
export default async function ContractControlsPage() {
  const org = await exerciseOrg();
  if (!org) {
    return (
      <>
        <PageHeader title="Contract controls" subtitle="How contracts are formed after award." />
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const [cfg, rules] = await Promise.all([
    loadContractConfig(org.id),
    db.authorityRule.findMany({ where: { domain: SIGNATORY_DOMAIN, cond: { not: null }, authorityMatrix: { organisationId: org.id, issuedAt: { not: null } } }, select: { cond: true, labelEn: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const p = cfg.policy;
  const units = cfg.units.filter((u) => u.effectiveTo == null).map((u) => ({ value: u.code, label: u.nameEn }));
  const byCond = new Map<string, string[]>();
  for (const r of rules) if (r.cond && !INSTRUMENTS.includes(r.cond)) byCond.set(r.cond, [...(byCond.get(r.cond) ?? []), r.labelEn]);
  const conditions = [...byCond].map(([value, labels]) => ({ value, label: labels.join("; ") }));
  const condLabel = (c: string | null) => (c ? (byCond.get(c)?.join("; ") ?? "Rows no longer on the approval matrix in force") : null);
  const bases = cfg.bases.filter((b) => b.retiredOn == null).map((b) => ({ value: b.code, label: b.nameEn }));
  const basisName = (code: string) => cfg.bases.find((b) => b.code === code)?.nameEn ?? "A basis no longer configured";
  const unset = [p?.legalOfficeCode, p?.signatoryCond, p?.controlledCopyStampEn].filter((x) => !x).length + (cfg.recipients.some((r) => !r.retiredOn) ? 0 : 1);
  const values = {
    legalOfficeCode: p?.legalOfficeCode ?? null,
    signatoryCond: p?.signatoryCond ?? null,
    controlledCopyStampEn: p?.controlledCopyStampEn ?? null,
    controlledCopyStampMs: p?.controlledCopyStampMs ?? null,
    frontLoadingRatio: p?.frontLoadingRatio == null ? null : p.frontLoadingRatio.toString().replace(/\.?0+$/, ""),
    provenance: p?.provenance ?? null,
    notes: p?.notes ?? "",
  };

  return (
    <>
      <PageHeader
        title="Contract controls"
        badge={unset > 0 ? <Badge tone="warn" dot>{`${unset} not set`}</Badge> : <Badge tone="ok" dot>All set</Badge>}
        subtitle="The legal office, the signatory rows, controlled copies and the Contract Document's parts."
        meta={[
          <span key="p" className="inline-flex items-center gap-1.5">
            Where these controls come from <ProvenanceBadge value={p?.provenance} />
          </span>,
        ]}
        actions={
          <>
            {p?.id && <HistoryButton entity="ContractPolicy" entityId={p.id} label="Contract controls" />}
            <EditContractPolicy values={values} units={units} conditions={conditions} />
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader icon={<ScaleIcon size={17} />} title="Forming a contract" subtitle="Frozen on each contract when its preparation starts. Unset refuses the start, naming the setting." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Legal office", value: <Setting value={cfg.unitName(p?.legalOfficeCode ?? null)} unset="Preparation does not start: nothing could go for legal review." /> },
                { label: "The contract agreement's signatory", value: <Setting value={condLabel(p?.signatoryCond ?? null)} unset="Preparation does not start: nobody could be resolved to sign." /> },
                { label: "Controlled-copy stamp", value: <Setting value={[p?.controlledCopyStampEn, p?.controlledCopyStampMs].filter(Boolean).join(" / ") || null} unset="Preparation does not start: no copy could be stamped." /> },
                { label: "Front-loading ratio", value: <Setting value={values.frontLoadingRatio ? `Rates above ${values.frontLoadingRatio} times the estimate's are listed` : null} unset="Allowed: the front-loading check is the officer's judgement alone, and says so." /> },
              ]}
            />
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader icon={<FileIcon size={17} />} title="Contract Document parts" subtitle="By basis, in the prescribed order. Copied into each contract's assembly when its preparation starts." actions={<AddDocumentPart bases={bases} />} divided={cfg.parts.length === 0} />
          {cfg.parts.length === 0 ? (
            <EmptyState size="sm" title="Not set">No parts are configured, so no contract&apos;s preparation can start.</EmptyState>
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col />
                <col style={{ width: 200 }} />
                <col style={{ width: 130 }} />
                <ActionsCol icons={2} labelled={1} />
              </colgroup>
              <THead>
                <Th>Part</Th>
                <Th>Basis</Th>
                <Th>Source</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {cfg.parts.map((x) => (
                  <Tr key={x.id}>
                    <Td label="Part"><CellStack title={[x.printedNumber, x.labelEn].filter(Boolean).join(". ")} sub={[x.labelMs, x.retiredOn ? `retired ${formatDate(x.retiredOn)}` : null].filter(Boolean).join(" · ") || undefined} /></Td>
                    <Td label="Basis" className="text-ink-2">{basisName(x.contractBasisCode)}</Td>
                    <Td label="Source"><ProvenanceBadge value={x.provenance} /></Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="ContractDocumentPart" entityId={x.id} label={x.labelEn} />
                        <EditDocumentPart id={x.id} name={x.labelEn} bases={bases} values={{ contractBasisCode: x.contractBasisCode, printedNumber: x.printedNumber, labelEn: x.labelEn, labelMs: x.labelMs, provenance: x.provenance, sortOrder: String(x.sortOrder), notes: x.notes }} />
                        {!x.retiredOn && <RetireContractRow entity="ContractDocumentPart" id={x.id} label={x.labelEn} today={org.today} />}
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader icon={<InboxIcon size={17} />} title="Who receives a controlled copy" subtitle="Each executed contract's copies go to these, as frozen when its preparation started." actions={<AddCopyRecipient />} divided={cfg.recipients.length === 0} />
          {cfg.recipients.length === 0 ? (
            <EmptyState size="sm" title="Not set">Nobody is set to receive a copy, so no contract&apos;s preparation can start.</EmptyState>
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
                {cfg.recipients.map((x) => (
                  <Tr key={x.id}>
                    <Td label="Recipient"><CellStack title={x.nameEn} sub={[x.copyForm || null, x.mandatory ? "Mandatory" : "Optional", x.onlyWithConsultingEngineer ? "only where a consulting engineer is engaged" : null, x.retiredOn ? `retired ${formatDate(x.retiredOn)}` : null].filter(Boolean).join(" · ")} /></Td>
                    <Td label="Source"><ProvenanceBadge value={x.provenance} /></Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="ControlledCopyRecipient" entityId={x.id} label={x.nameEn} />
                        <EditCopyRecipient id={x.id} name={x.nameEn} values={{ nameEn: x.nameEn, nameMs: x.nameMs, copyForm: x.copyForm, mandatory: x.mandatory, onlyWithConsultingEngineer: x.onlyWithConsultingEngineer, provenance: x.provenance, sortOrder: String(x.sortOrder), notes: x.notes }} />
                        {!x.retiredOn && <RetireContractRow entity="ControlledCopyRecipient" id={x.id} label={x.nameEn} today={org.today} />}
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
