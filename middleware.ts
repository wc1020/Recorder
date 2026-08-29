import { NextRequest, NextResponse } from "next/server";

const COOKIE = "pm_steam_visit";

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  if (url.searchParams.get("type") !== "game") {
    return NextResponse.next();
  }
  if (url.searchParams.get("live") === "1") {
    return NextResponse.next();
  }
  if (request.cookies.get(COOKIE)?.value) {
    return NextResponse.next();
  }
  url.searchParams.set("live", "1");
  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE, "1", { path: "/", sameSite: "lax" });
  return res;
}

export const config = {
  matcher: "/",
};
