/**
 * The hosts a server action may be called from besides the host it was sent to (`SERVER_ACTION_ALLOWED_ORIGINS`; Phase 1b, threat model F9). Pure.
 *
 * One parser for both readers, so they cannot diverge: `next.config.ts` hands the list to Next's own Origin-against-Host check, and `refuseForeignPost`
 * (the product's own guard on the sign-in and account actions) accepts an Origin host from the same list. Behind a reverse proxy that rewrites the host the
 * two differ, and the proxy's public host has to be named or every form is refused.
 *
 * Exact hosts only, as the browser writes them in Origin (`perolehan.example.org`, or `perolehan.example.org:8443`). A pattern such as `*.example.org` is
 * refused: SameSite does not stop a sibling subdomain (it is the same site), so naming a whole domain would let any page on it post a signed-in officer's
 * every server action. Comparison ignores case.
 */

export interface AllowedOrigins {
  /// The hosts to accept, lower-cased and without repeats.
  hosts: string[];
  /// The entries refused, each with why, as the operator is told.
  refused: { entry: string; why: string }[];
}

export function parseAllowedOrigins(raw: string | null | undefined): AllowedOrigins {
  const hosts: string[] = [];
  const refused: AllowedOrigins["refused"] = [];
  for (const piece of (raw ?? "").split(",")) {
    const entry = piece.trim();
    if (!entry) continue;
    if (entry.includes("*")) refused.push({ entry, why: "a pattern names every host under it, and a sibling subdomain is the same site: list each exact host" });
    else if (/[/\s]|:\/\//.test(entry)) refused.push({ entry, why: "give a host only (perolehan.example.org), with no scheme, path or spaces" });
    else if (!hosts.includes(entry.toLowerCase())) hosts.push(entry.toLowerCase());
  }
  return { hosts, refused };
}

/// The list for `next.config.ts`: throws, so the server does not start, where an entry would widen the origins beyond the exact hosts named.
export function allowedOriginsOrThrow(raw: string | null | undefined): string[] {
  const { hosts, refused } = parseAllowedOrigins(raw);
  if (refused.length > 0) {
    throw new Error(`SERVER_ACTION_ALLOWED_ORIGINS has ${refused.length === 1 ? "an entry" : "entries"} that cannot be used: ${refused.map((r) => `"${r.entry}" (${r.why})`).join("; ")}.`);
  }
  return hosts;
}
