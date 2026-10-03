/**
 * The matrix domains a variation's matters are on (6.13 Part A step 4): each FR-VAR-008 event's route (route.ts maps
 * them), and the funder's consent (FR-VAR-009). Configuration keys, never shown. Pure.
 */

export const VARIATION_DOMAINS: readonly string[] = ["vo", "vo_increase", "vo_agreed_rate", "remeasurement", "vo_funder_consent"];
