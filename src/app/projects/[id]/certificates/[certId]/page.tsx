import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckIcon, ClockIcon, FileIcon, InboxIcon, PrinterIcon, RouteIcon, ToolsIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { certificateDateOf } from "@/lib/certificate/date";
import { distributionState } from "@/lib/certificate/distribution";
import { refusalText } from "@/lib/certificate/fault-text";
import { certificateFieldLabel, certificateFieldValues, mergeFields } from "@/lib/certificate/fields";
import { BLOCK_KIND_WORDS, CERT_WORDS, DECISION_WORDS, KIND_WORDS, METHOD_WORDS, OFFICE_RULE_WORDS, STATUS_TONE, STATUS_WORDS } from "@/lib/certificate/labels";
import { applyOverrides, type Effective } from "@/lib/certificate/override";
import { loadCertificate, signedOf, templateNow, type LoadedCertificate } from "@/lib/certificate/repo";
import { pinRefusals, readRevision, type TemplateRevision } from "@/lib/certificate/revision";
import { type Sheet } from "@/lib/certificate/routing-sheet";
import { RoutingSheetView } from "@/components/certificate/routing-sheet";
import { nextBlock } from "@/lib/certificate/signature";
import { readComputedSnapshot } from "@/lib/certificate/snapshot";
import type { Block, CertificateStatus, DeliveryMethod } from "@/lib/certificate/types";
import { isPersonRule } from "@/lib/certificate/types";
import { certifiesMoney, pinContextOf, sheetOf } from "@/lib/certificate/write";
import { historyFieldLabel, historyValue } from "@/lib/contract/history-words";
import { dayOf, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDateTime, formatOrgDay } from "@/lib/format";
import { formatSen as formatMoney, parseSen } from "@/lib/money";
import { ORGANISATION_NAME } from "@/lib/org";
import { ratioPercentText } from "@/lib/percent-band";
import { isSulitField } from "@/lib/sulit-fields";
import { fieldsNamed, renderWith } from "@/lib/templates/merge";

import { AcknowledgeDrawer, CheckDrawer, CorrectDateDrawer, DespatchDrawer, OverrideDrawer, ReceivedDrawer, SendForRoutingDrawer, SendToSigningDrawer, SignatureDrawer, VoidDrawer } from "./editors";

export const dynamic = "force-dynamic";

type Option = { value: string; label: string };
const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const dim = (t: string) => <span className="text-ink-4">{t}</span>;
const HISTORY_PAGE = 200;
const NOTE_ID = "certificate-action-note";

/**
 * One certificate (6.14 increment 1, ADR 0022, 0023): one shell for every kind. Figures (as computed, any
 * override marked with both figures), Signatures (blocks in printed order, the next one open, the others
 * disabled with the reason), Routing sheet (checks, the approval route's steps, the days received and approved, elapsed
 * against the target, iterations side by side), Distribution, Print (live with "Draft — not issued" before
 * issue; the frozen text and its form after) and History. Every refusal shown is the act's own rule.
 */
export default async function CertificatePage(props: PageProps<"/projects/[id]/certificates/[certId]">) {
  const [{ id, certId }, { tab }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string }>]);
  const l = await loadCertificate(certId);
  if (!l || l.contract.id !== id) notFound();
  const cert = l.cert;
  const status = cert.status as CertificateStatus;
  const today = l.org.timeZone ? dayOf(new Date(), l.org.timeZone) : null;
  const [people, roles] = await Promise.all([
    db.person.findMany({ where: { organisationId: l.org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.authorityRole.findMany({ where: { organisationId: l.org.id }, select: { code: true, nameEn: true } }),
  ]);
  const officeName = (code: string | null) => roles.find((r) => r.code === code)?.nameEn ?? "An office no longer configured";
  const peopleOptions: Option[] = people.map((p) => ({ value: p.id, label: p.name }));
  const snap = readComputedSnapshot(cert.computedSnapshot);
  const figures = snap ? applyOverrides(snap, cert.overrides) : null;
  const pinned = readRevision(cert.templateRevision);
  const form = pinned ? null : await templateNow(cert.templateId);
  const blocks: Block[] = pinned ? pinned.blocks : (form?.blocks ?? []).slice().sort((a, b) => a.blockOrder - b.blockOrder);
  const sheet = today ? sheetOf(cert, today) : null;
  const dateNow = certificateDateOf(blocks, signedOf(cert));
  const ids = [cert.id, ...cert.signatures.map((s) => s.id), ...cert.overrides.map((o) => o.id), ...cert.routingChecks.map((r) => r.id), ...cert.copies.map((c) => c.id)];
  const [history, historyTotal] = await Promise.all([
    db.auditEntry.findMany({ where: { organisationId: l.org.id, entityId: { in: ids } }, orderBy: { at: "desc" }, take: HISTORY_PAGE }),
    db.auditEntry.count({ where: { organisationId: l.org.id, entityId: { in: ids } } }),
  ]);
  const kind = KIND_WORDS[cert.kind].en;

  // The header's next act, judged by the act's own rules.
  let action: React.ReactNode = null;
  let actionNote: string | null = null;
  if (status === "DRAFT" && cert.routingTypeId) action = <SendForRoutingDrawer certId={cert.id} typeLabel={cert.routingType?.labelEn ?? "its type"} blocker={today ? null : "Set the organisation's time zone first."} />;
  else if (status === "DRAFT") action = <SendToSigningDrawer certId={cert.id} routed={false} blocker={today ? null : "Set the organisation's time zone first."} />;
  else if (status === "IN_ROUTING" && sheet) {
    const blocker = signingBlocker(sheet);
    actionNote = blocker;
    action = blocker ? <Blocked label="Send to signing" reason={blocker} primary noteId={NOTE_ID} /> : <SendToSigningDrawer certId={cert.id} routed blocker={null} />;
  }

  const tabs = [
    { id: "figures", label: "Figures", icon: <FileIcon size={15} />, panel: <FiguresPanel l={l} figures={figures} people={peopleOptions} /> },
    { id: "signatures", label: "Signatures", icon: <ToolsIcon size={15} />, count: cert.signatures.length, panel: <SignaturesPanel l={l} blocks={blocks} pinned={pinned} formName={form?.nameEn ?? null} pinBlocker={!pinned && status === "SIGNING" ? pinBlocker(form, cert) : null} people={peopleOptions} today={today} officeName={officeName} /> },
    { id: "routing", label: "Routing sheet", icon: <RouteIcon size={15} />, panel: <RoutingPanel l={l} sheet={sheet} people={peopleOptions} today={today} /> },
    { id: "distribution", label: "Distribution", icon: <InboxIcon size={15} />, count: cert.copies.length, panel: <DistributionPanel l={l} today={today} /> },
    { id: "print", label: "Print", icon: <PrinterIcon size={15} />, panel: <PrintPanel l={l} figures={figures} revision={pinned} formBody={form ? { en: form.bodyEn, ms: form.bodyMs, name: form.nameEn } : null} /> },
    { id: "history", label: "History", icon: <ClockIcon size={15} />, count: historyTotal, panel: <HistoryPanel entries={history} total={historyTotal} timeZone={l.org.timeZone} /> },
  ];

  const voidBlocker = cert.approvalInstances.some((i) => i.status === "PENDING") ? "Its approval route is still waiting for a decision: refuse it on the route first (Approvals)." : null;
  return (
    <>
      <RecordCrumb label={cert.number ?? kind} parent={l.contract.number} />
      <PageHeader
        eyebrow={<Link href={`/projects/${l.contract.id}?tab=documents`}>{`Contract ${l.contract.number}`}</Link>}
        title={cert.number ? `${kind} ${cert.number}` : kind}
        badge={<Badge tone={TONE[STATUS_TONE[status]]} dot>{STATUS_WORDS[status].en}</Badge>}
        subtitle={l.ex.title}
        meta={[
          cert.number ? `Number ${cert.number}` : CERT_WORDS.numberOnIssue.en,
          cert.sequence ? `${kind} ${cert.sequence} on this contract` : null,
          dateNow.state === "DATED" ? `Dated ${formatDate(day(cert.certificateDate) ?? dateNow.day)}` : dateNow.state === "NOT_YET" ? "Date set when signed" : cert.templateId ? CERT_WORDS.notDatedBySignature.en : "No form chosen",
          `Baseline version ${cert.baseline.version}`,
          l.award.awardeeName,
        ].filter((x): x is string => x != null)}
        actionsNote={actionNote ?? undefined}
        actionsNoteId={NOTE_ID}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {action}
            {(status === "DRAFT" || status === "IN_ROUTING" || status === "SIGNING") && <VoidDrawer certId={cert.id} blocker={voidBlocker} />}
          </span>
        }
      />
      <div className="mb-6 flex flex-col gap-3">
        {!today && (
          <Callout tone="warn" title="The organisation's time zone is not set">
            Every act on a certificate records the organisation&apos;s day, and its date is the day of the authorising signature: none is assumed to be UTC.
          </Callout>
        )}
        {l.contract.status === "CANCELLED" && <Callout tone="warn" title="The contract is cancelled">Its certificates are kept as they were; nothing more is recorded on them.</Callout>}
        {status === "VOID" && (
          <Callout tone="warn" title="Void">
            {cert.voidReason} It was never numbered, so it leaves no gap.
          </Callout>
        )}
        {cert.baseline.reason !== "EXECUTED" && cert.baseline.reason !== "POSSESSION" && (
          <Callout tone="info" title="Read from a baseline before execution">
            {`This certificate reads baseline version ${cert.baseline.version}, recorded ${formatDate(day(cert.baseline.recordedOn))}, before the contract was executed (the first certificates may be raised before it is). A later version never changes it.`}
          </Callout>
        )}
      </div>
      <Tabs initial={tab} label="Certificate" tabs={tabs} />
    </>
  );
}

function signingBlocker(sheet: Sheet): string | null {
  const reasons: string[] = [];
  if (!sheet.date1) reasons.push("Record the day it was received first.");
  if (sheet.routeState === "NONE") reasons.push("No approval route is open for it: the module that raised it opens one.");
  if (sheet.routeState === "PENDING") reasons.push("Its approval route is waiting for a decision.");
  if (sheet.routeState === "REJECTED") reasons.push("Its approval route was refused: it goes on only on a resubmitted route.");
  if (sheet.routeState === "RECALLED") reasons.push("Its approval route was recalled before a decision: it goes on only on a new route.");
  const open = sheet.current.checks.filter((c) => !c.recorded).map((c) => c.def.labelEn);
  if (open.length) reasons.push(`Still to record in this round: ${open.join(", ")}.`);
  return reasons.length ? reasons.join(" ") : null;
}

function pinBlocker(form: Awaited<ReturnType<typeof templateNow>>, cert: LoadedCertificate["cert"]): string | null {
  const fs = pinRefusals(form, mergeFields(cert.kind), fieldsNamed, pinContextOf(cert));
  return fs.length ? refusalText("The first signature is refused:", fs) : null;
}

// ------------------------------------------------------------------ figures

function figureText(type: string, value: string | null): string {
  if (value == null) return "Not computed";
  if (type === "MONEY") return formatMoney(parseSen(value));
  if (type === "PERCENT") return `${value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`;
  if (type === "DAYS") return `${value} days`;
  if (type === "DATE") return formatDate(value);
  return value;
}

function FiguresPanel({ l, figures, people }: { l: LoadedCertificate; figures: Effective | null; people: Option[] }) {
  const cert = l.cert;
  const draft = cert.status === "DRAFT";
  const snap = readComputedSnapshot(cert.computedSnapshot);
  if (!figures || !snap) {
    return (
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Figures" subtitle="As the module that raised it computed them." />
        <EmptyState size="sm" title="No figures">This certificate carries no computed figures (a letter or a notice).</EmptyState>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FileIcon size={17} />}
        title="Figures"
        subtitle={`${snap.rule.en}, computed ${formatDate(snap.computedOn)}. ${draft ? "A line the calculation allows may be overridden while this is a draft, with its justification; totals are always recomputed from their lines." : "Frozen: nothing is overridden after the draft."}`}
        actions={figures.overridden ? <Badge tone="warn">Overridden</Badge> : undefined}
        divided
      />
      <ul className="divide-y divide-line/70">
        {figures.lines.map((f) => (
          <li key={f.key} className="flex flex-col gap-1.5 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold break-words text-ink">{f.labelEn}</span>
              {f.override && (
                <span className="block text-[12.5px] break-words text-ink-3">{`${CERT_WORDS.computed.en}: ${figureText(f.type, f.computed)}. Overridden for ${f.override.personName}: ${f.override.justification}`}</span>
              )}
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="tabular-nums text-[13.5px] text-ink">{figureText(f.type, f.value)}</span>
              {f.override && <Chip tone="warn">{CERT_WORDS.overridden.en}</Chip>}
              {draft && f.overridable && <OverrideDrawer certId={cert.id} fieldKey={f.key} label={f.labelEn} computed={figureText(f.type, f.computed)} people={people} />}
            </span>
          </li>
        ))}
        {figures.totals.map((t) => (
          <li key={t.key} className="flex flex-col gap-1.5 bg-sunken/60 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold break-words text-ink">{t.labelEn}</span>
              <span className="block text-[12.5px] text-ink-3">{t.value !== t.computed ? `Recomputed from the lines as they stand; as computed: ${figureText("MONEY", t.computed)}.` : "Recomputed from its lines: never overridden."}</span>
            </span>
            <span className="tabular-nums text-[13.5px] font-bold text-ink">{figureText("MONEY", t.value)}</span>
          </li>
        ))}
      </ul>
      {snap.routingRatio && (
        <CardBody className="border-t border-line/70">
          <p className="text-[12.5px] text-ink-3">{`${snap.routingRatio.labelEn}: ${ratioPercentText({ num: parseSen(snap.routingRatio.num), den: parseSen(snap.routingRatio.den) })}% (${formatMoney(parseSen(snap.routingRatio.num))} of ${formatMoney(parseSen(snap.routingRatio.den))}; judged on the exact amounts, never the rounded figure).`}</p>
        </CardBody>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ signatures

function SignaturesPanel({ l, blocks, pinned, formName, pinBlocker, people, today, officeName }: { l: LoadedCertificate; blocks: Block[]; pinned: TemplateRevision | null; formName: string | null; pinBlocker: string | null; people: Option[]; today: string | null; officeName: (code: string | null) => string }) {
  const cert = l.cert;
  const status = cert.status as CertificateStatus;
  const signed = signedOf(cert);
  const next = nextBlock(blocks, signed);
  const subtitle = pinned
    ? `In the printed order of ${pinned.nameEn}${pinned.formCode ? ` (${pinned.formCode})` : ""}, as pinned at the first signature on ${formatDate(pinned.pinnedOn)}. A later revision of the form does not move it.`
    : formName
      ? `In the printed order of ${formName} as it stands now. The first signature pins the form: its order and recipients do not move after it.`
      : "No form is chosen for this certificate: the module that raised it chooses one.";
  const notOpen = status === "DRAFT" || status === "IN_ROUTING" ? "Signatures open once the certificate is sent to signing." : status === "VOID" ? "The certificate is void." : null;
  const dateNow = certificateDateOf(blocks, signed);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ToolsIcon size={17} />}
        title="Signatures"
        subtitle={`${subtitle} ${CERT_WORDS.onBehalf.en}.`}
        actions={cert.certificateDate && status === "SIGNING" ? <CorrectDateDrawer certId={cert.id} current={formatDate(day(cert.certificateDate))} /> : undefined}
        divided={blocks.length > 0}
      />
      {blocks.length === 0 ? (
        <EmptyState size="sm" title="No signature blocks">{formName ? `${formName} has no blocks: add them in printed order under Configuration › Templates.` : "Nothing to sign until a form is chosen."}</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {blocks.map((b) => {
            const s = cert.signatures.find((x) => x.blockOrder === b.blockOrder);
            const isNext = next?.blockOrder === b.blockOrder;
            const who = b.officeRule === "NAMED_OFFICE" ? officeName(b.officeCode) : OFFICE_RULE_WORDS[b.officeRule].en;
            const delegation = !isPersonRule(b.officeRule) ? "Recorded from the paper, on the day it was signed." : b.delegable == null ? "Whether a delegate may sign it is not decided." : b.delegable ? "Or a delegate of the whole office." : "Never a delegate.";
            return (
              <li key={b.blockOrder} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">
                    <span className="break-words">{`${b.blockOrder}. ${b.labelEn}`}</span>
                    <Chip>{BLOCK_KIND_WORDS[b.blockKind].en}</Chip>
                    {b.datesCertificate && <Chip tone="info">Dates the certificate</Chip>}
                  </span>
                  {s ? (
                    <span className="block text-[12.5px] break-words text-ink-3">
                      {[
                        s.refused ? `Refused to sign: ${s.refusalNote}` : `${s.name}${s.officeLabel ? `, ${s.officeLabel}` : ""}`,
                        s.delegationId ? "under delegation" : null,
                        s.decision ? `${DECISION_WORDS[s.decision].en}${s.decisionCap ? ` up to ${formatMoney(parseSen(s.decisionCap.toString()))}` : ""}` : null,
                        s.icMasked ? `IC ${s.icMasked}` : null,
                        `signed ${formatDate(day(s.signedOn))}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : (
                    <span className="block text-[12.5px] break-words text-ink-3">{`${who}. ${delegation}`}</span>
                  )}
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {s ? (
                    <Chip tone={s.refused ? "warn" : "ok"}>{s.refused ? "Refusal recorded" : "Recorded"}</Chip>
                  ) : notOpen ? (
                    <Blocked label="Record" reason={notOpen} />
                  ) : status === "SIGNING" && isNext ? (
                    <SignatureDrawer certId={cert.id} block={b} people={people} today={today} blocker={pinBlocker ?? (today ? null : "Set the organisation's time zone first.")} />
                  ) : (
                    <Blocked label="Record" reason={next ? `Signatures follow the printed order: "${next.labelEn}" is recorded first.` : "Every block is recorded."} />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <CardBody className="border-t border-line/70">
        <KeyValues
          columns={2}
          items={[
            { label: "Certificate date", value: cert.certificateDate ? <span className="flex flex-col gap-1"><span>{formatDate(day(cert.certificateDate))}</span>{cert.certificateDateCorrectedFrom && <Chip tone="info">{`Corrected from ${formatDate(day(cert.certificateDateCorrectedFrom))}: ${cert.certificateDateCorrectionReason}`}</Chip>}</span> : dim(dateNow.state === "NO_DATING_BLOCK" ? CERT_WORDS.notDatedBySignature.en : CERT_WORDS.dateWhenSigned.en) },
            { label: "Certifies money", value: certifiesMoney(readComputedSnapshot(cert.computedSnapshot)) ? "Yes: a delegate with instruction authority only does not sign it" : "No" },
          ]}
        />
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ routing sheet

function RoutingPanel({ l, sheet, people, today }: { l: LoadedCertificate; sheet: Sheet | null; people: Option[]; today: string | null }) {
  const cert = l.cert;
  const status = cert.status as CertificateStatus;
  if (!cert.routingTypeId) {
    return (
      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="Routing sheet" />
        <EmptyState size="sm" title="No routing sheet">{CERT_WORDS.noRoute.en}. It goes from its draft straight to signing.</EmptyState>
      </Card>
    );
  }
  if (!sheet) {
    return (
      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title="Routing sheet" subtitle={cert.routingType?.labelEn} />
        <EmptyState size="sm" title="Not started">The sheet starts when the certificate is sent for routing: its type, checks and targets are frozen then.</EmptyState>
      </Card>
    );
  }
  const open = status === "IN_ROUTING";
  return (
    <RoutingSheetView
      sheet={sheet}
      open={open}
      headerAction={open ? <ReceivedDrawer certId={cert.id} today={today} current={sheet.date1} /> : undefined}
      checkAction={(def) => <CheckDrawer certId={cert.id} defOrder={def.order} label={def.labelEn} office={def.officeLabel} people={people} today={today} blocker={sheet.date1 ? null : "Record the day it was received first."} />}
      routeNote="No approval route opened for this round: the module that raised the certificate opens it on the approval matrix."
    />
  );
}

// ------------------------------------------------------------------ distribution

function DistributionPanel({ l, today }: { l: LoadedCertificate; today: string | null }) {
  const cert = l.cert;
  const issued = cert.status === "ISSUED";
  const state = distributionState(cert.copies.map((c) => ({ mandatory: !!c.mandatory, ackRequired: !!c.ackRequired, despatchedOn: day(c.despatchedOn), acknowledgedOn: day(c.acknowledgedOn) })));
  const skipped = ((cert.issueSnapshot as { skipped?: { recipientName: string; why: string }[] } | null)?.skipped ?? []);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<InboxIcon size={17} />}
        title="Distribution"
        subtitle={issued ? "The pinned list, resolved on the day of issue into addressed copies." : "Copies are made from the pinned list when the certificate is issued."}
        actions={issued ? <Badge tone={state.distributed ? "ok" : "warn"}>{state.distributed ? (state.awaitingAck ? `Distributed · ${state.awaitingAck} acknowledgement${state.awaitingAck === 1 ? "" : "s"} outstanding` : "Distributed") : `Not distributed: ${state.undespatchedMandatory} mandatory to send`}</Badge> : undefined}
        divided={cert.copies.length > 0}
      />
      {cert.copies.length === 0 ? (
        <EmptyState size="sm" title={issued ? "No copies" : "Not issued yet"}>{issued ? "The list resolved to no copy." : "Nothing goes out before issue."}</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {cert.copies.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">
                  <span className="break-words">{`${c.copyNo}. ${c.recipientName}`}</span>
                  {c.isOriginal && <Chip tone="info">Original</Chip>}
                  {c.mandatory ? <Chip>Mandatory</Chip> : <Chip>Optional</Chip>}
                </span>
                <span className="block text-[12.5px] break-words text-ink-3">
                  {[`Addressed to ${c.addressedTo}`, c.despatchedOn ? `${METHOD_WORDS[c.method as DeliveryMethod]?.en ?? "Sent"}, ${formatDate(day(c.despatchedOn))}` : "Not sent", c.ackRequired ? (c.acknowledgedOn ? `acknowledged ${formatDate(day(c.acknowledgedOn))}` : "acknowledgement awaited") : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-2">
                {!c.despatchedOn ? <DespatchDrawer certId={cert.id} copyId={c.id} label={c.recipientName} today={today} /> : c.ackRequired && !c.acknowledgedOn ? <AcknowledgeDrawer certId={cert.id} copyId={c.id} label={c.recipientName} today={today} /> : <Chip tone="ok">Done</Chip>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {skipped.length > 0 && (
        <CardBody className="border-t border-line/70">
          <p className="text-[12.5px] text-ink-3">{`Not sent, as the list says: ${skipped.map((s) => `${s.recipientName} (${s.why === "NO_LIVE_BOND" ? "no performance bond was live on the day of issue" : "no consulting engineer is engaged"})`).join("; ")}.`}</p>
        </CardBody>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ print

function PrintPanel({ l, figures, revision, formBody }: { l: LoadedCertificate; figures: Effective | null; revision: TemplateRevision | null; formBody: { en: string | null; ms: string | null; name: string } | null }) {
  const cert = l.cert;
  if (cert.status === "ISSUED" && cert.documents.length) {
    return (
      <div className="flex flex-col gap-6">
        {cert.documents.map((d) => (
          <Card key={d.id}>
            <CardHeader icon={<PrinterIcon size={17} />} title={d.language === "MS" ? "Malay text, as issued" : "English text, as issued"} subtitle={`${d.templateName}${d.templateFormCode ? ` · ${d.templateFormCode}` : ""}${d.templateRevisionDate ? ` · revision ${formatDate(day(d.templateRevisionDate))}` : ""} · form version ${d.templateBodyVersion} · frozen ${formatOrgDateTime(d.frozenAt, l.org.timeZone)}`} />
            <CardBody>
              <div className="flex flex-col gap-3 text-[13.5px] whitespace-pre-line text-ink">{d.renderedText.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }
  const body = revision ? { en: revision.bodyEn, ms: revision.bodyMs, name: revision.nameEn } : formBody;
  const texts = body ? ([["MS", body.ms], ["EN", body.en]] as const).filter(([, b]) => b && b.trim()) : [];
  if (!body || texts.length === 0) {
    return (
      <Card>
        <CardHeader icon={<PrinterIcon size={17} />} title="Print" />
        <EmptyState size="sm" title="No text">{body ? `${body.name} has no text yet: it is written under Configuration › Templates.` : "No form is chosen for this certificate."}</EmptyState>
      </Card>
    );
  }
  const b = cert.baseline;
  const values = (lang: "EN" | "MS") =>
    certificateFieldValues({
      lang,
      organisationName: ORGANISATION_NAME,
      contract: { number: l.contract.number, title: l.ex.title, contractorName: l.award.awardeeName },
      baseline: { contractSum: b.contractSum.toString(), contractDate: day(b.contractDate), completionPeriod: b.completionPeriod, completionUnit: b.completionUnit },
      certificate: { kind: cert.kind, number: null, sequence: null, date: day(cert.certificateDate) },
      figures: figures ?? { lines: [], totals: [] },
    });
  const keys = mergeFields(cert.kind);
  return (
    <div className="flex flex-col gap-6">
      {texts.map(([lang, text]) => {
        // Before issue the number and the date are not yet the certificate's: said so in the text, never invented.
        const v = { ...values(lang), "certificate.number": "(number allocated on issue)", "certificate.sequence": "(on issue)", ...(cert.certificateDate ? {} : { "certificate.date": "(the day of the authorising signature)" }) };
        const r = renderWith(text!, v, { has: (k) => keys.has(k), label: (k) => certificateFieldLabel(k) });
        return (
          <Card key={lang}>
            <CardHeader icon={<PrinterIcon size={17} />} title={lang === "MS" ? "Malay text" : "English text"} subtitle={`${body.name}${revision ? ", as pinned" : ", as the form stands now"}`} actions={<Badge tone="warn">{CERT_WORDS.draftNotIssued.en}</Badge>} />
            <CardBody>
              <div className="flex flex-col gap-3 text-[13.5px] whitespace-pre-line text-ink-2">{r.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ history

const ACTION_LABEL = { CREATE: "Created", UPDATE: "Changed", DELETE: "Removed" } as const;
const ENTITY_LABEL: Record<string, string> = { Certificate: "Certificate", CertificateSignature: "Signature", CertificateOverride: "Override", RoutingCheck: "Routing check", IssuedCopy: "Copy" };

/// A SULIT field's value (an override's figures, a supported-up-to amount) shown with the chip (R-7).
const chipped = (field: string, value: string | null, entity: string) => (isSulitField(field) && value ? <SulitValue>{historyValue(field, value, formatDate, entity)}</SulitValue> : historyValue(field, value, formatDate, entity));

function HistoryPanel({ entries, total, timeZone }: { entries: { id: string; entity: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; reason: string; changes: unknown }[]; total: number; timeZone: string | null }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<CheckIcon size={17} />} title="History" subtitle={`${total > entries.length ? `Showing the latest ${entries.length} of ${total} changes. ` : "Every change to this certificate. "}Nobody is signed in, so no change is attributed. Identity-card numbers are masked.`} divided={entries.length === 0} />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes">Changes made through the portal appear here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={e.action === "CREATE" ? "ok" : e.action === "DELETE" ? "err" : "info"}>{ACTION_LABEL[e.action]}</Badge>
                <span className="font-semibold text-ink">{ENTITY_LABEL[e.entity] ?? "Record"}</span>
                <span className="min-w-0 break-words text-ink-2">{e.entityLabel}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatOrgDay(e.at, timeZone)}</span>
              </div>
              <ul className="text-[12.5px] break-words text-ink-3">
                {((e.changes ?? []) as { field: string; before: string | null; after: string | null }[])
                  .filter((ch) => !/(Code|Key|Id)$/.test(ch.field))
                  .map((ch) => (
                    <li key={ch.field}>
                      {historyFieldLabel(ch.field, e.entity)}: {(e.action === "UPDATE" || ch.before != null) && <>{chipped(ch.field, ch.before, e.entity)} → </>}
                      <span className="text-ink-2">{chipped(ch.field, e.action === "DELETE" ? ch.before : ch.after, e.entity)}</span>
                    </li>
                  ))}
              </ul>
              {e.reason && <p className="text-[12.5px] text-ink-3">Reason: {e.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
