// apps/duku-ui/src/app/api/user/ratings/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MERLIN_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");

// tiny cache
const mem = new Map<string, { at: number; data: any }>();
const TTL_OK = 5_000;   // 5s
const TTL_BAD = 2_000;  // 2s

export async function GET() {
  const jar = await cookies();
  const user = jar.get("duku_user_id")?.value ?? "";
  const session = jar.get("duku_session_id")?.value ?? "";

  const cacheKey = `ratings:u=${user}:s=${session}`;
  const hit = mem.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_OK) {
    return NextResponse.json(hit.data);
  }

  const qs = new URLSearchParams();
  if (user) qs.set("user_id", user);
  if (session) qs.set("session_id", session);
  const url = `${MERLIN_BASE}/api/v1/user/ratings?${qs.toString()}`;

  try {
    const r = await fetch(url, { cache: "no-store" });

    if (r.status === 429) {
      const payload: any[] = [];
      mem.set(cacheKey, { at: Date.now(), data: payload });
      return new NextResponse(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Mode": "degraded" },
      });
    }

    if (!r.ok) {
      const text = await r.text();
      // cache briefly to avoid hammering on repeated failures
      mem.set(cacheKey, { at: Date.now(), data: [] });
      return new NextResponse(text || "Upstream error", { status: r.status });
    }

    const data = await r.json();
    mem.set(cacheKey, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch {
    mem.set(cacheKey, { at: Date.now(), data: [] });
    return new NextResponse(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Mode": "degraded" },
    });
  }
}