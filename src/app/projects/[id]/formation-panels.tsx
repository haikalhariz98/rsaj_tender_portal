import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { CheckIcon, FileIcon, InboxIcon, ScaleIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { maskIc, MASKING_NOTE } from "@/lib/award/mask";
import { missingMandatory, recipientsFor, liveCopy } from "@/lib/contract/copies";
import { custodyState } from "@/lib/contract/custody";
import { contractFaultText } from "@/lib/contract/fault-text";
import { arithmeticVariance, completeFaults, frontLoadingItems, type RateFacts } from "@/lib/contract/formation";
import type { signingFacts } from "@/lib/contract/judge";
import { reviewsOf } from "@/lib/contract/judge";
import { CHECK_WORDS, COMPARISON_WORDS, CUSTODY_KIND_WORDS, DECISION_WORDS, OUTCOME_WORDS } from "@/lib/contract/labels";
import { openReview, submitFaults } from "@/lib/contract/legal";
import { liveOf } from "@/lib/contract/load";
import { readFormationSnapshot } from "@/lib/contract/preparation";
import type { LoadedContract } from "@/lib/contract/repo";
import { contractorSignFaults, stampFaults } from "@/lib/contract/sign";
import { isExecuted } from "@/lib/contract/status";
import { RECONCILIATION_COMPARISONS, type ContractStatus, type FormationCheckKind } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { formatPct } from "@/lib/tender-docs/percent";
import { INSURANCE_KIND_LABEL, SECURITY_KIND_LABEL } from "@/lib/award/labels";

import {
  AcknowledgeCopyDrawer,
  AmendmentDrawer,
  BriefingDrawer,
  CompleteCheckDrawer,
  ConsultingEngineerDrawer,
  ContractorSignatureDrawer,
  CorrectDateDrawer,
  CorrectionDrawer,
  DecideLegalDrawer,
  DespatchCopyDrawer,
  IssueCopyDrawer,
  MoveOriginalDrawer,
  PartDrawer,
  RateDrawer,
  RecallCopyDrawer,
  ReconciliationDrawer,
  RegisterOriginalDrawer,
  ReissueCopyDrawer,
  RemoveLineDrawer,
  RsajSignatureDrawer,
  StampingDrawer,
  SubmitLegalDrawer,
} from "./editors";

export const FORMATION_SECTIONS = [
  { id: "assembly", label: "Assembly" },
  { id: "checks", label: "Reconciliation and checks" },
  { id: "legal", label: "Legal review" },
  { id: "signing", label: "Signing" },
  { id: "copies", label: "Copies and custody" },
] as const;
export type FormationSection = (typeof FORMATION_SECTIONS)[number]["id"];

type Option = { value: string; label: string };
type Facts = Awaited<ReturnType<typeof signingFacts>>;
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const notSet = (what = "Not set") => <span className="text-ink-4">{what}</span>;
const open = (s: string) => s === "IN_PREPARATION" || s === "RETURNED_FOR_AMENDMENT";
const money = (v: { toString(): string }) => formatMoney(senFromDecimal(v));

export function FormationPanel({ l, section, facts, people, today }: { l: LoadedContract; section: FormationSection; facts: Facts; people: Option[]; today: string | null }) {
  const status = l.contract.status as ContractStatus;
  const notStarted = status === "NUMBER_ALLOCATED";
  return (
    <div className="flex flex-col gap-6">
      {notStarted && (
        <Callout tone="info" title="Preparation has not started">
          Start it on the Overview: it freezes what the contract is formed under. Nothing below is recorded before then.
        </Callout>
      )}
      {!notStarted && section === "assembly" && <AssemblySection l={l} facts={facts} />}
      {!notStarted && section === "checks" && <ChecksSection l={l} facts={facts} people={people} today={today} />}
      {!notStarted && section === "legal" && <LegalSection l={l} facts={facts} people={people} today={today} />}
      {!notStarted && section === "signing" && <SigningSection l={l} facts={facts} people={people} today={today} />}
      {!notStarted && section === "copies" && <CopiesSection l={l} people={people} today={today} />}
    </div>
  );
}

// ------------------------------------------------------------------ assembly

function AssemblySection({ l, facts }: { l: LoadedContract; facts: Facts }) {
  const c = l.contract;
  const faults = facts.form.faults.filter((f) => f.code === "NO_PARTS" || f.code === "CANCELLED_WITHOUT_STATEMENT");
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<FileIcon size={17} />} title="The Contract Document" subtitle={`In the order prescribed for ${facts.form.snap?.basis.name ?? "its basis"}, as configured when preparation started.`} actions={<Badge tone={faults.length ? "warn" : "ok"}>{faults.length ? "Not complete" : "Complete"}</Badge>} divided={c.assemblyParts.length === 0} />
      {faults.length > 0 && <div className="px-5 pt-3 sm:px-6"><Callout tone="warn" title="Not complete">{faults.map(contractFaultText).join(" ")}</Callout></div>}
      {c.assemblyParts.length === 0 ? (
        <EmptyState size="sm" title="No parts">None were configured for the basis when preparation started.</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {c.assemblyParts.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold break-words text-ink">{[p.printedNumber, p.labelSnapshot].filter(Boolean).join(". ")}</span>
                {p.state === "CANCELLED_BY_ALTERNATIVE" && <span className="block text-[12.5px] break-words text-ink-3">{p.cancelledStatement ? `Cancelled by the accepted alternative: ${p.cancelledStatement}` : "Cancelled by the accepted alternative, without saying what it cancels."}</span>}
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-2">
                <Chip tone={p.state === "READY" ? "ok" : p.cancelledStatement ? "info" : "warn"}>{p.state === "READY" ? "As tendered" : "Cancelled by the alternative"}</Chip>
                {open(c.status) && <PartDrawer id={c.id} part={{ id: p.id, label: p.labelSnapshot, state: p.state, statement: p.cancelledStatement }} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ reconciliation and checks

function ChecksSection({ l, facts, people, today }: { l: LoadedContract; facts: Facts; people: Option[]; today: string | null }) {
  const c = l.contract;
  const editable = open(c.status);
  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader icon={<ScaleIcon size={17} />} title="Reconciliation" subtitle="The Contract Document against the Tender Document and the Tender Table Document, and the drawings, with every tender-stage addendum." />
        <ul className="divide-y divide-line/70">
          {RECONCILIATION_COMPARISONS.map((cmp) => {
            const r = c.reconciliations.find((x) => x.comparison === cmp);
            const addenda = (r?.addendaSnapshot ?? []) as { number: number | null; title: string; issuedOn: string | null }[];
            return (
              <li key={cmp} className="flex flex-col gap-2 px-5 py-3 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-ink">{COMPARISON_WORDS[cmp].en}</span>
                    <span className="block text-[12.5px] break-words text-ink-3">
                      {r ? [OUTCOME_WORDS[r.outcome].en, `checked by ${r.checkedBy.name} on ${formatDate(r.checkedOn)} (recorded on their behalf)`, addenda.length ? `addenda taken in: ${addenda.map((a) => `No. ${a.number ?? "?"} ${a.title}`).join("; ")}` : "no tender-stage addendum issued", r.note || null].filter(Boolean).join(" · ") : "Not recorded"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {editable && <ReconciliationDrawer id={c.id} comparison={cmp} label={COMPARISON_WORDS[cmp].en} people={people} today={today} current={r ? { outcome: r.outcome, personId: r.checkedByPersonId, checkedOn: storedDay(r.checkedOn), note: r.note } : undefined} />}
                    {editable && r?.outcome === "AMENDED" && <AmendmentDrawer id={c.id} reconciliationId={r.id} people={people} today={today} />}
                  </span>
                </div>
                {r && r.amendments.length > 0 && (
                  <ul className="ml-1 flex flex-col gap-1 border-l-2 border-line pl-3">
                    {r.amendments.map((a) => (
                      <li key={a.id} className="text-[12.5px] break-words text-ink-3">
                        <span className="text-ink-2">{a.description}</span> · signed for the contractor by {a.contractorSignatoryName} on {formatDate(a.contractorSignedOn)}, by {a.officer.name} on {formatDate(a.officerSignedOn)} (recorded on their behalf, not signed)
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line p-4 sm:p-5">
          <OwnerAttachments owner={{ kind: "contract", id: c.id }} title="The signed reconciliation" only={["RECONCILIATION"]} />
        </div>
      </Card>
      {(facts.form.applicable ?? []).map((kind) => {
        const k = c.checks.find((x) => x.kind === kind);
        return k ? <CheckCard key={kind} l={l} check={k} people={people} today={today} editable={editable} preparationOn={facts.form.snap?.startedOn ?? null} applicable={facts.form.applicable} /> : null;
      })}
    </>
  );
}

function CheckCard({ l, check: k, people, today, editable, preparationOn, applicable }: { l: LoadedContract; check: LoadedContract["contract"]["checks"][number]; people: Option[]; today: string | null; editable: boolean; preparationOn: string | null; applicable: readonly FormationCheckKind[] | null }) {
  const c = l.contract;
  const kind = k.kind as FormationCheckKind;
  const done = !!k.completedOn;
  const rates: (RateFacts & { id: string; description: string })[] = k.rates.map((x) => ({ id: x.id, itemRef: x.itemRef, description: x.description, tenderedRate: senFromDecimal(x.tenderedRate), estimateRate: senFromDecimal(x.estimateRate), provisional: x.provisional }));
  const ratio = k.ratioSnapshot == null ? null : k.ratioSnapshot.toString();
  const fl = kind === "FRONT_LOADING" ? frontLoadingItems(rates, ratio) : null;
  const variance = kind === "ARITHMETIC" ? arithmeticVariance(k.corrections.map((x) => ({ tendered: senFromDecimal(x.tendered), corrected: senFromDecimal(x.corrected) }))) : null;
  const blocker = today && !done ? completeFaults({ kind, applicable, completedOn: null, on: today, today, preparationOn: preparationOn ?? today, note: "-", rates, ratio }).filter((f) => f.code !== "FRONT_LOADING_NOTE_REQUIRED") : [];
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<CheckIcon size={17} />}
        title={CHECK_WORDS[kind].en}
        subtitle={done ? `Complete: ${k.completedBy?.name ?? "an officer"}, ${formatDate(k.completedOn)} (recorded on their behalf).${k.note ? ` ${k.note}` : ""}` : "Not complete."}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {editable && !done && kind === "ARITHMETIC" && <CorrectionDrawer id={c.id} checkId={k.id} />}
            {editable && !done && kind === "FRONT_LOADING" && <RateDrawer id={c.id} checkId={k.id} />}
            {editable && !done && <CompleteCheckDrawer id={c.id} checkId={k.id} label={CHECK_WORDS[kind].en} people={people} today={today} blocker={blocker.length ? blocker.map(contractFaultText).join(" ") : null} noteHint={kind === "FRONT_LOADING" ? "Say what was done about the rates listed, or, with no ratio set, how they were judged." : "Optional."} />}
            {done && <Badge tone="ok">Complete</Badge>}
          </span>
        }
        divided={kind === "ARITHMETIC" ? k.corrections.length === 0 : kind === "FRONT_LOADING" ? rates.length === 0 : true}
      />
      {kind === "ARITHMETIC" && k.corrections.length > 0 && (
        <>
          <ul className="divide-y divide-line/70">
            {k.corrections.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{[x.itemRef, x.description].filter(Boolean).join(" · ")}</span>
                  {/* The priced figures are SULIT (6.8's correctedPrice precedent): shown with the chip. */}
                  <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] break-words text-ink-3">
                    <SulitValue>{`${money(x.tendered)} as tendered → ${money(x.corrected)} corrected`}</SulitValue>
                    <span>{x.reason}</span>
                  </span>
                </span>
                {editable && !done && <RemoveLineDrawer id={c.id} checkId={k.id} lineId={x.id} label={`correction ${x.itemRef}`} />}
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-5 py-3 text-[13px] text-ink-2 sm:px-6">Variance against the tendered figures: <span className="font-semibold tabular-nums">{variance! < 0n ? `−${formatMoney(-variance!)}` : `+${formatMoney(variance!)}`}</span>. The accepted contract sum stands (an assumed reading, to be confirmed).</div>
        </>
      )}
      {kind === "FRONT_LOADING" && (
        <>
          <div className="px-5 py-3 text-[12.5px] text-ink-3 sm:px-6">{ratio ? `Rates above ${formatPct(ratio).replace(/%$/, "")} times the estimate rate are listed, as frozen when preparation started. Rates exactly at it are listed apart: the configuration does not say which side the multiple falls.` : "No ratio was set when preparation started: nothing is listed for you, and the check is the officer's judgement, recorded in the note."}</div>
          {rates.length > 0 && (
            <ul className="divide-y divide-line/70 border-t border-line">
              {rates.map((x) => {
                // By the line itself: two lines with the same item and rate are two lines (6.12 review).
                const above = fl?.state === "JUDGED" && fl.above.some((y) => y.id === x.id);
                const at = fl?.state === "JUDGED" && fl.atRatio.some((y) => y.id === x.id);
                return (
                  <li key={x.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold break-words text-ink">{[x.itemRef, x.description, x.provisional ? "provisionally measured" : null].filter(Boolean).join(" · ")}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
                        <span className="tabular-nums">{`Tendered ${formatMoney(x.tenderedRate)}`}</span>
                        <span>against an estimate rate of</span>
                        <SulitValue>{formatMoney(x.estimateRate)}</SulitValue>
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      {above && <Chip tone="warn">Above the ratio</Chip>}
                      {at && <Chip tone="info">Exactly at the ratio</Chip>}
                      {editable && !done && <RemoveLineDrawer id={c.id} checkId={k.id} lineId={x.id} label={`rate ${x.itemRef}`} />}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ legal review

function LegalSection({ l, facts, people, today }: { l: LoadedContract; facts: Facts; people: Option[]; today: string | null }) {
  const c = l.contract;
  const reviews = reviewsOf(c);
  const pending = openReview(reviews);
  const docs = liveOf(c, "LEGAL_SUBMISSION");
  const fs = submitFaults({ status: c.status as ContractStatus, officeCode: facts.form.snap?.policy.legalOfficeCode ?? null, submissionDocuments: docs.length, formationFaults: facts.form.faults.length, reviews });
  const canSend = c.status === "IN_PREPARATION" || c.status === "RETURNED_FOR_AMENDMENT";
  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<ScaleIcon size={17} />}
          title={`Legal review by ${facts.form.snap?.policy.legalOfficeLabel ?? "the legal office"}`}
          subtitle="Signature is refused until endorsed. Each submission pins the documents it went with; no limit on iterations and no timeout."
          actions={
            pending ? <DecideLegalDrawer id={c.id} iteration={pending.iteration} people={people} today={today} /> : canSend ? <SubmitLegalDrawer id={c.id} office={facts.form.snap?.policy.legalOfficeLabel ?? "the legal office"} people={people} blocker={fs.length ? fs.map(contractFaultText).join(" ") : null} documents={docs.map((d) => `${d.version.document.title} (version ${d.version.versionNo})`).join("; ") || "none attached"} /> : undefined
          }
          divided={reviews.length === 0}
        />
        {canSend && facts.form.faults.length > 0 && <div className="px-5 pt-3 sm:px-6"><Callout tone="warn" title="Formation is not complete">{facts.form.faults.map(contractFaultText).join(" ")}</Callout></div>}
        {reviews.length === 0 ? (
          <EmptyState size="sm" title="Not sent">Attach what goes to the legal office below, then send it.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {[...c.legalReviews].reverse().map((r) => {
              const pinned = (r.pinnedVersions ?? []) as { title: string; versionNo: number }[];
              return (
                <li key={r.id} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-ink">{`Iteration ${r.iteration}`}</span>
                    <Chip tone={r.decision === "ENDORSED" ? "ok" : r.decision === "RETURNED" ? "warn" : "info"}>{r.decision ? DECISION_WORDS[r.decision].en : "With the legal office"}</Chip>
                  </span>
                  <span className="text-[12.5px] break-words text-ink-3">{`Sent ${formatDate(r.submittedOn)} by ${r.submittedBy.name}, with ${pinned.map((p) => `${p.title} (version ${p.versionNo})`).join("; ") || "nothing pinned"}.`}</span>
                  {r.decision && <span className="text-[12.5px] break-words text-ink-3">{`${DECISION_WORDS[r.decision].en} ${formatDate(r.decidedOn)} by ${r.reviewer?.name ?? "the legal office"} (recorded on their behalf).${r.comments ? ` Comments: ${r.comments}` : ""}`}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <OwnerAttachments owner={{ kind: "contract", id: c.id }} title="To and from the legal office" subtitle="What goes for review (pinned at each submission) and the comments that come back." only={["LEGAL_SUBMISSION", "LEGAL_COMMENTS"]} />
    </>
  );
}

// ------------------------------------------------------------------ signing

function SigningSection({ l, facts, people, today }: { l: LoadedContract; facts: Facts; people: Option[]; today: string | null }) {
  const c = l.contract;
  const status = c.status as ContractStatus;
  const contractor = c.signatures.find((s) => s.party === "CONTRACTOR");
  const witness = c.signatures.find((s) => s.party === "WITNESS");
  const rsaj = c.signatures.find((s) => s.party === "RSAJ");
  const executed = isExecuted(status);
  const endorsedOn = reviewsOf(c).filter((x) => x.decision === "ENDORSED").sort((a, b) => b.iteration - a.iteration)[0]?.decidedOn ?? null;
  const contractorBlock = today ? contractorSignFaults({ status, gate: facts.gate, resolutionLive: facts.inputs.resolutionLive, alreadySigned: !!contractor, signatory: { name: "-", icNumber: "000000-00-0000" }, witness: { name: "-", icNumber: "000000-00-0000" }, signedOn: today, today, endorsedOn }) : [];
  const rsajBlock = facts.faults;
  const office = facts.signatory?.ok ? facts.signatory.roleLabel : "the office the approval matrix names";
  const stampBlock = today ? stampFaults({ status, stampedOn: today, reference: "-", contractDate: day(c.contractDate), today }).filter((f) => f.code !== "BEFORE_CONTRACT_DATE") : [];
  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="Before signature" subtitle="The company resolution or other proof of signing authority is on file before the contractor's signature can be recorded." />
        <div className="p-4 sm:p-5">
          <OwnerAttachments owner={{ kind: "contract", id: c.id }} title="Company resolution" only={["COMPANY_RESOLUTION"]} required={{ COMPANY_RESOLUTION: !executed }} />
        </div>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Signatures"
          subtitle="Recorded on behalf of the signers, not signed: nobody signs in yet."
          actions={
            !executed && status !== "CANCELLED" ? (
              <span className="flex flex-wrap items-center gap-2">
                {!contractor && (contractorBlock.length ? <Blocked label="Record the contractor's signature" reason={contractorBlock.map(contractFaultText).join(" ")} /> : <ContractorSignatureDrawer id={c.id} today={today} blocker={null} />)}
                {contractor && (rsajBlock.length ? <Blocked label="Record the signature and execute" reason={rsajBlock.map(contractFaultText).join(" ")} primary /> : <RsajSignatureDrawer id={c.id} office={office} people={people} blocker={null} contractDate={today ? formatDate(today) : "today"} />)}
              </span>
            ) : undefined
          }
        />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "For the contractor", value: contractor ? `${contractor.name}${contractor.capacity ? `, ${contractor.capacity}` : ""} · IC ${maskIc(contractor.icNumber)} · ${formatDate(contractor.signedOn)}` : notSet("Not recorded") },
              { label: "Witness", value: witness ? `${witness.name} · IC ${maskIc(witness.icNumber)}` : notSet("Not recorded") },
              { label: "For the employer", value: rsaj ? `${rsaj.name}, ${rsaj.roleLabel ?? "the signing office"}${rsaj.delegationId ? " (under a delegation)" : ""} · ${rsaj.ruleLabel ?? ""}` : notSet(`Not recorded: signed by ${office}`) },
              { label: "Contract Date", value: c.contractDate ? <span className="flex flex-col items-start gap-1"><span>{formatDate(day(c.contractDate))}</span>{c.contractDateCorrectedFrom && <Chip tone="info">{`Corrected from ${formatDate(day(c.contractDateCorrectedFrom))}`}</Chip>}{executed && status !== "CANCELLED" && <CorrectDateDrawer id={c.id} current={formatDate(day(c.contractDate))} />}</span> : notSet("The day the signature for the employer is recorded") },
            ]}
          />
          <p className="mt-3 text-[12px] text-ink-3">{MASKING_NOTE}</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Stamping at LHDN" subtitle="Fully executed once the stamping day and the LHDN reference are both recorded." actions={status === "EXECUTED" ? (stampBlock.length ? <Blocked label="Record stamping" reason={stampBlock.map(contractFaultText).join(" ")} /> : <StampingDrawer id={c.id} today={today} />) : c.stampedOn ? <Badge tone="ok">Stamped</Badge> : undefined} />
        <CardBody>
          <KeyValues columns={2} items={[{ label: "Stamped on", value: c.stampedOn ? formatDate(c.stampedOn) : notSet("Not recorded") }, { label: "LHDN reference", value: c.stampingRef || notSet("Not recorded") }]} />
        </CardBody>
      </Card>
      {executed && <OwnerAttachments owner={{ kind: "contract", id: c.id }} title="The executed contract" only={["SIGNED_CONTRACT", "STAMPING_CERTIFICATE"]} />}
      <Card>
        <CardHeader icon={<UsersIcon size={17} />} title="Integrity Pact, Stage Three" subtitle="The briefing at signing. It does not block signing; a signed contract without it is shown so." actions={!c.briefing && ["LEGALLY_ENDORSED", "EXECUTED", "STAMPED", "ACTIVE"].includes(status) ? <BriefingDrawer id={c.id} people={people} today={today} /> : undefined} />
        <CardBody>
          {c.briefing ? (
            <KeyValues columns={2} items={[{ label: "Held on", value: formatDate(c.briefing.heldOn) }, { label: "For the employer", value: c.briefing.participantNames.join(", ") }, { label: "For the contractor", value: c.briefing.contractorAttendees.join(", ") }, { label: "Note", value: c.briefing.note || notSet("None") }]} />
          ) : (
            <p className="text-[13px] text-ink-3">Not recorded.</p>
          )}
        </CardBody>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ copies and custody

function CopiesSection({ l, people, today }: { l: LoadedContract; people: Option[]; today: string | null }) {
  const c = l.contract;
  const status = c.status as ContractStatus;
  const snap = readFormationSnapshot(c.formationSnapshot);
  const recipients = snap?.recipients ?? [];
  const list = recipientsFor(recipients, c.consultingEngineer);
  const facts2 = c.copies.map((x) => ({ id: x.id, copyNo: x.copyNo, recipientId: x.recipientId, despatchedOn: day(x.despatchedOn), acknowledgedOn: day(x.acknowledgedOn), recalledOn: day(x.recalledOn), reissuedAs: c.copies.find((y) => y.reissueOfId === x.id)?.id ?? null }));
  const missing = list === "CONSULTANT_NOT_ANSWERED" ? [] : missingMandatory(list, facts2);
  const executed = isExecuted(status);
  const issuable = list === "CONSULTANT_NOT_ANSWERED" ? [] : list.filter((r) => !facts2.some((x) => x.recipientId === r.id && liveCopy(x)));
  const issueBlock = !executed ? "The contract is not executed yet." : list === "CONSULTANT_NOT_ANSWERED" ? "Say whether a consulting engineer is engaged first." : issuable.length === 0 ? "Every recipient holds a live copy." : null;
  const originals: Option[] = [
    ...(executed && !c.custodyItems.some((i) => i.kind === "CONTRACT") ? [{ value: "CONTRACT:", label: CUSTODY_KIND_WORDS.CONTRACT.en }] : []),
    ...c.securities.filter((s) => s.status === "VERIFIED" && !c.custodyItems.some((i) => i.securityId === s.id)).map((s) => ({ value: `SECURITY:${s.id}`, label: `${SECURITY_KIND_LABEL[s.kind]} ${s.instrumentRef}`.trim() })),
    ...c.policies.filter((p) => p.status === "VERIFIED" && !c.custodyItems.some((i) => i.policyId === p.id)).map((p) => ({ value: `POLICY:${p.id}`, label: `${INSURANCE_KIND_LABEL[p.kind]} ${p.policyNo}`.trim() })),
  ];
  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<InboxIcon size={17} />}
          title="Controlled copies"
          subtitle={`Numbered, stamped "${snap?.policy.stampEn ?? ""}", addressed and logged. The list and the stamp are as frozen when preparation started.`}
          actions={status !== "CANCELLED" ? (issueBlock ? <Blocked label="Issue a copy" reason={issueBlock} /> : <IssueCopyDrawer id={c.id} recipients={issuable.map((r) => ({ value: r.id, label: r.name }))} today={today} blocker={null} />) : undefined}
        />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Consulting engineer engaged", value: <span className="flex flex-wrap items-center gap-2">{c.consultingEngineer == null ? notSet("Not answered: nothing is distributed until it is") : c.consultingEngineer ? "Yes" : "No"}{status !== "CANCELLED" && c.copies.length === 0 && <ConsultingEngineerDrawer id={c.id} current={c.consultingEngineer} />}</span> },
              { label: "Distribution", value: !executed ? notSet("After execution") : list === "CONSULTANT_NOT_ANSWERED" ? notSet("Waiting on the consulting engineer answer") : missing.length ? `Not complete: ${missing.map((r) => r.name).join(", ")}` : "Complete: every mandatory recipient holds a live copy" },
            ]}
          />
        </CardBody>
        {c.copies.length > 0 && (
          <ul className="divide-y divide-line/70 border-t border-line">
            {c.copies.map((x) => {
              const f = facts2.find((y) => y.id === x.id)!;
              const replaced = c.copies.find((y) => y.id === x.reissueOfId);
              return (
                <li key={x.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold break-words text-ink">{`Copy ${x.copyNo} · ${x.recipientName}`}</span>
                    <span className="block text-[12.5px] break-words text-ink-3">{[x.addressedTo, x.copyForm || null, x.despatchedOn ? `despatched ${formatDate(x.despatchedOn)}` : "not despatched", x.acknowledgedOn ? `acknowledged ${formatDate(x.acknowledgedOn)}` : null, replaced ? `reissue of copy ${replaced.copyNo}` : null, x.recalledOn ? `recalled ${formatDate(x.recalledOn)}: ${x.recallReason}` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    <Chip tone={x.recalledOn ? "warn" : x.acknowledgedOn ? "ok" : "info"}>{x.recalledOn ? "Recalled" : x.acknowledgedOn ? "Acknowledged" : x.despatchedOn ? "Despatched" : "Issued"}</Chip>
                    {status !== "CANCELLED" && !x.recalledOn && !x.despatchedOn && <DespatchCopyDrawer id={c.id} copyId={x.id} copyNo={x.copyNo} today={today} />}
                    {status !== "CANCELLED" && !x.recalledOn && x.despatchedOn && !x.acknowledgedOn && <AcknowledgeCopyDrawer id={c.id} copyId={x.id} copyNo={x.copyNo} today={today} />}
                    {status !== "CANCELLED" && !x.recalledOn && <RecallCopyDrawer id={c.id} copyId={x.id} copyNo={x.copyNo} today={today} />}
                    {status !== "CANCELLED" && x.recalledOn && !f.reissuedAs && <ReissueCopyDrawer id={c.id} copyId={x.id} copyNo={x.copyNo} addressedTo={x.addressedTo} today={today} />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="Originals in custody" subtitle="Where each physical original is held and by whom, with every check-out and check-in." actions={status !== "CANCELLED" ? (originals.length ? <RegisterOriginalDrawer id={c.id} originals={originals} people={people} /> : <Blocked label="Register an original" reason={executed ? "Every original on record is registered." : "The signed contract is registered once executed; verified bonds and policies any time."} />) : undefined} divided={c.custodyItems.length === 0} />
        {c.custodyItems.length === 0 ? (
          <EmptyState size="sm" title="None registered">Register the signed contract, the bond and the policies as they are filed.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {c.custodyItems.map((i) => {
              const label = i.kind === "CONTRACT" ? CUSTODY_KIND_WORDS.CONTRACT.en : i.kind === "SECURITY" ? `${CUSTODY_KIND_WORDS.SECURITY.en} ${i.security?.instrumentRef ?? ""}`.trim() : `${CUSTODY_KIND_WORDS.POLICY.en} ${i.policy?.policyNo ?? ""}`.trim();
              const state = custodyState(i.movements.map((m) => ({ direction: m.direction, personId: m.personId, personName: m.person.name, on: storedDay(m.on) })));
              return (
                <li key={i.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold break-words text-ink">{label}</span>
                    <span className="block text-[12.5px] break-words text-ink-3">{[`held at ${i.location}`, `custodian ${i.custodian.name}`, state.state === "OUT" ? `out with ${state.holderName} since ${formatDate(state.since)}` : "in custody", i.movements.length ? `${i.movements.length} movement${i.movements.length === 1 ? "" : "s"} logged` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    <Chip tone={state.state === "OUT" ? "warn" : "ok"}>{state.state === "OUT" ? "Checked out" : "In custody"}</Chip>
                    {status !== "CANCELLED" && <MoveOriginalDrawer id={c.id} itemId={i.id} label={label} out={state.state === "OUT"} people={people} today={today} />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

