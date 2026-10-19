import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { KIND_WORDS } from "@/lib/certificate/labels";
import { pageOf } from "@/lib/certificate/library";
import type { CertificateKind, CertificateStatus } from "@/lib/certificate/types";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { baselineFor } from "@/lib/contract/baseline";
import type { ContractStatus } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal, type Sen } from "@/lib/money";
import { PAID_FIGURE } from "@/lib/payment/finance";
import { inDelay, type DelayReading } from "@/lib/supervision/delay";
import { entryState, type EntryState } from "@/lib/supervision/diary";
import { loadPostAwardPolicy, loadSupervision, revisionsOf } from "@/lib/supervision/load";
import { contractorSigningFaultOf } from "./signing-store";
import { plannedOn, programmeInForce } from "@/lib/supervision/programme";
import { soOn } from "@/lib/supervision/so";
import type { ProgrammeDecision } from "@/lib/supervision/types";

import { certifiedAgainstPaid, CONTRACTOR_READS_ISSUED_KINDS, CONTRACTOR_SIGNS_KINDS, contractorBlock, type CertifiedRow, type CertifiedSummary, type ContractorBlock } from "./certificates";
import type { ProjectContext } from "./context-store";
import { blocksOf } from "./list-store";
import { serviceState, type ServiceState } from "./submission";
import type { SubmissionKind, SubmissionOutcome } from "./types";
import { projectFaultText } from "./words";
import { inOrder } from "@/lib/series";

/**
 * What each tab of one contract's My Projects workspace reads (Phase 4e). One loader per tab, so a tab loads only its own slice and never a sibling's. Reads only, in the caller's client. Each
 * takes the context that `loadProjectContext` returned for THIS supplier, so every read is of a contract it holds and names the session's supplier and organisation. Figures are the
 * contractor's own certificates' and claims'; the sums are worked out here, never in a component.
 */

type Who = Pick<SupplierActor, "supplierId" | "organisationId" | "contactId">;
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const dayText = (d: Date | null | undefined) => (d ? formatDate(storedDay(d)) : null);

/// Whether an act of a family is open on the contract now, or the reason it is not, in words.
export function actGate(family: Parameters<typeof actStatusFault>[0], status: ContractStatus): string | null {
  const f = actStatusFault(family, status);
  return f ? actStatusText(f) : null;
}

// ------------------------------------------------------------------ overview

export interface OverviewView {
  facts: { number: string; title: string; reference: string; awardReference: string; status: ContractStatus; contractSum: string; possessionOn: string | null; dateForCompletion: string | null; soOffice: string | null };
  counts: { toAttest: number; toSign: number; returned: number; waiting: number; missingDays: number };
  /// Why nothing can be sent on the contract now, or null.
  closed: string | null;
}

export async function overviewTab(client: Tx, actor: Who, ctx: ProjectContext): Promise<OverviewView> {
  const today = ctx.org.today;
  const [possession, baselines, assignments, entries, certs, submissions] = await inOrder(
    () => client.possession.findUnique({ where: { contractId: ctx.contract.id }, select: { possessionOn: true } }),
    () => client.contractBaseline.findMany({ where: { contractId: ctx.contract.id, organisationId: actor.organisationId, version: { not: null } }, select: { id: true, version: true, reason: true, recordedOn: true, dateForCompletion: true } }),
    () => client.contractSoAssignment.findMany({ where: { contractId: ctx.contract.id, organisationId: actor.organisationId }, select: { id: true, roleCode: true, roleLabel: true, effectiveOn: true, recordedAt: true } }),
    () => client.siteDiaryEntry.findMany({ where: { contractId: ctx.contract.id, organisationId: actor.organisationId }, select: { day: true, agentAttestedOn: true, officerAttestedOn: true, disagreement: true } }),
    () => client.certificate.findMany({ where: { contractId: ctx.contract.id, organisationId: actor.organisationId, status: "SIGNING", kind: { in: ["VARIATION", "SUM_ADJUSTMENT"] } }, select: { kind: true, status: true, templateRevision: true, signatures: { select: { blockOrder: true } } } }),
    () => client.contractorSubmission.findMany({ where: { contractId: ctx.contract.id, supplierId: actor.supplierId, organisationId: actor.organisationId }, select: { outcome: true } }));
  const inForce = today ? baselineFor(baselines.map((b) => ({ ...b, recordedOn: day(b.recordedOn) })), today) : null;
  const so = today ? soOn(assignments.map((a) => ({ ...a, effectiveOn: storedDay(a.effectiveOn) })), today) : null;
  const possessionOn = day(possession?.possessionOn);
  const entered = new Set(entries.map((e) => storedDay(e.day)));
  let missing = 0;
  if (possessionOn && today) for (let d = possessionOn; d < today; d = nextDay(d)) if (!entered.has(d)) missing++;
  return {
    facts: {
      number: ctx.contract.number,
      title: ctx.contract.title,
      reference: ctx.contract.reference,
      awardReference: ctx.contract.awardReference,
      status: ctx.contract.status,
      contractSum: formatMoney(senFromDecimal(ctx.contract.contractSum)),
      possessionOn: possessionOn ? formatDate(possessionOn) : null,
      dateForCompletion: dayText(inForce?.dateForCompletion),
      soOffice: so?.roleLabel ?? null,
    },
    counts: {
      toAttest: entries.filter((e) => e.agentAttestedOn == null && !e.disagreement.trim() && (!today || storedDay(e.day) <= today)).length,
      toSign: certs.filter((x) => contractorBlock({ kind: x.kind, status: x.status, blocks: blocksOf(x.templateRevision), signedOrders: x.signatures.map((s) => s.blockOrder) }).state === "READY").length,
      returned: submissions.filter((s) => s.outcome === "RETURNED").length,
      waiting: submissions.filter((s) => s.outcome == null).length,
      missingDays: missing,
    },
    closed: actGate("SUPERVISION", ctx.contract.status),
  };
}

function nextDay(d: string): string {
  const t = new Date(`${d}T00:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ programme

export interface ProgrammeView {
  inForce: { revision: number; approvedOn: string | null; points: { day: string; plannedPct: string }[] } | null;
  revisions: { id: string; revision: number; submittedOn: string; decision: ProgrammeDecision | null; decidedOn: string | null; note: string; scrutinised: boolean }[];
  /// The latest progress the office recorded, and the plan on that day.
  latest: { day: string; actualPct: string; plannedPct: string | null } | null;
  delay: DelayReading | null;
  /// The policy's In Delay percentage is not set: the reading says so, in words, rather than judging.
  policyPct: string | null;
}

export async function programmeTab(client: Tx, actor: Who, ctx: ProjectContext): Promise<ProgrammeView> {
  const today = ctx.org.today;
  const [s, policy, baselines] = await inOrder(
    () => loadSupervision(ctx.contract.id, client),
    () => loadPostAwardPolicy(actor.organisationId, client),
    () => client.contractBaseline.findMany({ where: { contractId: ctx.contract.id, organisationId: actor.organisationId, version: { not: null } }, select: { id: true, version: true, reason: true, recordedOn: true, dateForCompletion: true } }));
  const revisions = revisionsOf(s);
  const inForce = today ? programmeInForce(revisions, today) : null;
  const latestRow = today ? [...s.progressRecords].filter((p) => storedDay(p.day) <= today).sort((a, b) => (storedDay(a.day) < storedDay(b.day) ? 1 : -1))[0] ?? null : null;
  const latest = latestRow ? { day: storedDay(latestRow.day), actualPct: latestRow.actualPct.toString() } : null;
  const planned = latest && inForce ? plannedOn(inForce.points, latest.day) : null;
  const baseline = today ? baselineFor(baselines.map((b) => ({ ...b, recordedOn: day(b.recordedOn) })), today) : null;
  const policyPct = policy?.inDelayProgressPct?.toString() ?? null;
  const delay = today ? inDelay({ today, possessed: s.possession != null, dateForCompletion: day(baseline?.dateForCompletion), programme: inForce?.points ?? null, latest, policyPct }) : null;
  return {
    inForce: inForce ? { revision: inForce.revision, approvedOn: inForce.decidedOn ? formatDate(inForce.decidedOn) : null, points: inForce.points } : null,
    revisions: revisions.map((r) => ({ id: r.id, revision: r.revision, submittedOn: formatDate(r.submittedOn), decision: r.decision, decidedOn: r.decidedOn ? formatDate(r.decidedOn) : null, note: s.workProgrammes.find((p) => p.id === r.id)?.decisionNote ?? "", scrutinised: r.scrutinisedOn != null })).reverse(),
    latest: latest ? { ...latest, plannedPct: planned ? fraction(planned.num, planned.den) : null } : null,
    delay,
    policyPct,
  };
}

/// A rational percentage in ten-thousandths, to four places (display only).
function fraction(num: bigint, den: bigint): string {
  const q = (num * 2n + den) / (2n * den);
  const whole = q / 10_000n;
  const frac = (q % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// ------------------------------------------------------------------ site diary

export interface DiaryRow {
  id: string;
  day: string;
  dayText: string;
  weather: string;
  entry: string;
  officer: string;
  state: EntryState;
  agentName: string;
  agentAttestedOn: string | null;
  /// Signed from the portal (the account that did), or recorded by an officer from paper.
  signedFromPortal: boolean;
  disagreement: string;
  escalatedOn: string | null;
  backdated: boolean;
  canAttest: boolean;
  canDispute: boolean;
  /// Why attesting is not offered, in words (the day has not come).
  attestWhy: string | null;
}

/// How many diary entries a page of the tab shows: two months of daily entries.
export const DIARY_PAGE = 60;

/// One page of the diary, newest first, paged in the database (4e review fix: a contract passes 200 daily entries in about seven months, and the tab was one capped read).
export async function diaryTab(client: Tx, actor: Who, ctx: ProjectContext, askedPage?: string): Promise<{ rows: DiaryRow[]; total: number; page: number; closed: string | null; possessionOn: string | null }> {
  const today = ctx.org.today;
  const where = { contractId: ctx.contract.id, organisationId: actor.organisationId };
  const total = await client.siteDiaryEntry.count({ where });
  const page = pageOf(askedPage, total, DIARY_PAGE);
  const [entries, possession] = await inOrder(
    () => client.siteDiaryEntry.findMany({ where, orderBy: [{ day: "desc" }, { id: "asc" }], skip: page * DIARY_PAGE, take: DIARY_PAGE, include: { officer: { select: { name: true } } } }),
    () => client.possession.findUnique({ where: { contractId: ctx.contract.id }, select: { possessionOn: true } }));
  const closed = actGate("SUPERVISION", ctx.contract.status);
  const rows: DiaryRow[] = entries.map((e) => {
    const d = storedDay(e.day);
    const state = entryState({ officerAttestedOn: day(e.officerAttestedOn), agentAttestedOn: day(e.agentAttestedOn), disagreement: e.disagreement });
    const future = today != null && d > today;
    return {
      id: e.id,
      day: d,
      dayText: formatDate(d),
      weather: e.weather,
      entry: e.entry,
      officer: e.officer.name,
      state,
      agentName: e.agentName,
      agentAttestedOn: dayText(e.agentAttestedOn),
      signedFromPortal: e.agentAttestedBySupplierAccountId != null,
      disagreement: e.disagreement,
      escalatedOn: dayText(e.escalatedOn),
      backdated: e.backdatedReason.trim() !== "",
      canAttest: closed == null && today != null && e.agentAttestedOn == null && !future,
      canDispute: closed == null && today != null && !e.disagreement.trim(),
      attestWhy: e.agentAttestedOn != null ? null : closed ?? (today == null ? "The organisation's day is not known." : future ? "This entry's day has not come yet." : null),
    };
  });
  return { rows, total, page, closed, possessionOn: dayText(possession?.possessionOn) };
}

// ------------------------------------------------------------------ payments: certified against paid

export interface PaymentsView {
  rows: (CertifiedRow & { kind: CertificateKind; kindLabel: string; recommendedText: string | null; paidText: string | null })[];
  summary: CertifiedSummary & { certifiedText: string; paidText: string; outstandingText: string; paidUnfiguredText: string };
  claims: { id: string; title: string; amount: string | null; upTo: string | null; sentOn: string; outcome: SubmissionOutcome | null; kind: SubmissionKind }[];
}

export async function paymentsTab(client: Tx, actor: Who, ctx: ProjectContext): Promise<PaymentsView> {
  const [certs, claims] = await inOrder(
    () => client.certificate.findMany({
      where: { contractId: ctx.contract.id, organisationId: actor.organisationId, status: "ISSUED", kind: { in: ["INTERIM_PAYMENT", "ADVANCE_PAYMENT"] } },
      orderBy: [{ kind: "asc" }, { sequence: "asc" }],
      select: { id: true, kind: true, number: true, sequence: true, certificateDate: true, issueSnapshot: true, financePayment: { select: { paidOn: true, amount: true, batchNo: true } } },
    }),
    () => client.contractorSubmission.findMany({ where: { contractId: ctx.contract.id, supplierId: actor.supplierId, organisationId: actor.organisationId, kind: { in: ["INTERIM_CLAIM", "MATERIALS_ON_SITE"] } }, orderBy: { submittedAt: "desc" }, select: { id: true, title: true, amount: true, aboutDay: true, submittedOn: true, outcome: true, kind: true } }));
  const rows = certs.map((c) => {
    const figure = figureOf(c.issueSnapshot, PAID_FIGURE[c.kind] ?? null);
    const recommended: Sen | null = figure == null ? null : senFromDecimal(figure);
    const row: CertifiedRow = { certificateId: c.id, sequence: c.sequence ?? 0, number: c.number, issuedOn: dayText(c.certificateDate), recommended, paid: c.financePayment ? { on: formatDate(storedDay(c.financePayment.paidOn)), amount: senFromDecimal(c.financePayment.amount), batchNo: c.financePayment.batchNo } : null };
    return { ...row, kind: c.kind as CertificateKind, kindLabel: KIND_WORDS[c.kind as CertificateKind].en, recommendedText: recommended == null ? null : formatMoney(recommended), paidText: row.paid ? formatMoney(row.paid.amount) : null };
  });
  const summary = certifiedAgainstPaid(rows);
  return {
    rows,
    summary: { ...summary, certifiedText: formatMoney(summary.certified), paidText: formatMoney(summary.paid), outstandingText: formatMoney(summary.outstanding), paidUnfiguredText: formatMoney(summary.paidUnfigured) },
    claims: claims.map((c) => ({ id: c.id, title: c.title, amount: c.amount == null ? null : formatMoney(senFromDecimal(c.amount)), upTo: dayText(c.aboutDay), sentOn: formatDate(storedDay(c.submittedOn)), outcome: c.outcome as SubmissionOutcome | null, kind: c.kind as SubmissionKind })),
  };
}

/// A figure of an issued certificate, by key, from its issue snapshot (money as a decimal string). Null: not there or not computed.
function figureOf(issueSnapshot: unknown, key: string | null): string | null {
  if (!key) return null;
  const snap = issueSnapshot as { figures?: { lines?: { key: string; value: string | null }[]; totals?: { key: string; value: string | null }[] } } | null;
  const all = [...(snap?.figures?.lines ?? []), ...(snap?.figures?.totals ?? [])];
  return all.find((x) => x.key === key)?.value ?? null;
}

// ------------------------------------------------------------------ certificates to sign

export interface CertificateRow {
  id: string;
  kind: CertificateKind;
  kindLabel: string;
  number: string | null;
  status: CertificateStatus;
  openedOn: string;
  certificateDate: string | null;
  block: ContractorBlock;
  /// The contractor's block as recorded, where it is.
  recorded: { name: string; on: string; refused: boolean; refusalNote: string; fromPortal: boolean } | null;
  closed: string | null;
}

/// How many certificates the tab lists at most, newest first; past it the tab says how many there are in all.
export const CERTIFICATES_SHOWN = 200;

/// The certificates the contractor reads (`contractorReadsCertificate`, as a query): issued and addressed to it, being signed and one of the two kinds it signs, or void after
/// it recorded its block. Never another certificate in routing or being signed: that is the office's own deliberation (4e review fix).
const readable = (contractId: string, organisationId: string) => ({
  contractId,
  organisationId,
  OR: [
    { status: "ISSUED" as const, kind: { in: [...CONTRACTOR_READS_ISSUED_KINDS] } },
    { status: "SIGNING" as const, kind: { in: [...CONTRACTOR_SIGNS_KINDS] } },
    { status: "VOID" as const, kind: { in: [...CONTRACTOR_SIGNS_KINDS] }, signatures: { some: { blockKind: "CONTRACTOR" as const } } },
  ],
});

/// Why the contractor cannot sign from its portal account, in words, or null where it may (4e review fix: the organisation's switch, unset refuses).
async function signingClosed(client: Tx, who: Who): Promise<string | null> {
  // The organisation's switch, then this contact's own mark (ruling on 1928(3)): the screen says which of the two is missing.
  const f = await contractorSigningFaultOf(client, who);
  return f ? projectFaultText({ code: f }).en : null;
}

export async function certificatesTab(client: Tx, actor: Who, ctx: ProjectContext): Promise<{ rows: CertificateRow[]; total: number; signing: string | null }> {
  const where = readable(ctx.contract.id, actor.organisationId);
  const [total, signing, certs] = await inOrder(
    () => client.certificate.count({ where }),
    () => signingClosed(client, actor),
    () => client.certificate.findMany({
      where,
      orderBy: [{ openedAt: "desc" }, { id: "asc" }],
      take: CERTIFICATES_SHOWN,
      select: { id: true, kind: true, number: true, status: true, openedOn: true, certificateDate: true, templateRevision: true, signatures: { select: { blockOrder: true, blockKind: true, name: true, signedOn: true, refused: true, refusalNote: true, signedBySupplierAccountId: true } } },
    }));
  const rows: CertificateRow[] = certs.map((c) => {
    const block = contractorBlock({ kind: c.kind, status: c.status, blocks: blocksOf(c.templateRevision), signedOrders: c.signatures.map((s) => s.blockOrder) });
    const sig = c.signatures.find((s) => s.blockKind === "CONTRACTOR") ?? null;
    const f = actStatusFault(c.status === "ISSUED" ? "CERTIFICATE" : "SUPERVISION", ctx.contract.status);
    return {
      id: c.id,
      kind: c.kind as CertificateKind,
      kindLabel: KIND_WORDS[c.kind as CertificateKind].en,
      number: c.number,
      status: c.status as CertificateStatus,
      openedOn: formatDate(storedDay(c.openedOn)),
      certificateDate: dayText(c.certificateDate),
      block,
      recorded: sig ? { name: sig.name, on: formatDate(storedDay(sig.signedOn)), refused: sig.refused, refusalNote: sig.refusalNote, fromPortal: sig.signedBySupplierAccountId != null } : null,
      closed: f ? actStatusText(f) : null,
    };
  });
  return { rows, total, signing };
}

// ------------------------------------------------------------------ submissions

export interface SubmissionRow {
  id: string;
  kind: SubmissionKind;
  title: string;
  body: string;
  amount: string | null;
  aboutDay: string | null;
  sentOn: string;
  signed: boolean;
  routedTo: string | null;
  service: ServiceState;
  outcome: SubmissionOutcome | null;
  outcomeNote: string;
  decidedOn: string | null;
  lines: { description: string; quantity: string; location: string; value: string }[];
}

/// How many submissions the tab lists at most, newest first; past it the tab says how many there are in all.
export const SUBMISSIONS_SHOWN = 200;

export async function submissionsTab(client: Tx, actor: Who, ctx: ProjectContext): Promise<{ rows: SubmissionRow[]; total: number; closed: string | null; signing: string | null; serviceLevels: Record<string, number | null> }> {
  const today = ctx.org.today;
  const where = { contractId: ctx.contract.id, supplierId: actor.supplierId, organisationId: actor.organisationId };
  const [total, signing, rows, settings] = await inOrder(
    () => client.contractorSubmission.count({ where }),
    () => signingClosed(client, actor),
    () => client.contractorSubmission.findMany({ where, orderBy: [{ submittedAt: "desc" }, { id: "asc" }], take: SUBMISSIONS_SHOWN, include: { lines: { orderBy: { sortOrder: "asc" } } } }),
    () => client.contractorSubmissionSetting.findMany({ where: { organisationId: actor.organisationId }, select: { kind: true, serviceLevelDays: true } }));
  return {
    total,
    signing,
    rows: rows.map((r) => ({
      id: r.id,
      kind: r.kind as SubmissionKind,
      title: r.title,
      body: r.body,
      amount: r.amount == null ? null : formatMoney(senFromDecimal(r.amount)),
      aboutDay: dayText(r.aboutDay),
      sentOn: formatDate(storedDay(r.submittedOn)),
      signed: r.signedAt != null,
      routedTo: r.routedToRoleLabel,
      service: serviceState({ dueOn: day(r.dueOn), decidedOn: day(r.decidedOn), today: today ?? storedDay(r.submittedOn) }),
      outcome: r.outcome as SubmissionOutcome | null,
      outcomeNote: r.outcomeNote,
      decidedOn: dayText(r.decidedOn),
      lines: r.lines.map((l) => ({ description: l.description, quantity: l.quantity, location: l.location, value: formatMoney(senFromDecimal(l.value)) })),
    })),
    closed: actGate("SUPERVISION", ctx.contract.status),
    serviceLevels: Object.fromEntries(settings.map((s) => [s.kind, s.serviceLevelDays])),
  };
}
