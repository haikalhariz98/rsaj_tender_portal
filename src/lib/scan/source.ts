/**
 * A small lexer for source scans (6.14 increment 1): the same functions 6.12's lock-order scan defines in
 * its own test (src/lib/contract/lock-order.test.ts), lifted unchanged so other scans can share them
 * without importing a test file. `lex` blanks strings, comments, regular expressions and template text
 * (lengths and newlines kept); `spans` finds every named function's body; `enclosingFn` names the
 * innermost function a position is inside. Used by tests only.
 */

/// The source with string, comment, regex and template text blanked to spaces (lengths and newlines kept).
export function lex(src: string): string {
  const out = src.split("");
  const n = src.length;
  const tpl: number[] = [];
  let depth = 0;
  let prev = "";
  const blank = (a: number, b: number) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
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
      if (out[j] !== "\n") out[j] = " ";
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
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && nx === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e === -1 ? n : e + 2;
      blank(i, end);
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
