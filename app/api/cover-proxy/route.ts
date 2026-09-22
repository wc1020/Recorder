import { NextRequest, NextResponse } from "next/server";

/** 海报墙 Canvas 用：把外链封面拉到同源，避免 CORS。 */
const ALLOWED_HOSTS = new Set([
  "image.tmdb.org",
  "www.themoviedb.org",
  "shared.akamai.steamstatic.com",
  "shared.steamstatic.com",
  "cdn.cloudflare.steamstatic.com",
  "steamcdn-a.akamaihd.net",
  "books.google.com",
  "books.googleusercontent.com",
  "covers.openlibrary.org",
  "images.igdb.com",
]);

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "bad protocol" }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "projectM-cover-proxy" },
      cache: "force-cache",
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
  }

  const type = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!type.startsWith("image/")) {
    return NextResponse.json({ error: "not an image" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
