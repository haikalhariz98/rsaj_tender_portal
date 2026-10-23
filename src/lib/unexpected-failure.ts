/// What a failure was, for the server's log: its kind and code, never its message or arguments (a database error prints its arguments, bank details among them).
export function errorKind(e: unknown): { name: string; code: string | null } {
  const x = (typeof e === "object" && e !== null ? e : {}) as { name?: unknown; code?: unknown };
  return { name: typeof x.name === "string" ? x.name : typeof e, code: typeof x.code === "string" ? x.code : null };
}

/// The reply for a failure a route did not expect: the log holds its kind only, the caller is told nothing of the cause.
export function unexpectedFailure(e: unknown): Response {
  console.error("Supplier request failed", errorKind(e));
  return Response.json({ ok: false, code: "TRY_AGAIN", message: "Something went wrong. Try again." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
