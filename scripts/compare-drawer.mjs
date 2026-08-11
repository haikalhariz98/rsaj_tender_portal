// Diff one of our record drawers against the same drawer in the prototype.
//
//   node scripts/compare-drawer.mjs person "Users & roles" "Abdul Aziz Khan bin Alior Khan"
//
// compare-screen.mjs cannot see a drawer: it fingerprints server markup, and a drawer
// does not exist until somebody presses a trigger. So both sides are opened here —
// the prototype by clicking a row, ours by mounting the component and pressing its
// button — and what is compared is the shape of the form, not the record in it.
//
// Requires PROTOTYPE to name the sample:
//   PROTOTYPE=RSAJ-Tender-Portal.html node scripts/compare-drawer.mjs ...
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

const [which, section, openBy] = process.argv.slice(2);

if (!which || !section || !openBy) {
  console.error(
    'usage: node scripts/compare-drawer.mjs <drawer> "<Section>" "<text that opens it>"',
  );
  process.exit(2);
}

const OUT = "out";
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- the two sources

function theirs() {
  const log = execFileSync(
    process.execPath,
    ["scripts/render-prototype.mjs", OUT, `drw-${which}`, "Configuration", section, openBy],
    { encoding: "utf8", env: process.env },
  );
  if (/NOT FOUND/.test(log)) {
    console.error(log);
    throw new Error(`Nothing matched "${openBy}", so no drawer was opened in the prototype.`);
  }
  const html = readFileSync(join(OUT, `rendered-drw-${which}.html`), "utf8");
  const doc = new JSDOM(html).window.document;
  const scrim = doc.querySelector(".scrim");
  if (!scrim) throw new Error(`The click landed but opened no drawer in the prototype.`);
  return scrim.outerHTML;
}

function ours() {
  const path = join(OUT, `ours-drawer-${which}.html`);
  execFileSync("npx", ["tsx", "scripts/render-drawer.tsx", which, path], {
    encoding: "utf8",
    env: process.env,
    shell: true,
  });
  return readFileSync(path, "utf8");
}

// ------------------------------------------------------------------- fingerprint

const text = (n) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * The shape of a drawer.
 *
 * Values are left out on purpose. The prototype ships one customer's record and this
 * product ships none, so every value differs — what has to match is which fields
 * exist, in what order, as what kind of control, under which headings.
 */
function fingerprint(html) {
  const doc = new JSDOM(html).window.document;
  const scrim = doc.querySelector(".scrim");
  const drawer = doc.querySelector(".drawer");
  const head = doc.querySelector(".ov__head");
  const body = doc.querySelector(".ov__body");
  const foot = doc.querySelector(".ov__foot");

  const size =
    [...(drawer?.classList ?? [])].find((c) => c.startsWith("drawer--")) ?? "drawer (default)";

  // A field is a labelled control. The label carries the required marker, which is
  // part of the shape: an optional field where the sample has a required one is a
  // difference worth failing on.
  const fields = [...(body?.querySelectorAll(".field") ?? [])].map((f) => {
    const label = f.querySelector(".field__lbl");
    const required = Boolean(f.querySelector(".field__req"));
    const control = f.querySelector("input, select, textarea");
    const kind = control ? control.tagName.toLowerCase() : "none";
    // The label text includes the marker; strip it so "Name*" and "Name" compare.
    const name = text(label).replace(/\*$/, "").trim();
    return `${name} [${kind}${required ? ", required" : ""}]`;
  });

  return {
    fromTheRight: Boolean(scrim?.classList.contains("scrim--right")),
    size,
    head: {
      icon: Boolean(head?.querySelector("svg")),
      title: Boolean(head?.querySelector(".h2")),
      sub: Boolean(head?.querySelector(".sm.muted")),
      close: Boolean(head?.querySelector("[aria-label=Close]")),
    },
    identity: {
      avatar: Boolean(body?.querySelector(".avatar--lg")),
      lines: body?.querySelector(".avatar--lg")?.parentElement
        ? [...body.querySelector(".avatar--lg").parentElement.querySelectorAll("div > div")].length
        : 0,
    },
    columns: body?.querySelector(".grid.g2") ? 2 : 1,
    fields,
    sections: [...(body?.querySelectorAll(".lbl") ?? [])].map(text),
    switches: [...(body?.querySelectorAll(".switch") ?? [])].map((s) => text(s)),
    dividers: body?.querySelectorAll(".divider").length ?? 0,
    foot: [...(foot?.querySelectorAll("button") ?? [])].map(
      (b) => `${text(b) || b.getAttribute("aria-label")} [${b.className}]`,
    ),
  };
}

// ------------------------------------------------------------------------- diff

function diffLists(label, mine, theirsList, out) {
  if (mine.join("|") === theirsList.join("|")) {
    out.push(`  ok       ${label}`);
    return 0;
  }
  out.push(`  DIFFERS  ${label}`);
  out.push(`      ours      : ${mine.length ? mine.join(" | ") : "(none)"}`);
  out.push(`      prototype : ${theirsList.length ? theirsList.join(" | ") : "(none)"}`);
  return 1;
}

function diffValue(label, mine, theirsValue, out) {
  if (JSON.stringify(mine) === JSON.stringify(theirsValue)) {
    out.push(`  ok       ${label}`);
    return 0;
  }
  out.push(`  DIFFERS  ${label} — ours ${JSON.stringify(mine)}, prototype ${JSON.stringify(theirsValue)}`);
  return 1;
}

const a = fingerprint(ours());
const b = fingerprint(theirs());

const out = [];
let problems = 0;
problems += diffValue("opens from the right", a.fromTheRight, b.fromTheRight, out);
problems += diffValue("width", a.size, b.size, out);
problems += diffValue("head", a.head, b.head, out);
problems += diffValue("identity row", a.identity, b.identity, out);
problems += diffValue("field columns", a.columns, b.columns, out);
problems += diffLists("fields, in order", a.fields, b.fields, out);
problems += diffLists("section headings", a.sections, b.sections, out);
problems += diffLists("switches", a.switches, b.switches, out);
problems += diffValue("dividers", a.dividers, b.dividers, out);
problems += diffLists("footer buttons", a.foot, b.foot, out);

console.log(`\n=== ${which} drawer — ours vs prototype (${section}) ===\n`);
console.log(out.join("\n"));
console.log(
  problems === 0
    ? "\n  structurally identical\n"
    : `\n  ${problems} structural difference${problems === 1 ? "" : "s"}\n`,
);

process.exit(problems === 0 ? 0 : 1);
