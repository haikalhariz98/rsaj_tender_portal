import { db } from "@/lib/db";

export async function GET() {
  const items = await db.item.findMany({ orderBy: { createdAt: "desc" } });
  return Response.json(items);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const title = (body as { title?: unknown })?.title;
  if (typeof title !== "string" || title.trim() === "") {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const item = await db.item.create({ data: { title: title.trim() } });
  return Response.json(item, { status: 201 });
}
