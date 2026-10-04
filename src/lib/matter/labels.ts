/**
 * A contract matter's words (6.13 Part B run 1b; ADR 0029), English and Malay. A code never reaches a screen. Each
 * refusal names what refuses it and the way out. Pure.
 */

import { formatDate } from "@/lib/format";
import { hasMatterLabel, matterLabel } from "@/lib/labels";
import type { Finding } from "@/lib/method/types";

export interface Words {
  en: string;
  ms: string;
}
const w = (en: string, ms: string): Words => ({ en, ms });
type Data = Record<string, string | number | null | undefined>;
const s = (v: unknown, fallback: string) => (v == null || v === "" ? fallback : String(v));
const domainWords = (d: unknown): Words => (typeof d === "string" && hasMatterLabel(d) ? { en: matterLabel(d, "en"), ms: matterLabel(d, "ms") } : { en: "this matter", ms: "perkara ini" });

export const MATTER_FAULT_WORDS: Readonly<Record<string, (d: Data) => Words>> = {
  MATTER_SERIES_NOT_SET: () => w('No numbering series is set for contract matters ("contract_matter"). Set it under Configuration › Numbering.', 'Tiada siri penomboran ditetapkan bagi perkara kontrak ("contract_matter"). Tetapkan di Konfigurasi › Penomboran.'),
  MATTER_CLOSED: (d) => w(`The matter is closed (${s(d.reason, "its reason recorded")}).`, `Perkara itu telah ditutup (${s(d.reason, "sebabnya direkodkan")}).`),
  ROUTE_WAITING: () => w("Its approval route is still waiting for a decision.", "Laluan kelulusannya masih menunggu keputusan."),
  ALREADY_APPROVED: () => w("It is approved already: its approval of record stands.", "Ia telah diluluskan: kelulusan rekodnya kekal."),
  COND_REQUIRED: () => w("Say whether the extension has a financial impact, and its cause: the route is picked by it, never by a value.", "Nyatakan sama ada lanjutan mempunyai kesan kewangan, dan puncanya: laluan dipilih olehnya, bukan oleh nilai."),
  VALUE_REQUIRED: () => w("The matter is routed on its value, and none is given.", "Perkara itu dihalakan mengikut nilainya, dan tiada nilai diberi."),
  RATIO_REQUIRED: () => w("The waiver is routed on the share waived of the damages, and that share cannot be read (no damages amount).", "Pengecualian dihalakan mengikut bahagian ganti rugi yang dikecualikan, dan bahagian itu tidak dapat dibaca (tiada amaun ganti rugi)."),
  MATTER_NOT_APPROVED: () => w("The certificate certifies the matter once its route is approved, and it is not (no route approved on the matter).", "Perakuan memperakui perkara itu setelah laluannya diluluskan, dan ia belum (tiada laluan diluluskan bagi perkara itu)."),
  // The one tabling rule's words (ADR 0029 §3), the variation's, naming the matter.
  NOT_COMMITTEE_STEP: () => w("That is not a committee's step on the matter's open route.", "Itu bukan langkah jawatankuasa pada laluan terbuka perkara itu."),
  OTHER_COMMITTEE: () => w("That sitting is of another committee than the one the step needs.", "Persidangan itu bagi jawatankuasa lain daripada yang diperlukan oleh langkah itu."),
  SITTING_FROZEN: () => w("That sitting no longer takes matters (it is minuted or cancelled).", "Persidangan itu tidak lagi menerima perkara (telah diminitkan atau dibatalkan)."),
  ALREADY_TABLED: () => w("This step's matter is tabled already and waits for the committee: cite its decision once it is decided.", "Perkara langkah ini telah dibentangkan dan menunggu jawatankuasa: rujuk keputusannya setelah diputuskan."),
  NOT_TABLED_YET: () => w("Nothing is tabled from this matter for this step's committee yet: table it first.", "Belum ada perkara dibentangkan daripada perkara ini bagi jawatankuasa langkah ini: bentangkan dahulu."),
  NOT_DECIDED_YET: () => w("The committee has not decided the matter tabled for this step yet: cite it once it is decided.", "Jawatankuasa belum memutuskan perkara yang dibentangkan bagi langkah ini: rujuk setelah diputuskan."),
  NO_ROUTE_WAITING: () => w("No approval route is waiting for a decision on this matter.", "Tiada laluan kelulusan menunggu keputusan bagi perkara ini."),
  NO_MATRIX: (d) => w(`No approval matrix is in force on ${d.day ? formatDate(String(d.day)) : "the day"}.`, `Tiada matriks kelulusan berkuat kuasa pada ${d.day ? formatDate(String(d.day)) : "hari itu"}.`),
  NO_RULE: (d) => {
    const dom = domainWords(d.domain);
    return w(
      `The approval matrix (${s(d.matrix, "in force")}) has no row for ${dom.en} on these facts${d.why ? ` (${d.why})` : ""}. Add the row (Configuration › Approval matrix), or a gap row saying it is undecided.`,
      `Matriks kelulusan (${s(d.matrix, "berkuat kuasa")}) tiada baris bagi ${dom.ms} untuk fakta ini. Tambah baris itu (Konfigurasi › Matriks kelulusan), atau baris jurang yang menyatakan ia belum diputuskan.`,
    );
  },
};

export function matterFaultWords(f: Finding): Words {
  const fn = MATTER_FAULT_WORDS[f.code];
  return fn ? fn(f.data ?? {}) : w("Refused.", "Ditolak.");
}
