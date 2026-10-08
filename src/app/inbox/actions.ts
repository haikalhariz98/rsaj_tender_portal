"use server";

import { revalidatePath } from "next/cache";

import { hiddenExercises } from "@/app/_auth/sulit";
import { requireStaff } from "@/app/_auth/actor";
import { markUpTo } from "@/lib/inbox/paging";
import { markAllRead } from "@/lib/inbox/store";
import { db } from "@/lib/db";

/**
 * Mark every unread notice of the signed-in person's own read, in one statement on the server: not the ids a page happened to show, so the bell and the sidebar count are
 * cleared whatever the number of notices. Only notices addressed to the person, and not hidden from them, are touched, whatever the form says. The form carries the time
 * the page was drawn, and a notice that arrived after it is left unread: it has not been seen. Only the first reading is recorded, and the database lets nothing else about a
 * notice change.
 */
export async function markNoticesRead(data: FormData): Promise<void> {
  const actor = await requireStaff();
  const now = new Date();
  const upTo = markUpTo(String(data.get("upTo") ?? ""), now);
  if (!upTo) return;
  await markAllRead(db, { organisationId: actor.organisationId, personId: actor.personId }, await hiddenExercises(actor), now, upTo);
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}
