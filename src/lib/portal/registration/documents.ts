/**
 * Step 2 of the registration: the compliance documents (FR-VND-002). Pure; the types and their switches are the customer's configuration (`SupplierDocumentType`), never a literal here.
 *
 * A switch that is not set behaves as it did before the wizard and is said so: `mandatoryAtRegistration` null is shown to the applicant as "CPD has not said whether this is required",
 * is not held against them at Submit, and still blocks the officer's approval (`MANDATORY_NOT_SET`, review.ts); `expires` null asks for the expiry but does not insist on it; `recordsRate`
 * and `repeatable` null mean no rate is asked and one document per type.
 */

import { isDay } from "@/lib/dates";
import { MoneyFormatError, parseSen, senToDecimalString } from "@/lib/money";

import type { DocumentTypeConfig, DraftDocument, RegistrationContext, StepFault } from "./types";
import { isBlank } from "./types";

/// A rate as a percentage in the Decimal(5,2) the column holds: digits, at most two places, from nothing to a hundred. Never a float. Returns the canonical text ("8.00") or null.
export function parseRate(input: string | null | undefined): string | null {
  const text = (input ?? "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  try {
    const hundredths = parseSen(text);
    return hundredths >= 0n && hundredths <= 10000n ? senToDecimalString(hundredths) : null;
  } catch (e) {
    if (e instanceof MoneyFormatError) return null;
    throw e;
  }
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const typeOf = (ctx: RegistrationContext, typeId: string): DocumentTypeConfig | undefined => ctx.types.find((t) => t.id === typeId);

/// Whether a draft document stands for its type: a file is on it, or the applicant says it does not apply and the type allows that.
export function documentStands(d: DraftDocument, type: DocumentTypeConfig): boolean {
  return d.notApplicable ? type.notApplicableAllowed === true : d.fileCount > 0;
}

/// The faults of step 2 (Next) and of Submit, in the order the page shows its rows. A saved draft is not judged by this.
export function documentFaults(docs: readonly DraftDocument[], ctx: RegistrationContext): StepFault[] {
  const out: StepFault[] = [];
  const add = (f: Omit<StepFault, "step">) => out.push({ step: "documents", ...f });
  if (ctx.today == null) add({ code: "TIME_ZONE_UNSET", level: "block" });
  const live = ctx.types.filter((t) => !t.retired);
  if (live.length === 0) {
    add({ code: "DOCUMENT_TYPES_NOT_SET", level: "block" });
    return out;
  }

  for (const t of live) {
    const rows = docs.filter((d) => d.typeId === t.id);
    if (t.mandatoryAtRegistration === true && !rows.some((d) => documentStands(d, t))) add({ code: "DOCUMENT_REQUIRED", level: "block", field: `type.${t.id}`, data: { type: t.nameEn } });
    if (t.mandatoryAtRegistration == null) add({ code: "MANDATORY_NOT_SAID", level: "info", field: `type.${t.id}`, data: { type: t.nameEn } });
  }

  for (const d of docs) {
    const t = typeOf(ctx, d.typeId);
    const at = (name: string) => `documents.${d.id}.${name}`;
    if (!t || t.retired) {
      add({ code: "DOCUMENT_TYPE_UNKNOWN", level: "block", field: `documents.${d.id}` });
      continue;
    }
    const name = t.nameEn;
    const siblings = docs.filter((x) => x.typeId === d.typeId);
    if (t.repeatable !== true && siblings.length > 1 && siblings[0]!.id !== d.id) add({ code: "DOCUMENT_DUPLICATE", level: "block", field: `documents.${d.id}`, data: { type: name } });

    if (t.repeatable === true) {
      if (isBlank(d.title)) add({ code: "TITLE_REQUIRED", level: "block", field: at("title"), data: { type: name } });
      else if (siblings.some((x) => x.id !== d.id && sameTitle(x.title, d.title) && siblings.indexOf(x) < siblings.indexOf(d))) add({ code: "TITLE_DUPLICATE", level: "block", field: at("title"), data: { type: name, title: d.title.trim() } });
    }

    if (d.notApplicable) {
      if (t.notApplicableAllowed !== true) add({ code: "NOT_APPLICABLE_NOT_ALLOWED", level: "block", field: at("notApplicable"), data: { type: name } });
      continue;
    }
    if (d.fileCount === 0) add({ code: "FILE_REQUIRED", level: "block", field: at("file"), data: { type: name } });

    if (t.expires === true || t.expires === null) {
      if (isBlank(d.expiresOn)) {
        if (t.expires === true) add({ code: "EXPIRY_REQUIRED", level: "block", field: at("expiresOn"), data: { type: name } });
        else add({ code: "EXPIRES_NOT_SET", level: "warn", field: at("expiresOn"), data: { type: name } });
      } else if (!isDay(d.expiresOn!)) add({ code: "EXPIRY_NOT_A_DAY", level: "block", field: at("expiresOn"), data: { type: name } });
      else if (ctx.today != null && d.expiresOn! <= ctx.today) add({ code: "ALREADY_EXPIRED", level: "block", field: at("expiresOn"), data: { type: name, expiresOn: d.expiresOn! } });
    }

    if (t.recordsRate === true && parseRate(d.ratePercent) == null) add({ code: "RATE_INVALID", level: "block", field: at("ratePercent"), data: { type: name } });
  }
  return out;
}
