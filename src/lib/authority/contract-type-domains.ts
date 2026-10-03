/**
 * The matters whose routing passes a contract type (FR-APR-002; BD-613-6 ruling): the one list. A row on any other
 * matter confined to a contract type would never be read by its callers, so the matrix's save refuses it, and the
 * resolver reports any type-confined row it skips for a caller that passes no type. A caller that starts passing a
 * type adds its matter here, with a test. Pure.
 */

import { matterLabel } from "@/lib/labels";

/// The Superintending Officer (6.13 Part A): resolved with the contract's type.
export const CONTRACT_TYPE_DOMAINS = ["superintending_officer"] as const;

export const takesContractType = (domain: string): boolean => (CONTRACT_TYPE_DOMAINS as readonly string[]).includes(domain);

/// The matters in words, for a hint or a refusal (never the keys).
export const contractTypeDomainWords = (): string => CONTRACT_TYPE_DOMAINS.map((d) => matterLabel(d)).join(", ");
