import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "测评工作台",
  description: "内部测评生产与验证工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
