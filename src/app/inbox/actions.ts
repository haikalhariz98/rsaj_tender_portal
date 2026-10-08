"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/app/_auth/actor";
import { markRead } from "@/lib/inbox/store";
import { db } from "@/lib/db";

/**
 * Mark the signed-in person's own unread notices read. The ids come from the form, but only notices addressed to the person are touched, whoever the form names:
 * `markRead` filters on the recipient. Only the first reading is recorded, and the database lets nothing else about a notice change.
 */
export async function markNoticesRead(data: FormData): Promise<void> {
  const actor = await requireStaff();
  const ids = data.getAll("id").map(String).filter(Boolean);
  if (ids.length === 0) return;
  await markRead(db, { organisationId: actor.organisationId, personId: actor.personId }, ids, new Date());
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}
