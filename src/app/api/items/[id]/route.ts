import { db } from "@/lib/db";

export async function PATCH(request: Request, ctx: RouteContext<"/api/items/[id]">) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const done = (body as { done?: unknown })?.done;
  if (typeof done !== "boolean") {
    return Response.json({ error: "done must be a boolean" }, { status: 400 });
  }

  const item = await db.item.update({ where: { id }, data: { done } }).catch(() => null);
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(item);
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/items/[id]">) {
  const { id } = await ctx.params;

  const item = await db.item.delete({ where: { id } }).catch(() => null);
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });

  return new Response(null, { status: 204 });
}
