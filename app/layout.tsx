import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "🏀⚾ NBA-MLB AI 預測平台 | 智能賽事大數據分析",
  description: "領先的 AI 驅動 NBA 與 MLB 比賽預測系統。集成官方大數據、球隊與球員深度統計，為您提供高置信度的即時比賽結果預測與深度 AI 決策因子分析。",
  keywords: ["NBA 預測", "MLB 預測", "AI 體育預測", "賽事分析", "大數據預測", "籃球棒球預測"],
  authors: [{ name: "AI Prediction Engine" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className="h-full antialiased dark"
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&family=JetBrains+Mono:wght@100..800&display=swap" rel="stylesheet" />
        <style>{`
          :root {
            --font-outfit: 'Outfit', sans-serif;
            --font-jetbrains-mono: 'JetBrains Mono', monospace;
          }
          html {
            font-size: 115% !important; /* Globally increases text sizes by 15% */
          }
          body {
            font-family: var(--font-outfit), sans-serif;
            font-weight: 600 !important; /* Bold standard weight */
            letter-spacing: -0.01em;
          }
          .font-mono {
            font-family: var(--font-jetbrains-mono), monospace !important;
            font-weight: 700 !important; /* Bold monospace code */
          }
          .font-sans {
            font-family: var(--font-outfit), sans-serif !important;
          }
          h1, h2, h3, h4, h5, h6 {
            font-weight: 950 !important; /* Extra thick headers */
          }
          /* Bold mapping shifts to enforce maximum punchiness */
          .font-normal {
            font-weight: 600 !important;
          }
          .font-medium {
            font-weight: 700 !important;
          }
          .font-semibold {
            font-weight: 800 !important;
          }
          .font-bold {
            font-weight: 900 !important;
          }
          .font-extrabold {
            font-weight: 950 !important;
          }
          .font-black {
            font-weight: 950 !important;
          }
        `}</style>
      </head>
      <body className="min-h-full flex flex-col bg-[#030712] text-gray-100 font-sans">
        {children}
      </body>
    </html>
  );
}
