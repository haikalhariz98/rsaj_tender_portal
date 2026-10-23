import { ACT_LABEL } from "@/lib/labels";

/// An act in words, without its code: the code stays in the badge's hover and screen-reader name.
export const actWords = (act: string) => ACT_LABEL[act] ?? "Unknown act";
