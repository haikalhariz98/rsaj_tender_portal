/// Join class names, dropping the falsy ones.
export function cx(...parts: unknown[]): string {
  return parts.filter((p) => typeof p === "string" && p).join(" ");
}
