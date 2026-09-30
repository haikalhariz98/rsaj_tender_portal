/**
 * Spec-shaped fixtures for tests. Never seeded: they are one customer's figures.
 */

import { parseSen } from "@/lib/money";

import type { LiabilityBand } from "./liability";

const band = (code: string, min: string | null, max: string | null, limit: string): LiabilityBand => ({
  code,
  minValue: min == null ? null : parseSen(min),
  maxValue: max == null ? null : parseSen(max),
  limit: parseSen(limit),
});

/// SK004 §7.3.3(c) as printed, transcribed to (min, max]: "RM25,001 to RM50,000" is
/// above RM25,000.99 and up to RM50,000.00, so the sen between the printed edges fall
/// in no band. ASSUMED transcription; the question is the customer's.
export const SK004_LIABILITY_BANDS: LiabilityBand[] = [
  band("b1", null, "25000", "10000"),
  band("b2", "25000.99", "50000", "25000"),
  band("b3", "50000.99", "150000", "50000"),
  band("b4", "150000.99", "250000", "75000"),
  band("b5", "250000.99", "500000", "100000"),
  band("b6", "500000.99", "1000000", "150000"),
  band("b7", "1000000", null, "200000"),
];
