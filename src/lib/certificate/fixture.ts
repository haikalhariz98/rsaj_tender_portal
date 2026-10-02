/**
 * Test fixtures for the certificate core. Invented forms shaped like the spec's (Appendix C.2: an interim
 * certificate signed by the Recommending Officer, then the Superintending Officer, then the contractor and
 * a witness; distributed as an original and four copies, one to the guarantor). Never seeded: the product
 * ships no form, no block, no list (OD-5 A).
 */

import type { ComputedSnapshot } from "./snapshot";
import type { Block, DistributionRow } from "./types";

export const block = (blockOrder: number, over: Partial<Block> = {}): Block => ({
  blockOrder,
  blockKind: "SUPPORTING",
  labelEn: `Block ${blockOrder}`,
  labelMs: null,
  datesCertificate: false,
  officeRule: "NAMED_OFFICE",
  officeCode: "OFFICE",
  delegable: true,
  carriesDecision: false,
  refusalAllowed: false,
  ...over,
});

/// Recommending Officer (1) → Superintending Officer (2, dates the certificate) → contractor (3) → witness (4).
export const INTERIM_BLOCKS: Block[] = [
  block(1, { blockKind: "RECOMMENDING", labelEn: "Recommending Officer", officeRule: "NAMED_OFFICE", officeCode: "RO", carriesDecision: true }),
  block(2, { blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "NAMED_OFFICE", officeCode: "SO", datesCertificate: true, delegable: false }),
  block(3, { blockKind: "CONTRACTOR", labelEn: "The contractor", officeRule: "CONTRACTOR", officeCode: null, refusalAllowed: true, delegable: true }),
  block(4, { blockKind: "WITNESS", labelEn: "Witness", officeRule: "WITNESS", officeCode: null, delegable: true }),
];

export const row = (recipientCode: string, sortOrder: number, over: Partial<DistributionRow> = {}): DistributionRow => ({
  recipientCode,
  labelEn: recipientCode,
  labelMs: null,
  mandatory: true,
  ackRequired: false,
  condition: "NONE",
  isOriginal: false,
  sortOrder,
  ...over,
});

/// Interim / VO-663 / CPC / CMGD style: the original to the contractor and four copies, one to the guarantor.
export const FIVE_RECIPIENTS: DistributionRow[] = [
  row("contractor", 1, { labelEn: "The contractor (original)", isOriginal: true, ackRequired: true }),
  row("finance", 2, { labelEn: "Accounts and finance" }),
  row("department", 3, { labelEn: "The implementing department" }),
  row("file", 4, { labelEn: "Contract file" }),
  row("guarantor", 5, { labelEn: "The guarantor", condition: "GUARANTOR_EXISTS", ackRequired: true }),
];

/// A worked interim figure set (invented): gross 120,000.00, retention 6,000.00, previously certified 50,000.00.
export const INTERIM_FIGURES: ComputedSnapshot = {
  version: 1,
  computedOn: "2026-09-29",
  rule: { en: "Interim valuation (fixture)", ms: "Penilaian interim (lekapan)" },
  lines: [
    { key: "grossValuation", labelEn: "Gross valuation", labelMs: "Nilai kasar", type: "MONEY", value: "120000.00", overridable: true },
    { key: "retention", labelEn: "Less retention", labelMs: "Tolak wang tahanan", type: "MONEY", value: "6000.00", overridable: true },
    { key: "previouslyCertified", labelEn: "Less previously certified", labelMs: "Tolak yang telah diperakui", type: "MONEY", value: "50000.00", overridable: false },
    { key: "retentionPct", labelEn: "Retention", labelMs: "Wang tahanan", type: "PERCENT", value: "5.0000", overridable: false },
  ],
  totals: [
    { key: "netValuation", labelEn: "Net valuation", labelMs: "Nilai bersih", terms: [{ key: "grossValuation", sign: 1 }, { key: "retention", sign: -1 }] },
    { key: "amountDue", labelEn: "Amount due", labelMs: "Amaun kena dibayar", terms: [{ key: "netValuation", sign: 1 }, { key: "previouslyCertified", sign: -1 }] },
  ],
  routingRatio: null,
};
