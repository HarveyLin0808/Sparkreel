import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sparkreel | AI 短视频创作台",
  description: "从话题到可发布短视频方案的 AI 创作工作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
