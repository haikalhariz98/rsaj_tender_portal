/**
 * How far each staff screen is in Bahasa Malaysia (NFR-LNG-001, ADR 0040): converted, partly converted, or
 * not converted. The three-state honesty of provenance: a screen that is partly English says so, and a
 * screen nobody has classified reads as not converted rather than passing for converted.
 *
 * Route patterns are written as the app folder names them, with "/" separators and route groups removed.
 * `coverage.scan.test.ts` walks every staff `page.tsx` and proves each one is in exactly one of the two lists.
 */

import { w, type Words } from "@/lib/contract/labels";

import type { Catalogue } from "./registry";

export type Coverage = "CONVERTED" | "PARTLY" | "NOT_CONVERTED";

/** The staff screens that are converted, wholly or in part. A screen moves here when a slice converts it. */
export const SCREEN_COVERAGE: Readonly<Record<string, Exclude<Coverage, "NOT_CONVERTED">>> = {
  "/": "CONVERTED",
  // A notice's stored title and body show as written (ADR 0040 Q2).
  "/inbox": "PARTLY",
  // The submissions view's answer drawer (the officer field, its validation text) and the action's refusals stay English (decisions log, N1 review fixes).
  "/projects": "PARTLY",
  // Panel bodies, drawer forms and action messages stay English in slice 1 (ADR 0040 Q1).
  "/projects/[id]": "PARTLY",
};

/**
 * Every other staff route pattern, pinned and sorted (JavaScript's default sort). The sign-in and welcome
 * screens are here because before sign-in there is no choice to read (ADR 0040 Q6). Supplier portal screens
 * are a later slice and are not listed. The old award addresses kept by AC-23 (the list, the new-award and
 * the award pages) only redirect and render nothing, so they are not screens and are deliberately unlisted:
 * the scan pins them, and an unlisted path reads as not converted. The award print view is a screen and is listed.
 */
export const NOT_YET_CONVERTED: readonly string[] = [
  "/account",
  "/approvals",
  "/awards/[id]/print/[kind]",
  "/committees",
  "/committees/[id]",
  "/configuration",
  "/configuration/accounts",
  "/configuration/approval-matrix",
  "/configuration/audit",
  "/configuration/awards",
  "/configuration/bid-sealing",
  "/configuration/budget",
  "/configuration/changes",
  "/configuration/committees",
  "/configuration/committees/[code]",
  "/configuration/contracts",
  "/configuration/documents",
  "/configuration/evaluation",
  "/configuration/evaluation/[modelId]",
  "/configuration/invitation",
  "/configuration/notifications",
  "/configuration/numbering",
  "/configuration/organisation",
  "/configuration/post-award",
  "/configuration/reference-data",
  "/configuration/requisitions",
  "/configuration/routing-sheets",
  "/configuration/routing-sheets/[id]",
  "/configuration/scope",
  "/configuration/security",
  "/configuration/suppliers",
  "/configuration/templates",
  "/configuration/templates/[id]",
  "/configuration/tender-documents",
  "/configuration/users",
  "/documents",
  "/inbox/[id]",
  "/projects/[id]/certificates/[certId]",
  "/projects/[id]/variations/[variationId]",
  "/projects/new",
  "/requisitions",
  "/requisitions/[id]",
  "/requisitions/[id]/edit",
  "/requisitions/new",
  "/securities",
  "/sign-in",
  "/sign-in/code",
  "/sourcing",
  "/sourcing/[id]",
  "/sourcing/[id]/appendix",
  "/sourcing/[id]/documents/print",
  "/sourcing/[id]/edit",
  "/sourcing/[id]/evaluation/proposal",
  "/sourcing/[id]/evaluation/report",
  "/sourcing/[id]/label/[saleId]",
  "/sourcing/[id]/opening/print",
  "/sourcing/new",
  "/suppliers",
  "/suppliers/[id]",
  "/suppliers/new",
  "/suppliers/online",
  "/suppliers/online/[id]",
  "/welcome",
];

const segmentsOf = (p: string) => p.split("/").filter((s) => s !== "");
const isParam = (segment: string) => /^\[[^\]./]+\]$/.test(segment);

/**
 * The route pattern a pathname resolves to, or null when none matches. A "[name]" segment matches any one
 * non-empty segment; where several patterns match, the one with a static segment at the first point they
 * differ wins, as the router resolves them ("/projects/new" beats "/projects/[id]"). A trailing slash is
 * ignored. Catch-all segments are not recognised: no staff route uses one, and an unmatched path is null.
 */
export function routePatternOf(pathname: string, patterns: readonly string[]): string | null {
  const path = segmentsOf(pathname.split(/[?#]/)[0]);
  let best: { pattern: string; shape: boolean[] } | null = null;
  for (const pattern of patterns) {
    const segs = segmentsOf(pattern);
    if (segs.length !== path.length) continue;
    if (!segs.every((s, i) => (isParam(s) ? true : s === path[i]))) continue;
    const shape = segs.map((s) => !isParam(s)); // true = static
    if (best === null || moreSpecific(shape, best.shape)) best = { pattern, shape };
  }
  return best?.pattern ?? null;
}

/** Whether `a` has a static segment where `b` has a parameter, at the first position they differ. */
function moreSpecific(a: boolean[], b: boolean[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i];
  return false;
}

const KNOWN = [...Object.keys(SCREEN_COVERAGE), ...NOT_YET_CONVERTED];

/** A pathname's coverage. A path no list knows is NOT_CONVERTED (the conservative reading). */
export function coverageOf(pathname: string): Coverage {
  const pattern = routePatternOf(pathname, KNOWN);
  return pattern !== null && Object.prototype.hasOwnProperty.call(SCREEN_COVERAGE, pattern) ? SCREEN_COVERAGE[pattern] : "NOT_CONVERTED";
}

/** Shown, in both languages, on a NOT_CONVERTED screen with Malay chosen. */
export const NOT_CONVERTED_NOTICE: Words = w(
  "This screen is not yet in Bahasa Malaysia.",
  "Skrin ini belum lagi dalam Bahasa Malaysia.",
);

/** Shown, in both languages, on a PARTLY screen with Malay chosen. */
export const PARTLY_NOTICE: Words = w(
  "Parts of this screen are not yet in Bahasa Malaysia.",
  "Sebahagian skrin ini belum lagi dalam Bahasa Malaysia.",
);

/** The two notices, registered so the customer's review lists them (drafted in the N1 slice). */
export const COVERAGE_NOTICES: Catalogue = {
  name: "coverage",
  review: "DRAFTED_NOT_REVIEWED",
  words: { notConverted: NOT_CONVERTED_NOTICE, partly: PARTLY_NOTICE },
};
