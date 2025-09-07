// apps/duku-ui/src/app/api/recs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const MERLIN = process.env.NEXT_PUBLIC_API_BASE ?? process.env.MERLIN_API ?? "http://localhost:8080";

async function getOrCreateUserOrSession() {
  const jar = await cookies();
  const reg = jar.get("duku_user_id")?.value ?? null;
  let sid = jar.get("duku_uid")?.value ?? null;
  if (!sid) {
    sid = `guest-${Math.random().toString(36).slice(2,8)}`;
    jar.set("duku_uid", sid, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60*60*24*365 });
  }
  return { user_id: reg, session_id: sid };
}

export async function GET(req: NextRequest) {
  const { user_id, session_id } = await getOrCreateUserOrSession();

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || "30");
  const seed = url.searchParams.get("seed_item_id") || url.searchParams.get("seed") || undefined;
  const algoParam = (url.searchParams.get("algo") || "").toLowerCase();
  const ser = url.searchParams.get("ser");
  const explore = url.searchParams.get("explore");
  const novel = url.searchParams.get("novel");
  const version = url.searchParams.get("version");

  // Decide algo
  let payload: any = { k: isFinite(limit) && limit > 0 ? limit : 30 };
  let chosen = "mf_als";

   if (ser !== null) payload.ser = Number(ser);
   if (explore !== null) payload.explore = Number(explore);
   if (novel !== null) payload.novel = Number(novel);

  if (seed) {
    // Seeded: item-item KNN
    chosen = "cf_itemknn";
    payload.algo = "cf_itemknn";
    payload.seed_item_id = seed;
  } else {
    // Unseeded: personalized if possible, else ALS with session (or later: popular)
    const wantsCf = algoParam === "cf" || algoParam === "cf_itemknn";
   
if (version) payload.version = version;
    if (wantsCf) {
      chosen = "cf_itemknn"; // allow manual override
      payload.algo = "cf_itemknn";
      // no seed → itemknn will return empty; caller should provide seed
    } else {
      chosen = "mf_als";
      payload.algo = "mf_als";
      if (user_id) payload.user_id = user_id;
      else payload.session_id = session_id;
    }
  }

  console.log("[/api/recs] →", { chosen, payload });

  try {
    const r = await fetch(`${MERLIN}/api/v1/recommend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const text = await r.text();
    console.log("[/api/recs] ←", { status: r.status, len: text.length });

    if (!r.ok) return NextResponse.json({ error: text || r.statusText }, { status: r.status });

    const data = JSON.parse(text);
    // Normalize to { items: [...] }
    if (Array.isArray(data?.items)) return NextResponse.json({ items: data.items });
    if (Array.isArray(data)) return NextResponse.json({ items: data });
    return NextResponse.json({ items: [] });
  } catch (err: any) {
    console.error("[/api/recs] error", err?.message || String(err));
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}