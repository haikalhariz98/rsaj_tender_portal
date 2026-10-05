/// The pure part of the shared Select: what a search keeps, where the arrow keys land,
/// what typing a letter jumps to, and how several chosen values ride one form field.
/// The component renders; it does not decide any of this.

export type Opt = {
  value: string;
  label: string;
  disabled?: boolean;
  /// A second line under the label; searched as well.
  sub?: string;
};

/// Generic prompts: words that ask for a choice rather than name one. An empty option
/// worded like this is a placeholder, never a value somebody picked ("Choose", "Select…",
/// "Select an option"). Anything else ("None", "Not set", "Nobody", "Any", "Not on file",
/// "No section in this department") names a state that can be a real, saved choice.
const PROMPT = /^(choose|select|pick)(\s+(an?\s+)?(option|one|value|item))?\s*(…|\.{3})?$/i;

export function isPromptLabel(label: string): boolean {
  return PROMPT.test(label.trim());
}

export const CLEAR_LABEL = "Clear selection";

export type EmptyRole = "none" | "placeholder" | "choice";

/// What the empty-value option (value "") is, in one rule:
///  - a required field: a placeholder (nothing may be saved empty, so it is never a row);
///  - an optional field whose label is a generic prompt: a placeholder;
///  - anything else: a choice, kept as an ordinary row (unset can be a saved answer).
export function emptyOptionRole(
  options: readonly Opt[],
  { required = false, multiple = false }: { required?: boolean; multiple?: boolean } = {},
): EmptyRole {
  const empty = options.find((o) => o.value === "");
  if (!empty || multiple) return "none";
  return required || isPromptLabel(empty.label) ? "placeholder" : "choice";
}

export type ChoicePlan<T extends Opt> = {
  role: EmptyRole;
  /// The rows to list: the placeholder is taken out; a choice stays.
  rows: T[];
  /// The closed field's muted text while nothing is chosen (the placeholder's own words).
  placeholder?: string;
  /// One muted "Clear selection" row at the top: only for an optional field whose empty
  /// option is a placeholder, and only while a value is selected.
  clear: boolean;
};

export function planChoices<T extends Opt>(
  options: readonly T[],
  { required = false, multiple = false, hasValue }: { required?: boolean; multiple?: boolean; hasValue: boolean },
): ChoicePlan<T> {
  const role = emptyOptionRole(options, { required, multiple });
  if (role !== "placeholder") return { role, rows: [...options], clear: false };
  return {
    role,
    rows: options.filter((o) => o.value !== ""),
    placeholder: options.find((o) => o.value === "")?.label,
    clear: !required && hasValue,
  };
}

/// A search box appears above this many choosable options, unless the caller says.
export const SEARCH_THRESHOLD = 7;

/// The empty option ("Not set") is a way to clear, not something to search through, so
/// it does not count towards the threshold.
export function wantsSearch(options: readonly Opt[], override?: boolean): boolean {
  if (override !== undefined) return override;
  return options.filter((o) => o.value !== "").length > SEARCH_THRESHOLD;
}

const norm = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");

/// Options matching every word of the query, in the label or the second line. An empty
/// query keeps everything. The order is the caller's.
export function filterOptions<T extends Opt>(options: readonly T[], query: string): T[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...options];
  return options.filter((o) => {
    const hay = norm(`${o.label} ${o.sub ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
}

export type MoveKey = "ArrowDown" | "ArrowUp" | "Home" | "End" | "PageDown" | "PageUp";

const PAGE = 8;

/// The index the active row moves to, skipping disabled options and staying put at either
/// end (no wrap: a list that wraps hides where it ends). `from` is -1 when nothing is
/// active yet. Returns -1 when no option can be chosen.
export function moveActive(options: readonly Opt[], from: number, key: MoveKey): number {
  const ok = (i: number) => i >= 0 && i < options.length && !options[i].disabled;
  const scan = (start: number, step: 1 | -1) => {
    for (let i = start; i >= 0 && i < options.length; i += step) if (ok(i)) return i;
    return -1;
  };
  let target: number;
  switch (key) {
    case "Home":
      return scan(0, 1);
    case "End":
      return scan(options.length - 1, -1);
    case "ArrowDown":
      target = scan(from + 1, 1);
      break;
    case "ArrowUp":
      target = scan(from < 0 ? options.length - 1 : from - 1, -1);
      break;
    case "PageDown":
      target = scan(Math.min(options.length - 1, Math.max(from, 0) + PAGE), -1);
      if (target <= from) target = scan(from + 1, 1);
      break;
    case "PageUp":
      target = scan(Math.max(0, (from < 0 ? options.length : from) - PAGE), 1);
      if (target >= from && from >= 0) target = scan(from - 1, -1);
      break;
  }
  return target === -1 ? (ok(from) ? from : -1) : target;
}

/// The first choosable option at or after `from` whose label starts with `typed`,
/// wrapping once; a repeated single letter cycles through the options starting with it,
/// as a native select does. -1 when none.
export function typeahead(options: readonly Opt[], typed: string, from: number): number {
  const t = norm(typed);
  if (!t) return -1;
  const cycling = t.length > 1 && [...t].every((c) => c === t[0]);
  const needle = cycling ? t[0] : t;
  const begin = cycling || t.length === 1 ? from + 1 : Math.max(from, 0);
  for (let n = 0; n < options.length; n++) {
    const i = (begin + n) % options.length;
    const o = options[i];
    if (!o.disabled && norm(o.label).startsWith(needle)) return i;
  }
  return -1;
}

/// Add the value when absent, remove it when present. Order is the order chosen.
export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/// Several values ride one form field, newline-separated: a comma can appear in a
/// customer's own code, a newline cannot. One field, never N entries under one name,
/// because a server action reading a form takes the first and drops the rest silently.
export function joinValues(values: readonly string[]): string {
  return values.join("\n");
}

/// Reads what joinValues wrote (and tolerates CRLF, stray space and blank lines).
export function splitValues(posted: FormDataEntryValue | string | null | undefined): string[] {
  if (typeof posted !== "string") return [];
  return posted
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/// "{n} options" / "No matches", for the polite live region.
export function resultsAnnouncement(count: number): string {
  return count === 0 ? "No matches" : count === 1 ? "1 option" : `${count} options`;
}

/// Whether a chosen value's option was offered and has just been taken away, so the choice should
/// be cleared rather than shown as its raw value. A value with no option before either (a saved
/// code since retired) is not "dropped": it keeps showing as it always did.
export function choiceDropped(before: readonly Opt[], after: readonly Opt[], value: string): boolean {
  if (value === "") return false;
  return before.some((o) => o.value === value) && !after.some((o) => o.value === value);
}
