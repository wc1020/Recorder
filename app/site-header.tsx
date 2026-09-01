"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackLink } from "./back-link";

export function SiteHeader() {
  const steamDetail = usePathname().startsWith("/steam/");
  return (
    <header className="site-header">
      <div className="header-left">
        <Link href="/" className="logo">
          ProjectM
        </Link>
        {steamDetail ? (
          <BackLink href="/?type=game" className="btn btn-tiny">
            返回
          </BackLink>
        ) : null}
      </div>
      {steamDetail ? null : (
        <nav>
          <Link href="/search">搜索</Link>
        </nav>
      )}
    </header>
  );
}
