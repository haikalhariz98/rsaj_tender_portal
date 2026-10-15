import { w, type Words } from "@/lib/contract/labels";

/// In English and Malay (ruling 20ab): the Malay says no more than the English. The digest itself is shown beside these words, in full, never translated.
export const RECEIPT_WORDS: { title: Words; meaning: Words } = {  // never "signed" / "proof" (scan), in either language
  title: w("Your receipt", "Resit anda"),
  meaning: w(
    "It records what the portal told you when you submitted: your submission's number, the time the server stamped, the key your bid was sealed to, and a digest of what was stored. Print it or save it. From the opening's start, My Bids shows the digest that was listed and opened, for you to compare with this one.",
    "Resit ini merekodkan apa yang dimaklumkan oleh portal kepada anda semasa anda menyerahkan: nombor penyerahan anda, masa yang dicap oleh pelayan, kunci yang digunakan untuk memeterai bida anda, dan cincangan bagi apa yang disimpan. Cetak atau simpan resit ini. Mulai pembukaan bermula, Bida Saya menunjukkan cincangan yang disenaraikan dan dibuka, untuk anda bandingkan dengan cincangan ini.",
  ),
};
