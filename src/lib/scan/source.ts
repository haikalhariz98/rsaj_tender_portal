/**
 * A small lexer for source scans (6.14 increment 1): the functions 6.12's lock-order scan first defined in
 * its own test, lifted unchanged so every scan shares one copy without importing a test file (614-C2: 6.12's
 * copy is gone; src/lib/contract/lock-order.test.ts imports these). `lex` blanks strings, comments, regular expressions and template text
 * (lengths and newlines kept); `spans` finds every named function's body; `enclosingFn` names the
 * innermost function a position is inside. Used by tests only.
 */

/// The source with string, comment, regex and template text blanked to spaces (lengths and newlines kept).
/// `only: "comments"` blanks the comments alone and keeps the text of strings, templates and regexes (6.14 inc 1
/// residual: raw SQL is read in its strings, never in its comments).
export function lex(src: string, opts: { only?: "comments" } = {}): string {
  const out = src.split("");
  const n = src.length;
  const tpl: number[] = [];
  let depth = 0;
  let prev = "";
  const keepText = opts.only === "comments";
  const blankComment = (a: number, b: number) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };
  const blank = (a: number, b: number) => {
    if (!keepText) blankComment(a, b);
  };
  const template = (from: number): number => {
    let j = from;
    while (j < n) {
      if (src[j] === "\\") {
        blank(j, j + 2);
        j += 2;
        continue;
      }
      if (src[j] === "`") return j + 1;
      if (src[j] === "$" && src[j + 1] === "{") {
        tpl.push(depth);
        depth++;
        return j + 2;
      }
      if (out[j] !== "\n" && !keepText) out[j] = " ";
      j++;
    }
    return n;
  };
  let i = 0;
  while (i < n) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === "/" && nx === "/") {
      const e = src.indexOf("\n", i);
      const end = e === -1 ? n : e;
      blankComment(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && nx === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e === -1 ? n : e + 2;
      blankComment(i, end);
      i = end;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n && src[j] !== ch && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
      prev = ch;
      continue;
    }
    if (ch === "`") {
      i = template(i + 1);
      prev = "`";
      continue;
    }
    if (ch === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev) || /\b(return|typeof|case|in|of)\s*$/.test(src.slice(Math.max(0, i - 8), i)))) {
      let j = i + 1;
      let cls = false;
      while (j < n && src[j] !== "\n" && (cls || src[j] !== "/")) {
        if (src[j] === "\\") j++;
        else if (src[j] === "[") cls = true;
        else if (src[j] === "]") cls = false;
        j++;
      }
      if (src[j] === "/") {
        blank(i + 1, j);
        i = j + 1;
        prev = "/";
        continue;
      }
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (tpl.length && tpl[tpl.length - 1] === depth) {
        tpl.pop();
        i = template(i + 1);
        continue;
      }
    }
    if (!/\s/.test(ch)) prev = ch;
    i++;
  }
  return out.join("");
}

/// The index of the bracket closing the one at `open`, on lexed text.
export function closing(m: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const want = pairs[m[open]];
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    if (m[i] === m[open]) depth++;
    else if (m[i] === want && --depth === 0) return i;
  }
  return m.length - 1;
}

/**
 * 614b-C3: the end of a type argument list opened at `open` (a `<`), read by angle-bracket depth on lexed text, so a
 * type argument holding parentheses, backticks in a string type or a nested generic is read whole. An arrow's `>`
 * (`=>`, in a function type) does not close a bracket. Strings are already blanked by `lex`, so a `>` inside a string
 * type never counts. -1 when the brackets never balance.
 */
export function typeArgumentsEnd(m: string, open: number): number {
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    if (m[i] === "<") depth++;
    else if (m[i] === ">" && m[i - 1] !== "=" && --depth === 0) return i;
  }
  return -1;
}

/// One raw SQL call as the scans read it: where it starts, which client method, and what follows its type argument.
export interface RawCall {
  at: number;
  method: "queryRaw" | "executeRaw";
  unsafe: boolean;
  /// Run 0 fix round (consider): whatever follows the method's name ("" plain, "Unsafe", or another, such as "Typed").
  suffix: string;
  /// The character after the method and its type argument: "`" a tagged template, "(" a call; null when it is neither
  /// (the method taken without being called, or a type argument that never closes), or when the method's suffix is one
  /// the scans do not know (`$queryRawTyped(…)` passes a compiled query, whose SQL is not in the source): no scan can read it.
  opener: "`" | "(" | null;
  /// The index of that opener (or where it was looked for).
  openAt: number;
}

/// The suffixes a scan can read the SQL of: the plain method, and the Unsafe form (whose SQL is a string argument).
const KNOWN_SUFFIXES = new Set(["", "Unsafe"]);

/**
 * 614b-C3: every `$queryRaw` / `$executeRaw` on lexed text, its type argument read by depth. Run 0 fix round (consider):
 * any suffix is found (`\$(executeRaw|queryRaw)\w*`, so `$queryRawTyped` and a suffix not known yet are never skipped);
 * one the scans do not know is unreadable (opener null), whatever follows it.
 */
export function rawCalls(m: string): RawCall[] {
  const out: RawCall[] = [];
  for (const x of m.matchAll(/\$(executeRaw|queryRaw)(\w*)/g)) {
    const suffix = x[2];
    const base = { at: x.index!, method: x[1] as RawCall["method"], unsafe: suffix === "Unsafe", suffix };
    let p = x.index! + x[0].length;
    while (p < m.length && /\s/.test(m[p])) p++;
    if (!KNOWN_SUFFIXES.has(suffix)) {
      out.push({ ...base, opener: null, openAt: p });
      continue;
    }
    if (m[p] === "<") {
      const end = typeArgumentsEnd(m, p);
      if (end < 0) {
        out.push({ ...base, opener: null, openAt: p });
        continue;
      }
      p = end + 1;
      while (p < m.length && /\s/.test(m[p])) p++;
    }
    const opener = m[p] === "`" || m[p] === "(" ? (m[p] as "`" | "(") : null;
    out.push({ ...base, opener, openAt: p });
  }
  return out;
}

/**
 * The SQL text of a readable raw call, from the raw source (`src`) and its lexed text (`m`): a tagged template to its
 * closing backtick, a call to its closing parenthesis (`closing` on lexed text). Null when the call cannot be read.
 */
export function rawCallText(src: string, m: string, c: RawCall): string | null {
  if (c.opener === "`") {
    const end = src.indexOf("`", c.openAt + 1);
    return end < 0 ? null : src.slice(c.openAt, end + 1);
  }
  if (c.opener === "(") return src.slice(c.openAt, closing(m, c.openAt) + 1);
  return null;
}

const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "with", "do", "else", "new", "typeof", "await", "yield", "super", "import"]);

/// Every named function's body span: declarations, object-literal and class methods, named arrows and function expressions.
export function spans(m: string): { name: string; from: number; to: number }[] {
  const out: { name: string; from: number; to: number }[] = [];
  const bodyAfter = (closeParen: number): number | null => {
    const rest = m.slice(closeParen + 1);
    const t = /^\s*(?::\s*[^{;=]*?)?\{/.exec(rest);
    return t ? closeParen + 1 + t[0].length - 1 : null;
  };
  // Declarations, function expressions and methods: NAME( … ) [: type] {
  for (const x of m.matchAll(/\b(\w+)\s*(?:<[^>()]*>)?\s*\(/g)) {
    const name = x[1];
    if (KEYWORDS.has(name)) continue;
    const before = m.slice(Math.max(0, x.index! - 40), x.index!);
    const open = x.index! + x[0].length - 1;
    const close = closing(m, open);
    const body = bodyAfter(close);
    if (body == null) continue;
    // A call followed by a block (`foo(x) { … }`) is not valid code, so NAME(…) { is a definition.
    if (!/(function\s*\*?\s*|[{,;}\n]\s*(?:async\s+|static\s+|get\s+|set\s+|public\s+|private\s+)*|^\s*)$/.test(before) && !/\bfunction\s*\*?\s*$/.test(before)) continue;
    out.push({ name, from: body, to: closing(m, body) });
  }
  // Anonymous function expressions and arrows assigned to a name or a property: NAME = / NAME: [async] (…) => or function (…)
  for (const x of m.matchAll(/=>/g)) {
    let p = x.index! - 1;
    while (p >= 0 && /\s/.test(m[p])) p--;
    // Skip a return type: `): T =>` is rare here; look for the parameter list or a bare parameter.
    let start: number;
    if (m[p] === ")") {
      let depth = 0;
      let q = p;
      for (; q >= 0; q--) {
        if (m[q] === ")") depth++;
        else if (m[q] === "(" && --depth === 0) break;
      }
      start = q;
    } else {
      let q = p;
      while (q >= 0 && /\w/.test(m[q])) q--;
      start = q + 1;
    }
    const head = m.slice(Math.max(0, start - 60), start);
    const named = /(\w+)\s*(?::\s*[^=:,{}()]*)?\s*[:=]\s*(?:async\s*)?$/.exec(head);
    if (!named || KEYWORDS.has(named[1])) continue;
    let b = x.index! + 2;
    while (b < m.length && /\s/.test(m[b])) b++;
    if (m[b] === "{") {
      out.push({ name: named[1], from: b, to: closing(m, b) });
      continue;
    }
    let depth = 0;
    let e = b;
    for (; e < m.length; e++) {
      if ("([{".includes(m[e])) depth++;
      else if (")]}".includes(m[e])) {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0 && (m[e] === "," || m[e] === ";")) break;
    }
    out.push({ name: named[1], from: b, to: e });
  }
  for (const x of m.matchAll(/(\w+)\s*[:=]\s*(?:async\s+)?function\s*\*?\s*\(/g)) {
    const open = x.index! + x[0].length - 1;
    const body = bodyAfter(closing(m, open));
    if (body != null) out.push({ name: x[1], from: body, to: closing(m, body) });
  }
  return out;
}

/// The innermost named function a position is inside.
export function enclosingFn(sp: readonly { name: string; from: number; to: number }[], at: number): string {
  let best: { name: string; from: number; to: number } | null = null;
  for (const s of sp) if (s.from <= at && at <= s.to && (!best || s.to - s.from < best.to - best.from)) best = s;
  return best?.name ?? "(top level)";
}

/// "use server" as a module directive however it is written: either quote, after a BOM, blank lines or comments.
/// Lifted unchanged from lock-order.test.ts (residual round, S-3a) so the act-status scan reads the same modules.
export function isServerModule(src: string): boolean {
  const head = src.replace(/^\ufeff/, "").replace(/^(?:\s+|\/\/[^\n]*\n?|\/\*[\s\S]*?\*\/)*/, "");
  return /^(["'])use server\1/.test(head);
}
