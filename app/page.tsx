import { Suspense } from 'react';
import HomeClient from './HomeClient';
import HeroKPIs, { KPISkeleton } from './HeroKPIs';

export const revalidate = 300;

export default function Home() {
  return (
    <div className="flex-1 w-full min-h-screen bg-[#030712] cyber-grid relative pb-20">
      {/* Decorative Neon Background Glows */}
      <div className="absolute top-[-200px] left-1/4 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[100px] right-1/4 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-10 w-[400px] h-[400px] bg-orange-900/5 rounded-full blur-[100px] pointer-events-none" />

      {/* 1. Header (Server Component Title + KPIs) */}
      <header className="max-w-7xl mx-auto px-6 pt-16 pb-12 text-center relative">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-sm animate-bounce">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
          </span>
          <span className="text-xs text-purple-300 font-mono font-bold tracking-wider uppercase">
            ⚡ Next-Gen 賽事分析引擎已就緒
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] mb-6">
          <span className="block text-white">利用 AI 神經網絡</span>
          <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-purple-400 to-blue-400">
            透視 NBA 與 MLB 比賽勝負
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-gray-300 text-base md:text-lg leading-relaxed mb-10 font-sans font-semibold">
          整合官方 API 實時大數據、蒙特卡羅隨機模擬，為您提供高達 70%+ 的歷史回測準確度。今日賽事預測已全面生成，點擊下方卡片即可免費解鎖 AI 核心分析因子。
        </p>

        {/* Suspended KPIs */}
        <Suspense fallback={<KPISkeleton />}>
          <HeroKPIs />
        </Suspense>
      </header>

      {/* 2. Client Interactive Dashboard (includes Navbar, Main Board, Modals) */}
      <HomeClient />
    </div>
  );
}
