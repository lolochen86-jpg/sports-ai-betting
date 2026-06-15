'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import TrendChart from '../components/TrendChart';

// SVG Icons
const CpuIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="16" height="16" x="4" y="4" rx="2" />
    <rect width="6" height="6" x="9" y="9" rx="1" />
    <path d="M9 1v3" />
    <path d="M15 1v3" />
    <path d="M9 20v3" />
    <path d="M15 20v3" />
    <path d="M20 9h3" />
    <path d="M20 15h3" />
    <path d="M1 9h3" />
    <path d="M1 15h3" />
  </svg>
);

const ChartIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
  </svg>
);

export default function BacktestPage() {
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleManualRefresh = () => {
    setLoading(true);
    setToastMsg(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleSyncStatus = (status: { syncing: boolean; message: string; newGames: number }) => {
    if (!status.syncing) {
      setLoading(false);
      setToastMsg(status.message);
      setTimeout(() => setToastMsg(null), 5000);
    }
  };

  return (
    <div className="flex-1 w-full min-h-screen bg-[#030712] cyber-grid relative pb-20">
      {/* Decorative Neon Background Glows */}
      <div className="absolute top-[-200px] left-1/4 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[100px] right-1/4 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-10 w-[400px] h-[400px] bg-indigo-900/5 rounded-full blur-[100px] pointer-events-none" />

      {/* 1. Navbar */}
      <nav className="sticky top-0 z-40 w-full glass-panel border-b border-white/5 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-transform">
              <CpuIcon className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <span className="font-sans font-black text-2xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-300 to-blue-400">
                SPORTS.AI
              </span>
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-widest font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                量化研發
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8 font-bold text-sm text-gray-300">
            <Link href="/" className="hover:text-purple-400 transition-colors">決策看盤中心</Link>
            <span className="text-white border-b-2 border-purple-500 pb-1">歷史量化回測</span>
            <Link href="/history" className="hover:text-purple-400 transition-colors">完賽記錄簿</Link>
            <Link href="/share" className="hover:text-purple-400 transition-colors">📸 戰報字卡</Link>
            <Link href="/betting" className="hover:text-amber-400 text-amber-500/90 font-black transition-colors">🎰 運彩下注</Link>
            <Link href="/#custom-predictor" className="hover:text-purple-400 transition-colors">AI 主力加成沙盤</Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-ping" />
              <span className="text-xs font-mono font-black text-purple-400">回測引擎在線</span>
            </div>
          </div>
        </div>
        {/* Mobile Navigation Links */}
        <div className="flex md:hidden items-center gap-4 overflow-x-auto whitespace-nowrap pt-3 mt-3 border-t border-white/5 text-xs scrollbar-none font-bold text-gray-300">
          <Link href="/" className="hover:text-purple-400 shrink-0">決策看盤</Link>
          <span className="text-white border-b-2 border-purple-500 pb-0.5 shrink-0">量化回測</span>
          <Link href="/history" className="hover:text-purple-400 shrink-0">完賽記錄</Link>
          <Link href="/share" className="hover:text-purple-400 shrink-0">📸 戰報字卡</Link>
          <Link href="/betting" className="hover:text-amber-400 text-amber-500/90 font-black shrink-0">🎰 下注</Link>
        </div>
      </nav>

      {/* 2. Page Header / Hero */}
      <header className="max-w-7xl mx-auto px-6 pt-12 pb-8 text-center relative">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-sm">
          <ChartIcon className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs text-purple-300 font-mono font-bold tracking-wider uppercase">
            ⚡ AI 多模型深度量化回測終端
          </span>
        </div>

        <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.1] mb-4 text-white">
          AI 預測模型歷史量化走勢盤
        </h1>

        <p className="max-w-3xl mx-auto text-gray-300 text-sm md:text-base leading-relaxed mb-6 font-sans font-semibold">
          本系統整合自 **2026/01/01** 起的所有 NBA 與 MLB 已完賽賽程，動態調用三大核心 AI 決策神經網絡進行日/週雙維度精準度歷史量化回測。數據與實際結果完全對位，以最真實的指標證明科學大數據之預估價值。
        </p>

        {/* Action Widgets Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-4xl mx-auto">
          <Link
            href="/"
            className="px-6 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-200 font-black text-xs border border-white/10 hover:border-purple-500/30 transition-all flex items-center gap-2 font-sans shrink-0 shadow-sm"
          >
            <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            返回看盤中心
          </Link>

          {/* Manual Reload Button */}
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-black text-xs shadow-lg shadow-purple-500/10 hover:shadow-purple-500/25 transition-all flex items-center gap-2 border border-purple-400/20 font-sans"
            title="從 MLB/NBA 官方 API 抓取最新完賽數據並重新計算走勢"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin text-purple-200' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            <span>{loading ? '正在同步最新完賽數據...' : '🔄 同步最新完賽數據'}</span>
          </button>
        </div>
      </header>

      {/* 3. Main Trend Chart Section */}
      <main className="max-w-7xl mx-auto px-6 py-4">
        
        {/* Render the interactive SVG chart */}
        <div className="mb-12">
          <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2 font-sans tracking-wide">
            <span className="w-1.5 h-6 rounded bg-gradient-to-b from-purple-500 to-indigo-500" />
            📈 歷史命中率走勢折線大盤
          </h2>
          <TrendChart refreshKey={refreshKey} onSyncStatus={handleSyncStatus} />
        </div>

        {/* 4. Methodology Explanation Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Winner Prediction Methodology Card */}
          <div className="glass-panel rounded-3xl p-6 md:p-8 border border-white/5 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-[-50px] right-[-50px] w-[150px] h-[150px] bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <span className="text-xl">🎯</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-white font-sans">獨贏預測判定標準</h3>
                  <span className="text-[10px] font-mono font-bold bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/20 uppercase tracking-widest mt-1 inline-block">
                    Winner Prediction
                  </span>
                </div>
              </div>
              
              <div className="space-y-3 font-sans text-xs md:text-sm text-gray-300 leading-relaxed font-semibold">
                <p>
                  獨贏勝負預測採用**「不計讓分 (Moneyline)」**的純勝負對位標準，其判定機制如下：
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <span className="text-purple-400 font-bold">預測方向</span>：系統讀取 SportsAI、EloRating 與 MonteCarlo 各自產出之主/客隊勝算機率，以機率值高者（即 <code>{"homeProbability >= 50% ? 'home' : 'away'"}</code>）作為該模型之首選勝方。
                  </li>
                  <li>
                    <span className="text-purple-400 font-bold">完賽比對</span>：當比賽官方狀態為 `completed` (已結束) 時，讀取真實比數。若實際贏球隊伍與模型首選勝方完全一致，則計為「**預測命中**」，否則計為「**預測失準**」。
                  </li>
                  <li>
                    <span className="text-purple-400 font-bold">回測目的</span>：用以評估各模型在純戰力指數比對下的宏觀預測表現。
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 text-[11px] font-mono text-gray-500 font-bold flex justify-between">
              <span>評估對象: 全球真實已完賽賽程</span>
              <span className="text-purple-400">獨贏無讓分機制</span>
            </div>
          </div>

          {/* Over/Under Prediction Methodology Card */}
          <div className="glass-panel rounded-3xl p-6 md:p-8 border border-white/5 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-[-50px] right-[-50px] w-[150px] h-[150px] bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <span className="text-xl">🎲</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-white font-sans">大小分預測判定標準</h3>
                  <span className="text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-500/20 uppercase tracking-widest mt-1 inline-block">
                    Over/Under Prediction
                  </span>
                </div>
              </div>
              
              <div className="space-y-3 font-sans text-xs md:text-sm text-gray-300 leading-relaxed font-semibold">
                <p>
                  大小分預測採用**「預測機率第一名的分數 - 0.5分猜大小分」**的確定性精準對位標準，其判定機制如下：
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <span className="text-cyan-400 font-bold">機率第一名分數 (T)</span>：對於特定模型，系統計算其概率分佈中機率最高的總得分整數值 <code>{"T"}</code>（對於 MLB 棒球，為經 Poisson 分佈運算出的最大機率得分；對於 NBA 籃球，為預估分數之四捨五入整數）。
                  </li>
                  <li>
                    <span className="text-cyan-400 font-bold">大小盤分界線 (L)</span>：自動設定為 <code>{"L = T - 0.5"}</code> 分。
                  </li>
                  <li>
                    <span className="text-cyan-400 font-bold">預測方向</span>：由於機率第一名的得分 <code>{"T"}</code> 必定大於 <code>{"L"}</code>（<code>{"T > T - 0.5"}</code>），因此模型在該基準線下，一律預測「**大分 (Over)**」。
                  </li>
                  <li>
                    <span className="text-cyan-400 font-bold">完賽判定</span>：比對完賽實際雙方總得分 <code>{"S"}</code>。若實際總得分 <code>{"S ≥ T"}</code>（即高於分界線 <code>{"L"}</code>），則判定「**預測命中**」；若實際總得分 <code>{"S < T"}</code>（即 <code>{"S ≤ T - 1"}</code>），則判定「**預測失準**」。
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 text-[11px] font-mono text-gray-500 font-bold flex justify-between">
              <span>評估對象: 機率最大得分 (Poisson Mode)</span>
              <span className="text-cyan-400">大分恆定預測比對法</span>
            </div>
          </div>

        </div>
      </main>

      {/* Toast Notification Alert */}
      {toastMsg && (
        <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-50 bg-[#0b0f19] border border-purple-500/40 px-6 py-3.5 rounded-2xl shadow-xl shadow-purple-500/10 text-xs md:text-sm font-semibold text-white flex items-center gap-3 animate-fade-in border-t-4 border-t-purple-500 font-sans font-bold">
          <span className="flex h-2 w-2 relative shrink-0 font-sans">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
          </span>
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
