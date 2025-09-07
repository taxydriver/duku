// apps/duku-ui/src/app/api/user/ratings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const MERLIN = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

export async function GET(_req: NextRequest) {
  const jar = await cookies();
  const userId = jar.get("duku_user_id")?.value || null;
  const sessionId = userId ? null : jar.get("duku_uid")?.value || null;

  const qs = new URLSearchParams();
  if (userId) qs.set("user_id", userId);
  if (sessionId) qs.set("session_id", sessionId);

  const r = await fetch(`${MERLIN}/api/v1/user/ratings?${qs.toString()}`, { cache: "no-store" });
  if (!r.ok) return NextResponse.json(await r.text(), { status: r.status });

  const raw = (await r.json()) as Array<{ item_id: string; event_type?: string; value?: number }>;

  // normalize to {item_id, value} with dedupe (latest wins if backend ever returns history)
  const latest = new Map<string, number>();
  for (const ev of raw) {
    const v = typeof ev.value === "number"
      ? ev.value
      : ev.event_type === "like" ? 1
      : ev.event_type === "star" ? 5
      : ev.event_type === "unlike" ? -1
      : 0;
    latest.set(ev.item_id, v);
  }

  return NextResponse.json([...latest.entries()].map(([item_id, value]) => ({ item_id, value })));
}