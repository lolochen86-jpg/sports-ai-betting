'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useGames } from '@/hooks/useGames';
import type { GameWithTeams } from '@/types/sports';
import { translatePlayerName } from '@/lib/sports-api/team-translations';

// SVG Icons
const BallIcon = ({ type, className = "w-6 h-6" }: { type: 'NBA' | 'MLB', className?: string }) => {
  if (type === 'NBA') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M6.2 6.2c2.4 2.4 2.4 6.4 0 8.8" />
        <path d="M17.8 6.2c-2.4 2.4-2.4 6.4 0 8.8" />
        <path d="M2 12h20" />
        <path d="M12 2v20" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" />
      <path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10" />
      <path d="M2 12h20" />
    </svg>
  );
};

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

const BackIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

interface ModelPrediction {
  name: string;
  winner: 'home' | 'away';
  confidence: number;
  modelVersion: string;
  reasoning: string[];
  homeExpectedScore: number;
  awayExpectedScore: number;
  ouLine: number;
  ouPick: 'Over' | 'Under';
}

interface PredictionResult {
  winner: 'home' | 'away';
  confidence: number;
  modelVersion: string;
  reasoning: string[];
  keyPlayer: string;
  weatherFactor?: string;
  injuryImpact: string;
  activeModel: string;
  models: {
    MetaModel: ModelPrediction;
    SportsAI: ModelPrediction;
    EloRating: ModelPrediction;
    MonteCarlo: ModelPrediction;
  };
  pitchers?: {
    home: { name: string; era: number; advantageFactor: number } | null;
    away: { name: string; era: number; advantageFactor: number } | null;
  } | null;
}

interface KeyFactor {
  type: string;
  text: string;
}

interface ComparisonData {
  v1: PredictionResult;
  v2: PredictionResult;
  delta: {
    winnerChanged: boolean;
    v1Winner: 'home' | 'away';
    v2Winner: 'home' | 'away';
    v1Confidence: number;
    v2Confidence: number;
    confidenceDelta: number;
    homeScoreDelta: number;
    awayScoreDelta: number;
    v1TotalScore: number;
    v2TotalScore: number;
    v1OUPick: 'Over' | 'Under';
    v2OUPick: 'Over' | 'Under';
    ouChanged: boolean;
    keyFactors: KeyFactor[];
  };
}

export default function ComparePage() {
  const [activeLeague, setActiveLeague] = useState<'NBA' | 'MLB'>('NBA');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const { games, loading, error, refetch } = useGames(activeLeague, selectedDate);
  const [comparisons, setComparisons] = useState<Record<string, ComparisonData>>({});
  const [runningCompareGameId, setRunningCompareGameId] = useState<string | null>(null);

  // Clear loaded comparisons when league or date shifts to avoid showing wrong data
  useEffect(() => {
    setComparisons({});
  }, [activeLeague, selectedDate]);

  const handleShiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleRunCompare = async (gameId: string) => {
    setRunningCompareGameId(gameId);
    try {
      const res = await fetch('/api/predictions/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, league: activeLeague, date: selectedDate })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.success && json.data) {
        setComparisons(prev => ({ ...prev, [gameId]: json.data }));
      } else {
        throw new Error(json.error || '對照生成失敗');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '對照生成失敗，請重試');
    } finally {
      setRunningCompareGameId(null);
    }
  };

  return (
    <div className="flex-1 w-full min-h-screen bg-[#030712] cyber-grid relative pb-24">
      {/* Decorative Neon Background Glows */}
      <div className="absolute top-[-200px] left-1/4 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[100px] right-1/4 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none" />
      
      {/* Navbar */}
      <nav className="sticky top-0 z-40 w-full glass-panel border-b border-white/5 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20 hover:scale-105 transition-all">
              <CpuIcon className="w-5 h-5 text-white" />
            </Link>
            <div>
              <span className="font-sans font-black text-2xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-300 to-blue-400">
                SPORTS.AI
              </span>
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-widest font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                LABS v2.0
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8 font-bold text-sm text-gray-300">
            <Link href="/" className="hover:text-purple-400 transition-colors flex items-center gap-1"><BackIcon className="w-3.5 h-3.5" />返回決策看盤中心</Link>
            <span className="text-white border-b-2 border-purple-500 pb-1">🔬 新舊模型對照實驗室</span>
            <Link href="/backtest" className="hover:text-purple-400 transition-colors">歷史量化回測</Link>
            <Link href="/history" className="hover:text-purple-400 transition-colors">完賽記錄簿</Link>
            <Link href="/share" className="hover:text-purple-400 transition-colors">📸 戰報字卡</Link>
            <Link href="/betting" className="hover:text-amber-400 text-amber-500/90 font-black transition-colors">🎰 運彩下注</Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-ping" />
            <span className="text-xs font-mono font-black text-purple-400">對照沙盒已就緒</span>
          </div>
        </div>
        {/* Mobile Navigation Links */}
        <div className="flex md:hidden items-center gap-4 overflow-x-auto whitespace-nowrap pt-3 mt-3 border-t border-white/5 text-xs scrollbar-none font-bold text-gray-300">
          <Link href="/" className="hover:text-purple-400 shrink-0">決策看盤</Link>
          <span className="text-white border-b-2 border-purple-500 pb-0.5 shrink-0">🔬 對照</span>
          <Link href="/backtest" className="hover:text-purple-400 shrink-0">量化回測</Link>
          <Link href="/history" className="hover:text-purple-400 shrink-0">完賽記錄</Link>
          <Link href="/share" className="hover:text-purple-400 shrink-0">📸 戰報字卡</Link>
          <Link href="/betting" className="hover:text-amber-400 text-amber-500/90 font-black shrink-0">🎰 下注</Link>
        </div>
      </nav>

      {/* Hero Header */}
      <header className="max-w-7xl mx-auto px-6 pt-12 pb-8 text-center relative">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-sm">
          <span className="text-xs text-purple-300 font-mono font-bold tracking-wider uppercase">
            🔬 Model Sandbox & AB Testing
          </span>
        </div>

        <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.1] mb-4">
          <span className="block text-white">新舊預測模型對照實驗室</span>
        </h1>

        <p className="max-w-2xl mx-auto text-gray-400 text-sm md:text-base leading-relaxed mb-6">
          在這裡，您可以並排比對 **V1 舊版模型** (純平均數基準) 與 **V2 新版模型** (結合主客分裂、對戰相剋、得分動力、疲勞度與先發投手的六維度加權模型) 的預測差異。
        </p>
      </header>

      {/* Main Section */}
      <main className="max-w-7xl mx-auto px-6">
        
        {/* Toggle League & Date Selector */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10 max-w-7xl mx-auto px-1">
          <div className="inline-flex p-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-inner">
            <button 
              onClick={() => setActiveLeague('NBA')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm transition-all cursor-pointer ${activeLeague === 'NBA' ? 'bg-[#ff6b00] text-white shadow-lg shadow-orange-500/20 nba-neon-text' : 'text-gray-400 hover:text-white'}`}
            >
              <BallIcon type="NBA" className="w-4 h-4 animate-spin-slow" />
              🏀 NBA 職業籃球
            </button>
            <button 
              onClick={() => setActiveLeague('MLB')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm transition-all cursor-pointer ${activeLeague === 'MLB' ? 'bg-[#00f0ff] text-slate-900 shadow-lg shadow-cyan-500/20 font-black' : 'text-gray-400 hover:text-white'}`}
            >
              <BallIcon type="MLB" className="w-4 h-4" />
              ⚾ MLB 職業棒球
            </button>
          </div>

          {/* Date Selector Row */}
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-1 backdrop-blur-sm shadow-inner">
            <button
              onClick={() => handleShiftDate(-1)}
              className="px-3 py-1.5 text-xs font-black text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
            >
              ⬅️ 前一天
            </button>
            <span className="text-sm font-mono font-black text-white px-2">
              {selectedDate} {selectedDate === new Date().toISOString().split('T')[0] ? '(今天)' : ''}
            </span>
            <button
              onClick={() => handleShiftDate(1)}
              className="px-3 py-1.5 text-xs font-black text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
            >
              後一天 ➡️
            </button>
          </div>
        </div>

        {/* Loading Games State */}
        {loading && (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400 font-mono">載入今日賽事列表中...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="max-w-md mx-auto text-center py-16 bg-red-950/20 border border-red-500/30 rounded-3xl p-6">
            <p className="text-red-400 font-bold mb-4">⚠️ {error}</p>
            <button onClick={() => refetch(true)} className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm cursor-pointer transition-colors">重新嘗試</button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && games.length === 0 && (
          <div className="text-center py-24 glass-panel rounded-3xl border border-white/5 p-8 max-w-xl mx-auto">
            <p className="text-gray-400 text-lg font-bold mb-2">📅 當天無排定賽事</p>
            <p className="text-gray-500 text-sm">請切換日期或聯盟，以檢視其他賽事的 AI 新舊模型預測比對。</p>
          </div>
        )}

        {/* Games list with comparisons */}
        {!loading && !error && games.length > 0 && (
          <div className="flex flex-col gap-8">
            {games.map((game) => {
              const comp = comparisons[game.id];
              const isComparing = runningCompareGameId === game.id;
              const homeName = game.homeTeam.nameCn || game.homeTeam.name;
              const awayName = game.awayTeam.nameCn || game.awayTeam.name;
              const homeCode = game.homeTeam.code || 'HOME';
              const awayCode = game.awayTeam.code || 'AWAY';

              return (
                <div key={game.id} className="glass-panel rounded-3xl border border-white/5 p-6 md:p-8 hover:border-white/10 transition-all relative overflow-hidden shadow-xl">
                  {/* Decorative glowing gradient header inside card */}
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-purple-500 via-blue-500 to-pink-500" />
                  
                  {/* Game Details Header */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4 mb-6">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
                        {activeLeague} Match
                      </span>
                      <span className="text-xs text-gray-500 font-mono">{game.venue}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-gray-400">{game.gameDate}</span>
                    </div>
                  </div>

                  {/* Matchup Banner */}
                  <div className="flex items-center justify-center gap-6 md:gap-12 py-2 mb-6">
                    <div className="text-right w-1/3">
                      <div className="font-black text-lg md:text-2xl text-white">{awayName}</div>
                      <div className="text-xs text-gray-400 font-mono mt-1">{game.awayTeam.record || '0-0'}</div>
                    </div>
                    <div className="text-center font-mono font-black text-xl md:text-3xl text-purple-400 w-1/6">
                      VS
                    </div>
                    <div className="text-left w-1/3">
                      <div className="font-black text-lg md:text-2xl text-white">{homeName}</div>
                      <div className="text-xs text-gray-400 font-mono mt-1">{game.homeTeam.record || '0-0'}</div>
                    </div>
                  </div>

                  {/* If not unlocked / compare not loaded */}
                  {!comp ? (
                    <div className="flex flex-col items-center justify-center py-6 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-6">
                      <p className="text-gray-400 text-sm font-semibold mb-4 text-center">
                        尚未加載對照。點擊下方按鈕同時調度兩大版本預測引擎，即時輸出 AB 測試數據。
                      </p>
                      <button
                        onClick={() => handleRunCompare(game.id)}
                        disabled={isComparing}
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-black rounded-xl text-sm transition-all duration-300 shadow-md shadow-purple-500/20 active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-2"
                      >
                        {isComparing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            正在抓取真實維度並運算對照中...
                          </>
                        ) : (
                          <>
                            <CpuIcon className="w-4 h-4 animate-pulse" />
                            🔬 進行新舊模型對照分析
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    /* Side-by-Side Model Comparison Content */
                    <div className="flex flex-col gap-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* V1 Old Model (Left) */}
                        <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 md:p-6 hover:border-purple-500/10 transition-colors">
                          <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                            <span className="font-black text-sm text-gray-400 font-sans tracking-wide">
                              v1 舊版模型 (近五場總平均)
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-white/5">
                              SportsAI-v4.2
                            </span>
                          </div>

                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs text-gray-400">勝出預測:</span>
                            <span className={`px-3 py-1 rounded-lg text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30`}>
                              {comp.v1.models.MetaModel.winner === 'home' ? homeCode : awayCode} ({comp.v1.models.MetaModel.confidence}%)
                            </span>
                          </div>

                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs text-gray-400">預期比分 (客 : 主):</span>
                            <span className="font-mono font-black text-sm text-white">
                              {comp.v1.models.MetaModel.awayExpectedScore} : {comp.v1.models.MetaModel.homeExpectedScore}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">大小分推薦:</span>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-black ${comp.v1.models.MetaModel.ouPick === 'Over' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                              {comp.v1.models.MetaModel.ouPick === 'Over' ? '大分' : '小分'} ({comp.v1.models.MetaModel.ouLine})
                            </span>
                          </div>
                        </div>

                        {/* V2 New Model (Right) */}
                        <div className="bg-purple-950/10 border border-purple-500/15 rounded-2xl p-5 md:p-6 hover:border-purple-500/35 transition-colors relative">
                          <div className="absolute top-0 right-6 -translate-y-1/2 bg-gradient-to-r from-purple-500 to-blue-500 text-[9px] text-white px-2 py-0.5 rounded-full font-black tracking-widest font-mono">
                            ENHANCED
                          </div>

                          <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                            <span className="font-black text-sm text-purple-300 font-sans tracking-wide">
                              v2 新版模型 (六維度補強)
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              MetaModel-v2.0
                            </span>
                          </div>

                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs text-gray-400">勝出預測:</span>
                            <span className={`px-3 py-1 rounded-lg text-xs font-black bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-500/25`}>
                              {comp.v2.models.MetaModel.winner === 'home' ? homeCode : awayCode} ({comp.v2.models.MetaModel.confidence}%)
                            </span>
                          </div>

                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs text-gray-400">預期比分 (客 : 主):</span>
                            <span className="font-mono font-black text-sm text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-blue-300">
                              {comp.v2.models.MetaModel.awayExpectedScore} : {comp.v2.models.MetaModel.homeExpectedScore}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">大小分推薦:</span>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-black ${comp.v2.models.MetaModel.ouPick === 'Over' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                              {comp.v2.models.MetaModel.ouPick === 'Over' ? '大分' : '小分'} ({comp.v2.models.MetaModel.ouLine})
                            </span>
                          </div>
                        </div>

                      </div>

                      {activeLeague === 'MLB' && comp.v2.pitchers && (comp.v2.pitchers.home || comp.v2.pitchers.away) && (
                        <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-2xl p-4 flex flex-col gap-3">
                          <span className="text-[11px] font-mono text-cyan-400 block font-bold uppercase tracking-wider">
                            ⚾ MLB 先發投手對位與防禦率 (Pitchers ERA)
                          </span>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                              <span className="text-[10px] text-gray-500 font-bold block mb-1">客隊先發 (Away)</span>
                              {comp.v2.pitchers.away ? (
                                <div>
                                  <span className="text-sm font-black text-white block">{translatePlayerName(comp.v2.pitchers.away.name)}</span>
                                  <span className="text-xs font-mono text-cyan-300 font-bold block mt-1">
                                    ERA: {comp.v2.pitchers.away.era.toFixed(2)} | 優勢: {comp.v2.pitchers.away.advantageFactor}x
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500 font-bold">先發未定 (TBD)</span>
                              )}
                            </div>
                            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                              <span className="text-[10px] text-gray-500 font-bold block mb-1">主隊先發 (Home)</span>
                              {comp.v2.pitchers.home ? (
                                <div>
                                  <span className="text-sm font-black text-white block">{translatePlayerName(comp.v2.pitchers.home.name)}</span>
                                  <span className="text-xs font-mono text-cyan-300 font-bold block mt-1">
                                    ERA: {comp.v2.pitchers.home.era.toFixed(2)} | 優勢: {comp.v2.pitchers.home.advantageFactor}x
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500 font-bold">先發未定 (TBD)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Delta Summary (Δ) */}
                      <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 md:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                          <span className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 font-mono tracking-widest">
                            Δ DELTA ANALYSIS / 預測差異分析
                          </span>
                          
                          {comp.delta.winnerChanged ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 animate-pulse">
                              ⚠️ 勝負預測反轉 (V2翻盤)
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              ✓ 勝負預測方向一致
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center mb-6">
                          <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5">
                            <span className="block text-[10px] text-gray-500 font-bold mb-1">勝率偏移</span>
                            <span className={`text-base font-black font-mono ${comp.delta.confidenceDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {comp.delta.confidenceDelta >= 0 ? `+${comp.delta.confidenceDelta}` : comp.delta.confidenceDelta}%
                            </span>
                          </div>
                          <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5">
                            <span className="block text-[10px] text-gray-500 font-bold mb-1">主隊預估得分差</span>
                            <span className={`text-base font-black font-mono ${comp.delta.homeScoreDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {comp.delta.homeScoreDelta >= 0 ? `+${comp.delta.homeScoreDelta}` : comp.delta.homeScoreDelta}
                            </span>
                          </div>
                          <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5">
                            <span className="block text-[10px] text-gray-500 font-bold mb-1">客隊預估得分差</span>
                            <span className={`text-base font-black font-mono ${comp.delta.awayScoreDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {comp.delta.awayScoreDelta >= 0 ? `+${comp.delta.awayScoreDelta}` : comp.delta.awayScoreDelta}
                            </span>
                          </div>
                          <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5">
                            <span className="block text-[10px] text-gray-500 font-bold mb-1">總分偏移 / 大小分</span>
                            <span className={`text-base font-black font-mono ${comp.delta.ouChanged ? 'text-amber-400' : 'text-gray-300'}`}>
                              {comp.delta.ouChanged ? 'O/U 方向反轉' : '方向未變'}
                            </span>
                          </div>
                        </div>

                        {/* Key Factors Labels */}
                        <div>
                          <div className="text-[11px] text-gray-500 font-bold mb-2">💡 新版核心調整因子 (V2 關鍵依據):</div>
                          {comp.delta.keyFactors.length === 0 ? (
                            <span className="text-xs text-gray-400">本場賽事無顯著的偏移因子，兩代預測模型結果高度收斂。</span>
                          ) : (
                            <div className="flex flex-wrap gap-2.5">
                              {comp.delta.keyFactors.map((factor, idx) => {
                                const tagColor = 
                                  factor.type === 'splits' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                  factor.type === 'h2h' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                  factor.type === 'fatigue' ? 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse' :
                                  factor.type === 'pitcher' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                                  'bg-amber-500/10 text-amber-400 border-amber-500/20';
                                return (
                                  <span key={idx} className={`px-3 py-1 rounded-lg text-xs font-bold border ${tagColor}`}>
                                    {factor.text}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
