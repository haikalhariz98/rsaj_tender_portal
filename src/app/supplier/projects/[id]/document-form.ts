import type { DocKind } from "@/lib/project-docs/types";

/**
 * What the contractor's New document and Upload a new version forms post, and which of their fields show (plan step 6, PW-9, PW-10). Pure, so it is tested without a drawer. The
 * server judges everything again; this only keeps the form from sending what the route refuses (a kind with a request, a password with any kind but a declaration).
 */

export interface KindChoice {
  value: DocKind;
  label: string;
  /// Sending it asks the password again (a statutory declaration).
  asksPassword: boolean;
}

/// A kind is picked only with a file sent, never with a request.
export const kindOffered = (mode: "upload" | "request", kinds: readonly KindChoice[]) => mode === "upload" && kinds.length > 0;

/// The chosen kind's choice, or null where none is chosen (an ordinary document).
export const chosenKind = (kinds: readonly KindChoice[], value: string): KindChoice | null => kinds.find((k) => k.value === value) ?? null;

/// The password field shows only where the act is signed: a document the page says asks it, or the kind chosen asks it.
export const passwordShown = (kinds: readonly KindChoice[], value: string, pageAsks = false) => pageAsks || (chosenKind(kinds, value)?.asksPassword ?? false);

/// The body of the create route: `kind` only with a file sent and one chosen, `password` only with a kind that asks it (the route refuses it with any other).
export function createBody(i: { contractId: string; title: string; note: string; mode: "upload" | "request"; versionIds: readonly string[]; kinds: readonly KindChoice[]; kind: string; password: string }): Record<string, unknown> {
  const chosen = i.mode === "upload" ? chosenKind(i.kinds, i.kind) : null;
  return {
    contractId: i.contractId,
    title: i.title,
    note: i.note,
    mode: i.mode,
    ...(i.mode === "upload" ? { versionIds: [...i.versionIds] } : {}),
    ...(chosen ? { kind: chosen.value } : {}),
    ...(chosen?.asksPassword ? { password: i.password } : {}),
  };
}

/// The body of the version route: `kind` where the first version of a document the organisation asked for may pick one, `password` where the act is signed.
export function versionBody(i: { contractId: string; documentId: string; versionIds: readonly string[]; note: string; mayPickKind: boolean; kinds: readonly KindChoice[]; kind: string; pageAsksPassword: boolean; password: string }): Record<string, unknown> {
  const chosen = i.mayPickKind ? chosenKind(i.kinds, i.kind) : null;
  const signed = i.pageAsksPassword || (chosen?.asksPassword ?? false);
  return { contractId: i.contractId, documentId: i.documentId, versionIds: [...i.versionIds], note: i.note, ...(chosen ? { kind: chosen.value } : {}), ...(signed ? { password: i.password } : {}) };
}
