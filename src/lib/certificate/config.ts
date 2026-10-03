/**
 * The template register's signature blocks and distribution lists, and the routing sheet configuration
 * (6.14 increment 1, FR-CRT-001, 006, 007, 008): what a row must say before it is saved. Pure. Everything here
 * ships empty (OD-5 A): the customer's forms, orders, lists, checks and targets are configuration.
 */

import { parsePercent } from "@/lib/securities/money";

import type { Block, DistributionRow, Finding, RoutingCheckKind } from "./types";

const f = (code: string, data: Record<string, string | number | null> = {}): Finding => ({ code, level: "block", data });
const CODE = /^[a-z][a-z0-9_]*$/;

/// A block, judged against the form's other blocks (`others` excludes the one being edited).
export function blockFaults(b: Block, others: readonly Block[], offices: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  if (!Number.isInteger(b.blockOrder) || b.blockOrder < 1) out.push(f("BLOCK_ORDER"));
  if (others.some((o) => o.blockOrder === b.blockOrder)) out.push(f("BLOCK_ORDER_TAKEN", { order: b.blockOrder }));
  if (!b.labelEn.trim()) out.push(f("BLOCK_LABEL"));
  if (b.officeRule === "NAMED_OFFICE" && !b.officeCode) out.push(f("BLOCK_OFFICE_REQUIRED"));
  if (b.officeRule === "NAMED_OFFICE" && b.officeCode && !offices.has(b.officeCode)) out.push(f("BLOCK_OFFICE_UNKNOWN"));
  if (b.officeRule !== "NAMED_OFFICE" && b.officeCode) out.push(f("BLOCK_OFFICE_NOT_NAMED"));
  if (b.refusalAllowed && b.officeRule !== "CONTRACTOR") out.push(f("BLOCK_REFUSAL_CONTRACTOR_ONLY"));
  if (b.datesCertificate && others.some((o) => o.datesCertificate)) out.push(f("BLOCK_ONE_DATING", { block: others.find((o) => o.datesCertificate)!.labelEn }));
  return out;
}

export function distributionFaultsOf(r: DistributionRow, others: readonly DistributionRow[]): Finding[] {
  const out: Finding[] = [];
  if (!CODE.test(r.recipientCode)) out.push(f("RECIPIENT_CODE"));
  if (others.some((o) => o.recipientCode === r.recipientCode)) out.push(f("RECIPIENT_CODE_TAKEN"));
  if (!r.labelEn.trim()) out.push(f("RECIPIENT_LABEL"));
  if (r.isOriginal && others.some((o) => o.isOriginal)) out.push(f("ONE_ORIGINAL", { recipient: others.find((o) => o.isOriginal)!.labelEn }));
  return out;
}

export interface CheckDefRow {
  order: number;
  kind: RoutingCheckKind;
  labelEn: string;
  officeCode: string | null;
  targetDays: number | null;
}

export function checkDefFaults(d: CheckDefRow, others: readonly CheckDefRow[], offices: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  if (!Number.isInteger(d.order) || d.order < 1) out.push(f("CHECK_ORDER"));
  if (others.some((o) => o.order === d.order)) out.push(f("CHECK_ORDER_TAKEN", { order: d.order }));
  if (!d.labelEn.trim()) out.push(f("CHECK_LABEL"));
  if (d.officeCode && !offices.has(d.officeCode)) out.push(f("BLOCK_OFFICE_UNKNOWN"));
  if (d.targetDays != null && (!Number.isInteger(d.targetDays) || d.targetDays < 1)) out.push(f("TARGET_DAYS"));
  return out;
}

export interface TargetRowIn {
  pctMin: string | null;
  pctMax: string | null;
  targetDays: number;
}

/// A target, judged against the type's other targets: bands do not overlap, and an unbanded target stands alone.
export function targetFaults(t: TargetRowIn, others: readonly TargetRowIn[]): Finding[] {
  const out: Finding[] = [];
  if (!Number.isInteger(t.targetDays) || t.targetDays < 1) out.push(f("TARGET_DAYS"));
  let lo: bigint | null = null;
  let hi: bigint | null = null;
  try {
    lo = t.pctMin == null ? null : parsePercent(t.pctMin);
    hi = t.pctMax == null ? null : parsePercent(t.pctMax);
  } catch {
    out.push(f("TARGET_PERCENT"));
    return out;
  }
  if (lo != null && hi != null && lo >= hi) out.push(f("TARGET_BAND_ORDER"));
  const banded = lo != null || hi != null;
  if (!banded && others.length) out.push(f("TARGET_UNBANDED_ALONE"));
  if (banded && others.some((o) => o.pctMin == null && o.pctMax == null)) out.push(f("TARGET_UNBANDED_ALONE"));
  // Two bands overlap where each starts before the other ends (edges shared are fine: the type's switch decides them).
  for (const o of others) {
    if (o.pctMin == null && o.pctMax == null) continue;
    const olo = o.pctMin == null ? null : parsePercent(o.pctMin);
    const ohi = o.pctMax == null ? null : parsePercent(o.pctMax);
    const startsBeforeOtherEnds = ohi == null || lo == null || lo < ohi;
    const otherStartsBeforeEnds = hi == null || olo == null || olo < hi;
    if (banded && startsBeforeOtherEnds && otherStartsBeforeEnds) {
      out.push(f("TARGET_OVERLAP"));
      break;
    }
  }
  return out;
}

export const CONFIG_FAULT_TEXT: Readonly<Record<string, { en: string; ms: string }>> = {
  BLOCK_ORDER: { en: "Give the block's place in the printed order: a whole number from 1.", ms: "Berikan kedudukan blok dalam susunan bercetak: nombor bulat dari 1." },
  BLOCK_ORDER_TAKEN: { en: "Another block already has that place in the printed order.", ms: "Blok lain sudah mempunyai kedudukan itu." },
  BLOCK_LABEL: { en: "Give the block's label as printed.", ms: "Berikan label blok seperti dicetak." },
  BLOCK_OFFICE_REQUIRED: { en: "A named-office block names the office that signs it.", ms: "Blok jawatan bernama menamakan jawatan yang menandatanganinya." },
  BLOCK_OFFICE_UNKNOWN: { en: "That office is not on the approval matrix's list of offices.", ms: "Jawatan itu tiada dalam senarai jawatan matriks kelulusan." },
  BLOCK_OFFICE_NOT_NAMED: { en: "Only a named-office block names an office: the others are resolved by their rule.", ms: "Hanya blok jawatan bernama menamakan jawatan." },
  BLOCK_REFUSAL_CONTRACTOR_ONLY: { en: "Only the contractor's block may record a refusal to sign.", ms: "Hanya blok kontraktor boleh merekodkan penolakan menandatangani." },
  BLOCK_ONE_DATING: { en: "Another block already dates the certificate: a form has one.", ms: "Blok lain sudah menentukan tarikh perakuan: satu borang mempunyai satu." },
  RECIPIENT_CODE: { en: "Give the recipient a code in small letters, digits and underscores, starting with a letter.", ms: "Berikan kod penerima dalam huruf kecil, digit dan garis bawah." },
  RECIPIENT_CODE_TAKEN: { en: "Another recipient on this form already has that code.", ms: "Penerima lain sudah menggunakan kod itu." },
  RECIPIENT_LABEL: { en: "Give the recipient's name as the form addresses it.", ms: "Berikan nama penerima." },
  ONE_ORIGINAL: { en: "Another recipient already receives the original: a form sends one.", ms: "Penerima lain sudah menerima salinan asal." },
  CHECK_ORDER: { en: "Give the check's place on the sheet: a whole number from 1.", ms: "Berikan kedudukan semakan: nombor bulat dari 1." },
  CHECK_ORDER_TAKEN: { en: "Another check already has that place on the sheet.", ms: "Semakan lain sudah mempunyai kedudukan itu." },
  CHECK_LABEL: { en: "Give the check's label as printed.", ms: "Berikan label semakan seperti dicetak." },
  TARGET_DAYS: { en: "Give the days as a whole number from 1.", ms: "Berikan hari sebagai nombor bulat dari 1." },
  TARGET_PERCENT: { en: "Give a percentage with at most four decimal places.", ms: "Berikan peratusan dengan paling banyak empat tempat perpuluhan." },
  TARGET_BAND_ORDER: { en: "The band's lower edge is below its upper edge.", ms: "Had bawah jalur di bawah had atasnya." },
  TARGET_UNBANDED_ALONE: { en: "A target with no band stands alone: a type has either one unbanded target or bands.", ms: "Sasaran tanpa jalur berdiri sendiri." },
  TARGET_OVERLAP: { en: "That band overlaps another of the type's bands. Bands may share an edge; the type's switch says which side counts.", ms: "Jalur itu bertindih dengan jalur lain." },
};

export const configFaultText = (fs: readonly Finding[]) => fs.map((x) => CONFIG_FAULT_TEXT[x.code]?.en ?? "Refused.").join(" ");

/**
 * A form's version after a change to its signature blocks or its distribution list (6.14 inc 1 fix round). A
 * certificate pins the form's text, blocks and list together at its first signature and names the version it
 * pinned, so a change to the blocks or the list is a new version of the form, as a change to its text is: two
 * certificates "pinned at version N" always pinned the same blocks and recipients. A form with no text yet
 * (version 0) can pin nothing, and keeps 0 until its text is written.
 */
export const nextFormVersion = (current: number): number => (current === 0 ? 0 : current + 1);
