// apps/duku-ui/src/app/api/user/ratings/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MERLIN_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");


export async function GET(_req: NextRequest) {
  try {
    // Forward to backend; backend resolves identity from cookies/session if needed
    const r = await fetch(`${MERLIN_BASE}/api/v1/user/ratings`, { cache: "no-store" });
    const data = r.ok ? await r.json() : [];
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("[/api/user/ratings] proxy error:", err);
    return NextResponse.json([], { status: 200 });
  }
}