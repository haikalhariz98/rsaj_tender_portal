/**
 * The public registration form's own logic (ADR 0041, plan section 4.2), as pure functions the browser page wires up: the state it holds for one visit, the body and the parts it sends,
 * the rules it runs at each Next (the server's own, as a convenience: the server's answer at Submit is final), how it reads the server's reply, and which token it sends.
 *
 * Nothing is saved: everything here lives in the page until Submit, and is lost if the applicant leaves (REG-1, founder: "if they left the browser it should be restarted"). Safe for the
 * browser: no `node:` module and no database (`client-safe.test.ts`).
 */

import { FORM_TOKEN_MAX_AGE_MS, formTokenMadeAt } from "@/lib/auth/form-token-shape";
import { HONEYPOT_FIELD } from "@/lib/portal/apply";
import { APPLY } from "@/lib/portal/labels";
import { codesChangedFields, companyChangedFields, DECLARATION_FIELDS, documentsChangedFields, epaymentChangedFields, fileChangedFields, STATEMENT_FIELDS, TERMS_FIELDS, withoutFaultsAt } from "@/lib/portal/registration/changed-fields";
import { stepFaults } from "@/lib/portal/registration/faults";
import { REGISTRATION_STEPS, type CreditorInput, type RegistrationContext, type RegistrationStep } from "@/lib/portal/registration/types";
import { uploadFault, type UploadKind, type UploadUsage } from "@/lib/portal/registration/upload";
import { uploadFaultText } from "@/lib/portal/registration/words";
import { normaliseRegistrationNo } from "@/lib/suppliers/identity";
import type { RegistrationValueKind } from "@/lib/suppliers/types";

import { uploadRulesOf, type PublicRegistrationConfig } from "./config";
import { documentFilePart, REGISTER_APPLICATION_PART, STATEMENT_FILE_PART, type FaultView, type PublicApplicationBody, type ValueHit, type ValuesReply } from "./contract";
import { companyFaults, heldShapeFaults, publicApplicationFaults, publicFaultViews } from "./faults";
import { heldDraft } from "./held-draft";
import type { HeldSummaryState, SummaryLists } from "./summary-record";

// ------------------------------------------------------------------------------------------------ the state

/// A file held in the browser. Only what the rules and the send read: a `File` is one.
export interface HeldFile {
  name: string;
  size: number;
  type: string;
}

/// A certificate row as typed. `id` is the browser's own key ("new:…"), sent as `clientKey`.
export interface HeldRow {
  id: string;
  typeId: string;
  title: string;
  reference: string;
  issuingAuthority: string;
  expiresOn: string;
  ratePercent: string;
  notApplicable: boolean;
}

export interface WizardState<F extends HeldFile = HeldFile> {
  step: RegistrationStep;
  /// How far the applicant has come by Next: every step before it is done, and may be gone back to.
  reached: number;
  company: PublicApplicationBody["company"];
  documents: HeldRow[];
  /// The files held for each row, by its key.
  files: Record<string, F[]>;
  /// The codes chosen on each row, by kind.
  chosen: Record<string, Record<string, string[]>>;
  /// Every code the searches have named, by id: the review reads "code — name" from here, with no read of the server.
  hits: Record<string, ValueHit>;
  creditor: CreditorInput;
  statement: F[];
  signatoryName: string;
  signatoryDesignation: string;
  giroConfirmed: boolean;
  falseDeclaration: boolean;
  terms: boolean;
  /// What the last check (the page's at Next, or the server's at Submit) found, by step and field.
  faults: FaultView[];
  /// Something has been typed or held: leaving now loses it.
  touched: boolean;
}

export type WizardAction<F extends HeldFile = HeldFile> =
  | { type: "company"; value: WizardState<F>["company"] }
  | { type: "documents"; rows: HeldRow[] }
  | { type: "addFile"; key: string; file: F }
  | { type: "removeFile"; key: string; index: number }
  | { type: "codes"; chosen: WizardState<F>["chosen"] }
  | { type: "hits"; hits: readonly ValueHit[] }
  | { type: "epayment"; creditor: CreditorInput; signatoryName: string; signatoryDesignation: string; giroConfirmed: boolean }
  | { type: "addStatement"; file: F }
  | { type: "removeStatement"; index: number }
  | { type: "falseDeclaration"; confirmed: boolean }
  | { type: "terms"; confirmed: boolean }
  | { type: "goTo"; step: RegistrationStep }
  | { type: "next"; faults: FaultView[] }
  | { type: "faults"; faults: FaultView[]; step?: RegistrationStep };

export const stepIndex = (s: RegistrationStep) => REGISTRATION_STEPS.indexOf(s);

export function emptyWizard<F extends HeldFile>(company: WizardState<F>["company"], documents: HeldRow[], creditor: CreditorInput): WizardState<F> {
  return { step: "company", reached: 0, company, documents, files: {}, chosen: {}, hits: {}, creditor, statement: [], signatoryName: "", signatoryDesignation: "", giroConfirmed: false, falseDeclaration: false, terms: false, faults: [], touched: false };
}

/// The one reducer of the page. A change to a field marks the form touched (the browser then warns before leaving); moving between steps does not. A change also takes away the
/// findings about the fields it changed (`changed-fields.ts`), whether the page's check at Next found them or the server's at Submit: they are about what was there before. Nothing is
/// found by a change; the next Next (or Submit) checks again.
export function wizardReducer<F extends HeldFile>(s: WizardState<F>, a: WizardAction<F>): WizardState<F> {
  const changed = (fields: Iterable<string>, rest: Partial<WizardState<F>>): WizardState<F> => ({ ...s, ...rest, touched: true, faults: withoutFaultsAt(s.faults, fields) });
  const typeOf = (key: string) => s.documents.find((r) => r.id === key)?.typeId ?? null;
  switch (a.type) {
    case "company":
      return changed(companyChangedFields(s.company, a.value), { company: a.value });
    case "documents": {
      // A row taken away takes its files and codes with it.
      const keys = new Set(a.rows.map((r) => r.id));
      const gone = s.documents.filter((r) => !keys.has(r.id)).map((r) => `documents.${r.id}.values`);
      return changed([...documentsChangedFields(s.documents, a.rows), ...gone], {
        documents: a.rows,
        files: Object.fromEntries(Object.entries(s.files).filter(([k]) => keys.has(k))),
        chosen: Object.fromEntries(Object.entries(s.chosen).filter(([k]) => keys.has(k))),
      });
    }
    case "addFile":
      return changed(fileChangedFields(a.key, typeOf(a.key)), { files: { ...s.files, [a.key]: [...(s.files[a.key] ?? []), a.file] } });
    case "removeFile":
      return changed(fileChangedFields(a.key, typeOf(a.key)), { files: { ...s.files, [a.key]: (s.files[a.key] ?? []).filter((_, i) => i !== a.index) } });
    case "codes":
      return changed(codesChangedFields(s.chosen, a.chosen), { chosen: a.chosen });
    case "hits":
      return { ...s, hits: { ...s.hits, ...Object.fromEntries(a.hits.map((h) => [h.id, h])) } };
    case "epayment": {
      const now = { creditor: a.creditor, signatoryName: a.signatoryName, signatoryDesignation: a.signatoryDesignation, giroConfirmed: a.giroConfirmed };
      return changed(epaymentChangedFields(s, now), now);
    }
    case "addStatement":
      return changed(STATEMENT_FIELDS, { statement: [...s.statement, a.file] });
    case "removeStatement":
      return changed(STATEMENT_FIELDS, { statement: s.statement.filter((_, i) => i !== a.index) });
    case "falseDeclaration":
      return changed(s.falseDeclaration === a.confirmed ? [] : DECLARATION_FIELDS, { falseDeclaration: a.confirmed });
    case "terms":
      return changed(s.terms === a.confirmed ? [] : TERMS_FIELDS, { terms: a.confirmed });
    case "goTo":
      // Back to any step already reached; never on past it.
      return stepIndex(a.step) <= s.reached ? { ...s, step: a.step } : s;
    case "next": {
      // The step's findings are this check's, all of them: none kept from an earlier one.
      const at = stepIndex(s.step);
      const others = s.faults.filter((f) => f.step !== s.step);
      if (a.faults.some((f) => f.level === "block")) return { ...s, faults: [...others, ...a.faults] };
      const to = REGISTRATION_STEPS[Math.min(at + 1, REGISTRATION_STEPS.length - 1)]!;
      return { ...s, faults: [...others, ...a.faults], step: to, reached: Math.max(s.reached, stepIndex(to)) };
    }
    case "faults":
      return { ...s, faults: a.faults, ...(a.step ? { step: a.step } : {}) };
  }
}

// ------------------------------------------------------------------------------------------------ what is sent

const hasContent = (r: HeldRow) => !!(r.title.trim() || r.reference.trim() || r.issuingAuthority.trim() || r.expiresOn.trim() || r.ratePercent.trim() || r.notApplicable);

/// The rows that go: any with something typed or a file held. An empty row is not an application's (a required one is then said missing, beside its kind).
export const sentRows = <F extends HeldFile>(s: WizardState<F>): HeldRow[] => s.documents.filter((r) => hasContent(r) || (s.files[r.id]?.length ?? 0) > 0);

/// The body the page sends, as the server parses it (`parsePublicApplication`).
export function heldBody<F extends HeldFile>(s: WizardState<F>, config: Pick<PublicRegistrationConfig, "texts" | "notice">): PublicApplicationBody {
  const agreement = (kind: "GIRO_AUTHORISATION" | "FALSE_DECLARATION" | "TERMS_AND_CONDITIONS", confirmed: boolean) => {
    const t = config.texts[kind];
    return t ? [{ kind, textVersionId: t.id, textSha256: t.sha256, confirmed }] : [];
  };
  return {
    company: s.company,
    documents: sentRows(s).map((r) => ({
      clientKey: r.id,
      typeId: r.typeId,
      title: r.title,
      reference: r.reference,
      issuingAuthority: r.issuingAuthority,
      expiresOn: r.expiresOn,
      notApplicable: r.notApplicable,
      ratePercent: r.ratePercent,
      valueIds: [...new Set(Object.values(s.chosen[r.id] ?? {}).flat())],
    })),
    creditor: s.creditor,
    signatory: { name: s.signatoryName, designation: s.signatoryDesignation },
    agreements: [...agreement("GIRO_AUTHORISATION", s.giroConfirmed), ...agreement("FALSE_DECLARATION", s.falseDeclaration), ...agreement("TERMS_AND_CONDITIONS", s.terms)],
    noticeSha256: config.notice?.sha256 ?? "",
  };
}

/// The context the rules read in the browser: the organisation's, with the codes chosen (as the searches named them) and the applicant's own number and contact.
export function browserContext<F extends HeldFile>(s: WizardState<F>, config: Pick<PublicRegistrationConfig, "context">): RegistrationContext {
  const chosen = new Set(Object.values(s.chosen).flatMap((byKind) => Object.values(byKind).flat()));
  return {
    ...config.context,
    values: [...chosen].flatMap((id) => {
      const h = s.hits[id];
      return h ? [{ id: h.id, bodyId: h.bodyId, kind: h.kind as RegistrationValueKind, code: h.code, nameEn: h.name, retired: false }] : [];
    }),
    supplier: { registrationNoKey: normaliseRegistrationNo(s.company.registrationNo), contactName: s.company.contact.name },
  };
}

/// Every held file in the order it is sent (each row's, then the statement), with the part it goes in.
export function sentFiles<F extends HeldFile>(s: WizardState<F>): { part: string; key: string | null; kind: UploadKind; file: F }[] {
  return [
    ...sentRows(s).filter((r) => !r.notApplicable).flatMap((r) => (s.files[r.id] ?? []).map((file) => ({ part: documentFilePart(r.id), key: r.id, kind: "document" as const, file }))),
    ...s.statement.map((file) => ({ part: STATEMENT_FILE_PART, key: null, kind: "statement" as const, file })),
  ];
}

/// Each held file against the type, size and quotas, the quotas counted across the whole application as the server counts them. The browser reads the type the file says it is; the
/// server reads its bytes. A file refused here is not counted as held, as on the server.
export function heldFileChecks<F extends HeldFile>(s: WizardState<F>, config: Pick<PublicRegistrationConfig, "upload">): { faults: FaultView[]; counts: Map<string, number>; statementCount: number } {
  const rules = uploadRulesOf(config);
  const usage: UploadUsage = { files: 0, bytes: 0n };
  const faults: FaultView[] = [];
  const counts = new Map<string, number>();
  let statementCount = 0;
  for (const { key, kind, file } of sentFiles(s)) {
    const size = BigInt(file.size);
    const found = uploadFault({ size, sniffedType: file.type || null }, rules.store, rules[kind], usage, kind);
    if (found) {
      faults.push(kind === "statement" ? { step: "epayment", field: "creditor.statement", level: "block", message: uploadFaultText(found, "statement").en } : { step: "documents", field: `documents.${key}.file`, level: "block", message: uploadFaultText(found, "document").en });
      continue;
    }
    usage.files += 1;
    usage.bytes += size;
    if (key == null) statementCount += 1;
    else counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { faults, counts, statementCount };
}

/**
 * The page's check at Next (plan 4.2.2): the same rules the server runs at Submit, on what the page holds. Step 1 is the public form's own rule; steps 2 to 4 are the signed-in wizard's step
 * rules on the body read as a draft, with what could not be stored and each held file's check; step 5 is every rule at once, the agreements included. A convenience only.
 */
export function stepCheck<F extends HeldFile>(step: RegistrationStep, s: WizardState<F>, config: PublicRegistrationConfig): FaultView[] {
  const body = heldBody(s, config);
  if (step === "company") return publicFaultViews(companyFaults(body.company, config.step1));
  const files = heldFileChecks(s, config);
  const draft = heldDraft(body, files.counts, files.statementCount);
  const ctx = browserContext(s, config);
  if (step === "review") return [...files.faults, ...publicFaultViews(publicApplicationFaults(body, draft, ctx, config.step1))];
  return [...files.faults.filter((f) => f.step === step), ...publicFaultViews([...heldShapeFaults(body).filter((f) => f.step === step), ...stepFaults(step, draft, ctx)])];
}

/// The step to go back to: the first, in the stepper's order, with something blocking. Null: nothing blocks.
export function firstFaultStep(faults: readonly FaultView[]): RegistrationStep | null {
  for (const s of REGISTRATION_STEPS) if (faults.some((f) => f.step === s && f.level === "block")) return s;
  return null;
}

/// The parts of the one POST, in order: the application, each row's files, the statement, and the bait field as the page holds it (empty, unless a script filled it).
export function formParts<F extends HeldFile>(s: WizardState<F>, config: Pick<PublicRegistrationConfig, "texts" | "notice">, bait: string): [string, string | F][] {
  return [[REGISTER_APPLICATION_PART, JSON.stringify(heldBody(s, config))], ...sentFiles(s).map(({ part, file }): [string, F] => [part, file]), [HONEYPOT_FIELD, bait]];
}

// ------------------------------------------------------------------------------------------------ the review

/// The lists the review names each code by, from the configuration the page holds.
export function summaryListsOf(config: Pick<PublicRegistrationConfig, "lists" | "context" | "step1" | "bumiputeraEvidenceSet">): SummaryLists {
  const entries = (o: readonly { value: string; label: string }[]) => o.map((x) => ({ code: x.value, nameEn: x.label }));
  return {
    entityTypes: entries(config.lists.entityTypes),
    countries: entries(config.lists.countries),
    states: entries(config.lists.states),
    bumiputeraStatuses: entries(config.lists.bumiputeraStatuses),
    banks: config.context.banks,
    accountTypes: config.context.accountTypes,
    formatPattern: config.step1.formatPattern,
    bumiputeraEvidenceSet: config.bumiputeraEvidenceSet,
  };
}

/// What step 5 reviews: the body as it will be sent, the names of the files that go with each row and the statement, and the codes by the names the searches gave them.
export function heldSummaryState<F extends HeldFile>(s: WizardState<F>, config: Pick<PublicRegistrationConfig, "texts" | "notice">): HeldSummaryState {
  const body = heldBody(s, config);
  return {
    body,
    files: new Map(body.documents.map((d) => [d.clientKey, d.notApplicable ? [] : (s.files[d.clientKey] ?? []).map((f) => f.name)])),
    statementFiles: s.statement.map((f) => f.name),
    chosen: new Map(Object.values(s.hits).map((h) => [h.id, { code: h.code, name: h.name }])),
  };
}

// ------------------------------------------------------------------------------------------------ the reply

/// What the page does with an answer.
export type Outcome =
  /// Received: the reference, shown once. Null: the bait field was filled, and nothing was written.
  | { kind: "ok"; reference: string | null }
  /// The rules refused it, by step and field. Nothing was written and the token is not spent.
  | { kind: "faults"; faults: FaultView[]; message: string }
  /// The token is out of date and was not spent: ask for a fresh one and send again.
  | { kind: "expired"; message: string }
  /// Not known whether it arrived (no answer, a failure on the way, a server error): send again with the SAME token, which the server answers with its reference if the first one landed.
  | { kind: "uncertain"; message: string }
  /// Refused, in the server's words (the register closed, too large, too busy, another site). Kept, and Submit stays.
  | { kind: "refused"; message: string };

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isFault = (x: unknown): x is FaultView => isRecord(x) && typeof x.step === "string" && (REGISTRATION_STEPS as readonly string[]).includes(x.step) && (x.field === null || typeof x.field === "string") && (x.level === "block" || x.level === "warn" || x.level === "info") && typeof x.message === "string";

/// Every answer the route can give, read: its own replies, the boundary's plain 404 and refusal bodies, the Origin guard's, a server error, and none at all (status 0).
export function readReply(status: number, body: unknown): Outcome {
  const said = isRecord(body) && typeof body.message === "string" && body.message.trim() ? body.message.trim() : null;
  if (status === 0) return { kind: "uncertain", message: APPLY.tryAgainLater.en };
  if (status === 200 && isRecord(body) && body.ok === true) return { kind: "ok", reference: typeof body.reference === "string" ? body.reference : null };
  if (isRecord(body) && body.code === "VALIDATION" && Array.isArray(body.faults) && body.faults.every(isFault)) return { kind: "faults", faults: body.faults as FaultView[], message: said ?? APPLY.nothingSent.en };
  if (isRecord(body) && body.code === "FORM_EXPIRED") return { kind: "expired", message: said ?? APPLY.submitExpired.en };
  // A server error, or an answer that is not the route's (a gateway's page): it may have landed.
  if (status >= 500 && !(isRecord(body) && ["CLOSED", "BUSY"].includes(String(body.code)))) return { kind: "uncertain", message: said ?? APPLY.tryAgainLater.en };
  return { kind: "refused", message: said ?? APPLY.tryAgainLater.en };
}

// ------------------------------------------------------------------------------------------------ the token

/// A token this old is swapped for a fresh one before it is first sent: an hour before the server would call it out of date.
export const TOKEN_REFRESH_AFTER_MS = FORM_TOKEN_MAX_AGE_MS - 60 * 60 * 1000;

export const tokenIsOld = (token: string, now: number): boolean => {
  const at = formTokenMadeAt(token);
  return at == null || now - at > TOKEN_REFRESH_AFTER_MS;
};

export interface Transport<F extends HeldFile = HeldFile> {
  /// One POST of the parts, with the token in `x-form-token`. Status 0: no answer.
  post(token: string, parts: [string, string | F][], progress: (fraction: number) => void): Promise<{ status: number; body: unknown }>;
  /// A fresh token, or null where none can be had.
  freshToken(): Promise<string | null>;
}

/**
 * Sending the application (plan 4.2.4 and 4.2.5, ADR 0041 D8). The rule that keeps one visit to one application: a token once sent is sent again, never swapped, until an answer proves
 * it was not spent (received, refused by the rules, or out of date). So:
 * - a token never sent, and older than `TOKEN_REFRESH_AFTER_MS`, is swapped first;
 * - a token whose last send got no clear answer (`sentToken`) is sent again as it is, whatever its age: the server answers a spent token with its reference, even once out of date;
 * - no clear answer: sent once more at once, with the same token;
 * - out of date and not spent: a fresh token, and sent once more.
 * Gives back the outcome, the token now held, and the token still awaiting a clear answer (null once one came).
 */
export async function sendApplication<F extends HeldFile>(i: { token: string; sentToken: string | null; /** The clock, for the token's age. Default: now. */ now?: number; parts: () => [string, string | F][]; transport: Transport<F>; progress: (fraction: number) => void }): Promise<{ outcome: Outcome; token: string; sentToken: string | null }> {
  let token = i.sentToken ?? i.token;
  if (i.sentToken == null && tokenIsOld(token, i.now ?? Date.now())) token = (await i.transport.freshToken()) ?? token;
  // The token still awaiting a clear answer, followed after EVERY send: no clear answer makes this one awaiting; received, the rules' refusal and "out of date" settle it; any other
  // refusal (one that may come before the token is read) leaves it as it was. So an unclear send followed by "busy" is never forgotten.
  let awaiting = i.sentToken;
  const once = async (t: string) => {
    const r = await i.transport.post(t, i.parts(), i.progress);
    const outcome = readReply(r.status, r.body);
    if (outcome.kind === "uncertain") awaiting = t;
    else if (outcome.kind === "ok" || outcome.kind === "faults" || outcome.kind === "expired") awaiting = null;
    return outcome;
  };
  let outcome = await once(token);
  if (outcome.kind === "uncertain") outcome = await once(token);
  if (outcome.kind === "expired") {
    const fresh = await i.transport.freshToken();
    if (fresh) {
      token = fresh;
      outcome = await once(token);
      if (outcome.kind === "uncertain") outcome = await once(token);
    }
  }
  // Still awaiting: the next Submit sends that token again, never another.
  return { outcome, token: awaiting ?? token, sentToken: awaiting };
}

// ------------------------------------------------------------------------------------------------ the code search

/// One search of the codes (`/supplier/register/values`), read: the hits, or that the token is out of date. Anything else throws, and the list says it could not be loaded.
export function readValues(status: number, body: unknown): { hits: ValueHit[] } | { expired: true } {
  const reply = body as ValuesReply | null;
  if (status === 200 && reply && reply.ok === true && Array.isArray(reply.hits)) return { hits: reply.hits };
  if (reply && reply.ok === false && reply.code === "FORM_EXPIRED") return { expired: true };
  throw new Error(`The codes could not be searched (${status}).`);
}
