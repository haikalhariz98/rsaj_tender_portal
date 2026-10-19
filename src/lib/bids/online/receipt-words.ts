import { w, type Words } from "@/lib/contract/labels";

/// In English and Malay (ruling 20ab): the Malay says no more than the English. The digest itself is shown beside these words, in full, never translated.
export const RECEIPT_WORDS: { title: Words; meaning: Words } = {  // never "signed" / "proof" (scan), in either language
  title: w("Your receipt"),
  meaning: w(
    "Your submission number, the server's time stamp, the sealing key and a digest of what was stored. Print or save it.",
  ),
};
