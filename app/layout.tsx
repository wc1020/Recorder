import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { KeepScroll } from "./keep-scroll";
import { SiteHeader } from "./site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProjectM",
  description: "个人媒体记录：电影、书、游戏",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Suspense fallback={null}>
          <KeepScroll />
        </Suspense>
        <SiteHeader />
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
