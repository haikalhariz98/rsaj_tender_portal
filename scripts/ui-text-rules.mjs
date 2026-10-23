// The literal-text rules of the minimal-words standard (docs/notes/design/0005-minimal-words.md §3.1, §4, R2).
//
// Pure: `scanSource(file, source)` returns the violations in one file, so a test can prove what
// passes and what fails. Only literal text is judged. A value that is looked up or built at run
// time is not seen, and an interpolated value counts as one word. The longest branch of a
// conditional is the one measured.
import ts from "typescript";

export const BUDGET = {
  pageSubtitle: 8,
  cardSubtitle: 6,
  editorIntro: 15,
  callout: 15,
  fieldHint: 8,
  /// A paragraph on a screen that has been through minimal-words round 2 (0005 R14, R15): longer text is a MoreText.
  paragraph: 20,
};

/// Screens already cut to the paragraph budget. A screen joins this list when its round-2 cut is done.
export const PARAGRAPH_SCREENS = [/^src\/app\/sourcing\/\[id\]\/(?:documents|opening|bids|briefing|scope)\/(?!print\/)/, /^src\/app\/configuration\/[a-z-]+\//, /^src\/app\/(?:committees|requisitions|suppliers)\/\[id\]\//, /^src\/app\/projects\/\[id\]\/award\//];

/// Spec and ruling codes are configuration keys and never reach a screen (AGENTS.md rule 5, 0005 R2).
/// Literal patterns only: money ("RM 1.2m"), percentages ("6.2%") and dates never match, and a
/// customer's own clause citation ("SK002 7.4.2(g)") is data, not a product code.
export const CODE_PATTERNS = [
  /\b(?:NFR|FR)-[A-Z]{2,5}-\d{2,3}\b/,
  /\b(?:AC|OD|BD)-\d+(?:-\d+)?\b/,
  /\bSR-\d{2}\b/,
  /\([1-9]\.\d{1,2}\)/,
];

/// Phrases that no screen says (simplification plan section 6, "Enforced"): only the unambiguous ones. Single words such as "issue",
/// "case", "act" and "window" are legitimate elsewhere, so they stay a review list. Held by the baseline ratchet in check-ui.mjs.
export const BANNED_WORDS = [
  ["(invented)", /\(invented\)/i],
  ["Core routing", /core routing/i],
  ["band famil...", /band famil/i],
  ["Boundary ruling", /boundary ruling/i],
  ["SULIT · withheld", /SULIT\s*·\s*withheld/i],
  ["Gate met", /gate met/i],
  ['"(A)", "(R)" or "(P)" after an action name', /[A-Za-z] \((?:A|R|P)\)(?![A-Za-z0-9])/],
  ["Changes awaiting a second person", /changes awaiting a second person/i],
  ["Not built", /not built/i],
  ["Not emailed", /not emailed/i],
  ["Recorded by demo loader", /recorded by demo loader/i],
  ["Where it comes from", /where it comes from/i],
];

const SHOWN_TONES = new Set(["warn", "err", "ok"]);

const words = (t) => t.split(/\s+/).filter(Boolean).length;

/// The strings a node can render, one per branch. Anything not a literal is one word, as "{value}".
function branches(node) {
  if (!node) return [""];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return branches(node.expression);
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) text += "X" + span.literal.text;
    return [text];
  }
  if (ts.isConditionalExpression(node)) return [...branches(node.whenTrue), ...branches(node.whenFalse)];
  if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) {
    return node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? branches(node.right) : [...branches(node.left), ...branches(node.right)];
  }
  if (ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node)) return [renderedText(node)];
  return ["X"];
}

const longest = (alts) => alts.reduce((a, b) => (words(b) > words(a) ? b : a), "");

/// Everything a JSX subtree renders as literal text: text, string expressions, and the longest branch
/// of a conditional. Another component's props are not text and are not counted.
function renderedText(node) {
  if (ts.isJsxText(node)) return node.text;
  if (ts.isJsxExpression(node)) return node.expression ? longest(branches(node.expression)) : "";
  if (ts.isJsxSelfClosingElement(node)) return "";
  const children = ts.isJsxElement(node) || ts.isJsxFragment(node) ? node.children : [];
  return children.map((c) => (ts.isJsxExpression(c) ? renderedText(c) : ts.isJsxText(c) ? c.text : renderedText(c))).join(" ");
}

function attr(el, name) {
  const attrs = ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes;
  for (const a of attrs.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === name) return a;
  }
  return null;
}

/// The text of an attribute: a string literal, or an expression whose branches are literal.
function attrText(a) {
  if (!a || !a.initializer) return null;
  const i = a.initializer;
  if (ts.isStringLiteral(i)) return i.text;
  if (ts.isJsxExpression(i) && i.expression) {
    const alts = branches(i.expression);
    // A lone "X" means a value known only at run time: nothing literal to judge.
    if (alts.every((t) => t === "X")) return null;
    return longest(alts);
  }
  return null;
}

export function scanSource(file, source) {
  if (/\.test\.[tj]sx?$/.test(file)) return [];
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const add = (node, rule, msg) => out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, rule, msg });

  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = (ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName).getText(sf);
      const limitOf = { PageHeader: ["subtitle", BUDGET.pageSubtitle, "page-subtitle"], CardHeader: ["subtitle", BUDGET.cardSubtitle, "card-subtitle"], RecordEditor: ["description", BUDGET.editorIntro, "editor-intro"] }[tag];
      if (limitOf) {
        const t = attrText(attr(node, limitOf[0]));
        if (t != null && words(t) > limitOf[1]) add(node, limitOf[2], `${tag} ${limitOf[0]} is ${words(t)} words (limit ${limitOf[1]})`);
      }
      if (tag === "p" && ts.isJsxElement(node) && PARAGRAPH_SCREENS.some((r) => r.test(file.split("\\").join("/")))) {
        const n = words(renderedText(node));
        if (n > BUDGET.paragraph) add(node, "paragraph-length", `Paragraph is ${n} words (limit ${BUDGET.paragraph}): move the rest to a MoreText`);
      }
      if (tag === "Field") {
        const h = attrText(attr(node, "hint"));
        if (h != null && words(h) > BUDGET.fieldHint) add(node, "field-hint", `Field hint is ${words(h)} words (limit ${BUDGET.fieldHint})`);
      }
      if (tag === "EmptyState" && ts.isJsxElement(node) && node.children.some((c) => !(ts.isJsxText(c) && !c.text.trim()))) {
        add(node, "empty-body", "EmptyState has a body: use a title of 6 words or fewer and an action");
      }
      if (tag === "Callout") {
        const toneAttr = attr(node, "tone");
        if (!toneAttr) add(node, "callout-tone", "Callout has no tone: choose warn, err or ok");
        else {
          const i = toneAttr.initializer;
          const alts = i && ts.isStringLiteral(i) ? [i.text] : i && ts.isJsxExpression(i) && i.expression ? branches(i.expression).filter((t) => t !== "X") : [];
          for (const t of alts) if (!SHOWN_TONES.has(t)) add(node, "callout-tone", `Callout tone "${t}" is retired: a state is a chip and an explanation a popover`);
        }
        const title = attrText(attr(node, "title")) ?? "";
        const n = words(title) + words(renderedText(node));
        if (n > BUDGET.callout) add(node, "callout-length", `Callout is ${n} words (limit ${BUDGET.callout})`);
      }
    }
    // A field defined as data (`{ kind: "text", name, label, hint }`) is held to the same hint budget as a <Field>.
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === "hint") {
      const alts = branches(node.initializer);
      if (!alts.every((t) => t === "X")) {
        const t = longest(alts);
        if (words(t) > BUDGET.fieldHint) add(node, "field-hint", `Field hint is ${words(t)} words (limit ${BUDGET.fieldHint})`);
      }
    }
    // Product codes in anything that renders: JSX text and string literals.
    let text = null;
    if (ts.isJsxText(node)) text = node.text;
    else if (ts.isStringLiteralLike(node) && !ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent) && !ts.isLiteralTypeNode(node.parent)) text = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    if (text && /\s/.test(text.trim()) === false ? CODE_PATTERNS.some((r) => r.test(text)) : text && CODE_PATTERNS.some((r) => r.test(text))) {
      add(node, "product-code", `a spec or ruling code in rendered text: "${text.trim().slice(0, 60)}"`);
    }
    if (text) for (const [name, re] of BANNED_WORDS) if (re.test(text)) add(node, "banned-word", `"${name}" is not said on a screen: see the word list`);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
