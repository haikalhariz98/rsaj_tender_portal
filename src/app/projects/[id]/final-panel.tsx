import Link from "next/link";

import { ActGate } from "@/components/act-gate";
import { DataList, type Row } from "@/components/data-list";
import { CheckIcon, ClipboardIcon, FileIcon, ShieldCheckIcon, WalletIcon } from "@/components/icons";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { MoreActions } from "@/components/ui/more-actions";
import { KeyValues } from "@/components/ui/stat";
import { STATUS_WORDS } from "@/lib/certificate/labels";
import { withdrawnCount, type FrozenLine } from "@/lib/closeout/defects";
import { FINAL_BASIS_WORDS } from "@/lib/closeout/final-words";
import { financePaidOf, loadRequirements, takenUpDeclarations } from "@/lib/closeout/final-load";
import { finalRaiseCheckOf } from "@/lib/closeout/final-write";
import { closeoutFaultText, closeoutRefusal, owedByContractor, withdrawnWords } from "@/lib/closeout/labels";
import { survivingOf } from "@/lib/closeout/closure";
import type { CloseoutView } from "@/lib/closeout/view";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import { contractStage, STAGE_WORDS } from "@/lib/contract/stage";
import type { ContractStatus } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";
import type { HiddenAct } from "@/lib/supervision/authority";

import { AddDeductionDrawer, CloseContractDrawer, ConfirmFinanceDrawer, DeclarationDrawer, PackEntryDrawer, RaiseFinalDrawer, RemoveDeductionDrawer, type Option } from "./final-editors";

/**
 * The Final account tab and the Close card (Phase 2 close-out stage C; plan closeout-plan.md §3.2, §4.6, §4.7). The figures, the pack, Finance's
 * confirmation and the declaration; then the close's checklist, what survives it and the Close button. Every refusal is the pure rules' in words
 * (`finalRaiseCheckOf`, `finalRouteFaults`, `closureFaults`); the cards render what they say.
 */

type Props = { l: LoadedContract; v: CloseoutView; people: Option[]; today: string | null; hidden: readonly HiddenAct[] };
const zone = (today: string | null) => (today ? null : "Set the organisation's time zone first.");
const SUPPLY = "Supply contracts are not closed here yet.";

export async function FinalAccountPanel({ l, v, people, today, hidden }: Props) {
  const id = l.contract.id;
  const shut = actStatusBlocker("FINAL_ACCOUNT", l.contract.status as ContractStatus) ?? zone(today);
  if (v.facts.supply) return <Card className="overflow-hidden"><CardHeader icon={<WalletIcon size={17} />} title="Final account" /><EmptyState size="sm" title={SUPPLY} /></Card>;
  const fa = v.final;
  const draft = fa?.certificate.status === "DRAFT";
  const sent = !!fa && !draft;
  const edit = draft ? shut : (fa ? closeoutFaultText({ code: "FINAL_SENT", level: "block" }) : shut);

  if (!fa) {
    const check = await finalRaiseCheckOf(db, l);
    // The account's own refusals too (a payment below nothing), so the raise is not offered where it would refuse.
    const blocker = shut ?? (check.faults.length ? closeoutRefusal("", check.faults) : check.account?.faults.length ? closeoutRefusal("", check.account.faults) : null);
    // Ruling 3 (code review of close-out stage C): below nothing, it is what the contractor owes, and the contract stays open.
    const owed = check.account ? owedByContractor(check.account.recommended) : null;
    return (
      <ActGate blocker={shut}>
        <Card id="figures" className="overflow-hidden">
          <CardHeader icon={<WalletIcon size={17} />} title="Final account" info={{ label: "About the final account", text: "The final contract sum less what was paid before and the deductions. Computed from the contract's issued certificates, never keyed." }} actions={!hidden.includes("SO_ONLY") ? <RaiseFinalDrawer id={id} people={people} blocker={blocker} /> : undefined} />
          {check.account ? (
            <CardBody>
              <KeyValues columns={2} items={[{ label: "Final contract sum", value: formatMoney(check.account.finalSum) }, { label: "Less", value: formatMoney(check.account.less) }, { label: "Deduct", value: formatMoney(check.account.deduct) }, owed ? { label: owed.label, value: owed.value } : { label: "Payment recommended", value: formatMoney(check.account.recommended) }]} />
              {owed && <Callout tone="warn" className="mt-4">{owed.note}</Callout>}
            </CardBody>
          ) : (
            <EmptyState size="sm" title="Not raised" />
          )}
        </Card>
      </ActGate>
    );
  }

  const [requirements, documents, takenUp, p] = await Promise.all([
    loadRequirements(l.org.id, today),
    db.projectDocument.findMany({ where: { contractId: id, organisationId: l.org.id }, select: { id: true, title: true }, orderBy: { createdAt: "desc" } }),
    takenUpDeclarations(l.org.id, id),
    Promise.resolve(v.p),
  ]);
  const lineRows: Row[] = fa.finalLines.map((x) => ({
    id: x.id,
    search: x.label,
    cells: {
      item: { kind: "stack", title: x.label, sub: x.keyed ? "Keyed" : undefined },
      block: { kind: "text", text: x.block === "LESS" ? "Less" : "Deduct", dim: true },
      amount: { kind: "money", sen: senFromDecimal(x.amount).toString() },
    },
  }));
  const keyed = fa.finalLines.filter((x) => x.keyed).map((x) => ({ value: x.id, label: `${x.label}, ${formatMoney(senFromDecimal(x.amount))}` }));
  const entryOf = new Map(fa.packEntries.map((e) => [e.requirementId, e]));
  const packRows: Row[] = requirements.map((r) => {
    const e = entryOf.get(r.id);
    return {
      id: r.id,
      search: r.labelEn,
      cells: {
        item: { kind: "stack", title: r.labelEn, sub: e ? (e.projectDocument ? e.projectDocument.title : `Not applicable: ${e.notApplicableReason}`) : undefined },
        state: { kind: "chips", items: [{ text: e ? "In" : "Missing", tone: e ? "ok" : "warn" }] },
      },
    };
  });
  const paid = financePaidOf(p);
  const confirmed = fa.financeConfirmedTotal == null ? null : senFromDecimal(fa.financeConfirmedTotal);
  const issuedCount = await db.certificate.count({ where: { contractId: id, organisationId: l.org.id, status: "ISSUED" } });
  const certLink = <Link href={`/projects/${id}/certificates/${fa.certificateId}`}>{fa.certificate.number ?? STATUS_WORDS[fa.certificate.status as keyof typeof STATUS_WORDS]?.en ?? "Open"}</Link>;
  return (
    <div className="flex flex-col gap-6">
      <ActGate blocker={shut}>
        <Card id="figures" className="overflow-hidden">
          <CardHeader
            icon={<WalletIcon size={17} />}
            title="Final account"
            info={{ label: "About the final account", text: "The final contract sum less what was paid before and the deductions. Computed from the contract's issued certificates; deductions are keyed while it is a draft." }}
            actions={
              draft ? (
                <MoreActions label="Final account actions">
                  <AddDeductionDrawer id={id} blocker={edit} main={false} />
                  {keyed.length > 0 && <RemoveDeductionDrawer id={id} lines={keyed} blocker={edit} />}
                </MoreActions>
              ) : undefined
            }
            divided={false}
          />
          <CardBody>
            <KeyValues
              columns={3}
              items={[
                { label: "Final contract sum", value: formatMoney(senFromDecimal(fa.finalSum)) },
                { label: "Payment recommended", value: formatMoney(senFromDecimal(fa.recommended)) },
                { label: "Paid to", value: `${l.award.awardeeName} (main contractor)` },
                { label: "Certificate", value: certLink },
                { label: "Previous payments", value: FINAL_BASIS_WORDS[fa.previousBasis] },
                { label: "Raised by", value: fa.person.name },
              ]}
            />
          </CardBody>
          <DataList flat selectable={false} toolbar={false} searchable={false} paging={false} exportName="final-account" emptyTitle="No lines" columns={[{ key: "item", label: "Item", mobile: "primary" }, { key: "block", label: "Block", width: "110px", mobile: "meta" }, { key: "amount", label: "Amount", width: "170px", numeric: true, mobile: "meta" }]} rows={lineRows} />
        </Card>
      </ActGate>

      <Card id="pack" className="overflow-hidden">
        <CardHeader icon={<FileIcon size={17} />} title="Pack" subtitle={`${issuedCount} issued certificates, listed automatically`} actions={draft && requirements.length ? <PackEntryDrawer id={id} requirements={requirements.map((r) => ({ value: r.id, label: r.labelEn }))} documents={documents.map((d) => ({ value: d.id, label: d.title }))} people={people} blocker={edit} main={packRows.some((r) => !entryOf.has(r.id))} /> : undefined} divided={false} />
        <DataList flat selectable={false} toolbar={false} searchable={false} paging={false} exportName="final-pack" emptyTitle="No other documents are set" columns={[{ key: "item", label: "Document", mobile: "primary" }, { key: "state", label: "Status", width: "140px", mobile: "meta" }]} rows={packRows} />
      </Card>

      <Card id="finance" className="overflow-hidden">
        <CardHeader icon={<CheckIcon size={17} />} title="Finance's confirmation" actions={draft ? <ConfirmFinanceDrawer id={id} people={people} blocker={edit} main={confirmed == null} /> : undefined} />
        <CardBody>
          <KeyValues
            columns={3}
            items={[
              { label: "Confirmed", value: confirmed == null ? "Not confirmed" : `${formatMoney(confirmed)}${fa.financeConfirmedBy ? `, ${fa.financeConfirmedBy.name}` : ""}${fa.financeConfirmedAt ? `, ${formatOrgDay(fa.financeConfirmedAt, l.org.timeZone)}` : ""}` },
              { label: "Recorded payments", value: formatMoney(paid) },
              { label: "Agrees", value: confirmed == null ? "Not judged" : confirmed === paid ? "Yes" : "No" },
            ]}
          />
        </CardBody>
      </Card>

      <Card id="declaration" className="overflow-hidden">
        <CardHeader icon={<ClipboardIcon size={17} />} title="Statutory declaration" actions={draft ? <DeclarationDrawer id={id} documents={takenUp} blocker={edit} main={!fa.declarationDocumentId} /> : undefined} />
        {fa.declarationDocument ? <CardBody><KeyValues columns={2} items={[{ label: "Declaration", value: fa.declarationDocument.title }, { label: "State", value: "Taken up" }]} /></CardBody> : <EmptyState size="sm" title={sent ? "Not linked" : "Not linked yet"} />}
      </Card>
    </div>
  );
}

/// The Close card: the checklist (`closureFaults`, pass or fail per row), what survives, and the Close button.
export async function CloseCard({ l, v, people, today, hidden }: Props) {
  const id = l.contract.id;
  const status = l.contract.status as ContractStatus;
  if (v.facts.supply) return <Card id="close" className="overflow-hidden"><CardHeader icon={<ShieldCheckIcon size={17} />} title="Close" /><EmptyState size="sm" title={SUPPLY} /></Card>;
  const closure = status === "CLOSED" ? await db.contractClosure.findUnique({ where: { contractId: id }, include: { person: { select: { name: true } } } }) : null;
  const f = v.close.facts;
  const failing = new Set(v.closeFaults.map((x) => x.code));
  const frozen = (v.rows.cmgd?.frozenLines as FrozenLine[] | null) ?? null;
  const withdrawn = frozen ? withdrawnWords(withdrawnCount(frozen)) : null;
  const policy = await db.postAwardPolicy.findUnique({ where: { organisationId: l.org.id }, select: { designBondYears: true } });
  const surviving = survivingOf(v.close.dgb, v.rows.cpc ? storedDay(v.rows.cpc.completionDate) : null, policy?.designBondYears ?? null);
  const check = (key: string, label: string, code: string, ok: string): Row => {
    const fault = v.closeFaults.find((x) => x.code === code);
    return { id: key, search: label, cells: { check: { kind: "stack", title: label, sub: fault ? closeoutFaultText(fault) : ok || undefined }, state: { kind: "chips", items: [{ text: failing.has(code) ? "Not met" : "Met", tone: failing.has(code) ? "warn" : "ok" }] } } };
  };
  const rows: Row[] = status === "CLOSED" ? [] : [
    check("final", "Final certificate issued and paid", "FINAL_NOT_PAID", ""),
    check("certs", "No certificate in progress", "CERTIFICATES_IN_PROGRESS", ""),
    check("matters", "No route open", "MATTERS_OPEN", ""),
    check("defects", "Defects made good", "DEFECTS_OPEN", withdrawn ?? ""),
    check("retention", "Retention released", "RETENTION_HELD", ""),
    check("securities", "Securities returned", "SECURITY_NOT_RETURNED", ""),
    check("performance", "Contractor performance verified", "PERFORMANCE_NOT_FILED", ""),
  ];
  const shut = actStatusBlocker("CLOSE", status) ?? zone(today);
  const blocker = shut ?? (v.closeFaults.length ? closeoutRefusal("", v.closeFaults) : null);
  // §7.3.3's stage in words (`contractStage`): the stored state and the derived ones that hold.
  const dlp = v.rows.cpc ? (v.rows.cpc.dlpStart ? (today && v.rows.cpc.dlpEnd && today < storedDay(v.rows.cpc.dlpEnd) ? "RUNNING" : "ENDED") : "NOT_APPLICABLE") : "NOT_SET";
  const stage = contractStage({ status }, { inDelay: false, noticeOfIntention: false, partiallyOccupied: false, dlp, scheduleOfDefectsOpen: v.facts.defects.open > 0 && !!v.rows.schedule, thirdPartyRectification: false, obligationsDischarged: v.facts.performance === "VERIFIED" && f.defectsOpen === 0 && v.close.lossOpen.length === 0, declarationBlocking: !!v.final && !v.final.declarationDocumentId && v.routeFaults.some((x) => x.code === "DECLARATION_NOT_TAKEN_UP"), terminatedAccountSettled: false });
  return (
    <ActGate blocker={shut}>
      <Card id="close" className="overflow-hidden">
        <CardHeader
          icon={<ShieldCheckIcon size={17} />}
          title="Close"
          subtitle={stage.derived.length ? stage.derived.map((s) => STAGE_WORDS[s].en).join(" · ") : undefined}
          info={{ label: "About the close", text: "No route of its own: the certificates' approvals stand behind it. The design guarantee bond survives the close." }}
          actions={status !== "CLOSED" && !hidden.includes("PRINCIPAL_OR_SO") ? <CloseContractDrawer id={id} people={people} blocker={blocker} /> : undefined}
          divided={status !== "CLOSED"}
        />
        {closure ? (
          <CardBody>
            <KeyValues columns={2} items={[{ label: "Closed on", value: formatDate(storedDay(closure.closedOn)) }, { label: "Closed by", value: closure.person.name }]} />
          </CardBody>
        ) : (
          <DataList flat selectable={false} toolbar={false} searchable={false} paging={false} exportName="close-checklist" emptyTitle="Nothing to check" columns={[{ key: "check", label: "Check", mobile: "primary" }, { key: "state", label: "Status", width: "140px", mobile: "meta" }]} rows={rows} />
        )}
        {surviving.length > 0 && (
          <CardBody>
            <KeyValues columns={2} items={surviving.map((s) => ({ label: `Survives: ${s.label}`, value: s.releaseOn ? `Released from ${formatDate(s.releaseOn)}` : "Release not set" }))} />
          </CardBody>
        )}
      </Card>
    </ActGate>
  );
}
