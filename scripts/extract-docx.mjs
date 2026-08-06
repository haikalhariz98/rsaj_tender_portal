// Extract a .docx to plain text so it is greppable by agents and diffable in review.
//
// A .docx is a zip; agents cannot read it directly, and the Word XML carries the text
// in a way that naive tag-stripping mangles (tables lose their row breaks, tabs
// disappear, and entities survive as &amp;). This handles those cases and writes UTF-8.
//
//   node scripts/extract-docx.mjs docs/requirements/RSAJ-Portal-Requirements-Specification.docx
//
// Requires the .docx to have been unzipped alongside it, or unzips it to a temp dir.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname, extname } from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("usage: node scripts/extract-docx.mjs <file.docx> [out.md]");
  process.exit(1);
}
const output = process.argv[3] ?? join(dirname(input), basename(input, extname(input)) + ".md");

const work = mkdtempSync(join(tmpdir(), "docx-"));
try {
  // PowerShell's Expand-Archive is present on every Windows box; unzip elsewhere.
  if (process.platform === "win32") {
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
        `[System.IO.Compression.ZipFile]::ExtractToDirectory('${input.replace(/'/g, "''")}','${work.replace(/'/g, "''")}')`,
    ]);
  } else {
    execFileSync("unzip", ["-q", input, "-d", work]);
  }

  const xml = readFileSync(join(work, "word", "document.xml"), "utf8");

  const text = xml
    // Structural breaks first, before tags are stripped.
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    // Table cells become tab-separated so rows stay readable as rows.
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    // Entities last, so a literal &lt;w:p&gt; in the source cannot become a tag.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

  const lines = text
    .split("\n")
    .map((l) => l.replace(/\t+$/, "").trimEnd())
    .filter((l) => l.trim() !== "");

  writeFileSync(output, lines.join("\n") + "\n", "utf8");
  console.log(`${basename(input)} -> ${output} (${lines.length} lines)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
