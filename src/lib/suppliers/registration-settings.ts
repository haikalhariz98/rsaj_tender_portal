/**
 * Configuration › Supplier register › Registration online (Phase 4b): the settings the supplier's own registration is judged by, and the wording of its declarations (GIRO, false declaration, terms and conditions). Every one is the
 * customer's and ships unset (AGENTS.md rule 1); an unset one closes what it governs and the screen names it. Pure: the action reads the classes and the texts and asks here.
 */

export const DECLARATION_KINDS = ["GIRO_AUTHORISATION", "FALSE_DECLARATION", "TERMS_AND_CONDITIONS"] as const;
export type DeclarationKindName = (typeof DECLARATION_KINDS)[number];
/// The declarations by what an officer calls them (the key is a configuration key and never reaches a screen).
export const DECLARATION_KIND_WORDS: Record<DeclarationKindName, string> = { GIRO_AUTHORISATION: "GIRO authorisation", FALSE_DECLARATION: "False-declaration acknowledgement", TERMS_AND_CONDITIONS: "Terms and conditions" };

export const MEGABYTE = 1_048_576;
export const MAX_FILES = 500;
export const MAX_MEGABYTES = 4096;
export const MAX_DECLARATION_CHARS = 8000;

export interface RegistrationSettingsInput {
  helpEmail: string | null;
  helpPhone: string | null;
  helpProvenance: string | null;
  maxFiles: number | null;
  maxMegabytes: number | null;
  uploadLimitProvenance: string | null;
  uploadClassId: string | null;
  statementClassId: string | null;
  uploadClassProvenance: string | null;
  onlineDeclarationReplacesPaper: boolean | null;
  onlineDeclarationProvenance: string | null;
}

export interface SettingError {
  field: string;
  message: string;
}

/// The size limit in bytes, or null while it is not set. Whole megabytes, so a figure the officer typed is the figure stored.
export function bytesOfMegabytes(mb: number | null): bigint | null {
  return mb == null ? null : BigInt(mb) * BigInt(MEGABYTE);
}

/// The size limit as the officer typed it: whole megabytes, or null while it is not set. A figure that is not a whole number of megabytes (set elsewhere) is shown rounded up, never down.
export function megabytesOfBytes(bytes: bigint | number | null): number | null {
  if (bytes == null) return null;
  const unit = BigInt(MEGABYTE);
  return Number((BigInt(bytes) + unit - BigInt(1)) / unit);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/// What is wrong with the settings as entered. A value set says where it came from; the two limits are set together or not at all; the bank statement's class must be SULIT.
export function registrationSettingErrors(v: RegistrationSettingsInput, ctx: { classes: readonly { id: string; classification: string | null }[] }): SettingError[] {
  const out: SettingError[] = [];
  const add = (field: string, message: string) => out.push({ field, message });
  if (v.helpEmail && !EMAIL.test(v.helpEmail)) add("helpEmail", "Use an email address such as name@example.org.");
  if (v.helpPhone && v.helpPhone.length > 40) add("helpPhone", "Use at most 40 characters.");
  if ((v.helpEmail || v.helpPhone) && !v.helpProvenance) add("helpProvenance", "Say where the help contact comes from.");
  if ((v.maxFiles == null) !== (v.maxMegabytes == null)) add(v.maxFiles == null ? "maxFiles" : "maxMegabytes", "Set both limits, or neither.");
  if (v.maxFiles != null && (!Number.isInteger(v.maxFiles) || v.maxFiles < 1 || v.maxFiles > MAX_FILES)) add("maxFiles", `Use a whole number from 1 to ${MAX_FILES}.`);
  if (v.maxMegabytes != null && (!Number.isInteger(v.maxMegabytes) || v.maxMegabytes < 1 || v.maxMegabytes > MAX_MEGABYTES)) add("maxMegabytes", `Use a whole number of megabytes from 1 to ${MAX_MEGABYTES}.`);
  if ((v.maxFiles != null || v.maxMegabytes != null) && !v.uploadLimitProvenance) add("uploadLimitProvenance", "Say where the limits come from.");
  const known = (id: string) => ctx.classes.find((c) => c.id === id);
  if (v.uploadClassId && !known(v.uploadClassId)) add("uploadClassId", "That document class is no longer configured.");
  if (v.statementClassId) {
    const c = known(v.statementClassId);
    if (!c) add("statementClassId", "That document class is no longer configured.");
    else if (c.classification !== "SULIT") add("statementClassId", "A bank statement is restricted (SULIT) data: choose a class classified SULIT, or set the classification under Documents first.");
  }
  if ((v.uploadClassId || v.statementClassId) && !v.uploadClassProvenance) add("uploadClassProvenance", "Say where the classes come from.");
  if (v.onlineDeclarationReplacesPaper != null && !v.onlineDeclarationProvenance) add("onlineDeclarationProvenance", "Say where that ruling comes from.");
  return out;
}

export interface DeclarationTextInput {
  kind: string | null;
  bodyEn: string;
  bodyMs?: string | null;
  provenance: string | null;
}

/// What is wrong with a declaration's wording as entered: a kind, the English body, its provenance, and a length a screen can show.
export function declarationTextErrors(v: DeclarationTextInput, kinds: readonly string[]): SettingError[] {
  const out: SettingError[] = [];
  const add = (field: string, message: string) => out.push({ field, message });
  if (!v.kind || !kinds.includes(v.kind)) add("kind", "Choose which declaration this is.");
  if (!v.bodyEn.trim()) add("bodyEn", "Write the wording.");
  if (v.bodyEn.length > MAX_DECLARATION_CHARS) add("bodyEn", `Use at most ${MAX_DECLARATION_CHARS} characters.`);
  if (v.bodyMs && v.bodyMs.length > MAX_DECLARATION_CHARS) add("bodyMs", `Use at most ${MAX_DECLARATION_CHARS} characters.`);
  if (!v.provenance) add("provenance", "Say where the wording comes from.");
  return out;
}
