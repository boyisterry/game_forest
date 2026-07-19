import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = new URL("/og.png", `${protocol}://${host}`).toString();
  const title = "林间速递 · 地图工坊";
  const description = "为兔子骑手设计蜿蜒、温柔又充满探索感的森林配送路线。";
  return {
    title,
    description,
    icons: { icon: "/favicon.svg" },
    openGraph: { title, description, type: "website", images: [{ url: socialImage, width: 1731, height: 909, alt: "兔子骑手驶过晨雾中的森林配送路线" }] },
    twitter: { card: "summary_large_image", title, description, images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
