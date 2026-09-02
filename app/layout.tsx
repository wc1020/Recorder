import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { IdleRefresh } from "./idle-refresh";
import { KeepScroll } from "./keep-scroll";
import { SiteHeader } from "./site-header";
import { TypeNav } from "./type-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProjectM",
  description: "个人媒体记录：电影、电视剧、图书、游戏",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Suspense fallback={null}>
          <KeepScroll />
          <IdleRefresh />
        </Suspense>
        <div className="site-app">
          <Suspense fallback={<header className="site-header" />}>
            <SiteHeader />
          </Suspense>
          <div className="site-body">
            <Suspense fallback={<nav className="site-nav" aria-label="类型" />}>
              <TypeNav />
            </Suspense>
            <main className="site-main">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
